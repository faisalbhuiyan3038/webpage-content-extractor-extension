// Text Extraction Algorithm - Preserved exactly from userscript
// This is the core extraction logic that must remain unchanged

// Truncation Config
const TRUNC_CONFIG = {
    characterLimit: 20000,
    initialContentRatio: 0.4,
    chunkSize: 300,
    minChunksPerSegment: 3
};

// Extract Page Content - Main extraction function
function extractPageContent() {
    const ignore = 'nav, aside, header, footer, button, script, style, form, fieldset, legend';
    const targets = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'article', 'section', 'div:not(:empty)']
        .map(tag => `${tag}:not(${ignore}):not(${ignore} *)`).join(', ');
    const els = Array.from(document.querySelectorAll(targets));
    let content = '';

    for (const el of els) {
        if (el.offsetHeight === 0 || el.closest(ignore) || !el.textContent?.trim()) continue;

        const parent = el.parentElement;
        if (parent && (parent.matches(targets) || parent.closest(targets))) {
            if (parent.closest(targets) !== el) continue;
        }

        let text = el.innerText.trim().replace(/<[^>]+>/g, '').trim();
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

// Chunk text into smaller pieces
function chunkText(text, size) {
    const chunks = [];
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

// Calculate total length of chunks
function totalLength(chunks) {
    return chunks.reduce((sum, c) => sum + c.length, 0);
}

// Get proportions for sampling
function getProportions(total, num) {
    if (total <= 0 || num <= 0) return [];
    const props = [];
    const step = 1 / (num + 1);
    for (let i = 1; i <= num; i++) props.push(step * i);
    return props;
}

// Truncate text intelligently - Preserved exactly from userscript
function truncateText(text, config) {
    const cfg = { ...TRUNC_CONFIG, ...config };
    if (text.length <= cfg.characterLimit) return text;
    const chunks = chunkText(text, cfg.chunkSize);
    const samples = [];
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

// Listen for extraction requests from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        try {
            const raw = extractPageContent();
            const characterLimit = request.characterLimit || TRUNC_CONFIG.characterLimit;
            const promptLength = request.promptLength || 0;
            const maxContentLength = characterLimit - promptLength - 50; // Buffer for separator
            const truncated = truncateText(raw, { characterLimit: maxContentLength });

            sendResponse({
                success: true,
                content: truncated,
                originalLength: raw.length,
                truncatedLength: truncated.length
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
    return true; // Keep message channel open for async response
});
