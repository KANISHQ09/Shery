import { vi, describe, it, expect, beforeEach } from 'vitest';
import StudioGenerationService from '../src/services/workspace/studioGeneration.service.js';
import AppError from '../src/utils/AppError.js';
import logger from '../src/loggers/logger.js';

describe('StudioGenerationService', () => {
  let mockVectorSearch;
  let mockContextManager;
  let mockOutputRepo;
  let mockChatProvider;
  let mockGeminiFlash;
  let service;

  beforeEach(() => {
    mockVectorSearch = {
      hybridSearch: vi.fn(),
    };
    mockContextManager = {
      assembleContext: vi.fn(),
    };
    mockOutputRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
    };
    mockChatProvider = {
      generateContent: vi.fn(),
    };
    mockGeminiFlash = {
      generateContent: vi.fn(),
    };

    service = new StudioGenerationService({
      vectorSearchService: mockVectorSearch,
      contextManagerService: mockContextManager,
      workspaceOutputRepository: mockOutputRepo,
      chatProvider: mockChatProvider,
      geminiFlash: mockGeminiFlash,
    });
  });

  describe('tryProviderChain', () => {
    it('should use primary chatProvider if it succeeds', async () => {
      mockChatProvider.generateContent.mockResolvedValue({
        response: { text: () => 'Primary Answer' },
      });

      const res = await service.tryProviderChain('test prompt');
      expect(res).toBe('Primary Answer');
      expect(mockChatProvider.generateContent).toHaveBeenCalled();
      expect(mockGeminiFlash.generateContent).not.toHaveBeenCalled();
    });

    it('should fallback to geminiFlash if chatProvider fails', async () => {
      mockChatProvider.generateContent.mockRejectedValue(new Error('NVIDIA API Error'));
      mockGeminiFlash.generateContent.mockResolvedValue({
        response: { text: () => 'Fallback Answer' },
      });

      const res = await service.tryProviderChain('test prompt');
      expect(res).toBe('Fallback Answer');
      expect(mockChatProvider.generateContent).toHaveBeenCalled();
      expect(mockGeminiFlash.generateContent).toHaveBeenCalled();
    });

    it('should throw error if both fail', async () => {
      mockChatProvider.generateContent.mockRejectedValue(new Error('NVIDIA API Error'));
      mockGeminiFlash.generateContent.mockRejectedValue(new Error('Gemini API Error'));

      await expect(service.tryProviderChain('test prompt')).rejects.toThrow();
    });
  });

  describe('computeTokenBudget', () => {
    it('should scale token budget by depth and source count', () => {
      const budgetQuick = service.computeTokenBudget('quick', 1, 5);
      const budgetExpert = service.computeTokenBudget('expert', 5, 20);

      expect(budgetQuick).toBeLessThan(budgetExpert);
      expect(budgetQuick).toBeGreaterThanOrEqual(2000);
      expect(budgetExpert).toBeLessThanOrEqual(12000);
    });
  });

  describe('computeLearningScore', () => {
    it('should calculate valid quality metrics', () => {
      const chunks = [
        { score: 0.8, sourceId: 'src_1' },
        { score: 0.7, sourceId: 'src_2' },
      ];
      const scores = service.computeLearningScore(chunks, 'a long generated study guide contents', ['src_1', 'src_2']);
      expect(scores.completenessScore).toBeDefined();
      expect(scores.difficultyScore).toBeDefined();
      expect(scores.uniqueSources).toBe(2);
    });
  });

  describe('study_guide generation and caching', () => {
    let mockSourceRepo;

    beforeEach(() => {
      mockSourceRepo = {
        findByWorkspace: vi.fn(),
      };
      service.sourceRepo = mockSourceRepo;

      // Mock outputRepo.collection
      mockOutputRepo.collection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });
    });

    it('should hit cache and return ready document immediately if exists', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([
        { id: 'src_1' },
        { id: 'src_2' },
      ]);

      const cachedDoc = {
        id: 'out_cached',
        type: 'study_guide',
        content: 'Cached study guide content',
        status: 'ready',
        sourceHash: 'some_hash',
      };

      mockOutputRepo.collection.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'out_cached', data: () => cachedDoc }],
        }),
      });

      const res = await service.generate('ws_1', 'study_guide');
      expect(res.id).toBe('out_cached');
      expect(res.content).toBe('Cached study guide content');
      expect(mockVectorSearch.hybridSearch).not.toHaveBeenCalled();
    });

    it('should generate monolithic study guide on cache miss and restrict context to top 8 chunks', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([
        { id: 'src_1' },
      ]);

      // Mock hybridSearch to return more than 8 chunks to test truncation
      const mockChunks = Array(12).fill(null).map((_, i) => ({
        sourceId: 'src_1',
        text: `chunk ${i}`,
        score: 0.9 - (i * 0.05), // Descending score
      }));

      mockVectorSearch.hybridSearch.mockResolvedValue(mockChunks);
      mockContextManager.assembleContext.mockResolvedValue({
        contextText: 'Grounding context text',
        sourcesUsed: [{ sourceId: 'src_1', title: 'Source 1' }],
      });
      mockChatProvider.generateContent.mockResolvedValue({
        response: { text: () => 'Fully generated study guide' },
      });

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'study_guide');

      expect(res.status).toBe('ready');
      expect(res.content).toBe('Fully generated study guide');
      expect(res.sourceHash).toBeDefined();

      // Verify context manager was called with only the top 8 chunks
      expect(mockContextManager.assembleContext).toHaveBeenCalled();
      const passedChunks = mockContextManager.assembleContext.mock.calls[0][0];
      expect(passedChunks.length).toBe(8);
      // Verify they are sorted by score descending
      expect(passedChunks[0].score).toBeGreaterThan(passedChunks[7].score);
    });
  });

  describe('mermaid_diagram generation', () => {
    let mockSourceRepo;

    beforeEach(() => {
      mockSourceRepo = {
        findByWorkspace: vi.fn(),
      };
      service.sourceRepo = mockSourceRepo;
      mockOutputRepo.collection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });
    });

    it('should bypass 3-chunk check and generate diagram even with 1 chunk', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Test Doc', pageNumber: 4, text: 'LangChain is a framework for LLMs.', score: 0.9 }
      ]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'mermaid_diagram');

      expect(res.status).toBe('ready');
      const parsed = JSON.parse(res.content);
      expect(parsed.mermaid).toBeDefined();
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.stats.nodesCount).toBe(2);
    });

    it('should show warning banner if retrieved chunks is 0', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'mermaid_diagram');

      expect(res.status).toBe('ready');
      expect(res.content).toContain('Insufficient grounded evidence found');
    });

    it('should reject verb/action concepts like "build" or "develop"', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Test Doc', pageNumber: 4, text: 'We must build and develop the LangChain framework. We will plan the RAG pipeline.', score: 0.9 }
      ]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'mermaid_diagram');
      const parsed = JSON.parse(res.content);
      
      const nodeLabels = Object.values(parsed.metadata.nodes).map(n => n.concept.toLowerCase());
      expect(nodeLabels).toContain('langchain');
      expect(nodeLabels).toContain('rag');
      expect(nodeLabels).not.toContain('build');
      expect(nodeLabels).not.toContain('develop');
      expect(nodeLabels).not.toContain('plan');
    });

    it('should map edges to allowed verbs and apply complexity gate pruning and CSS styles', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      
      const text = `
        LangChain is a framework. LangChain uses Chains.
        Chains call Models. Models generate text.
        LangChain depends on Embeddings. Embeddings write to Vector Store.
        Vector Store stores data. Chains retrieve from Vector Store.
        RAG retrieves from Vector Store.
        Agents implement Tools. Tools execute actions.
        Agents call Chains. Memory stores history.
        LangChain has Memory.
        This system architecture client server microservice database layer has server-side infrastructure.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Test Doc', pageNumber: 4, text, score: 0.9 }
      ]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'mermaid_diagram');
      const parsed = JSON.parse(res.content);

      // Verify stats
      expect(parsed.metadata.stats.nodesCount).toBeGreaterThanOrEqual(5);
      
      // Verify crossing risk gate check
      expect(parsed.metadata.complexity.crossingRisk).toBeLessThanOrEqual(0.4);
      expect(parsed.metadata.complexity.hierarchyDepth).toBeLessThanOrEqual(4);

      // Verify node visual styles are defined in Mermaid syntax
      expect(parsed.mermaid).toContain('style N0');

      // Verify allowed verbs only in mermaid transitions
      const allowedVerbs = ['contains', 'uses', 'depends_on', 'retrieves', 'stores', 'calls', 'extends', 'generates'];
      const links = parsed.mermaid.split('\n').filter(line => line.includes('-->') || line.includes('=='));
      for (const link of links) {
        const hasAllowedVerb = allowedVerbs.some(verb => link.includes(verb));
        expect(hasAllowedVerb).toBe(true);
      }
    });

    it('should correctly perform domain concept extraction on LangChain lecture input and omit generic words (V4)', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      
      const text = `
        Welcome to the LangChain lecture. Today we will build a powerful chatbot.
        Let's understand how to perform semantic search.
        LangChain is defined as an orchestration framework for LLMs.
        LangChain contains Chains. Chains link prompt templates and models.
        Agents use Tools to interact with the environment.
        Memory stores chat history in the session.
        We use RAG (Retrieval-Augmented Generation) to ground output.
        Embeddings map text to vectors. We store vectors in a Vector Store.
        A Retriever fetches relevant chunks from the Vector Store.
        We must prepare the pipeline. Time is crucial. Trust the process.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'LangChain Lecture Notes', pageNumber: 1, text, score: 0.9 }
      ]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'mermaid_diagram');
      const parsed = JSON.parse(res.content);

      const nodes = Object.values(parsed.metadata.nodes);
      const nodeLabels = nodes.map(n => n.concept);
      const nodeLabelsLower = nodeLabels.map(l => l.toLowerCase());

      // Assert technical entities are extracted
      expect(nodeLabelsLower).toContain('langchain');
      expect(nodeLabelsLower).toContain('chains');
      expect(nodeLabelsLower).toContain('agents');
      expect(nodeLabelsLower).toContain('memory');
      expect(nodeLabelsLower).toContain('rag');
      expect(nodeLabelsLower).toContain('embeddings');
      expect(nodeLabelsLower).toContain('retriever');
      expect(nodeLabelsLower).toContain('vector store');
      expect(nodeLabelsLower).toContain('tools');

      // Assert generic words are omitted
      expect(nodeLabelsLower).not.toContain('build');
      expect(nodeLabelsLower).not.toContain('prepare');
      expect(nodeLabelsLower).not.toContain('perform');
      expect(nodeLabelsLower).not.toContain('time');
      expect(nodeLabelsLower).not.toContain('trust');

      // Assert root node is LangChain (highest authority), not structural
      expect(parsed.mermaid).toContain('(("LangChain"))');
    });

    it('should apply V6 rules: educational mode, heading weight, definition regexes, centrality cap, penalty and quality gates', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      
      const text = `
        # LangChain Setup
        
        LangChain refers to a framework for building LLM applications.
        Vector Store consists of a database optimized for embeddings.
        
        This lecture notes tutorial covers LangChain components.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'LangChain Tutorial Lecture Notes', pageNumber: 1, text, score: 0.9 }
      ]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'mermaid_diagram');
      const parsed = JSON.parse(res.content);

      // 1. Force Mindmap: Mode must be forced to 'mindmap' because text contains "lecture notes tutorial"
      expect(parsed.metadata.mode).toBe('mindmap');

      // 2. Technical Entities: LangChain and Vector Store should be present
      const nodeLabels = Object.values(parsed.metadata.nodes).map(n => n.concept.toLowerCase());
      expect(nodeLabels).toContain('langchain');
      expect(nodeLabels).toContain('vector store');

      // 3. Fallback gate: If we generate something with generic root, it gets rejected.
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Build Feasibility Study', pageNumber: 1, text: 'We must build and prepare. Perform time feasibility study.', score: 0.9 }
      ]);
      const resRejected = await service.generate('ws_1', 'mermaid_diagram');
      const parsedRejected = JSON.parse(resRejected.content);
      expect(parsedRejected.mermaid).toBe("Unable to construct a high-confidence concept map.");
    });
  });

  describe('interview_questions generation', () => {
    let mockSourceRepo;

    beforeEach(() => {
      mockSourceRepo = {
        findByWorkspace: vi.fn(),
      };
      service.sourceRepo = mockSourceRepo;
      mockOutputRepo.collection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });
    });

    it('should generate mock Q&A when retrieved chunks is exactly 1 without limited coverage banner', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Test Doc', pageNumber: 4, text: 'LangChain is a framework.', score: 0.9 }
      ]);
      mockContextManager.assembleContext.mockResolvedValue({
        contextText: 'LangChain is a framework.',
        sourcesUsed: [{ sourceId: 'src_1', title: 'Test Doc' }],
      });
      mockChatProvider.generateContent.mockResolvedValue({
        response: { text: () => 'Mock Q&A generated content' },
      });

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');

      expect(res.status).toBe('ready');
      expect(res.content).not.toContain('Limited source coverage detected.');
      expect(res.content).toContain('Mock Q&A generated content');
      expect(mockChatProvider.generateContent).toHaveBeenCalled();
    });

    it('should show warning banner if retrieved chunks is 0 for interview_questions', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([]);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');

      expect(res.status).toBe('ready');
      expect(res.content).toContain('Insufficient grounded evidence found');
      expect(mockChatProvider.generateContent).not.toHaveBeenCalled();
    });

    it('should limit context to max 5 chunks and cap context text at 4000 characters', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      
      const mockChunks = Array(10).fill(null).map((_, i) => ({
        sourceId: 'src_1',
        sourceTitle: 'Test Doc',
        text: 'A'.repeat(1000),
        score: 0.9,
      }));
      mockVectorSearch.hybridSearch.mockResolvedValue(mockChunks);
      
      mockChatProvider.generateContent.mockResolvedValue({
        response: { text: () => 'Mock Q&A response' },
      });

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      await service.generate('ws_1', 'interview_questions');

      expect(mockChatProvider.generateContent).toHaveBeenCalled();
      const callArg = mockChatProvider.generateContent.mock.calls[0][0];
      const promptText = callArg.contents[0].parts[0].text;
      const countOfA = (promptText.match(/A/g) || []).length;
      expect(countOfA).toBeLessThanOrEqual(4050);
    });

    it('should not fall back to Gemini flash and instead immediately call deterministic fallback on provider error', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const richText = [
        'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.',
        'Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.',
        'VectorStore functions as a specialized registry constructed to index and locate high-dimensional vector representations with extremely low latency values reliably.'
      ].join(' ');
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Test Doc', text: richText, score: 0.9 }
      ]);
      
      mockChatProvider.generateContent.mockRejectedValue(new Error('NVIDIA failure'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');

      expect(res.status).toBe('ready');
      expect(res.content).toContain('<ExecutiveOverview');
      expect(res.content).toContain('<InterviewQuestion');
      expect(res.content).toContain('<RevisionChecklist>');
      
      expect(mockChatProvider.generateContent).toHaveBeenCalled();
      expect(mockGeminiFlash.generateContent).not.toHaveBeenCalled();
    });

    it('should handle timeout by immediately generating deterministic fallback questions', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const richText = [
        'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.',
        'Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.',
        'VectorStore functions as a specialized registry constructed to index and locate high-dimensional vector representations with extremely low latency values reliably.'
      ].join(' ');
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Test Doc', text: richText, score: 0.9 }
      ]);

      mockChatProvider.generateContent.mockReturnValue(new Promise(() => {}));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      service.llmTimeout = 10;

      const res = await service.generate('ws_1', 'interview_questions');

      expect(res.status).toBe('ready');
      expect(res.content).toContain('<InterviewQuestion level="Beginner"');
    });

    it('should fall back gracefully to empty search chunks if vector search times out (1500ms)', async () => {
      console.log('--- TEST START ---');
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockImplementation(() => {
        console.log('hybridSearch mocked called');
        return new Promise(() => {});
      });

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        console.log('create called');
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        console.log('update called', data.status);
        return { ...createdDoc, ...data };
      });

      service.vectorSearchTimeout = 10;

      console.log('Calling generate...');
      const res = await service.generate('ws_1', 'interview_questions');
      console.log('generate returned:', res.status);

      expect(res.status).toBe('ready');
      expect(res.content).toContain('Insufficient grounded evidence found.');
      expect(mockChatProvider.generateContent).not.toHaveBeenCalled();
      console.log('--- TEST END ---');
    });

    it('should strictly filter concepts by length, frequency, and reject lists', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const text = `
        LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.
        Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.
        VectorStore functions as a specialized registry constructed to index and locate high-dimensional vector representations with extremely low latency values reliably.
        Agents coordinate multiple external elements and determine the execution path dynamically based on the inputs provided by users to mitigate performance bottlenecks.
        Tools execute external actions such as querying a search engine or fetching records automatically and efficiently without any failures.
        
        We can use LangChain to manage LLM prompts. Embeddings are generated for text chunks. VectorStore stores the generated embeddings. Agents select which action to take. Tools query external APIs.
        
        Build a prototype. Build the core.
        SingleConcept is a lone concept.
        Xyz is a short word.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Doc 1', text, score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('LLM error to force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      const lowerContent = res.content.toLowerCase();

      // Verified concepts (freq >= 1 allowed for singleconcept, len >= 4, not rejected)
      expect(lowerContent).toContain('langchain');
      expect(lowerContent).toContain('embeddings');
      expect(lowerContent).toContain('vectorstore');
      expect(lowerContent).toContain('agents');
      expect(lowerContent).toContain('tools');
      expect(lowerContent).toContain('singleconcept');

      // Rejected concepts
      expect(lowerContent).not.toContain('build');
      expect(lowerContent).not.toContain('xyz');
    });

    it('should verify grounding: expected answers must be exact matching source sentences', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const sentences = [
        'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.',
        'Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.',
        'VectorStore functions as a specialized registry constructed to index and locate high-dimensional vector representations with extremely low latency values reliably.',
        'Agents coordinate multiple external elements and determine the execution path dynamically based on the inputs provided by users to mitigate performance bottlenecks.',
        'Retrievers extract relevant passages from vector stores to feed them directly into the context window of language models despite latency challenges.'
      ];
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Source Text', text: sentences.join(' '), score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      const questionBlocks = res.content.split('<InterviewQuestion');
      const questions = questionBlocks.slice(1);
      expect(questions.length).toBe(13); // 5 beginner + 5 intermediate + 3 advanced

      for (const qBlock of questions) {
        const answerMatch = qBlock.match(/Expected Answer:\s*([\s\S]*?)\n\n/);
        expect(answerMatch).not.toBeNull();
        const expectedAnswer = answerMatch[1].trim();

        const isExactSentence = sentences.some(s => s.startsWith(expectedAnswer) || expectedAnswer.startsWith(s));
        expect(isExactSentence).toBe(true);
      }
    });

    it('should fall back to raw source transcripts if vector search returns 0 chunks but active sources exist', async () => {
      const richTranscript = [
        'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.',
        'Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.',
        'VectorStore functions as a specialized registry constructed to index and locate high-dimensional vector representations with extremely low latency values reliably.'
      ].join(' ');
      mockSourceRepo.findByWorkspace.mockResolvedValue([
        { id: 'src_1', title: 'LangChain Lecture Notes', status: 'completed', transcript: richTranscript }
      ]);
      mockVectorSearch.hybridSearch.mockResolvedValue([]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      expect(res.content).not.toContain('Limited source coverage detected.');
      expect(res.content.toLowerCase()).toContain('langchain');
      expect(res.content.toLowerCase()).toContain('embeddings');
    });

    it('should use multi-query retrieval with assetType and merge/deduplicate chunks', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      
      const queriesCalled = [];
      mockVectorSearch.hybridSearch.mockImplementation(async (wsId, query, opts) => {
        queriesCalled.push({ query, opts });
        if (query === 'What is the system?') {
          return [
            { id: 'chunk1', text: 'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.' }
          ];
        }
        if (query === 'How does the architecture work?') {
          return [
            { id: 'chunk1', text: 'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.' },
            { id: 'chunk2', text: 'Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.' }
          ];
        }
        if (query === 'What technologies are used?') {
          return [
            { id: 'chunk3', text: 'VectorStore functions as a specialized registry constructed to index and locate high-dimensional vector representations with extremely low latency values reliably.' }
          ];
        }
        return [];
      });

      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      expect(queriesCalled.length).toBe(5);
      expect(queriesCalled[0].query).toBe('What is the system?');
      expect(queriesCalled[0].opts.assetType).toBe('interview_questions');
      expect(queriesCalled[0].opts.topK).toBe(15);

      expect(res.content.toLowerCase()).toContain('langchain');
      expect(res.content.toLowerCase()).toContain('embeddings');
      expect(res.content.toLowerCase()).toContain('vectorstore');
    });

    it('should relax quality gate to validConcepts >= 2 if source chunk count < 5', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      
      mockVectorSearch.hybridSearch.mockImplementation(async (wsId, query, opts) => {
        return [
          { id: 'chunk1', text: 'LangChain serves as a popular orchestration utility that allows programmers to link large language models with external datasets easily and reliably.' },
          { id: 'chunk2', text: 'Embeddings represent textual properties as dense numerical vectors in a high-dimensional space to allow semantic similarity searches between different documents securely.' }
        ];
      });

      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');
      expect(res.content).not.toContain('Insufficient interview-quality material');
      expect(res.content.toLowerCase()).toContain('langchain');
      expect(res.content.toLowerCase()).toContain('embeddings');
    });

    it('should apply Mock Q&A V6 concept filtering, fallback selection, and diagnostics logging', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const text = `
        Database functions as a structured query engine that stores high-dimensional representation database data securely across distributed networks without any performance latency issues.
        Agents select actions to execute in complex environments and coordinate external tools to dynamically mitigate performance bottlenecks for the users.
        API endpoints receive incoming HTTP requests from client applications and map them to their corresponding backend services efficiently.
        Build new project directories using the automated scaffolding tool to establish a standardized baseline layout quickly and cleanly.
        Workflow templates automate processes to help programmers orchestrate multi-step deployment operations across multiple environment layers and clusters.
        Xyz is a custom system component that provides extra configurations for internal libraries and third party dependencies securely.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Doc 1', text, score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('LLM error to force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const loggerSpy = vi.spyOn(logger, 'info');

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      // We expect the fallback strategy to select 5 concepts (Database, Agents, API, and some from fallback pool like Xyz/Build/Workflow)
      const lowerContent = res.content.toLowerCase();
      expect(lowerContent).toContain('database');
      expect(lowerContent).toContain('agents');
      expect(lowerContent).toContain('api');

      // Verify that diagnostics logs were created
      const diagnosticsCall = loggerSpy.mock.calls.find(call => 
        call[0] === '[Studio Telemetry] Mock Q&A diagnostics'
      );
      expect(diagnosticsCall).toBeDefined();
      const payload = diagnosticsCall[1];
      expect(payload).toBeDefined();
      expect(payload.retrievedChunkCount).toBe(1);
      expect(payload.acceptedConcepts).toBeDefined();
      expect(payload.rejectedConcepts).toBeDefined();
      expect(payload.rejectionReason).toBeDefined();
      expect(payload.acceptedConcepts).toContain('Database');
      expect(payload.acceptedConcepts).toContain('Agents');
      expect(payload.acceptedConcepts).toContain('API');

      loggerSpy.mockRestore();
    });

    it('should fall back to Emergency Mode and generate exactly 13 questions when quality gates fail', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      // Input text with very short sentences to force Quality Gate averageAnswerLength failure
      const text = `
        LangChain is an AI framework.
        Embeddings represent text.
        VectorStore acts as database.
        Agents select next tools.
        Tools query APIs.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Doc 1', text, score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('LLM error to force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const loggerSpy = vi.spyOn(logger, 'info');

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      // Emergency mode must return exactly 5 beginner, 5 intermediate, and 3 advanced questions
      const content = res.content;
      const beginnerMatches = (content.match(/level="Beginner"/g) || []).length;
      const intermediateMatches = (content.match(/level="Intermediate"/g) || []).length;
      const advancedMatches = (content.match(/level="Advanced"/g) || []).length;

      expect(beginnerMatches).toBe(5);
      expect(intermediateMatches).toBe(5);
      expect(advancedMatches).toBe(3);

      // Verify telemetry logs contains V7 tracking details
      const diagnosticsCall = loggerSpy.mock.calls.find(call => 
        call[0] === '[Studio Telemetry] Mock Q&A diagnostics'
      );
      expect(diagnosticsCall).toBeDefined();
      const payload = diagnosticsCall[1];
      expect(payload.acceptedConceptCount).toBeGreaterThanOrEqual(2);
      expect(payload.questionEligibleConceptCount).toBeGreaterThanOrEqual(2);
      expect(payload.generatedQuestionCount).toBe(13);
      expect(payload.skippedConceptsDetailed).toBeDefined();
      expect(payload.questionEligibleConcepts).toBeDefined();
      expect(payload.generatedQuestions).toHaveLength(13);

      loggerSpy.mockRestore();
    });

    it('should avoid pairing tradeoff questions with definition answers', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const text = `
        LangChain is a popular orchestration framework.
        ZeroPay is a payment system.
        BuildVerse is a blockchain platform.
        ChatGPT Clone is a conversational agent.
        VectorStore is a database.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Doc 1', text, score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      const content = res.content;
      const advancedQuestions = content.split('level="Advanced"');
      expect(advancedQuestions.length).toBe(4);

      for (let i = 1; i < advancedQuestions.length; i++) {
        const block = advancedQuestions[i];
        const questionMatch = block.match(/Question:\s*([\s\S]*?)\n\n/);
        expect(questionMatch).not.toBeNull();
        const question = questionMatch[1];
        expect(question).toMatch(/How would you (scale|improve|extend)/);
      }
    });

    it('should generate customized questions using customized verbs/phrases from matching sentences', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const text = `
        LangChain connects LLMs with tools, memory, and external data.
        ZeroPay enables fast merchant settlement.
        BuildVerse allows users to create decentralized worlds.
        ChatGPT Clone stores chat history in a local cache.
        VectorStore indexes high-dimensional vectors.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Doc 1', text, score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      expect(res.content).toContain('How does LangChain connects LLMs with tools');
      expect(res.content).toContain('How does ZeroPay enables fast merchant settlement');
      expect(res.content).toContain('How does BuildVerse allows users to create decentralized worlds');
      expect(res.content).toContain('How does ChatGPT Clone stores chat history in a local cache');
      expect(res.content).toContain('How does VectorStore indexes high-dimensional vectors');
    });

    it('should apply project name heuristics for ZeroPay to prioritize descriptive sentences over simple list entries', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const text = `
        ZeroPay - Payment processing system.
        ZeroPay was designed to automate merchant invoice payments using smart contracts.
        LangChain is a framework.
        BuildVerse is a platform.
        ChatGPT Clone is an agent.
        VectorStore is a database.
      `;
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', sourceTitle: 'Doc 1', text, score: 0.9 }
      ]);
      mockChatProvider.generateContent.mockRejectedValue(new Error('Force fallback'));

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'interview_questions');
      expect(res.status).toBe('ready');

      expect(res.content).toContain('Expected Answer:\nZeroPay was designed to automate merchant invoice payments using smart contracts.');
      expect(res.content).not.toContain('Expected Answer:\nZeroPay - Payment');
    });
  });

  describe('flashcards generation', () => {
    let mockSourceRepo;

    const createMockCards = (count, offset = 0) => {
      return Array.from({ length: count }, (_, idx) => {
        const i = idx + offset;
        const type = ['concept_summary', 'architecture', 'key_takeaways', 'implementation_notes', 'interview_nuggets'][i % 5];
        return {
          id: `card_${i + 1}`,
          type,
          title: `LANGCHAIN ${i}`,
          bullets: [
            `Bullet 1 for card ${i}`,
            `Bullet 2 for card ${i}`,
            `Bullet 3 for card ${i}`,
          ],
          sourceCitation: '[Source]',
          chunkId: 'src_1',
        };
      });
    };

    beforeEach(() => {
      mockSourceRepo = {
        findByWorkspace: vi.fn(),
      };
      service.sourceRepo = mockSourceRepo;
      mockOutputRepo.collection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });
    });

    it('should cap chunks to top 30 if more than 30 are retrieved', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      const mockChunks = Array.from({ length: 40 }, (_, i) => ({
        sourceId: 'src_1',
        text: `LangChain is a framework. Chunk number ${i}`,
        score: i + 1,
      }));
      mockVectorSearch.hybridSearch.mockResolvedValue(mockChunks);

      const mockCards = createMockCards(10);
      const deterministicSpy = vi.spyOn(service, 'generateDeterministicFlashcards').mockReturnValue(mockCards);
      
      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'flashcards');
      expect(res.status).toBe('ready');

      expect(deterministicSpy).toHaveBeenCalled();
      const passedChunks = deterministicSpy.mock.calls[0][0];
      expect(passedChunks.length).toBe(30);
      expect(passedChunks[0].score).toBe(40);
      expect(passedChunks[29].score).toBe(11);

      deterministicSpy.mockRestore();
    });

    it('should generate deterministic cards and skip LLM if cards count >= 8 and score >= 80', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', text: 'LangChain is a framework. '.repeat(100) }
      ]);

      const mockCards = createMockCards(10);
      const deterministicSpy = vi.spyOn(service, 'generateDeterministicFlashcards').mockReturnValue(mockCards);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'flashcards');
      expect(res.status).toBe('ready');

      const parsed = JSON.parse(res.content);
      expect(parsed.status).toBe('success');
      expect(parsed.cards.length).toBe(10);
      expect(mockChatProvider.generateContent).not.toHaveBeenCalled();

      deterministicSpy.mockRestore();
    });

    it('should succeed directly if deterministic cards count is >= 6', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', text: 'LangChain is a framework. '.repeat(100) }
      ]);

      const mockDetCards = createMockCards(6, 0);
      const deterministicSpy = vi.spyOn(service, 'generateDeterministicFlashcards').mockReturnValue(mockDetCards);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'flashcards');
      expect(res.status).toBe('ready');

      const parsed = JSON.parse(res.content);
      expect(parsed.status).toBe('success');
      expect(parsed.cards.length).toBe(6);
      expect(mockChatProvider.generateContent).not.toHaveBeenCalled();

      deterministicSpy.mockRestore();
    });

    it('should succeed and return success if cards count is >= 4', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', text: 'LangChain is a framework. '.repeat(100) }
      ]);

      const mockDetCards = createMockCards(4, 0);
      const deterministicSpy = vi.spyOn(service, 'generateDeterministicFlashcards').mockReturnValue(mockDetCards);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'flashcards');
      expect(res.status).toBe('ready');

      const parsed = JSON.parse(res.content);
      expect(parsed.status).toBe('success');
      expect(parsed.cards.length).toBe(4);

      deterministicSpy.mockRestore();
    });

    it('should trigger insufficient content gate and return Insufficient Learning Material if gate checks fail', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', text: 'LangChain is a framework.' }
      ]);

      const mockCards = createMockCards(8);
      const deterministicSpy = vi.spyOn(service, 'generateDeterministicFlashcards').mockReturnValue(mockCards);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      const res = await service.generate('ws_1', 'flashcards');
      expect(res.status).toBe('ready');
      const parsed = JSON.parse(res.content);
      expect(parsed.status).toBe('insufficient_content');
      expect(parsed.message).toBe('Insufficient Learning Material');

      deterministicSpy.mockRestore();
    });

    it('should fall back to deterministic cards in the outer catch block on overall timeout', async () => {
      mockSourceRepo.findByWorkspace.mockResolvedValue([{ id: 'src_1' }]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { sourceId: 'src_1', text: 'LangChain is a framework. '.repeat(100) }
      ]);

      const mockCards = createMockCards(8);
      const deterministicSpy = vi.spyOn(service, 'generateDeterministicFlashcards').mockReturnValue(mockCards);

      let createdDoc = {};
      mockOutputRepo.create.mockImplementation((workspaceId, data) => {
        createdDoc = { id: 'out_new', ...data };
        return createdDoc;
      });
      mockOutputRepo.update.mockImplementation((workspaceId, id, data) => {
        return { ...createdDoc, ...data };
      });

      service.overallTimeout = 10;

      const res = await service.generate('ws_1', 'flashcards');
      expect(res.status).toBe('ready');
      const parsed = JSON.parse(res.content);
      expect(parsed.status).toBe('success');
      expect(parsed.cards.length).toBe(8);

      deterministicSpy.mockRestore();
    });

    it('should generate concept_summary cards, implementation_notes cards, and interview_nuggets cards from chunks', () => {
      const chunks = [
        {
          text: 'LangChain represents a framework designed to build LLM applications. Programmers setup and configure LangChain pipelines. A major tradeoff of using LangChain is its high performance overhead and latency.',
          sourceId: 'src_1',
          sourceTitle: 'Doc 1',
          score: 1.0,
        }
      ];

      const cards = service.generateDeterministicFlashcards(chunks);
      
      const summaryCard = cards.find(c => c.type === 'concept_summary');
      expect(summaryCard).toBeDefined();
      expect(summaryCard.title).toBe('LANGCHAIN');
      expect(summaryCard.bullets.length).toBeGreaterThanOrEqual(3);

      const implCard = cards.find(c => c.type === 'implementation_notes');
      expect(implCard).toBeDefined();
      expect(implCard.title).toBe('LANGCHAIN IMPLEMENTATION');
      expect(implCard.bullets.length).toBeGreaterThanOrEqual(3);

      const nuggetCard = cards.find(c => c.type === 'interview_nuggets');
      expect(nuggetCard).toBeDefined();
      expect(nuggetCard.title).toBe('LANGCHAIN KEY DETAILS');
      expect(nuggetCard.bullets.length).toBeGreaterThanOrEqual(3);
    });

    it('should generate architecture cards using sequence step extraction or fallbacks', () => {
      const chunks = [
        {
          text: 'LangChain has a complex architecture. The sequence of steps includes first Request Dispatch, next API Gateway routing, and then Database storage.',
          sourceId: 'src_1',
          sourceTitle: 'Doc 1',
          score: 1.0,
        }
      ];

      const cards = service.generateDeterministicFlashcards(chunks);

      const archCard = cards.find(c => c.type === 'architecture');
      expect(archCard).toBeDefined();
      expect(archCard.title).toBe('LANGCHAIN ARCHITECTURE');
      expect(archCard.bullets.length).toBeGreaterThanOrEqual(3);
    });

    it('should perform Jaccard semantic deduplication on similar chunks', () => {
      const isDup = service.isNearDuplicate(
        'LangChain is a framework designed to build LLM agents and chain tools.',
        'Langchain is a framework designed to build LLM agents and chain tools'
      );
      expect(isDup).toBe(true);

      const notDup = service.isNearDuplicate(
        'LangChain is a framework designed to build LLM agents.',
        'ZeroPay is a payment system designed to automate invoice payments.'
      );
      expect(notDup).toBe(false);
    });

    it('should extract key_takeaways cards as emergency fallback type when standard yield is low', () => {
      const chunks = [
        {
          text: 'This is a general piece of content without any specific domain concepts. It contains several facts that can be summarized as key takeaways. These takeaways are essential for revision.',
          sourceId: 'src_1',
          sourceTitle: 'General Doc',
          score: 1.0,
        }
      ];

      const cards = service.generateDeterministicFlashcards(chunks);

      const takeawaysCard = cards.find(c => c.type === 'key_takeaways');
      expect(takeawaysCard).toBeDefined();
      expect(takeawaysCard.title).toBe('GENERAL DOC KEY TAKEAWAYS');
      expect(takeawaysCard.bullets.length).toBeGreaterThanOrEqual(3);
    });
  });
});
