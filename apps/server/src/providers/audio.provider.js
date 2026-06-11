import OpenAI from 'openai';
import config from '../config/env.js';
import logger from '../loggers/logger.js';
import AppError from '../utils/AppError.js';
import modelRegistry from './modelRegistry.js';
import { wrapCall, withExponentialBackoff } from '../utils/aiReliabilityWrapper.js';
import { verifiedModels } from '../config/gemini.js';

class AudioProvider {
  constructor() {
    this.client = null;
  }

  getClient() {
    if (!this.client) {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new AppError('GEMINI_API_KEY is missing from environment variables.', 500);
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
    }
    return this.client;
  }

  validate() {
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { valid: false, error: 'GEMINI_API_KEY is not configured.' };
    }
    return { valid: true };
  }

  status() {
    return {
      provider: 'gemini',
      model: modelRegistry.resolveAudioModel(),
      hasApiKey: !!(config.geminiApiKey || process.env.GEMINI_API_KEY),
    };
  }

  validateModel(modelName) {
    const cleanName = String(modelName || '').replace(/^models\//, '');
    if (verifiedModels.has(cleanName) || verifiedModels.has(modelName)) {
      return modelName;
    }
    logger.warn(`[HARDENING] Model "${modelName}" is unverified or unavailable. Falling back to gemini-2.5-flash-lite`);
    return 'gemini-2.5-flash-lite';
  }

  /**
   * Generates structured script text (narration script outline only).
   * @param {object} promptOrObject 
   * @returns {Promise<{ text: string, model: string }>}
   */
  async generate(promptOrObject, options = {}) {
    const validation = this.validate();
    if (!validation.valid) {
      throw new AppError(validation.error, 500);
    }

    const client = this.getClient();
    const rawModel = modelRegistry.resolveAudioModel();
    const model = this.validateModel(rawModel);

    const systemInstruction = promptOrObject.systemInstruction;
    const contents = promptOrObject.contents || [];
    const temperature = promptOrObject.generationConfig?.temperature ?? 0.45;
    const maxTokens = promptOrObject.generationConfig?.maxOutputTokens ?? 4096;

    const messages = [];
    if (systemInstruction) {
      messages.push({
        role: 'system',
        content: typeof systemInstruction === 'string'
          ? systemInstruction
          : (systemInstruction.text || systemInstruction.parts?.map(p => p.text).join('') || ''),
      });
    }

    for (const item of contents) {
      messages.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts?.map((part) => part.text).join('') || '',
      });
    }

    const queryOptions = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    logger.info('Generating audio script via Gemini', { model, messagesCount: messages.length });

    const promptText = messages.map(m => m.content).join('\n');
    try {
      const result = await withExponentialBackoff(() =>
        wrapCall('gemini', model, () => client.chat.completions.create(queryOptions), promptText)
      );
      const text = result.choices[0]?.message?.content || '';
      return { text, model };
    } catch (err) {
      logger.error('Gemini audio script generation failed', { error: err.message });
      throw err;
    }
  }
}

export const audioProvider = new AudioProvider();
export default audioProvider;
