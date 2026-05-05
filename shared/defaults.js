// Default Chatbots
export const DEFAULT_CHATBOTS = {
    'chatgpt': {
        id: 'chatgpt',
        name: 'ChatGPT',
        url: 'https://chatgpt.com',
        characterLimit: 200000,
        promptInputSelector: '#prompt-textarea'
    },
    'claude': {
        id: 'claude',
        name: 'Claude',
        url: 'https://claude.ai/new',
        characterLimit: 200000,
        promptInputSelector: '[contenteditable="true"]'
    },
    'gemini': {
        id: 'gemini',
        name: 'Gemini',
        url: 'https://gemini.google.com/app',
        characterLimit: 400000,
        promptInputSelector: "div[aria-label='Enter a prompt for Gemini']"
    },
    'grok': {
        id: 'grok',
        name: 'Grok',
        url: 'https://grok.com',
        characterLimit: 200000,
        // Use the stable tiptap ProseMirror class — the long Tailwind classname changes on deploys
        promptInputSelector: 'div.tiptap.ProseMirror[contenteditable="true"]',
        // buttons are body-mounted, position tracked via getBoundingClientRect
        injectorPosition: 'inside'
    },
    'deepseek': {
        id: 'deepseek',
        name: 'DeepSeek',
        url: 'https://chat.deepseek.com',
        characterLimit: 200000,
        promptInputSelector: "textarea[placeholder='Message DeepSeek']"
    },
    'gemini_studio': {
        id: 'gemini_studio',
        name: 'Gemini AI Studio',
        url: 'https://aistudio.google.com/prompts/new_chat',
        characterLimit: 100000,
        promptInputSelector: 'textarea'
    },
    'copilot': {
        id: 'copilot',
        name: 'Microsoft Copilot',
        url: 'https://copilot.microsoft.com/',
        characterLimit: 40000,
        promptInputSelector: '#userInput'
    },
    'qwen': {
        id: 'qwen',
        name: 'Qwen',
        url: 'https://chat.qwen.ai/',
        characterLimit: 300000,
        promptInputSelector: "textarea[placeholder='How can I help you today?']",
        buttonInjectorSelector: ".message-input-container",
    },
    'minimax': {
        id: 'minimax',
        name: 'MiniMax AI',
        url: 'https://agent.minimax.io/',
        characterLimit: 300000,
        promptInputSelector: '.tiptap.ProseMirror.tiptap-editor'
    },
    'mistral': {
        id: 'mistral',
        name: 'LeChat Mistral',
        url: 'https://chat.mistral.ai/chat',
        characterLimit: 200000,
        promptInputSelector: '.ProseMirror'
    },
    'kimi': {
        id: 'kimi',
        name: 'Kimi AI',
        url: 'https://www.kimi.com/',
        characterLimit: 200000,
        promptInputSelector: "div[role='textbox']"
    },
    'zai': {
        id: 'zai',
        name: 'Z.ai',
        url: 'https://chat.z.ai/',
        characterLimit: 200000,
        promptInputSelector: '#chat-input'
    },
    'reka': {
        id: 'reka',
        name: 'Reka Chat',
        url: 'https://app.reka.ai/chat',
        characterLimit: 200000,
        promptInputSelector: '#message'
    },
    'inception': {
        id: 'inception',
        name: 'Inception Chat',
        url: 'https://chat.inceptionlabs.ai/',
        characterLimit: 200000,
        promptInputSelector: "textarea[placeholder='How can I help you?']"
    },
    'ai2': {
        id: 'ai2',
        name: 'Ai2 Playground',
        url: 'https://playground.allenai.org/',
        characterLimit: 200000,
        promptInputSelector: "textarea[placeholder='Message Olmo 3.1 32B Instruct']"
    },
    'alice': {
        id: 'alice',
        name: 'Alice AI',
        url: 'https://alice.yandex.ru/',
        characterLimit: 300000,
        promptInputSelector: "textarea[placeholder='Спросите о чём угодно']"
    },
    'xiaomimimo': {
        id: 'xiaomimimo',
        name: 'Xiaomi MiMo',
        url: 'https://aistudio.xiaomimimo.com/#/c',
        characterLimit: 300000,
        promptInputSelector: "textarea[placeholder='Sign in to continue chatting']"
    }
};

// Default Prompts
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

// Truncation Config
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
    iframeSource: 'main',
    sidebarEnabled: true,
    sidebarPosition: 'right',
    sidebarShowNames: false,
    injectorPosition: 'inside'
};

// Default Preferred Chatbots
export const DEFAULT_PREFERRED_CHATBOTS = ['chatgpt', 'claude', 'gemini'];

// Available Extraction Algorithms
export const ALGORITHMS = {
    1: { id: 1, name: "Text Extraction (Lightweight)" },
    2: { id: 2, name: "Optimized Content (Includes YT Transcript)" },
    3: { id: 3, name: "Full Content Extraction (Readability)" }
};
