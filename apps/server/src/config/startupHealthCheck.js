import config from './env.js';
import logger from '../loggers/logger.js';
import geminiFlash, { updateVerifiedModels } from './gemini.js';
import { providerHealthStatus } from './providerStatusState.js';
import { qdrantHealthCheck } from '../infrastructure/qdrant.js';
import nvidiaChatProvider from '../providers/nvidiaChat.provider.js';

export async function runStartupHealthChecks() {
  logger.info('[STARTUP HEALTH CHECK] Initiating Provider & Infrastructure verification...');

  // Set health check statuses
  providerHealthStatus.chatProvider = config.chatProvider;
  providerHealthStatus.chatModel = config.chatModel;
  providerHealthStatus.geminiModel = config.geminiModel;

  let providerStatus = 'healthy';
  let quotaStatus = 'active';

  // Step 1: Verify Qdrant
  logger.info('[STARTUP HEALTH CHECK] Verifying Qdrant connectivity...');
  const qdrantCheck = await qdrantHealthCheck();
  if (!qdrantCheck.healthy) {
    logger.error(`[STARTUP HEALTH CHECK] CRITICAL: Qdrant is unhealthy! ${qdrantCheck.error || ''}`);
    providerStatus = 'unhealthy';
    providerHealthStatus.providerStatus = 'unhealthy';
    providerHealthStatus.searchMode = 'degraded';
    if (config.isProduction()) {
      throw new Error(`Qdrant is unhealthy: ${qdrantCheck.error || 'Connection failed'}`);
    } else {
      logger.warn('[STARTUP HEALTH CHECK] Qdrant failure in development. Continuing in degraded mode.');
    }
  } else {
    logger.info('[STARTUP HEALTH CHECK] Qdrant verified successfully.');
  }

  // Step 2: Verify Embedding Model
  logger.info('[STARTUP HEALTH CHECK] Verifying Embedding model...');
  try {
    const { default: container } = await import('../container.js');
    const testEmbedding = await container.embeddingService.providerRegistry.generateEmbeddings(['healthcheck']);
    if (!testEmbedding || testEmbedding.length === 0) {
      throw new Error('Embedding model check returned empty vectors');
    }
    logger.info('[STARTUP HEALTH CHECK] Embedding model verified successfully.');
  } catch (err) {
    logger.error(`[STARTUP HEALTH CHECK] CRITICAL: Embedding model check failed: ${err.message}`);
    providerStatus = 'unhealthy';
    providerHealthStatus.providerStatus = 'unhealthy';
    providerHealthStatus.searchMode = 'degraded';
    if (config.isProduction()) {
      throw new Error(`Embedding model check failed: ${err.message}`);
    } else {
      logger.warn(`[STARTUP HEALTH CHECK] Embedding check failure in development. Continuing in degraded mode.`);
    }
  }

  // Step 3: Verify Gemini API (optional — geminiFlash falls back to NVIDIA when no key is set)
  const geminiApiKey = config.geminiApiKey;
  if (!geminiApiKey) {
    logger.warn('[STARTUP HEALTH CHECK] GEMINI_API_KEY not set. Lesson metadata and query rewriting will use NVIDIA.');
  } else {
  logger.info('[STARTUP HEALTH CHECK] Verifying Gemini model connectivity...');
  // Fetch verified models list
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        updateVerifiedModels(data.models.map(m => m.name));
      }
    }
  } catch (err) {
    logger.warn('[STARTUP HEALTH CHECK] Failed to fetch verified models list from Gemini API (non-fatal)', { error: err.message });
  }

  const geminiModelsToTest = [
    { name: 'GEMINI_MODEL', value: config.geminiModel },
  ];

  const geminiClient = geminiFlash.getClient();
  for (const modelConfig of geminiModelsToTest) {
    try {
      await geminiClient.chat.completions.create({
        model: modelConfig.value,
        messages: [{ role: 'user', content: 'healthcheck' }],
        max_tokens: 1
      });
      logger.info(`[STARTUP HEALTH CHECK] Gemini ${modelConfig.name} ("${modelConfig.value}") verified successfully.`);
    } catch (err) {
      if (err.message?.includes('rate-limited') || err.message?.includes('quota') || err.statusCode === 429) {
        quotaStatus = 'exhausted';
      }
      providerStatus = 'unhealthy';
      logger.error(`[STARTUP HEALTH CHECK] Gemini ${modelConfig.name} ("${modelConfig.value}") failed check: ${err.message}`);
    }
  }
  }

  // Step 4: Verify NVIDIA API (using CHAT_MODEL)
  const nvidiaApiKey = config.nvidiaApiKey || process.env.NVIDIA_API_KEY;
  if (!nvidiaApiKey) {
    logger.error('[STARTUP HEALTH CHECK] NVIDIA_API_KEY is missing from environment.');
    providerStatus = 'unhealthy';
  } else {
    logger.info('[STARTUP HEALTH CHECK] Verifying NVIDIA model connectivity...');
    try {
      let chatModelToTest = config.chatModel || 'nvidia/nemotron-3.5-lightning-30b-a3b';
      if (chatModelToTest === 'qwen/qwen3-235b-a22b') {
        chatModelToTest = 'nvidia/nemotron-3.5-lightning-30b-a3b';
      }
      await nvidiaChatProvider.generate({
        contents: [{ role: 'user', parts: [{ text: 'healthcheck' }] }],
        generationConfig: { maxOutputTokens: 1 }
      });
      logger.info(`[STARTUP HEALTH CHECK] NVIDIA Chat model ("${chatModelToTest}") verified successfully.`);
      nvidiaChatProvider.markModelVerified(chatModelToTest);
    } catch (err) {
      providerStatus = 'unhealthy';
      logger.error(`[STARTUP HEALTH CHECK] NVIDIA Chat model ("${config.chatModel}") failed check: ${err.message}`);
    }
  }

  providerHealthStatus.providerStatus = providerStatus;
  providerHealthStatus.quotaStatus = quotaStatus;

  return { providerStatus, quotaStatus };
}
