/**
 * Export structured JSON for data pipelines and programmatic consumption.
 */

import { detectLanguage } from './markdown.js';

/**
 * Convert article + metadata to structured JSON.
 */
export function toJSON(article, metadata, tables = []) {
  const doc = new DOMParser().parseFromString(article.content, 'text/html');

  const structure = {
    version: '1.0',
    metadata: {
      title: metadata.title,
      url: metadata.url,
      domain: metadata.domain,
      siteName: metadata.siteName,
      description: metadata.excerpt,
      wordCount: metadata.wordCount,
      imageCount: metadata.imageCount,
      estimatedTokens: metadata.estimatedTokens || 0,
      tokensByModel: metadata.tokensByModel || {},
      extractedAt: metadata.extractedAt,
      llmsTxtUrl: metadata.llmsTxtLink || null,
    },
    content: {
      plain: article.textContent.trim(),
      sections: extractSections(doc),
      headings: extractHeadings(doc),
      links: extractLinks(doc),
      images: extractImages(doc),
      codeBlocks: extractCodeBlocks(doc),
      lists: extractLists(doc),
    },
    tables: tables.map((t, i) => ({
      index: i,
      caption: t.caption || null,
      headers: t.headers,
      rows: t.rows,
    })),
  };

  if (metadata.smartData && Object.keys(metadata.smartData).length > 0) {
    structure.extractedData = metadata.smartData;
  }

  if (metadata.structuredData) {
    structure.structuredData = metadata.structuredData;
  }

  return JSON.stringify(structure, null, 2);
}

function extractSections(doc) {
  const sections = [];
  let current = { heading: null, level: 0, content: '' };

  for (const node of doc.body.childNodes) {
    const tag = node.nodeName;
    const headingMatch = tag.match(/^H([1-6])$/);

    if (headingMatch) {
      if (current.content.trim() || current.heading) {
        sections.push({ ...current, content: current.content.trim() });
      }
      current = {
        heading: node.textContent.trim(),
        level: parseInt(headingMatch[1]),
        content: '',
      };
    } else {
      current.content += (node.textContent || '').trim() + '\n';
    }
  }

  if (current.content.trim() || current.heading) {
    sections.push({ ...current, content: current.content.trim() });
  }

  return sections;
}

function extractHeadings(doc) {
  return Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
    level: parseInt(h.tagName[1]),
    text: h.textContent.trim(),
  }));
}

function extractLinks(doc) {
  return Array.from(doc.querySelectorAll('a[href]'))
    .map((a) => ({
      text: a.textContent.trim(),
      href: a.href,
    }))
    .filter((l) => l.text && l.href);
}

function extractImages(doc) {
  return Array.from(doc.querySelectorAll('img'))
    .map((img) => ({
      src: img.src || img.getAttribute('data-src') || '',
      alt: img.alt || '',
    }))
    .filter((i) => i.src);
}

function extractCodeBlocks(doc) {
  return Array.from(doc.querySelectorAll('pre code')).map((code) => ({
    language: detectLanguage(code),
    code: code.textContent,
  }));
}

function extractLists(doc) {
  return Array.from(doc.querySelectorAll('ul, ol')).map((list) => ({
    type: list.tagName === 'UL' ? 'unordered' : 'ordered',
    items: Array.from(list.querySelectorAll(':scope > li')).map((li) => li.textContent.trim()),
  }));
}
