import config from '../config/env.js';

export const modelRegistry = {
  image: {
    default: 'flux-1-schnell',
    textHeavy: 'qwen-image',
    premium: 'flux-1-dev',
  },
  presentation: {
    default: config.presentationModel || 'gemini-2.5-flash',
  },
  audio: {
    default: config.audioModel || 'gemini-2.5-flash',
  },
  
  resolveImageModel(categoryCode) {
    return this.image[categoryCode] || this.image.default;
  },
  
  resolvePresentationModel() {
    return this.presentation.default;
  },
  
  resolveAudioModel() {
    return this.audio.default;
  }
};

export default modelRegistry;
