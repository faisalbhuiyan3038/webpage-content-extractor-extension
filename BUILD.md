# Build Instructions

This extension supports both Chrome and Firefox. Each requires a different manifest file.

## Quick Setup

### For Chrome:
```bash
# On Windows (PowerShell)
Copy-Item manifest.chrome.json manifest.json -Force

# On Windows (CMD)
copy /Y manifest.chrome.json manifest.json

# On Linux/Mac
cp manifest.chrome.json manifest.json
```

Then load unpacked from `chrome://extensions/`

### For Firefox:
```bash
# On Windows (PowerShell)
Copy-Item manifest.firefox.json manifest.json -Force

# On Windows (CMD)
copy /Y manifest.firefox.json manifest.json

# On Linux/Mac
cp manifest.firefox.json manifest.json
```

Then load from `about:debugging#/runtime/this-firefox`

## Key Differences

| Feature | Chrome | Firefox |
|---------|--------|---------|
| Background | `service_worker` | `scripts` array |
| Content Scripts | Dynamic injection | Pre-registered in manifest |
| Manifest File | `manifest.chrome.json` | `manifest.firefox.json` |

## Automated Build (Optional)

You can use the build scripts to automatically copy the correct manifest:

**Windows:**
```batch
@echo off
set BROWSER=%1
if "%BROWSER%"=="chrome" copy /Y manifest.chrome.json manifest.json
if "%BROWSER%"=="firefox" copy /Y manifest.firefox.json manifest.json
echo Built for %BROWSER%
```

Save as `build.bat` and run: `build.bat chrome` or `build.bat firefox`
