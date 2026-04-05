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

            // Send extraction request
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'extractContent',
                characterLimit: chatbot.characterLimit || 20000,
                promptLength: includePrompt ? prompt.content.length : 0,
                algorithm: settings.extractionAlgorithm || 1
            });

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
        chrome.tabs.query({ currentWindow: true }).then(tabs => {
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
        const { tabIds, characterLimit, algorithm } = request;
        
        Promise.all(tabIds.map(async (tabId) => {
            try {
                // Get tab info first so we have the title regardless of extractor response
                const tab = await chrome.tabs.get(tabId);
                const tabTitle = tab.title || `Tab ${tabId}`;

                // Ensure extractor is injected
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content/extractor.js']
                });
                
                // Extract
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'extractContent',
                    characterLimit,
                    promptLength: 0,
                    algorithm
                });
                
                if (response && response.success) {
                    return `--- Start: ${tabTitle} ---\n${response.content}\n--- End: ${tabTitle} ---`;
                }
                return `--- Failed to extract from: ${tabTitle} ---`;
            } catch (err) {
                console.error('Failed to extract from tab', tabId, err);
                return `--- Failed to extract from Tab ${tabId} ---`;
            }
        })).then(results => {
            sendResponse({ success: true, content: results.join('\n\n') });
        });
        return true;
    }
    return true;
});
