/// <reference types="chrome"/>
import { getCustomPrompts, DEFAULT_PROMPTS, getSettings, getCustomChatbots, DEFAULT_CHATBOTS } from '../shared/storage.js';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TabInfo   { id: number; title: string; url: string; favicon: string; }
interface PromptInfo { id: string; name: string; content: string; isDefault?: boolean; }

// ─── Popover ──────────────────────────────────────────────────────────────────
// Fixed-position panel rendered on document.body — never clipped by parent overflow.

class Popover {
    private el: HTMLDivElement;
    private resizeObs: ResizeObserver | null = null;
    private cleanups: Array<() => void> = [];

    constructor(trigger: HTMLElement, content: HTMLElement) {
        this.el = document.createElement('div');
        this.el.className = 'wce-popover';
        this.el.setAttribute('data-wce', 'true');
        this.el.appendChild(content);
        document.body.appendChild(this.el);

        // Stop events from bubbling OUT of the popover into the host page.
        // MUST use bubbling phase (false), NOT capture (true).
        // Capture-phase stopPropagation fires before children receive the event,
        // which breaks all item clicks. Bubbling fires after children, only
        // preventing the event from reaching the chatbot page's own handlers.
        ['click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress'].forEach(ev => {
            const h = (e: Event) => { e.stopPropagation(); };
            this.el.addEventListener(ev, h, false);
            this.cleanups.push(() => this.el.removeEventListener(ev, h, false));
        });

        // Close on outside mousedown
        const outsideClick = (e: MouseEvent) => {
            if (!this.el.contains(e.target as Node) && e.target !== trigger) this.close();
        };
        document.addEventListener('mousedown', outsideClick, true);
        this.cleanups.push(() => document.removeEventListener('mousedown', outsideClick, true));

        // Reposition on scroll / resize
        const repos = () => this.reposition(trigger);
        window.addEventListener('resize', repos);
        window.addEventListener('scroll', repos, { passive: true, capture: true });
        this.cleanups.push(() => window.removeEventListener('resize', repos));
        this.cleanups.push(() => window.removeEventListener('scroll', repos, true));

        this.resizeObs = new ResizeObserver(repos);
        this.resizeObs.observe(this.el);

        this.reposition(trigger);
    }

    reposition(trigger: HTMLElement) {
        const rect = trigger.getBoundingClientRect();
        const pop  = this.el;
        const m    = 8;

        pop.style.visibility = 'hidden';
        pop.style.top = '0';
        pop.style.left = '0';

        const pH = pop.offsetHeight;
        const pW = pop.offsetWidth;
        const vw = window.innerWidth;

        let top  = rect.top - pH - m;
        if (top < m) top = rect.bottom + m;

        let left = rect.right - pW;
        if (left < m) left = m;
        if (left + pW > vw - m) left = vw - pW - m;

        pop.style.top  = `${top}px`;
        pop.style.left = `${left}px`;
        pop.style.visibility = 'visible';
    }

    close() {
        this.resizeObs?.disconnect();
        this.cleanups.forEach(fn => fn());
        this.el.remove();
    }
}

// ─── PromptInjector ───────────────────────────────────────────────────────────

class PromptInjector {
    private position: 'inside' | 'sibling' = 'inside';
    private container: HTMLDivElement | null = null;
    private targetInput: HTMLElement | null = null;  // for text insertion
    private anchorEl: HTMLElement | null = null;      // for button positioning
    private targetSelector: string = '';
    private buttonSelector: string = '';
    private openTabs: TabInfo[] = [];
    private selectedTabIds: Set<number> = new Set();
    private allPrompts: PromptInfo[] = [];
    private activePopover: Popover | null = null;
    private positionRafId: number | null = null;
    private lastAnchorRect: DOMRect | null = null;

    // ── Init ─────────────────────────────────────────────────────────────────

    async init() {
        const settings = await getSettings();
        const globalPosition = ((settings as any).injectorPosition || 'inside') as 'inside' | 'sibling';

        const customBots = await getCustomChatbots();
        const allBots: Record<string, any> = { ...DEFAULT_CHATBOTS, ...customBots };

        const currentUrl = window.location.href;
        console.log(`[WCE Injector] URL: ${currentUrl}`);

        let matchedBot: any = null;
        for (const key of Object.keys(allBots)) {
            const bot = allBots[key];
            try {
                if (currentUrl.startsWith(bot.url) || currentUrl.includes(new URL(bot.url).hostname)) {
                    matchedBot = bot; break;
                }
            } catch { /* ignore */ }
        }

        if (!matchedBot?.promptInputSelector) {
            console.log('[WCE Injector] No match found.');
            return;
        }

        console.log(`[WCE Injector] Matched: ${matchedBot.name}`);
        this.targetSelector = matchedBot.promptInputSelector;
        this.buttonSelector  = matchedBot.buttonInjectorSelector || matchedBot.promptInputSelector;
        this.position        = matchedBot.injectorPosition || globalPosition;

        const customPrompts = await getCustomPrompts();
        this.allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];

        this.startObserver();
    }

    // ── Observer ──────────────────────────────────────────────────────────────
    // Buttons live on document.body — React/TipTap can never remove them.
    // We only need to (a) initially inject, and (b) update the anchor reference
    // so positioning stays correct when SPAs swap DOM elements.

    private startObserver() {
        const check = () => {
            const input  = document.querySelector(this.targetSelector) as HTMLElement | null;
            const anchor = document.querySelector(this.buttonSelector)  as HTMLElement | null;

            if (input && anchor) {
                this.targetInput = input;
                this.anchorEl    = anchor;

                if (!this.container) {
                    this.injectUI();
                }
            } else if (!input && this.container) {
                // Page navigated away; clean up
                this.destroy();
            }
        };

        setInterval(check, 1000);
        check();
    }

    // ── UI Injection ──────────────────────────────────────────────────────────

    private injectUI() {
        if (!this.anchorEl) return;

        this.container = document.createElement('div');
        this.container.className = 'wce-injector-container';
        this.container.setAttribute('data-wce', 'true');
        // Fixed on body — completely immune to host-page re-renders
        this.container.style.cssText = 'position:fixed;z-index:2147483646;display:flex;gap:4px;align-items:center;';
        document.body.appendChild(this.container);

        // ── Prompt button ──
        const promptBtn = this.makeIconButton('prompt', this.promptIcon(), 'Insert Prompt');
        promptBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (this.activePopover) { this.activePopover.close(); this.activePopover = null; return; }
            this.activePopover = this.openPromptPopover(promptBtn);
        });

        // ── Tabs button ──
        const tabsBtn = this.makeIconButton('tabs', this.tabsIcon(), 'Insert Tab Context');
        tabsBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (this.activePopover) { this.activePopover.close(); this.activePopover = null; return; }
            await this.fetchOpenTabs();
            this.activePopover = this.openTabsPopover(tabsBtn);
        });

        this.container.appendChild(promptBtn);
        this.container.appendChild(tabsBtn);

        // Start tracking anchor position
        this.startPositionLoop();
    }

    // ── Position loop (RAF-based for smooth tracking) ─────────────────────────

    private startPositionLoop() {
        const loop = () => {
            this.repositionContainer();
            this.positionRafId = requestAnimationFrame(loop);
        };
        this.positionRafId = requestAnimationFrame(loop);
    }

    private repositionContainer() {
        if (!this.container || !this.anchorEl) return;

        // Re-query anchor each frame to handle SPA swaps
        const latestAnchor = document.querySelector(this.buttonSelector) as HTMLElement | null;
        if (latestAnchor) this.anchorEl = latestAnchor;

        const rect = this.anchorEl.getBoundingClientRect();

        // Element off-screen / hidden → hide buttons too
        if (rect.width === 0 && rect.height === 0) {
            this.container.style.display = 'none';
            return;
        }
        this.container.style.display = 'flex';

        if (this.position === 'inside') {
            // Top-right corner of the anchor element
            this.container.style.top    = `${rect.top + 6}px`;
            this.container.style.right  = `${window.innerWidth - rect.right + 6}px`;
            this.container.style.left   = 'auto';
            this.container.style.bottom = 'auto';
        } else {
            // Sibling: just below the anchor, right-aligned
            const btnW = this.container.offsetWidth || 64;
            this.container.style.top    = `${rect.bottom + 4}px`;
            this.container.style.left   = `${rect.right - btnW - 4}px`;
            this.container.style.right  = 'auto';
            this.container.style.bottom = 'auto';
        }
    }

    private destroy() {
        if (this.positionRafId) cancelAnimationFrame(this.positionRafId);
        this.activePopover?.close();
        this.container?.remove();
        this.container = null;
        this.targetInput = null;
        this.anchorEl = null;
    }

    // ── Popovers ──────────────────────────────────────────────────────────────

    private openPromptPopover(trigger: HTMLElement): Popover {
        const panel = document.createElement('div');
        panel.className = 'wce-popover-inner';

        const list = document.createElement('div');
        list.className = 'wce-pop-list';
        let selectedId = this.allPrompts[0]?.id ?? null;

        this.allPrompts.forEach(prompt => {
            const item   = document.createElement('div');
            item.className = 'wce-pop-item' + (prompt.id === selectedId ? ' wce-pop-selected' : '');
            item.title   = prompt.content || '(No content)';

            const radio  = document.createElement('span');
            radio.className = 'wce-pop-radio';
            radio.innerHTML = prompt.id === selectedId ? this.radioOnIcon() : this.radioOffIcon();

            const label  = document.createElement('span');
            label.className = 'wce-pop-label';
            label.textContent = prompt.name;

            item.appendChild(radio);
            item.appendChild(label);
            item.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
            item.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                selectedId = prompt.id;
                list.querySelectorAll('.wce-pop-item').forEach(el => {
                    el.classList.remove('wce-pop-selected');
                    el.querySelector('.wce-pop-radio')!.innerHTML = this.radioOffIcon();
                });
                item.classList.add('wce-pop-selected');
                radio.innerHTML = this.radioOnIcon();
            });
            list.appendChild(item);
        });

        const { footer, btn } = this.makePopoverFooter('Insert Prompt', async () => {
            btn.disabled = true; btn.textContent = 'Inserting…';
            try {
                const p = this.allPrompts.find(x => x.id === selectedId);
                if (p?.content) this.appendToTarget(p.content);
            } finally {
                btn.disabled = false; btn.textContent = 'Insert Prompt';
                pop.close(); this.activePopover = null;
            }
        });

        panel.appendChild(this.makePopoverHeader('Choose a Prompt'));
        panel.appendChild(list);
        panel.appendChild(footer);
        const pop = new Popover(trigger, panel);
        return pop;
    }

    private openTabsPopover(trigger: HTMLElement): Popover {
        const panel = document.createElement('div');
        panel.className = 'wce-popover-inner';

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

                const chk   = document.createElement('span');
                chk.className = 'wce-pop-checkbox';
                chk.innerHTML = this.selectedTabIds.has(tab.id) ? this.checkOnIcon() : this.checkOffIcon();

                const fav   = document.createElement('img');
                fav.className = 'wce-pop-favicon';
                fav.src = tab.favicon || '';
                fav.onerror = () => { fav.style.display = 'none'; };

                const lbl   = document.createElement('span');
                lbl.className = 'wce-pop-label';
                lbl.textContent = tab.title;
                lbl.title = tab.title;

                item.appendChild(chk); item.appendChild(fav); item.appendChild(lbl);
                item.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
                item.addEventListener('click', e => {
                    e.preventDefault(); e.stopPropagation();
                    if (this.selectedTabIds.has(tab.id)) {
                        this.selectedTabIds.delete(tab.id);
                        item.classList.remove('wce-pop-selected');
                        chk.innerHTML = this.checkOffIcon();
                    } else {
                        this.selectedTabIds.add(tab.id);
                        item.classList.add('wce-pop-selected');
                        chk.innerHTML = this.checkOnIcon();
                    }
                });
                list.appendChild(item);
            });
        }

        const { footer, btn } = this.makePopoverFooter('Extract & Insert', async () => {
            if (this.selectedTabIds.size === 0) {
                btn.textContent = 'Select a tab first!';
                setTimeout(() => { btn.textContent = 'Extract & Insert'; }, 1800);
                return;
            }
            btn.disabled = true; btn.textContent = 'Extracting…';
            try {
                const settings = await getSettings();
                const resp = await chrome.runtime.sendMessage({
                    action: 'extractFromTabs',
                    tabIds: Array.from(this.selectedTabIds),
                    characterLimit: 40000,
                    algorithm: (settings as any).extractionAlgorithm || 1
                });
                if (resp?.success) {
                    this.appendToTarget(resp.content);
                    pop.close(); this.activePopover = null;
                    this.selectedTabIds.clear();
                } else {
                    btn.textContent = 'Extraction failed';
                    setTimeout(() => { btn.textContent = 'Extract & Insert'; btn.disabled = false; }, 2000);
                }
            } catch (e) {
                console.error(e);
                btn.textContent = 'Error occurred';
                setTimeout(() => { btn.textContent = 'Extract & Insert'; btn.disabled = false; }, 2000);
            }
        });

        panel.appendChild(this.makePopoverHeader('Select Tabs to Extract'));
        panel.appendChild(list);
        panel.appendChild(footer);
        const pop = new Popover(trigger, panel);
        return pop;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private makeIconButton(type: string, svgInner: string, title: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
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

    private makePopoverFooter(label: string, fn: () => void): { footer: HTMLDivElement; btn: HTMLButtonElement } {
        const footer = document.createElement('div');
        footer.className = 'wce-pop-footer';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wce-pop-insert-btn';
        btn.textContent = label;
        btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener('click',     e => { e.preventDefault(); e.stopPropagation(); fn(); });
        footer.appendChild(btn);
        return { footer, btn };
    }

    private async fetchOpenTabs() {
        try {
            const r = await chrome.runtime.sendMessage({ action: 'getOpenTabs' });
            this.openTabs = r?.success ? r.tabs : [];
        } catch { this.openTabs = []; }
    }

    /** Appends text to the chatbot input without overwriting existing content */
    private appendToTarget(text: string) {
        // Re-query to get the freshest DOM reference (SPAs swap nodes)
        const fresh = document.querySelector(this.targetSelector) as HTMLElement | null;
        if (fresh) this.targetInput = fresh;

        const el = this.targetInput;
        if (!el) return;

        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
            const existing = el.value;
            const sep = existing.length ? '\n\n' : '';
            // Use native value setter to correctly trigger React synthetic events
            const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            const newVal = existing + sep + text;
            nativeSet ? nativeSet.call(el, newVal) : (el.value = newVal);
            el.selectionStart = el.selectionEnd = newVal.length;
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
            el.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            const existing = el.textContent || '';
            const sep = existing.length ? '\n\n' : '';
            document.execCommand('insertText', false, sep + text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            const existing = el.innerText || '';
            const sep = existing.length ? '\n\n' : '';
            el.innerText = existing + sep + text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.focus();
    }

    // ── SVG Icons ─────────────────────────────────────────────────────────────

    private promptIcon() {
        return `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6zm2-9h4v2H8v-2zm0 4h8v2H8v-2z"/>`;
    }
    private tabsIcon() {
        return `<path d="M20 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 2v3H4V5h16zm0 14H4V10h16v9z"/>`;
    }
    private radioOnIcon()  { return `<svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>`; }
    private radioOffIcon() { return `<svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>`; }
    private checkOnIcon()  { return `<svg viewBox="0 0 20 20" width="14" height="14"><rect x="1" y="1" width="18" height="18" rx="3" fill="currentColor"/><path d="M5 10l4 4 6-7" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
    private checkOffIcon() { return `<svg viewBox="0 0 20 20" width="14" height="14"><rect x="1" y="1" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>`; }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const initInjector = () => new PromptInjector().init().catch(console.error);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initInjector, 150));
} else {
    setTimeout(initInjector, 500);
}
