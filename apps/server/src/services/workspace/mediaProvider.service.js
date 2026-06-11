import logger from '../../loggers/logger.js';
import geminiImageProvider from '../../providers/geminiImage.provider.js';
import audioProvider from '../../providers/audio.provider.js';

class MediaProviderService {
  /**
   * Generates an image buffer using the abstracted provider.
   * @param {string} prompt 
   * @param {object} options 
   * @returns {Promise<{ buffer: Buffer, provider: string, model: string }>}
   */
  async generateImage(prompt, options = {}) {
    logger.info('MediaProviderService: delegating image generation to geminiImageProvider');
    return geminiImageProvider.generate(prompt, options);
  }

  /**
   * Speech synthesis is deprecated/disabled for the current MVP strategy.
   * Exposing a stub method in case of leftover service calls.
   */
  async generateSpeech(text, options = {}) {
    logger.warn('MediaProviderService: generateSpeech called but direct TTS is disabled in V2 strategy.');
    return audioProvider.generate(text, options);
  }
}

export default MediaProviderService;
