import logger from '../../loggers/logger.js';
import { buildAdaptiveSystemPrompt, buildGroundingPrompt, buildFollowUpPrompt } from '../../lib/prompt/workspace-chat.js';
import { classifyIntent } from '../../lib/prompt/questionAnalyzer.js';

class WorkspaceChatService {
  constructor({
    vectorSearchService,
    contextManagerService,
    workspaceMemoryService,
    workspaceChatRepository,
    chatProvider,
    retrievalEvaluationService,
    workspaceSourceRepository,
  }) {
    this.vectorSearch = vectorSearchService;
    this.contextManager = contextManagerService;
    this.workspaceMemory = workspaceMemoryService;
    this.chatRepo = workspaceChatRepository;
    this.chatProvider = chatProvider;
    this.retrievalEvaluation = retrievalEvaluationService;
    this.sourceRepo = workspaceSourceRepository;
  }

  formatHistory(messages = []) {
    // Only take the last 6 messages to prevent overflow and focus context
    return messages.slice(-6).map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));
  }

  /**
   * Generate contextual follow-up questions after a response.
   * Falls back gracefully to empty array if generation fails.
   */
  async generateFollowUpQuestions(query, response, mode, intent = 'concept_understanding', learningLevel = 'intermediate') {
    if (!this.chatProvider) return [];
    try {
      const prompt = buildFollowUpPrompt(query, response, mode, intent, learningLevel);
      const result = await this.chatProvider.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 400 },
      });
      const text = result.response?.text?.()?.trim() || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          // Support both legacy string arrays and new object arrays
          return parsed
            .filter(q => (typeof q === 'string' && q.length > 5) || (typeof q === 'object' && q?.question))
            .slice(0, 4)
            .map(q => typeof q === 'string' ? { question: q, reason: 'Explore further', type: 'deeper' } : q);
        }
      }
    } catch (err) {
      logger.warn('Follow-up question generation failed (non-fatal)', { error: err.message });
    }
    return [];
  }

  /**
   * Generate an internal answer plan to guide the AI response structure.
   * This ensures the model TEACHES rather than dumps transcript text.
   */
  async buildAnswerPlan(query, contextText, mode) {
    if (!this.chatProvider) return null;
    try {
      const prompt = `You are a pedagogical planner. Given this user question and some source material, 
create a brief teaching plan (3-5 bullets) that outlines how to explain this topic clearly and progressively.
Be concise. Return ONLY a plain text bullet list.

Question: "${query}"
Mode: ${mode}
Context excerpt: "${contextText.substring(0, 800)}..."`;

      const result = await this.chatProvider.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 150 },
      });
      return result.response?.text?.()?.trim() || null;
    } catch {
      return null;
    }
  }

  async *streamChat({ workspaceId, message, chatId, mode = 'explain', depth = 'detailed', history = [], signal }) {
    let matchedChunks = [];
    let isFallbackUsed = false;
    try {
      logger.info('Workspace stream chat initiated', { workspaceId, chatId, mode });

      const sources = await this.sourceRepo.findByWorkspace(workspaceId);
      const activeStatuses = [
        'ready', 'completed', 'partially_ready', 'transcript_ready',
        'vector_ready', 'graph_ready', 'ready_without_vectors',
        'indexing_pending', 'indexing_retrying', 'fully_indexed',
      ];
      const activeSources = sources ? sources.filter(s => activeStatuses.includes(s.status)) : [];
      if (activeSources.length === 0) {
        yield {
          type: 'error',
          message: "No source material available in this workspace."
        };
        return;
      }

      const { providerHealthStatus } = await import('../../config/providerStatusState.js');
      const isDegradedMode = providerHealthStatus.searchMode === 'degraded';
      if (isDegradedMode) {
        logger.warn("Qdrant unavailable, entering degraded retrieval mode");
      }



      if (isDegradedMode) {
        logger.info('Retrieval degraded: bypassing hybrid search and running layered fallbacks directly.');
        isFallbackUsed = true;
        matchedChunks = await this.vectorSearch.runLayeredFallbacks(workspaceId, message, 15);
      } else {
        try {
          // Step 1: Hybrid retrieval across workspace chunks
          matchedChunks = await this.vectorSearch.hybridSearch(workspaceId, message, { topK: 15 });
        } catch (err) {
          logger.warn('Hybrid search failed or timed out. Falling back to local keyword matching.', {
            workspaceId,
            error: err.message,
          });
          isFallbackUsed = true;
        }
      }

      // If hybrid search returned nothing, trigger BM25 text fallback
      if (!matchedChunks || matchedChunks.length === 0) {
        logger.info('Performing BM25 text fallback for workspace chat', { workspaceId });
        isFallbackUsed = true;

        const textChunks = [];
        for (const src of activeSources) {
          const transcriptText = src.transcript || `Source: ${src.title || 'Untitled Source'} - No transcript available.`;
          const paragraphs = transcriptText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
          let chunkIndex = 0;
          for (const p of paragraphs) {
            const maxLen = 800;
            let start = 0;
            while (start < p.length) {
              const text = p.substring(start, start + maxLen);
              textChunks.push({
                text,
                sourceId: src.id,
                sourceTitle: src.title,
                sourceType: src.type,
                chunkIndex: chunkIndex++,
                startTime: null,
                endTime: null,
                pageNumber: null,
                sectionTitle: 'Transcript Segment',
                relevance: 1.0,
                semanticScore: 1.0,
              });
              start += maxLen - 150;
            }
          }
        }

        const queryTerms = message.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        matchedChunks = textChunks
          .map(chunk => {
            let score = 0;
            const textLower = chunk.text.toLowerCase();
            for (const term of queryTerms) {
              if (textLower.includes(term)) score += textLower.split(term).length - 1;
            }
            return { ...chunk, score };
          })
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
      }

      if (!matchedChunks || matchedChunks.length === 0) {
        yield {
          type: 'error',
          message:
            "I couldn't find relevant information in your uploaded sources. Try uploading more materials on this topic.",
        };
        return;
      }

      console.log('STREAM STEP 2: Retrieval complete');
      logger.info('STREAM STEP 2: Retrieval complete');

      // Step 2: Context window assembly
      const { contextText, sourcesUsed } = await this.contextManager.assembleContext(
        matchedChunks,
        message,
        { maxTokens: 3000, diversityWeight: 0.5 }
      );
      console.log('STREAM STEP 3: Context assembled');
      logger.info('STREAM STEP 3: Context assembled');

      // Step 3: Workspace memory context
      const memoryContext = await this.workspaceMemory.getAdaptivePromptContext(workspaceId);

      // Step 3.5: Question intent classification (synchronous, no I/O)
      const questionAnalysis = classifyIntent(message, history);
      const { intent, learningLevel } = questionAnalysis;

      logger.info('[PIPELINE] Question classified', {
        workspaceId,
        intent,
        learningLevel,
        topicKeywords: questionAnalysis.topicKeywords,
      });

      // Step 4: Answer planning (non-blocking, parallel with context assembly)
      let answerPlan = null;
      try {
        answerPlan = await this.buildAnswerPlan(message, contextText, mode);
      } catch { /* non-fatal */ }

      // V3: Load concept graph to check for prerequisite warnings
      const learningGraph = await this.workspaceMemory.getOrCreateLearningGraph(workspaceId);
      let prerequisiteWarning = '';
      if (learningGraph && learningGraph.length > 0) {
        const queryLower = message.toLowerCase();
        for (const node of learningGraph) {
          const conceptLower = node.concept.toLowerCase();
          const isMentioned = queryLower.includes(conceptLower) || 
                              node.relatedConcepts?.some(rc => queryLower.includes(rc.toLowerCase()));
          
          if (isMentioned && node.prerequisites?.length > 0) {
            for (const prereqName of node.prerequisites) {
              const prereqNode = learningGraph.find(n => n.concept.toLowerCase() === prereqName.toLowerCase());
              const score = prereqNode ? prereqNode.masteryScore : 0;
              if (score < 40) {
                prerequisiteWarning = `⚠️ Prerequisite warning: You are asking about ${node.concept}, but haven't covered ${prereqName} yet. Check out [${prereqName}] first!`;
                break;
              }
            }
          }
          if (prerequisiteWarning) break;
        }
      }

      // Step 5: Adaptive system and Grounding prompts
      const systemInstruction = buildAdaptiveSystemPrompt(mode, intent, learningLevel, memoryContext, sourcesUsed, depth);
      const groundingUserPrompt = buildGroundingPrompt(contextText, sourcesUsed);

      const planSection = answerPlan
        ? `\n\nTEACHING PLAN — Follow this pedagogical outline for your response:\n${answerPlan}\n`
        : '';

      const userMessageText = `${groundingUserPrompt}${planSection}\n\nUSER QUESTION:\n${message}`;

      // Step 6: Yield sources immediately before tokens stream
      yield { type: 'sources', items: sourcesUsed };

      logger.info('[PIPELINE] Context Length', { workspaceId, contextTokens: Math.round(contextText.length / 4) });
      logger.info('[PIPELINE] Model Response Started', { workspaceId });

      console.log('STREAM STEP 4: NVIDIA generation started');
      logger.info('STREAM STEP 4: NVIDIA generation started');

      // Step 7: Execute Gemini streaming
      const streamResult = await this.chatProvider.generateContentStream({
        systemInstruction,
        contents: [
          ...this.formatHistory(history),
          { role: 'user', parts: [{ text: userMessageText }] },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2000,
        },
      });

      let fullResponse = '';
      if (prerequisiteWarning) {
        const warningToken = `<!--PREREQUISITE_WARNING:${prerequisiteWarning}-->\n`;
        fullResponse += warningToken;
        yield { type: 'token', content: warningToken };
      }

      let firstTokenReceived = false;
      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (!text) continue;
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          console.log('STREAM STEP 5: First token received');
          logger.info('STREAM STEP 5: First token received');
        }
        fullResponse += text;
        yield { type: 'token', content: text };
      }

      logger.info('[PIPELINE] Model Response Completed', { workspaceId, responseChars: fullResponse.length });

      // Step 8: Generate follow-up questions (async, non-blocking)
      let followUpQuestions = [];
      try {
        followUpQuestions = await this.generateFollowUpQuestions(message, fullResponse, mode, intent, learningLevel);
        if (followUpQuestions.length > 0) {
          yield { type: 'followUp', questions: followUpQuestions };
        }
      } catch { /* non-fatal */ }

      // Step 9: Record in workspace memory
      if (!isFallbackUsed) {
        await this.workspaceMemory.recordInteraction(workspaceId, message, matchedChunks);
      }

      // Step 10: Calculate Grounded Trust Metrics
      const trustMetrics = this.retrievalEvaluation.evaluateRetrieval(
        message, fullResponse, matchedChunks
      );

      // Step 11: Save messages in Firestore
      const userMessage = {
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };
      
      const resolvedProvider = this.chatProvider?.status?.().provider || 'nvidia';
      const resolvedModel = this.chatProvider?.status?.().model || 'meta/llama-3.3-70b-instruct';
      const retrievalMode = (isFallbackUsed || isDegradedMode) ? 'fallback' : 'vector';

      logger.info(`Workspace response generated successfully. Retrieval mode: ${retrievalMode}, Provider: ${resolvedProvider}, Model: ${resolvedModel}`);

      const assistantMessage = {
        role: 'assistant',
        content: fullResponse,
        sources: sourcesUsed,
        trustMetrics,
        followUpQuestions,
        mode,
        questionIntent: intent,
        learningLevel,
        retrievalMode,
        createdAt: new Date().toISOString(),
      };

      await this.chatRepo.appendMessage(workspaceId, chatId, userMessage);
      await this.chatRepo.appendMessage(workspaceId, chatId, assistantMessage);

      yield { type: 'done', fullResponse, sourcesUsed, trustMetrics, followUpQuestions, questionIntent: intent, learningLevel, retrievalMode };
      console.log('STREAM STEP 9: Stream completed');
      logger.info('STREAM STEP 9: Stream completed');
    } catch (error) {
      logger.error('Workspace streaming chat failed', {
        message: error.message,
        stack: error.stack,
        workspaceId,
        chatId,
        providerResponse: error.response?.data || error.response || error.data || null,
        retrievalStats: {
          matchedChunksCount: matchedChunks?.length || 0,
          isFallbackUsed
        }
      });
      yield {
        type: 'error',
        message: `An AI processing error occurred: ${error.message}`,
        details: {
          stack: error.stack,
          providerResponse: error.response?.data || error.response || error.data || null,
          matchedChunksCount: matchedChunks?.length || 0
        }
      };
    }
  }

  async getChatHistory(workspaceId, chatId) {
    const chat = await this.chatRepo.findById(workspaceId, chatId);
    return chat?.messages || [];
  }

  async listChats(workspaceId) {
    return this.chatRepo.findByWorkspace(workspaceId);
  }

  async createChat(workspaceId, { mode = 'explain', title = 'New Conversation' }) {
    return this.chatRepo.create(workspaceId, { mode, title });
  }

  async deleteChat(workspaceId, chatId) {
    return this.chatRepo.delete(workspaceId, chatId);
  }
}

export default WorkspaceChatService;
