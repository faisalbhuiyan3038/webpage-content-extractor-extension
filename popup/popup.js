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

    // Iframe DOM elements
    const iframeSourceGroup = document.getElementById('iframe-source-group');
    const iframeSourceSelect = document.getElementById('iframe-source-select');
    const iframePickerGroup = document.getElementById('iframe-picker-group');
    const iframePickerList = document.getElementById('iframe-picker-list');

    // State
    let currentTabId = null;
    let availableFrames = []; // Array<{ frameId, label, url, depth }>

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
    iframeSourceSelect.addEventListener('change', () => {
        onIframeSourceChange();
        saveCurrentSettings();
    });

    // ── Load all data and populate dropdowns ──────────────────────────────────

    async function loadData() {
        try {
            const allPrompts = await getAllPrompts();
            const allChatbots = await getAllChatbots();
            const settings = await getSettings();

            // Populate prompt dropdown
            promptSelect.innerHTML = '';
            allPrompts.forEach(prompt => {
                const option = document.createElement('option');
                option.value = prompt.id;
                option.textContent = prompt.name;
                if (prompt.id === settings.selectedPromptId) option.selected = true;
                promptSelect.appendChild(option);
            });

            // Populate chatbot dropdown
            chatbotSelect.innerHTML = '';
            Object.values(allChatbots).forEach(chatbot => {
                const option = document.createElement('option');
                option.value = chatbot.id;
                option.textContent = chatbot.name;
                if (chatbot.id === settings.selectedChatbotId) option.selected = true;
                chatbotSelect.appendChild(option);
            });

            // Populate algorithm dropdown
            algorithmSelect.innerHTML = '';
            Object.values(ALGORITHMS).forEach(algo => {
                const option = document.createElement('option');
                option.value = algo.id;
                option.textContent = algo.name;
                if (algo.id == (settings.extractionAlgorithm || 1)) option.selected = true;
                algorithmSelect.appendChild(option);
            });

            // Restore iframe source setting
            const savedIframeSource = settings.iframeSource || 'main';
            iframeSourceSelect.value = savedIframeSource;

            // Populate tabs list
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            currentTabId = currentTab?.id ?? null;

            const allTabs = await chrome.tabs.query({});
            const validTabs = allTabs.filter(t =>
                t.url &&
                !t.url.startsWith('chrome://') &&
                !t.url.startsWith('chrome-extension://') &&
                !t.url.startsWith('about:') &&
                !t.url.startsWith('moz-extension://')
            );

            if (validTabs.length > 0) {
                tabsGroup.style.display = 'block';
                tabsList.innerHTML = '';
                validTabs.forEach(t => {
                    const label = document.createElement('label');
                    label.style.cssText = 'display:flex;align-items:center;margin-bottom:4px;cursor:pointer;';

                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = t.id;
                    cb.style.marginRight = '8px';

                    const isCurrent = currentTab && t.id === currentTab.id;
                    if (isCurrent) cb.checked = true;

                    const title = document.createElement('span');
                    const tabTitleText = t.title
                        ? (t.title.length > 40 ? t.title.substring(0, 40) + '...' : t.title)
                        : 'Untitled Tab';
                    title.textContent = isCurrent ? `[Current] ${tabTitleText}` : tabTitleText;
                    title.style.cssText = 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    if (isCurrent) title.style.fontWeight = 'bold';

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
            updateIncludePromptVisibility();

            // Discover iframes for the active tab
            if (currentTabId !== null) {
                await loadIframes(currentTabId, savedIframeSource);
            }

        } catch (error) {
            console.error('Failed to load data:', error);
            showStatus('Failed to load settings', 'error');
        }
    }

    // ── Iframe discovery and picker ───────────────────────────────────────────

    async function loadIframes(tabId, restoredSource) {
        try {
            const resp = await chrome.runtime.sendMessage({
                action: 'getIframesForTab',
                tabId
            });

            availableFrames = (resp?.success && resp.frames?.length > 0) ? resp.frames : [];

            if (availableFrames.length === 0) {
                // No iframes — keep source group hidden
                iframeSourceGroup.style.display = 'none';
                iframePickerGroup.style.display = 'none';
                return;
            }

            // Show the source selector
            iframeSourceGroup.style.display = 'block';
            populateIframePicker(availableFrames);

            // Apply the restored source value and toggle picker visibility
            iframeSourceSelect.value = restoredSource || 'main';
            onIframeSourceChange();

        } catch (e) {
            console.warn('[WCE] Could not load iframes:', e);
            iframeSourceGroup.style.display = 'none';
        }
    }

    function populateIframePicker(frames) {
        iframePickerList.innerHTML = '';

        if (frames.length === 0) {
            iframePickerList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:5px;">No iframes found.</div>';
            return;
        }

        frames.forEach(frame => {
            const label = document.createElement('label');
            // Indent by depth to visualise hierarchy
            const indent = (frame.depth - 1) * 14;
            label.style.cssText = `display:flex;align-items:flex-start;margin-bottom:3px;cursor:pointer;padding-left:${indent}px;`;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = JSON.stringify({ frameId: frame.frameId, label: frame.label, url: frame.url });
            cb.style.cssText = 'margin-right:6px;margin-top:2px;flex-shrink:0;';

            const textWrap = document.createElement('span');
            textWrap.style.cssText = 'display:flex;flex-direction:column;min-width:0;';

            const labelSpan = document.createElement('span');
            // Show only the last segment for readability, tooltip shows full path
            const segments = frame.label.split(' > ');
            const shortLabel = segments.length > 2
                ? `${'  '.repeat(segments.length - 2)}↳ ${segments[segments.length - 1]}`
                : frame.label;
            labelSpan.textContent = shortLabel;
            labelSpan.title = frame.label;
            labelSpan.style.cssText = 'font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

            const urlSpan = document.createElement('span');
            // Show domain only
            let displayUrl = frame.url || '';
            try { displayUrl = new URL(frame.url).hostname; } catch (_) {}
            urlSpan.textContent = displayUrl;
            urlSpan.style.cssText = 'font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

            textWrap.appendChild(labelSpan);
            textWrap.appendChild(urlSpan);
            label.appendChild(cb);
            label.appendChild(textWrap);
            iframePickerList.appendChild(label);
        });
    }

    function onIframeSourceChange() {
        const v = iframeSourceSelect.value;
        iframePickerGroup.style.display = (v === 'iframes' || v === 'both') ? 'block' : 'none';
    }

    // ── Include-prompt visibility ─────────────────────────────────────────────

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

    // ── Save current settings ─────────────────────────────────────────────────

    async function saveCurrentSettings() {
        updateIncludePromptVisibility();
        const settings = {
            selectedPromptId: promptSelect.value,
            selectedChatbotId: chatbotSelect.value,
            includePrompt: includePromptCheckbox.checked,
            openChatbot: openChatbotCheckbox.checked,
            extractionAlgorithm: parseInt(algorithmSelect.value) || 1,
            iframeSource: iframeSourceSelect.value || 'main'
        };
        await saveSettings(settings);
    }

    // ── Handle extraction ─────────────────────────────────────────────────────

    async function handleExtract() {
        const selectedPromptId = promptSelect.value;
        const selectedChatbotId = chatbotSelect.value;
        const includePrompt = includePromptCheckbox.checked && selectedPromptId !== 'none';
        const openChatbot = openChatbotCheckbox.checked;
        const selectedAlgorithm = parseInt(algorithmSelect.value) || 1;
        const iframeSource = iframeSourceSelect.value || 'main';

        // Collect selected tab IDs
        const selectedTabIds = Array.from(tabsList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => parseInt(cb.value));

        // Collect selected iframe frame targets (only relevant when iframeSource !== 'main')
        const selectedFrameTargets = (iframeSource !== 'main')
            ? Array.from(iframePickerList.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => JSON.parse(cb.value))
            : [];

        const allPrompts = await getAllPrompts();
        const allChatbots = await getAllChatbots();
        const prompt = allPrompts.find(p => p.id === selectedPromptId);
        const chatbot = allChatbots[selectedChatbotId];

        if (!chatbot) {
            showStatus('Please select a valid chatbot', 'error');
            return;
        }
        if (selectedTabIds.length === 0) {
            showStatus('Please select at least one tab to extract', 'error');
            return;
        }

        setLoading(true);
        showStatus('Extracting content...', 'info');

        try {
            const allTabs = await chrome.tabs.query({});
            const tabsToExtract = selectedTabIds
                .map(id => allTabs.find(t => t.id === id))
                .filter(Boolean);

            const isFirefox = navigator.userAgent.includes('Firefox');

            const extractPromises = tabsToExtract.map(async (tab) => {
                if (!tab.url ||
                    tab.url.startsWith('chrome://') ||
                    tab.url.startsWith('chrome-extension://') ||
                    tab.url.startsWith('about:') ||
                    tab.url.startsWith('moz-extension://')) {
                    console.log(`Skipping tab ${tab.url || 'unknown'} - unextractable`);
                    return null;
                }

                // Ensure content script is injected (Chrome only; Firefox uses pre-registered scripts)
                if (!isFirefox) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['content/extractor.js']
                        });
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (injectionError) {
                        console.log(`Script injection skipped for tab ${tab.id}:`, injectionError.message);
                    }
                }

                try {
                    let tabText = null;

                    if (iframeSource !== 'main') {
                        // Frame-targeted extraction via background
                        const response = await chrome.runtime.sendMessage({
                            action: 'extractFromFrames',
                            tabId: tab.id,
                            iframeSource,
                            // For multi-tab extraction use selected frames only for the current tab;
                            // for other tabs default to first iframe (empty = auto-first).
                            frameTargets: (tab.id === currentTabId) ? selectedFrameTargets : [],
                            characterLimit: chatbot.characterLimit || 20000,
                            algorithm: selectedAlgorithm
                        });
                        if (response?.success) tabText = response.content;
                    } else {
                        // Standard main-frame extraction — explicitly target frameId 0.
                        // With all_frames:true, omitting frameId would allow any frame
                        // (including iframes) to respond first, causing random content leakage.
                        const response = await chrome.tabs.sendMessage(tab.id, {
                            action: 'extractContent',
                            characterLimit: chatbot.characterLimit || 20000,
                            promptLength: includePrompt && prompt ? prompt.content.length : 0,
                            algorithm: selectedAlgorithm
                        }, { frameId: 0 });
                        if (response?.success) tabText = response.content;
                    }

                    if (tabText !== null) {
                        const tabTitle = tab.title || 'Untitled Tab';
                        if (tabsToExtract.length > 1) {
                            tabText = `=== Webpage: ${tabTitle} ===\nURL: ${tab.url}\n\n${tabText}\n`;
                        }
                        return tabText;
                    }

                    console.log(`Extraction failed for tab ${tab.id}`);
                    return null;
                } catch (err) {
                    console.log(`Failed to message tab ${tab.id}:`, err.message);
                    return null;
                }
            });

            const allContents = await Promise.all(extractPromises);
            const validContents = allContents.filter(c => c !== null);

            if (validContents.length === 0) {
                throw new Error('Failed to extract any content.');
            }

            let finalText = validContents.join('\n\n');

            if (includePrompt && prompt?.content) {
                finalText = `${prompt.content}\n\n---\n\n${tabsToExtract.length > 1 ? 'Combined Page Contents:' : 'Page Content:'}\n${finalText}`;
            }

            // Hard cap in case combined content exceeds limit
            if (finalText.length > (chatbot.characterLimit || 20000)) {
                finalText = finalText.substring(0, (chatbot.characterLimit || 20000) - 100) + '\n...[Text Truncated]';
            }

            await navigator.clipboard.writeText(finalText);

            const charCount = finalText.length.toLocaleString();
            showStatus(`Copied! (${charCount} chars)`, 'success');

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

    // ── Utility helpers ───────────────────────────────────────────────────────

    function openOptions() {
        chrome.runtime.openOptionsPage();
    }

    function showStatus(message, type = 'info') {
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        if (type === 'success') {
            setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);
        }
    }

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
