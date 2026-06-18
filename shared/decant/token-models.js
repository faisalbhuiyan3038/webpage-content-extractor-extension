/**
 * Model-specific token estimation for LLM context window awareness.
 * Approximations calibrated per tokenizer family.
 */

export const TOKEN_MODELS = [
  { id: 'claude',  label: 'Claude 3.5 / 4 / 4.5 / 4.6 / 5', family: 'claude',        ratio: 3.8 },
  { id: 'gpt4o',   label: 'GPT-4o / 4.1 / o3',               family: 'tiktoken',       ratio: 4.0 },
  { id: 'gpt5',    label: 'GPT-5 / 5.2',                      family: 'tiktoken',       ratio: 3.9 },
  { id: 'llama',   label: 'Llama 3 / 3.1 / 4',                family: 'sentencepiece',  ratio: 3.5 },
  { id: 'gemini',  label: 'Gemini 2.5 Pro / Flash',            family: 'sentencepiece',  ratio: 3.7 },
  { id: 'mistral', label: 'Mistral Large / Medium',            family: 'sentencepiece',  ratio: 3.6 },
];

// Context windows in K (1K = 1024 tokens)
export const CONTEXT_WINDOWS = {
  claude:  200,
  gpt4o:   128,
  gpt5:    256,
  llama:   128,
  gemini:  1000,
  mistral: 128,
};

/**
 * Estimate tokens for a specific model.
 * @param {string} text - Content to estimate
 * @param {string} modelId - Key from TOKEN_MODELS
 * @returns {{ tokens: number, pctContext: number, modelId: string }}
 */
export function estimateForModel(text, modelId = 'claude') {
  if (!text) return { tokens: 0, pctContext: 0, modelId };
  const model = TOKEN_MODELS.find(m => m.id === modelId) || TOKEN_MODELS[0];
  const tokens = Math.round(text.length / model.ratio);
  const contextK = CONTEXT_WINDOWS[modelId] || 128;
  const pctContext = Math.round((tokens / (contextK * 1024)) * 100);
  return { tokens, pctContext, modelId };
}

/**
 * Estimate tokens for ALL models at once.
 * @param {string} text
 * @returns {Object<string, { tokens: number, pctContext: number }>}
 */
export function estimateAllModels(text) {
  const result = {};
  for (const model of TOKEN_MODELS) {
    result[model.id] = estimateForModel(text, model.id);
  }
  return result;
}
