// Storage utilities for the extension
import { DEFAULT_CHATBOTS, DEFAULT_PROMPTS, DEFAULT_SETTINGS } from './defaults.js';

// Get all chatbots (default + custom)
export async function getAllChatbots() {
    const result = await chrome.storage.sync.get(['customChatbots']);
    const custom = result.customChatbots || {};
    return { ...DEFAULT_CHATBOTS, ...custom };
}

// Get all prompts (default + custom)
export async function getAllPrompts() {
    const result = await chrome.storage.sync.get(['customPrompts']);
    const custom = result.customPrompts || [];
    return [...DEFAULT_PROMPTS, ...custom];
}

// Get settings
export async function getSettings() {
    const result = await chrome.storage.sync.get(['settings']);
    return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

// Save settings
export async function saveSettings(settings) {
    await chrome.storage.sync.set({ settings });
}

// Get custom chatbots only
export async function getCustomChatbots() {
    const result = await chrome.storage.sync.get(['customChatbots']);
    return result.customChatbots || {};
}

// Save custom chatbots
export async function saveCustomChatbots(chatbots) {
    await chrome.storage.sync.set({ customChatbots: chatbots });
}

// Get custom prompts only
export async function getCustomPrompts() {
    const result = await chrome.storage.sync.get(['customPrompts']);
    return result.customPrompts || [];
}

// Save custom prompts
export async function saveCustomPrompts(prompts) {
    await chrome.storage.sync.set({ customPrompts: prompts });
}

// Export all data for backup
export async function exportData() {
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
export async function importData(data) {
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
export async function initializeDefaults() {
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

// Re-export defaults for use in options page
export { DEFAULT_CHATBOTS, DEFAULT_PROMPTS, DEFAULT_SETTINGS };
