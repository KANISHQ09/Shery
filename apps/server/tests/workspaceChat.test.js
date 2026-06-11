import { vi, describe, it, expect, beforeEach } from 'vitest';
import WorkspaceChatService from '../src/services/workspace/workspaceChat.service.js';
import { providerHealthStatus } from '../src/config/providerStatusState.js';

describe('WorkspaceChatService - Degraded Retrieval Mode & Fail-safes', () => {
  let mockVectorSearch;
  let mockContextManager;
  let mockWorkspaceMemory;
  let mockChatRepo;
  let mockChatProvider;
  let mockRetrievalEvaluation;
  let mockSourceRepo;
  let chatService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVectorSearch = {
      hybridSearch: vi.fn(),
      runLayeredFallbacks: vi.fn(),
    };

    mockContextManager = {
      assembleContext: vi.fn().mockResolvedValue({
        contextText: 'Mocked context contents',
        sourcesUsed: [{ id: 'src-1', title: 'Test Document' }]
      }),
    };

    mockWorkspaceMemory = {
      getAdaptivePromptContext: vi.fn().mockResolvedValue('Memory context'),
      getOrCreateLearningGraph: vi.fn().mockResolvedValue([]),
      recordInteraction: vi.fn(),
    };

    mockChatRepo = {
      appendMessage: vi.fn(),
    };

    mockChatProvider = {
      generateContentStream: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield { text: () => 'Response chunk 1' };
          yield { text: () => 'Response chunk 2' };
        })()
      }),
      status: vi.fn().mockReturnValue({ provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct' })
    };

    mockRetrievalEvaluation = {
      evaluateRetrieval: vi.fn().mockReturnValue({ relevanceScore: 0.95 }),
    };

    mockSourceRepo = {
      findByWorkspace: vi.fn(),
    };

    chatService = new WorkspaceChatService({
      vectorSearchService: mockVectorSearch,
      contextManagerService: mockContextManager,
      workspaceMemoryService: mockWorkspaceMemory,
      workspaceChatRepository: mockChatRepo,
      chatProvider: mockChatProvider,
      retrievalEvaluationService: mockRetrievalEvaluation,
      workspaceSourceRepository: mockSourceRepo,
    });
  });

  it('Scenario A: Qdrant healthy - retrieves using hybrid search and streams with NVIDIA', async () => {
    providerHealthStatus.searchMode = 'full';
    mockSourceRepo.findByWorkspace.mockResolvedValue([
      { id: 'src-1', title: 'Test Document', status: 'completed', transcript: 'Valid document text contents' }
    ]);
    mockVectorSearch.hybridSearch.mockResolvedValue([
      { text: 'Mocked context contents', sourceId: 'src-1', sourceTitle: 'Test Document' }
    ]);

    const generator = chatService.streamChat({
      workspaceId: 'ws-123',
      message: 'test question',
      chatId: 'chat-456',
      history: []
    });

    const chunks = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    // Verify hybridSearch was called
    expect(mockVectorSearch.hybridSearch).toHaveBeenCalledWith('ws-123', 'test question', { topK: 15 });
    // Verify runLayeredFallbacks was NOT called
    expect(mockVectorSearch.runLayeredFallbacks).not.toHaveBeenCalled();
    // Verify done token exists with correct metadata
    const doneChunk = chunks.find(c => c.type === 'done');
    expect(doneChunk).toBeDefined();
    expect(doneChunk.retrievalMode).toBe('vector');
    expect(doneChunk.fullResponse).toBe('Response chunk 1Response chunk 2');
  });

  it('Scenario B: Qdrant stopped - bypasses hybrid search, uses layered fallbacks, and streams with NVIDIA', async () => {
    providerHealthStatus.searchMode = 'degraded';
    mockSourceRepo.findByWorkspace.mockResolvedValue([
      { id: 'src-1', title: 'Test Document', status: 'completed', transcript: 'Valid document text contents' }
    ]);
    mockVectorSearch.runLayeredFallbacks.mockResolvedValue([
      { text: 'Mocked fallback context contents', sourceId: 'src-1', sourceTitle: 'Test Document' }
    ]);

    const generator = chatService.streamChat({
      workspaceId: 'ws-123',
      message: 'test question',
      chatId: 'chat-456',
      history: []
    });

    const chunks = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    // Verify runLayeredFallbacks was called directly
    expect(mockVectorSearch.runLayeredFallbacks).toHaveBeenCalledWith('ws-123', 'test question', 15);
    // Verify hybridSearch was NOT called
    expect(mockVectorSearch.hybridSearch).not.toHaveBeenCalled();
    // Verify done token exists with degraded retrievalMode
    const doneChunk = chunks.find(c => c.type === 'done');
    expect(doneChunk).toBeDefined();
    expect(doneChunk.retrievalMode).toBe('fallback');
  });

  it('Scenario C: No sources uploaded - yields a helpful message', async () => {
    providerHealthStatus.searchMode = 'full';
    mockSourceRepo.findByWorkspace.mockResolvedValue([]); // No sources

    const generator = chatService.streamChat({
      workspaceId: 'ws-123',
      message: 'test question',
      chatId: 'chat-456',
      history: []
    });

    const chunks = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    // Expect an error chunk with the specific helpful message
    const errorChunk = chunks.find(c => c.type === 'error');
    expect(errorChunk).toBeDefined();
    expect(errorChunk.message).toBe('No source material available in this workspace.');
  });
});
