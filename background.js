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
                openChatbot: true
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
            openChatbot: true
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
                promptLength: includePrompt ? prompt.content.length : 0
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
    }
    return true;
});
