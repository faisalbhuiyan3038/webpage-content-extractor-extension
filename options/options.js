// Options Page JavaScript
import {
    DEFAULT_CHATBOTS,
    DEFAULT_PROMPTS,
    DEFAULT_SETTINGS,
    ALGORITHMS,
    getSettings,
    saveSettings,
    getCustomPrompts,
    saveCustomPrompts,
    getCustomChatbots,
    saveCustomChatbots,
    exportData,
    importData,
    getPreferredChatbots,
    savePreferredChatbots
} from '../shared/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // General
    const defaultAlgorithmSelect = document.getElementById('default-algorithm-select');
    const sidebarEnabledCheckbox = document.getElementById('sidebar-enabled');
    const sidebarShowNamesCheckbox = document.getElementById('sidebar-show-names');
    const sidebarPositionSelect = document.getElementById('sidebar-position');
    const injectorPositionSelect = document.getElementById('injector-position');

    // Prompts
    const addPromptBtn = document.getElementById('add-prompt-btn');
    const defaultPromptsList = document.getElementById('default-prompts-list');
    const customPromptsList = document.getElementById('custom-prompts-list');
    const noCustomPrompts = document.getElementById('no-custom-prompts');

    // Chatbots
    const addChatbotBtn = document.getElementById('add-chatbot-btn');
    const defaultChatbotsList = document.getElementById('default-chatbots-list');
    const customChatbotsList = document.getElementById('custom-chatbots-list');
    const noCustomChatbots = document.getElementById('no-custom-chatbots');

    // Shortcuts
    const openShortcutsBtn = document.getElementById('open-shortcuts-btn');

    // Backup
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const resetBtn = document.getElementById('reset-btn');

    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');
    const modalClose = document.getElementById('modal-close');

    // Toast
    const toast = document.getElementById('toast');

    // Current editing state
    let currentEditType = null;
    let currentEditId = null;

    // Initialize
    await loadAllData();

    // Tab Navigation
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.querySelector(`[data-content="${tabId}"]`).classList.add('active');
        });
    });

    // Event Listeners
    addPromptBtn.addEventListener('click', () => showPromptModal());
    addChatbotBtn.addEventListener('click', () => showChatbotModal());

    openShortcutsBtn.addEventListener('click', openShortcutsPage);

    exportBtn.addEventListener('click', handleExport);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', handleImport);
    resetBtn.addEventListener('click', handleReset);

    modalCancel.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    modalSave.addEventListener('click', handleModalSave);

    // Load all data and render
    async function loadAllData() {
        const settings = await getSettings();
        renderAlgorithms(settings.extractionAlgorithm || 1);
        
        sidebarEnabledCheckbox.checked = settings.sidebarEnabled !== false;
        sidebarShowNamesCheckbox.checked = settings.sidebarShowNames === true;
        sidebarPositionSelect.value = settings.sidebarPosition === 'left' ? 'left' : 'right';
        if (injectorPositionSelect) {
            injectorPositionSelect.value = settings.injectorPosition || 'inside';
        }
        
        await renderDefaultPrompts();
        await renderCustomPrompts();
        await renderDefaultChatbots();
        await renderCustomChatbots();
    }

    // Render Algorithms
    function renderAlgorithms(selectedAlgoId) {
        defaultAlgorithmSelect.innerHTML = '';
        Object.values(ALGORITHMS).forEach(algo => {
            const option = document.createElement('option');
            option.value = algo.id;
            option.textContent = algo.name;
            if (algo.id == selectedAlgoId) {
                option.selected = true;
            }
            defaultAlgorithmSelect.appendChild(option);
        });
        
        defaultAlgorithmSelect.addEventListener('change', async () => {
            const settings = await getSettings();
            settings.extractionAlgorithm = parseInt(defaultAlgorithmSelect.value);
            await saveSettings(settings);
            showToast('Default algorithm saved', 'success');
        });

        sidebarEnabledCheckbox.addEventListener('change', async () => {
            const settings = await getSettings();
            settings.sidebarEnabled = sidebarEnabledCheckbox.checked;
            await saveSettings(settings);
        });

        sidebarShowNamesCheckbox.addEventListener('change', async () => {
            const settings = await getSettings();
            settings.sidebarShowNames = sidebarShowNamesCheckbox.checked;
            await saveSettings(settings);
        });

        sidebarPositionSelect.addEventListener('change', async () => {
            const settings = await getSettings();
            settings.sidebarPosition = sidebarPositionSelect.value;
            await saveSettings(settings);
        });

        if (injectorPositionSelect) {
            injectorPositionSelect.addEventListener('change', async () => {
                const settings = await getSettings();
                settings.injectorPosition = injectorPositionSelect.value;
                await saveSettings(settings);
                showToast('Injector position saved', 'success');
            });
        }
    }

    // Render default prompts
    async function renderDefaultPrompts() {
        defaultPromptsList.innerHTML = '';

        DEFAULT_PROMPTS.forEach(prompt => {
            const item = createListItem({
                name: prompt.name,
                subtitle: prompt.content ? prompt.content.substring(0, 80) + '...' : '(No prompt text)',
                isDefault: true
            });
            defaultPromptsList.appendChild(item);
        });
    }

    // Render custom prompts
    async function renderCustomPrompts() {
        const customPrompts = await getCustomPrompts();
        customPromptsList.innerHTML = '';

        if (customPrompts.length === 0) {
            noCustomPrompts.style.display = 'block';
            return;
        }

        noCustomPrompts.style.display = 'none';

        customPrompts.forEach((prompt, index) => {
            const item = createListItem({
                name: prompt.name,
                subtitle: prompt.content.substring(0, 80) + '...',
                isDefault: false,
                onEdit: () => showPromptModal(prompt, index),
                onDelete: () => deletePrompt(index)
            });
            customPromptsList.appendChild(item);
        });
    }

    // Render default chatbots
    async function renderDefaultChatbots() {
        defaultChatbotsList.innerHTML = '';
        const preferred = await getPreferredChatbots();
        const customChatbots = await getCustomChatbots();

        Object.values(DEFAULT_CHATBOTS).forEach(defaultBot => {
            const isModified = !!customChatbots[defaultBot.id];
            const bot = customChatbots[defaultBot.id] || defaultBot;
            const isPreferred = preferred.includes(bot.id);
            const item = createListItem({
                name: bot.name,
                subtitle: bot.url,
                isDefault: true,
                badge: `${(bot.characterLimit / 1000).toFixed(0)}k chars`,
                isPreferred: isPreferred,
                onTogglePreferred: () => togglePreferredChatbot(bot.id),
                onEdit: () => showChatbotModal(bot),
                onReset: isModified ? () => resetDefaultChatbot(bot.id) : null
            });
            defaultChatbotsList.appendChild(item);
        });
    }

    // Render custom chatbots
    async function renderCustomChatbots() {
        const customChatbots = await getCustomChatbots();
        customChatbotsList.innerHTML = '';

        if (Object.keys(customChatbots).length === 0) {
            noCustomChatbots.style.display = 'block';
            return;
        }

        noCustomChatbots.style.display = 'none';

        const preferred = await getPreferredChatbots();

        Object.values(customChatbots).forEach(bot => {
            if (DEFAULT_CHATBOTS[bot.id]) return; // Skip if it's a modified default bot
            const isPreferred = preferred.includes(bot.id);
            const item = createListItem({
                name: bot.name,
                subtitle: bot.url,
                isDefault: false,
                badge: `${(bot.characterLimit / 1000).toFixed(0)}k chars`,
                isPreferred: isPreferred,
                onTogglePreferred: () => togglePreferredChatbot(bot.id),
                onEdit: () => showChatbotModal(bot),
                onDelete: () => deleteChatbot(bot.id)
            });
            customChatbotsList.appendChild(item);
        });
    }

    async function togglePreferredChatbot(botId) {
        let preferred = await getPreferredChatbots();
        if (preferred.includes(botId)) {
            preferred = preferred.filter(id => id !== botId);
        } else {
            preferred.push(botId);
        }
        await savePreferredChatbots(preferred);
        await renderDefaultChatbots();
        await renderCustomChatbots();
    }

    // Create list item element
    function createListItem({ name, subtitle, isDefault, badge, onEdit, onDelete, onReset, isPreferred, onTogglePreferred }) {
        const item = document.createElement('div');
        item.className = `list-item ${isDefault ? 'default' : ''}`;

        let html = `
            <div class="item-content">
                <div class="item-name">${escapeHtml(name)}</div>
                <div class="item-subtitle">${escapeHtml(subtitle)}</div>
            </div>
        `;

        if (badge) {
            html += `<span class="item-badge">${badge}</span>`;
        }

        if (isDefault) {
            html += '<span class="item-badge">Default</span>';
            if (onEdit) {
                html += `
                    <div class="item-actions">
                        <button class="btn-icon edit-btn" title="Edit">✏️</button>
                        ${onReset ? '<button class="btn-icon reset-btn" title="Reset to Default">🔄</button>' : ''}
                    </div>
                `;
            }
        } else {
            html += `
                <div class="item-actions">
                    <button class="btn-icon edit-btn" title="Edit">✏️</button>
                    <button class="btn-icon danger delete-btn" title="Delete">🗑️</button>
                </div>
            `;
        }

        item.innerHTML = html;

        if (onTogglePreferred) {
            const prefBtn = document.createElement('button');
            prefBtn.className = 'btn-icon pref-btn';
            prefBtn.title = isPreferred ? 'Remove from Sidebar' : 'Add to Sidebar';
            prefBtn.innerHTML = isPreferred ? '⭐' : '☆';
            prefBtn.style.marginRight = '8px';
            prefBtn.addEventListener('click', onTogglePreferred);
            
            // Insert before other actions
            const actionsDiv = item.querySelector('.item-actions') || item;
            if (actionsDiv === item) {
                const newActions = document.createElement('div');
                newActions.className = 'item-actions';
                newActions.appendChild(prefBtn);
                item.appendChild(newActions);
            } else {
                actionsDiv.insertBefore(prefBtn, actionsDiv.firstChild);
            }
        }

        if (isDefault && onEdit) {
            item.querySelector('.edit-btn').addEventListener('click', onEdit);
            if (onReset) {
                item.querySelector('.reset-btn').addEventListener('click', onReset);
            }
        }
        if (!isDefault && onEdit && onDelete) {
            item.querySelector('.edit-btn').addEventListener('click', onEdit);
            item.querySelector('.delete-btn').addEventListener('click', onDelete);
        }

        return item;
    }

    // Show prompt modal
    function showPromptModal(prompt = null, index = -1) {
        currentEditType = 'prompt';
        currentEditId = index;

        modalTitle.textContent = prompt ? 'Edit Prompt' : 'Add Prompt';
        modalBody.innerHTML = `
            <div class="form-group">
                <label for="prompt-name">Prompt Name</label>
                <input type="text" id="prompt-name" class="form-input" 
                    placeholder="e.g., Explain Like I'm 5" 
                    value="${prompt ? escapeHtml(prompt.name) : ''}">
            </div>
            <div class="form-group">
                <label for="prompt-content">Prompt Content</label>
                <textarea id="prompt-content" class="form-textarea" 
                    placeholder="Enter your prompt instructions...">${prompt ? escapeHtml(prompt.content) : ''}</textarea>
                <p class="form-help">This text will be prepended to the extracted content when sent to the chatbot.</p>
            </div>
        `;

        modalOverlay.classList.add('show');
        document.getElementById('prompt-name').focus();
    }

    // Show chatbot modal
    function showChatbotModal(bot = null) {
        currentEditType = 'chatbot';
        currentEditId = bot ? bot.id : null;

        modalTitle.textContent = bot ? 'Edit Chatbot' : 'Add Chatbot';
        modalBody.innerHTML = `
            <div class="form-group">
                <label for="chatbot-name">Chatbot Name</label>
                <input type="text" id="chatbot-name" class="form-input" 
                    placeholder="e.g., My Custom AI" 
                    value="${bot ? escapeHtml(bot.name) : ''}">
            </div>
            <div class="form-group">
                <label for="chatbot-url">Chat URL</label>
                <input type="url" id="chatbot-url" class="form-input" 
                    placeholder="https://example.com/chat" 
                    value="${bot ? escapeHtml(bot.url) : ''}">
                <p class="form-help">The URL where you can paste and chat with the AI.</p>
            </div>
            <div class="form-group">
                <label for="chatbot-limit">Character Limit</label>
                <input type="number" id="chatbot-limit" class="form-input" 
                    placeholder="40000" 
                    value="${bot ? bot.characterLimit : '40000'}">
                <p class="form-help">Maximum characters the chatbot accepts. Default is 40,000.</p>
            </div>
            <div class="form-group">
                <label for="chatbot-selector">Prompt Box Selector (Optional)</label>
                <input type="text" id="chatbot-selector" class="form-input" 
                    placeholder="e.g. textarea#prompt">
                <p class="form-help">CSS selector for the text input box on the chatbot's website where text will be sent. Built-in chatbots handle this automatically.</p>
            </div>
            <div class="form-group">
                <label for="chatbot-injector-selector">Button Injector Selector (Optional)</label>
                <input type="text" id="chatbot-injector-selector" class="form-input" 
                    placeholder="e.g. form">
                <p class="form-help">CSS selector for the HTML element to attach the UI buttons to. If left blank, it defaults to the Prompt Box Selector.</p>
            </div>
        `;

        modalOverlay.classList.add('show');
        document.getElementById('chatbot-name').focus();

        // Fill form if editing
        if (bot) {
            document.getElementById('chatbot-name').value = bot.name || '';
            document.getElementById('chatbot-url').value = bot.url || '';
            document.getElementById('chatbot-limit').value = bot.characterLimit || 40000;
            document.getElementById('chatbot-selector').value = bot.promptInputSelector || '';
            document.getElementById('chatbot-injector-selector').value = bot.buttonInjectorSelector || '';
        } else {
            document.getElementById('chatbot-name').value = '';
            document.getElementById('chatbot-url').value = '';
            document.getElementById('chatbot-limit').value = 40000;
            document.getElementById('chatbot-selector').value = '';
            document.getElementById('chatbot-injector-selector').value = '';
        }
    }

    // Close modal
    function closeModal() {
        modalOverlay.classList.remove('show');
        currentEditType = null;
        currentEditId = null;
    }

    // Handle modal save
    async function handleModalSave() {
        if (currentEditType === 'prompt') {
            await savePrompt();
        } else if (currentEditType === 'chatbot') {
            await saveChatbot();
        }
    }

    // Save prompt
    async function savePrompt() {
        const name = document.getElementById('prompt-name').value.trim();
        const content = document.getElementById('prompt-content').value.trim();

        if (!name) {
            showToast('Please enter a prompt name', 'error');
            return;
        }

        const prompts = await getCustomPrompts();
        const newPrompt = {
            id: currentEditId >= 0 ? prompts[currentEditId].id : `custom-${Date.now()}`,
            name,
            content
        };

        if (currentEditId >= 0) {
            prompts[currentEditId] = newPrompt;
        } else {
            prompts.push(newPrompt);
        }

        await saveCustomPrompts(prompts);
        await renderCustomPrompts();
        showToast(currentEditId !== null && currentEditId >= 0 ? 'Prompt updated!' : 'Prompt added!', 'success');
        closeModal();
    }

    // Delete prompt
    async function deletePrompt(index) {
        if (!confirm('Are you sure you want to delete this prompt?')) return;

        const prompts = await getCustomPrompts();
        prompts.splice(index, 1);
        await saveCustomPrompts(prompts);
        await renderCustomPrompts();
        showToast('Prompt deleted', 'success');
    }

    // Save chatbot
    async function saveChatbot() {
        const name = document.getElementById('chatbot-name').value.trim();
        const url = document.getElementById('chatbot-url').value.trim();
        const limit = parseInt(document.getElementById('chatbot-limit').value) || 40000;
        const selector = document.getElementById('chatbot-selector').value.trim();
        const injectorSelector = document.getElementById('chatbot-injector-selector').value.trim();

        if (!name || !url) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        try {
            new URL(url);
        } catch {
            showToast('Please enter a valid URL', 'error');
            return;
        }

        const chatbots = await getCustomChatbots();
        const botId = currentEditId || `custom-${Date.now()}`;

        chatbots[botId] = {
            id: botId,
            name,
            url,
            characterLimit: limit
        };

        if (selector) {
            chatbots[botId].promptInputSelector = selector;
        }
        if (injectorSelector) {
            chatbots[botId].buttonInjectorSelector = injectorSelector;
        }

        await saveCustomChatbots(chatbots);
        await renderCustomChatbots();
        await renderDefaultChatbots();
        
        const wasUpdate = currentEditId !== null;
        showToast(wasUpdate ? 'Chatbot updated!' : 'Chatbot added!', 'success');
        closeModal();
    }

    // Delete chatbot
    async function deleteChatbot(id) {
        if (!confirm('Are you sure you want to delete this chatbot?')) return;

        const chatbots = await getCustomChatbots();
        delete chatbots[id];
        await saveCustomChatbots(chatbots);
        await renderCustomChatbots();
        showToast('Chatbot deleted', 'success');
    }

    // Reset default chatbot modifications
    async function resetDefaultChatbot(id) {
        if (!confirm('Reset this built-in chatbot to its original defaults?')) return;

        const chatbots = await getCustomChatbots();
        delete chatbots[id];
        await saveCustomChatbots(chatbots);
        await renderDefaultChatbots();
        showToast('Chatbot reset to defaults', 'success');
    }

    // Open browser shortcuts page
    function openShortcutsPage() {
        // Detect browser and open appropriate page
        const isFirefox = navigator.userAgent.includes('Firefox');

        if (isFirefox) {
            chrome.tabs.create({ url: 'about:addons' });
        } else {
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        }
    }

    // Export data
    async function handleExport() {
        try {
            const data = await exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `content-extractor-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('Settings exported successfully!', 'success');
        } catch (error) {
            showToast('Export failed: ' + error.message, 'error');
        }
    }

    // Import data
    async function handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.version) {
                throw new Error('Invalid backup file format');
            }

            await importData(data);
            await loadAllData();

            showToast('Settings imported successfully!', 'success');
        } catch (error) {
            showToast('Import failed: ' + error.message, 'error');
        }

        // Reset file input
        e.target.value = '';
    }

    // Reset all settings
    async function handleReset() {
        if (!confirm('Are you sure you want to reset all settings? This will delete all custom prompts and chatbots.')) {
            return;
        }

        if (!confirm('This action cannot be undone. Are you absolutely sure?')) {
            return;
        }

        await chrome.storage.sync.clear();
        await chrome.storage.sync.set({
            initialized: true,
            settings: DEFAULT_SETTINGS,
            customChatbots: {},
            customPrompts: []
        });

        await loadAllData();
        showToast('All settings have been reset', 'success');
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
