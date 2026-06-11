import OpenAI from 'openai';
import config from '../config/env.js';
import logger from '../loggers/logger.js';
import AppError from '../utils/AppError.js';
import modelRegistry from './modelRegistry.js';

class ImageProvider {
  constructor() {
    this.client = null;
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
      provider: config.imageProvider || 'nvidia',
      defaultModel: modelRegistry.image.default,
      textModel: modelRegistry.image.textHeavy,
      premiumModel: modelRegistry.image.premium,
      hasApiKey: !!(config.nvidiaApiKey || process.env.NVIDIA_API_KEY),
    };
  }

  /**
   * Generates an image buffer.
   * @param {string} prompt
   * @param {object} options
   * @returns {Promise<{ buffer: Buffer, provider: string, model: string }>}
   */
  async generate(prompt, options = {}) {
    const validation = this.validate();
    if (!validation.valid) {
      logger.error('NVIDIA NIM image validation failed', { error: validation.error });
      throw new AppError(`Image provider validation failed: ${validation.error}`, 500);
    }

    const client = this.getClient();

    // Resolve model name via Registry
    let modelCode = options.modelCode || 'default';
    if (options.premium) {
      modelCode = 'premium';
    }
    const modelName = modelRegistry.resolveImageModel(modelCode);

    // Map short names to full NVIDIA NIM model IDs
    const modelMappings = {
      'flux-1-schnell': 'blackforestlabs/flux-1-schnell',
      'flux-1-dev': 'blackforestlabs/flux-1-dev',
      'qwen-image': 'qwen/qwen-image',
    };

    const finalModel = modelMappings[modelName] || modelName;
    logger.info('Generating image via NVIDIA NIM', { model: finalModel, promptLength: prompt.length });

    try {
      const response = await client.images.generate({
        model: finalModel,
        prompt,
        n: 1,
      });

      const tempCdnUrl = response.data?.[0]?.url;
      if (!tempCdnUrl) {
        throw new AppError(`No image URL returned from NVIDIA NIM for model ${finalModel}`, 500);
      }

      const imgRes = await fetch(tempCdnUrl);
      if (!imgRes.ok) {
        throw new AppError('Failed to download image from NVIDIA NIM temporary CDN.', 500);
      }

      const buffer = Buffer.from(await imgRes.arrayBuffer());
      return { buffer, provider: 'nvidia', model: finalModel };
    } catch (err) {
      logger.error('NVIDIA NIM image generation failed', { error: err.message, model: finalModel });
      throw new AppError(`NVIDIA NIM image generation failed: ${err.message}`, 500);
    }
  }
}

export const imageProvider = new ImageProvider();
export default imageProvider;
