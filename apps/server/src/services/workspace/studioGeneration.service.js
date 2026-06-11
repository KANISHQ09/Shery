import crypto from 'crypto';
import logger from '../../loggers/logger.js';
import { buildStudioPrompt } from '../../lib/prompt/workspace-chat.js';
import AppError from '../../utils/AppError.js';
import { buildMermaidDiagram } from './mermaidGraphBuilder.js';

class StudioGenerationService {
  constructor({
    vectorSearchService,
    contextManagerService,
    workspaceOutputRepository,
    workspaceSourceRepository,
    chatProvider,
    geminiFlash,
    vectorSearchTimeout = 1500,
    llmTimeout = 6000,
    overallTimeout = 9500,
  }) {
    this.vectorSearch = vectorSearchService;
    this.contextManager = contextManagerService;
    this.outputRepo = workspaceOutputRepository;
    this.sourceRepo = workspaceSourceRepository;
    this.chatProvider = chatProvider;
    this.geminiFlash = geminiFlash;
    this.vectorSearchTimeout = vectorSearchTimeout;
    this.llmTimeout = llmTimeout;
    this.overallTimeout = overallTimeout;
  }

  async tryProviderChain(prompt, generationConfig = {}) {
    if (this.chatProvider) {
      try {
        const result = await this.chatProvider.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        });
        const text = result.response?.text() || '';
        if (text.trim()) return text;
      } catch (nvidiaErr) {
        logger.warn('[Studio] NVIDIA provider chain exhausted, falling back to Gemini', {
          error: nvidiaErr.message,
        });
      }
    }

    if (this.geminiFlash) {
      try {
        const result = await this.geminiFlash.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        });
        const text = result.response?.text() || '';
        if (text.trim()) return text;
      } catch (geminiErr) {
        logger.error('[Studio] Gemini fallback also failed', { error: geminiErr.message });
        throw geminiErr;
      }
    }

    throw new AppError('No AI provider available for studio generation.', 503);
  }

  computeTokenBudget(depth, sourceCount, chunkCount) {
    const baseBudgets = { quick: 2000, standard: 3500, deep: 5500, expert: 7500 };
    const base = baseBudgets[depth] || 3500;
    const sourceBonus = Math.min(sourceCount * 200, 1500);
    const chunkBonus = Math.min(chunkCount * 30, 1000);
    return Math.min(base + sourceBonus + chunkBonus, 12000);
  }

  computeLearningScore(matchedChunks, content, sourcesUsed) {
    const coverageScore = Math.min((matchedChunks.length || 0) / 25, 1.0);
    const groundingScore = Math.min((sourcesUsed.length || 0) / 5, 1.0);
    const lengthScore = Math.min((content.length || 0) / 6000, 1.0);
    const uniqueSources = new Set(matchedChunks.map(c => c.sourceId)).size;
    const completenessScore = ((coverageScore + groundingScore + lengthScore) / 3).toFixed(3);
    const difficultyScore = Math.min(matchedChunks.filter(c => (c.score || 0) < 0.6).length / matchedChunks.length, 1.0).toFixed(3);
    return { coverageScore: coverageScore.toFixed(3), groundingScore: groundingScore.toFixed(3), completenessScore, difficultyScore, uniqueSources };
  }

  async generate(workspaceId, type, opts = {}) {
    const outputTypeLabels = {
      study_guide: 'Deep Study Guide',
      flashcards: 'Flashcards',
      faq: 'Grounded FAQ',
      key_insights: 'Research Insights',
      key_definitions: 'Glossary',
      interview_questions: 'Mock Q&A',
      topic_breakdown: 'Interactive Mind Map',
      exam_prep: 'Exam Simulator',
      revision_sheet: 'Revision Sheet',
      mermaid_diagram: 'Mermaid Knowledge Diagram',
    };

    const label = outputTypeLabels[type] || 'Study Guide';
    const depth = opts.depth || 'standard';

    // 1. Retrieve sources and compute sourceHash
    let sources = [];
    if (this.sourceRepo) {
      sources = await this.sourceRepo.findByWorkspace(workspaceId);
    }
    const sortedSourceIds = (sources || []).map(s => s.id).sort();
    const hashInput = `${workspaceId}:${sortedSourceIds.join(',')}`;
    const sourceHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    // 2. Cache check (for study_guide only)
    if (type === 'study_guide') {
      try {
        const snapshot = await this.outputRepo.collection(workspaceId)
          .where('type', '==', 'study_guide')
          .where('sourceHash', '==', sourceHash)
          .where('status', '==', 'ready')
          .get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          logger.info('Cache hit for study guide source hash', { workspaceId, outputId: doc.id, sourceHash });
          return { id: doc.id, ...doc.data() };
        }
      } catch (cacheErr) {
        logger.warn('Failed to query cache for study guide', { error: cacheErr.message });
      }
    }

    // 3. Create the output document with status 'generating'
    const outputDoc = await this.outputRepo.create(workspaceId, {
      type,
      title: opts.title || label,
      content: '',
      sourcesUsed: [],
      status: 'generating',
      depth,
      sourceHash: type === 'study_guide' ? sourceHash : null,
    });
    const outputId = outputDoc.id;

    let matchedChunks = [];

    try {
      logger.info('Starting studio generation', { workspaceId, outputId, type, depth });

      const broadSearchQuery = opts.topicFocus || 'main concepts, technical definitions, key details and core architecture';
      // For study guide, we fetch enough chunks then slice to top 8. Otherwise, we fetch 25.
      const topK = type === 'study_guide' ? 60 : 25;

      if (type !== 'interview_questions') {
        matchedChunks = await this.vectorSearch.hybridSearch(workspaceId, broadSearchQuery, { topK });

        if (!matchedChunks || matchedChunks.length === 0) {
          if (type === 'mermaid_diagram') {
            const bannerMsg = 'Insufficient grounded evidence found. No source chunks could be retrieved from your uploaded documents. Please upload more sources or add additional content to your workspace before generating this asset.';
            const insufficientContent = `<SummaryBanner>${bannerMsg}</SummaryBanner>`;
            return await this.outputRepo.update(workspaceId, outputId, {
              content: insufficientContent,
              sourcesUsed: [],
              status: 'ready',
            });
          }
          throw new AppError('Could not retrieve any content from the uploaded documents. Please upload sources first.', 400);
        }
      }

      if (type === 'mermaid_diagram') {
        const graphResult = await buildMermaidDiagram(matchedChunks, this.geminiFlash);
        const finalContent = JSON.stringify(graphResult);
        const finalOutput = await this.outputRepo.update(workspaceId, outputId, {
          content: finalContent,
          sourcesUsed: matchedChunks.map(c => ({
            sourceId: c.sourceId || c.id || 'unknown',
            title: c.sourceTitle || c.title || 'Source',
            type: c.sourceType || c.type || 'unknown'
          })).slice(0, 10),
          status: 'ready',
          depth,
        });
        logger.info('Studio generation completed (Mermaid Knowledge Diagram)', { workspaceId, outputId, type, depth });
        return finalOutput;
      }

      if (type === 'interview_questions') {
        const raceWithTimeout = (promise, ms, errMsg) => {
          logger.info(`[raceWithTimeout] Start timeout race for ${errMsg} with ms = ${ms}`);
          let timeoutId;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              logger.info(`[raceWithTimeout] Timeout fired for ${errMsg} after ${ms}ms`);
              reject(new Error(errMsg));
            }, ms);
          });
          return Promise.race([promise, timeoutPromise]).finally(() => {
            logger.info(`[raceWithTimeout] Race settled for ${errMsg}. Clearing timer.`);
            if (timeoutId) clearTimeout(timeoutId);
          });
        };

        const generateQuestionsProcess = async () => {
          // 1. Retrieve chunks with 1500ms timeout using multi-query retrieval
          try {
            const queries = [
              "What is the system?",
              "How does the architecture work?",
              "What technologies are used?",
              "What are implementation details?",
              "What are deployment considerations?"
            ];

            const searchPromises = queries.map(q =>
              this.vectorSearch.hybridSearch(workspaceId, q, {
                topK: 15,
                assetType: 'interview_questions'
              })
            );

            const settledResults = await raceWithTimeout(
              Promise.allSettled(searchPromises),
              this.vectorSearchTimeout,
              'SearchTimeout'
            );

            // Merge and deduplicate
            const seen = new Set();
            matchedChunks = [];
            for (const res of settledResults) {
              if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                for (const chunk of res.value) {
                  const key = chunk.id || 
                    ((chunk.sourceId && chunk.chunkIndex !== undefined && chunk.chunkIndex !== null) 
                      ? `${chunk.sourceId}:${chunk.chunkIndex}` 
                      : null) || 
                    chunk.text;
                  if (!seen.has(key)) {
                    seen.add(key);
                    matchedChunks.push(chunk);
                  }
                }
              }
            }
          } catch (searchErr) {
            logger.warn('[Studio] Vector search failed or timed out for Mock Q&A, fallback to empty search chunks.', {
              error: searchErr.message
            });
            matchedChunks = [];
          }

          if (!matchedChunks || matchedChunks.length === 0) {
            logger.info('[Studio] No matched chunks from vector search, falling back to source overview chunks.');
            matchedChunks = this.extractChunksFromSources(sources || []);
          }

          if (!matchedChunks || matchedChunks.length === 0) {
            const insufficientContent = `<SummaryBanner>Insufficient grounded evidence found. No source chunks could be retrieved. Please upload more sources or add additional content to your workspace before generating Mock Q&A.</SummaryBanner>`;
            return await this.outputRepo.update(workspaceId, outputId, {
              content: insufficientContent,
              sourcesUsed: [],
              status: 'ready',
            });
          }

          // Limit context text to 12000 characters for rich interview answer generation
          let contextText = '';
          const sourcesUsed = [];
          for (const chunk of matchedChunks) {
            const title = chunk.sourceTitle || chunk.title || 'Source';
            const srcId = chunk.sourceId || chunk.id || 'unknown';
            const srcType = chunk.sourceType || chunk.type || 'unknown';
            
            if (contextText.length + chunk.text.length > 12000) {
              const remaining = 12000 - contextText.length;
              if (remaining > 50) {
                contextText += `\n${chunk.text.substring(0, remaining)}...`;
                sourcesUsed.push({ sourceId: srcId, title, type: srcType });
              }
              break;
            }
            contextText += `\n${chunk.text}`;
            sourcesUsed.push({ sourceId: srcId, title, type: srcType });
          }

          const uniqueSourceCount = new Set(sourcesUsed.map(s => s.sourceId)).size;
          const studioPrompt = buildStudioPrompt(type, contextText, { depth, uniqueSourceCount });

          let content;
          try {
            if (!this.chatProvider) {
              throw new Error('No primary chat provider configured');
            }

            const runGeneration = async () => {
              const result = await this.chatProvider.generateContent({
                contents: [{ role: 'user', parts: [{ text: studioPrompt }] }],
                generationConfig: {
                  temperature: 0.4,
                  maxOutputTokens: 3500,
                },
              });
              return result.response?.text() || '';
            };

            // Wrap LLM call in a 6-second timeout race
            content = await raceWithTimeout(
              runGeneration(),
              this.llmTimeout,
              'LLMTimeout'
            );

            if (!content || !content.trim()) {
              throw new Error('Empty response from provider');
            }

            // No warning banner — clean UX by design.

            const generatedQuestionCount = (content.match(/<InterviewQuestion/g) || []).length;
            const topicsMatch = content.match(/## Key Topics Covered\n([\s\S]*?)\n\n/);
            let validConceptCount = null;
            if (topicsMatch) {
              const topics = topicsMatch[1].split('\n').map(line => line.trim()).filter(line => line.startsWith('-'));
              validConceptCount = topics.length;
            }
            logger.info('[Studio Telemetry] Mock Q&A diagnostics (LLM)', {
              retrievedChunkCount: matchedChunks.length,
              validConceptCount,
              rejectedConceptCount: null,
              generatedQuestionCount
            });
          } catch (err) {
            logger.warn('[Studio] Mock Q&A LLM generation failed or timed out. Falling back to deterministic generator.', {
              error: err.message,
              workspaceId,
              outputId
            });
            content = this.generateFallbackMockQA(matchedChunks);
          }

          const finalOutput = await this.outputRepo.update(workspaceId, outputId, {
            content,
            sourcesUsed,
            status: 'ready',
            depth,
          });

          logger.info('Studio generation completed (Mock Q&A)', { workspaceId, outputId, type, depth });
          return finalOutput;
        };

        try {
          return await raceWithTimeout(
            generateQuestionsProcess(),
            this.overallTimeout,
            'overall_timeout'
          );
        } catch (overallErr) {
          logger.error('[Studio] Mock Q&A generation exceeded absolute limit or failed. Triggering immediate outer fallback.', {
            error: overallErr.message,
            workspaceId,
            outputId
          });
          const fallbackContent = this.generateFallbackMockQA(matchedChunks || []);
          return await this.outputRepo.update(workspaceId, outputId, {
            content: fallbackContent,
            sourcesUsed: (matchedChunks || []).slice(0, 5).map(c => ({
              sourceId: c.sourceId || c.id || 'unknown',
              title: c.sourceTitle || c.title || 'Source',
              type: c.sourceType || c.type || 'unknown'
            })),
            status: 'ready',
            depth,
          });
        }
      }

      if (type === 'flashcards') {
        const raceWithTimeout = (promise, ms, errMsg) => {
          let timeoutId;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(errMsg)), ms);
          });
          return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
          });
        };

        let deterministicCards = [];
        let flashcardChunks = [];
        let uniqueChunks = [];
        let retrievedChunksCount = 0;

        const generateFlashcardsProcess = async () => {
          const queries = [
            "main concepts",
            "technical definitions",
            "important facts",
            "key architecture",
            "implementation details",
            "important examples",
            "processes and workflows",
            "interview relevant concepts",
            "technical components",
            "core ideas"
          ];

          try {
            const searchPromises = queries.map(q =>
              this.vectorSearch.hybridSearch(workspaceId, q, { topK: 5 })
            );

            // Execute all queries in parallel, raced against 3-second budget
            const settledResults = await raceWithTimeout(
              Promise.allSettled(searchPromises),
              3000,
              'RetrievalTimeout'
            );

            // Merge and deduplicate by chunkId and Jaccard similarity
            const seen = new Set();
            for (const res of settledResults) {
              if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                retrievedChunksCount += res.value.length;
                for (const chunk of res.value) {
                  const key = chunk.id || 
                    ((chunk.sourceId && chunk.chunkIndex !== undefined && chunk.chunkIndex !== null) 
                      ? `${chunk.sourceId}:${chunk.chunkIndex}` 
                      : null) || 
                    chunk.text;
                  if (!seen.has(key)) {
                    let isDup = false;
                    for (const existing of uniqueChunks) {
                      if (this.isNearDuplicate(chunk.text, existing.text)) {
                        isDup = true;
                        break;
                      }
                    }
                    if (!isDup) {
                      seen.add(key);
                      uniqueChunks.push(chunk);
                    }
                  }
                }
              }
            }
          } catch (err) {
            logger.warn('[Studio] Flashcards parallel vector search failed or timed out. Falling back to source overview.', { error: err.message });
            uniqueChunks = [];
          }

          if (!uniqueChunks || uniqueChunks.length === 0) {
            logger.info('[Studio] No chunks retrieved, falling back to source overview.');
            uniqueChunks = this.extractChunksFromSources(sources || []);
            // For overview chunks, retrievedChunksCount is same as uniqueChunks count
            retrievedChunksCount = uniqueChunks.length;
          }

          // Deduplicate again to ensure absolute uniqueness (with Jaccard check too)
          const seen = new Set();
          const dedupedUniqueChunks = [];
          for (const chunk of uniqueChunks) {
             const key = chunk.id || 
               ((chunk.sourceId && chunk.chunkIndex !== undefined && chunk.chunkIndex !== null) 
                 ? `${chunk.sourceId}:${chunk.chunkIndex}` 
                 : null) || 
               chunk.text;
            if (!seen.has(key)) {
              let isDup = false;
              for (const existing of dedupedUniqueChunks) {
                if (this.isNearDuplicate(chunk.text, existing.text)) {
                  isDup = true;
                  break;
                }
              }
              if (!isDup) {
                seen.add(key);
                dedupedUniqueChunks.push(chunk);
              }
            }
          }
          uniqueChunks = dedupedUniqueChunks;

          // Sort by retrieval score descending
          uniqueChunks.sort((a, b) => (b.score || 0) - (a.score || 0));

          const retrievedChunkCount = uniqueChunks.length;
          const totalCharacters = uniqueChunks.reduce((sum, chunk) => sum + (chunk.text || '').length, 0);
          const validConcepts = this.getValidConceptsCount(uniqueChunks);

          // Calculate total indexed chunks in workspace
          let indexedChunks = 0;
          for (const src of (sources || [])) {
            if (src.transcript) {
              const paragraphs = src.transcript.split(/\n+/).map(p => p.trim()).filter(p => p.length > 50);
              indexedChunks += paragraphs.length;
            }
          }
          if (indexedChunks === 0) {
            indexedChunks = retrievedChunkCount;
          }

          // Group chunks by sourceId for diversity check
          const chunksByDoc = {};
          for (const chunk of uniqueChunks) {
            const docId = chunk.sourceId || 'unknown';
            if (!chunksByDoc[docId]) {
              chunksByDoc[docId] = [];
            }
            chunksByDoc[docId].push(chunk);
          }

          // Sort each group by score descending
          for (const docId in chunksByDoc) {
            chunksByDoc[docId].sort((a, b) => (b.score || 0) - (a.score || 0));
          }

          const guaranteedPool = [];
          const secondaryPool = [];

          for (const docId in chunksByDoc) {
            const group = chunksByDoc[docId];
            // Select up to 3 chunks for the guaranteed pool
            const guaranteed = group.slice(0, 3);
            guaranteedPool.push(...guaranteed);
            // Place remaining chunks in the secondary pool
            const remaining = group.slice(3);
            secondaryPool.push(...remaining);
          }

          // Sort secondary pool by score descending
          secondaryPool.sort((a, b) => (b.score || 0) - (a.score || 0));

          const finalPool = [];
          for (const chunk of guaranteedPool) {
            if (finalPool.length >= 30) break;
            finalPool.push(chunk);
          }
          for (const chunk of secondaryPool) {
            if (finalPool.length >= 30) break;
            finalPool.push(chunk);
          }

          // Final pool can be up to 30 chunks, sort by score descending
          flashcardChunks = finalPool.sort((a, b) => (b.score || 0) - (a.score || 0));

          // Insufficient Content Gate
          const gateTriggered = retrievedChunkCount < 3 && totalCharacters < 1500 && validConcepts < 5;

          const docsCount = new Set((sources || []).map(s => s.id)).size;
          const chunksPerDocMap = {};
          for (const docId in chunksByDoc) {
            chunksPerDocMap[docId] = chunksByDoc[docId].length;
          }
          const chunksPerDocStr = JSON.stringify(chunksPerDocMap);

          if (gateTriggered) {
            logger.info('[Flashcards Diagnostics]\n' +
              `Documents Found: ${docsCount}\n` +
              `Retrieved Chunks Raw: ${retrievedChunksCount}\n` +
              `Retrieved Chunks Unique: ${retrievedChunkCount}\n` +
              `Chunks Per Document: ${chunksPerDocStr}\n` +
              `Concepts Extracted: ${validConcepts}\n` +
              `Cards Generated: 0`
            );

            const payload = {
              status: 'insufficient_content',
              message: 'Insufficient Learning Material',
              debug: {
                documentsFound: docsCount,
                chunksRetrieved: retrievedChunkCount,
                cardsGenerated: 0
              }
            };

            return await this.outputRepo.update(workspaceId, outputId, {
              content: JSON.stringify(payload),
              sourcesUsed: [],
              status: 'ready',
              depth,
            });
          }

          deterministicCards = this.generateDeterministicFlashcards(flashcardChunks);

          // Source Coverage Diagnostics Log:
          logger.info('[Flashcards Diagnostics]\n' +
            `Documents Found: ${docsCount}\n` +
            `Retrieved Chunks Raw: ${retrievedChunksCount}\n` +
            `Retrieved Chunks Unique: ${retrievedChunkCount}\n` +
            `Chunks Per Document: ${chunksPerDocStr}\n` +
            `Concepts Extracted: ${validConcepts}\n` +
            `Cards Generated: ${deterministicCards.length}`
          );

          if (deterministicCards.length > 0) {
            const successPayload = {
              status: 'success',
              cards: deterministicCards
            };
            return await this.outputRepo.update(workspaceId, outputId, {
              content: JSON.stringify(successPayload),
              sourcesUsed: this.getSourcesUsedFromCards(deterministicCards, flashcardChunks),
              status: 'ready',
              depth,
            });
          } else {
            const payload = {
              status: 'insufficient_content',
              message: 'Insufficient Learning Material',
              debug: {
                documentsFound: docsCount,
                chunksRetrieved: retrievedChunkCount,
                cardsGenerated: 0
              }
            };
            return await this.outputRepo.update(workspaceId, outputId, {
              content: JSON.stringify(payload),
              sourcesUsed: [],
              status: 'ready',
              depth,
            });
          }
        };

        try {
          return await raceWithTimeout(generateFlashcardsProcess(), 8000, 'OverallTimeout');
        } catch (overallErr) {
          logger.error('[Studio] Flashcards generation exceeded absolute SLA limit or failed.', { error: overallErr.message });
          const fallbackDeck = deterministicCards || [];
          if (fallbackDeck.length > 0) {
            const successPayload = {
              status: 'success',
              cards: fallbackDeck
            };
            return await this.outputRepo.update(workspaceId, outputId, {
              content: JSON.stringify(successPayload),
              sourcesUsed: this.getSourcesUsedFromCards(fallbackDeck, uniqueChunks),
              status: 'ready',
              depth,
            });
          } else {
            const failPayload = {
              status: 'generation_failed',
              message: 'Flashcards generation timed out or failed to meet quality SLA.'
            };
            return await this.outputRepo.update(workspaceId, outputId, {
              content: JSON.stringify(failPayload),
              sourcesUsed: [],
              status: 'ready',
              depth,
            });
          }
        }
      }

      if (matchedChunks.length < 3 && type !== 'interview_questions' && type !== 'flashcards') {
        const insufficientContent = `<SummaryBanner>Insufficient grounded evidence found. Only ${matchedChunks.length} source chunk${matchedChunks.length === 1 ? '' : 's'} could be retrieved from your uploaded documents. Please upload more sources or add additional content to your workspace before generating this asset.</SummaryBanner>`;
        return await this.outputRepo.update(workspaceId, outputId, {
          content: insufficientContent,
          sourcesUsed: matchedChunks.map(c => ({
            sourceId: c.sourceId || c.id || 'unknown',
            title: c.sourceTitle || c.title || 'Source',
            type: c.sourceType || c.type || 'unknown'
          })),
          status: 'ready',
        });
      }

      // Restrict context assembly to top 8 chunks maximum for study_guide
      if (type === 'study_guide') {
        matchedChunks = matchedChunks
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 8);
      }

      const uniqueSourceCount = new Set(matchedChunks.map(c => c.sourceId)).size;
      const tokenBudget = this.computeTokenBudget(depth, uniqueSourceCount, matchedChunks.length);
      const contextMaxTokens = Math.floor(tokenBudget * 0.6);

      const { contextText, sourcesUsed } = await this.contextManager.assembleContext(
        matchedChunks,
        broadSearchQuery,
        { maxTokens: contextMaxTokens, diversityWeight: 0.6 }
      );

      const studioPrompt = buildStudioPrompt(type, contextText, { depth, uniqueSourceCount });
      const generationMaxTokens = Math.floor(tokenBudget * 0.9);

      let content;
      try {
        content = await this.tryProviderChain(studioPrompt, {
          temperature: type === 'flashcards' ? 0.2 : 0.3,
          maxOutputTokens: generationMaxTokens,
        });
      } catch (providerErr) {
        logger.error('[Studio] All providers failed — saving retryable state', {
          error: providerErr.message,
          workspaceId,
          outputId,
        });
        const retryMessage = `<SummaryBanner>We're preparing your ${label}. Generation is taking a little longer than usual — this can happen during peak usage. Your sources are loaded and ready. Click Retry below to resume generation.</SummaryBanner>`;
        return await this.outputRepo.update(workspaceId, outputId, {
          content: retryMessage,
          sourcesUsed,
          status: 'retryable',
          depth,
        });
      }

      if (type === 'flashcards') {
        const jsonMatch = content.trim().match(/\[[\s\S]*\]/);
        if (jsonMatch) content = jsonMatch[0];
      }

      // No warning banner prepended for interview_questions — clean UX by design.

      const finalOutput = await this.outputRepo.update(workspaceId, outputId, {
        content,
        sourcesUsed,
        status: 'ready',
        depth,
      });

      logger.info('Studio generation completed', { workspaceId, outputId, type, depth });
      return finalOutput;

    } catch (error) {
      logger.error('Studio generation failed', { error: error.message, workspaceId, outputId });

      if (type === 'interview_questions') {
        try {
          const fallbackContent = this.generateFallbackMockQA(matchedChunks || []);
          const finalOutput = await this.outputRepo.update(workspaceId, outputId, {
            content: fallbackContent,
            sourcesUsed: (matchedChunks || []).slice(0, 5).map(c => ({
              sourceId: c.sourceId || c.id || 'unknown',
              title: c.sourceTitle || c.title || 'Source',
              type: c.sourceType || c.type || 'unknown'
            })),
            status: 'ready',
            depth,
          });
          return finalOutput;
        } catch (innerErr) {
          logger.error('Double failure in Mock Q&A outer catch block', { error: innerErr.message });
        }
      }

      await this.outputRepo.update(workspaceId, outputId, {
        content: `<SummaryBanner>An unexpected error occurred while generating your ${label}. Please try again — your sources are still available.</SummaryBanner>`,
        status: 'retryable',
      });

      throw error;
    }
  }

  generateFallbackMockQA(chunks) {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'to', 'of', 'for', 'in', 'that', 'it', 'with', 'as', 'was', 'are', 'be', 'this', 'you', 'i', 'he', 'she', 'they', 'we', 'or', 'but', 'not', 'your', 'my', 'our', 'their', 'his', 'her', 'its', 'from', 'by', 'about', 'more', 'some', 'has', 'have', 'had', 'been', 'were', 'does', 'do', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'into', 'than', 'then', 'only', 'so', 'up', 'down', 'out', 'over', 'under', 'again', 'further', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'other', 'such', 'no', 'nor', 'too', 'very', 'just', 'now', 'using', 'used', 'use', 'how', 'what', 'where', 'when', 'why', 'who', 'whom', 'whose'
    ]);
    const rejectedWords = new Set([
      'build', 'perform', 'prepare', 'time', 'trust', 'research', 'develop', 'create', 'connect', 'understand',
      'plan', 'workflow', 'real', 'bug', 'feasibility', 'integration', 'implement', 'configure', 'setup',
      'deploy', 'monitor', 'test', 'debug', 'optimize', 'improve', 'enhance', 'evaluate', 'assess', 'review',
      'check', 'verify', 'validate', 'assert', 'compile', 'design', 'define', 'study', 'explain', 'learn', 'teach',
      'active', 'workspace', 'session', 'system', 'architecture', 'client', 'server', 'microservice', 'database',
      'layer', 'infrastructure', 'process', 'approach', 'solution', 'concept', 'example', 'sample', 'details',
      'information', 'content', 'overview', 'summary', 'revision', 'checklist', 'topic', 'focus', 'guide',
      'interactive', 'map', 'simulation', 'simulator', 'preparation', 'tier', 'readiness', 'score', 'gold',
      'standard', 'expert', 'deep', 'quick', 'integrate', 'prototype'
    ]);

    const techKeywords = [
      'store', 'retriever', 'database', 'model', 'chain', 'framework', 'agent', 'tool', 'embedding', 'vector',
      'prompt', 'token', 'memory', 'system', 'blockchain', 'contract', 'client', 'server', 'api', 'query',
      'index', 'repository', 'service', 'library', 'algorithm', 'protocol', 'network', 'node', 'cluster',
      'cache', 'queue', 'broker', 'auth', 'user', 'session', 'context', 'provider', 'driver', 'engine',
      'pipeline', 'handler', 'route', 'controller', 'middleware', 'schema', 'table', 'view', 'function',
      'procedure', 'class', 'struct', 'interface', 'object', 'module', 'package', 'dependency', 'utility',
      'helper', 'manager', 'factory', 'registry', 'config', 'options', 'settings', 'env', 'process',
      'thread', 'task', 'job', 'worker', 'event', 'listener', 'observer', 'subject', 'state', 'reducer',
      'action', 'dispatch', 'effect', 'hook', 'component', 'prop', 'view', 'page', 'layout', 'router',
      'link', 'nav', 'form', 'input', 'button', 'card', 'modal', 'dialog', 'tooltip', 'toast', 'alert',
      'banner', 'badge', 'avatar', 'icon', 'image', 'video', 'audio', 'file', 'folder', 'directory',
      'path', 'url', 'uri', 'ip', 'port', 'host', 'domain', 'dns', 'ssl', 'tls', 'ssh', 'ftp', 'http',
      'https', 'ws', 'wss', 'tcp', 'udp', 'cidr', 'vpc', 'subnet', 'sg', 'iam', 'role', 'policy',
      'arn', 'bucket', 'blob', 'lambda', 'container', 'pod', 'deployment', 'replicaset', 'statefulset',
      'daemonset', 'ingress', 'egress', 'pv', 'pvc', 'sc', 'configmap', 'secret', 'sa', 'cr', 'crd',
      'operator', 'helm', 'chart', 'release', 'values', 'repo', 'git', 'commit', 'branch', 'tag',
      'pr', 'mr', 'issue', 'milestone', 'project', 'wiki', 'pages', 'actions', 'workflows', 'runners',
      'packages', 'secrets', 'variables', 'environments', 'deployments', 'integrations', 'webhooks',
      'collaborators', 'teams', 'organizations', 'billing', 'profile', 'notifications', 'security',
      'keys', 'tokens', 'gpg', 'ai', 'chatbot', 'llm'
    ];

    const allSentences = [];
    const sentenceToChunk = new Map();

    for (const chunk of chunks) {
      const text = chunk.text || '';
      const chunkSentences = text.split(/(?<=[.!?])\s+/);
      for (const s of chunkSentences) {
        const trimmed = s.trim();
        if (trimmed.length >= 10) {
          allSentences.push(trimmed);
          sentenceToChunk.set(trimmed, chunk);
        }
      }
    }

    if (allSentences.length === 0) {
      logger.info('[Studio Telemetry] Mock Q&A diagnostics (Failed: Empty Sentences)', {
        retrievedChunkCount: chunks.length,
        validConceptCount: 0,
        rejectedConceptCount: 0,
        generatedQuestionCount: 0
      });
      return "Insufficient interview-quality material";
    }

    // Concept Validation check
    const isTechConcept = (concept) => {
      const lower = concept.toLowerCase();
      const rejectList = ['integrate', 'build', 'prototype', 'prepare', 'perform', 'workflow', 'time', 'real', 'technical component', 'component', 'module', 'generic concept'];
      if (rejectList.some(r => lower === r || lower.includes(r))) return false;

      // 1. Acronym check (e.g. RAG, LLM, DB)
      if (/^[A-Z]{2,}$/.test(concept)) return true;

      // 2. camelCase/PascalCase check (e.g. LangChain, VectorStore)
      if (/[a-z][A-Z]/.test(concept)) return true;

      // 3. Technical keyword check
      const words = lower.split(/\s+/);
      for (const w of words) {
        const clean = w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
        if (techKeywords.includes(clean)) return true;
        if (clean.endsWith('s') && techKeywords.includes(clean.slice(0, -1))) return true;
      }

      return false;
    };

    // First, collect all raw concept tokens (capitalized words/phrases) and count frequencies
    const rawConceptCounts = new Map();
    for (const original of allSentences) {
      const matches = original.match(/\b[A-Z][a-zA-Z0-9-']+(?:\s+[A-Z][a-zA-Z0-9-']+){0,2}\b/g) || [];
      for (const match of matches) {
        const clean = match.trim().replace(/[*_`"']/g, '').replace(/[.,:;!?()]/g, '');
        if (clean.length > 0) {
          rawConceptCounts.set(clean, (rawConceptCounts.get(clean) || 0) + 1);
        }
      }
    }

    const projects = ['zeropay', 'buildverse', 'chatgpt clone'];
    const isProjectName = (concept) => projects.includes(concept.toLowerCase());

    const whitelist = new Set([
      'ai', 'api', 'apis', 'blockchain', 'cloud', 'authentication', 'wallet', 'database',
      'backend', 'frontend', 'smart contract', 'vector store', 'embedding', 'retriever',
      'langchain', 'agent', 'memory'
    ]);

    const allowedShortAcronyms = new Set([
      'ai', 'api', 'apis', 'llm', 'rag', 'nlp', 'sql', 'aws', 'gcp'
    ]);

    const isWhitelisted = (concept) => {
      return whitelist.has(concept.toLowerCase()) || isProjectName(concept);
    };

    const acceptedCandidates = [];
    const rejectedTracked = [];

    for (const [concept, freq] of rawConceptCounts.entries()) {
      const lower = concept.toLowerCase();

      // 4. Whitelist check first
      if (isWhitelisted(concept)) {
        acceptedCandidates.push({ concept, freq });
        continue;
      }

      // Stopwords check
      if (stopWords.has(lower)) {
        rejectedTracked.push({ concept, reason: 'stopword' });
        continue;
      }

      // Blacklist / Stopwords subwords check
      if (rejectedWords.has(lower)) {
        rejectedTracked.push({ concept, reason: 'blacklist' });
        continue;
      }

      const subWords = lower.split(/\s+/);
      if (subWords.some(w => stopWords.has(w))) {
        rejectedTracked.push({ concept, reason: 'stopword' });
        continue;
      }
      if (subWords.some(w => rejectedWords.has(w))) {
        rejectedTracked.push({ concept, reason: 'blacklist' });
        continue;
      }

      // 3. Length check
      if (concept.length < 4 && !allowedShortAcronyms.has(lower)) {
        rejectedTracked.push({ concept, reason: 'length' });
        continue;
      }

      // 4. Generic noun check (isTechConcept check)
      if (!isTechConcept(concept)) {
        rejectedTracked.push({ concept, reason: 'generic noun' });
        continue;
      }

      // 2. Relaxed frequency check: frequency >= 1 for interview questions fallback
      if (freq < 1) {
        rejectedTracked.push({ concept, reason: 'frequency' });
        continue;
      }

      acceptedCandidates.push({ concept, freq });
    }

    // 5. Concept selection strategy
    const getCitationCount = (concept) => {
      let count = 0;
      const lower = concept.toLowerCase();
      for (const chunk of chunks) {
        if ((chunk.text || '').toLowerCase().includes(lower)) {
          count++;
        }
      }
      return count;
    };

    const getConceptScore = (concept, freq, reason) => {
      const lower = concept.toLowerCase();
      const citationCount = getCitationCount(concept);
      
      let semanticImportance = 0;
      if (isWhitelisted(concept)) semanticImportance += 10;
      if (/^[A-Z]{2,}$/.test(concept)) semanticImportance += 5;
      if (/[a-z][A-Z]/.test(concept)) semanticImportance += 5;
      
      const words = lower.split(/\s+/);
      for (const w of words) {
        const cleanWord = w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
        if (techKeywords.includes(cleanWord)) {
          semanticImportance += 3;
          break;
        }
      }

      let penalty = 0;
      if (reason === 'blacklist') penalty += 10;
      if (reason === 'generic noun') penalty += 5;
      if (reason === 'length') penalty += 8;

      return freq * 2 + citationCount * 3 + semanticImportance - penalty;
    };

    let finalSelectionList = [];
    if (acceptedCandidates.length >= 5) {
      acceptedCandidates.sort((a, b) => b.freq - a.freq);
      finalSelectionList = acceptedCandidates.map(c => c.concept);
    } else {
      const fallbackPool = rejectedTracked.filter(c => c.reason !== 'stopword');
      const pool = [
        ...acceptedCandidates.map(c => ({ concept: c.concept, freq: c.freq, reason: null })),
        ...fallbackPool.map(c => ({ concept: c.concept, freq: rawConceptCounts.get(c.concept), reason: c.reason }))
      ];

      pool.forEach(item => {
        item.score = getConceptScore(item.concept, item.freq, item.reason);
      });
      pool.sort((a, b) => b.score - a.score);

      finalSelectionList = pool.slice(0, Math.max(5, acceptedCandidates.length)).map(item => item.concept);
    }

    const finalSortedConcepts = finalSelectionList;

    // Diagnostics output arrays
    const acceptedConcepts = finalSortedConcepts;
    const sortedRejected = rejectedTracked
      .map(item => ({ concept: item.concept, reason: item.reason, freq: rawConceptCounts.get(item.concept) }))
      .sort((a, b) => b.freq - a.freq);

    const topRejectedToLog = sortedRejected.slice(0, 50);
    logger.info('[Studio Concept Filter Diagnostics] Top 50 Rejected Concepts:', topRejectedToLog);

    const rejectedConcepts = sortedRejected.map(item => item.concept);
    const rejectionReason = sortedRejected.map(item => item.reason);

    const telemetryDiagnostics = {
      retrievedChunkCount: chunks.length,
      validConceptCount: acceptedCandidates.length,
      rejectedConceptCount: rejectedTracked.length,
      acceptedConcepts,
      rejectedConcepts,
      rejectionReason
    };

    // Step 2: Build rejectedConceptsSet set
    const rejectedConceptsSet = new Set();
    for (const [concept, freq] of rawConceptCounts.entries()) {
      if (!finalSortedConcepts.includes(concept)) {
        rejectedConceptsSet.add(concept.toLowerCase());
      }
    }

    // Step 3: Define safety checking for sentences/words
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isSentenceSafe = (s) => {
      const lower = s.toLowerCase();
      const hasBannedPhrase = ['integrate & connect', 'cloud infrastructure', 'prototype & deploy'].some(b => lower.includes(b));
      if (hasBannedPhrase) return false;

      // Check rejectedWords
      for (const rw of rejectedWords) {
        if (new RegExp('\\b' + escapeRegExp(rw) + '\\b', 'i').test(lower)) return false;
      }

      // Check rejectedConceptsSet
      for (const rc of rejectedConceptsSet) {
        if (lower.includes(rc)) return false;
      }

      return true;
    };

    // Step 4: Map each concept to a safe, expanded a    // Telemetry tracking arrays and counts
    const acceptedConceptCount = acceptedCandidates.length;
    const skippedConceptsDetailed = [];
    const skippedConcepts = [];
    const questionEligibleConcepts = [];
    const seenConcepts = new Set();

    const expandSentenceSafely = (selectedSentence) => {
      const chunk = sentenceToChunk.get(selectedSentence);
      const chunkText = chunk ? (chunk.text || '') : '';
      const sentencesInChunk = chunkText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 5);
      const idx = sentencesInChunk.indexOf(selectedSentence);

      let fullAnswer = selectedSentence;
      if (idx !== -1) {
        let wordCount = fullAnswer.split(/\s+/).length;
        let forwardIdx = idx + 1;
        while (wordCount < 20 && forwardIdx < sentencesInChunk.length) {
          const next = sentencesInChunk[forwardIdx];
          if (isSentenceSafe(next)) {
            fullAnswer += ' ' + next;
            wordCount = fullAnswer.split(/\s+/).length;
          } else {
            break; // Stop expanding if we encounter an unsafe sentence
          }
          forwardIdx++;
        }
        let backwardIdx = idx - 1;
        while (wordCount < 20 && backwardIdx >= 0) {
          const prev = sentencesInChunk[backwardIdx];
          if (isSentenceSafe(prev)) {
            fullAnswer = prev + ' ' + fullAnswer;
            wordCount = fullAnswer.split(/\s+/).length;
          } else {
            break;
          }
          backwardIdx--;
        }
      }
      return fullAnswer;
    };

    // Step 4: Map each concept to a safe, expanded answer
    const conceptSentencePairs = [];
    const usedSentences = new Set();

    for (const concept of finalSortedConcepts) {
      if (seenConcepts.has(concept)) {
        skippedConceptsDetailed.push({ concept, skipReason: 'duplicate' });
        skippedConcepts.push(concept);
        continue;
      }
      seenConcepts.add(concept);

      // Find a sentence containing the concept that is safe
      let matchingSentences = allSentences.filter(s => s.toLowerCase().includes(concept.toLowerCase()));
      
      // Project name heuristic
      if (isProjectName(concept)) {
        const firstMention = matchingSentences[0];
        const chunk = sentenceToChunk.get(firstMention);
        if (chunk) {
          const chunkText = chunk.text || '';
          const chunkSentences = chunkText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 5);
          const projectRelated = chunkSentences.filter(s => 
            s.toLowerCase().includes(concept.toLowerCase()) || 
            /\b(purpose|features|architecture|goals|designed to|aims to|objective|stack|built)\b/i.test(s)
          );
          if (projectRelated.length > 0) {
            matchingSentences = projectRelated;
          }
        }
      }

      let selectedSentence = null;
      let isIdeal = false;
      let fullAnswer = '';

      // Try finding an ideal safe sentence
      const safeMatching = matchingSentences.filter(s => isSentenceSafe(s));
      selectedSentence = safeMatching.find(s => !usedSentences.has(s)) || safeMatching[0];

      if (selectedSentence) {
        fullAnswer = expandSentenceSafely(selectedSentence);
        if (fullAnswer.split(/\s+/).length >= 20) {
          isIdeal = true;
          usedSentences.add(selectedSentence);
        }
      }

      // If no ideal (definition/mechanism-style safe long sentence) exists, generate concept-level questions directly
      if (!isIdeal) {
        // Find nearest retrieved sentence mentioning the concept
        const nearestSentence = matchingSentences[0];
        if (nearestSentence) {
          fullAnswer = expandSentenceSafely(nearestSentence);
          selectedSentence = nearestSentence;
          usedSentences.add(nearestSentence);
          isIdeal = true; // successfully mapped
        } else {
          // Fall back to any safe sentence in the document as answer context
          const fallbackSentence = allSentences.find(s => isSentenceSafe(s) && !usedSentences.has(s)) || allSentences.find(s => isSentenceSafe(s));
          if (fallbackSentence) {
            fullAnswer = expandSentenceSafely(fallbackSentence);
            selectedSentence = fallbackSentence;
            usedSentences.add(fallbackSentence);
            skippedConceptsDetailed.push({ concept, skipReason: 'missing_definition' });
            // Under V7 rules, this is still eligible
            isIdeal = true;
          } else {
            skippedConceptsDetailed.push({ concept, skipReason: 'missing_sentence' });
            skippedConcepts.push(concept);
            continue;
          }
        }
      }

      // Project Name check: Do not use Project Name - X as an answer
      if (isProjectName(concept) && fullAnswer.includes(' - ')) {
        const parts = fullAnswer.split(' - ');
        if (parts[0].trim().toLowerCase() === concept.toLowerCase()) {
          const descriptive = matchingSentences.find(s => s.toLowerCase().includes(concept.toLowerCase()) && !s.includes(' - '));
          if (descriptive) {
            fullAnswer = expandSentenceSafely(descriptive);
            selectedSentence = descriptive;
          }
        }
      }

      conceptSentencePairs.push({
        concept,
        sentence: fullAnswer,
        original: selectedSentence
      });
      questionEligibleConcepts.push(concept);
    }

    const getSentenceEvidenceTypes = (sentence) => {
      const lower = sentence.toLowerCase();
      const types = [];

      // Definition
      const defRegex = /\b(is a|serves as|acts as|represents|refers to|defined as|consists of)\b/i;
      if (defRegex.test(lower)) {
        types.push('definition');
      }

      // Mechanism / Process
      const mechRegex = /\b(how|work|execute|manage|handle|process|interact|connect|link|perform|run|coordinate|implement|automate|query|index|store|retrieve)\b/i;
      if (mechRegex.test(lower)) {
        types.push('mechanism');
      }

      // Importance / Benefit
      const benefitRegex = /\b(important|benefit|advantage|allow|help|enable|efficient|secure|optimize|improve|reliable|reliably|securely|successfully)\b/i;
      if (benefitRegex.test(lower)) {
        types.push('benefit');
      }

      // Tradeoff / Limitation / Scaling
      const tradeoffRegex = /\b(tradeoff|limitation|drawback|challenge|scaling|scale|complexity|cost|comparison|bottleneck|latency|throughput|conflict|misconception|trap)\b/i;
      if (tradeoffRegex.test(lower)) {
        types.push('tradeoff');
      }

      return types;
    };

    const calculateQualityScore = (concept, sentence, question, difficulty, evidenceTypes) => {
      const isGeneric = [
        `What is ${concept}?`,
        `What role does ${concept} play in this architecture?`,
        `How does ${concept} work to coordinate processes?`,
        `Why is ${concept} important for the workflow?`,
        `What tradeoffs exist when implementing ${concept}?`,
        `What limitations or challenges are associated with ${concept}?`
      ].includes(question);
      const specificity = isGeneric ? 0.8 : 1.0;

      const containsConcept = sentence.toLowerCase().includes(concept.toLowerCase());
      const grounding = containsConcept ? 1.0 : 0.8;

      let importance = 0.8;
      if (isWhitelisted(concept)) {
        importance = 1.0;
      } else if (/[a-z][A-Z]/.test(concept)) {
        importance = 0.9;
      }

      let alignment = 0.7;
      if (difficulty === 'Beginner' && evidenceTypes.includes('definition')) {
        alignment = 1.0;
      } else if (difficulty === 'Intermediate' && (evidenceTypes.includes('mechanism') || evidenceTypes.includes('benefit'))) {
        alignment = 1.0;
      } else if (difficulty === 'Advanced' && evidenceTypes.includes('tradeoff')) {
        alignment = 1.0;
      }

      // Never pair tradeoff question with a definition answer
      if (difficulty === 'Advanced' && evidenceTypes.length === 1 && evidenceTypes[0] === 'definition') {
        return 0; // Disqualify
      }

      return (specificity + grounding + importance + alignment) / 4;
    };

    const hashString = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    };

    const getWhyInterviewersAskThis = (concept, difficulty) => {
      if (difficulty === 'Beginner') {
        return `Interviewers use this to filter candidates who only know the name from those who understand the actual purpose, problem it solves, and where it fits in the broader system. A strong answer includes a definition, the core use case, and a concrete example.`;
      } else if (difficulty === 'Intermediate') {
        return `This tests whether the candidate has actually worked with ${concept} or just read about it. Strong answers describe specific implementation steps, how ${concept} integrates with adjacent systems, and why particular design choices were made.`;
      } else {
        return `Senior engineers are expected to understand where ${concept} breaks down, what alternatives exist, and how to make informed trade-off decisions. A weak answer describes what ${concept} does; a strong answer describes when NOT to use it and how to handle its failure modes.`;
      }
    };

    const customizeQuestion = (concept, sentence, difficulty) => {
      const cleanConcept = concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      const allowMatch = new RegExp(cleanConcept + '\\s+(allows|helps|enables)\\s+([^.!?]+)', 'i').exec(sentence);
      if (allowMatch) {
        return `How does ${concept} ${allowMatch[1].toLowerCase()} ${allowMatch[2].trim()}?`;
      }

      const connectMatch = new RegExp(cleanConcept + '\\s+(connects|links|coordinates)\\s+([^.!?]+)', 'i').exec(sentence);
      if (connectMatch) {
        return `How does ${concept} ${connectMatch[1].toLowerCase()} ${connectMatch[2].trim()}?`;
      }

      const functionMatch = new RegExp(cleanConcept + '\\s+(functions as|serves as|acts as)\\s+([^.!?]+)', 'i').exec(sentence);
      if (functionMatch) {
        return `What role does ${concept} play as ${functionMatch[2].trim()}?`;
      }

      const storeMatch = new RegExp(cleanConcept + '\\s+(stores|indexes|contains|manages)\\s+([^.!?]+)', 'i').exec(sentence);
      if (storeMatch) {
        return `How does ${concept} ${storeMatch[1].toLowerCase()} ${storeMatch[2].trim()}?`;
      }

      const isMatch = new RegExp(cleanConcept + '\\s+(is|specifically is|refers to)\\s+([^.!?]+)', 'i').exec(sentence);
      if (isMatch) {
        const shortRest = isMatch[2].trim().split(/\s+/).slice(0, 4).join(' ');
        return `What is ${concept} and how does it relate to ${shortRest}?`;
      }

      if (difficulty === 'Beginner') {
        const beginnerTemplates = [
          `What is ${concept}?`,
          `What role does ${concept} play in this architecture?`
        ];
        return beginnerTemplates[Math.abs(hashString(sentence)) % beginnerTemplates.length];
      } else if (difficulty === 'Intermediate') {
        const intermediateTemplates = [
          `How does ${concept} work to coordinate processes?`,
          `Why is ${concept} important for the workflow?`
        ];
        return intermediateTemplates[Math.abs(hashString(sentence)) % intermediateTemplates.length];
      } else {
        const advancedTemplates = [
          `What tradeoffs exist when implementing ${concept}?`,
          `What limitations or challenges are associated with ${concept}?`
        ];
        return advancedTemplates[Math.abs(hashString(sentence)) % advancedTemplates.length];
      }
    };

    // Synthesize into a coherent answer paragraph
    const buildAnswer = (concept, coreSentences, difficulty, citation) => {
      const unique = [...new Set(coreSentences.map(s => s.trim()))].filter(s => s.length > 30);
      
      if (unique.length === 0) {
        return `${concept} is a key component in this system. ${citation}`;
      }
      
      if (difficulty === 'Beginner') {
        // What it is + what it does
        const joined = unique.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
        return `${joined} In the context of this system, understanding ${concept} is foundational because it defines how the broader architecture is structured and what capabilities it enables. ${citation}`;
      } else if (difficulty === 'Intermediate') {
        // How it works + integration
        const joined = unique.slice(0, 4).join(' ').replace(/\s+/g, ' ').trim();
        return `${joined} At an implementation level, ${concept} plays a central coordination role by connecting the relevant system components and enabling the described workflows. Engineers working with this stack need to understand how ${concept} interacts with adjacent services and what configuration is required to make it function reliably. ${citation}`;
      } else {
        // Trade-offs + scaling + alternatives
        const joined = unique.slice(0, 4).join(' ').replace(/\s+/g, ' ').trim();
        return `${joined} From an architectural standpoint, the key trade-offs when using ${concept} include increased system complexity, potential latency overhead, and vendor or framework lock-in depending on how tightly it is integrated. At scale, teams must consider how to monitor, version, and gracefully degrade ${concept} under load, and should evaluate whether a simpler alternative might achieve the same outcome with fewer dependencies. ${citation}`;
      }
    };

    const allCandidates = [];

    conceptSentencePairs.forEach((pair) => {
      const { concept, sentence, original } = pair;
      const evidenceTypes = getSentenceEvidenceTypes(sentence);
      
      const chunk = sentenceToChunk.get(original) || chunks[0] || {};
      const citation = chunk.sourceTitle ? `[${chunk.sourceTitle}${chunk.pageNumber ? ' — p.' + chunk.pageNumber : ''}]` : '[Source]';
      
      // Build a rich multi-sentence answer by collecting ALL sentences about this concept
      const relatedSentences = allSentences
        .filter(s => s.toLowerCase().includes(concept.toLowerCase()) && s !== sentence && s.length > 40)
        .slice(0, 3);
      
      const coreSentences = [sentence, ...relatedSentences].filter(Boolean);
      
      const answer = buildAnswer(concept, coreSentences, 'Base', citation);

      ['Beginner', 'Intermediate', 'Advanced'].forEach((difficulty) => {
        let qText = '';
        if (difficulty === 'Advanced' && !evidenceTypes.includes('tradeoff')) {
          // Emergency Fallback if advanced evidence is missing
          const fallbackTemplates = [
            `How would you scale ${concept} in production?`,
            `How would you improve ${concept} for better throughput?`,
            `How would you extend ${concept} to support additional features?`
          ];
          qText = fallbackTemplates[Math.abs(hashString(sentence)) % fallbackTemplates.length];
        } else {
          qText = customizeQuestion(concept, sentence, difficulty);
        }

        const score = calculateQualityScore(concept, sentence, qText, difficulty, evidenceTypes);
        // Build difficulty-appropriate answer
        const diffAnswer = buildAnswer(concept, coreSentences, difficulty, citation);

        allCandidates.push({
          concept,
          question: qText,
          answer: diffAnswer,
          why: getWhyInterviewersAskThis(concept, difficulty),
          citation,
          difficulty,
          score
        });
      });
    });

    const highQualityCandidates = allCandidates.filter(c => c.score >= 0.75);

    const beginnerPool = highQualityCandidates.filter(c => c.difficulty === 'Beginner');
    const intermediatePool = highQualityCandidates.filter(c => c.difficulty === 'Intermediate');
    const advancedPool = highQualityCandidates.filter(c => c.difficulty === 'Advanced');

    const selectN = (pool, fallbackPool, difficulty, count) => {
      pool.sort((a, b) => b.score - a.score);
      const selected = [];
      const seenQuestions = new Set();

      for (const item of pool) {
        if (!seenQuestions.has(item.question)) {
          selected.push(item);
          seenQuestions.add(item.question);
          if (selected.length === count) break;
        }
      }

      if (selected.length < count) {
        fallbackPool.sort((a, b) => b.score - a.score);
        for (const item of fallbackPool) {
          if (item.difficulty === difficulty && !seenQuestions.has(item.question)) {
            selected.push(item);
            seenQuestions.add(item.question);
            if (selected.length === count) break;
          }
        }
      }

      if (selected.length < count) {
        const emergencyConcepts = finalSortedConcepts.slice(0, 5);
        if (emergencyConcepts.length === 0) {
          emergencyConcepts.push('System', 'Workflow', 'Process');
        }

        let templateIndex = selected.length;
        let attempts = 0;
        while (selected.length < count && attempts < 200) {
          attempts++;
          const concept = emergencyConcepts[templateIndex % emergencyConcepts.length];
          const templateRound = Math.floor(templateIndex / emergencyConcepts.length);

          const sentence = allSentences.find(s => s.toLowerCase().includes(concept.toLowerCase())) || allSentences[0] || 'This system describes workflow automation processes and technical implementations.';
          const chunk = sentenceToChunk.get(sentence) || chunks[0] || {};
          const citation = chunk.sourceTitle ? `[${chunk.sourceTitle}${chunk.pageNumber ? ' — p.' + chunk.pageNumber : ''}]` : '[Source]';
          const answer = `${sentence} ${citation}`;

          let qText = '';
          if (difficulty === 'Beginner') {
            const beginnerTemplates = [
              `What is ${concept} and what problem does it solve in this system?`,
              `What role does ${concept} play in the overall architecture?`,
              `Can you explain the core function of ${concept}?`,
              `Why is ${concept} considered a key component in this project?`,
              `What are the basic features and purpose of ${concept}?`
            ];
            qText = beginnerTemplates[templateRound % beginnerTemplates.length];
          } else if (difficulty === 'Intermediate') {
            const intermediateTemplates = [
              `How does ${concept} integrate with the other components in this architecture?`,
              `What are the key implementation details for setting up ${concept}?`,
              `How does data flow through ${concept} during standard operations?`,
              `What configuration options are critical for ${concept}?`,
              `How do you verify the correct integration and function of ${concept}?`
            ];
            qText = intermediateTemplates[templateRound % intermediateTemplates.length];
          } else {
            const advancedTemplates = [
              `What are the main production challenges and trade-offs when deploying ${concept} at scale?`,
              `How would you scale ${concept} to handle high throughput or low latency?`,
              `What failure modes should be expected with ${concept} and how do you handle them?`,
              `How does ${concept} affect the security profile of the overall system?`,
              `What are the tradeoffs of using ${concept} versus a custom implementation?`
            ];
            qText = advancedTemplates[templateRound % advancedTemplates.length];
          }

          const diffAnswer = buildAnswer(concept, [sentence], difficulty, citation);

          if (!seenQuestions.has(qText)) {
            selected.push({
              concept,
              question: qText,
              answer: diffAnswer,
              why: getWhyInterviewersAskThis(concept, difficulty),
              citation,
              difficulty,
              score: 0.7
            });
            seenQuestions.add(qText);
          }
          templateIndex++;
        }
      }

      return selected;
    };

    const finalBeginner = selectN(beginnerPool, allCandidates, 'Beginner', 5);
    const finalIntermediate = selectN(intermediatePool, allCandidates, 'Intermediate', 5);
    const finalAdvanced = selectN(advancedPool, allCandidates, 'Advanced', 3);

    const finalQuestions = [...finalBeginner, ...finalIntermediate, ...finalAdvanced];
    const uniqueConcepts = new Set(finalQuestions.map(q => q.concept));

    const questionEligibleConceptCount = questionEligibleConcepts.length;
    const generatedQuestionCount = finalQuestions.length;
    const generatedQuestions = finalQuestions.map(q => q.question);

    logger.info('[Studio Telemetry] Mock Q&A diagnostics', {
      retrievedChunkCount: chunks.length,
      validConceptCount: uniqueConcepts.size,
      rejectedConceptCount: rejectedConcepts.length,
      generatedQuestionCount,
      acceptedConcepts,
      rejectedConcepts,
      rejectionReason,
      acceptedConceptCount,
      questionEligibleConceptCount,
      skippedConcepts,
      skippedConceptsDetailed,
      questionEligibleConcepts,
      generatedQuestions
    });

    // Step 6: Format output into XML tags
    let content = '';

    content += `<ExecutiveOverview title="Interview Readiness Assessment">\n`;
    const topConceptList = Array.from(uniqueConcepts).slice(0, 5).join(', ');
    content += `This material covers ${Array.from(uniqueConcepts).size || uniqueConcepts.size} distinct technical concepts including ${topConceptList}. `;
    content += `A candidate who has studied this material will be well-positioned to answer foundational and intermediate questions, but should invest additional time in understanding the system architecture end-to-end and the trade-offs between the key components. `;
    content += `Readiness Tier: Silver — solid foundational coverage is present, but deeper practical experience with each component will be needed to ace advanced and scenario-based questions.\n`;
    content += `</ExecutiveOverview>\n\n`;

    content += `## Key Topics Covered\n`;
    const allTopics = Array.from(uniqueConcepts).slice(0, 10);
    for (const topic of allTopics) {
      const topicSentence = allSentences.find(s => s.toLowerCase().includes(topic.toLowerCase()));
      const topicDesc = topicSentence ? ` — ${topicSentence.substring(0, 80).trim()}...` : '';
      content += `- **${topic}**${topicDesc}\n`;
    }
    content += `\n`;

    content += `## Beginner Questions\n`;
    for (const q of finalBeginner) {
      content += `<InterviewQuestion level="Beginner" citation="${q.citation}">\n`;
      content += `Question:\n${q.question}\n\n`;
      content += `Expected Answer:\n${q.answer}\n\n`;
      content += `Why Interviewers Ask This:\n${q.why}\n`;
      content += `</InterviewQuestion>\n\n`;
    }

    content += `## Intermediate Questions\n`;
    for (const q of finalIntermediate) {
      content += `<InterviewQuestion level="Intermediate" citation="${q.citation}">\n`;
      content += `Question:\n${q.question}\n\n`;
      content += `Expected Answer:\n${q.answer}\n\n`;
      content += `Why Interviewers Ask This:\n${q.why}\n`;
      content += `</InterviewQuestion>\n\n`;
    }

    content += `## Advanced Questions\n`;
    for (const q of finalAdvanced) {
      content += `<InterviewQuestion level="Advanced" citation="${q.citation}">\n`;
      content += `Question:\n${q.question}\n\n`;
      content += `Expected Answer:\n${q.answer}\n\n`;
      content += `Why Interviewers Ask This:\n${q.why}\n`;
      content += `</InterviewQuestion>\n\n`;
    }

    content += `## Final Revision Checklist\n`;
    content += `<RevisionChecklist>\n`;
    const checkTopics = Array.from(uniqueConcepts);
    const revisionItems = [
      ...checkTopics.slice(0, 5).map(t => `Be able to explain what ${t} is, what problem it solves, and give one real-world example of where it is used`),
      ...checkTopics.slice(0, 3).map(t => `Understand how ${t} integrates with the other main components in this system`),
      `Know the end-to-end data flow and request lifecycle of the described architecture`,
      `Be prepared to discuss at least one trade-off or limitation for each major component`,
      `Practice explaining the system design in 2-3 minutes as if presenting to a technical hiring manager`,
    ];
    for (const item of revisionItems.slice(0, 10)) {
      content += `- ${item}\n`;
    }
    content += `</RevisionChecklist>\n`;

    return content;
  }

  extractChunksFromSources(sources) {
    const chunks = [];
    const activeStatuses = ['ready', 'completed', 'partially_ready', 'transcript_ready', 'vector_ready', 'graph_ready', 'ready_without_vectors', 'indexing_pending', 'indexing_retrying', 'fully_indexed'];
    const activeSources = (sources || []).filter(s => activeStatuses.includes(s.status) && s.transcript);

    for (const src of activeSources) {
      const paragraphs = src.transcript.split(/\n+/).map(p => p.trim()).filter(p => p.length > 50);
      let chunkIndex = 0;
      for (const p of paragraphs) {
        chunks.push({
          text: p,
          sourceId: src.id,
          sourceTitle: src.title || 'Source',
          sourceType: src.type || 'unknown',
          chunkIndex: chunkIndex++,
          pageNumber: null,
          score: 1.0
        });
        if (chunks.length >= 5) break;
      }
      if (chunks.length >= 5) break;
    }
    return chunks;
  }

  isNearDuplicate(text1, text2) {
    if (!text1 || !text2) return false;
    const words1 = text1.toLowerCase().match(/\b\w+\b/g) || [];
    const words2 = text2.toLowerCase().match(/\b\w+\b/g) || [];
    if (words1.length === 0 || words2.length === 0) return false;
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    let intersection = 0;
    for (const w of set1) {
      if (set2.has(w)) intersection++;
    }
    const union = set1.size + set2.size - intersection;
    return (intersection / union) > 0.95;
  }

  getValidConceptsCount(chunks) {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'to', 'of', 'for', 'in', 'that', 'it', 'with', 'as', 'was', 'are', 'be', 'this', 'you', 'i', 'he', 'she', 'they', 'we', 'or', 'but', 'not', 'your', 'my', 'our', 'their', 'his', 'her', 'its', 'from', 'by', 'about', 'more', 'some', 'has', 'have', 'had', 'been', 'were', 'does', 'do', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'into', 'than', 'then', 'only', 'so', 'up', 'down', 'out', 'over', 'under', 'again', 'further', 'once', 'one', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'other', 'such', 'no', 'nor', 'too', 'very', 'just', 'now', 'using', 'used', 'use', 'how', 'what', 'where', 'when', 'why', 'who', 'whom', 'whose', 'these', 'those'
    ]);
    const rejectList = ['integrate', 'build', 'prototype', 'prepare', 'perform', 'workflow', 'time', 'real', 'technical component', 'component', 'module', 'generic concept', 'create', 'research', 'plan', 'understand'];

    const rawConceptCounts = new Map();
    const allSentences = [];

    for (const chunk of chunks) {
      const text = chunk.text || '';
      const chunkSentences = text.split(/(?<=[.!?])\s+/);
      for (const s of chunkSentences) {
        const trimmed = s.trim();
        if (trimmed.length >= 10) {
          allSentences.push(trimmed);

          const matches = trimmed.match(/\b[A-Z][a-zA-Z0-9-']+(?:\s+[A-Z][a-zA-Z0-9-']+){0,2}\b/g) || [];
          for (const match of matches) {
            const clean = match.trim().replace(/[*_`"']/g, '').replace(/[.,:;!?()]/g, '');
            if (clean.length > 0) {
              rawConceptCounts.set(clean, (rawConceptCounts.get(clean) || 0) + 1);
            }
          }
        }
      }
    }

    const lowercaseWhitelist = ['blockchain', 'smart contract', 'vector store', 'retriever', 'memory', 'agents', 'api'];
    for (const sentence of allSentences) {
      const lower = sentence.toLowerCase();
      for (const lw of lowercaseWhitelist) {
        if (lower.includes(lw)) {
          const properCase = lw.split(' ').map(w => w[0].toUpperCase() + w.substring(1)).join(' ');
          rawConceptCounts.set(properCase, (rawConceptCounts.get(properCase) || 0) + 1);
        }
      }
    }

    let count = 0;
    for (const [concept] of rawConceptCounts.entries()) {
      const lower = concept.toLowerCase();
      if (rejectList.some(r => lower === r || lower.includes(r))) continue;
      if (stopWords.has(lower)) continue;
      if (concept.length < 3 && !['ai', 'api', 'db', 'ip'].includes(lower)) continue;
      count++;
    }
    return count;
  }

  generateDeterministicFlashcards(chunks) {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'to', 'of', 'for', 'in', 'that', 'it', 'with', 'as', 'was', 'are', 'be', 'this', 'you', 'i', 'he', 'she', 'they', 'we', 'or', 'but', 'not', 'your', 'my', 'our', 'their', 'his', 'her', 'its', 'from', 'by', 'about', 'more', 'some', 'has', 'have', 'had', 'been', 'were', 'does', 'do', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'into', 'than', 'then', 'only', 'so', 'up', 'down', 'out', 'over', 'under', 'again', 'further', 'once', 'one', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'other', 'such', 'no', 'nor', 'too', 'very', 'just', 'now', 'using', 'used', 'use', 'how', 'what', 'where', 'when', 'why', 'who', 'whom', 'whose', 'these', 'those'
    ]);
    const rejectList = ['integrate', 'build', 'prototype', 'prepare', 'perform', 'workflow', 'time', 'real', 'technical component', 'component', 'module', 'generic concept', 'create', 'research', 'plan', 'understand'];

    const sentenceObjects = [];
    const rawConceptCounts = new Map();

    for (const chunk of chunks) {
      const text = chunk.text || '';
      const chunkSentences = text.split(/(?<=[.!?])\s+/);
      const citation = chunk.sourceTitle ? `[${chunk.sourceTitle}${chunk.pageNumber ? ' — p.' + chunk.pageNumber : ''}]` : '[Source]';
      const chunkId = chunk.sourceId || chunk.id || 'unknown';

      for (const s of chunkSentences) {
        const trimmed = s.trim();
        if (trimmed.length >= 10) {
          sentenceObjects.push({
            text: trimmed,
            chunk,
            citation,
            chunkId,
          });

          const matches = trimmed.match(/\b[A-Z][a-zA-Z0-9-']+(?:\s+[A-Z][a-zA-Z0-9-']+){0,2}\b/g) || [];
          for (const match of matches) {
            const clean = match.trim().replace(/[*_`"']/g, '').replace(/[.,:;!?()]/g, '');
            if (clean.length > 0) {
              rawConceptCounts.set(clean, (rawConceptCounts.get(clean) || 0) + 1);
            }
          }
        }
      }
    }

    const lowercaseWhitelist = ['blockchain', 'smart contract', 'vector store', 'retriever', 'memory', 'agents', 'api'];
    for (const sObj of sentenceObjects) {
      const lower = sObj.text.toLowerCase();
      for (const lw of lowercaseWhitelist) {
        if (lower.includes(lw)) {
          const properCase = lw.split(' ').map(w => w[0].toUpperCase() + w.substring(1)).join(' ');
          rawConceptCounts.set(properCase, (rawConceptCounts.get(properCase) || 0) + 1);
        }
      }
    }

    const acceptedConcepts = [];
    for (const [concept, freq] of rawConceptCounts.entries()) {
      const lower = concept.toLowerCase();
      if (rejectList.some(r => lower === r || lower.includes(r))) continue;
      if (stopWords.has(lower)) continue;
      if (concept.length < 3 && !['ai', 'api', 'db', 'ip'].includes(lower)) continue;

      acceptedConcepts.push({ concept, freq });
    }

    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const cleanSentenceToBullet = (sentence) => {
      if (!sentence) return '';
      let clean = sentence.replace(/^\s*(?:however|furthermore|moreover|therefore|thus|so|also|additionally|consequently|for example|in addition|specifically|interestingly|surprisingly|meanwhile|afterwards|finally|firstly|secondly|thirdly|first|second|third|next|then),?\s*/i, '');
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
      clean = clean.replace(/[.]+$/, '');
      return clean.trim();
    };

    const getConceptTechnicalBoost = (concept, sentence) => {
      let boost = 0;
      const lowerConcept = concept.toLowerCase();
      const lowerSentence = (sentence || '').toLowerCase();

      const whitelistFrameworks = ['langchain', 'zeropay'];
      const whitelistArchitectures = ['rag', 'blockchain'];
      const whitelistAPIs = ['api', 'openai', 'anthropic'];
      const whitelistAlgorithms = ['embeddings'];
      const whitelistDatabases = ['vector store', 'retriever', 'memory', 'agents'];

      if (whitelistFrameworks.includes(lowerConcept)) boost += 5;
      else if (whitelistArchitectures.includes(lowerConcept)) boost += 5;
      else if (whitelistAPIs.includes(lowerConcept)) boost += 3;
      else if (whitelistAlgorithms.includes(lowerConcept)) boost += 4;
      else if (whitelistDatabases.includes(lowerConcept)) boost += 3;

      if (lowerConcept.includes('framework') || lowerSentence.includes('framework')) boost += 5;
      if (lowerConcept.includes('architecture') || lowerSentence.includes('architecture')) boost += 5;
      if (lowerConcept.includes('library') || lowerSentence.includes('library')) boost += 4;
      if (lowerConcept.includes('protocol') || lowerSentence.includes('protocol')) boost += 4;
      if (lowerConcept.includes('algorithm') || lowerSentence.includes('algorithm')) boost += 4;
      if (lowerConcept.includes('api') || lowerSentence.includes('api')) boost += 3;
      if (lowerConcept.includes('database') || lowerSentence.includes('database')) boost += 3;
      if (lowerConcept.includes('infrastructure') || lowerSentence.includes('infrastructure')) boost += 3;

      return boost;
    };

    const candidates = [];

    const extractArchSteps = (chunkSObjs, concept) => {
      const steps = [];
      const archSObjs = chunkSObjs.filter(sObj => {
        const lower = sObj.text.toLowerCase();
        return lower.includes('architecture') || lower.includes('layers') || lower.includes('flow') || lower.includes('components') || lower.includes('pipeline') || lower.includes('sequence') || lower.includes('step');
      });

      const seen = new Set();
      for (const sObj of archSObjs) {
        const matches = sObj.text.match(/\b[A-Z][a-zA-Z0-9-']+(?:\s+[A-Z][a-zA-Z0-9-']+){0,1}\b/g) || [];
        for (const m of matches) {
          const clean = m.trim().replace(/[*_`"']/g, '').replace(/[.,:;!?()]/g, '');
          if (clean && clean.toLowerCase() !== concept.toLowerCase() && !stopWords.has(clean.toLowerCase()) && clean.length > 2) {
            const norm = clean.toLowerCase();
            if (!seen.has(norm)) {
              seen.add(norm);
              steps.push(clean);
            }
          }
        }
      }

      if (steps.length >= 3 && steps.length <= 8) return steps;
      if (steps.length > 8) return steps.slice(0, 8);

      const fallbackSteps = archSObjs.map(sObj => cleanSentenceToBullet(sObj.text)).filter(Boolean);
      const summarySentences = [...fallbackSteps];
      if (summarySentences.length > 0 && summarySentences.length < 3) {
        const remaining = chunkSObjs.filter(sObj => !archSObjs.includes(sObj)).map(sObj => cleanSentenceToBullet(sObj.text)).filter(Boolean);
        summarySentences.push(...remaining);
      }
      const uniqueSummary = [];
      const seenArch = new Set();
      for (const b of summarySentences) {
        const norm = b.toLowerCase();
        if (!seenArch.has(norm)) {
          seenArch.add(norm);
          uniqueSummary.push(b);
        }
      }
      if (uniqueSummary.length >= 3) {
        return uniqueSummary.slice(0, 8);
      }
      return null;
    };

    for (const { concept, freq } of acceptedConcepts) {
      const conceptRegex = new RegExp('\\b' + escapeRegExp(concept) + '\\b', 'i');
      const matching = sentenceObjects.filter(sObj => conceptRegex.test(sObj.text));
      if (matching.length === 0) continue;

      const chunkMentions = new Map();
      for (const m of matching) {
        chunkMentions.set(m.chunk, (chunkMentions.get(m.chunk) || 0) + 1);
      }
      let primaryChunk = null;
      let maxMentions = 0;
      for (const [chunk, count] of chunkMentions.entries()) {
        if (count > maxMentions) {
          maxMentions = count;
          primaryChunk = chunk;
        }
      }
      if (!primaryChunk) primaryChunk = matching[0].chunk;

      const chunkSObjs = sentenceObjects.filter(sObj => sObj.chunk === primaryChunk);
      const citation = primaryChunk.sourceTitle ? `[${primaryChunk.sourceTitle}${primaryChunk.pageNumber ? ' — p.' + primaryChunk.pageNumber : ''}]` : '[Source]';
      const chunkId = primaryChunk.sourceId || primaryChunk.id || 'unknown';

      const firstMatchingSentenceObj = matching.find(sObj => sObj.chunk === primaryChunk) || matching[0];
      const boost = getConceptTechnicalBoost(concept, firstMatchingSentenceObj.text);
      const priorityScore = freq + boost;

      const summarySentences = chunkSObjs.filter(sObj => conceptRegex.test(sObj.text));
      if (summarySentences.length < 3) {
        const remaining = chunkSObjs.filter(sObj => !conceptRegex.test(sObj.text));
        summarySentences.push(...remaining);
      }
      const summaryBullets = summarySentences.map(sObj => cleanSentenceToBullet(sObj.text)).filter(Boolean);
      const uniqueSummaryBullets = [];
      const seenSummary = new Set();
      for (const b of summaryBullets) {
        const norm = b.toLowerCase();
        if (!seenSummary.has(norm)) {
          seenSummary.add(norm);
          uniqueSummaryBullets.push(b);
        }
      }

      if (uniqueSummaryBullets.length >= 3) {
        candidates.push({
          type: 'concept_summary',
          title: concept.toUpperCase(),
          bullets: uniqueSummaryBullets.slice(0, 8),
          sourceCitation: citation,
          chunkId,
          priorityScore,
        });
      }

      const steps = extractArchSteps(chunkSObjs, concept);
      if (steps && steps.length >= 3) {
        candidates.push({
          type: 'architecture',
          title: `${concept.toUpperCase()} ARCHITECTURE`,
          bullets: steps,
          sourceCitation: citation,
          chunkId,
          priorityScore: priorityScore + 2,
        });
      }

      const implSObjs = chunkSObjs.filter(sObj => {
        const lower = sObj.text.toLowerCase();
        return lower.includes('implement') || lower.includes('configure') || lower.includes('setup') || lower.includes('deploy') || lower.includes('database') || lower.includes('code');
      });
      if (implSObjs.length > 0) {
        const summarySentences = [...implSObjs];
        const remaining = chunkSObjs.filter(sObj => !implSObjs.includes(sObj));
        summarySentences.push(...remaining);

        const implBullets = summarySentences.map(sObj => cleanSentenceToBullet(sObj.text)).filter(Boolean);
        const uniqueImplBullets = [];
        const seenImpl = new Set();
        for (const b of implBullets) {
          const norm = b.toLowerCase();
          if (!seenImpl.has(norm)) {
            seenImpl.add(norm);
            uniqueImplBullets.push(b);
          }
        }
        if (uniqueImplBullets.length >= 3) {
          candidates.push({
            type: 'implementation_notes',
            title: `${concept.toUpperCase()} IMPLEMENTATION`,
            bullets: uniqueImplBullets.slice(0, 8),
            sourceCitation: citation,
            chunkId,
            priorityScore: priorityScore + 1,
          });
        }
      }

      const nuggetSObjs = chunkSObjs.filter(sObj => {
        const lower = sObj.text.toLowerCase();
        return lower.includes('tradeoff') || lower.includes('benefit') || lower.includes('challenge') || lower.includes('performance') || lower.includes('latency');
      });
      if (nuggetSObjs.length > 0) {
        const summarySentences = [...nuggetSObjs];
        const remaining = chunkSObjs.filter(sObj => !nuggetSObjs.includes(sObj));
        summarySentences.push(...remaining);

        const nuggetBullets = summarySentences.map(sObj => cleanSentenceToBullet(sObj.text)).filter(Boolean);
        const uniqueNuggetBullets = [];
        const seenNugget = new Set();
        for (const b of nuggetBullets) {
          const norm = b.toLowerCase();
          if (!seenNugget.has(norm)) {
            seenNugget.add(norm);
            uniqueNuggetBullets.push(b);
          }
        }
        if (uniqueNuggetBullets.length >= 3) {
          candidates.push({
            type: 'interview_nuggets',
            title: `${concept.toUpperCase()} KEY DETAILS`,
            bullets: uniqueNuggetBullets.slice(0, 8),
            sourceCitation: citation,
            chunkId,
            priorityScore: priorityScore + 1,
          });
        }
      }
    }

    for (const chunk of chunks) {
      const chunkSObjs = sentenceObjects.filter(sObj => sObj.chunk === chunk);
      const bullets = chunkSObjs.map(sObj => cleanSentenceToBullet(sObj.text)).filter(Boolean);
      const uniqueBullets = [];
      const seenTakeaway = new Set();
      for (const b of bullets) {
        const norm = b.toLowerCase();
        if (!seenTakeaway.has(norm)) {
          seenTakeaway.add(norm);
          uniqueBullets.push(b);
        }
      }
      if (uniqueBullets.length >= 3) {
        const citation = chunk.sourceTitle ? `[${chunk.sourceTitle}${chunk.pageNumber ? ' — p.' + chunk.pageNumber : ''}]` : '[Source]';
        const chunkId = chunk.sourceId || chunk.id || 'unknown';
        candidates.push({
          type: 'key_takeaways',
          title: `${(chunk.sourceTitle || 'Document').toUpperCase()} KEY TAKEAWAYS`,
          bullets: uniqueBullets.slice(0, 8),
          sourceCitation: citation,
          chunkId,
          priorityScore: 5,
        });
      }
    }

    candidates.forEach(c => {
      const spec = (c.type === 'architecture') ? 1.0 : 0.8;
      const ground = 1.0;
      const isTech = ['langchain', 'rag', 'embeddings', 'retriever', 'vector store', 'agents', 'memory', 'openai', 'anthropic', 'api', 'blockchain', 'zeropay'].some(w => c.title.toLowerCase().includes(w)) ? 1.0 : 0.8;
      const ansQual = c.bullets.length >= 5 ? 1.0 : (c.bullets.length >= 3 ? 0.8 : 0);
      c.cardScore = (spec + ground + isTech + ansQual) / 4 + (c.priorityScore || 0) * 0.01;
    });

    const getJaccardSimilarity = (setA, setB) => {
      if (setA.size === 0 || setB.size === 0) return 0;
      const intersection = new Set([...setA].filter(x => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      return intersection.size / union.size;
    };

    candidates.forEach(c => {
      c.normalizedBullets = new Set(c.bullets.map(b => b.toLowerCase().replace(/[^a-z0-9]/g, '')));
    });

    const selectCards = (allCandidates, includeEmergency) => {
      const allowedTypes = includeEmergency
        ? ['concept_summary', 'architecture', 'implementation_notes', 'interview_nuggets', 'key_takeaways']
        : ['concept_summary', 'architecture', 'implementation_notes', 'interview_nuggets'];

      const pools = {};
      for (const t of allowedTypes) {
        pools[t] = allCandidates.filter(c => c.type === t).sort((a, b) => b.cardScore - a.cardScore);
      }

      const selected = [];
      const seenTitles = new Set();

      const addCard = (card) => {
        if (!card) return false;
        const normTitle = card.title.trim().toLowerCase();
        if (seenTitles.has(normTitle)) return false;

        for (const sel of selected) {
          if (sel.chunkId !== card.chunkId) {
            if (getJaccardSimilarity(card.normalizedBullets, sel.normalizedBullets) > 0.4) {
              return false;
            }
          }
        }

        selected.push(card);
        seenTitles.add(normTitle);
        return true;
      };

      const targets = {
        concept_summary: 5,
        architecture: 5,
        implementation_notes: 5,
        interview_nuggets: 5,
        key_takeaways: 5
      };

      for (const type of allowedTypes) {
        const pool = pools[type] || [];
        let pickedCount = 0;
        for (const card of pool) {
          if (pickedCount >= (targets[type] || 5)) break;
          if (addCard(card)) {
            pickedCount++;
          }
        }
      }

      if (selected.length < 25) {
        const allRemaining = [];
        for (const type of allowedTypes) {
          allRemaining.push(...(pools[type] || []));
        }
        allRemaining.sort((a, b) => (b.cardScore || 0) - (a.cardScore || 0));
        for (const card of allRemaining) {
          if (selected.length >= 25) break;
          addCard(card);
        }
      }

      return selected;
    };

    let selected = selectCards(candidates, false);

    if (selected.length < 10) {
      selected = selectCards(candidates, true);
    }

    selected = selected.map((card, idx) => ({
      ...card,
      id: `card_${idx + 1}`
    }));

    selected.forEach(c => {
      delete c.normalizedBullets;
    });

    this.lastRejectedCardsCount = candidates.length - selected.length;
    return selected;
  }

  calculateFlashcardQualityScore(cards) {
    if (!cards || cards.length === 0) return 0;
    
    const grounding = 100;

    const total = cards.length;
    const types = cards.map(c => c.type);
    const summaryCount = types.filter(t => t === 'concept_summary').length;
    const archCount = types.filter(t => t === 'architecture').length;
    const takeawaysCount = types.filter(t => t === 'key_takeaways').length;
    const implCount = types.filter(t => t === 'implementation_notes').length;
    const nuggetCount = types.filter(t => t === 'interview_nuggets').length;

    const summaryPct = summaryCount / total;
    const archPct = archCount / total;
    const takeawaysPct = takeawaysCount / total;
    const implPct = implCount / total;
    const nuggetPct = nuggetCount / total;

    const diff = Math.abs(summaryPct - 0.25) +
                 Math.abs(archPct - 0.20) +
                 Math.abs(takeawaysPct - 0.20) +
                 Math.abs(implPct - 0.20) +
                 Math.abs(nuggetPct - 0.15);
                 
    const coverage = Math.round((1.0 - (diff / 2.0)) * 100);

    const specificity = 100;

    const techCount = cards.filter(c => {
      const lower = (c.title || '').toLowerCase();
      const whitelist = ['langchain', 'rag', 'embeddings', 'retriever', 'vector store', 'agents', 'memory', 'openai', 'anthropic', 'api', 'blockchain', 'zeropay'];
      if (whitelist.some(w => lower.includes(w))) return true;
      return false;
    }).length;
    const techDepth = Math.round((techCount / total) * 100);

    const answerQualityList = cards.map(c => {
      const len = c.bullets ? c.bullets.length : 0;
      if (len >= 5) return 100;
      if (len >= 3) return 80;
      return 0;
    });
    const answerQuality = Math.round(answerQualityList.reduce((sum, v) => sum + v, 0) / total);

    const overallScore = Math.round((grounding + coverage + specificity + techDepth + answerQuality) / 5);
    return overallScore;
  }

  combineAndValidateFlashcards(deterministicCards, llmCards, chunks) {
    const allCards = [...deterministicCards, ...llmCards];
    
    allCards.forEach(c => {
      const spec = (c.type === 'architecture') ? 1.0 : 0.8;
      const ground = 1.0;
      const isTech = ['langchain', 'rag', 'embeddings', 'retriever', 'vector store', 'agents', 'memory', 'openai', 'anthropic', 'api', 'blockchain', 'zeropay'].some(w => (c.title || '').toLowerCase().includes(w)) ? 1.0 : 0.8;
      const ansQual = c.bullets && c.bullets.length >= 5 ? 1.0 : (c.bullets && c.bullets.length >= 3 ? 0.8 : 0);
      c.cardScore = (spec + ground + isTech + ansQual) / 4;
    });

    const pools = {
      concept_summary: allCards.filter(c => c.type === 'concept_summary').sort((a, b) => b.cardScore - a.cardScore),
      architecture: allCards.filter(c => c.type === 'architecture').sort((a, b) => b.cardScore - a.cardScore),
      implementation_notes: allCards.filter(c => c.type === 'implementation_notes').sort((a, b) => b.cardScore - a.cardScore),
      interview_nuggets: allCards.filter(c => c.type === 'interview_nuggets').sort((a, b) => b.cardScore - a.cardScore),
      key_takeaways: allCards.filter(c => c.type === 'key_takeaways').sort((a, b) => b.cardScore - a.cardScore)
    };

    const selected = [];
    const seenTitles = new Set();
    const getJaccardSimilarity = (setA, setB) => {
      if (setA.size === 0 || setB.size === 0) return 0;
      const intersection = new Set([...setA].filter(x => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      return intersection.size / union.size;
    };

    allCards.forEach(c => {
      if (c.bullets) {
        c.normalizedBullets = new Set(c.bullets.map(b => b.toLowerCase().replace(/[^a-z0-9]/g, '')));
      } else {
        c.normalizedBullets = new Set();
      }
    });

    const addCard = (card) => {
      if (!card) return false;
      const normTitle = card.title.trim().toLowerCase();
      if (seenTitles.has(normTitle)) return false;
      
      for (const sel of selected) {
        if (sel.chunkId !== card.chunkId) {
          if (getJaccardSimilarity(card.normalizedBullets, sel.normalizedBullets) > 0.4) {
            return false;
          }
        }
      }

      selected.push(card);
      seenTitles.add(normTitle);
      return true;
    };

    const types = ['concept_summary', 'architecture', 'implementation_notes', 'interview_nuggets', 'key_takeaways'];
    const targets = {
      concept_summary: 5,
      architecture: 5,
      implementation_notes: 5,
      interview_nuggets: 5,
      key_takeaways: 5
    };

    for (const type of types) {
      const pool = pools[type] || [];
      let pickedCount = 0;
      for (const card of pool) {
        if (pickedCount >= targets[type]) break;
        if (addCard(card)) {
          pickedCount++;
        }
      }
    }

    if (selected.length < 25) {
      const allRemaining = [];
      for (const type of types) {
        allRemaining.push(...(pools[type] || []));
      }
      allRemaining.sort((a, b) => (b.cardScore || 0) - (a.cardScore || 0));
      for (const card of allRemaining) {
        if (selected.length >= 25) break;
        addCard(card);
      }
    }

    selected.forEach(c => {
      delete c.normalizedBullets;
    });

    return selected;
  }

  getSourcesUsedFromCards(cards, chunks) {
    const sourcesUsed = [];
    const sourceIds = new Set();
    for (const card of cards) {
      const chunk = chunks.find(c => c.sourceId === card.chunkId || c.id === card.chunkId);
      if (chunk) {
        const srcId = chunk.sourceId || chunk.id || 'unknown';
        if (!sourceIds.has(srcId)) {
          sourceIds.add(srcId);
          sourcesUsed.push({
            sourceId: srcId,
            title: chunk.sourceTitle || chunk.title || 'Source',
            type: chunk.sourceType || chunk.type || 'unknown'
          });
        }
      }
    }
    if (sourcesUsed.length === 0 && chunks.length > 0) {
      const first = chunks[0];
      sourcesUsed.push({
        sourceId: first.sourceId || first.id || 'unknown',
        title: first.sourceTitle || first.title || 'Source',
        type: first.sourceType || first.type || 'unknown'
      });
    }
    return sourcesUsed;
  }

  async getOutput(workspaceId, outputId) {
    return this.outputRepo.findById(workspaceId, outputId);
  }

  async listOutputs(workspaceId) {
    return this.outputRepo.findByWorkspace(workspaceId);
  }

  async deleteOutput(workspaceId, outputId) {
    return this.outputRepo.delete(workspaceId, outputId);
  }
}

export default StudioGenerationService;
