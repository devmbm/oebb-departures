# ÖBB HAFAS API Documentation

Complete guide to using the Austrian Federal Railways (ÖBB) HAFAS API for retrieving real-time departure and arrival information.

---

## Table of Contents

1. [Overview](#overview)
2. [Base URLs](#base-urls)
3. [Station Board API (Departures/Arrivals)](#station-board-api)
4. [Station Search API](#station-search-api)
5. [Station IDs Reference](#station-ids-reference)
6. [Response Format](#response-format)
7. [Code Examples](#code-examples)
8. [Error Handling](#error-handling)
9. [Rate Limits and Best Practices](#rate-limits-and-best-practices)

---

## Overview

The ÖBB HAFAS API is an unofficial public transportation API that provides access to Austrian railway schedules, real-time departures, arrivals, and journey planning. It's the same backend system used by the official ÖBB mobile apps and website.

**Important Notes:**
- This API is **unofficial** and not officially documented by ÖBB
- No authentication is required
- No official rate limits, but be respectful with requests
- Response encoding is ISO-8859-1 (Latin-1)
- Responses are in XML format

---

## Base URLs

| Endpoint Type | Base URL |
|--------------|----------|
| Station Board (Departures/Arrivals) | `https://fahrplan.oebb.at/bin/stboard.exe/dn` |
| Station Search | `https://fahrplan.oebb.at/bin/ajax-getstop.exe/dn` |
| Journey Query | `https://fahrplan.oebb.at/bin/query.exe/dn` |

---

## Station Board API

### Endpoint

```
GET https://fahrplan.oebb.at/bin/stboard.exe/dn
```

### Parameters

| Parameter | Required | Type | Description | Example |
|-----------|----------|------|-------------|---------|
| `L` | Yes | String | Language/output format | `vs_java3` |
| `evaId` | Yes | String | Station ID (EVA/UIC number) | `8100756` |
| `boardType` | Yes | String | Board type: `dep` (departures) or `arr` (arrivals) | `dep` |
| `productsFilter` | No | String | Filter transport types (bitmask) | `1111110000011` |
| `start` | Yes | String | Start query | `yes` |
| `showJourneys` | No | Integer | Number of results to return | `20` |
| `eqstops` | No | String | Include equivalent stops | `false` |
| `additionalTime` | No | Integer | Additional time offset in minutes | `0` |
| `dirInput` | No | String | Filter by direction (destination) | `Wien Hbf` |
| `time` | No | String | Specific time (HH:MM format) | `14:30` |
| `date` | No | String | Specific date (DD.MM.YYYY format) | `30.10.2025` |

### Products Filter Explained

The `productsFilter` parameter is a 13-character bitmask string where each position represents a transport type:

```
Position:  0 1 2 3 4 5 6 7 8 9 10 11 12
           | | | | | | | | | | |  |  |
Type:      I N R S U B T P F C X  W  K

I = ICE/Intercity Express (High-speed trains)
N = IC/EC/National trains
R = REX/Regional Express
S = S-Bahn (Suburban trains)
U = U-Bahn (Subway/Metro)
B = Bus
T = Tram/Streetcar
P = Private/Special trains
F = Ferry
C = Cable car/Funicular
X = Other special services
W = Walking connections
K = Other
```

**Common Filter Values:**
- `1111110000011` - All trains (no buses, no trams)
- `1111111111111` - All transport types
- `0001000000000` - Only S-Bahn trains
- `1100000000000` - Only long-distance trains (ICE/IC/EC)

### Example Request

**Wien Erzherzog-Karl-Straße Departures:**

```bash
curl "https://fahrplan.oebb.at/bin/stboard.exe/dn?L=vs_java3&evaId=8100756&boardType=dep&productsFilter=1111110000011&start=yes&showJourneys=15"
```

**PowerShell:**

```powershell
$url = "https://fahrplan.oebb.at/bin/stboard.exe/dn?L=vs_java3&evaId=8100756&boardType=dep&productsFilter=1111110000011&start=yes&showJourneys=15"
Invoke-WebRequest -Uri $url | Select-Object -ExpandProperty Content
```

**Python:**

```python
import requests

url = "https://fahrplan.oebb.at/bin/stboard.exe/dn"
params = {
    'L': 'vs_java3',
    'evaId': '8100756',  # Wien Erzherzog-Karl-Straße
    'boardType': 'dep',
    'productsFilter': '1111110000011',
    'start': 'yes',
    'showJourneys': '15'
}

response = requests.get(url, params=params)
response.encoding = 'ISO-8859-1'  # Important!
xml_data = response.text
print(xml_data)
```

---

## Response Format

### XML Structure

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<StationTable>
    <Journey 
        fpTime="20:46"                    <!-- Planned departure time -->
        fpDate="30.10.2025"               <!-- Date -->
        delay="+ 5"                       <!-- Delay in minutes (or "0" or "cancel") -->
        e_delay="5"                       <!-- Expected delay -->
        platform="3"                      <!-- Platform/track number -->
        targetLoc="Wien Hütteldorf"       <!-- Destination -->
        dirnr="8100447"                   <!-- Destination station ID -->
        hafasname="S80"                   <!-- Train name/number -->
        prod="S 80#S"                     <!-- Product code -->
        class="32"                        <!-- Train class -->
        dir="Wien Hütteldorf"             <!-- Direction -->
        operator="Nahreisezug"            <!-- Operator name -->
        administration="81____"           <!-- Administration code -->
        depStation="Wien Erzherzog-Karl-Straße Bahnhof"  <!-- Departure station -->
        is_reachable="0"                  <!-- Reachability flag -->
        realtimeID="00025064-8100447-20251030-203800"  <!-- Real-time tracking ID -->
    >
        <!-- Optional child elements for service messages -->
        <HIMMessage 
            header="Verspätung"           <!-- Message header -->
            lead="Der Zug hat 5 Minuten Verspätung"  <!-- Message text -->
            display="4"                   <!-- Display priority -->
        />
    </Journey>
    
    <!-- More Journey elements... -->
</StationTable>
```

### Key Attributes Explained

| Attribute | Type | Description | Possible Values |
|-----------|------|-------------|-----------------|
| `fpTime` | String | Planned departure/arrival time | `HH:MM` format |
| `fpDate` | String | Date of journey | `DD.MM.YYYY` |
| `delay` | String | Delay status | `0`, `+ X` (minutes), `cancel` |
| `platform` | String | Platform/track number | `1`, `7A-B`, `10C-E`, etc. |
| `targetLoc` | String | Final destination | Station name |
| `hafasname` | String | Train identifier | `S80`, `RJ 373`, `ICE 501` |
| `operator` | String | Operating company | `Nahreisezug`, `ÖBB`, etc. |
| `class` | String | Train class | `1`=long-distance, `16`=regional, `32`=S-Bahn |

### Delay Values

- `delay="0"` → Train is on time
- `delay="+ 5"` → Train is 5 minutes late
- `delay="cancel"` → Train is cancelled
- Empty or missing → No real-time data available

### Train Class Codes

| Class | Type | Description |
|-------|------|-------------|
| `1` | Long-distance | RailJet (RJ/RJX), Intercity (IC), EuroCity (EC) |
| `2` | Night trains | Nightjet (NJ) |
| `4` | International | EuroCity, International trains |
| `16` | Regional | Regional Express (REX), Regional (R) |
| `32` | S-Bahn | Suburban trains (S1, S2, S80, etc.) |

---

## Station Search API

### Endpoint

```
GET https://fahrplan.oebb.at/bin/ajax-getstop.exe/dn
```

### Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `getstop` | Yes | Must be `1` | `1` |
| `REQ0JourneyStopsS0A` | Yes | Must be `1` | `1` |
| `REQ0JourneyStopsS0G` | Yes | Search query | `Wien Haupt` |

### Example Request

```bash
curl "https://fahrplan.oebb.at/bin/ajax-getstop.exe/dn?getstop=1&REQ0JourneyStopsS0A=1&REQ0JourneyStopsS0G=Wien%20Erzherzog"
```

**Note:** This endpoint returns data in a custom format (not standard XML/JSON). Parsing requires custom logic.

---

## Station IDs Reference

### Major Vienna Stations

| Station Name | EVA/UIC ID | Notes |
|--------------|------------|-------|
| Wien Hauptbahnhof | `1290401` | Main station |
| Wien Westbahnhof | `1291501` | West station |
| Wien Meidling | `1191201` | Important junction |
| Wien Praterstern | `1290201` | Near city center |
| Wien Erzherzog-Karl-Straße | `8100756` | District 22 (Donaustadt) |
| Wien Stadlau | `8101542` | Freight hub |
| Wien Floridsdorf | `8100236` | North Vienna |

### Major Austrian Cities

| Station Name | EVA/UIC ID |
|--------------|------------|
| Salzburg Hauptbahnhof | `8100002` |
| Innsbruck Hauptbahnhof | `8100108` |
| Graz Hauptbahnhof | `8100173` |
| Linz Hauptbahnhof | `8100013` |
| Klagenfurt Hauptbahnhof | `8100085` |
| Bregenz Bahnhof | `8100058` |
| St. Pölten Hauptbahnhof | `8100008` |

### Finding Station IDs

1. **Via ÖBB Website:** Visit https://fahrplan.oebb.at and inspect the URL when viewing a station
2. **Via Wikidata:** Search for the station on Wikidata (property: P954 - UIC station code)
3. **Via OpenStreetMap:** Look for `uic_ref` tag on railway stations
4. **Via API Search:** Use the station search endpoint (limited usefulness)

---

## Code Examples

### Complete Python Example

```python
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

def get_departures(station_id, num_results=10):
    """
    Get real-time departures for a station.
    
    Args:
        station_id (str): EVA/UIC station ID
        num_results (int): Number of departures to retrieve
        
    Returns:
        list: List of departure dictionaries
    """
    url = "https://fahrplan.oebb.at/bin/stboard.exe/dn"
    params = {
        'L': 'vs_java3',
        'evaId': station_id,
        'boardType': 'dep',
        'productsFilter': '1111110000011',
        'start': 'yes',
        'showJourneys': num_results
    }
    
    # Make request with proper encoding
    response = requests.get(url, params=params)
    response.encoding = 'ISO-8859-1'
    
    # Parse XML
    root = ET.fromstring(response.text)
    
    departures = []
    
    for journey in root.findall('Journey'):
        # Extract attributes
        planned_time = journey.get('fpTime')
        planned_date = journey.get('fpDate')
        delay_str = journey.get('delay', '0')
        platform = journey.get('platform', 'N/A')
        destination = journey.get('targetLoc', 'N/A')
        train = journey.get('hafasname', 'N/A')
        
        # Calculate actual time if delayed
        actual_time = planned_time
        if delay_str and delay_str.startswith('+ '):
            delay_min = int(delay_str.replace('+ ', ''))
            dt = datetime.strptime(f"{planned_date} {planned_time}", 
                                  "%d.%m.%Y %H:%M")
            actual_dt = dt + timedelta(minutes=delay_min)
            actual_time = actual_dt.strftime("%H:%M")
        
        # Handle cancellations
        if delay_str == 'cancel':
            actual_time = 'CANCELLED'
        
        departures.append({
            'time': planned_time,
            'actual_time': actual_time,
            'train': train,
            'destination': destination,
            'platform': platform,
            'delay': delay_str
        })
    
    return departures


# Example usage
if __name__ == "__main__":
    # Wien Erzherzog-Karl-Straße
    departures = get_departures('8100756', num_results=5)
    
    for dep in departures:
        print(f"{dep['time']} → {dep['destination']} "
              f"({dep['train']}) - Platform {dep['platform']}")
        if dep['actual_time'] != dep['time']:
            print(f"  Actual: {dep['actual_time']}")
```

### Complete PowerShell Example

```powershell
# Function to get departures
function Get-OebbDepartures {
    param(
        [string]$StationId = "8100756",
        [int]$NumResults = 10
    )
    
    $url = "https://fahrplan.oebb.at/bin/stboard.exe/dn"
    $params = @{
        L = "vs_java3"
        evaId = $StationId
        boardType = "dep"
        productsFilter = "1111110000011"
        start = "yes"
        showJourneys = $NumResults
    }
    
    # Build query string
    $queryString = ($params.GetEnumerator() | ForEach-Object {
        "$($_.Key)=$($_.Value)"
    }) -join "&"
    
    $fullUrl = "$url?$queryString"
    
    # Make request
    $response = Invoke-WebRequest -Uri $fullUrl
    
    # Parse XML
    [xml]$xml = $response.Content
    
    # Extract departures
    $departures = @()
    
    foreach ($journey in $xml.StationTable.Journey) {
        $departure = [PSCustomObject]@{
            Time = $journey.fpTime
            Train = $journey.hafasname
            Destination = $journey.targetLoc
            Platform = $journey.platform
            Delay = $journey.delay
        }
        $departures += $departure
    }
    
    return $departures
}

# Example usage
$departures = Get-OebbDepartures -StationId "8100756" -NumResults 5
$departures | Format-Table -AutoSize
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

async function getDepartures(stationId, numResults = 10) {
    const url = 'https://fahrplan.oebb.at/bin/stboard.exe/dn';
    const params = {
        L: 'vs_java3',
        evaId: stationId,
        boardType: 'dep',
        productsFilter: '1111110000011',
        start: 'yes',
        showJourneys: numResults
    };
    
    try {
        // Make request
        const response = await axios.get(url, { 
            params,
            responseType: 'text',
            responseEncoding: 'latin1'  // ISO-8859-1
        });
        
        // Parse XML
        const result = await parseStringPromise(response.data);
        const journeys = result.StationTable.Journey || [];
        
        // Extract departures
        const departures = journeys.map(journey => {
            const attrs = journey.$;  // Attributes
            return {
                time: attrs.fpTime,
                train: attrs.hafasname,
                destination: attrs.targetLoc,
                platform: attrs.platform,
                delay: attrs.delay
            };
        });
        
        return departures;
        
    } catch (error) {
        console.error('Error fetching departures:', error);
        throw error;
    }
}

// Example usage
(async () => {
    const departures = await getDepartures('8100756', 5);
    console.log('Departures from Wien Erzherzog-Karl-Straße:');
    departures.forEach(dep => {
        console.log(`${dep.time} - ${dep.train} to ${dep.destination} (Platform ${dep.platform})`);
    });
})();
```

---

## Sample Response - Wien Erzherzog-Karl-Straße

### Request

```
GET https://fahrplan.oebb.at/bin/stboard.exe/dn?L=vs_java3&evaId=8100756&boardType=dep&productsFilter=1111110000011&start=yes&showJourneys=5
```

### Response (Formatted)

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<StationTable>
    <Journey 
        fpTime="20:46" 
        fpDate="30.10.2025" 
        delay="0" 
        e_delay="0" 
        platform="3" 
        targetLoc="Wien Hütteldorf" 
        dirnr="8100447" 
        hafasname="S80" 
        prod="S 80#S" 
        class="32" 
        dir="Wien Hütteldorf" 
        operator="Nahreisezug" 
        administration="81____" 
        depStation="Wien Erzherzog-Karl-Straße Bahnhof" 
        is_reachable="0" 
        realtimeID="00025064-8100447-20251030-203800"
    />
    
    <Journey 
        fpTime="21:01" 
        fpDate="30.10.2025" 
        delay="0" 
        e_delay="0" 
        platform="3" 
        targetLoc="Wien Hbf" 
        dirnr="8103000" 
        hafasname="R81" 
        prod="R 81#R" 
        class="16" 
        dir="Wien Hbf" 
        operator="Nahreisezug" 
        administration="81____" 
        depStation="Wien Erzherzog-Karl-Straße Bahnhof" 
        is_reachable="0" 
        realtimeID="00002582-8103000-20251030-210630"
    />
    
    <Journey 
        fpTime="21:02" 
        fpDate="30.10.2025" 
        delay="0" 
        e_delay="0" 
        platform="4" 
        targetLoc="Marchegg" 
        dirnr="8100466" 
        hafasname="R81" 
        prod="R 81#R" 
        class="16" 
        dir="Marchegg" 
        operator="Nahreisezug" 
        administration="81____" 
        depStation="Wien Erzherzog-Karl-Straße Bahnhof" 
        is_reachable="0" 
        realtimeID="00002582-8103000-20251030-210230"
    />
    
    <Journey 
        fpTime="21:13" 
        fpDate="30.10.2025" 
        delay="+ 5" 
        e_delay="5" 
        platform="4" 
        targetLoc="Aspern Nord" 
        dirnr="8102888" 
        hafasname="S80" 
        prod="S 80#S" 
        class="32" 
        dir="Aspern Nord" 
        operator="Nahreisezug" 
        administration="81____" 
        depStation="Wien Erzherzog-Karl-Straße Bahnhof" 
        is_reachable="0" 
        realtimeID="00025066-8100447-20251030-211000"
    >
        <HIMMessage 
            header="Verspätung" 
            lead="Dieser Zug hat voraussichtlich 5 Minuten Verspätung." 
            display="4"
        />
    </Journey>
    
    <Journey 
        fpTime="21:15" 
        fpDate="30.10.2025" 
        delay="cancel" 
        platform="3" 
        targetLoc="Wien Hütteldorf" 
        dirnr="8100447" 
        hafasname="S80" 
        prod="S 80#S" 
        class="32" 
        dir="Wien Hütteldorf" 
        operator="Nahreisezug" 
        administration="81____" 
        depStation="Wien Erzherzog-Karl-Straße Bahnhof" 
        is_reachable="0" 
        realtimeID="00025065-20251030-211500"
    >
        <HIMMessage 
            header="Teilausfall" 
            lead="Dieser Zug fällt zwischen Wien Erzherzog-Karl-Straße und Wien Hütteldorf aus." 
            display="2"
        />
    </Journey>
</StationTable>
```

### Interpretation

1. **First Journey (20:46):** S80 to Wien Hütteldorf, Platform 3, On time
2. **Second Journey (21:01):** R81 to Wien Hbf, Platform 3, On time
3. **Third Journey (21:02):** R81 to Marchegg, Platform 4, On time
4. **Fourth Journey (21:13):** S80 to Aspern Nord, Platform 4, 5 minutes late
5. **Fifth Journey (21:15):** S80 to Wien Hütteldorf, Platform 3, CANCELLED

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Empty response | Invalid station ID | Verify the EVA/UIC number |
| Malformed XML | Wrong encoding | Use ISO-8859-1 encoding |
| No journeys | Station inactive/wrong time | Check schedule or use different time |
| HTTP 503 | Server overload | Retry with exponential backoff |

### Error Handling Example (Python)

```python
import requests
import xml.etree.ElementTree as ET
import time

def get_departures_safe(station_id, max_retries=3):
    """
    Get departures with error handling and retries.
    """
    for attempt in range(max_retries):
        try:
            url = "https://fahrplan.oebb.at/bin/stboard.exe/dn"
            params = {
                'L': 'vs_java3',
                'evaId': station_id,
                'boardType': 'dep',
                'productsFilter': '1111110000011',
                'start': 'yes',
                'showJourneys': 10
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.encoding = 'ISO-8859-1'
            
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}")
            
            # Parse XML
            root = ET.fromstring(response.text)
            
            # Check if we got any results
            journeys = root.findall('Journey')
            if not journeys:
                print(f"No departures found for station {station_id}")
                return []
            
            return journeys
            
        except requests.Timeout:
            print(f"Timeout on attempt {attempt + 1}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
                
        except ET.ParseError as e:
            print(f"XML parsing error: {e}")
            return []
            
        except Exception as e:
            print(f"Error: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    
    print(f"Failed after {max_retries} attempts")
    return []
```

---

## Rate Limits and Best Practices

### Recommendations

1. **Caching:** Cache station IDs and rarely-changing data
2. **Request Frequency:** 
   - For real-time displays: 30-60 second intervals
   - For planning: As needed, no rapid polling
3. **Retry Logic:** Implement exponential backoff
4. **User-Agent:** Set a descriptive User-Agent header
5. **Error Handling:** Always handle network and parsing errors
6. **Encoding:** Always use ISO-8859-1 encoding for responses

### Example Best Practices Implementation

```python
import requests
from functools import lru_cache
import time

# Cache station IDs for 24 hours
@lru_cache(maxsize=128)
def get_station_id(station_name):
    # Your station lookup logic
    pass

# Rate limiting decorator
def rate_limit(min_interval=1.0):
    last_called = [0.0]
    
    def decorator(func):
        def wrapper(*args, **kwargs):
            elapsed = time.time() - last_called[0]
            wait_time = min_interval - elapsed
            if wait_time > 0:
                time.sleep(wait_time)
            result = func(*args, **kwargs)
            last_called[0] = time.time()
            return result
        return wrapper
    return decorator

@rate_limit(min_interval=1.0)  # Max 1 request per second
def get_departures(station_id):
    # Your API call logic
    pass
```

---

## Additional Resources

### Useful Links

- **ÖBB Official Website:** https://www.oebb.at
- **ÖBB Timetable:** https://fahrplan.oebb.at
- **Wikidata Station Database:** https://www.wikidata.org (search for stations)
- **OpenStreetMap:** https://www.openstreetmap.org (railway stations with UIC codes)

### Related Projects

- **HAFAS Client (Node.js):** https://github.com/public-transport/hafas-client
- **ÖBB HAFAS Client:** https://github.com/juliuste/oebb-hafas
- **Public Transport Format (FPTF):** https://github.com/public-transport/friendly-public-transport-format

---

## Appendix: Complete Working Example

### Full Production-Ready Python Script

```python
#!/usr/bin/env python3
"""
ÖBB Departure Board - Production Example
Complete script with error handling, caching, and formatting
"""

import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import html
import time
from functools import lru_cache

class OebbAPI:
    """ÖBB HAFAS API Client"""
    
    BASE_URL = "https://fahrplan.oebb.at/bin/stboard.exe/dn"
    
    def __init__(self, timeout: int = 10):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'OebbDepartureBoard/1.0'
        })
        self.last_request_time = 0
        self.min_request_interval = 1.0  # Rate limiting
    
    def _rate_limit(self):
        """Enforce rate limiting"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)
        self.last_request_time = time.time()
    
    def get_departures(
        self, 
        station_id: str, 
        num_results: int = 10,
        max_retries: int = 3
    ) -> List[Dict]:
        """
        Get departures for a station.
        
        Args:
            station_id: EVA/UIC station ID
            num_results: Number of results to fetch
            max_retries: Maximum retry attempts
            
        Returns:
            List of departure dictionaries
        """
        params = {
            'L': 'vs_java3',
            'evaId': station_id,
            'boardType': 'dep',
            'productsFilter': '1111110000011',
            'start': 'yes',
            'showJourneys': num_results
        }
        
        for attempt in range(max_retries):
            try:
                self._rate_limit()
                
                response = self.session.get(
                    self.BASE_URL,
                    params=params,
                    timeout=self.timeout
                )
                response.encoding = 'ISO-8859-1'
                
                if response.status_code != 200:
                    raise Exception(f"HTTP {response.status_code}")
                
                return self._parse_departures(response.text)
                
            except requests.Timeout:
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise
                    
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise
    
    def _parse_departures(self, xml_text: str) -> List[Dict]:
        """Parse XML response into departure objects"""
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return []
        
        departures = []
        
        for journey in root.findall('Journey'):
            departure = self._parse_journey(journey)
            if departure:
                departures.append(departure)
        
        return departures
    
    def _parse_journey(self, journey: ET.Element) -> Optional[Dict]:
        """Parse a single journey element"""
        try:
            planned_time = journey.get('fpTime', '')
            planned_date = journey.get('fpDate', '')
            delay_str = journey.get('delay', '0')
            
            # Calculate actual time
            actual_time = planned_time
            delay_minutes = 0
            
            if delay_str == 'cancel':
                status = 'CANCELLED'
            elif delay_str and delay_str.startswith('+ '):
                delay_minutes = int(delay_str.replace('+ ', ''))
                dt = datetime.strptime(
                    f"{planned_date} {planned_time}",
                    "%d.%m.%Y %H:%M"
                )
                actual_dt = dt + timedelta(minutes=delay_minutes)
                actual_time = actual_dt.strftime("%H:%M")
                status = f'+{delay_minutes} min'
            else:
                status = 'On time'
            
            return {
                'planned_time': planned_time,
                'actual_time': actual_time,
                'status': status,
                'delay_minutes': delay_minutes,
                'train': journey.get('hafasname', 'N/A'),
                'destination': html.unescape(journey.get('targetLoc', 'N/A')),
                'platform': journey.get('platform', 'N/A'),
                'operator': journey.get('operator', 'ÖBB'),
                'realtime_id': journey.get('realtimeID', '')
            }
            
        except (ValueError, TypeError):
            return None


# Example usage
if __name__ == "__main__":
    api = OebbAPI()
    
    # Wien Erzherzog-Karl-Straße
    station_id = '8100756'
    
    print("Fetching departures...")
    departures = api.get_departures(station_id, num_results=10)
    
    print(f"\nDepartures from Wien Erzherzog-Karl-Straße:\n")
    print(f"{'Time':<8} {'Actual':<8} {'Train':<10} {'To':<30} {'Platform':<10} {'Status':<15}")
    print("-" * 90)
    
    for dep in departures:
        actual = dep['actual_time'] if dep['actual_time'] != dep['planned_time'] else ''
        print(f"{dep['planned_time']:<8} {actual:<8} {dep['train']:<10} "
              f"{dep['destination']:<30} {dep['platform']:<10} {dep['status']:<15}")
```

---

## License and Disclaimer

This documentation is provided for educational purposes. The ÖBB HAFAS API is not officially documented or supported by ÖBB. Use responsibly and respect rate limits. Always check ÖBB's terms of service before using this API in production.

**Author:** API Documentation  
**Last Updated:** October 30, 2025  
**Version:** 1.0
