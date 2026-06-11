import { secondsToLabel } from '../utils/timeFormatter.js';
import AppError from '../utils/AppError.js';
import logger from '../loggers/logger.js';
import { buildSystemInstruction } from '../lib/prompt/ai-video.js';

class ChatService {
  constructor({ lessonRepository, chunkCacheService, chatSessionRepository, aiClient, vectorSearchService }) {
    this.lessonRepository = lessonRepository;
    this.chunkCacheService = chunkCacheService;
    this.chatSessionRepository = chatSessionRepository;
    this.aiClient = aiClient;
    this.vectorSearchService = vectorSearchService;
  }

  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  stopwords() {
    return new Set(['a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'for', 'with', 'this', 'that', 'was', 'are', 'be', 'as', 'by', 'from']);
  }

  // Detects if the user wants a full video summary/notes instead of a specific Q&A
  isSummaryRequest(message) {
    return /\b(summarize|summarise|summary|notes|key points?|key takeaway|overview|explain the (whole|entire|full)|what (is|was) this video|what did (he|she|they) (say|explain|cover)|recap|tldr|tl;?dr)\b/i.test(message);
  }

  // For summary requests: evenly sample chunks across the WHOLE video
  // For normal Q&A: use BM25 keyword search
  selectChatChunks(message, chunks, currentTime) {
    if (this.isSummaryRequest(message)) {
      const maxSample = 25;
      const step = Math.max(1, Math.floor(chunks.length / maxSample));
      return chunks.filter((_, i) => i % step === 0).slice(0, maxSample);
    }
    // Normal Q&A — BM25 semantic search + temporal context
    const semanticChunks = this.bm25Search(message, chunks, 12);
    const temporalChunks = this.findTemporalChunks(chunks, currentTime, 3);
    return this.buildContextBlocks(semanticChunks, temporalChunks);
  }

  bm25Search(query, chunks, k = 7) {
    const tokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2 && !this.stopwords().has(token));

    if (!tokens.length) return chunks.slice(0, k);

    const avgLen = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length;
    const k1 = 1.5;
    const b = 0.75;
    const df = {};

    tokens.forEach((token) => {
      df[token] = chunks.filter((chunk) => chunk.text.toLowerCase().includes(token)).length;
    });

    return chunks
      .map((chunk) => {
        const text = chunk.text.toLowerCase();
        const words = text.split(/\W+/);
        const tf = {};
        words.forEach((word) => { tf[word] = (tf[word] || 0) + 1; });

        const score = tokens.reduce((sum, token) => {
          const termFreq = tf[token] || 0;
          if (!termFreq) return sum;

          const idf = Math.log((chunks.length - df[token] + 0.5) / (df[token] + 0.5) + 1);
          const norm = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + (b * text.length) / avgLen));
          return sum + idf * norm;
        }, 0);

        return { ...chunk, _score: score };
      })
      .sort((a, bScore) => bScore._score - a._score)
      .slice(0, k);
  }

  findTemporalChunks(chunks, currentTime, count = 2) {
    if (!currentTime || currentTime <= 0) return [];

    return chunks
      .filter((chunk) => Math.abs(chunk.startTime - currentTime) < 90)
      .sort((a, b) => Math.abs(a.startTime - currentTime) - Math.abs(b.startTime - currentTime))
      .slice(0, count);
  }

  buildContextBlocks(semanticChunks, temporalChunks, limit = 8) {
    const seen = new Set();
    const unique = [...semanticChunks, ...temporalChunks]
      .filter((chunk) => {
        if (chunk.chunkIndex === undefined || chunk.chunkIndex === null) return true;
        if (seen.has(chunk.chunkIndex)) return false;
        seen.add(chunk.chunkIndex);
        return true;
      });
    return unique
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
      .slice(0, limit)
      .map((chunk) => {
        const startLabel = chunk.startLabel || (chunk.startTime !== null && chunk.startTime !== undefined ? secondsToLabel(chunk.startTime) : '0:00');
        const endLabel = chunk.endLabel || (chunk.endTime !== null && chunk.endTime !== undefined ? secondsToLabel(chunk.endTime) : '0:00');
        return `[${startLabel} - ${endLabel}]\n${chunk.text}`;
      })
      .join('\n\n');
  }

  // ─── Prompt: edit src/lib/prompt/ai-video.js to change the system instruction ───
  systemInstruction(currentTime) {
    return buildSystemInstruction(currentTime, secondsToLabel);
  }

  formatHistory(messages) {
    return messages.slice(-6).map((message) => ({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text: message.content }],
    }));
  }

  async resolveQuery(message, history) {
    const hasPronounOrReference = /(\b(this|that|it|they|its|them|these|those)\b|compare with this|how does this work|why is that useful|what are its limitations)/i.test(message);

    if (!hasPronounOrReference || !history || history.length === 0) {
      return {
        resolvedQuery: message,
        historyTurnsUsed: 0
      };
    }

    const historyTurnsUsed = Math.min(6, history.length);
    const recentHistory = history.slice(-historyTurnsUsed);

    try {
      const historyText = recentHistory
        .map((msg) => `${msg.role === 'user' ? 'Student' : 'Tutor'}: ${msg.content || ''}`)
        .join('\n');

      const promptText = `Recent Chat History:\n${historyText}\n\nStudent's Latest Question: ${message}`;

      const rewriteResponse = await this.aiClient.generateContent({
        systemInstruction: 'You are a query expansion assistant. Resolving all pronouns (like "this", "that", "it", "they", "its", "them", "these", "those") using the recent chat history, rewrite the latest question to be a standalone, specific search query. Output ONLY the rewritten standalone query. Do not include any explanations, preamble, quotes, or JSON formatting.',
        contents: [
          { role: 'user', parts: [{ text: promptText }] }
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
      });

      const text = rewriteResponse?.response?.text()?.trim();
      if (text) {
        return {
          resolvedQuery: text,
          historyTurnsUsed
        };
      }
    } catch (err) {
      logger.warn('Failed to rewrite search query via LLM', { error: err.message, originalQuery: message });
    }

    return {
      resolvedQuery: message,
      historyTurnsUsed
    };
  }

  async getSessionHistory(studentId, lessonId, sessionId) {
    const session = await this.chatSessionRepository.findBySession(studentId, lessonId, sessionId);
    return session?.messages || [];
  }

  async ensureLessonReady(lessonId) {
    const lesson = await this.lessonRepository.findById(lessonId);
    if (!lesson) throw new AppError('Lesson not found.', 404);
    return lesson;
  }

  async *streamChat({ lessonId, message, currentTime = 0, history = [], signal }) {
    const retrievalStartMs = Date.now();
    const lesson = await this.ensureLessonReady(lessonId);

    if (lesson.status !== 'ready') {
      yield { type: 'error', message: `Video is still ${lesson.status}. Chatbot will be available once processing completes.` };
      return;
    }

    let firestoreChunks = [];
    let loadChunksFailed = false;
    let indexedChunksCount = 0;
    try {
      firestoreChunks = await this.chunkCacheService.getChunks(lessonId) || [];
      indexedChunksCount = firestoreChunks.length;
    } catch (err) {
      loadChunksFailed = true;
      logger.warn('Failed to load chunks from cache/Firestore (non-fatal for Level 1/2)', { lessonId, error: err.message });
    }

    const courseId = lesson.courseId || 'default-course';
    let matchedChunks = [];
    let fallbackLevelUsed = 1;
    let isFallbackUsed = false;
    let contextBlocks = '';
    let candidateCount = 0;
    let returnedCount = 0;

    let resolvedQuery = message;
    let historyTurnsUsed = 0;
    try {
      const resolution = await this.resolveQuery(message, history);
      resolvedQuery = resolution.resolvedQuery;
      historyTurnsUsed = resolution.historyTurnsUsed;
    } catch (err) {
      logger.warn('Failed to resolve conversational query', { error: err.message });
    }

    const raceWithTimeout = (promise, ms, errMsg) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(errMsg));
        }, ms);
      });
      return Promise.race([
        promise.then((res) => {
          clearTimeout(timeoutId);
          return res;
        }),
        timeoutPromise,
      ]);
    };

    // Determine context limit and retrieval depth dynamically
    const lowerMessage = message.toLowerCase();
    const isDeepQuery = /\b(compare|difference|versus|vs|summarize|summary|notes|architecture|design|why|how)\b/i.test(lowerMessage);
    const targetTopK = isDeepQuery ? 25 : 12;

    // LEVEL 1: Hybrid Vector Search
    if (this.vectorSearchService) {
      try {
        logger.info('Student Tutor retrieval Level 1: Hybrid Vector Search', { lessonId, courseId, targetTopK });
        matchedChunks = await raceWithTimeout(
          this.vectorSearchService.hybridSearch(courseId, resolvedQuery, { sourceIds: [lessonId], topK: targetTopK }),
          8000,
          'RetrievalTimeout'
        );
        if (matchedChunks && matchedChunks.length > 0) {
          fallbackLevelUsed = 1;
          contextBlocks = this.buildContextBlocks(matchedChunks, [], targetTopK);
          candidateCount = matchedChunks.length;
          const uniqueSet = new Set(matchedChunks.map(c => c.chunkIndex).filter(id => id !== undefined && id !== null));
          returnedCount = Math.min(uniqueSet.size || matchedChunks.length, targetTopK);
        }
      } catch (err) {
        logger.warn('Student Tutor retrieval Level 1 failed or timed out', { lessonId, error: err.message });
      }
    }

    // LEVEL 2: Lexical Search
    if (!contextBlocks && this.vectorSearchService) {
      try {
        logger.info('Student Tutor retrieval Level 2: Lexical Search', { lessonId, courseId, targetTopK });
        matchedChunks = await this.vectorSearchService.lexicalSearch(courseId, resolvedQuery, { sourceIds: [lessonId], topK: targetTopK, isLesson: true });
        if (matchedChunks && matchedChunks.length > 0) {
          fallbackLevelUsed = 2;
          contextBlocks = this.buildContextBlocks(matchedChunks, [], targetTopK);
          candidateCount = matchedChunks.length;
          const uniqueSet = new Set(matchedChunks.map(c => c.chunkIndex).filter(id => id !== undefined && id !== null));
          returnedCount = Math.min(uniqueSet.size || matchedChunks.length, targetTopK);
        }
      } catch (err) {
        logger.warn('Student Tutor retrieval Level 2 failed', { lessonId, error: err.message });
      }
    }

    // LEVEL 3: Transcript Search (Local BM25)
    if (!contextBlocks) {
      try {
        logger.info('Student Tutor retrieval Level 3: Transcript Search', { lessonId });
        if (!firestoreChunks.length) {
          throw new Error('No chunks found in Firestore cache');
        }
        fallbackLevelUsed = 3;
        isFallbackUsed = true;
        if (this.isSummaryRequest(message)) {
          const maxSample = 25;
          const step = Math.max(1, Math.floor(firestoreChunks.length / maxSample));
          matchedChunks = firestoreChunks.filter((_, i) => i % step === 0).slice(0, maxSample);
          contextBlocks = matchedChunks
            .map((chunk) => {
              const startLabel = chunk.startLabel || (chunk.startTime !== null && chunk.startTime !== undefined ? secondsToLabel(chunk.startTime) : '0:00');
              const endLabel = chunk.endLabel || (chunk.endTime !== null && chunk.endTime !== undefined ? secondsToLabel(chunk.endTime) : '0:00');
              return `[${startLabel} - ${endLabel}]\n${chunk.text}`;
            })
            .join('\n\n');
        } else {
          const semanticChunks = this.bm25Search(resolvedQuery, firestoreChunks, targetTopK);
          const temporalChunks = this.findTemporalChunks(firestoreChunks, currentTime, 3);
          matchedChunks = [...semanticChunks, ...temporalChunks];
          contextBlocks = this.buildContextBlocks(semanticChunks, temporalChunks, targetTopK);
        }
        candidateCount = firestoreChunks.length;
        const uniqueSet = new Set(matchedChunks.map(c => c.chunkIndex).filter(id => id !== undefined && id !== null));
        returnedCount = Math.min(uniqueSet.size || matchedChunks.length, targetTopK);
      } catch (err) {
        logger.warn('Student Tutor retrieval Level 3 failed', { lessonId, error: err.message });
      }
    }

    // LEVEL 4: Transcript Summary
    if (!contextBlocks) {
      try {
        logger.info('Student Tutor retrieval Level 4: Transcript Summary', { lessonId });
        const topicContext = lesson.topicSegments?.length
          ? lesson.topicSegments.map(s => `- [${s.startLabel}] ${s.title}: ${s.summary || ''}`).join('\n')
          : '';
        const starterContext = (lesson.starterQuestions || []).join('\n');
        if (topicContext || starterContext) {
          fallbackLevelUsed = 4;
          isFallbackUsed = true;
          contextBlocks = `Lesson Chapters:\n${topicContext}\n\nStarter Questions:\n${starterContext}`;
          candidateCount = (lesson.topicSegments?.length || 0) + (lesson.starterQuestions?.length || 0);
          returnedCount = (lesson.topicSegments?.length || 0) + (lesson.starterQuestions?.length || 0);
        }
      } catch (err) {
        logger.warn('Student Tutor retrieval Level 4 failed', { lessonId, error: err.message });
      }
    }

    // LEVEL 5: Lesson Metadata
    if (!contextBlocks) {
      try {
        logger.info('Student Tutor retrieval Level 5: Lesson Metadata', { lessonId });
        if (lesson.title || lesson.description) {
          fallbackLevelUsed = 5;
          isFallbackUsed = true;
          contextBlocks = `Lesson Title: ${lesson.title || ''}\nLesson Description: ${lesson.description || ''}`.trim();
          candidateCount = 2;
          returnedCount = 2;
        }
      } catch (err) {
        logger.warn('Student Tutor retrieval Level 5 failed', { lessonId, error: err.message });
      }
    }

    const retrievalLatency = Date.now() - retrievalStartMs;

    if (!contextBlocks || !contextBlocks.trim()) {
      try {
        await this.aiClient.generateContentStream({
          systemInstruction: this.systemInstruction(currentTime),
          contents: [
            ...this.formatHistory(history),
            { role: 'user', parts: [{ text: 'Test connection' }] },
          ],
          generationConfig: { temperature: 0.5, maxOutputTokens: 10 },
          signal,
        });

        if (loadChunksFailed) {
          throw new AppError('Transcript unavailable', 503);
        }
        if (indexedChunksCount === 0) {
          throw new AppError('No indexed content found', 404);
        }
        throw new AppError('Retrieval unavailable', 503);
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }
        throw new AppError('NVIDIA service temporarily unavailable', 503);
      }
    }

    const absentEntities = this.getAbsentEntities(message, lesson, firestoreChunks);

    const videoTitle = lesson.title ? `VIDEO TITLE: ${lesson.title}\n` : '';
    const lessonDescription = lesson.description ? `LESSON DESCRIPTION: ${lesson.description}\n` : '';
    const chapterTitles = lesson.topicSegments?.length
      ? `LECTURE CHAPTERS:\n${lesson.topicSegments.map(s => `- [${s.startLabel}] ${s.title}`).join('\n')}\n`
      : '';
    const userMessage = `${videoTitle}${lessonDescription}${chapterTitles}TRANSCRIPT CONTEXT (most relevant sections):\n\n${contextBlocks}\n\n---\nSTUDENT QUESTION: ${message}`;

    // Token audit metrics
    let retrievedText = '';
    if (fallbackLevelUsed === 1 || fallbackLevelUsed === 2) {
      retrievedText = matchedChunks.map(c => c.text || '').join('\n\n');
    } else if (fallbackLevelUsed === 3) {
      retrievedText = matchedChunks.map(c => c.text || '').join('\n\n');
    } else if (fallbackLevelUsed === 4) {
      const topicContext = lesson.topicSegments?.length
        ? lesson.topicSegments.map(s => `- [${s.startLabel}] ${s.title}: ${s.summary || ''}`).join('\n')
        : '';
      const starterContext = (lesson.starterQuestions || []).join('\n');
      retrievedText = `Lesson Chapters:\n${topicContext}\n\nStarter Questions:\n${starterContext}`;
    } else if (fallbackLevelUsed === 5) {
      retrievedText = `Lesson Title: ${lesson.title || ''}\nLesson Description: ${lesson.description || ''}`.trim();
    }

    const retrievedTokenCount = this.estimateTokens(retrievedText);
    const assembledTokenCount = this.estimateTokens(contextBlocks);
    const truncatedTokenCount = Math.max(0, retrievedTokenCount - assembledTokenCount);

    // Context-sensitive dynamic prompt adjustment
    let customSystemInstruction = this.systemInstruction(currentTime);

    if (/\b(compare|difference|versus|vs|better)\b/i.test(lowerMessage)) {
      customSystemInstruction += `\n\n⚠️ COMPARISON MODE ACTIVATED: Respond using the COMPARISON schema (type: "comparison"). Include overview, conceptA, conceptB (with strengths/weaknesses), differences table, whenToUseA, whenToUseB, examInsight, and verdict.`;
    } else if (/\b(architecture|design|pipeline|system|workflow|built|structured)\b/i.test(lowerMessage)) {
      customSystemInstruction += `\n\n⚠️ ARCHITECTURE QUESTION MODE: Respond using the ARCHITECTURE schema (type: "architecture"). Include overview, components, dataFlow, howItWorks steps, tradeoffs, failureModes, scalingConsiderations, realWorldUsage, and keyTakeaway.`;
    } else if (/\bwhy\b/i.test(lowerMessage)) {
      customSystemInstruction += `\n\n⚠️ WHY QUESTION MODE: Respond using the WHY schema (type: "why"). Fill coreReason, mechanism, practicalImpact, counterpoint, example, and keyInsight with substantive depth. Never give a shallow reason.`;
    } else if (/\bhow\b/i.test(lowerMessage)) {
      customSystemInstruction += `\n\n⚠️ HOW QUESTION MODE: Respond using the HOW schema (type: "howto"). Provide a numbered steps array, commonPitfalls, bestPractices, and realWorldExample. Each step must explain what happens AND why.`;
    }

    if (returnedCount > 1) {
      customSystemInstruction += `\n\nℹ️ Multiple lecture sections are available. MUST synthesize across all chunks — do not answer from only one chunk.`;
    }

    if (isFallbackUsed) {
      customSystemInstruction += `\n\n⚠️ RETRIEVAL WARNING: The exact lecture section could not be retrieved. Begin the main explanation field (directAnswer, coreReason, or overview depending on schema type) with: "Based on the available lesson content, " — then continue your explanation. Do NOT output any text outside the JSON object.`;
    }

    if (absentEntities.length > 0) {
      customSystemInstruction += `\n\n⚠️ ENTITY GROUNDING ALERT: The student is asking about specific entity/entities: ${absentEntities.map(e => `'${e}'`).join(', ')}. These entities DO NOT appear anywhere in the lecture context, titles, description, or transcript.
You MUST NOT define, explain, or provide details (architecture, strengths, weaknesses, comparisons, setup, use cases) for: ${absentEntities.map(e => `'${e}'`).join(', ')}.
Instead:
- If the student is asking to define or explain the absent entity directly, you MUST use the NOT COVERED SCHEMA (type: "answer", notCovered: true) stating that this entity is not covered in this lecture.
- If the student is relating the absent entity to a covered concept (e.g. asking "Is Pinecone a vector database?" where vector databases are covered), you MUST NOT define or explain the absent entity. You may only state that the lecture does not mention the entity specifically, and then answer the question only in terms of the covered concept. Example response: "The lecture does not mention X specifically. However, the lecture does discuss Y. X is an example of Y, but that specific tool is not covered in this lecture."`;
    }

    let finalResponseSource = 'NVIDIA';
    const generationStartMs = Date.now();
    let streamResult;
    let fallbackActivatedProvider = false;
    let providerAttempted = [];
    let providerFailed = [];
    let providerUsed = 'none';

    try {
      streamResult = await this.aiClient.generateContentStream({
        systemInstruction: customSystemInstruction,
        contents: [
          ...this.formatHistory(history),
          { role: 'user', parts: [{ text: userMessage }] },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1500 },
        signal,
      });

      if (streamResult.diagnostics) {
        providerAttempted = streamResult.diagnostics.providerAttempted || [];
        providerFailed = streamResult.diagnostics.providerFailed || [];
        providerUsed = streamResult.diagnostics.providerUsed || 'none';
        if (providerFailed.length > 0) {
          fallbackActivatedProvider = true;
        }
      }
    } catch (err) {
      logger.error('AI client generateContentStream failed', { lessonId, error: err.message });
      throw new AppError('NVIDIA service temporarily unavailable', 503);
    }

    let fullResponse = '';
    try {
      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (!text) continue;
        fullResponse += text;
        yield { type: 'token', content: text };
      }
    } catch (err) {
      logger.error('Error during AI stream execution', { lessonId, error: err.message });
      throw new AppError('NVIDIA service temporarily unavailable', 503);
    }

    const generationLatency = Date.now() - generationStartMs;

    logger.info(`[TUTOR QUALITY AUDIT]`, {
      retrievalLevelUsed: fallbackLevelUsed,
      candidateChunks: candidateCount,
      returnedChunks: returnedCount,
      contextTokenCount: assembledTokenCount,
      providerUsed: providerUsed,
      generationTimeMs: generationLatency,
      retrievedTokenCount,
      truncatedTokenCount,
      fallbackActivated: isFallbackUsed || fallbackActivatedProvider,
      finalResponseSource,
      originalQuery: message,
      resolvedQuery,
      historyTurnsUsed,
    });

    const followUps = await this.generateFollowUpQuestions(fullResponse);
    yield { type: 'followUps', items: followUps };
    yield { type: 'done', fullResponse, followUps };
  }

  async generateFollowUpQuestions(aiAnswer) {
    const fallback = [
      'How would this work in a real RAG system?',
      'What are the limitations of this approach?',
      'How does this compare with vector search?',
    ];

    try {
      const prompt = `Based on this AI tutor answer about a lecture:
"${aiAnswer.substring(0, 1200)}"

Suggest 3 natural, advanced, and highly specific follow-up questions a student might ask next to deepen their understanding.
Avoid generic follow-up questions like "Can you give me an example?", "Summarize this section", or "What comes after this?".
Instead, generate highly specific questions related to the technology/concepts in the answer.
For example, if the answer is about retrieval systems, generate questions like:
- "How would this work in a real RAG system?"
- "What are the limitations of this approach?"
- "How does this compare with vector search?"

Make them short, specific, directly related to what was just explained, and in English only.
Return ONLY a valid JSON array of 3 strings. No markdown, no explanation.`;

      const result = await this.aiClient.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 200 },
      });

      const jsonMatch = result.response.text().trim().match(/\[[\s\S]*\]/);
      if (!jsonMatch) return fallback;

      const questions = JSON.parse(jsonMatch[0]);
      return Array.isArray(questions) ? questions.slice(0, 3) : fallback;
    } catch {
      return fallback;
    }
  }

  async saveSessionMessage(sessionId, lessonId, studentId, userMessage, aiMessage, followUps) {
    try {
      await this.chatSessionRepository.appendMessages(
        sessionId,
        lessonId,
        studentId,
        { user: userMessage, assistant: aiMessage },
        followUps,
      );
    } catch (err) {
      logger.warn(`Failed to save chat session: ${err.message}`);
    }
  }

  async generateSummary(lessonId, type = 'full', startTime = 0, endTime = 0) {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) throw new AppError('No transcript chunks found', 404);

    const selectedChunks = this.selectSummaryChunks(chunks, type, startTime, endTime);
    if (!selectedChunks.length) throw new AppError('No transcript content found for this range.', 404);

    const context = selectedChunks.map((chunk) => `[${chunk.startLabel}] ${chunk.text}`).join('\n\n');
    const scopeInstruction = {
      full: 'Provide a complete, comprehensive summary covering every major topic, concept, and example from the lecture.',
      last5min: 'Focus exclusively on the final section: concluding arguments, key takeaways, and any calls to action.',
      range: 'Summarise only the content within the given timestamp range - nothing outside it.',
    }[type] || 'Summarise the main content.';

    const prompt = `You are an elite educational content curator. Write the entire summary in English only.

${scopeInstruction}

Required format:
### TL;DR
One powerful sentence.

### Core Concepts
- Concept Name — clear explanation

### Key Points
- 5-8 important points

### Examples & Definitions
Mention examples, definitions, or code from the lecturer.

### Quick-Recall Flashcards
3-5 Q&A pairs.

TRANSCRIPT:
${context}`;

    const result = await this.aiClient.generateContent(prompt);
    return result.response.text();
  }

  selectSummaryChunks(chunks, type, startTime, endTime) {
    const totalDuration = chunks[chunks.length - 1]?.endTime || 0;

    if (type === 'full') {
      const first20 = chunks.slice(0, 20);
      const last20 = chunks.slice(-20);
      const seen = new Set(first20.map((chunk) => chunk.chunkIndex));
      return [...first20, ...last20.filter((chunk) => !seen.has(chunk.chunkIndex))];
    }

    if (type === 'last5min') {
      const cutoff = Math.max(0, totalDuration - 300);
      return chunks.filter((chunk) => chunk.startTime >= cutoff);
    }

    if (type === 'range') {
      return chunks.filter((chunk) => chunk.startTime >= startTime && chunk.endTime <= endTime);
    }

    return chunks.slice(0, 30);
  }

  buildQuizPrompt(batchCount, difficulty, context) {
    const difficultyNote = difficulty === 'mixed'
      ? 'Vary the difficulty: recall, application, and deeper analysis.'
      : difficulty === 'easy'
        ? 'All questions must be foundational.'
        : difficulty === 'hard'
          ? 'All questions must require advanced analysis or synthesis.'
          : 'All questions must test understanding and application.';

    return `Generate exactly ${batchCount} MCQ questions from the transcript.

${difficultyNote}

Rules:
1. Base questions ONLY on the transcript. Each tests a different concept.
2. answer = single letter only: A, B, C, or D.
3. explanation = 1-2 sentences.
4. startLabel = timestamp like "1:23".
5. difficulty = easy | medium | hard.
6. topic = 2-4 word label.

Return ONLY raw JSON array.

TRANSCRIPT:
${context}`;
  }

  parseQuizResponse(raw) {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((question) => question.question && Array.isArray(question.options) && question.options.length >= 2 && question.answer)
        .map((question) => ({
          question: question.question,
          options: question.options.slice(0, 4),
          answer: String(question.answer).trim().charAt(0).toUpperCase(),
          explanation: question.explanation || '',
          startLabel: question.startLabel || '',
          difficulty: question.difficulty || 'medium',
          topic: question.topic || '',
        }));
    } catch {
      return [];
    }
  }

  async generateQuiz(lessonId, count = 10, _type = 'mcq', difficulty = 'mixed') {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) throw new AppError('No transcript data found for this lesson.', 404);

    const maxChunks = 20;
    const step = Math.max(1, Math.floor(chunks.length / maxChunks));
    const context = chunks
      .filter((_, index) => index % step === 0)
      .slice(0, maxChunks)
      .map((chunk) => `[${chunk.startLabel || '0:00'}] ${chunk.text.slice(0, 250)}`)
      .join('\n\n');

    const batchSize = 5;
    const batches = [];
    for (let index = 0; index < count; index += batchSize) {
      batches.push(Math.min(batchSize, count - index));
    }

    const allQuestions = [];
    for (const batchCount of batches) {
      let batch = [];

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.aiClient.generateContent(this.buildQuizPrompt(batchCount, difficulty, context));
        batch = this.parseQuizResponse(result.response.text().trim());
        if (batch.length) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      allQuestions.push(...batch);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!allQuestions.length) {
      throw new AppError('AI could not generate any valid questions. Please try again.', 502);
    }

    const seen = new Set();
    return allQuestions
      .filter((question) => {
        const key = question.question.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, count);
  }

  detectEntities(message) {
    const entities = new Set();
    const knownEntities = [
      'langchain', 'llamaindex', 'pinecone', 'chroma', 'chromadb', 'qdrant', 'milvus', 'weaviate',
      'openai', 'gpt', 'chatgpt', 'gpt-4', 'gpt-3', 'gpt-4o', 'claude', 'gemini', 'google',
      'hugging face', 'huggingface', 'cohere', 'mistral', 'llama', 'flowise', 'langflow', 'vllm', 'ollama',
      'deepseek', 'nvidia', 'microsoft', 'azure', 'aws', 'amazon', 'bedrock', 'sagemaker',
      'vertex', 'vertexai', 'langsmith', 'langfuse', 'phoenix', 'arize', 'truera',
      'tensorflow', 'pytorch', 'keras', 'spacy', 'nltk', 'scikit', 'sklearn', 'pandas', 'numpy',
      'redis', 'elasticsearch', 'opensearch', 'mongodb', 'postgres', 'postgresql', 'supabase',
      'react', 'vue', 'nextjs', 'docker', 'kubernetes', 'k8s', 'github', 'gitlab', 'git'
    ];

    const lowerMessage = message.toLowerCase();
    for (const ent of knownEntities) {
      const regex = new RegExp(`\\b${ent}\\b`, 'i');
      if (regex.test(lowerMessage)) {
        entities.add(ent);
      }
    }

    const words = message.split(/\s+/);
    const commonStarts = new Set(['what', 'how', 'why', 'is', 'are', 'can', 'do', 'does', 'explain', 'compare', 'the', 'a', 'an']);

    words.forEach((word, idx) => {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '');
      if (cleanWord.length > 1 && cleanWord[0] === cleanWord[0].toUpperCase()) {
        const lowerWord = cleanWord.toLowerCase();
        if (idx === 0 && commonStarts.has(lowerWord)) {
          return;
        }
        if (!commonStarts.has(lowerWord)) {
          entities.add(lowerWord);
        }
      }
    });

    return Array.from(entities);
  }

  getAbsentEntities(message, lesson, firestoreChunks) {
    const detected = this.detectEntities(message);
    if (detected.length === 0) return [];

    const lectureSources = [
      lesson.title || '',
      lesson.description || '',
      (lesson.topicSegments || []).map(s => `${s.title} ${s.summary || ''}`).join(' '),
      (lesson.starterQuestions || []).join(' '),
      firestoreChunks.map(c => c.text || '').join(' ')
    ].join(' ').toLowerCase();

    return detected.filter(ent => !lectureSources.includes(ent));
  }

  async getLatestSession(studentId, lessonId) {
    return this.chatSessionRepository.findLatestForLesson(studentId, lessonId);
  }

  async deleteSession(studentId, sessionId) {
    const deleted = await this.chatSessionRepository.deleteBySession(studentId, sessionId);
    if (!deleted) throw new AppError('Session not found.', 404);
  }
}

export default ChatService;
