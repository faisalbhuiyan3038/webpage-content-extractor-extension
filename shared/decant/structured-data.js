/**
 * Extract structured data from web pages.
 * JSON-LD, Open Graph, Twitter Cards, meta tags.
 */

/**
 * Extract all structured data from a parsed DOM.
 * @param {Document} doc - Parsed HTML document
 * @returns {{ jsonLd: object[], openGraph: object|null, twitterCard: object|null, meta: object|null }}
 */
export function extractStructuredData(doc) {
  return {
    jsonLd: extractJsonLd(doc),
    openGraph: extractOpenGraph(doc),
    twitterCard: extractTwitterCard(doc),
    meta: extractMetaTags(doc),
  };
}

function extractJsonLd(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const results = [];
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (Array.isArray(data)) {
        results.push(...data);
      } else if (data['@graph'] && Array.isArray(data['@graph'])) {
        results.push(...data['@graph']);
      } else {
        results.push(data);
      }
    } catch { /* malformed JSON-LD — skip */ }
  }
  return results;
}

function extractOpenGraph(doc) {
  const og = {};
  doc.querySelectorAll('meta[property^="og:"]').forEach(meta => {
    const key = meta.getAttribute('property').replace('og:', '');
    og[key] = meta.content;
  });
  return Object.keys(og).length > 0 ? og : null;
}

function extractTwitterCard(doc) {
  const tc = {};
  doc.querySelectorAll('meta[name^="twitter:"]').forEach(meta => {
    const key = meta.getAttribute('name').replace('twitter:', '');
    tc[key] = meta.content;
  });
  return Object.keys(tc).length > 0 ? tc : null;
}

function extractMetaTags(doc) {
  const meta = {};
  const names = ['description', 'author', 'keywords', 'robots'];
  for (const name of names) {
    const el = doc.querySelector(`meta[name="${name}"]`);
    if (el?.content) meta[name] = el.content;
  }
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical?.href) meta.canonical = canonical.href;
  return Object.keys(meta).length > 0 ? meta : null;
}
