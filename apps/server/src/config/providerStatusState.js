import config from './env.js';

export const providerHealthStatus = {
  chatProvider: 'nvidia',
  chatModel: config.chatModel || 'nvidia/nemotron-3-nano-30b-a3b',
  presentationModel: config.presentationModel || 'gemini-2.5-flash',
  audioModel: config.audioModel || 'gemini-2.5-flash',
  providerStatus: 'healthy',
  quotaStatus: 'active',
  searchMode: 'full'
};

export default providerHealthStatus;
