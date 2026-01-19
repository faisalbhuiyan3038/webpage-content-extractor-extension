// Storage utilities for the extension

// Get all chatbots (default + custom)
async function getAllChatbots() {
    const result = await chrome.storage.sync.get(['customChatbots']);
    const custom = result.customChatbots || {};
    return { ...DEFAULT_CHATBOTS, ...custom };
}

// Get all prompts (default + custom)
async function getAllPrompts() {
    const result = await chrome.storage.sync.get(['customPrompts']);
    const custom = result.customPrompts || [];
    return [...DEFAULT_PROMPTS, ...custom];
}

// Get settings
async function getSettings() {
    const result = await chrome.storage.sync.get(['settings']);
    return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

// Save settings
async function saveSettings(settings) {
    await chrome.storage.sync.set({ settings });
}

// Get custom chatbots only
async function getCustomChatbots() {
    const result = await chrome.storage.sync.get(['customChatbots']);
    return result.customChatbots || {};
}

// Save custom chatbots
async function saveCustomChatbots(chatbots) {
    await chrome.storage.sync.set({ customChatbots: chatbots });
}

// Get custom prompts only
async function getCustomPrompts() {
    const result = await chrome.storage.sync.get(['customPrompts']);
    return result.customPrompts || [];
}

// Save custom prompts
async function saveCustomPrompts(prompts) {
    await chrome.storage.sync.set({ customPrompts: prompts });
}

// Export all data for backup
async function exportData() {
    const result = await chrome.storage.sync.get(null);
    return {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        customChatbots: result.customChatbots || {},
        customPrompts: result.customPrompts || [],
        settings: result.settings || DEFAULT_SETTINGS
    };
}

// Import data from backup
async function importData(data) {
    if (!data || !data.version) {
        throw new Error('Invalid import data format');
    }

    await chrome.storage.sync.set({
        customChatbots: data.customChatbots || {},
        customPrompts: data.customPrompts || [],
        settings: data.settings || DEFAULT_SETTINGS
    });

    return true;
}

// Initialize defaults on first install
async function initializeDefaults() {
    const result = await chrome.storage.sync.get(['initialized']);
    if (!result.initialized) {
        await chrome.storage.sync.set({
            initialized: true,
            settings: DEFAULT_SETTINGS,
            customChatbots: {},
            customPrompts: []
        });
    }
}
