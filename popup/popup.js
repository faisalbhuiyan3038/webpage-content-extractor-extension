// Popup JavaScript - Main UI Logic

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const promptSelect = document.getElementById('prompt-select');
    const chatbotSelect = document.getElementById('chatbot-select');
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
            openChatbot: openChatbotCheckbox.checked
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

        // Get prompt and chatbot details
        const allPrompts = await getAllPrompts();
        const allChatbots = await getAllChatbots();

        const prompt = allPrompts.find(p => p.id === selectedPromptId);
        const chatbot = allChatbots[selectedChatbotId];

        if (!chatbot) {
            showStatus('Please select a valid chatbot', 'error');
            return;
        }

        // Update UI to loading state
        setLoading(true);
        showStatus('Extracting content...', 'info');

        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error('No active tab found');
            }

            // Check if we can inject into this tab
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
                throw new Error('Cannot extract from browser pages');
            }

            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/extractor.js']
            });

            // Wait a moment for script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));

            // Send extraction request
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'extractContent',
                characterLimit: chatbot.characterLimit || 20000,
                promptLength: includePrompt && prompt ? prompt.content.length : 0
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Extraction failed');
            }

            // Build final text
            let finalText = response.content;

            if (includePrompt && prompt && prompt.content) {
                finalText = `${prompt.content}\n\n---\n\nPage Content:\n${response.content}`;
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
