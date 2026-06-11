import config from '../config/env.js';
import logger from '../loggers/logger.js';
import AppError from '../utils/AppError.js';
import imageProvider from './image.provider.js';
import { logTelemetry } from '../utils/aiReliabilityWrapper.js';

class GeminiImageProvider {
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
      model: config.imageModel || 'gemini-2.5-flash-image-preview',
      hasApiKey: !!(config.geminiApiKey || process.env.GEMINI_API_KEY),
    };
  }

  async generate(prompt, options = {}) {
    const validation = this.validate();
    if (!validation.valid) {
      logger.error('Gemini image validation failed', { error: validation.error });
      throw new AppError(`Image provider validation failed: ${validation.error}`, 500);
    }

    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    const model = config.imageModel || 'gemini-2.5-flash-image-preview';

    const startTime = Date.now();
    
    // 1. Try Gemini Image Generation
    try {
      logger.info('Generating image via Gemini Image API', { model, promptLength: prompt.length });
      
      // Handle fallback check for the model name mapping if needed, e.g. mapping "gemini-2.5-flash-image-preview" to "imagen-3.0-generate-002"
      // Wait, let's map "gemini-2.5-flash-image-preview" or use it directly as specified.
      // If we use standard Vertex/Studio naming, imagen-3.0-generate-002 is widely supported. We'll use the model variable directly.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              prompt,
            },
          ],
          parameters: {
            sampleCount: 1,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Image API error (HTTP ${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
      if (!base64Data) {
        throw new Error('No image predictions or base64 data returned from Gemini Image API');
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const latencyMs = Date.now() - startTime;
      
      logTelemetry({
        provider: 'gemini',
        model,
        statusCode: 200,
        latencyMs,
        tokenCount: { input: 0, output: 0, total: 0 },
        fallbackActivated: false
      });

      return { buffer, provider: 'gemini', model };
    } catch (err) {
      // 2. Fallback to FLUX.1-Schnell via imageProvider
      logger.warn('Gemini image generation failed. Automatically falling back to FLUX.1-Schnell.', { error: err.message });
      try {
        const fallbackResult = await imageProvider.generate(prompt, { ...options, modelCode: 'default' });
        const latencyMs = Date.now() - startTime;
        
        logTelemetry({
          provider: 'nvidia',
          model: fallbackResult.model,
          statusCode: 200,
          latencyMs,
          tokenCount: { input: 0, output: 0, total: 0 },
          fallbackActivated: true
        });

        return {
          buffer: fallbackResult.buffer,
          provider: fallbackResult.provider,
          model: fallbackResult.model,
          fallbackActivated: true
        };
      } catch (fallbackErr) {
        logger.error('Fallback image generation via FLUX.1-Schnell also failed.', { error: fallbackErr.message });
        throw fallbackErr;
      }
    }
  }
}

export const geminiImageProvider = new GeminiImageProvider();
export default geminiImageProvider;
