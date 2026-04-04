// Default Chatbots - preserved from userscript
export const DEFAULT_CHATBOTS = {
    'chatgpt': {
        id: 'chatgpt',
        name: 'ChatGPT',
        url: 'https://chatgpt.com',
        characterLimit: 40000
    },
    'claude': {
        id: 'claude',
        name: 'Claude',
        url: 'https://claude.ai/new',
        characterLimit: 50000
    },
    'gemini': {
        id: 'gemini',
        name: 'Gemini',
        url: 'https://gemini.google.com/app',
        characterLimit: 32000
    },
    'grok': {
        id: 'grok',
        name: 'Grok',
        url: 'https://grok.com',
        characterLimit: 100000
    },
    'deepseek': {
        id: 'deepseek',
        name: 'DeepSeek',
        url: 'https://chat.deepseek.com',
        characterLimit: 200000
    },
    'gemini_studio': {
        id: 'gemini_studio',
        name: 'Gemini AI Studio',
        url: 'https://aistudio.google.com/prompts/new_chat',
        characterLimit: 100000
    }
};

// Default Prompts - preserved from userscript
export const DEFAULT_PROMPTS = [
    {
        id: 'none',
        name: 'No Prompt (Raw Text Only)',
        content: '',
        isDefault: true
    },
    {
        id: 'summary',
        name: 'Bite-Sized Summary',
        content: `Please summarize the following text in under 100 words.
Instructions
1. The summary should be well formatted and easily scannable.
2. Don't start the text with "Let me...", or "Here is the summary...". Just give the results.
3. Please keep it SHORT, no more than 100 words!`,
        isDefault: true
    },
    {
        id: '5-10-points',
        name: 'Key Point Extraction',
        content: `Please provide the 5-10 most important points from the text.
Use bullet points and emojis to break up the text.`,
        isDefault: true
    },
    {
        id: 'key-points-summary',
        name: 'Full Detailed Summary',
        content: `Please provide a summary of the following content in its original tone:
1. First, give a concise one-sentence summary that captures the core message/theme
2. Then, share a breakdown of the main topics discussed. For each topic:
   - Expound very briefly on what was discussed on each topic
   - Include any notable quotes or statistics if any.
3. End with a brief takeaways
4. Don't go beyond 200 words.
5. Don't start the text with "Let me...", or "Here is the summary...". Just give the results.`,
        isDefault: true
    },
    {
        id: 'short-form',
        name: 'Section-Wise Summary',
        content: `Summarize the following content how Blinkist would.
Keep the tone of the content. Keep it conversational.
Break the headers using relevant dynamic emojis.
Go beyond the title in giving the summary, look through entire content.
Sprinkle in quotes or excerpts to better link the summary to the content.
For less than 30 mins long content, don't go beyond 150 words.
For 1hr+ long content don't go beyond 300 words.
Don't start the text with "Let me...", or "Here is the summary...". Just give the results.`,
        isDefault: true
    }
];

// Truncation Config - preserved from userscript
export const TRUNC_CONFIG = {
    characterLimit: 20000,
    initialContentRatio: 0.4,
    chunkSize: 300,
    minChunksPerSegment: 3
};

// Default Settings
export const DEFAULT_SETTINGS = {
    selectedPromptId: 'summary',
    selectedChatbotId: 'chatgpt',
    includePrompt: true,
    openChatbot: true,
    extractionAlgorithm: 1,
    sidebarEnabled: true,
    sidebarPosition: 'right',
    sidebarShowNames: false
};

// Default Preferred Chatbots
export const DEFAULT_PREFERRED_CHATBOTS = ['chatgpt', 'claude', 'gemini'];

// Available Extraction Algorithms
export const ALGORITHMS = {
    1: { id: 1, name: "Text Extraction (Lightweight)" },
    2: { id: 2, name: "Optimized Content (Includes YT Transcript)" },
    3: { id: 3, name: "Full Content Extraction (Readability)" }
};
