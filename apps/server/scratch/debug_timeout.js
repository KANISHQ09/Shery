import StudioGenerationService from '../src/services/workspace/studioGeneration.service.js';
import logger from '../src/loggers/logger.js';

const mockVectorSearch = {
  hybridSearch: async () => {
    return new Promise((resolve) => setTimeout(() => resolve([]), 500));
  }
};
const mockContextManager = {
  assembleContext: async () => ({ contextText: '', sourcesUsed: [] })
};
const mockOutputRepo = {
  create: async () => ({ id: 'out_new' }),
  update: async () => ({ status: 'ready', content: 'done' }),
};
const mockChatProvider = {
  generateContent: async () => {
    return new Promise(() => {});
  }
};

const service = new StudioGenerationService({
  vectorSearchService: mockVectorSearch,
  contextManagerService: mockContextManager,
  workspaceOutputRepository: mockOutputRepo,
  chatProvider: mockChatProvider,
  vectorSearchTimeout: 10,
  llmTimeout: 20,
  overallTimeout: 100,
});

logger.info('Starting manual debug run');
try {
  const res = await service.generate('ws_1', 'interview_questions');
  logger.info('Generate returned', res);
} catch (err) {
  logger.error('Generate threw error', err);
}
