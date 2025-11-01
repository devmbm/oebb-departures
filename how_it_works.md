# Important info sources

- npn streamdeck see: https://www.npmjs.com/package/@elgato/streamdeck
- streamdeck sdk github: https://github.com/elgatosf/streamdeck
- knowledge base "rag-streamdeck-dev" https://github.com/9h03n1x/rag-streamdeck-dev

# Videos I followed

1. 28 min video https://www.youtube.com/watch?v=DqOEjviFhq4
2. "get started" https://www.youtube.com/watch?v=qiLz2uh6_mI
3. ai can make plugins https://www.youtube.com/watch?v=u1tU_UDk0HY

# Instructions for myself

to install the npm, on the terminal in vscode

```powershell
npm install -g @elgato/cli@latest
```
on a terminal tab on vscode

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

then

```powershell
streamdeck create
```

this enters the creation wizard, and it will create the plugin base.

after that just

```powershell
cd FOLDERNAME
```

to continuosly build the plugin write

```powershell
npn run watch
```

it will keep building the plugin, restarting streackdeck, etc.
once you finish, cancel the bath program _using Ctrl+C for example_

finally:

```powershell
streamdeck pack com.xxxxxxxxxxx.xxxxxxxxxxx
```

and the .streamdeckplugin should be created
