/**
 * Table detection and extraction.
 * Converts HTML tables to structured data + Markdown.
 */

/**
 * Extract all tables from HTML content.
 * @param {string} html - HTML content
 * @returns {Array} Extracted tables
 */
export function extractTables(html) {
  if (!html) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');

  return Array.from(tables)
    .map((table) => parseTable(table))
    .filter((t) => t.rows.length > 0);
}

function parseTable(tableEl) {
  const caption = tableEl.querySelector('caption')?.textContent?.trim() || '';

  // Extract headers
  const headers = [];
  const headerRow = tableEl.querySelector('thead tr') || tableEl.querySelector('tr');
  if (headerRow) {
    const headerCells = headerRow.querySelectorAll('th');
    if (headerCells.length > 0) {
      headerCells.forEach((th) => headers.push(cleanCell(th.textContent)));
    } else {
      // Check if first row looks like headers (all bold or all uppercase)
      // Only heuristic-detect headers if there are more rows after the first
      const totalRows = tableEl.querySelectorAll('tr').length;
      if (totalRows > 1) {
        const firstCells = headerRow.querySelectorAll('td');
        const looksLikeHeaders =
          firstCells.length > 0 &&
          Array.from(firstCells).every(
            (td) =>
              td.querySelector('strong, b') ||
              (td.textContent.trim().length > 1 && td.textContent === td.textContent.toUpperCase()),
          );
        if (looksLikeHeaders) {
          firstCells.forEach((td) => headers.push(cleanCell(td.textContent)));
        }
      }
    }
  }

  // Extract rows
  const rows = [];
  const bodyRows = tableEl.querySelectorAll('tbody tr');
  const allRows = bodyRows.length > 0 ? bodyRows : tableEl.querySelectorAll('tr');

  allRows.forEach((tr, i) => {
    // Skip header row if we already captured it
    if (i === 0 && headers.length > 0 && !tableEl.querySelector('thead')) return;

    const cells = Array.from(tr.querySelectorAll('td, th')).map((cell) =>
      cleanCell(cell.textContent),
    );
    if (cells.length > 0 && cells.some((c) => c !== '')) {
      rows.push(cells);
    }
  });

  // Generate markdown representation
  const markdown = generateMarkdownTable(headers, rows);

  return { caption, headers, rows, markdown };
}

function cleanCell(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function generateMarkdownTable(headers, rows) {
  if (rows.length === 0) return '';

  const colCount = Math.max(headers.length, ...rows.map((r) => r.length));

  // Normalize all rows to same column count
  const padRow = (row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push('');
    return padded;
  };

  const lines = [];

  // Headers
  if (headers.length > 0) {
    lines.push('| ' + padRow(headers).join(' | ') + ' |');
    lines.push(
      '| ' +
        padRow(headers)
          .map(() => '---')
          .join(' | ') +
        ' |',
    );
  } else {
    // Generate generic headers
    const genericHeaders = Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`);
    lines.push('| ' + genericHeaders.join(' | ') + ' |');
    lines.push('| ' + genericHeaders.map(() => '---').join(' | ') + ' |');
  }

  // Data rows
  rows.forEach((row) => {
    lines.push('| ' + padRow(row).join(' | ') + ' |');
  });

  return lines.join('\n');
}
