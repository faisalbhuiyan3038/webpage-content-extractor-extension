/**
 * Core parser — orchestrates extraction pipeline.
 * Takes raw DOM/HTML and produces clean, structured content.
 */
import { Readability } from '@mozilla/readability';
import { toMarkdown } from './markdown.js';
import { toJSON } from './json-export.js';
import { toMCP } from './mcp-format.js';
import { extractSmartData } from './smart-extract.js';
import { extractTables } from './table-detect.js';
import { estimateForModel, estimateAllModels } from './token-models.js';
import { extractStructuredData } from './structured-data.js';
import { detectLlmsLink } from './llms-txt.js';

/**
 * Main extraction function.
 * @param {Object} options
 * @param {string} options.html - Raw page HTML
 * @param {string} options.url - Page URL
 * @param {string} options.title - Page title
 * @param {string} options.format - 'markdown' | 'json' | 'mcp'
 * @param {boolean} options.includeImages - Include image references
 * @param {boolean} options.detectTables - Extract tables separately
 * @param {boolean} options.smartExtract - Detect emails, dates, prices
 * @param {boolean} options.fullPage - Use full HTML (not Reader mode)
 * @returns {Object} Extraction result
 */
export function extract(options) {
  const {
    html,
    url,
    title: pageTitle,
    format = 'markdown',
    includeImages = true,
    detectTables = true,
    smartExtract = true,
    fullPage = false,
  } = options;

  // Parse the HTML into a DOM
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Set base URL for relative links
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);

  let article;
  let contentDoc;

  if (fullPage) {
    // Full page mode: clean the DOM but keep all content
    contentDoc = cleanDOM(doc);
    article = {
      title: pageTitle || doc.title,
      content: contentDoc.body.innerHTML,
      textContent: normalizeWhitespace(extractTextContent(contentDoc.body)),
      length: extractTextContent(contentDoc.body).length,
      siteName: extractSiteName(doc, url),
      excerpt: extractExcerpt(doc),
    };
  } else {
    // Reader mode: use Readability to extract main content
    const reader = new Readability(doc, {
      charThreshold: 100,
      keepClasses: false,
    });
    article = reader.parse();

    if (!article) {
      // Fallback to full page if Readability fails
      contentDoc = cleanDOM(doc);
      article = {
        title: pageTitle || doc.title,
        content: contentDoc.body.innerHTML,
        textContent: normalizeWhitespace(extractTextContent(contentDoc.body)),
        length: extractTextContent(contentDoc.body).length,
        siteName: extractSiteName(doc, url),
        excerpt: extractExcerpt(doc),
      };
    } else {
      // Normalize whitespace even from Readability output
      article.textContent = normalizeWhitespace(article.textContent);
    }
  }

  // Count stats
  const wordCount = countWords(article.textContent);
  const imageCount = includeImages ? countImages(article.content) : 0;

  // Extract tables if enabled
  const tables = detectTables ? extractTables(article.content) : [];

  // Smart extraction if enabled
  const smartData = smartExtract ? extractSmartData(article.textContent) : {};

  // Estimate token count (helps users know context window usage)
  const estimatedTokens = estimateTokens(article.textContent);
  const tokensByModel = estimateAllModels(article.textContent);

  // Extract structured data (JSON-LD, Open Graph, Twitter Cards, meta)
  const structuredData = extractStructuredData(doc);
  const hasStructuredData = structuredData.jsonLd.length > 0
    || structuredData.openGraph
    || structuredData.twitterCard;

  // Detect llms.txt link in page head
  const llmsTxtLink = detectLlmsLink(doc);

  // Build metadata
  const metadata = {
    title: article.title || pageTitle,
    url,
    domain: new URL(url).hostname,
    siteName: article.siteName || '',
    excerpt: article.excerpt || '',
    wordCount,
    imageCount,
    estimatedTokens,
    tokensByModel,
    extractedAt: new Date().toISOString(),
    tables: tables.length,
    ...(Object.keys(smartData).length > 0 ? { smartData } : {}),
    ...(hasStructuredData ? { structuredData } : {}),
    ...(llmsTxtLink ? { llmsTxtLink } : {}),
  };

  // Convert to requested format
  let output;
  switch (format) {
    case 'json':
      output = toJSON(article, metadata, tables);
      break;
    case 'mcp':
      output = toMCP(article, metadata, tables);
      break;
    case 'markdown':
    default:
      output = toMarkdown(article, metadata, { includeImages, tables });
      break;
  }

  return {
    output,
    metadata,
    format,
  };
}

function cleanDOM(doc) {
  const clone = doc.cloneNode(true);

  // ── Phase 1: Remove non-content elements by selector ──
  // Comprehensive list based on competitive analysis of web extraction tools
  const removeSelectors = [
    // Core non-content
    'script',
    'style',
    'noscript',
    'iframe:not([src*="youtube"]):not([src*="vimeo"])',
    'svg',

    // Navigation & page chrome
    'nav',
    'footer:not(article footer)',
    'header:not(article header)',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="search"]',
    '[role="menu"]',
    '[role="menubar"]',
    '[role="toolbar"]',
    '[role="complementary"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="directory"]',
    '.breadcrumb',
    '.breadcrumbs',
    '.pagination',

    // Buttons & form controls (interactive UI, never content)
    'button',
    '[role="button"]',
    'input',
    'select',
    'textarea',
    'fieldset',
    '[type="search"]',

    // Ads & tracking
    '.ad',
    '.ads',
    '.advertisement',
    '.sponsored',
    '[class*="ad-"]',
    '[class*="ads-"]',
    '[id*="ad-"]',
    '[id*="ads-"]',
    'ins.adsbygoogle',
    '[id*="google_ads"]',

    // Sidebars & widgets
    '.sidebar',
    'aside:not(article aside)',
    '.widget',
    '.widgets',

    // Cookie & consent banners
    '[class*="cookie"]',
    '[id*="cookie"]',
    '[class*="consent"]',
    '.cookie-banner',
    '.cookie-consent',
    '#cookie-banner',
    '#gdpr',
    '.gdpr',
    '[class*="gdpr"]',

    // Popups & overlays
    '[class*="popup"]',
    '[class*="modal"]',
    '[class*="overlay"]',

    // Social sharing
    '[class*="share"]',
    '[class*="social"]',
    '.share-buttons',
    '.social-share',

    // Comments
    '.comments',
    '#comments',
    '.disqus',
    '[id*="comment"]',

    // Related content & recommendations
    '[class*="related"]',
    '[class*="recommended"]',
    '.related-posts',

    // Hidden & accessibility-only elements
    '[aria-hidden="true"]',
    '.print-only',
    '.screen-reader-text',
    '.sr-only',
    '.visually-hidden',
    '.noprint',

    // Edit links & action controls (CMSes / wikis)
    '.edit-link',
    '.edit-section',
    '.mw-editsection',
    'a[href*="action=edit"]',

    // Table of contents
    '#toc',
    '.toc',

    // Skip / accessibility nav
    '.skip-link',
    '.mw-jump-link',
    '[class*="skip-to"]',

    // MediaWiki-specific noise
    '.navbox',
    '.navbox-inner',
    '.catlinks',
    '.mw-indicators',
    '.mw-empty-elt',
    '.sistersitebox',
    '.portalbox',
    '.metadata',
    '.hatnote',
    '.ambox',
    '.infobox',
    '.mw-authority-control',
    '#mw-navigation',
    '#mw-panel',

    // WordPress-specific noise
    '.wp-block-latest-comments',
    '.wp-block-archives',
    '.wp-block-calendar',
    '.wp-block-tag-cloud',

    // Newsletter / signup / promo
    '[class*="newsletter"]',
    '[class*="subscribe"]',
    '[class*="signup"]',
    '[class*="promo"]',

    // Utility / back-to-top
    '.back-to-top',
    '[class*="backtotop"]',
    '[class*="go-to-top"]',
  ];

  for (const sel of removeSelectors) {
    try {
      clone.querySelectorAll(sel).forEach((el) => {
        // Never remove <html> or <body>
        if (el === clone.documentElement || el === clone.body) return;
        el.remove();
      });
    } catch {
      /* skip invalid selectors in some DOMs */
    }
  }

  // ── Phase 2: Remove empty container elements (2 passes for nested cleanup) ──
  const emptyCheckTags = 'div, section, span, p, li, ul, ol, dl, dd, dt, figure, figcaption, aside, header, footer, article';
  for (let pass = 0; pass < 2; pass++) {
    clone.querySelectorAll(emptyCheckTags).forEach((el) => {
      if (el === clone.documentElement || el === clone.body) return;
      // Keep elements that contain media even if no text
      if (!el.textContent.trim() && !el.querySelector('img, video, audio, canvas, picture')) {
        el.remove();
      }
    });
  }

  return clone;
}

/**
 * Robustly extract text from a DOM tree by injecting spaces/newlines
 * after block elements, preventing them from being glued together.
 * Especially critical for div-heavy SPAs like Twitter/X.
 */
function extractTextContent(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const tag = node.tagName.toLowerCase();
  const isBlock = /^(div|p|article|section|header|footer|aside|nav|li|h[1-6]|blockquote|pre|table|tr|td|th)$/.test(tag);

  let text = '';
  for (const child of node.childNodes) {
    text += extractTextContent(child);
  }

  // Add a space or newline after block elements if there isn't one already
  if (isBlock && text.trim().length > 0) {
    text += '\n';
  }

  return text;
}

/**
 * Aggressive whitespace normalization for clean text output.
 * Converts tabs/nbsp to spaces, collapses runs, limits blank lines.
 */
function normalizeWhitespace(text) {
  if (!text) return '';
  return text
    .replace(/\t/g, ' ')                // Tabs → single space
    .replace(/\xA0/g, ' ')              // NBSP → space
    .replace(/\u200B/g, '')             // Zero-width space → remove
    .replace(/\uFEFF/g, '')             // BOM → remove
    .replace(/ {2,}/g, ' ')             // Collapse multiple spaces
    .replace(/^ +| +$/gm, '')          // Trim each line
    .replace(/\n{3,}/g, '\n\n')         // Max 1 blank line (2 newlines)
    .trim();
}

function extractSiteName(doc, url) {
  const ogSite = doc.querySelector('meta[property="og:site_name"]');
  if (ogSite) return ogSite.content;
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function extractExcerpt(doc) {
  const ogDesc = doc.querySelector('meta[property="og:description"]');
  if (ogDesc) return ogDesc.content;
  const metaDesc = doc.querySelector('meta[name="description"]');
  if (metaDesc) return metaDesc.content;
  return '';
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countImages(html) {
  if (!html) return 0;
  const matches = html.match(/<img\b/gi);
  return matches ? matches.length : 0;
}

/**
 * Estimate token count for LLM context window awareness.
 * Heuristic: average of character-based and word-based estimates.
 * English ~1 token per 4 chars, ~1.33 tokens per word.
 */
function estimateTokens(text) {
  if (!text) return 0;
  const byChars = Math.ceil(text.length / 4);
  const byWords = Math.ceil(text.trim().split(/\s+/).length * 1.33);
  return Math.round((byChars + byWords) / 2);
}
