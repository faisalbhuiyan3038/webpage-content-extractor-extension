/**
 * MCP (Model Context Protocol) format output.
 * Structures web content as an MCP-compatible resource for AI agents.
 *
 * Reference: https://modelcontextprotocol.io/
 */

/**
 * Convert article to MCP-ready format.
 * Follows MCP resource structure for seamless agent consumption.
 */
export function toMCP(article, metadata, tables = []) {
  const resource = {
    // MCP resource envelope
    type: 'resource',
    uri: `decant://extracted/${encodeURIComponent(metadata.domain)}/${encodeURIComponent(slugify(metadata.title))}`,
    name: metadata.title,
    description: metadata.excerpt || `Extracted content from ${metadata.url}`,
    mimeType: 'text/plain',

    // Content block — plain text optimized for LLM consumption
    content: buildLLMContent(article, metadata, tables),

    // Structured metadata for agent processing
    metadata: {
      source: {
        url: metadata.url,
        domain: metadata.domain,
        siteName: metadata.siteName,
        extractedAt: metadata.extractedAt,
        llmsTxtUrl: metadata.llmsTxtLink || null,
      },
      contentType: classifyContent(metadata, tables),
      stats: {
        wordCount: metadata.wordCount,
        imageCount: metadata.imageCount,
        estimatedTokens: metadata.estimatedTokens || 0,
        tokensByModel: metadata.tokensByModel || {},
        tableCount: tables.length,
      },
      extractedEntities: metadata.smartData || {},
      structuredData: metadata.structuredData || null,
      tables: tables.map((t, i) => ({
        index: i,
        caption: t.caption || null,
        headers: t.headers,
        rowCount: t.rows.length,
        rows: t.rows,
      })),
    },
  };

  return JSON.stringify(resource, null, 2);
}

/**
 * Build LLM-optimized plain text content.
 * Uses clear section markers and minimal formatting for token efficiency.
 */
function buildLLMContent(article, metadata, tables) {
  const parts = [];

  // Context header — helps LLMs understand the source
  parts.push(`[Source: ${metadata.title}]`);
  parts.push(`[URL: ${metadata.url}]`);
  if (metadata.excerpt) {
    parts.push(`[Summary: ${metadata.excerpt}]`);
  }
  parts.push('');

  // Main content — clean text (belt-and-suspenders whitespace cleanup)
  const cleanText = article.textContent
    .replace(/\t/g, ' ')
    .replace(/\xA0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^ +| +$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  parts.push(cleanText);

  // Tables in a clear, parseable format
  if (tables.length > 0) {
    parts.push('');
    parts.push('[Tables]');
    tables.forEach((table, i) => {
      parts.push(`Table ${i + 1}${table.caption ? ` - ${table.caption}` : ''}:`);
      if (table.headers.length > 0) {
        parts.push(table.headers.join(' | '));
      }
      table.rows.forEach((row) => {
        parts.push(row.join(' | '));
      });
      parts.push('');
    });
  }

  // Extracted entities
  if (metadata.smartData) {
    const sd = metadata.smartData;
    const entities = [];
    if (sd.emails?.length) entities.push(`Emails: ${sd.emails.join(', ')}`);
    if (sd.dates?.length) entities.push(`Dates: ${sd.dates.join(', ')}`);
    if (sd.prices?.length) entities.push(`Prices: ${sd.prices.join(', ')}`);
    if (sd.phones?.length) entities.push(`Phones: ${sd.phones.join(', ')}`);

    if (entities.length > 0) {
      parts.push('[Extracted Entities]');
      parts.push(...entities);
    }
  }

  return parts.join('\n');
}

/**
 * Classify content type for LLM context awareness.
 */
function classifyContent(metadata, tables) {
  if (tables.length > 2) return 'data_table';
  if (metadata.wordCount > 2000) return 'article';
  if (metadata.smartData?.prices?.length > 0) return 'product';
  if (metadata.smartData?.emails?.length > 2) return 'contact';
  return 'general';
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}
