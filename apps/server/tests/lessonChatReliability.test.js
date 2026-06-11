import { vi, describe, it, expect, beforeEach } from 'vitest';
import ChatService from '../src/services/chat.service.js';
import AppError from '../src/utils/AppError.js';

describe('ChatService - Student Dashboard AI Tutor Retrieval Reliability', () => {
  let mockLessonRepo;
  let mockChunkCache;
  let mockChatSessionRepo;
  let mockAiClient;
  let mockVectorSearch;
  let chatService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLessonRepo = {
      findById: vi.fn(),
    };

    mockChunkCache = {
      getChunks: vi.fn(),
    };

    mockChatSessionRepo = {
      appendMessages: vi.fn(),
    };

    mockAiClient = {
      generateContentStream: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield { text: () => 'Response token 1' };
          yield { text: () => 'Response token 2' };
        })()
      }),
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => '["Follow up 1", "Follow up 2", "Follow up 3"]'
        }
      })
    };

    mockVectorSearch = {
      hybridSearch: vi.fn(),
      lexicalSearch: vi.fn(),
    };

    chatService = new ChatService({
      lessonRepository: mockLessonRepo,
      chunkCacheService: mockChunkCache,
      chatSessionRepository: mockChatSessionRepo,
      aiClient: mockAiClient,
      vectorSearchService: mockVectorSearch,
    });
  });

  const getLessonPlaceholder = () => ({
    lessonId: 'lesson-123',
    courseId: 'course-456',
    title: 'Lecture 1: Intro to AI',
    description: 'Learn the basics of Artificial Intelligence.',
    status: 'ready',
    topicSegments: [
      { startLabel: '0:10', title: 'What is AI', summary: 'Brief introduction to AI definitions' }
    ],
    starterQuestions: ['What is RAG?']
  });

  it('Level 1: Hybrid Vector Search succeeds within timeout', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Some transcript', startTime: 10, endTime: 20 }
    ]);
    mockVectorSearch.hybridSearch.mockResolvedValue([
      { text: 'Semantic vector result chunk', chunkIndex: 0, startTime: 10, endTime: 20 }
    ]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Explain AI',
      currentTime: 10,
    });

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(mockVectorSearch.hybridSearch).toHaveBeenCalledWith('course-456', 'Explain AI', { sourceIds: ['lesson-123'], topK: 12 });
    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    // Verify no fallback message was prepended
    expect(doneEvent.fullResponse).not.toContain('I could not retrieve the exact lecture section');
  });

  it('Level 1 times out -> falls back to Level 2 Lexical Search', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Some transcript', startTime: 10, endTime: 20 }
    ]);
    
    // Simulate Hybrid Search Timeout
    mockVectorSearch.hybridSearch.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('RetrievalTimeout')), 50);
    }));

    mockVectorSearch.lexicalSearch.mockResolvedValue([
      { text: 'Lexical search result chunk', chunkIndex: 0, startTime: 10, endTime: 20 }
    ]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Explain AI',
      currentTime: 10,
    });

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(mockVectorSearch.lexicalSearch).toHaveBeenCalled();
    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });

  it('Level 1 & 2 fail -> falls back to Level 3 Local Transcript Search (BM25)', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Firestore chunk containing AI definitions', startTime: 10, endTime: 20 }
    ]);
    
    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]); // yields empty

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'AI definitions',
      currentTime: 10,
    });

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    
    // Fallback instruction must be present in systemInstruction
    expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('RETRIEVAL WARNING')
      })
    );
    
    // No raw disclaimer should be prepended
    const tokenEvents = events.filter(e => e.type === 'token');
    expect(tokenEvents[0].content).not.toContain('I could not retrieve');
    expect(doneEvent.fullResponse).not.toContain('I could not retrieve');
  });

  it('Level 1, 2, 3 fail -> falls back to Level 4 Lesson Overview (Chapters)', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Unrelated topic text', startTime: 10, endTime: 20 }
    ]);

    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]);
    // BM25 results will be empty because query terms don't match transcript text
    
    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Some extremely query that is not in the text at all',
      currentTime: 10,
    });

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('RETRIEVAL WARNING')
      })
    );
    expect(tokenEventsContain(events, 'I could not retrieve the exact lecture section')).toBe(false);
  });

  it('Level 1, 2, 3, 4 fail -> falls back to Level 5 Source Metadata', async () => {
    const lessonWithNoChapters = {
      ...getLessonPlaceholder(),
      topicSegments: [],
      starterQuestions: []
    };
    mockLessonRepo.findById.mockResolvedValue(lessonWithNoChapters);
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Empty or unrelated', startTime: 10, endTime: 20 }
    ]);

    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Completely missing topic query',
      currentTime: 10,
    });

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('RETRIEVAL WARNING')
      })
    );
    expect(tokenEventsContain(events, 'I could not retrieve the exact lecture section')).toBe(false);
  });

  it('All fallback levels fail to find context -> throws "Retrieval unavailable"', async () => {
    // Modify mockLesson to have no title or description or any content
    mockLessonRepo.findById.mockResolvedValue({
      lessonId: 'lesson-123',
      title: '',
      description: '',
      status: 'ready'
    });
    mockChunkCache.getChunks.mockResolvedValue([
      { text: null, startTime: 500, endTime: 600 }
    ]);

    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Missing info',
      currentTime: 10,
    });

    await expect(async () => {
      for await (const _ of generator) {}
    }).rejects.toThrow('Retrieval unavailable');
  });

  it('Transcript load fails entirely -> throws "Transcript unavailable"', async () => {
    mockLessonRepo.findById.mockResolvedValue({
      lessonId: 'lesson-123',
      title: '',
      description: '',
      status: 'ready',
      topicSegments: [],
      starterQuestions: []
    });
    mockChunkCache.getChunks.mockRejectedValue(new Error('Firestore read error'));

    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Fail test',
      currentTime: 10,
    });

    await expect(async () => {
      for await (const _ of generator) {}
    }).rejects.toThrow('Transcript unavailable');
  });

  it('No indexed content found when lesson has no chunks in database', async () => {
    mockLessonRepo.findById.mockResolvedValue({
      lessonId: 'lesson-123',
      title: '',
      description: '',
      status: 'ready',
      topicSegments: [],
      starterQuestions: []
    });
    mockChunkCache.getChunks.mockResolvedValue([]); // status ready but 0 chunks

    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Fail test',
      currentTime: 10,
    });

    await expect(async () => {
      for await (const _ of generator) {}
    }).rejects.toThrow('No indexed content found');
  });

  it('LLM generateContentStream throws when retrieval also fails -> throws "NVIDIA service temporarily unavailable"', async () => {
    mockLessonRepo.findById.mockResolvedValue({
      lessonId: 'lesson-123',
      title: '',
      description: '',
      status: 'ready',
      topicSegments: [],
      starterQuestions: []
    });
    mockChunkCache.getChunks.mockResolvedValue([]);
    mockVectorSearch.hybridSearch.mockRejectedValue(new Error('Qdrant offline'));
    mockVectorSearch.lexicalSearch.mockResolvedValue([]);

    mockAiClient.generateContentStream.mockRejectedValue(new Error('NVIDIA API limit exceeded'));

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Test LLM fail',
      currentTime: 10,
    });

    await expect(async () => {
      for await (const _ of generator) {}
    }).rejects.toThrow('NVIDIA service temporarily unavailable');
  });

  it('LLM generateContentStream throws but retrieval succeeded -> throws "NVIDIA service temporarily unavailable"', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Transcript content for test', startTime: 10, endTime: 20 }
    ]);
    mockVectorSearch.hybridSearch.mockResolvedValue([
      { text: 'Semantic vector result chunk', chunkIndex: 0, startTime: 10, endTime: 20 }
    ]);

    mockAiClient.generateContentStream.mockRejectedValue(new Error('NVIDIA API limit exceeded'));

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Test LLM fail with context',
      currentTime: 10,
    });

    await expect(async () => {
      for await (const _ of generator) {}
    }).rejects.toThrow('NVIDIA service temporarily unavailable');
  });

  it('Comparison question mode constructs comparison instructions and temperature = 0.5', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Compare concept X and concept Y', startTime: 10, endTime: 20 }
    ]);
    mockVectorSearch.hybridSearch.mockResolvedValue([
      { text: 'Compare concept X and concept Y', chunkIndex: 0, startTime: 10, endTime: 20 }
    ]);

    const generator = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'What is the difference between X and Y?',
      currentTime: 10,
    });

    for await (const _ of generator) {}

    expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('COMPARISON MODE ACTIVATED'),
        generationConfig: expect.objectContaining({ temperature: 0.5 })
      })
    );
  });

  it('Why and How modes construct correct instruction extensions', async () => {
    mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
    mockChunkCache.getChunks.mockResolvedValue([
      { chunkIndex: 0, text: 'Explain how it works and why.', startTime: 10, endTime: 20 }
    ]);
    mockVectorSearch.hybridSearch.mockResolvedValue([
      { text: 'Explain how it works and why.', chunkIndex: 0, startTime: 10, endTime: 20 }
    ]);

    // Test "why" message
    const genWhy = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'Why does it work?',
      currentTime: 10,
    });
    for await (const _ of genWhy) {}
    expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('WHY QUESTION MODE')
      })
    );

    // Test "how" message
    const genHow = chatService.streamChat({
      lessonId: 'lesson-123',
      message: 'How do we implement this?',
      currentTime: 10,
    });
    for await (const _ of genHow) {}
    expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('HOW QUESTION MODE')
      })
    );
  });

  describe('Conversational Query Rewriting', () => {
    it('does not trigger query rewriting if no pronouns or references are present', async () => {
      mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
      mockChunkCache.getChunks.mockResolvedValue([
        { chunkIndex: 0, text: 'RAG knowledge update', startTime: 10, endTime: 20 }
      ]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { text: 'RAG knowledge update', chunkIndex: 0, startTime: 10, endTime: 20 }
      ]);

      const generator = chatService.streamChat({
        lessonId: 'lesson-123',
        message: 'Can RAG update a model\'s knowledge without retraining?',
        currentTime: 10,
        history: [],
      });

      for await (const _ of generator) {}

      expect(mockAiClient.generateContent).toHaveBeenCalledTimes(1); // Only for follow-up questions
      expect(mockVectorSearch.hybridSearch).toHaveBeenCalledWith(
        'course-456',
        'Can RAG update a model\'s knowledge without retraining?',
        expect.any(Object)
      );
    });

    it('rewrites the query conversationally using history if pronouns/references are present', async () => {
      mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
      mockChunkCache.getChunks.mockResolvedValue([
        { chunkIndex: 0, text: 'RAG vs Vector Search', startTime: 10, endTime: 20 }
      ]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { text: 'RAG vs Vector Search', chunkIndex: 0, startTime: 10, endTime: 20 }
      ]);

      // Mock generateContent to return expanded query first, then follow-ups
      mockAiClient.generateContent
        .mockResolvedValueOnce({
          response: {
            text: () => 'How does using RAG to update knowledge compare with vector search?'
          }
        })
        .mockResolvedValueOnce({
          response: {
            text: () => '["F1", "F2", "F3"]'
          }
        });

      const generator = chatService.streamChat({
        lessonId: 'lesson-123',
        message: 'How does this compare with vector search?',
        currentTime: 10,
        history: [
          { role: 'user', content: 'Can RAG update a model\'s knowledge without retraining?' },
          { role: 'assistant', content: 'Yes, RAG fetches latest chunks.' }
        ],
      });

      for await (const _ of generator) {}

      // Verify query expansion was called
      expect(mockAiClient.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: expect.stringContaining('query expansion assistant')
        })
      );
      // Verify the resolved query was sent to retrieval
      expect(mockVectorSearch.hybridSearch).toHaveBeenCalledWith(
        'course-456',
        'How does using RAG to update knowledge compare with vector search?',
        expect.any(Object)
      );
    });

    it('falls back to original query if LLM query rewriting fails', async () => {
      mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
      mockChunkCache.getChunks.mockResolvedValue([
        { chunkIndex: 0, text: 'RAG vs Vector Search', startTime: 10, endTime: 20 }
      ]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { text: 'RAG vs Vector Search', chunkIndex: 0, startTime: 10, endTime: 20 }
      ]);

      // Simulate LLM error on rewrite, success on follow-ups
      mockAiClient.generateContent
        .mockRejectedValueOnce(new Error('LLM Rate Limit'))
        .mockResolvedValueOnce({
          response: {
            text: () => '["F1", "F2", "F3"]'
          }
        });

      const generator = chatService.streamChat({
        lessonId: 'lesson-123',
        message: 'How does this compare with vector search?',
        currentTime: 10,
        history: [
          { role: 'user', content: 'Can RAG update a model\'s knowledge without retraining?' }
        ],
      });

      for await (const _ of generator) {}

      // Should fall back to the original message for search
      expect(mockVectorSearch.hybridSearch).toHaveBeenCalledWith(
        'course-456',
        'How does this compare with vector search?',
        expect.any(Object)
      );
    });
  });

  describe('Entity Grounding & Hallucination Prevention', () => {
    it('detects absent entities and appends grounding alert to system instruction', async () => {
      mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
      mockChunkCache.getChunks.mockResolvedValue([
        { chunkIndex: 0, text: 'This lecture is about vector databases and retrieval-augmented generation.', startTime: 10, endTime: 20 }
      ]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { text: 'This lecture is about vector databases and retrieval-augmented generation.', chunkIndex: 0, startTime: 10, endTime: 20 }
      ]);

      const generator = chatService.streamChat({
        lessonId: 'lesson-123',
        message: 'What is LangChain?',
        currentTime: 10,
      });

      for await (const _ of generator) {}

      expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: expect.stringContaining("ENTITY GROUNDING ALERT: The student is asking about specific entity/entities: 'langchain'")
        })
      );
    });

    it('does not append grounding alert if the entity is present in the transcript', async () => {
      mockLessonRepo.findById.mockResolvedValue(getLessonPlaceholder());
      mockChunkCache.getChunks.mockResolvedValue([
        { chunkIndex: 0, text: 'We can build applications using LangChain framework.', startTime: 10, endTime: 20 }
      ]);
      mockVectorSearch.hybridSearch.mockResolvedValue([
        { text: 'We can build applications using LangChain framework.', chunkIndex: 0, startTime: 10, endTime: 20 }
      ]);

      const generator = chatService.streamChat({
        lessonId: 'lesson-123',
        message: 'What is LangChain?',
        currentTime: 10,
      });

      for await (const _ of generator) {}

      expect(mockAiClient.generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: expect.not.stringContaining("ENTITY GROUNDING ALERT")
        })
      );
    });
  });

  function tokenEventsContain(events, text) {
    return events
      .filter(e => e.type === 'token')
      .some(e => e.content.includes(text));
  }
});
