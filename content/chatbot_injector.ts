/// <reference types="chrome"/>
import { getCustomPrompts, DEFAULT_PROMPTS, getSettings, getCustomChatbots, DEFAULT_CHATBOTS } from '../shared/storage.js';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TabInfo { id: number; title: string; url: string; favicon: string; }
interface PromptInfo { id: string; name: string; content: string; isDefault?: boolean; }

// ─── Popover Manager ─────────────────────────────────────────────────────────
// Renders popovers as fixed-position on document.body so they're never clipped.

class Popover {
    private el: HTMLDivElement;
    private trigger: HTMLElement;
    private resizeObs: ResizeObserver | null = null;
    private scrollListeners: Array<[EventTarget, EventListener]> = [];

    constructor(trigger: HTMLElement, content: HTMLElement) {
        this.trigger = trigger;
        this.el = document.createElement('div');
        this.el.className = 'wce-popover';
        this.el.setAttribute('data-wce', 'true');
        this.el.appendChild(content);
        document.body.appendChild(this.el);

        // Close when clicking outside
        const outsideClick = (e: MouseEvent) => {
            if (!this.el.contains(e.target as Node) && e.target !== trigger) {
                this.close();
            }
        };
        document.addEventListener('mousedown', outsideClick, true);

        // Position
        this.reposition();

        // Reposition on scroll / resize
        const repos = () => this.reposition();
        window.addEventListener('resize', repos);
        // Walk up parents and listen to scroll
        let el: HTMLElement | null = trigger.parentElement;
        while (el) {
            el.addEventListener('scroll', repos, { passive: true });
            this.scrollListeners.push([el, repos as EventListener]);
            el = el.parentElement;
        }
        window.addEventListener('scroll', repos, { passive: true });
        this.scrollListeners.push([window, repos as EventListener]);

        this.resizeObs = new ResizeObserver(() => this.reposition());
        this.resizeObs.observe(this.el);

        // Store cleanup ref
        (this.el as any).__outsideClick = outsideClick;
        (this.el as any).__reposListener = repos;
    }

    reposition() {
        const rect = this.trigger.getBoundingClientRect();
        const pop = this.el;

        // Reset so we can measure
        pop.style.visibility = 'hidden';
        pop.style.top = '0';
        pop.style.left = '0';

        const popH = pop.offsetHeight;
        const popW = pop.offsetWidth;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 6;

        // Prefer opening upward
        let top = rect.top - popH - margin;
        if (top < margin) {
            top = rect.bottom + margin; // flip down
        }

        // Right-align to trigger, but clamp to viewport
        let left = rect.right - popW;
        if (left < margin) left = margin;
        if (left + popW > vw - margin) left = vw - popW - margin;

        pop.style.top = `${top}px`;
        pop.style.left = `${left}px`;
        pop.style.visibility = 'visible';
    }

    close() {
        const repos = (this.el as any).__reposListener as EventListener;
        const outsideClick = (this.el as any).__outsideClick as EventListener;
        window.removeEventListener('resize', repos);
        window.removeEventListener('scroll', repos);
        document.removeEventListener('mousedown', outsideClick, true);
        this.scrollListeners.forEach(([target, fn]) => (target as HTMLElement).removeEventListener('scroll', fn));
        this.resizeObs?.disconnect();
        this.el.remove();
    }
}

// ─── PromptInjector ──────────────────────────────────────────────────────────

class PromptInjector {
    private position: 'inside' | 'sibling' = 'inside';
    private container: HTMLDivElement | null = null;
    private targetInput: HTMLElement | null = null;
    private buttonParent: HTMLElement | null = null;
    private targetSelector: string = '';
    private buttonSelector: string = '';
    private openTabs: TabInfo[] = [];
    private selectedTabIds: Set<number> = new Set();
    private allPrompts: PromptInfo[] = [];
    private activePopover: Popover | null = null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async init() {
        const settings = await getSettings();
        this.position = (settings as any).injectorPosition || 'inside';

        const customBots = await getCustomChatbots();
        const allBots: Record<string, any> = { ...DEFAULT_CHATBOTS, ...customBots };

        const currentUrl = window.location.href;
        console.log(`[WCE Injector] Checking URL: ${currentUrl}`);

        let matchedBot: any = null;
        for (const key of Object.keys(allBots)) {
            const bot = allBots[key];
            try {
                if (currentUrl.startsWith(bot.url) || currentUrl.includes(new URL(bot.url).hostname)) {
                    matchedBot = bot;
                    break;
                }
            } catch { /* ignore invalid URL */ }
        }

        if (!matchedBot || !matchedBot.promptInputSelector) {
            console.log(`[WCE Injector] No matching bot or selector found for this URL.`);
            return;
        }

        console.log(`[WCE Injector] Matched: ${matchedBot.name}`);
        this.targetSelector = matchedBot.promptInputSelector;
        this.buttonSelector = matchedBot.buttonInjectorSelector || matchedBot.promptInputSelector;

        const customPrompts = await getCustomPrompts();
        this.allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];

        this.startObserver();
    }

    private startObserver() {
        const checkForInput = () => {
            const input = document.querySelector(this.targetSelector) as HTMLElement | null;
            const btnTarget = document.querySelector(this.buttonSelector) as HTMLElement | null;
            const isAttached = this.container && document.body.contains(this.container);

            if (input && btnTarget && (!isAttached || this.targetInput !== input || this.buttonParent !== btnTarget)) {
                if (this.container) this.container.remove();
                this.targetInput = input;
                this.buttonParent = btnTarget;
                this.injectUI();
            } else if ((!input || !btnTarget) && this.container) {
                this.container.remove();
                this.container = null;
                this.targetInput = null;
                this.buttonParent = null;
            }
        };

        setInterval(checkForInput, 1000);
        checkForInput();
    }

    // ── UI Injection ──────────────────────────────────────────────────────────

    private injectUI() {
        if (!this.targetInput || !this.buttonParent) return;

        // Container
        this.container = document.createElement('div');
        this.container.className = `wce-injector-container wce-${this.position}`;
        this.container.setAttribute('data-wce', 'true');

        // Prompt button
        const promptBtn = this.makeIconButton('prompt', this.promptIcon(), 'Insert Prompt');
        promptBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activePopover) { this.activePopover.close(); this.activePopover = null; return; }
            this.activePopover = this.openPromptPopover(promptBtn);
        });

        // Tabs button
        const tabsBtn = this.makeIconButton('tabs', this.tabsIcon(), 'Insert Tab Context');
        tabsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (this.activePopover) { this.activePopover.close(); this.activePopover = null; return; }
            await this.fetchOpenTabs();
            this.activePopover = this.openTabsPopover(tabsBtn);
        });

        this.container.appendChild(promptBtn);
        this.container.appendChild(tabsBtn);

        // Mount
        if (this.position === 'inside') {
            const parent = (this.buttonSelector === this.targetSelector)
                ? this.buttonParent.parentElement
                : this.buttonParent;
            if (parent) {
                if (getComputedStyle(parent).position === 'static') {
                    parent.style.position = 'relative';
                }
                parent.appendChild(this.container);
            }
        } else {
            if (this.buttonParent.parentElement) {
                this.buttonParent.parentElement.insertBefore(this.container, this.buttonParent);
            }
        }
    }

    // ── Popovers ─────────────────────────────────────────────────────────────

    private openPromptPopover(trigger: HTMLElement): Popover {
        const panel = document.createElement('div');
        panel.className = 'wce-popover-inner';

        const header = this.makePopoverHeader('Choose a Prompt');
        const list = document.createElement('div');
        list.className = 'wce-pop-list';

        let selectedPromptId: string | null = this.allPrompts[0]?.id ?? null;

        this.allPrompts.forEach((prompt) => {
            const item = document.createElement('div');
            item.className = 'wce-pop-item' + (prompt.id === selectedPromptId ? ' wce-pop-selected' : '');
            item.setAttribute('data-id', prompt.id);
            item.title = prompt.content || '(No content)';

            const radio = document.createElement('span');
            radio.className = 'wce-pop-radio';
            radio.innerHTML = prompt.id === selectedPromptId ? this.radioOnIcon() : this.radioOffIcon();

            const label = document.createElement('span');
            label.className = 'wce-pop-label';
            label.textContent = prompt.name;

            item.appendChild(radio);
            item.appendChild(label);

            item.addEventListener('click', () => {
                selectedPromptId = prompt.id;
                list.querySelectorAll('.wce-pop-item').forEach(el => {
                    el.classList.remove('wce-pop-selected');
                    el.querySelector('.wce-pop-radio')!.innerHTML = this.radioOffIcon();
                });
                item.classList.add('wce-pop-selected');
                radio.innerHTML = this.radioOnIcon();
            });

            list.appendChild(item);
        });

        const footer = this.makePopoverFooter('Insert Prompt', async () => {
            footerBtn.disabled = true;
            footerBtn.textContent = 'Inserting…';
            try {
                const promptObj = this.allPrompts.find(p => p.id === selectedPromptId);
                if (promptObj && promptObj.content) {
                    this.appendToTarget(promptObj.content);
                }
            } finally {
                footerBtn.disabled = false;
                footerBtn.textContent = 'Insert Prompt';
                pop.close();
                this.activePopover = null;
            }
        });
        const footerBtn = footer.querySelector('button')!;

        panel.appendChild(header);
        panel.appendChild(list);
        panel.appendChild(footer);

        const pop = new Popover(trigger, panel);
        return pop;
    }

    private openTabsPopover(trigger: HTMLElement): Popover {
        const panel = document.createElement('div');
        panel.className = 'wce-popover-inner';

        const header = this.makePopoverHeader('Select Tabs to Extract');
        const list = document.createElement('div');
        list.className = 'wce-pop-list';

        if (this.openTabs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wce-pop-empty';
            empty.textContent = 'No other open tabs found.';
            list.appendChild(empty);
        } else {
            this.openTabs.forEach(tab => {
                const item = document.createElement('div');
                item.className = 'wce-pop-item' + (this.selectedTabIds.has(tab.id) ? ' wce-pop-selected' : '');
                item.setAttribute('data-id', String(tab.id));

                const checkbox = document.createElement('span');
                checkbox.className = 'wce-pop-checkbox';
                checkbox.innerHTML = this.selectedTabIds.has(tab.id) ? this.checkOnIcon() : this.checkOffIcon();

                const favicon = document.createElement('img');
                favicon.className = 'wce-pop-favicon';
                favicon.src = tab.favicon || '';
                favicon.onerror = () => { favicon.style.display = 'none'; };

                const label = document.createElement('span');
                label.className = 'wce-pop-label';
                label.textContent = tab.title;
                label.title = tab.title;

                item.appendChild(checkbox);
                item.appendChild(favicon);
                item.appendChild(label);

                item.addEventListener('click', () => {
                    if (this.selectedTabIds.has(tab.id)) {
                        this.selectedTabIds.delete(tab.id);
                        item.classList.remove('wce-pop-selected');
                        checkbox.innerHTML = this.checkOffIcon();
                    } else {
                        this.selectedTabIds.add(tab.id);
                        item.classList.add('wce-pop-selected');
                        checkbox.innerHTML = this.checkOnIcon();
                    }
                });

                list.appendChild(item);
            });
        }

        const footer = this.makePopoverFooter('Extract & Insert', async () => {
            if (this.selectedTabIds.size === 0) {
                footerBtn.textContent = 'Select a tab first!';
                setTimeout(() => { footerBtn.textContent = 'Extract & Insert'; }, 1800);
                return;
            }
            footerBtn.disabled = true;
            footerBtn.textContent = 'Extracting…';
            try {
                const settings = await getSettings();
                const response = await chrome.runtime.sendMessage({
                    action: 'extractFromTabs',
                    tabIds: Array.from(this.selectedTabIds),
                    characterLimit: 40000,
                    algorithm: (settings as any).extractionAlgorithm || 1
                });
                if (response && response.success) {
                    this.appendToTarget(response.content);
                    pop.close();
                    this.activePopover = null;
                    this.selectedTabIds.clear();
                } else {
                    footerBtn.textContent = 'Extraction failed';
                    setTimeout(() => { footerBtn.textContent = 'Extract & Insert'; footerBtn.disabled = false; }, 2000);
                }
            } catch (e) {
                console.error(e);
                footerBtn.textContent = 'Error occurred';
                setTimeout(() => { footerBtn.textContent = 'Extract & Insert'; footerBtn.disabled = false; }, 2000);
            }
        });
        const footerBtn = footer.querySelector('button')!;

        panel.appendChild(header);
        panel.appendChild(list);
        panel.appendChild(footer);

        const pop = new Popover(trigger, panel);
        return pop;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private makeIconButton(type: string, svgInner: string, title: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = `wce-icon-btn wce-icon-btn--${type}`;
        btn.title = title;
        btn.setAttribute('data-wce', 'true');
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svgInner}</svg>`;
        return btn;
    }

    private makePopoverHeader(text: string): HTMLDivElement {
        const h = document.createElement('div');
        h.className = 'wce-pop-header';
        h.textContent = text;
        return h;
    }

    private makePopoverFooter(label: string, onClick: () => void): HTMLDivElement {
        const footer = document.createElement('div');
        footer.className = 'wce-pop-footer';
        const btn = document.createElement('button');
        btn.className = 'wce-pop-insert-btn';
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        footer.appendChild(btn);
        return footer;
    }

    private async fetchOpenTabs() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getOpenTabs' });
            if (response && response.success) {
                this.openTabs = response.tabs;
            }
        } catch (e) {
            this.openTabs = [];
        }
    }

    /** Appends text to the active chatbot input without overwriting existing content */
    private appendToTarget(text: string) {
        if (!this.targetInput) return;

        if (this.targetInput instanceof HTMLTextAreaElement || this.targetInput instanceof HTMLInputElement) {
            const el = this.targetInput;
            const existing = el.value;
            const separator = existing.length > 0 ? '\n\n' : '';
            const newVal = existing + separator + text;
            el.value = newVal;
            el.selectionStart = el.selectionEnd = newVal.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (this.targetInput.isContentEditable) {
            this.targetInput.focus();
            // Place cursor at end
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(this.targetInput);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            const existing = this.targetInput.textContent || '';
            const separator = existing.length > 0 ? '\n\n' : '';
            document.execCommand('insertText', false, separator + text);
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            const existing = this.targetInput.innerText || '';
            const separator = existing.length > 0 ? '\n\n' : '';
            this.targetInput.innerText = existing + separator + text;
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.targetInput.focus();
    }

    // ── SVG Icons ─────────────────────────────────────────────────────────────

    private promptIcon(): string {
        // Document/prompt icon
        return `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6zm2-9h4v2H8v-2zm0 4h8v2H8v-2z"/>`;
    }

    private tabsIcon(): string {
        // Browser/tabs icon
        return `<path d="M20 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 2v3H4V5h16zm0 14H4V10h16v9z"/>`;
    }

    private radioOnIcon(): string {
        return `<svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>`;
    }

    private radioOffIcon(): string {
        return `<svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>`;
    }

    private checkOnIcon(): string {
        return `<svg viewBox="0 0 20 20" width="14" height="14"><rect x="1" y="1" width="18" height="18" rx="3" fill="currentColor"/><path d="M5 10l4 4 6-7" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    private checkOffIcon(): string {
        return `<svg viewBox="0 0 20 20" width="14" height="14"><rect x="1" y="1" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>`;
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const initInjector = () => new PromptInjector().init().catch(console.error);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initInjector, 150));
} else {
    setTimeout(initInjector, 500);
}
