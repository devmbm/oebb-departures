import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

/**
 * An action that displays real-time ÖBB (Austrian Railways) departure information.
 */
@action({ UUID: "com.lebeberkasese-mit-alles.oebb-departures.increment" })
export class IncrementCounter extends SingletonAction<DepartureSettings> {
	private refreshIntervals = new Map<string, NodeJS.Timeout>();
	private scrollIntervals = new Map<string, NodeJS.Timeout>();
	private scrollPositions = new Map<string, number>();
	private currentDepartures = new Map<string, Departure[]>();
	private cycleIntervals = new Map<string, NodeJS.Timeout>();
	private currentDepartureIndex = new Map<string, number>();

	/**
	 * When the action appears, start fetching and displaying departure data.
	 */
	override async onWillAppear(ev: WillAppearEvent<DepartureSettings>): Promise<void> {
		const settings = ev.payload.settings;
		settings.stationId ??= "1290401"; // Wien Hauptbahnhof by default
		settings.refreshInterval ??= 120; // Default 2 minutes (120 seconds)

		// Initial fetch
		await this.updateDepartures(ev.action, settings);

		// Set up periodic refresh based on user setting (in seconds)
		const intervalMs = (settings.refreshInterval || 120) * 1000;
		const intervalId = setInterval(async () => {
			await this.updateDepartures(ev.action, settings);
		}, intervalMs);

		this.refreshIntervals.set(ev.action.id, intervalId);
	}

	/**
	 * Clean up the refresh interval when action disappears.
	 */
	override onWillDisappear(ev: WillDisappearEvent<DepartureSettings>): void {
		const intervalId = this.refreshIntervals.get(ev.action.id);
		if (intervalId) {
			clearInterval(intervalId);
			this.refreshIntervals.delete(ev.action.id);
		}

		// Clean up scroll interval
		const scrollId = this.scrollIntervals.get(ev.action.id);
		if (scrollId) {
			clearInterval(scrollId);
			this.scrollIntervals.delete(ev.action.id);
		}

		// Clean up cycle interval
		const cycleId = this.cycleIntervals.get(ev.action.id);
		if (cycleId) {
			clearInterval(cycleId);
			this.cycleIntervals.delete(ev.action.id);
		}

		this.scrollPositions.delete(ev.action.id);
		this.currentDepartures.delete(ev.action.id);
		this.currentDepartureIndex.delete(ev.action.id);
	}

	/**
	 * Handle button press - cycle to next departure if multiple exist, otherwise refresh.
	 */
	override async onKeyDown(ev: KeyDownEvent<DepartureSettings>): Promise<void> {
		const departures = this.currentDepartures.get(ev.action.id);

		// If we have multiple departures, advance to the next one
		if (departures && departures.length > 1) {
			const currentIndex = this.currentDepartureIndex.get(ev.action.id) || 0;
			const nextIndex = (currentIndex + 1) % departures.length;
			this.currentDepartureIndex.set(ev.action.id, nextIndex);
			this.scrollPositions.set(ev.action.id, 0);

			// Clear and restart scrolling for the new departure
			const oldScrollId = this.scrollIntervals.get(ev.action.id);
			if (oldScrollId) {
				clearInterval(oldScrollId);
				this.scrollIntervals.delete(ev.action.id);
			}

			await this.setupScrolling(ev.action, ev.payload.settings);
			await this.renderCurrentDeparture(ev.action, ev.payload.settings);

			// Reset the cycle timer
			const oldCycleId = this.cycleIntervals.get(ev.action.id);
			if (oldCycleId) {
				clearInterval(oldCycleId);
				const cycleTime = (ev.payload.settings.cycleInterval ?? 10) * 1000;
				const cycleId = setInterval(async () => {
					const currentIdx = (this.currentDepartureIndex.get(ev.action.id) || 0);
					const nextIdx = (currentIdx + 1) % departures.length;
					this.currentDepartureIndex.set(ev.action.id, nextIdx);
					this.scrollPositions.set(ev.action.id, 0);
					await this.renderCurrentDeparture(ev.action, ev.payload.settings);
				}, cycleTime);
				this.cycleIntervals.set(ev.action.id, cycleId);
			}
		} else {
			// Single departure or no departures - refresh data
			await this.updateDepartures(ev.action, ev.payload.settings);
		}
	}

	/**
	 * Handle settings changes (e.g., refresh interval update).
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DepartureSettings>): Promise<void> {
		const settings = ev.payload.settings;

		// Clear existing interval
		const oldIntervalId = this.refreshIntervals.get(ev.action.id);
		if (oldIntervalId) {
			clearInterval(oldIntervalId);
		}

		// Refresh immediately with new settings
		await this.updateDepartures(ev.action, settings);

		// Set up new interval with updated refresh rate
		const intervalMs = (settings.refreshInterval || 120) * 1000;
		const intervalId = setInterval(async () => {
			await this.updateDepartures(ev.action, settings);
		}, intervalMs);

		this.refreshIntervals.set(ev.action.id, intervalId);
	}

	/**
	 * Handle messages from Property Inspector (e.g., manual refresh button).
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, DepartureSettings>): Promise<void> {
		// Get current settings
		const settings = await ev.action.getSettings();

		// Refresh on any message from Property Inspector
		await this.updateDepartures(ev.action, settings);
	}

	/**
	 * Fetch departure data and update the display.
	 */
	private async updateDepartures(action: any, settings: DepartureSettings): Promise<void> {
		try {
			const stationId = settings.stationId ?? "1290401";
			const departureCount = settings.departureCount ?? 1;
			// Fetch at least 50 departures to ensure filters have enough data at busy stations
			const fetchCount = Math.max(50, departureCount * 10);
			let departures = await this.fetchDepartures(stationId, fetchCount);

			// Apply train line filter if specified
			if (settings.trainFilter && settings.trainFilter.trim() !== "") {
				const filterLines = settings.trainFilter
					.split(',')
					.map(line => line.trim().toUpperCase().replace(/\s+/g, ''))
					.filter(line => line.length > 0);

				if (filterLines.length > 0) {
					departures = departures.filter(dep => {
						const trainName = dep.train.replace(/\s+/g, '').toUpperCase();
						return filterLines.some(filter => trainName.includes(filter));
					});
				}
			}

			// Limit to requested count after filtering
			departures = departures.slice(0, departureCount);

			// Clear existing intervals first
			const oldScrollId = this.scrollIntervals.get(action.id);
			if (oldScrollId) {
				clearInterval(oldScrollId);
				this.scrollIntervals.delete(action.id);
			}
			const oldCycleId = this.cycleIntervals.get(action.id);
			if (oldCycleId) {
				clearInterval(oldCycleId);
				this.cycleIntervals.delete(action.id);
			}

			if (departures && departures.length > 0) {
				// Store current departures for cycling
				this.currentDepartures.set(action.id, departures);
				this.currentDepartureIndex.set(action.id, 0);
				this.scrollPositions.set(action.id, 0);

				// Get line settings (with defaults)
				const line1Field = settings.line1 ?? "train";
				const line2Field = settings.line2 ?? "destination";
				const line3Field = settings.line3 ?? "actualTime";
				const scrollEnabled = settings.enableScrolling ?? true; // Default: enabled

				// Set up cycling if more than one departure
				if (departures.length > 1) {
					const cycleTime = (settings.cycleInterval ?? 10) * 1000; // Default 10 seconds
					const cycleId = setInterval(async () => {
						const currentIndex = (this.currentDepartureIndex.get(action.id) || 0);
						const nextIndex = (currentIndex + 1) % departures.length;
						this.currentDepartureIndex.set(action.id, nextIndex);
						this.scrollPositions.set(action.id, 0);

						await this.renderCurrentDeparture(action, settings);
					}, cycleTime);
					this.cycleIntervals.set(action.id, cycleId);
				}

				// Set up scrolling
				await this.setupScrolling(action, settings);

				// Initial render
				await this.renderCurrentDeparture(action, settings);
			} else {
				// Show "No departures" message in the middle of the display
				await this.showMessage(action, "No departures");
			}
		} catch (error) {
			streamDeck.logger.error(`Error updating departures: ${error}`);
			// Show "Error" message in the middle of the display
			await this.showMessage(action, "Error");
		}
	}

	/**
	 * Fetch multiple departures from the ÖBB API.
	 */
	private async fetchDepartures(stationId: string, count: number): Promise<Departure[]> {
		try {
			const url = new URL("https://fahrplan.oebb.at/bin/stboard.exe/dn");
			url.searchParams.set("L", "vs_java3");
			url.searchParams.set("evaId", stationId);
			url.searchParams.set("boardType", "dep");
			url.searchParams.set("productsFilter", "1111110000011");
			url.searchParams.set("start", "yes");
			url.searchParams.set("showJourneys", String(count));

			const response = await fetch(url.toString());
			const text = await response.text();

			// Parse XML manually - find all Journey tags
			const journeyMatches = text.matchAll(/<Journey[^>]+>/g);
			const departures: Departure[] = [];
			const seenTrains = new Set<string>(); // Track trains by time+destination to avoid duplicates

			for (const journeyMatch of journeyMatches) {
				const journeyTag = journeyMatch[0];

				// Extract attributes using regex
				const train = this.extractAttribute(journeyTag, "hafasname") || "N/A";
				const destination = this.extractAttribute(journeyTag, "targetLoc") || "N/A";
				const scheduledTime = this.extractAttribute(journeyTag, "fpTime") || "N/A";
				const delay = this.extractAttribute(journeyTag, "delay") || "0";
				const realtimeID = this.extractAttribute(journeyTag, "realtimeID") || "";

				// Skip buses - they don't have platforms and would be incorrectly marked as cancelled
				if (train.toLowerCase().startsWith("bus")) {
					continue;
				}

				// Skip duplicate trains - ÖBB API sometimes includes internal service numbers (e.g., S 23700)
				// alongside passenger-facing names (e.g., S 1) for the same train
				// Prefer trains with real-time data and skip those with delay="-" if we already have the same train
				const trainKey = `${scheduledTime}-${destination}`;
				if (seenTrains.has(trainKey)) {
					// Skip if we've already seen this time+destination combination
					continue;
				}

				// Skip trains with internal service numbers (e.g., S 23700, S 29699) that have delay="-"
				// These are duplicates of real trains that have proper real-time data
				if (delay === "-" && realtimeID && /\s\d{5}/.test(train)) {
					// This looks like an internal service number - skip it
					continue;
				}

				// Mark this train as seen
				seenTrains.add(trainKey);

				// Platform might be missing for cancelled trains or private operators
				let platform = this.extractAttribute(journeyTag, "platform") || "";

				// Check if train is cancelled:
				// 1. delay="cancel" - explicitly cancelled
				// 2. delay="-" AND no realtimeID - cancelled train still in schedule but not operating
				const isCancelled = delay === "cancel" || (delay === "-" && !realtimeID);

				// Calculate actual time and delay info
				let actualTime = scheduledTime;
				let isDelayed = false;

				if (delay && delay !== "0" && delay !== "cancel" && delay !== "-") {
					isDelayed = true;
					// Parse delay (format: "+ 5" for 5 minutes)
					const delayMatch = delay.match(/\+\s*(\d+)/);
					if (delayMatch && scheduledTime !== "N/A") {
						const delayMinutes = parseInt(delayMatch[1], 10);
						// Calculate actual time
						const [hours, minutes] = scheduledTime.split(':').map(Number);
						const totalMinutes = hours * 60 + minutes + delayMinutes;
						const newHours = Math.floor(totalMinutes / 60) % 24;
						const newMinutes = totalMinutes % 60;
						actualTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
					}
				}

				departures.push({
					train,
					destination,
					scheduledTime,
					actualTime,
					platform,
					delay: isCancelled ? "cancel" : delay, // Normalize cancellation status
					isDelayed
				});

				// Stop once we have enough departures
				if (departures.length >= count) break;
			}

			return departures;
		} catch (error) {
			streamDeck.logger.error(`Error fetching departures: ${error}`);
			return [];
		}
	}

	/**
	 * Extract an attribute from an XML tag string.
	 */
	private extractAttribute(tag: string, attrName: string): string | null {
		const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
		const match = tag.match(regex);
		return match ? match[1] : null;
	}

	/**
	 * Render the current departure in the cycling sequence.
	 */
	private async renderCurrentDeparture(action: any, settings: DepartureSettings): Promise<void> {
		const departures = this.currentDepartures.get(action.id);
		const currentIndex = this.currentDepartureIndex.get(action.id) || 0;

		if (!departures || departures.length === 0) {
			return;
		}

		const departure = departures[currentIndex];
		const line1Field = settings.line1 ?? "train";
		const line2Field = settings.line2 ?? "destination";
		const line3Field = settings.line3 ?? "actualTime";
		const scrollPos = this.scrollPositions.get(action.id) || 0;

		const canvas = this.createDepartureImage(
			departure,
			line1Field,
			line2Field,
			line3Field,
			scrollPos,
			currentIndex + 1,
			departures.length
		);

		await action.setImage(canvas);
	}

	/**
	 * Set up scrolling interval for the current departure.
	 */
	private async setupScrolling(action: any, settings: DepartureSettings): Promise<void> {
		const scrollEnabled = settings.enableScrolling ?? true;
		const departures = this.currentDepartures.get(action.id);
		const currentIndex = this.currentDepartureIndex.get(action.id) || 0;

		if (!scrollEnabled || !departures || departures.length === 0) {
			return;
		}

		const departure = departures[currentIndex];
		const line1Field = settings.line1 ?? "train";
		const line2Field = settings.line2 ?? "destination";
		const line3Field = settings.line3 ?? "actualTime";

		// Check if scrolling is needed for destination field in any line
		const hasDestination = line1Field === "destination" || line2Field === "destination" || line3Field === "destination";

		if (hasDestination) {
			let cleanDest = departure.destination.trim();
			if (cleanDest.endsWith(" Bahnhof")) {
				cleanDest = cleanDest.substring(0, cleanDest.length - 8);
			}

			// Estimate if text needs scrolling (rough character width calculation)
			const estimatedWidth = cleanDest.length * 14; // Approximate 14px per character at 24px font
			const availableWidth = 134; // 144px - 10px margin

			if (estimatedWidth > availableWidth) {
				// Set up scrolling interval
				const scrollId = setInterval(async () => {
					const currentPos = this.scrollPositions.get(action.id) || 0;
					this.scrollPositions.set(action.id, currentPos + 2); // Move 2 pixels per frame for 2x speed
					await this.renderCurrentDeparture(action, settings);
				}, 100); // 100ms per frame

				this.scrollIntervals.set(action.id, scrollId);
			}
		}
	}

	/**
	 * Create an SVG image with white text, left-aligned, showing train info on 3 lines.
	 */
	private createDepartureImage(departure: Departure, line1Field: string, line2Field: string, line3Field: string, scrollOffset: number = 0, currentNum: number = 1, totalNum: number = 1): string {
		// Get text and color for each line
		const line1 = this.getFieldData(departure, line1Field, scrollOffset);
		const line2 = this.getFieldData(departure, line2Field, scrollOffset);
		const line3 = this.getFieldData(departure, line3Field, scrollOffset);

		// Create counter text if there are multiple departures
		const counterText = totalNum > 1 ? `${currentNum}/${totalNum}` : "";

		// Calculate scroll position for destination field with pause-scroll-pause behavior
		const calculateScrollOffset = (field: string): number => {
			if (field !== "destination" || scrollOffset === 0) {
				return 0;
			}

			let cleanDest = departure.destination.trim();
			if (cleanDest.endsWith(" Bahnhof")) {
				cleanDest = cleanDest.substring(0, cleanDest.length - 8);
			}

			const estimatedWidth = cleanDest.length * 14; // Approximate 14px per character
			const availableWidth = 134; // 144px - 10px margin

			if (estimatedWidth > availableWidth) {
				const maxScroll = estimatedWidth - availableWidth;
				const pauseFrames = 30; // Pause for ~3 seconds at 100ms per frame

				// Total cycle: pause + scroll + pause
				// Note: scrollOffset increases by 2 per frame for 2x speed
				const scrollFrames = Math.ceil(maxScroll / 2); // Number of frames needed to scroll at 2px/frame
				const totalFrames = pauseFrames + scrollFrames + pauseFrames;
				const framePos = (Math.floor(scrollOffset / 2)) % totalFrames;

				if (framePos < pauseFrames) {
					// Pause at start
					return 0;
				} else if (framePos < pauseFrames + scrollFrames) {
					// Scrolling - move text to the left (negative offset)
					const scrollProgress = (framePos - pauseFrames) * 2; // 2 pixels per frame
					return -Math.min(scrollProgress, maxScroll);
				} else {
					// Pause at end
					return -maxScroll;
				}
			}
			return 0;
		};

		const line1XOffset = calculateScrollOffset(line1Field);
		const line2XOffset = calculateScrollOffset(line2Field);
		const line3XOffset = calculateScrollOffset(line3Field);

		// Create SVG with three-shade blue background and uniform text size
		// Evenly spaced: 144px / 3 = 48px per line, centered in each section
		const svg = `<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<clipPath id="textClip">
					<rect x="0" y="0" width="144" height="144"/>
				</clipPath>
			</defs>
			<!-- Three horizontal sections with different shades -->
			<rect x="0" y="0" width="144" height="48" fill="#000094"/>
			<rect x="0" y="48" width="144" height="48" fill="#0000ce"/>
			<rect x="0" y="96" width="144" height="48" fill="#000094"/>
			<g clip-path="url(#textClip)">
				<text x="${10 + line1XOffset}" y="32" font-family="Arial" font-size="24" fill="${line1.color}">${this.escapeXml(line1.text)}</text>
				${line1.rightText ? `<text x="134" y="32" font-family="Arial" font-size="24" fill="${line1.color}" text-anchor="end">${this.escapeXml(line1.rightText)}</text>` : ''}
				<text x="${10 + line2XOffset}" y="80" font-family="Arial" font-size="24" fill="${line2.color}">${this.escapeXml(line2.text)}</text>
				${line2.rightText ? `<text x="134" y="80" font-family="Arial" font-size="24" fill="${line2.color}" text-anchor="end">${this.escapeXml(line2.rightText)}</text>` : ''}
				<text x="${10 + line3XOffset}" y="128" font-family="Arial" font-size="24" fill="${line3.color}">${this.escapeXml(line3.text)}</text>
				${line3.rightText ? `<text x="134" y="128" font-family="Arial" font-size="24" fill="${line3.color}" text-anchor="end">${this.escapeXml(line3.rightText)}</text>` : ''}
			</g>
			${counterText && !line3.rightText ? `<text x="134" y="128" font-family="Arial" font-size="14" fill="#FFFFFF" text-anchor="end">${counterText}</text>` : ''}
		</svg>`;

		// Convert SVG to data URL
		const base64 = Buffer.from(svg).toString("base64");
		return `data:image/svg+xml;base64,${base64}`;
	}

	/**
	 * Get the text and color for a specific field.
	 */
	private getFieldData(departure: Departure, field: string, scrollOffset: number = 0): { text: string; color: string; rightText?: string } {
		const maxLength = 10; // Characters that fit on Stream Deck display at 24px font

		switch (field) {
			case "train":
				// Remove spaces from train name (e.g., "S 80" -> "S80")
				const trainName = departure.train.replace(/\s+/g, '');
				return { text: trainName, color: "#FFFFFF" };

			case "trainWithPlatform":
				// Train name on left, platform number on right (if available)
				let train = departure.train.replace(/\s+/g, '');
				// Crop train name if too long (max 6 chars) to avoid overlap
				if (train.length > 6) {
					train = train.substring(0, 6) + '…';
				}
				// Extract only the numeric part of platform (e.g., "2A-B" -> "2"), or show nothing if empty
				const platformNum = departure.platform ? (departure.platform.match(/^\d+/)?.[0] || departure.platform) : "";
				return { text: train, color: "#FFFFFF", rightText: platformNum || undefined };

			case "destination":
				// Remove redundant "Bahnhof" suffix
				let cleanDest = departure.destination.trim();
				if (cleanDest.endsWith(" Bahnhof")) {
					cleanDest = cleanDest.substring(0, cleanDest.length - 8); // Remove " Bahnhof"
				}

				// If train is cancelled, prepend "Cancelled" and show in yellow
				if (departure.delay === "cancel") {
					return { text: `Cancelled ${cleanDest}`, color: "#FFFF00" };
				}

				// Always return full text, never crop - SVG will handle overflow naturally
				return { text: cleanDest, color: "#FFFFFF" };

			case "scheduledTime":
				return { text: departure.scheduledTime, color: "#FFFFFF" };

			case "actualTime":
				// Show "CANCELLED" in red if cancelled
				if (departure.delay === "cancel") {
					return { text: "CANCELLED", color: "#FF0000" };
				}
				// Show in yellow if delayed, white if on time
				const color = departure.isDelayed ? "#FFFF00" : "#FFFFFF";
				return { text: departure.actualTime, color };

			case "platform":
				// Only show platform if it exists, otherwise show nothing
				if (!departure.platform) {
					return { text: "", color: "#FFFFFF" };
				}
				return { text: `Pl. ${departure.platform}`, color: "#FFFFFF" };

			case "delay":
				if (departure.delay === "cancel") {
					return { text: "CANCELLED", color: "#FF0000" };
				} else if (departure.isDelayed) {
					return { text: departure.delay, color: "#FFFF00" };
				} else {
					return { text: "On time", color: "#00FF00" };
				}

			default:
				return { text: "N/A", color: "#FFFFFF" };
		}
	}

	/**
	 * Escape XML special characters while preserving existing HTML entities.
	 */
	private escapeXml(text: string): string {
		// First decode any existing HTML entities to get the actual characters
		const decoded = this.decodeHtmlEntities(text);

		// Then escape only the XML special characters
		return decoded
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");
	}

	/**
	 * Decode HTML entities to actual characters.
	 */
	private decodeHtmlEntities(text: string): string {
		// Decode numeric entities like &#246; (ö)
		return text.replace(/&#(\d+);/g, (match, dec) => {
			return String.fromCharCode(parseInt(dec, 10));
		});
	}

	/**
	 * Display a simple text message on the Stream Deck button.
	 */
	private async showMessage(action: any, message: string): Promise<void> {
		const svg = `<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">
			<rect x="0" y="0" width="144" height="144" fill="#000094"/>
			<text x="72" y="72" font-family="Arial" font-size="18" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${this.escapeXml(message)}</text>
		</svg>`;

		const base64 = Buffer.from(svg).toString("base64");
		await action.setImage(`data:image/svg+xml;base64,${base64}`);
	}
}

/**
 * Settings for the ÖBB Departures action.
 */
type DepartureSettings = {
	stationId?: string;
	line1?: string;
	line2?: string;
	line3?: string;
	refreshInterval?: number;
	enableScrolling?: boolean;
	departureCount?: number;
	cycleInterval?: number;
	trainFilter?: string;
};

/**
 * Departure information.
 */
type Departure = {
	train: string;
	destination: string;
	scheduledTime: string;
	actualTime: string;
	platform: string;
	delay: string;
	isDelayed: boolean;
};
