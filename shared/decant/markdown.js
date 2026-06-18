/**
 * HTML to Markdown conversion using Turndown.
 * Optimized for AI/LLM consumption.
 */
import TurndownService from 'turndown';

// Create and configure the Turndown instance
function createTurndown(options = {}) {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
  });

  // Remove empty links
  td.addRule('removeEmptyLinks', {
    filter: (node) => node.nodeName === 'A' && !node.textContent.trim(),
    replacement: () => '',
  });

  // Clean up images
  if (options.includeImages) {
    td.addRule('cleanImages', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        if (!src) return '';
        return `![${alt}](${src})`;
      },
    });
  } else {
    td.addRule('removeImages', {
      filter: 'img',
      replacement: () => '',
    });
  }

  // Better code blocks
  td.addRule('fencedCodeBlock', {
    filter: (node) => {
      return node.nodeName === 'PRE' && node.querySelector('code');
    },
    replacement: (content, node) => {
      const code = node.querySelector('code');
      const lang = detectLanguage(code);
      const text = code.textContent;
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
    },
  });

  // Table handling — keep clean markdown tables
  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (content) => {
      return ` ${content.replace(/\n/g, ' ').trim()} |`;
    },
  });

  td.addRule('tableRow', {
    filter: 'tr',
    replacement: (content) => {
      return `|${content}\n`;
    },
  });

  td.addRule('tableHead', {
    filter: 'thead',
    replacement: (content) => {
      const cols = content.trim().split('|').filter(Boolean).length;
      const separator = '|' + ' --- |'.repeat(cols);
      return `${content}${separator}\n`;
    },
  });

  td.addRule('table', {
    filter: 'table',
    replacement: (content) => {
      return `\n${content}\n`;
    },
  });

  td.addRule('tableBody', {
    filter: 'tbody',
    replacement: (content) => content,
  });

  // Remove common noise & interactive elements from Turndown output
  td.remove([
    'script', 'style', 'noscript', 'iframe',
    'button', 'input', 'select', 'textarea', 'fieldset',
    'nav', 'svg', 'form',
  ]);

  // Remove elements that contain only whitespace or tiny "action" text
  td.addRule('removeNoiseSpans', {
    filter: (node) => {
      // Remove empty or whitespace-only spans/divs
      if ((node.nodeName === 'SPAN' || node.nodeName === 'DIV') && !node.textContent.trim()) {
        return true;
      }
      return false;
    },
    replacement: () => '',
  });

  return td;
}

/**
 * Detect programming language from a code element's class names and attributes.
 * Supports: standard language-*, Prism, Rouge, SyntaxHighlighter, Pandoc, data attributes.
 * @param {Element} codeElement
 * @returns {string} Normalized language identifier or empty string
 */
export function detectLanguage(codeElement) {
  if (!codeElement) return '';

  // Collect all class + attribute hints from element and parent
  const candidates = [
    codeElement.className || '',
    codeElement.parentElement?.className || '',
    codeElement.getAttribute('data-lang') || '',
    codeElement.getAttribute('data-language') || '',
  ].join(' ');

  // Patterns ordered by specificity
  const patterns = [
    /(?:language|lang|hljs|highlight)-(\w[\w+#]*)/,      // Standard: language-js, hljs-python
    /brush:\s*(\w+)/,                                      // SyntaxHighlighter: brush:python
    /prism-(\w+)/,                                         // Prism.js
    /rouge-(\w+)/,                                         // Rouge (Jekyll/GitHub Pages)
    /sourceCode\s+(\w+)/,                                  // Pandoc
    /\b(javascript|typescript|python|ruby|go|rust|java|kotlin|swift|scala|php|perl|bash|shell|zsh|powershell|sql|html|css|scss|less|json|yaml|toml|xml|markdown|dockerfile|graphql|terraform|hcl|lua|elixir|clojure|haskell|ocaml|r|matlab|dart|zig|nim|crystal|vue|jsx|tsx)\b/i,
  ];

  for (const pattern of patterns) {
    const match = candidates.match(pattern);
    if (match) return normalizeLang(match[1]);
  }

  return '';
}

/**
 * Normalize language identifiers to common names.
 * @param {string} lang
 * @returns {string}
 */
function normalizeLang(lang) {
  const map = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    cs: 'csharp',
    'c++': 'cpp',
    'c#': 'csharp',
    dockerfile: 'docker',
    tf: 'terraform',
  };
  const lower = lang.toLowerCase();
  return map[lower] || lower;
}

/**
 * Convert article HTML to AI-optimized Markdown.
 */
export function toMarkdown(article, metadata, options = {}) {
  const td = createTurndown(options);
  let md = '';

  // Header with metadata (helps LLMs understand context)
  md += `# ${metadata.title}\n\n`;
  md += `> **Source:** ${metadata.url}\n`;
  if (metadata.siteName) md += `> **Site:** ${metadata.siteName}\n`;
  if (metadata.excerpt) md += `> **Summary:** ${metadata.excerpt}\n`;
  md += `> **Extracted:** ${metadata.extractedAt} | ${metadata.wordCount} words\n`;
  if (metadata.llmsTxtLink) md += `> **llms.txt:** ${metadata.llmsTxtLink}\n`;
  md += '\n---\n\n';

  // Main content
  const content = td.turndown(article.content);

  // Post-process: aggressive whitespace minification
  md += content
    .replace(/\t/g, ' ')              // Tabs → single space
    .replace(/\xA0/g, ' ')            // NBSP → space
    .replace(/\u200B/g, '')           // Zero-width space → remove
    .replace(/ {2,}/g, ' ')           // Collapse multiple spaces
    .replace(/^ +| +$/gm, '')        // Trim each line
    .replace(/\n{3,}/g, '\n\n')       // Max 1 blank line
    .trim();

  // Append tables section if separately extracted
  if (options.tables && options.tables.length > 0) {
    md += '\n\n---\n\n## Extracted Tables\n\n';
    options.tables.forEach((table, i) => {
      md += `### Table ${i + 1}${table.caption ? `: ${table.caption}` : ''}\n\n`;
      md += table.markdown;
      md += '\n\n';
    });
  }

  // Append smart data if present
  if (metadata.smartData && Object.keys(metadata.smartData).length > 0) {
    md += '\n\n---\n\n## Extracted Data\n\n';
    const sd = metadata.smartData;
    if (sd.emails?.length) md += `**Emails:** ${sd.emails.join(', ')}\n\n`;
    if (sd.dates?.length) md += `**Dates:** ${sd.dates.join(', ')}\n\n`;
    if (sd.prices?.length) md += `**Prices:** ${sd.prices.join(', ')}\n\n`;
    if (sd.phones?.length) md += `**Phone numbers:** ${sd.phones.join(', ')}\n\n`;
  }

  // Append structured data if present (JSON-LD)
  if (metadata.structuredData?.jsonLd?.length > 0) {
    md += '\n\n---\n\n## Structured Data\n\n';
    md += '```json\n';
    md += JSON.stringify(metadata.structuredData.jsonLd, null, 2);
    md += '\n```\n';
  }

  return md;
}
