/**
 * Smart extraction — detect structured data entities in text content.
 * Emails, dates, prices, phone numbers.
 * Enhanced with obfuscation detection and European format support.
 */

const PATTERNS = {
  // Email: RFC 5322 simplified
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Obfuscated emails: "user [at] domain [dot] com"
  emailObfuscated:
    /\b[A-Za-z0-9._%+-]+\s*[\[\(]\s*at\s*[\]\)]\s*[A-Za-z0-9.-]+\s*[\[\(]\s*dot\s*[\]\)]\s*[A-Za-z]{2,}\b/gi,

  // Prices: $, EUR, GBP, INR, BRL + common formats
  price:
    /(?:[$\u20AC\u00A3\u00A5\u20B9]|R\$|CA?\$|A\$|AU\$)\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?\b|\b\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|INR|BRL)\b/gi,

  // Phone numbers: international and common formats
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,

  // Dates: various formats
  dateISO: /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
  dateUS: /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
  dateEU: /\b(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\b/g,
  dateWritten:
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
  // European written: "23 February 2026"
  dateEUWritten:
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b/gi,
};

/**
 * Extract all structured entities from text.
 * @param {string} text - Plain text content
 * @returns {Object} Extracted entities
 */
export function extractSmartData(text) {
  if (!text) return {};

  const result = {};

  // Emails — standard + obfuscated
  const standardEmails = matchAll(text, PATTERNS.email).filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg'),
  );
  const obfuscatedEmails = matchAll(text, PATTERNS.emailObfuscated).map((e) =>
    e
      .replace(/\s*[\[\(]\s*at\s*[\]\)]\s*/gi, '@')
      .replace(/\s*[\[\(]\s*dot\s*[\]\)]\s*/gi, '.')
      .toLowerCase()
      .trim(),
  );
  const emails = dedupe([...standardEmails, ...obfuscatedEmails]);
  if (emails.length > 0) result.emails = emails;

  // Prices
  const prices = dedupe(matchAll(text, PATTERNS.price));
  if (prices.length > 0) result.prices = prices;

  // Phone numbers — filter out likely false positives
  const rawPhones = matchAll(text, PATTERNS.phone);
  const phones = dedupe(
    rawPhones.filter((p) => {
      const digits = p.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    }),
  );
  if (phones.length > 0) result.phones = phones;

  // Dates — combine all patterns
  const dates = dedupe([
    ...matchAll(text, PATTERNS.dateISO),
    ...matchAll(text, PATTERNS.dateUS),
    ...matchAll(text, PATTERNS.dateEU),
    ...matchAll(text, PATTERNS.dateWritten),
    ...matchAll(text, PATTERNS.dateEUWritten),
  ]);
  if (dates.length > 0) result.dates = dates;

  return result;
}

function matchAll(text, regex) {
  const results = [];
  // Clone regex to reset lastIndex
  const re = new RegExp(regex.source, regex.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    results.push(match[0].trim());
  }
  return results;
}

function dedupe(arr) {
  return [...new Set(arr)];
}
