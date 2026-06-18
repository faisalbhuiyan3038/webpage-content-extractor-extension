/**
 * Detect and fetch llms.txt from a website.
 * Checks: /llms.txt, /llms-full.txt, /.well-known/llms.txt
 * Also checks <link rel="llms"> in page head.
 */

const LLMS_PATHS = ['/llms.txt', '/llms-full.txt', '/.well-known/llms.txt'];

/**
 * Check if the site has an llms.txt file.
 * Runs in service worker context (has fetch access).
 * @param {string} url - Any page URL from the site
 * @returns {Promise<{ found: boolean, url?: string, content?: string }>}
 */
export async function detectLlmsTxt(url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return { found: false };
  }

  for (const path of LLMS_PATHS) {
    try {
      const res = await fetch(origin + path, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        // Validate: must have content, must not be an HTML error page
        if (text.length > 10 && !text.trimStart().startsWith('<!') && !contentType.includes('text/html')) {
          return { found: true, url: origin + path, content: text };
        }
      }
    } catch {
      // Timeout, network error, CORS — skip this path
    }
  }

  return { found: false };
}

/**
 * Check for <link rel="llms"> or <link rel="llms-txt"> in page DOM.
 * Runs in offscreen/content script context where DOM is available.
 * @param {Document} doc - Parsed DOM
 * @returns {string|null} href if found
 */
export function detectLlmsLink(doc) {
  if (!doc) return null;
  const link = doc.querySelector('link[rel="llms"], link[rel="llms-txt"]');
  return link?.getAttribute('href') || null;
}
