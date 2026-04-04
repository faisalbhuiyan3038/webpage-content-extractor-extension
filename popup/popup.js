// Popup JavaScript - Main UI Logic
import { getAllPrompts, getAllChatbots, getSettings, saveSettings, ALGORITHMS } from '../shared/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const promptSelect = document.getElementById('prompt-select');
    const chatbotSelect = document.getElementById('chatbot-select');
    const algorithmSelect = document.getElementById('algorithm-select');
    const tabsGroup = document.getElementById('tabs-group');
    const tabsList = document.getElementById('tabs-list');
    const includePromptCheckbox = document.getElementById('include-prompt');
    const openChatbotCheckbox = document.getElementById('open-chatbot');
    const extractBtn = document.getElementById('extract-btn');
    const optionsBtn = document.getElementById('options-btn');
    const statusEl = document.getElementById('status');

    // Load and populate data
    await loadData();

    // Event Listeners
    extractBtn.addEventListener('click', handleExtract);
    optionsBtn.addEventListener('click', openOptions);

    // Save settings on change
    promptSelect.addEventListener('change', saveCurrentSettings);
    chatbotSelect.addEventListener('change', saveCurrentSettings);
    algorithmSelect.addEventListener('change', saveCurrentSettings);
    includePromptCheckbox.addEventListener('change', saveCurrentSettings);
    openChatbotCheckbox.addEventListener('change', saveCurrentSettings);

    // Load all data and populate dropdowns
    async function loadData() {
        try {
            // Get all prompts and chatbots
            const allPrompts = await getAllPrompts();
            const allChatbots = await getAllChatbots();
            const settings = await getSettings();

            // Populate prompt dropdown
            promptSelect.innerHTML = '';
            allPrompts.forEach(prompt => {
                const option = document.createElement('option');
                option.value = prompt.id;
                option.textContent = prompt.name;
                if (prompt.id === settings.selectedPromptId) {
                    option.selected = true;
                }
                promptSelect.appendChild(option);
            });

            // Populate chatbot dropdown
            chatbotSelect.innerHTML = '';
            Object.values(allChatbots).forEach(chatbot => {
                const option = document.createElement('option');
                option.value = chatbot.id;
                option.textContent = chatbot.name;
                if (chatbot.id === settings.selectedChatbotId) {
                    option.selected = true;
                }
                chatbotSelect.appendChild(option);
            });

            // Populate algorithm dropdown
            algorithmSelect.innerHTML = '';
            Object.values(ALGORITHMS).forEach(algo => {
                const option = document.createElement('option');
                option.value = algo.id;
                option.textContent = algo.name;
                if (algo.id == (settings.extractionAlgorithm || 1)) {
                    option.selected = true;
                }
                algorithmSelect.appendChild(option);
            });

            // Populate all tabs list (including current)
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const allTabs = await chrome.tabs.query({});
            const validTabs = allTabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('about:') && !t.url.startsWith('moz-extension://'));
            
            if (validTabs.length > 0) {
                tabsGroup.style.display = 'block';
                tabsList.innerHTML = '';
                validTabs.forEach(t => {
                    const label = document.createElement('label');
                    label.style.display = 'flex';
                    label.style.alignItems = 'center';
                    label.style.marginBottom = '4px';
                    label.style.cursor = 'pointer';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = t.id;
                    cb.style.marginRight = '8px';
                    
                    const isCurrent = currentTab && t.id === currentTab.id;
                    if (isCurrent) {
                        cb.checked = true;
                    }
                    
                    const title = document.createElement('span');
                    const tabTitleText = t.title ? (t.title.length > 40 ? t.title.substring(0, 40) + '...' : t.title) : 'Untitled Tab';
                    title.textContent = isCurrent ? `[Current] ${tabTitleText}` : tabTitleText;
                    
                    title.style.fontSize = '12px';
                    title.style.whiteSpace = 'nowrap';
                    title.style.overflow = 'hidden';
                    title.style.textOverflow = 'ellipsis';
                    
                    if (isCurrent) {
                        title.style.fontWeight = 'bold';
                    }
                    
                    label.appendChild(cb);
                    label.appendChild(title);
                    tabsList.appendChild(label);
                });
            } else {
                tabsGroup.style.display = 'none';
            }

            // Set checkbox states
            includePromptCheckbox.checked = settings.includePrompt !== false;
            openChatbotCheckbox.checked = settings.openChatbot !== false;

            // Update include prompt visibility based on selected prompt
            updateIncludePromptVisibility();
        } catch (error) {
            console.error('Failed to load data:', error);
            showStatus('Failed to load settings', 'error');
        }
    }

    // Update "include prompt" checkbox visibility
    function updateIncludePromptVisibility() {
        const selectedPromptId = promptSelect.value;
        const includePromptLabel = includePromptCheckbox.closest('.checkbox-label');

        if (selectedPromptId === 'none') {
            includePromptLabel.style.opacity = '0.5';
            includePromptLabel.style.pointerEvents = 'none';
            includePromptCheckbox.checked = false;
        } else {
            includePromptLabel.style.opacity = '1';
            includePromptLabel.style.pointerEvents = 'auto';
        }
    }

    // Save current settings
    async function saveCurrentSettings() {
        updateIncludePromptVisibility();

        const settings = {
            selectedPromptId: promptSelect.value,
            selectedChatbotId: chatbotSelect.value,
            includePrompt: includePromptCheckbox.checked,
            openChatbot: openChatbotCheckbox.checked,
            extractionAlgorithm: parseInt(algorithmSelect.value) || 1
        };

        await saveSettings(settings);
    }

    // Handle extraction
    async function handleExtract() {
        // Get current selections
        const selectedPromptId = promptSelect.value;
        const selectedChatbotId = chatbotSelect.value;
        const includePrompt = includePromptCheckbox.checked && selectedPromptId !== 'none';
        const openChatbot = openChatbotCheckbox.checked;
        const selectedAlgorithm = parseInt(algorithmSelect.value) || 1;

        // Get selected tabs
        const selectedTabIds = Array.from(tabsList.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));

        // Get prompt and chatbot details
        const allPrompts = await getAllPrompts();
        const allChatbots = await getAllChatbots();

        const prompt = allPrompts.find(p => p.id === selectedPromptId);
        const chatbot = allChatbots[selectedChatbotId];
        const algoToUse = selectedAlgorithm;

        if (!chatbot) {
            showStatus('Please select a valid chatbot', 'error');
            return;
        }

        if (selectedTabIds.length === 0) {
            showStatus('Please select at least one tab to extract', 'error');
            return;
        }

        // Update UI to loading state
        setLoading(true);
        showStatus('Extracting content...', 'info');

        try {
            // Build tab list to extract
            const tabsToExtract = [];
            const allTabs = await chrome.tabs.query({});
            selectedTabIds.forEach(id => {
                const t = allTabs.find(tab => tab.id === id);
                if (t) tabsToExtract.push(t);
            });

            // Detect if Firefox (uses pre-registered content scripts) or Chrome (needs dynamic injection)
            const isFirefox = navigator.userAgent.includes('Firefox');

            const extractPromises = tabsToExtract.map(async (tab) => {
                // Check if we can inject into this tab
                if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
                    tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
                    console.log(`Skipping tab ${tab.url || 'unknown'} - unextractable`);
                    return null;
                }

                if (!isFirefox) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['content/extractor.js']
                        });
                        await new Promise(resolve => setTimeout(resolve, 100)); // wait for script init
                    } catch (injectionError) {
                        console.log(`Script injection skipped or failed for tab ${tab.id}:`, injectionError.message);
                    }
                }

                try {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        action: 'extractContent',
                        characterLimit: chatbot.characterLimit || 20000,
                        promptLength: includePrompt && prompt ? prompt.content.length : 0,
                        algorithm: algoToUse
                    });

                    if (response && response.success) {
                        const tabTitle = tab.title || 'Untitled Tab';
                        let tabText = response.content;
                        if (tabsToExtract.length > 1) {
                            tabText = `=== Webpage: ${tabTitle} ===\nURL: ${tab.url}\n\n${tabText}\n`;
                        }
                        return tabText;
                    } else {
                        console.log(`Extraction failed for tab ${tab.id}:`, response?.error);
                        return null;
                    }
                } catch (err) {
                    console.log(`Failed to message tab ${tab.id}:`, err.message);
                    return null;
                }
            });

            let allContents = await Promise.all(extractPromises);
            // Filter out nulls
            const validContents = allContents.filter(content => content !== null);

            if (validContents.length === 0) {
                throw new Error('Failed to extract any content.');
            }

            // Build final text
            let finalText = validContents.join('\n\n');

            if (includePrompt && prompt && prompt.content) {
                finalText = `${prompt.content}\n\n---\n\n${tabsToExtract.length > 1 ? 'Combined Page Contents:' : 'Page Content:'}\n${finalText}`;
            }
            
            // Re-apply truncation to final combo just in case it breaks limits
            if (finalText.length > (chatbot.characterLimit || 20000)) {
                finalText = finalText.substring(0, (chatbot.characterLimit || 20000) - 100) + '\n...[Text Truncated]';
            }

            // Copy to clipboard
            await navigator.clipboard.writeText(finalText);

            // Show success
            const charCount = finalText.length.toLocaleString();
            showStatus(`Copied! (${charCount} chars)`, 'success');

            // Open chatbot if enabled
            if (openChatbot) {
                await chrome.tabs.create({ url: chatbot.url });
            }

        } catch (error) {
            console.error('Extraction error:', error);
            showStatus(error.message || 'Extraction failed', 'error');
        } finally {
            setLoading(false);
        }
    }

    // Open options page
    function openOptions() {
        chrome.runtime.openOptionsPage();
    }

    // Show status message
    function showStatus(message, type = 'info') {
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;

        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 3000);
        }
    }

    // Set loading state
    function setLoading(loading) {
        extractBtn.disabled = loading;
        if (loading) {
            extractBtn.classList.add('loading');
            extractBtn.querySelector('.btn-icon').textContent = '⏳';
            extractBtn.querySelector('.btn-text').textContent = 'Extracting...';
        } else {
            extractBtn.classList.remove('loading');
            extractBtn.querySelector('.btn-icon').textContent = '🚀';
            extractBtn.querySelector('.btn-text').textContent = 'Extract & Copy';
        }
    }
});
