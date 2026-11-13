import OpenAI from 'openai';
import config from '../config/env.js';
import logger from '../loggers/logger.js';
import AppError from '../utils/AppError.js';
import { wrapCall, wrapStreamCall } from '../utils/aiReliabilityWrapper.js';
import geminiFlash from '../config/gemini.js';

const verifiedNvidiaModels = new Set();

export const DEFAULT_CHAT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
// Live fallbacks on build.nvidia.com (fast small model first, then the large one)
const NVIDIA_FALLBACK_MODELS = ['nvidia/nemotron-3.5-bolt-e4b', 'nvidia/nemotron-3-ultra-550b-a55b'];
const RETIRED_MODELS = new Set(['qwen/qwen3-235b-a22b', 'nvidia/nemotron-3-nano-30b-a3b', 'meta/llama-3.1-8b-instruct', 'meta/llama-3.3-70b-instruct']);

// Nemotron models reason before answering by default; disabling it cuts latency ~3x for tutoring answers.
const thinkingParams = (model) => (/nemotron/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {});

class NvidiaChatProvider {
  constructor(options = {}) {
    this.client = null;
    this.studentTutorOnly = options.studentTutorOnly || false;
  }

  normalizeModelName(modelName) {
    if (RETIRED_MODELS.has(modelName)) {
      return DEFAULT_CHAT_MODEL;
    }
    return modelName;
  }

  isVerified(modelName) {
    const normalized = this.normalizeModelName(modelName);
    return verifiedNvidiaModels.has(normalized);
  }

  markModelVerified(modelName) {
    const normalized = this.normalizeModelName(modelName);
    verifiedNvidiaModels.add(normalized);
  }

  getClient() {
    if (!this.client) {
      const apiKey = config.nvidiaApiKey || process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        throw new AppError('NVIDIA_API_KEY is missing from environment variables.', 500);
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
        timeout: 10000,
      });
    }
    return this.client;
  }

  validate() {
    const apiKey = config.nvidiaApiKey || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return { valid: false, error: 'NVIDIA_API_KEY is not configured.' };
    }
    return { valid: true };
  }

  status() {
    return {
      provider: 'nvidia',
      model: config.chatModel || DEFAULT_CHAT_MODEL,
      hasApiKey: !!(config.nvidiaApiKey || process.env.NVIDIA_API_KEY),
    };
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

  getFallbackChain(requestedModel) {
    const targetModel = this.normalizeModelName(requestedModel);
    
    if (this.studentTutorOnly) {
      const baseChain = [
        targetModel,
        ...NVIDIA_FALLBACK_MODELS,
      ];
      // Append other verified NVIDIA models (excluding non-NVIDIA providers)
      const otherVerified = Array.from(verifiedNvidiaModels)
        .filter(m => !m.includes('gemini') && !m.includes('openai') && !m.includes('claude') && !m.includes('anthropic'));
      const combined = [...baseChain, ...otherVerified];
      return Array.from(new Set(combined));
    }
    
    const defaultChain = [
      DEFAULT_CHAT_MODEL,
      ...NVIDIA_FALLBACK_MODELS,
      'gemini-fallback' // routed to geminiFlash, which uses GEMINI_MODEL
    ];
    
    const index = defaultChain.indexOf(targetModel);
    if (index !== -1) {
      return defaultChain.slice(index);
    }
    
    return Array.from(new Set([targetModel, ...defaultChain]));
  }

  async generate(promptOrObject) {
    const validation = this.validate();
    if (!validation.valid) {
      throw new AppError(validation.error, 500);
    }

    const client = this.getClient();
    const messages = this.toMessages(promptOrObject);
    const promptText = messages.map(m => m.content).join('\n');
    const temperature = promptOrObject?.generationConfig?.temperature ?? 0.3;
    const maxTokens = promptOrObject?.generationConfig?.maxOutputTokens ?? 4096;

    const requestedModel = config.chatModel || DEFAULT_CHAT_MODEL;
    const chain = this.getFallbackChain(requestedModel);

    const diagnostics = {
      providerAttempted: [],
      providerFailed: [],
      providerUsed: 'none'
    };

    let lastError = null;
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      const fallbackActivated = i > 0;
      diagnostics.providerAttempted.push(model);

      if (this.studentTutorOnly) {
        const verifiedModel = this.isVerified(requestedModel) ? requestedModel : 'none';
        const verificationSource = this.isVerified(requestedModel) ? 'startup_health_check' : 'none';
        const hardeningDecision = fallbackActivated ? `fallback_to_${model}` : 'use_primary';
        const fallbackReason = fallbackActivated ? (lastError?.message || 'unverified') : 'none';

        logger.info('[NVIDIA Diagnostics]', {
          requestedModel,
          verifiedModel,
          runtimeModel: model,
          verificationSource,
          hardeningDecision,
          fallbackReason
        });
      }

      try {
        logger.info(`Attempting content generation with model: ${model} (fallbackActivated: ${fallbackActivated})`);
        
        const timeoutMs = this.studentTutorOnly ? 8000 : 30000;
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Model request timeout (${timeoutMs}ms exceeded) for ${model}`)), timeoutMs)
        );

        let result;
        if (model.includes('gemini')) {
          result = await Promise.race([
            geminiFlash.generateContent(promptOrObject),
            timeoutPromise
          ]);
          const text = typeof result.response?.text === 'function' ? result.response.text() : result.response?.text || '';
          diagnostics.providerUsed = model;
          return { response: { text: () => text }, diagnostics };
        } else {
          result = await Promise.race([
            wrapCall('nvidia', model, () => client.chat.completions.create({
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              ...thinkingParams(model),
              response_format: promptOrObject?.generationConfig?.responseMimeType === 'application/json' 
                ? { type: 'json_object' } 
                : undefined
            }), promptText, { fallbackActivated }),
            timeoutPromise
          ]);
          const text = result.choices[0]?.message?.content || '';
          this.markModelVerified(model);
          diagnostics.providerUsed = model;
          return { response: { text: () => text }, diagnostics };
        }
      } catch (err) {
        logger.warn(`Generation failed with model ${model}, trying next in fallback chain. Error: ${err.message}`);
        verifiedNvidiaModels.delete(model);
        diagnostics.providerFailed.push(model);
        lastError = err;
      }
    }

    if (this.studentTutorOnly) {
      throw new AppError('NVIDIA service temporarily unavailable', 503);
    }
    throw lastError || new AppError('Generation failed for all models in fallback chain', 500);
  }

  async generateContent(promptOrObject) {
    return this.generate(promptOrObject);
  }

  async generateContentStream(opts) {
    const validation = this.validate();
    if (!validation.valid) {
      throw new AppError(validation.error, 500);
    }

    const client = this.getClient();
    const messages = this.toMessages(opts);
    const promptText = messages.map(m => m.content).join('\n');
    const temperature = opts.generationConfig?.temperature ?? 0.35;
    const maxTokens = opts.generationConfig?.maxOutputTokens ?? 1500;

    const requestedModel = config.chatModel || DEFAULT_CHAT_MODEL;
    const chain = this.getFallbackChain(requestedModel);

    const diagnostics = {
      providerAttempted: [],
      providerFailed: [],
      providerUsed: 'none'
    };

    let lastError = null;
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      const fallbackActivated = i > 0;
      diagnostics.providerAttempted.push(model);

      if (this.studentTutorOnly) {
        const verifiedModel = this.isVerified(requestedModel) ? requestedModel : 'none';
        const verificationSource = this.isVerified(requestedModel) ? 'startup_health_check' : 'none';
        const hardeningDecision = fallbackActivated ? `fallback_to_${model}` : 'use_primary';
        const fallbackReason = fallbackActivated ? (lastError?.message || 'unverified') : 'none';

        logger.info('[NVIDIA Diagnostics]', {
          requestedModel,
          verifiedModel,
          runtimeModel: model,
          verificationSource,
          hardeningDecision,
          fallbackReason
        });
      }

      try {
        logger.info(`Attempting content streaming with model: ${model} (fallbackActivated: ${fallbackActivated})`);
        
        let wrappedStream;
        const timeoutMs = this.studentTutorOnly ? 8000 : 3000;
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Streaming request timeout (${timeoutMs}ms exceeded) for ${model}`)), timeoutMs)
        );

        if (model.includes('gemini')) {
          wrappedStream = await Promise.race([
            geminiFlash.generateContentStream(opts),
            timeoutPromise
          ]);
        } else {
          wrappedStream = await Promise.race([
            wrapStreamCall('nvidia', model, async () => {
              const stream = await client.chat.completions.create({
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: true,
                ...thinkingParams(model),
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
            }, promptText, { fallbackActivated }),
            timeoutPromise
          ]);
        }

        this.markModelVerified(model);
        diagnostics.providerUsed = model;
        return { stream: wrappedStream.stream, diagnostics };
      } catch (err) {
        logger.warn(`Streaming failed with model ${model}, trying next in fallback chain. Error: ${err.message}`);
        verifiedNvidiaModels.delete(model);
        diagnostics.providerFailed.push(model);
        lastError = err;
      }
    }

    if (this.studentTutorOnly) {
      throw new AppError('NVIDIA service temporarily unavailable', 503);
    }
    throw lastError || new AppError('Streaming failed for all models in fallback chain', 500);
  }

  async streamChat(opts) {
    return this.generateContentStream(opts);
  }
}

export const nvidiaChatProvider = new NvidiaChatProvider({ studentTutorOnly: false });
export const studentNvidiaProvider = new NvidiaChatProvider({ studentTutorOnly: true });
export { verifiedNvidiaModels };
export default nvidiaChatProvider;
