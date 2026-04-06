/// <reference types="chrome"/>
import { getCustomPrompts, DEFAULT_PROMPTS, getSettings, getCustomChatbots, DEFAULT_CHATBOTS } from '../shared/storage.js';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TabInfo { id: number; title: string; url: string; favicon: string; }
interface PromptInfo { id: string; name: string; content: string; isDefault?: boolean; }

// ─── Popover Manager ─────────────────────────────────────────────────────────
// Rendered as position:fixed on document.body — never clipped by parent overflow.

class Popover {
    private el: HTMLDivElement;
    private resizeObs: ResizeObserver | null = null;
    private scrollListeners: Array<[EventTarget, EventListener]> = [];

    constructor(trigger: HTMLElement, content: HTMLElement) {
        this.el = document.createElement('div');
        this.el.className = 'wce-popover';
        this.el.setAttribute('data-wce', 'true');
        this.el.appendChild(content);
        document.body.appendChild(this.el);

        // Prevent clicks inside the popover from bubbling to the page
        this.el.addEventListener('click', (e) => e.stopPropagation());
        this.el.addEventListener('mousedown', (e) => e.stopPropagation());
        this.el.addEventListener('keydown', (e) => e.stopPropagation());

        // Close when clicking outside
        const outsideClick = (e: MouseEvent) => {
            if (!this.el.contains(e.target as Node) && e.target !== trigger) {
                this.close();
            }
        };
        document.addEventListener('mousedown', outsideClick, true);

        // Position immediately
        this.reposition(trigger);

        // Reposition on scroll / resize
        const repos = () => this.reposition(trigger);
        window.addEventListener('resize', repos);
        let el: HTMLElement | null = trigger.parentElement;
        while (el) {
            el.addEventListener('scroll', repos, { passive: true });
            this.scrollListeners.push([el, repos as EventListener]);
            el = el.parentElement;
        }
        window.addEventListener('scroll', repos, { passive: true });
        this.scrollListeners.push([window, repos as EventListener]);

        this.resizeObs = new ResizeObserver(() => this.reposition(trigger));
        this.resizeObs.observe(this.el);

        (this.el as any).__outsideClick = outsideClick;
        (this.el as any).__reposListener = repos;
    }

    reposition(trigger: HTMLElement) {
        const rect = trigger.getBoundingClientRect();
        const pop = this.el;
        const margin = 8;

        // Measure while hidden to avoid flicker
        pop.style.visibility = 'hidden';
        pop.style.top = '0';
        pop.style.left = '0';

        const popH = pop.offsetHeight;
        const popW = pop.offsetWidth;
        const vw = window.innerWidth;

        // Prefer opening upward above the trigger
        let top = rect.top - popH - margin;
        if (top < margin) top = rect.bottom + margin; // flip downward

        // Right-align to trigger, clamped to viewport
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
        this.scrollListeners.forEach(([t, fn]) => (t as HTMLElement).removeEventListener('scroll', fn));
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
    // Throttle re-injection to prevent flicker on heavily-reactive SPAs (e.g. Grok)
    private lastInjectTime = 0;
    private readonly MIN_INJECT_INTERVAL_MS = 2500;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async init() {
        const settings = await getSettings();
        // Global fallback position
        const globalPosition = ((settings as any).injectorPosition || 'inside') as 'inside' | 'sibling';

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
            } catch { /* ignore malformed URL */ }
        }

        if (!matchedBot || !matchedBot.promptInputSelector) {
            console.log(`[WCE Injector] No matching bot or selector found.`);
            return;
        }

        console.log(`[WCE Injector] Matched: ${matchedBot.name}`);
        this.targetSelector = matchedBot.promptInputSelector;
        this.buttonSelector = matchedBot.buttonInjectorSelector || matchedBot.promptInputSelector;

        // Per-bot position overrides global setting
        this.position = matchedBot.injectorPosition || globalPosition;

        const customPrompts = await getCustomPrompts();
        this.allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];

        this.startObserver();
    }

    private startObserver() {
        const checkForInput = () => {
            const input = document.querySelector(this.targetSelector) as HTMLElement | null;
            const btnTarget = document.querySelector(this.buttonSelector) as HTMLElement | null;
            const isAttached = this.container && document.body.contains(this.container);

            if (input && btnTarget) {
                // Always keep internal references fresh (React/SPA can swap the node)
                this.targetInput = input;
                this.buttonParent = btnTarget;

                if (!isAttached) {
                    // Container was removed (page re-render); throttle re-injection
                    const now = Date.now();
                    if (now - this.lastInjectTime >= this.MIN_INJECT_INTERVAL_MS) {
                        this.lastInjectTime = now;
                        if (this.container) this.container.remove();
                        this.injectUI();
                    }
                }
            } else if (!input && this.container) {
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

        this.container = document.createElement('div');
        this.container.className = `wce-injector-container wce-${this.position}`;
        this.container.setAttribute('data-wce', 'true');

        // ─ Prompt button ─
        const promptBtn = this.makeIconButton('prompt', this.promptIcon(), 'Insert Prompt');
        promptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.activePopover) { this.activePopover.close(); this.activePopover = null; return; }
            this.activePopover = this.openPromptPopover(promptBtn);
        });

        // ─ Tabs button ─
        const tabsBtn = this.makeIconButton('tabs', this.tabsIcon(), 'Insert Tab Context');
        tabsBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.activePopover) { this.activePopover.close(); this.activePopover = null; return; }
            await this.fetchOpenTabs();
            this.activePopover = this.openTabsPopover(tabsBtn);
        });

        this.container.appendChild(promptBtn);
        this.container.appendChild(tabsBtn);

        // Mount
        if (this.position === 'inside') {
            const mountParent = (this.buttonSelector === this.targetSelector)
                ? this.buttonParent.parentElement
                : this.buttonParent;
            if (mountParent) {
                if (getComputedStyle(mountParent).position === 'static') {
                    mountParent.style.position = 'relative';
                }
                mountParent.appendChild(this.container);
            }
        } else {
            this.buttonParent.parentElement?.insertBefore(this.container, this.buttonParent);
        }
    }

    // ── Popovers ──────────────────────────────────────────────────────────────

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
            item.title = prompt.content || '(No content)';

            const radio = document.createElement('span');
            radio.className = 'wce-pop-radio';
            radio.innerHTML = prompt.id === selectedPromptId ? this.radioOnIcon() : this.radioOffIcon();

            const label = document.createElement('span');
            label.className = 'wce-pop-label';
            label.textContent = prompt.name;

            item.appendChild(radio);
            item.appendChild(label);

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
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

        const { footer, btn: footerBtn } = this.makePopoverFooter('Insert Prompt', async () => {
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

                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
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

        const { footer, btn: footerBtn } = this.makePopoverFooter('Extract & Insert', async () => {
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

        panel.appendChild(header);
        panel.appendChild(list);
        panel.appendChild(footer);

        const pop = new Popover(trigger, panel);
        return pop;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private makeIconButton(type: string, svgInner: string, title: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button'; // Prevent form submission in sites that wrap input in <form>
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

    private makePopoverFooter(label: string, onClick: () => void): { footer: HTMLDivElement; btn: HTMLButtonElement } {
        const footer = document.createElement('div');
        footer.className = 'wce-pop-footer';
        const btn = document.createElement('button');
        btn.type = 'button'; // Prevent form submission
        btn.className = 'wce-pop-insert-btn';
        btn.textContent = label;
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        footer.appendChild(btn);
        return { footer, btn };
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

    /** Appends text to the chatbot input without overwriting existing content */
    private appendToTarget(text: string) {
        if (!this.targetInput) return;

        if (this.targetInput instanceof HTMLTextAreaElement || this.targetInput instanceof HTMLInputElement) {
            const el = this.targetInput;
            const existing = el.value;
            const sep = existing.length > 0 ? '\n\n' : '';
            const newVal = existing + sep + text;
            // Use native setter to trigger React's synthetic event system
            const nativeSetter = Object.getOwnPropertyDescriptor(
                this.targetInput instanceof HTMLTextAreaElement
                    ? HTMLTextAreaElement.prototype
                    : HTMLInputElement.prototype,
                'value'
            )?.set;
            if (nativeSetter) {
                nativeSetter.call(el, newVal);
            } else {
                el.value = newVal;
            }
            el.selectionStart = el.selectionEnd = newVal.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (this.targetInput.isContentEditable) {
            this.targetInput.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(this.targetInput);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            const existing = this.targetInput.textContent || '';
            const sep = existing.length > 0 ? '\n\n' : '';
            document.execCommand('insertText', false, sep + text);
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            const existing = this.targetInput.innerText || '';
            const sep = existing.length > 0 ? '\n\n' : '';
            this.targetInput.innerText = existing + sep + text;
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.targetInput.focus();
    }

    // ── SVG Icons ─────────────────────────────────────────────────────────────

    private promptIcon(): string {
        return `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6zm2-9h4v2H8v-2zm0 4h8v2H8v-2z"/>`;
    }

    private tabsIcon(): string {
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
