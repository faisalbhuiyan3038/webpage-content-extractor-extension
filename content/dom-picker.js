/**
 * DOM Picker — Visual element selector for surgical extraction.
 * Injected on-demand via chrome.scripting.executeScript().
 *
 * When active:
 * - Highlights elements on hover with a purple overlay
 * - Shows a tooltip with the element tag + dimensions
 * - Click to capture outerHTML → sends result back to extension
 * - ESC or right-click to cancel
 * - All injected DOM is cleaned up on exit
 */

(function () {
  // Guard against double injection
  if (window.__decantPickerActive) return;
  window.__decantPickerActive = true;

  // ── Constants ──
  const ACCENT = '#8B5CF6';
  const ACCENT_BG = 'rgba(139, 92, 246, 0.08)';
  const ACCENT_BORDER = 'rgba(139, 92, 246, 0.6)';
  const PREFIX = 'decant-picker';

  // ── State ──
  let hoveredEl = null;
  let multiMode = false;
  let selectedElements = [];
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // ── Inject styles ──
  const style = document.createElement('style');
  style.id = `${PREFIX}-styles`;
  style.textContent = `
    .${PREFIX}-overlay {
      position: fixed;
      pointer-events: none;
      border: 2px solid ${ACCENT};
      background: ${ACCENT_BG};
      border-radius: 3px;
      z-index: 2147483646;
      transition: all 80ms ease-out;
      box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.2),
                  0 0 12px rgba(139, 92, 246, 0.15);
    }

    .${PREFIX}-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 500;
      line-height: 1;
      color: #fff;
      background: rgba(15, 15, 20, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 5px 8px;
      border-radius: 4px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(139, 92, 246, 0.3);
      transition: opacity 80ms ease-out;
    }

    .${PREFIX}-tooltip-tag {
      color: ${ACCENT};
      font-weight: 600;
    }

    .${PREFIX}-tooltip-dim {
      color: rgba(255, 255, 255, 0.5);
      margin-left: 6px;
    }

    .${PREFIX}-tooltip-class {
      color: #06b6d4;
      margin-left: 4px;
    }

    .${PREFIX}-selected-mark {
      position: absolute;
      pointer-events: none;
      border: 2px dashed ${ACCENT};
      background: rgba(139, 92, 246, 0.05);
      border-radius: 3px;
      z-index: 2147483645;
    }

    .${PREFIX}-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 10px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      color: #e8e8ed;
      background: rgba(15, 15, 20, 0.94);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border-bottom: 1px solid rgba(139, 92, 246, 0.3);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      animation: ${PREFIX}-slideDown 250ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    .${PREFIX}-banner-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .${PREFIX}-banner-text {
      flex: 1;
      text-align: center;
    }

    .${PREFIX}-banner-text strong {
      color: ${ACCENT};
    }

    .${PREFIX}-banner-text kbd {
      display: inline-block;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      padding: 1px 5px;
      font-family: inherit;
      font-size: 11px;
      margin: 0 2px;
    }

    .${PREFIX}-banner-btn {
      padding: 5px 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      color: #e8e8ed;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
      flex-shrink: 0;
    }

    .${PREFIX}-banner-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .${PREFIX}-banner-btn-primary {
      background: ${ACCENT};
      border-color: ${ACCENT};
      color: #fff;
    }

    .${PREFIX}-banner-btn-primary:hover {
      background: #7c3aed;
      border-color: #7c3aed;
    }

    @keyframes ${PREFIX}-slideDown {
      from {
        opacity: 0;
        transform: translateY(-100%);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Prevent page interactions while picker is active */
    .${PREFIX}-active {
      cursor: crosshair !important;
    }
    .${PREFIX}-active * {
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(style);

  // ── Create overlay element ──
  const overlay = document.createElement('div');
  overlay.className = `${PREFIX}-overlay`;
  document.body.appendChild(overlay);

  // ── Create tooltip ──
  const tooltip = document.createElement('div');
  tooltip.className = `${PREFIX}-tooltip`;
  tooltip.style.opacity = '0';
  document.body.appendChild(tooltip);

  // ── Create top banner ──
  const banner = document.createElement('div');
  banner.className = `${PREFIX}-banner`;
  banner.innerHTML = `
    <svg class="${PREFIX}-banner-icon" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      <path d="M13 13l6 6"/>
    </svg>
    <span class="${PREFIX}-banner-text">
      <strong>Web Scraper Picker</strong> — ${isMobile ? 'Tap an element' : 'Click an element'} to extract it. ${isMobile ? '' : 'Press <kbd>Esc</kbd> to cancel.'}
    </span>
    ${isMobile ? `<button class="${PREFIX}-banner-btn ${PREFIX}-banner-btn-primary" id="${PREFIX}-confirm" style="display: none; margin-right: 8px;">Confirm</button>` : ''}
    <button class="${PREFIX}-banner-btn" id="${PREFIX}-cancel">Cancel</button>
  `;
  document.body.appendChild(banner);

  // Banner cancel button
  document.getElementById(`${PREFIX}-cancel`).addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup(null);
  });

  // Activate crosshair cursor
  document.documentElement.classList.add(`${PREFIX}-active`);

  // ── Highlight on mouseover ──
  function onMouseOver(e) {
    const target = e.target;

    // Ignore our own UI elements
    if (isPickerElement(target)) return;

    hoveredEl = target;
    positionOverlay(target);
    positionTooltip(target, e);
  }

  function onMouseMove(e) {
    if (hoveredEl && !isPickerElement(e.target)) {
      positionTooltip(hoveredEl, e);
    }
  }

  function positionOverlay(el) {
    const rect = el.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.opacity = '1';
  }

  function positionTooltip(el, event) {
    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    // Build class string (first 2 classes max)
    let classStr = '';
    if (el.classList.length > 0) {
      const classes = Array.from(el.classList)
        .filter(c => !c.startsWith(PREFIX))
        .slice(0, 2);
      if (classes.length > 0) {
        classStr = '.' + classes.join('.');
      }
    }

    // Build id string
    const idStr = el.id && !el.id.startsWith(PREFIX) ? `#${el.id}` : '';

    tooltip.innerHTML = `
      <span class="${PREFIX}-tooltip-tag">&lt;${tag}${idStr}${classStr}&gt;</span>
      <span class="${PREFIX}-tooltip-dim">${w} × ${h}</span>
    `;
    tooltip.style.opacity = '1';

    // Position tooltip near cursor
    const tx = event.clientX + 12;
    const ty = event.clientY + 16;
    const tooltipRect = tooltip.getBoundingClientRect();

    // Keep tooltip in viewport
    const maxX = window.innerWidth - tooltipRect.width - 8;
    const maxY = window.innerHeight - tooltipRect.height - 8;

    tooltip.style.left = `${Math.min(tx, maxX)}px`;
    tooltip.style.top = `${Math.min(ty, maxY)}px`;
  }

  // ── Click to capture ──
  function onClick(e) {
    const target = e.target;

    // Ignore our own UI elements, except the confirm button
    if (isPickerElement(target)) {
      if (target.id === `${PREFIX}-confirm`) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        doCapture();
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    hoveredEl = target;
    positionOverlay(target);

    // Simulate coordinates near top-left of the target element for tooltip position
    const rect = target.getBoundingClientRect();
    positionTooltip(target, { clientX: rect.left, clientY: rect.top });

    if (isMobile) {
      const confirmBtn = document.getElementById(`${PREFIX}-confirm`);
      if (confirmBtn) {
        confirmBtn.style.display = 'inline-block';
      }
    } else {
      doCapture();
    }
  }

  function doCapture() {
    if (!hoveredEl) return;

    // Clone the element and resolve relative URLs
    const clone = hoveredEl.cloneNode(true);
    resolveRelativeURLs(clone);
    const html = clone.outerHTML;
    const title = document.title;
    const url = window.location.href;

    cleanup({
      html: `<html><head><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`,
      url,
      title,
      domain: window.location.hostname,
      selector: buildSelector(hoveredEl),
    });
  }

  // ── Keyboard handler ──
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup(null);
    }
  }

  // ── Right-click to cancel ──
  function onContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    cleanup(null);
  }

  // ── Register event listeners (capture phase for reliability) ──
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('contextmenu', onContextMenu, true);

  // ── Cleanup & send result ──
  function cleanup(result) {
    // Remove event listeners
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('contextmenu', onContextMenu, true);

    // Remove injected DOM
    overlay.remove();
    tooltip.remove();
    banner.remove();
    style.remove();

    // Remove cursor override
    document.documentElement.classList.remove(`${PREFIX}-active`);

    // Remove selection marks
    document.querySelectorAll(`.${PREFIX}-selected-mark`).forEach(el => el.remove());

    // Reset state
    window.__decantPickerActive = false;
    hoveredEl = null;

    // Send result back to extension
    if (result) {
      chrome.runtime.sendMessage({
        action: 'pickerResult',
        data: result,
      }, (response) => {
        // Show feedback toast on the page
        if (chrome.runtime.lastError) {
          showPickerToast(false);
          return;
        }
        if (response?.success) {
          showPickerToast(true, response.result?.metadata);
        } else {
          showPickerToast(false);
        }
      });
    } else {
      chrome.runtime.sendMessage({
        action: 'pickerCancelled',
      });
    }
  }

  // ── Helpers ──
  function isPickerElement(el) {
    if (!el) return false;
    return el.closest(`.${PREFIX}-overlay, .${PREFIX}-tooltip, .${PREFIX}-banner`) !== null
      || el.classList?.contains(`${PREFIX}-overlay`)
      || el.classList?.contains(`${PREFIX}-tooltip`)
      || el.classList?.contains(`${PREFIX}-banner`);
  }

  function buildSelector(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      if (current.classList.length > 0) {
        const classes = Array.from(current.classList)
          .filter(c => !c.startsWith(PREFIX))
          .slice(0, 2);
        if (classes.length) selector += '.' + classes.join('.');
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function resolveRelativeURLs(root) {
    const base = window.location.href;
    root.querySelectorAll('img[src]').forEach((img) => {
      try {
        img.src = new URL(img.getAttribute('src'), base).href;
      } catch { /* skip invalid URLs */ }
    });
    root.querySelectorAll('img[data-src]').forEach((img) => {
      try {
        img.setAttribute('data-src', new URL(img.getAttribute('data-src'), base).href);
      } catch { /* skip */ }
    });
    root.querySelectorAll('a[href]').forEach((a) => {
      try {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          a.href = new URL(href, base).href;
        }
      } catch { /* skip */ }
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Show a success/error toast on the page after picker extraction.
   * Fully self-contained with inline styles — no dependency on picker styles.
   */
  function showPickerToast(success, metadata) {
    const toast = document.createElement('div');
    const wordCount = metadata?.wordCount || 0;

    const borderColor = success
      ? 'rgba(139, 92, 246, 0.4)'
      : 'rgba(239, 68, 68, 0.4)';

    toast.setAttribute('style', [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 2147483647',
      'display: flex',
      'align-items: center',
      'gap: 10px',
      'padding: 12px 18px',
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      'font-size: 13px',
      'font-weight: 500',
      'color: #e8e8ed',
      'background: rgba(15, 15, 20, 0.94)',
      'backdrop-filter: blur(16px) saturate(180%)',
      '-webkit-backdrop-filter: blur(16px) saturate(180%)',
      `border: 1px solid ${borderColor}`,
      'border-radius: 12px',
      'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      'transform: translateY(20px)',
      'opacity: 0',
      'transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      'pointer-events: none',
    ].join('; '));

    const iconColor = success ? '#8B5CF6' : '#EF4444';
    const icon = success
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    const wordInfo = success && wordCount
      ? `<span style="color: rgba(255,255,255,0.4); margin-left: 2px;">${wordCount} words</span>`
      : '';

    const message = success
      ? `Extracted! Copied to clipboard. ${wordInfo}`
      : 'Extraction failed';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });
    });

    // Auto-dismiss after 3.5s
    setTimeout(() => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }
})();
