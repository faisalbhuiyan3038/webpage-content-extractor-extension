// @ts-nocheck
/**
 * Page Content Extraction Utility
 * 
 * Three algorithms for extracting page content in a content script context:
 *   1 = Text Extraction — lightweight heading/text extraction with smart truncation
 *   2 = Optimized Content Extraction — full HTML cleaning, dedup, YouTube transcript
 *   3 = Full Content Extraction — Readability + html-to-text pipeline
 */

type ExtractionAlgorithm = 1 | 2 | 3;
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { convert } from 'html-to-text';

// ═══════════════════════════════════════════════════════
// SHARED CONFIG
// ═══════════════════════════════════════════════════════

const TRUNC_CONFIG = {
  characterLimit: 20000,
  initialContentRatio: 0.4,
  chunkSize: 300,
  minChunksPerSegment: 3
};

// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

export interface ExtractionResult {
  content: string;
  originalLength: number;
  truncatedLength: number;
  algorithm: ExtractionAlgorithm;
  youtubeTranscript?: string;
}

/**
 * Extract page content using the specified algorithm.
 * Must be called from a content script context (needs DOM access).
 */
export async function extractPageContent(
  algorithm: ExtractionAlgorithm,
  options?: { characterLimit?: number; promptLength?: number }
): Promise<ExtractionResult> {
  console.log(`[BrowserBot] Starting page extraction using Algorithm ${algorithm}`);
  const charLimit = options?.characterLimit || TRUNC_CONFIG.characterLimit;
  const promptLen = options?.promptLength || 0;
  const maxContentLength = charLimit - promptLen - 50;

  switch (algorithm) {
    case 1:
      return extractAlgorithm1(maxContentLength);
    case 2:
      return await extractAlgorithm2(maxContentLength);
    case 3:
      return await extractAlgorithm3();
    default:
      return extractAlgorithm1(maxContentLength);
  }
}

// ═══════════════════════════════════════════════════════
// ALGORITHM 1: TEXT EXTRACTION
// Lightweight extraction of headings, paragraphs, etc.
// with markdown-style formatting and smart truncation
// ═══════════════════════════════════════════════════════

function extractAlgorithm1(maxContentLength: number): ExtractionResult {
  const raw = dom_extractPageContent();
  const truncated = truncateText(raw, { characterLimit: maxContentLength });
  return {
    content: truncated,
    originalLength: raw.length,
    truncatedLength: truncated.length,
    algorithm: 1
  };
}

function dom_extractPageContent(): string {
  const ignore = 'nav, aside, header, footer, button, script, style, form, fieldset, legend';
  const targets = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'article', 'section', 'div:not(:empty)']
    .map(tag => `${tag}:not(${ignore}):not(${ignore} *)`).join(', ');
  const els = Array.from(document.querySelectorAll(targets));
  let content = '';

  for (const el of els) {
    if ((el as HTMLElement).offsetHeight === 0 || el.closest(ignore) || !el.textContent?.trim()) continue;

    const parent = el.parentElement;
    if (parent && (parent.matches(targets) || parent.closest(targets))) {
      if (parent.closest(targets) !== el) continue;
    }

    let text = (el as HTMLElement).innerText.trim().replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    switch (el.tagName.toLowerCase()) {
      case 'h1': content += `# ${text}\n`; break;
      case 'h2': content += `## ${text}\n`; break;
      case 'h3': content += `### ${text}\n`; break;
      case 'h4': case 'h5': case 'h6': content += `#### ${text}\n`; break;
      case 'li': content += `• ${text}\n`; break;
      default: content += `${text}\n`;
    }
  }
  return content.replace(/\n{2,}/g, '\n').trim();
}

// ── Truncation helpers ──

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (start + size >= text.length) {
      chunks.push(text.slice(start).trim());
      break;
    }
    let slice = text.slice(start, start + size);
    const lastSpace = slice.lastIndexOf(' ');
    slice = slice.slice(0, lastSpace);
    start += lastSpace + 1;
    chunks.push(slice.trim());
  }
  return chunks;
}

function totalLength(chunks: string[]): number {
  return chunks.reduce((sum, c) => sum + c.length, 0);
}

function getProportions(total: number, num: number): number[] {
  if (total <= 0 || num <= 0) return [];
  const props: number[] = [];
  const step = 1 / (num + 1);
  for (let i = 1; i <= num; i++) props.push(step * i);
  return props;
}

function truncateText(text: string, config?: Partial<typeof TRUNC_CONFIG>): string {
  const cfg = { ...TRUNC_CONFIG, ...config };
  if (text.length <= cfg.characterLimit) return text;
  const chunks = chunkText(text, cfg.chunkSize);
  const samples: string[] = [];
  let len = 0;
  const initLimit = Math.floor(cfg.characterLimit * cfg.initialContentRatio);
  let i = 0;
  while (i < chunks.length && len < initLimit) {
    const c = chunks[i];
    if (len + c.length <= initLimit) {
      samples.push(c);
      len += c.length;
    } else {
      const rem = initLimit - len;
      if (rem > 10) {
        samples.push(c.slice(0, rem));
        len += rem;
      }
      break;
    }
    i++;
  }
  const remChunks = chunks.slice(i);
  if (remChunks.length > 0) {
    const avg = totalLength(remChunks) / remChunks.length;
    const numSeg = Math.floor((cfg.characterLimit - len) / (avg * cfg.minChunksPerSegment));
    const props = getProportions(remChunks.length, numSeg);
    for (const p of props) {
      if (len >= cfg.characterLimit) break;
      const startIdx = Math.floor(remChunks.length * p);
      const numC = Math.min(cfg.minChunksPerSegment, remChunks.length - startIdx);
      for (let j = 0; j < numC; j++) {
        const c = remChunks[startIdx + j];
        const space = cfg.characterLimit - len;
        if (c.length <= space) {
          samples.push(c);
          len += c.length;
        } else if (space > 10) {
          samples.push(c.slice(0, space));
          len += space;
          break;
        }
      }
    }
  }
  return samples.join(' ').replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════
// ALGORITHM 2: OPTIMIZED CONTENT EXTRACTION
// Full HTML cleaning, deduplication, YouTube transcript
// ═══════════════════════════════════════════════════════

async function extractAlgorithm2(maxContentLength: number): Promise<ExtractionResult> {
  let pageText = harpaExtractPageText(document.documentElement.outerHTML);
  if (!pageText) pageText = '';

  // Try YouTube transcript extraction
  let youtubeTranscript: string | undefined;
  if (location.href.includes('youtube.com/watch')) {
    try {
      const transcript = await harpaExtractYouTubeTranscript();
      if (transcript) {
        youtubeTranscript = transcript;
        pageText = `${youtubeTranscript}\n\n---\n\n${pageText}`;
      }
    } catch (_) { /* YouTube extraction failed, continue with page text */ }
  }

  const truncated = truncateText(pageText, { characterLimit: maxContentLength });
  return {
    content: truncated,
    originalLength: pageText.length,
    truncatedLength: truncated.length,
    algorithm: 2,
    youtubeTranscript
  };
}

function harpaExtractPageText(html: string): string | null {
  if (!html) return null;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch || !bodyMatch[1]) return null;

  let s = bodyMatch[1];
  s = s.replaceAll(/src="[^"]*"/g, '').replaceAll(/href="[^"]*"/g, '');
  s = s.replaceAll(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
       .replaceAll(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = s;

  const unwanted = 'head, script, style, img, svg, nav, footer, header, aside, iframe, video, audio, canvas, map, object, embed, applet, frame, frameset, noframes, noembed, noscript, link, meta, base, title';
  tempDiv.querySelectorAll(unwanted).forEach(el => el.remove());

  tempDiv.querySelectorAll('*').forEach(el => {
    if (!el.textContent?.trim()) el.remove();
  });

  tempDiv.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
  });

  tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    const level = parseInt(el.tagName[1]);
    el.textContent = '#'.repeat(level) + ' ' + el.textContent;
  });

  document.body.appendChild(tempDiv);
  let text = tempDiv.innerText || '';
  document.body.removeChild(tempDiv);

  text = text.replace(/ +/g, ' ').replace(/\n+/g, '\n').trim();

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      uniqueLines.push(line);
    }
  }
  return uniqueLines.join('\n');
}

// ── YouTube Transcript Extraction ──

async function harpaExtractYouTubeTranscript(): Promise<string | null> {
  if (!location.href.includes('youtube.com/watch') && !location.href.includes('youtube.com/shorts/')) return null;

  try {
    const data = await extractL(location.href);
    if (!data || !data.transcript || !data.transcript.length) return null;

    let output = `YouTube Transcript\nTitle: ${data.title}\nURL: ${data.url}\n\n`;

    const normalized = data.transcript
        .map((item: any) => {
            let ts = "";
            let txt = "";

            if (Array.isArray(item)) {
                ts = item[0] || "";
                txt = item[1] || "";
            } else if (item.tStartMs !== undefined) {
                const totalSec = Math.floor(item.tStartMs / 1000);
                const min = Math.floor(totalSec / 60);
                ts = `${min}:${(totalSec % 60).toString().padStart(2, "0")}`;
                txt = (item.segs || []).map((s: any) => s.utf8).join(" ").replace(/\n/g, " ");
            }

            return { timestamp: ts, text: txt.trim() };
        })
        .filter((item: any) => item.text.length > 0);

    let lastTimestamp = "";
    const lines = normalized.map((item: any) => {
        if (item.timestamp && item.timestamp !== lastTimestamp) {
            lastTimestamp = item.timestamp;
            return `\n(${item.timestamp}) ${item.text}`;
        }
        return ` ${item.text}`;
    });

    output += lines.join("").trim();
    return output.trim();
  } catch (err) {
    console.warn("BrowserBot YT Extraction error:", err);
    return null;
  }
}

function ytExtractTime(t: string) {
    const e = t.split(":").map(Number);
    return 2 === e.length ? 1e3 * (60 * e[0] + e[1]) : 3 === e.length ? 1e3 * (3600 * e[0] + 60 * e[1] + e[2]) : 0;
}

const potCache = new Map<string, string>();

async function uGetPotoken(videoId = "") {
    try {
        const e = `yt-caption-potoken-${videoId}`;
        const subtitleBtn = document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > button.ytp-subtitles-button.ytp-button") ||
                            document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > div.ytp-right-controls-left > button.ytp-subtitles-button.ytp-button");

        if (subtitleBtn) {
            subtitleBtn.addEventListener("click", async () => {
                performance.clearResourceTimings();
                let pot = null;
                for (let i = 0; i <= 500; i += 50) {
                    await new Promise(r => setTimeout(r, 50));
                    const resources = performance.getEntriesByType("resource").filter(res => res.name.includes("/api/timedtext?"));
                    const last = resources.pop();
                    if (last) {
                        pot = new URL(last.name).searchParams.get("pot");
                        if (pot) break;
                    }
                }
                if (pot) potCache.set(e, pot);
            }, { once: true });
            
            // @ts-ignore
            subtitleBtn.click();
            // @ts-ignore
            subtitleBtn.click();
        }
        await new Promise(r => setTimeout(r, 350));
        return potCache.get(e) || "";
    } catch {
        return "";
    }
}

async function mGetFromPanel() {
    const selectors = [
        'button[aria-label="Show transcript"]',
        '#button[aria-label="Show transcript"]',
        'ytd-video-description-transcript-section-renderer #primary-button button',
        '#primary-button > ytd-button-renderer > yt-button-shape > button'
    ];

    let btn: any = null;
    for (const sel of selectors) {
        btn = document.querySelector(sel);
        if (btn) break;
    }
    if (!btn) return null;

    btn.click();

    const containerSel = "#segments-container > ytd-transcript-segment-renderer";

    const panelLoaded = await new Promise(resolve => {
        if (document.querySelector(containerSel)) return resolve(true);
        const observer = new MutationObserver(() => {
            if (document.querySelector(containerSel)) {
                observer.disconnect();
                resolve(true);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(false); }, 3000);
    });

    if (!panelLoaded) return null;

    await new Promise(r => setTimeout(r, 300));

    const segments = document.querySelectorAll(containerSel);
    if (!segments.length) return null;

    const result: any[] = [];
    segments.forEach(seg => {
        const timeEl = seg.querySelector("div.segment-timestamp");
        const textEl = seg.querySelector("yt-formatted-string");
        if (timeEl && textEl) {
            const text = textEl.textContent?.trim();
            if (text) {
                result.push({
                    tStartMs: ytExtractTime(timeEl.textContent?.trim() || "0:00"),
                    segs: [{ utf8: text }]
                });
            }
        }
    });
    return result.length > 0 ? result : null;
}

function BMapSegments(t: any[], e: string) {
    if (t.length > 0) {
        const first = t[0];
        if (first?.transcriptSegmentRenderer) return t.map(kMapItem);
        if (first?.segs || void 0 !== first?.tStartMs) return t.filter((item: any) => item.segs).map(MMapItem);
    }
    return "regular" === e ? t.map(kMapItem) : t.filter((item: any) => item.segs).map(MMapItem);
}

function kMapItem(t: any) {
    const e = t?.transcriptSegmentRenderer;
    if (!e) return ["", ""];
    return [
        e.startTimeText?.simpleText || "",
        e.snippet?.runs?.map((r: any) => r.text).join(" ") || ""
    ];
}

function MMapItem(t: any) {
    return [
        (function (ms) {
            const totalSec = Math.floor(ms / 1000);
            const min = Math.floor(totalSec / 60);
            return `${min}:${(totalSec % 60).toString().padStart(2, "0")}`;
        })(t.tStartMs),
        (t.segs || []).map((s: any) => s.utf8).join(" ").replace(/\n/g, " ")
    ];
}

function qExtractJSON(html: string, key: string) {
    const regexes = [
        new RegExp(`window\\["${key}"\\]\\s*=\\s*({[\\s\\S]+?})\\s*;`),
        new RegExp(`var ${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`),
        new RegExp(`${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`)
    ];
    for (const reg of regexes) {
        const match = html.match(reg);
        if (match && match[1]) {
            try { return JSON.parse(match[1]); } catch {}
        }
    }
    throw new Error(`${key} not found`);
}

async function DFetchData(ytData: any, dataKey: string, videoId: string, htmlStr: string) {
    try {
        let baseUrl: string | null = null;
        
        // 1. First, try to extract baseUrl directly from the freshly fetched HTML to avoid stale SPA scripts
        if (htmlStr) {
            try {
                const playerData = qExtractJSON(htmlStr, "ytInitialPlayerResponse");
                baseUrl = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]?.baseUrl;
            } catch {}
            
            if (!baseUrl) {
                const match = htmlStr.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
                if (match) { baseUrl = match[1].replace(/\\u0026/g, "&"); }
            }
        }

        // 2. Only fallback to current DOM script tags if fresh HTML parsing failed
        if (!baseUrl) {
            const scripts = document.querySelectorAll("script");
            for (const script of scripts) {
                const text = script.textContent || "";
                if (text.includes("ytInitialPlayerResponse")) {
                    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|let|const|<\/script>)/s);
                    if (match) {
                        try {
                            const playerData = JSON.parse(match[1]);
                            const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                            if (tracks?.[0]?.baseUrl) { baseUrl = tracks[0].baseUrl; break; }
                        } catch {}
                    }
                }
                if (text.includes('"baseUrl"') && text.includes("timedtext")) {
                    const match = text.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
                    if (match) { baseUrl = match[1].replace(/\\u0026/g, "&"); break; }
                }
            }
        }

        if (!baseUrl) {
            const html = await (await fetch(window.location.href, { credentials: 'include' })).text();
            try {
                const playerData = qExtractJSON(html, "ytInitialPlayerResponse");
                baseUrl = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]?.baseUrl;
            } catch {}
        }

        if (baseUrl) {
            const pot = videoId ? await uGetPotoken(videoId) : "";
            const url = pot ? `${baseUrl}&fmt=json3&pot=${pot}&c=WEB` : `${baseUrl}&fmt=json3`;
            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) {
                const json = await res.json();
                if (json.events?.length > 0) return json.events;
            }
        }
    } catch {}

    try {
        const panelData = await mGetFromPanel();
        if (panelData && panelData.length > 0) return panelData;
    } catch {}

    const params = ytData?.engagementPanels?.find((p: any) =>
        p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
    )?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;

    if (params) {
        const hl = ytData?.topbar?.desktopTopbarRenderer?.searchbox?.fusionSearchboxRenderer?.config?.webSearchboxConfig?.requestLanguage || "en";
        const visitorData = ytData?.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData || "";

        const body = {
            context: {
                client: {
                    hl: hl,
                    visitorData: visitorData,
                    clientName: "WEB",
                    clientVersion: "2." + Array.from({length:30}, (_,i) => {
                        const d = new Date(); d.setDate(d.getDate()-i); return d.toISOString().split("T")[0].replace(/-/g,"");
                    })[Math.floor(Math.random()*30)] + ".00.00"
                },
                request: { useSsl: true }
            },
            params: params
        };

        try {
            const res = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                credentials: 'include'
            });
            if (res.ok) {
                const json = await res.json();
                const segments = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || [];
                if (segments.length > 0) return segments;
            }
        } catch {}
    }

    throw new Error("No captions found.");
}

async function extractL(url: string) {
    const isShort = /youtube\.com\/shorts\//.test(url);
    let videoId = "";
    try {
        videoId = isShort ? url.split("/shorts/")[1].split(/[/?#&]/)[0] : new URLSearchParams(new URL(url).search).get("v") || "";
    } catch {
        videoId = new URLSearchParams(window.location.search).get("v") || "";
    }
    
    if (!videoId) throw new Error("No video ID found");

    let title = "Untitled Video";
    let ytData, dataKey, resolvedType;

    const html = await (await fetch(isShort ? `https://www.youtube.com/watch?v=${videoId}` : url, { credentials: 'include' })).text();

    try {
        ytData = qExtractJSON(html, "ytInitialData");
        resolvedType = "regular";
        dataKey = "ytInitialData";
    } catch {
        try {
            ytData = qExtractJSON(html, "ytInitialPlayerResponse");
            resolvedType = "shorts";
            dataKey = "ytInitialPlayerResponse";
        } catch {
            ytData = null;
            resolvedType = "regular";
            dataKey = "";
        }
    }

    title = ytData?.videoDetails?.title || ytData?.playerOverlays?.playerOverlayRenderer?.videoDetails?.playerOverlayVideoDetailsRenderer?.title?.simpleText || "Untitled Video";

    const rawSegments = await DFetchData(ytData, dataKey, videoId, html);
    if (!rawSegments || !rawSegments.length) throw new Error("No transcript available");

    const transcript = BMapSegments(rawSegments, resolvedType);

    return { title, transcript, url };
}

// ═══════════════════════════════════════════════════════
// ALGORITHM 3: FULL CONTENT EXTRACTION
// Readability + html-to-text pipeline
// ═══════════════════════════════════════════════════════

async function extractAlgorithm3(): Promise<ExtractionResult> {
  // Dynamic imports to keep these out of the main bundle for alg 1/2
  // Readability and convert imported at the top

  const isReadable = isProbablyReaderable(document);
  const readabilityResult = isReadable ? parseWithReadability(Readability) : null;
  const cleanedHtml = cleanDomForExtraction();
  const textContent = convertHtmlToText(convert, cleanedHtml);

  let finalContent = textContent;
  if (isReadable && readabilityResult?.content) {
    // Add readable article content as well
    const articleText = convertHtmlToText(convert, readabilityResult.content);
    finalContent = `--- Article Content ---\n${articleText}\n\n--- Full Page Text ---\n${textContent}`;
  }

  return {
    content: finalContent,
    originalLength: finalContent.length,
    truncatedLength: finalContent.length,
    algorithm: 3
  };
}

function stripInvisibleNodes(node: Element): void {
  node.querySelectorAll(':scope > *').forEach((child) => {
    const cs = window.getComputedStyle(child);
    if (
      cs.display === 'none' ||
      (child as HTMLElement).style.display === 'none' ||
      (child as HTMLElement).style.visibility === 'hidden' ||
      cs.visibility === 'hidden'
    ) {
      child.remove();
    } else {
      stripInvisibleNodes(child);
    }
  });
}

function cleanDomForExtraction(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(
    'script, noscript, link, style, template, [hidden], [aria-hidden="true"], svg, iframe, input, textarea, form'
  ).forEach(el => el.remove());

  clone.querySelectorAll('*').forEach(el => {
    if (el.tagName !== 'IMG' && !el.textContent?.trim()) {
      el.remove();
    }
  });

  stripInvisibleNodes(clone);

  return clone.innerHTML.replace(/<!--.*?-->/g, '');
}

function convertHtmlToText(convert: any, html: string): string {
  return convert(html, {
    wordwrap: null,
    selectors: [
      {
        selector: 'a',
        options: {
          baseUrl: window.location.origin,
          hideLinkHrefIfSameAsText: true,
        },
      },
      {
        selector: 'img',
        format: 'skip',
      },
    ],
  });
}

function parseWithReadability(ReadabilityClass: any): any {
  const docClone = document.cloneNode(true);
  return new ReadabilityClass(docClone).parse();
}

// ═══════════════════════════════════════════════════════
// IFRAME DISCOVERY
// ═══════════════════════════════════════════════════════

/**
 * Returns a flat list of all iframes visible in the current document,
 * including nested ones, with hierarchical path labels.
 * Used by the background to cross-reference against webNavigation frame data.
 */
function discoverIframes(): Array<{ label: string; src: string; depth: number }> {
    const results: Array<{ label: string; src: string; depth: number }> = [];

    function walk(win: Window, parentLabel: string, depth: number) {
        try {
            const iframes = Array.from(win.document.querySelectorAll('iframe'));
            iframes.forEach((iframe, idx) => {
                const seg = `iframe-${idx}`;
                const label = parentLabel ? `${parentLabel} > ${seg}` : `main > ${seg}`;
                const src = iframe.src || iframe.getAttribute('src') || '(no src)';
                results.push({ label, src, depth });
                // Recurse into accessible same-origin iframes
                try {
                    const childWin = iframe.contentWindow;
                    if (childWin && childWin.document) {
                        walk(childWin, label, depth + 1);
                    }
                } catch (_) { /* cross-origin child — will be discovered via webNavigation */ }
            });
        } catch (_) { /* skip inaccessible window */ }
    }

    walk(window, '', 1);
    return results;
}

// ═══════════════════════════════════════════════════════
// MESSAGE LISTENER
// ═══════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ── Extract page content (main algorithm dispatcher) ──────────────────────
    if (request.action === 'extractContent') {
        const charLimit = request.characterLimit || TRUNC_CONFIG.characterLimit;
        const promptLength = request.promptLength || 0;
        
        let algorithm: ExtractionAlgorithm = 1;
        if (request.algorithm === 2) algorithm = 2;
        if (request.algorithm === 3) algorithm = 3;

        extractPageContent(algorithm, { characterLimit: charLimit, promptLength })
            .then(result => {
                sendResponse({
                    success: true,
                    content: result.content,
                    originalLength: result.originalLength,
                    truncatedLength: result.truncatedLength
                });
            })
            .catch(error => {
                sendResponse({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            });
            
        return true; // Keep message channel open for async response
    }

    // ── Return identity info for this frame (used by background frame resolver) ─
    if (request.action === 'getFrameInfo') {
        sendResponse({
            success: true,
            title: document.title || '',
            url: window.location.href,
            isSubFrame: window !== window.top
        });
        return false;
    }

    // ── Discover iframes in the current (main) document ───────────────────────
    // Only useful when called on the main frame (frameId 0).
    if (request.action === 'getIframesDOM') {
        try {
            const iframes = discoverIframes();
            sendResponse({ success: true, iframes });
        } catch (e) {
            sendResponse({ success: false, iframes: [] });
        }
        return false;
    }
});
