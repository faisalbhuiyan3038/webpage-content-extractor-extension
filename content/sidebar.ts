// @ts-nocheck
/**
 * Webpage Content Extractor - Floating Chat Sidebar
 */

(function initSidebar() {
    // Avoid multiple injections
    if (document.getElementById('wce-ai-sidebar-container')) return;

    let settings = null;
    let chatbots = {};
    let preferredIds = [];
    let recentIds = [];

    let hideTimeout = null;
    let container = null;
    let isPanelOpen = false;

    // Elements
    let handleBtn = null;
    let sidebarPanel = null;
    let modalOverlay = null;

    // Fetch initial data
    chrome.runtime.sendMessage({ action: 'getSidebarData' }, (response) => {
        if (!response || !response.settings) return;
        
        settings = response.settings;
        chatbots = response.chatbots;
        preferredIds = response.preferredChatbots || [];
        recentIds = response.recentChatbots || [];

        if (settings.sidebarEnabled) {
            setupSidebar();
        }
    });

    // Listen for setting updates
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            chrome.runtime.sendMessage({ action: 'getSidebarData' }, (response) => {
                if (!response) return;
                const wasEnabled = settings ? settings.sidebarEnabled : false;
                
                settings = response.settings;
                chatbots = response.chatbots;
                preferredIds = response.preferredChatbots || [];
                recentIds = response.recentChatbots || [];

                if (settings.sidebarEnabled && !wasEnabled) {
                    setupSidebar();
                } else if (!settings.sidebarEnabled && container) {
                    container.remove();
                    container = null;
                } else if (settings.sidebarEnabled && container) {
                    updateSidebarUI();
                }
            });
        }
    });

    function getFaviconUrl(url) {
        try {
            const u = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
        } catch {
            return '';
        }
    }

    function setupSidebar() {
        if (container) return;

        container = document.createElement('div');
        container.id = 'wce-ai-sidebar-container';
        
        // Handle Button
        handleBtn = document.createElement('div');
        handleBtn.id = 'wce-handle-btn';
        handleBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>`;
        handleBtn.addEventListener('click', togglePanel);
        
        // Main Panel
        sidebarPanel = document.createElement('div');
        sidebarPanel.id = 'wce-sidebar-panel';

        container.appendChild(handleBtn);
        container.appendChild(sidebarPanel);
        document.body.appendChild(container);

        // Submenu
        createModal();

        updateSidebarUI();

        // Auto-show/hide logic
        setupAutoShowHide();
        
        // Close submenu when clicking outside container
        document.addEventListener('mousedown', (e) => {
            if (container && !container.contains(e.target) && modalOverlay && modalOverlay.classList.contains('wce-show')) {
                closeModal();
            }
        });
    }

    function updateSidebarUI() {
        if (!container) return;
        
        // Position
        container.className = settings.sidebarPosition === 'left' ? 'wce-left' : 'wce-right';
        if (settings.sidebarPosition === 'right') {
            handleBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>`;
        } else {
            handleBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>`;
        }

        // Render Panel Bots
        sidebarPanel.innerHTML = '';
        const renderedIds = new Set();

        const renderBot = (id) => {
            const bot = chatbots[id];
            if (!bot || renderedIds.has(id)) return;
            renderedIds.add(id);

            const btn = document.createElement('button');
            btn.className = 'wce-bot-btn';
            if (settings.sidebarShowNames) btn.classList.add('wce-show-name');
            btn.title = bot.name;
            const img = document.createElement('img');
            img.src = getFaviconUrl(bot.url);
            btn.appendChild(img);
            if (settings.sidebarShowNames) {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'wce-bot-name';
                nameSpan.textContent = bot.name;
                btn.appendChild(nameSpan);
            }
            btn.addEventListener('click', () => openChatbot(bot.id, bot.url));
            sidebarPanel.appendChild(btn);
        };

        // Preferred
        preferredIds.forEach(renderBot);
        
        // Divider
        if (preferredIds.length > 0 && recentIds.length > 0) {
            const div = document.createElement('div');
            div.className = 'wce-divider';
            sidebarPanel.appendChild(div);
        }

        // Recent
        recentIds.forEach(renderBot);

        // More Button
        const moreBtn = document.createElement('button');
        moreBtn.id = 'wce-more-btn';
        moreBtn.innerHTML = '⋮';
        moreBtn.title = 'More Chatbots';
        moreBtn.addEventListener('click', openModal);
        sidebarPanel.appendChild(moreBtn);

        // Only render bots into modal that aren't shown in panel
        updateModalList(renderedIds);
    }

    function togglePanel() {
        isPanelOpen = !isPanelOpen;
        if (isPanelOpen) {
            container.classList.add('wce-open');
            clearTimeout(hideTimeout);
            container.classList.remove('wce-hidden');
        } else {
            container.classList.remove('wce-open');
            resetHideTimeout();
        }
    }

    // Auto-show/hide logic
    function setupAutoShowHide() {
        const showHandle = () => {
            if (!container || isPanelOpen) return;
            container.classList.remove('wce-hidden');
            resetHideTimeout();
        };

        const hideHandle = () => {
            if (!container || isPanelOpen) return;
            container.classList.add('wce-hidden');
        };

        window.addEventListener('scroll', showHandle, { passive: true });
        
        container.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            container.classList.remove('wce-hidden');
        });
        
        container.addEventListener('mouseleave', () => {
            if (!isPanelOpen) {
                resetHideTimeout();
            }
        });

        resetHideTimeout();
    }

    function resetHideTimeout() {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            if (container && !isPanelOpen) {
                container.classList.add('wce-hidden');
            }
        }, 3000);
    }

    // Opens a chatbot in foreground (optionally can extract text, but per requirement it just opens it for quick chat)
    function openChatbot(id, url) {
        chrome.runtime.sendMessage({ action: 'updateRecentChatbots', chatbotId: id }, (res) => {
            if (res && res.recentChatbots) {
                recentIds = res.recentChatbots;
                updateSidebarUI();
            }
        });
        chrome.runtime.sendMessage({ action: 'openChatbotTab', url: url });
        togglePanel(); // close sidebar
    }

    // Modal UI -> now Submenu
    function createModal() {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'wce-submenu';
        
        modalOverlay.innerHTML = `
            <div class="wce-modal-header">
                <h3>Chatbots</h3>
                <button class="wce-modal-close">&times;</button>
            </div>
            <div class="wce-modal-body" id="wce-modal-list">
                <!-- list populated here -->
            </div>
            <div class="wce-quick-add">
                <button id="wce-btn-add-new" class="wce-qa-action-btn">+ Add New Chatbot</button>
                <button id="wce-btn-add-current" class="wce-qa-action-btn">+ Add Current Page</button>
                
                <div class="wce-qa-form" id="wce-qa-form">
                    <input type="text" id="wce-qa-name" placeholder="Name">
                    <input type="url" id="wce-qa-url" placeholder="URL">
                    <button id="wce-qa-btn" class="wce-qa-action-btn" style="background:#007aff;color:white;">Save</button>
                </div>
            </div>
        `;
        container.appendChild(modalOverlay);

        modalOverlay.querySelector('.wce-modal-close').addEventListener('click', closeModal);

        const formEl = modalOverlay.querySelector('#wce-qa-form');
        const nameInput = modalOverlay.querySelector('#wce-qa-name');
        const urlInput = modalOverlay.querySelector('#wce-qa-url');

        // Add New
        modalOverlay.querySelector('#wce-btn-add-new').addEventListener('click', () => {
            nameInput.value = '';
            urlInput.value = '';
            formEl.classList.toggle('wce-show');
            if (formEl.classList.contains('wce-show')) nameInput.focus();
        });

        // Add Current Page
        modalOverlay.querySelector('#wce-btn-add-current').addEventListener('click', () => {
            nameInput.value = document.title;
            urlInput.value = window.location.href;
            formEl.classList.add('wce-show');
            nameInput.focus();
        });

        // Save Bot
        modalOverlay.querySelector('#wce-qa-btn').addEventListener('click', () => {
            const name = nameInput.value.trim();
            const url = urlInput.value.trim();
            
            if (name && url) {
                try { new URL(url); } catch { return alert("Invalid URL"); }
                
                const chatbot = {
                    id: 'custom-' + Date.now(),
                    name: name,
                    url: url,
                    characterLimit: 40000
                };
                
                chrome.runtime.sendMessage({ action: 'addChatbot', chatbot: chatbot }, () => {
                    chatbots[chatbot.id] = chatbot;
                    nameInput.value = '';
                    urlInput.value = '';
                    formEl.classList.remove('wce-show');
                    updateModalList(new Set(preferredIds.concat(recentIds)));
                });
            }
        });
    }

    function updateModalList(excludeIdsSet) {
        if (!modalOverlay) return;
        const listEl = modalOverlay.querySelector('#wce-modal-list');
        listEl.innerHTML = '';
        
        let hasItems = false;
        Object.values(chatbots).forEach(bot => {
            if (!excludeIdsSet.has(bot.id)) {
                hasItems = true;
                const btn = document.createElement('button');
                btn.className = 'wce-modal-item';
                btn.innerHTML = `<img src="${getFaviconUrl(bot.url)}"><span>${bot.name}</span>`;
                btn.addEventListener('click', () => {
                    openChatbot(bot.id, bot.url);
                    closeModal();
                });
                listEl.appendChild(btn);
            }
        });

        if (!hasItems) {
            listEl.innerHTML = `<div style="padding: 16px; text-align: center; color: #888; font-size: 13px;">No other chatbots available.</div>`;
        }
    }

    function openModal() {
        modalOverlay.classList.add('wce-show');
    }

    function closeModal() {
        modalOverlay.classList.remove('wce-show');
    }

})();
