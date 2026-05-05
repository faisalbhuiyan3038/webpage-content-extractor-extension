// Background Service Worker

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // Set default settings
        await chrome.storage.sync.set({
            initialized: true,
            settings: {
                selectedPromptId: 'summary',
                selectedChatbotId: 'chatgpt',
                includePrompt: true,
                openChatbot: true,
                extractionAlgorithm: 1
            },
            customChatbots: {},
            customPrompts: []
        });
        console.log('Webpage Content Extractor installed and initialized');
    }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'extract-and-copy' || command === 'extract-with-prompt') {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        // Get settings
        const result = await chrome.storage.sync.get(['settings', 'customPrompts']);
        const settings = result.settings || {
            selectedPromptId: 'summary',
            selectedChatbotId: 'chatgpt',
            includePrompt: true,
            openChatbot: true,
            extractionAlgorithm: 1
        };

        // Get prompts
        const DEFAULT_PROMPTS = [
            { id: 'none', name: 'No Prompt (Raw Text Only)', content: '', isDefault: true },
            { id: 'summary', name: 'Summary - Short', content: 'Please summarize the following text in under 100 words...', isDefault: true }
        ];
        const customPrompts = result.customPrompts || [];
        const allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];

        // Get chatbots
        const DEFAULT_CHATBOTS = {
            'chatgpt': { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', characterLimit: 40000 }
        };
        const customChatbots = (await chrome.storage.sync.get(['customChatbots'])).customChatbots || {};
        const allChatbots = { ...DEFAULT_CHATBOTS, ...customChatbots };

        // Find selected prompt and chatbot
        const prompt = allPrompts.find(p => p.id === settings.selectedPromptId) || allPrompts[0];
        const chatbot = allChatbots[settings.selectedChatbotId] || allChatbots['chatgpt'];

        const includePrompt = command === 'extract-with-prompt' ? settings.includePrompt : false;

        try {
            // Inject content script if needed and extract
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/extractor.js']
            });

            // Send extraction request — always target frameId 0 (main frame)
            // With all_frames:true, omitting frameId would let any iframe respond first.
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'extractContent',
                characterLimit: chatbot.characterLimit || 20000,
                promptLength: includePrompt ? prompt.content.length : 0,
                algorithm: settings.extractionAlgorithm || 1
            }, { frameId: 0 });

            if (response && response.success) {
                let finalText = response.content;

                if (includePrompt && prompt.content) {
                    finalText = `${prompt.content}\n\n---\n\nPage Content:\n${response.content}`;
                }

                // Copy to clipboard using offscreen document or fallback
                await copyToClipboard(finalText);

                // Open chatbot if enabled
                if (settings.openChatbot) {
                    chrome.tabs.create({ url: chatbot.url });
                }
            }
        } catch (error) {
            console.error('Extraction failed:', error);
        }
    }
});

// Copy to clipboard helper
async function copyToClipboard(text) {
    // For MV3, we need to use the offscreen API or inject a script
    try {
        // Try using clipboard API via offscreen document (Chrome 109+)
        if (chrome.offscreen) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['CLIPBOARD'],
                justification: 'Copy extracted text to clipboard'
            });
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text });
            await chrome.offscreen.closeDocument();
        }
    } catch (e) {
        // Fallback: handled in popup
        console.log('Clipboard operation will be handled by popup');
    }
}

/**
 * Shared frame-extraction helper.
 * Sends extractContent to specific frameIds and merges results.
 * Returns { success: true, content } if any frame yielded content,
 * or { success: false, error } if every frame failed.
 *
 * IMPORTANT: This is a plain async function — both the extractFromTabs
 * and extractFromFrames message handlers call it directly. A service worker
 * cannot send chrome.runtime.sendMessage to itself, so we must NOT route
 * through the message listener.
 */
async function doExtractFromFrames({ tabId, iframeSource, frameTargets, characterLimit, algorithm }) {
    const results = [];
    const msgOpts = { action: 'extractContent', characterLimit, promptLength: 0, algorithm };

    // ── Main frame (frameId 0) ────────────────────────────────────────────────
    if (iframeSource === 'main' || iframeSource === 'both') {
        try {
            const resp = await chrome.tabs.sendMessage(tabId, msgOpts, { frameId: 0 });
            if (resp?.success && resp.content) {
                results.push(
                    iframeSource === 'both'
                        ? `=== Main Document ===\n${resp.content}`
                        : resp.content
                );
            }
        } catch (e) {
            console.warn('[WCE] main frame extraction failed:', e);
        }
    }

    // ── Iframe frames ─────────────────────────────────────────────────────────
    if (iframeSource === 'iframes' || iframeSource === 'both') {
        let targetsToUse = (frameTargets && frameTargets.length > 0) ? frameTargets : [];

        // Default: use first available iframe when none explicitly selected
        if (targetsToUse.length === 0) {
            try {
                const allFrames = await chrome.webNavigation.getAllFrames({ tabId });
                const first = (allFrames || []).find(f => f.frameId !== 0);
                if (first) targetsToUse = [{ frameId: first.frameId, label: 'main > iframe-0', url: first.url }];
            } catch (_) {}
        }

        for (const target of targetsToUse) {
            try {
                const resp = await chrome.tabs.sendMessage(
                    tabId, msgOpts, { frameId: target.frameId }
                );
                if (resp?.success && resp.content) {
                    // Only push real content — never push error strings into results
                    results.push(`=== Frame: ${target.label} (${target.url || ''}) ===\n${resp.content}`);
                } else {
                    console.warn(`[WCE] frame ${target.frameId} returned no content`);
                }
            } catch (e) {
                // Frame may not have the content script yet (e.g. cross-origin that
                // hadn't fully loaded when all_frames injection ran). Skip silently.
                console.warn(`[WCE] frame ${target.frameId} (${target.label}) not reachable:`, e.message);
            }
        }
    }

    if (results.length === 0) {
        return { success: false, error: 'No content could be extracted from the selected frames.' };
    }
    return { success: true, content: results.join('\n\n') };
}

// Message handler for various operations
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
    } else if (request.action === 'openChatbotTab') {
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
    } else if (request.action === 'updateRecentChatbots') {
        chrome.storage.sync.get(['recentChatbots']).then(result => {
            let recents = result.recentChatbots || [];
            recents = recents.filter(id => id !== request.chatbotId);
            recents.unshift(request.chatbotId);
            if (recents.length > 3) recents = recents.slice(0, 3);
            chrome.storage.sync.set({ recentChatbots: recents }).then(() => {
                sendResponse({ success: true, recentChatbots: recents });
            });
        });
        return true;
    } else if (request.action === 'getSidebarData') {
        chrome.storage.sync.get(['settings', 'customChatbots', 'preferredChatbots', 'recentChatbots']).then(result => {
            const DEFAULT_SETTINGS = { sidebarEnabled: true, sidebarPosition: 'right' };
            const DEFAULT_CHATBOTS = {
                'chatgpt': { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', characterLimit: 40000 },
                'claude': { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', characterLimit: 50000 },
                'gemini': { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', characterLimit: 32000 },
                'grok': { id: 'grok', name: 'Grok', url: 'https://grok.com', characterLimit: 100000 },
                'deepseek': { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', characterLimit: 200000 },
                'gemini_studio': { id: 'gemini_studio', name: 'Gemini AI Studio', url: 'https://aistudio.google.com/prompts/new_chat', characterLimit: 100000 }
            };
            const DEFAULT_PREFERRED = ['chatgpt', 'claude', 'gemini'];
            
            const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
            const chatbots = { ...DEFAULT_CHATBOTS, ...(result.customChatbots || {}) };
            const preferredChatbots = result.preferredChatbots || DEFAULT_PREFERRED;
            const recentChatbots = result.recentChatbots || [];
            
            sendResponse({ settings, chatbots, preferredChatbots, recentChatbots });
        });
        return true;
    } else if (request.action === 'addChatbot') {
        chrome.storage.sync.get(['customChatbots']).then(result => {
            const custom = result.customChatbots || {};
            custom[request.chatbot.id] = request.chatbot;
            chrome.storage.sync.set({ customChatbots: custom }).then(() => {
                sendResponse({ success: true });
            });
        });
        return true;
    } else if (request.action === 'getOpenTabs') {
        chrome.tabs.query({}).then(tabs => {
            // Filter out the sender tab
            const otherTabs = tabs.filter(tab => !sender.tab || tab.id !== sender.tab.id).map(tab => ({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                favicon: tab.favIconUrl
            }));
            sendResponse({ success: true, tabs: otherTabs });
        });
        return true;
    } else if (request.action === 'extractFromTabs') {
        const { tabIds, characterLimit, algorithm, iframeSource, frameTargets } = request;
        const useIframes = iframeSource && iframeSource !== 'main';

        Promise.all(tabIds.map(async (tabId) => {
            try {
                const tab = await chrome.tabs.get(tabId);
                const tabTitle = tab.title || `Tab ${tabId}`;

                // Ensure content script is injected
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content/extractor.js']
                });

                let content = null;

                if (useIframes) {
                    // Call doExtractFromFrames directly — never via sendMessage to self
                    const result = await doExtractFromFrames({
                        tabId, iframeSource, frameTargets: frameTargets || [],
                        characterLimit, algorithm
                    });
                    if (result.success) content = result.content;
                } else {
                    // Main frame only — always use frameId:0 to avoid iframe responses
                    const response = await chrome.tabs.sendMessage(
                        tabId,
                        { action: 'extractContent', characterLimit, promptLength: 0, algorithm },
                        { frameId: 0 }
                    );
                    if (response?.success && response.content) content = response.content;
                }

                if (content) {
                    return tabIds.length > 1
                        ? `--- Start: ${tabTitle} ---\n${content}\n--- End: ${tabTitle} ---`
                        : content;
                }
                return null; // signal failure — filtered out below
            } catch (err) {
                console.error('[WCE] extractFromTabs failed for tab', tabId, err);
                return null;
            }
        })).then(results => {
            const valid = results.filter(r => r !== null);
            if (valid.length > 0) {
                sendResponse({ success: true, content: valid.join('\n\n') });
            } else {
                sendResponse({ success: false, error: 'Content extraction failed for all selected tabs.' });
            }
        });
        return true;

    } else if (request.action === 'getIframesForTab') {
        // Returns a hierarchical list of all frames in a tab using webNavigation.
        // Each frame has a stable frameId usable with chrome.tabs.sendMessage({ frameId }).
        const { tabId } = request;
        chrome.webNavigation.getAllFrames({ tabId }).then(frames => {
            if (!frames || frames.length <= 1) {
                // Only the main frame (frameId 0) — no iframes
                sendResponse({ success: true, frames: [] });
                return;
            }

            // Build a map of frameId → enriched frame node
            const frameMap = {};
            frames.forEach(f => {
                frameMap[f.frameId] = {
                    frameId: f.frameId,
                    parentFrameId: f.parentFrameId,
                    url: f.url,
                    label: '',
                    depth: 0,
                    children: []
                };
            });

            // Wire parent→child relationships
            const subFrameRoots = [];
            frames.forEach(f => {
                if (f.frameId === 0) return; // skip main frame itself
                const parent = frameMap[f.parentFrameId];
                if (parent) {
                    parent.children.push(frameMap[f.frameId]);
                } else {
                    subFrameRoots.push(frameMap[f.frameId]);
                }
            });

            // Assign hierarchical labels recursively
            const iframeCounter = {};
            function assignLabels(node, parentLabel, depth) {
                const key = parentLabel || '__root__';
                const idx = iframeCounter[key] = (iframeCounter[key] || 0);
                iframeCounter[key]++;
                const seg = `iframe-${idx}`;
                node.label = parentLabel ? `${parentLabel} > ${seg}` : `main > ${seg}`;
                node.depth = depth;
                node.children.forEach(child => assignLabels(child, node.label, depth + 1));
            }
            const mainChildren = frameMap[0] ? frameMap[0].children : subFrameRoots;
            mainChildren.forEach(child => assignLabels(child, 'main', 1));

            // Flatten to array (DFS order preserves visual hierarchy)
            const flat = [];
            function flatten(node) {
                // Omit internal children array from response (not serialisable cleanly)
                flat.push({ frameId: node.frameId, label: node.label, url: node.url, depth: node.depth });
                node.children.forEach(flatten);
            }
            mainChildren.forEach(flatten);

            sendResponse({ success: true, frames: flat });
        }).catch(err => {
            console.error('[WCE] getIframesForTab error:', err);
            sendResponse({ success: false, frames: [] });
        });
        return true;

    } else if (request.action === 'extractFromFrames') {
        // Thin handler — delegates to the shared doExtractFromFrames helper.
        // Keeping logic in a standalone function avoids the service-worker
        // self-messaging anti-pattern used by extractFromTabs.
        const { tabId, iframeSource, frameTargets, characterLimit, algorithm } = request;
        doExtractFromFrames({ tabId, iframeSource, frameTargets, characterLimit, algorithm })
            .then(result => sendResponse(result))
            .catch(err => {
                console.error('[WCE] extractFromFrames error:', err);
                sendResponse({ success: false, error: String(err) });
            });
        return true;
    }
    return true;
});

