import OpenAI from 'openai';
import config from './env.js';
import { getNvidiaClient, getNvidiaModel } from './nvidia.js';
import { wrapCall, wrapStreamCall } from '../utils/aiReliabilityWrapper.js';
import logger from '../loggers/logger.js';

// Used when GEMINI_MODEL is not in the verified list (e.g. retired). Must be on the free tier.
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Cache/set of verified model names. Initialized with known defaults.
export let verifiedModels = new Set([
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
]);

export function updateVerifiedModels(modelsList) {
  if (Array.isArray(modelsList) && modelsList.length > 0) {
    verifiedModels = new Set(modelsList.map(m => String(m).replace(/^models\//, '')));
    logger.info('[HARDEING] Verified model list synchronized with API', { count: verifiedModels.size });
  }
}

class GeminiCompatibleAiClient {
  getClient() {
    if (config.geminiApiKey) {
      return new OpenAI({
        apiKey: config.geminiApiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
    }
    return getNvidiaClient();
  }

  getModel() {
    if (config.geminiApiKey) {
      return config.geminiModel;
    }
    return getNvidiaModel();
  }

  // Extra request params when running on NVIDIA (no Gemini key): skip Nemotron "thinking" for speed.
  providerParams(model) {
    if (config.geminiApiKey) return {};
    return /nemotron/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {};
  }

  validateModel(modelName) {
    // The verified list only knows Gemini models; when falling back to NVIDIA, use its model as-is.
    if (!config.geminiApiKey) {
      return modelName;
    }
    const cleanName = String(modelName || '').replace(/^models\//, '');
    if (verifiedModels.has(cleanName) || verifiedModels.has(modelName)) {
      return modelName;
    }
    logger.warn(`[HARDENING] Model "${modelName}" is unverified or unavailable. Falling back to ${FALLBACK_GEMINI_MODEL}`);
    return FALLBACK_GEMINI_MODEL;
  }

  toMessages(promptOrObject) {
    if (typeof promptOrObject === 'string') {
      return [{ role: 'user', content: promptOrObject }];
    }

    const messages = [];
    if (promptOrObject?.systemInstruction) {
      const systemInstruction = promptOrObject.systemInstruction;
      messages.push({
        role: 'system',
        content: typeof systemInstruction === 'string'
          ? systemInstruction
          : (systemInstruction.text || systemInstruction.parts?.map(p => p.text).join('') || ''),
      });
    }

    for (const item of promptOrObject?.contents || []) {
      messages.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts?.map((part) => part.text).join('') || '',
      });
    }

    return messages;
  }

  async generateContent(promptOrObject) {
    const client = this.getClient();
    const rawModel = this.getModel();
    const model = this.validateModel(rawModel);
    const messages = this.toMessages(promptOrObject);
    const promptText = messages.map(m => m.content).join('\n');

    const options = {
      model,
      messages,
      temperature: promptOrObject?.generationConfig?.temperature ?? 0.3,
      max_tokens: promptOrObject?.generationConfig?.maxOutputTokens ?? 4096,
      ...this.providerParams(model),
    };

    if (promptOrObject?.generationConfig?.responseMimeType === 'application/json') {
      options.response_format = { type: 'json_object' };
    }

    const result = await wrapCall('gemini', model, () => client.chat.completions.create(options), promptText);
    const text = result.choices[0]?.message?.content || '';
    return { response: { text: () => text } };
  }

  async generateContentStream(opts) {
    const client = this.getClient();
    const rawModel = this.getModel();
    const model = this.validateModel(rawModel);
    const messages = this.toMessages(opts);
    const promptText = messages.map(m => m.content).join('\n');

    const wrappedStream = await wrapStreamCall('gemini', model, async () => {
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: opts.generationConfig?.temperature ?? 0.35,
        max_tokens: opts.generationConfig?.maxOutputTokens ?? 1500,
        stream: true,
        ...this.providerParams(model),
      }, {
        signal: opts.signal,
      });
      return {
        stream: (async function* streamChunks() {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) yield { text: () => text };
          }
        })()
      };
    }, promptText);

    return wrappedStream;
  }
}

export const geminiFlash = new GeminiCompatibleAiClient();
export default geminiFlash;
