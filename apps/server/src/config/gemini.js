import OpenAI from 'openai';
import config from './env.js';
import { getNvidiaClient, getNvidiaModel } from './nvidia.js';
import { wrapCall, wrapStreamCall } from '../utils/aiReliabilityWrapper.js';
import logger from '../loggers/logger.js';

// Cache/set of verified model names. Initialized with known defaults.
export let verifiedModels = new Set([
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-3.5-flash'
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

  validateModel(modelName) {
    const cleanName = String(modelName || '').replace(/^models\//, '');
    if (verifiedModels.has(cleanName) || verifiedModels.has(modelName)) {
      return modelName;
    }
    logger.warn(`[HARDENING] Model "${modelName}" is unverified or unavailable. Falling back to gemini-2.5-flash-lite`);
    return 'gemini-2.5-flash-lite';
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
