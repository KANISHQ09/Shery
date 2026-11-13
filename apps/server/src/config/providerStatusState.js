import config from './env.js';

export const providerHealthStatus = {
  chatProvider: 'nvidia',
  chatModel: config.chatModel || 'nvidia/nemotron-3.5-lightning-30b-a3b',
  geminiModel: config.geminiModel || 'gemini-3.5-flash-lite',
  providerStatus: 'healthy',
  quotaStatus: 'active',
  searchMode: 'full'
};

export default providerHealthStatus;
