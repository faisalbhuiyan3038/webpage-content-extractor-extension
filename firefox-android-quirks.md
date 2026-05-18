# Firefox Android Extension Quirks & Debugging Log

This document outlines key technical hurdles, findings, and solutions encountered when deploying and debugging the Webpage Content Extractor extension on **Firefox for Android (GeckoView)**. It details API support variances compared to Chrome and Firefox Desktop, what was attempted, and how the issues were ultimately resolved.

---

## 1. The Core Issues

### Issue A: Background Script Crash via Unsupported `chrome.commands`
* **Symptoms**: Tapping the "Insert Tab Context" button injected on AI websites resulted in an empty popover containing no tabs. In addition, no runtime messages from the content script were received or responded to by the background script.
* **The Log**:
  ```text
  Uncaught TypeError: can't access property "onCommand", chrome.commands is undefined
      at background.js:1:352
  ```
* **Cause**: Unlike Firefox Desktop or Google Chrome, **Firefox for Android does not support the Commands API** (used for configuring global keyboard shortcuts). The background worker script evaluated `chrome.commands.onCommand` directly at startup. Because `chrome.commands` was `undefined`, a fatal TypeError occurred immediately, stopping background execution before the extension's runtime message listener (`chrome.runtime.onMessage.addListener`) was ever registered.

### Issue B: The Desktop-Only `chrome.windows` API
* **Symptoms**: Re-attempting query mechanisms using windows resulted in:
  ```text
  Uncaught TypeError: can't access property "getAll", chrome.windows is undefined
  ```
* **Cause**: On mobile browsers like Firefox Android, there is no concept of multiple OS-level windows. Consequently, **`chrome.windows` is entirely unavailable** on the Android extension runtime platform.

---

## 2. What Was Attempted & The Trajectory

### Attempt 1: Contextual Filtering Adaptation (Partial Success)
Initially, it was suspected that the tab retrieval filter in `background.js` was too loose compared to the popup UI. We added comprehensive checks for:
- Omitting the sender tab (so a website doesn't select itself).
- Skipping restricted protocols (`chrome://`, `about:`, `moz-extension://`).
- Normalizing tab variables (falling back on `favicon` URLs, matching both `favIconUrl` and `faviconUrl`).
- Adding `sender.tab.windowId` to restrict queries on `chrome.tabs.query`.
* **Result**: Still empty, because the background script was silently crashing before the message listener could execute due to **Issue A**.

### Attempt 2: Swapping to `chrome.windows` (Failure)
To work around potential mobile `tabs.query` quirks without a bound UI context, we attempted using:
```javascript
chrome.windows.getAll({ populate: true })
```
* **Result**: Threw an uncaught runtime TypeError immediately because the `windows` API is not supported on Firefox Android (GeckoView).

---

## 3. The Final Working Solution

The solution consisted of two main components:

### 1. Robust API Feature Guards
To prevent fatal script failures from crashing the background listener initialization, we wrapped the unsupported desktop-only keyboard shortcut registry:
```javascript
// Handle keyboard shortcuts (Desktop Only)
if (chrome.commands) {
    chrome.commands.onCommand.addListener(async (command) => {
        // Keyboard handler logic...
    });
}
```
This safely allows the script to keep running, ensuring the message listener gets registered.

### 2. Bulletproof Async IIFE Message Handler with `tabs.query({})`
With the background script now running correctly, we query tabs using the standard, fully-supported `chrome.tabs.query({})` API. We restructured the handler with an immediately-invoked async function expression (`async () => {}`) to guarantee `sendResponse` is reliably fired asynchronously in a structured try-catch workflow:

```javascript
} else if (request.action === 'getOpenTabs') {
    (async () => {
        try {
            console.log('[WCE] getOpenTabs: querying tabs. sender.tab?.id:', sender.tab?.id);
            const tabs = await chrome.tabs.query({});
            console.log('[WCE] getOpenTabs: tabs.query returned', tabs.length);
            const senderTabId = sender.tab?.id;
            const validTabs = tabs.filter(tab => {
                if (senderTabId != null && tab.id === senderTabId) return false;
                if (!tab.url) return false;
                if (tab.url.startsWith('chrome://') ||
                    tab.url.startsWith('chrome-extension://') ||
                    tab.url.startsWith('about:') ||
                    tab.url.startsWith('moz-extension://')) return false;
                return true;
            });
            console.log('[WCE] getOpenTabs: validTabs', validTabs.length);
            const otherTabs = validTabs.map(tab => ({
                id: tab.id,
                title: tab.title || 'Untitled Tab',
                url: tab.url,
                favicon: tab.favIconUrl || ''
            }));
            sendResponse({ success: true, tabs: otherTabs });
        } catch (err) {
            console.error('[WCE] getOpenTabs error:', err);
            sendResponse({ success: false, tabs: [], error: String(err) });
        }
    })();
    return true; // Keep the message channel open for sendResponse
}
```

---

## 4. Key Takeaways for Mobile Extension Development

1. **Always Feature-Guard Desktop APIs**: APIs like `chrome.commands` and `chrome.windows` are totally absent on Firefox Android. Always guard them using simple truthiness checks (`if (chrome.commands)`) to avoid stopping entire execution trees.
2. **`tabs.query` is Supported, but Content Scripts lack direct access**: Direct queries work from the background page on mobile, provided the background page's listener has loaded successfully.
3. **Guard Sender Tab Checks**: `sender.tab` is highly variable on mobile platforms and may occasionally lack expected attributes. Using safe optional chaining like `sender.tab?.id` guarantees script survival under erratic mobile execution contexts.
