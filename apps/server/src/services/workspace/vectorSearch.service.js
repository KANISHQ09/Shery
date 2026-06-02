import logger from '../../loggers/logger.js';
import AppError from '../../utils/AppError.js';
import { WORKSPACE_COLLECTION } from '../../infrastructure/qdrant.js';

class VectorSearchService {
  constructor({ embeddingService, qdrantClient, aiClient, hotWorkspaceCacheService } = {}) {
    this.embeddingService = embeddingService;
    this.qdrantClient = qdrantClient;
    this.aiClient = aiClient; // geminiFlash
    this.hotWorkspaceCacheService = hotWorkspaceCacheService;
  }

  /**
   * Rewrite/expand query using AI client to maximize semantic matching surface
   * @param {string} query 
   * @returns {Promise<string>}
   */
  async rewriteQuery(query) {
    if (!this.aiClient) return query;
    try {
      const prompt = `You are a high-fidelity academic search engine. Rewrite the following user query to include relevant search terms, technical synonyms, and alternate concepts. Return ONLY the expanded query string, with no descriptions or explanations. Keep it concise.
Original Query: "${query}"`;
      
      const response = await this.aiClient.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
      });
      
      const rewritten = response.response?.text?.().trim();
      if (rewritten && rewritten.length > 5) {
        logger.info('Query expanded successfully', { original: query, expanded: rewritten });
        return `${query} ${rewritten}`;
      }
      return query;
    } catch (err) {
      logger.error('Query expansion failed, falling back to original', { error: err.message });
      return query;
    }
  }

  /**
   * Adapts retrieval limits dynamically depending on synthesis terms in the prompt
   * @param {string} query 
   * @returns {number} Dynamic topK
   */
  adaptiveRetrievalDepth(query) {
    const q = query.toLowerCase();
    const synthesisTerms = ['compare', 'difference', 'contrast', 'relationship', 'versus', 'vs', 'overview', 'synthesize', 'summary'];
    const requiresDeepRetrieval = synthesisTerms.some(term => q.includes(term));
    return requiresDeepRetrieval ? 25 : 12;
  }

  /**
   * Lexical search (BM25 proxy) fallback when Qdrant vectors are not yet indexed or the engine is offline.
   */
  async lexicalSearch(workspaceId, query, opts = {}) {
    const startMs = Date.now();
    const topK = opts.topK || this.adaptiveRetrievalDepth(query);

    try {
      const { default: container } = await import('../../container/workspaceContainer.js');
      const sources = await container.workspaceSourceRepository.findByWorkspace(workspaceId);
      
      const activeStatuses = ['ready', 'completed', 'partially_ready', 'transcript_ready', 'vector_ready', 'graph_ready', 'ready_without_vectors', 'indexing_pending', 'indexing_retrying', 'fully_indexed'];
      const activeSources = sources.filter(s => 
        activeStatuses.includes(s.status) && 
        (!opts.sourceIds || opts.sourceIds.includes(s.id))
      );

      const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'to', 'of', 'for', 'in', 'that', 'it', 'with', 'as', 'was', 'are', 'be', 'this', 'you', 'i', 'he', 'she', 'they', 'we', 'or', 'but']);
      
      // Tokenize query terms
      const queryTerms = query.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !stopWords.has(t));

      const candidates = [];

      for (const src of activeSources) {
        const transcriptText = src.transcript || `Source: ${src.title || 'Untitled Source'} - No transcript available.`;
        const title = src.title || '';
        const titleLower = title.toLowerCase();
        
        let titleMatchBoost = 1.0;
        for (const term of queryTerms) {
          if (titleLower.includes(term)) {
            titleMatchBoost += 0.25;
          }
        }

        // Segment dynamic paragraph blocks (approx 800 chars, 150 overlap)
        const maxLen = 800;
        const overlap = 150;
        const paragraphs = transcriptText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 10);
        
        let chunkIndex = 0;
        const textChunks = [];
        for (const p of paragraphs) {
          let start = 0;
          while (start < p.length) {
            const text = p.substring(start, start + maxLen);
            textChunks.push({
              text,
              chunkIndex: chunkIndex++,
              sectionTitle: 'Transcript Segment'
            });
            start += maxLen - overlap;
          }
        }

        // Score blocks
        for (const chunk of textChunks) {
          const textLower = chunk.text.toLowerCase();
          let score = 0;
          let termsMatched = 0;

          if (textLower.includes(query.toLowerCase())) {
            score += 10;
          }

          for (const term of queryTerms) {
            if (textLower.includes(term)) {
              termsMatched++;
              const count = textLower.split(term).length - 1;
              score += count * 1.5;

              if (termsMatched > 1) {
                score += 2.0;
              }
            }
          }

          if (score > 0) {
            let finalScore = score * titleMatchBoost;

            // Layer 4: Section-title heuristic matching
            if (src.topicSegments) {
              const matchedTopic = src.topicSegments.find(
                t => chunk.chunkIndex >= t.startChunkIndex && chunk.chunkIndex <= t.endChunkIndex
              );
              if (matchedTopic) {
                const topicTitleLower = (matchedTopic.title || '').toLowerCase();
                for (const term of queryTerms) {
                  if (topicTitleLower.includes(term)) {
                    finalScore += 4.0; // Boost if search query term matches topic/section title
                  }
                }

                for (const keyword of (matchedTopic.keywords || [])) {
                  if (query.toLowerCase().includes(keyword.toLowerCase())) {
                    finalScore += 3.0;
                  }
                }
              }
            }

            // Layer 5: Recent-source prioritization
            let recencyBoost = 0;
            if (src.updatedAt) {
              const hoursSinceUpdate = (Date.now() - new Date(src.updatedAt).getTime()) / (1000 * 60 * 60);
              if (hoursSinceUpdate < 1) {
                recencyBoost = 3.0;
              } else if (hoursSinceUpdate < 24) {
                recencyBoost = 1.5;
              } else if (hoursSinceUpdate < 168) {
                recencyBoost = 0.5;
              }
            }
            finalScore += recencyBoost;

            candidates.push({
              text: chunk.text,
              sourceId: src.id,
              sourceTitle: title,
              sourceType: src.type,
              chunkIndex: chunk.chunkIndex,
              startTime: null,
              endTime: null,
              pageNumber: null,
              sectionTitle: chunk.sectionTitle,
              relevance: finalScore,
              semanticScore: finalScore
            });
          }
        }
      }

      candidates.sort((a, b) => b.relevance - a.relevance);

      const rrfWrappers = candidates.map(c => ({ payload: c, rrfScore: c.relevance, score: c.relevance }));
      const diverse = this._enforceSourceDiversity(rrfWrappers, 0.6).map(item => item.payload);
      const results = diverse.slice(0, topK);

      logger.info('[PIPELINE] Vectors Retrieved (Lexical Fallback)', {
        workspaceId,
        query: query.substring(0, 80),
        candidateCount: candidates.length,
        returnedCount: results.length,
        durationMs: Date.now() - startMs,
      });

      return results;
    } catch (fallbackErr) {
      logger.error('Failed to run lexical fallback search', { error: fallbackErr.message });
      return [];
    }
  }

  /**
   * Hybrid search combining semantic vector search with BM25 keyword scoring
   * via Reciprocal Rank Fusion (RRF).
   *
   * @param {string} workspaceId
   * @param {string} query
   * @param {Object} opts
   * @param {number}   [opts.topK=20]
   * @param {string[]} [opts.sourceIds]
   * @returns {Promise<Array>}
   */
  async hybridSearch(workspaceId, query, opts = {}) {
    const startMs = Date.now();
    const topK = opts.topK || this.adaptiveRetrievalDepth(query);

    if (!query || typeof query !== 'string') {
      throw new AppError('Search query is required', 400);
    }

    try {
      // LEVEL 0: Hot Workspace Cache Check
      if (this.hotWorkspaceCacheService) {
        const cached = await this.hotWorkspaceCacheService.searchCache(workspaceId, query, topK);
        if (cached && cached.length > 0) {
          return cached;
        }
      }

      // AI Semantic query expansion
      const expandedQuery = await this.rewriteQuery(query);

      // LEVEL 1: Semantic Vector Search
      let queryEmbedding;
      try {
        queryEmbedding = await this.embeddingService.generateEmbedding(expandedQuery);
      } catch (embedErr) {
        logger.warn('Embedding generation failed, falling back to LEVEL 2', { error: embedErr.message });
        return this.runLayeredFallbacks(workspaceId, query, topK, opts);
      }

      const filter = {
        must: [
          { key: 'workspaceId', match: { value: workspaceId } },
          ...(opts.sourceIds?.length
            ? [{ key: 'sourceId', match: { any: opts.sourceIds } }]
            : []),
        ],
      };

      let semanticResults = [];
      try {
        semanticResults = await this.qdrantClient.search(WORKSPACE_COLLECTION, {
          vector: queryEmbedding,
          limit: Math.min(topK * 2, 50),
          filter,
          with_payload: true,
          score_threshold: 0.25,
        });
      } catch (qdrantErr) {
        logger.warn('Qdrant search failed, falling back to LEVEL 2', { error: qdrantErr.message });
        return this.runLayeredFallbacks(workspaceId, query, topK, opts);
      }

      if (!semanticResults || !semanticResults.length) {
        logger.info('Hybrid search returned no semantic results, falling back to LEVEL 2', {
          workspaceId,
          query: query.substring(0, 80),
        });
        return this.runLayeredFallbacks(workspaceId, query, topK, opts);
      }

      // Boost Tier 1 (headings, definitions)
      semanticResults = semanticResults.map(r => {
        let score = r.score;
        if (r.payload?.priorityTier === 1) {
          score += 0.12; // Boost Tier 1 semantic nodes
        }
        return {
          ...r,
          score
        };
      });

      // BM25 keyword scoring
      const queryTerms = Array.from(new Set([
        ...query.toLowerCase().split(/\s+/),
        ...expandedQuery.toLowerCase().split(/\s+/)
      ])).filter((t) => t.length > 2);

      const bm25Scores = this._calculateBm25Scores(semanticResults, queryTerms);

      // Reciprocal Rank Fusion
      const fused = this._reciprocalRankFusion(semanticResults, bm25Scores);

      // Source diversity enforcement
      const diverse = this._enforceSourceDiversity(fused);

      // Trim to topK
      const results = diverse.slice(0, topK).map((item) => ({
        text: item.payload.text,
        sourceId: item.payload.sourceId,
        sourceTitle: item.payload.sourceTitle,
        sourceType: item.payload.sourceType,
        chunkIndex: item.payload.chunkIndex,
        startTime: item.payload.startTime ?? null,
        endTime: item.payload.endTime ?? null,
        pageNumber: item.payload.pageNumber ?? null,
        sectionTitle: item.payload.sectionTitle ?? null,
        relevance: item.rrfScore,
        semanticScore: item.semanticScore,
      }));

      logger.info('[PIPELINE] Vectors Retrieved (Hybrid LEVEL 1)', {
        workspaceId,
        query: query.substring(0, 80),
        candidateCount: semanticResults.length,
        returnedCount: results.length,
        durationMs: Date.now() - startMs,
      });

      return results;
    } catch (err) {
      logger.warn('Hybrid search failed with exception, falling back to LEVEL 2', {
        workspaceId,
        error: err.message
      });
      return this.runLayeredFallbacks(workspaceId, query, topK, opts);
    }
  }

  /**
   * Layered execution of Level 2-5 fallbacks
   */
  async runLayeredFallbacks(workspaceId, query, topK, opts = {}) {
    logger.info('Executing Layered Ingestion Fallbacks...', { workspaceId, query });

    // LEVEL 2: BM25 Lexical
    const lexicalHits = await this.lexicalSearch(workspaceId, query, opts);
    if (lexicalHits && lexicalHits.length > 0) return lexicalHits;

    // LEVEL 3: Title/Topic keyword matching
    const keywordHits = await this.titleTopicMatching(workspaceId, query, topK);
    if (keywordHits && keywordHits.length > 0) return keywordHits;

    // LEVEL 4: Summary Memory Retrieval
    const memoryHits = await this.memorySummaryRetrieval(workspaceId, query, topK);
    if (memoryHits && memoryHits.length > 0) return memoryHits;

    // LEVEL 5: Source Overview Fallback
    return this.sourceOverviewFallback(workspaceId, topK);
  }

  async titleTopicMatching(workspaceId, query, topK) {
    try {
      const { default: container } = await import('../../container/workspaceContainer.js');
      const sources = await container.workspaceSourceRepository.findByWorkspace(workspaceId);
      const queryLower = query.toLowerCase();
      
      const matched = [];
      for (const src of sources) {
        const title = (src.title || '').toLowerCase();
        if (title.includes(queryLower) || queryLower.includes(title)) {
          if (src.transcript) {
            matched.push({
              text: `Source Match: ${src.title}.\nTranscript Overview:\n${src.transcript.substring(0, 1000)}...`,
              sourceId: src.id,
              sourceTitle: src.title,
              sourceType: src.type,
              chunkIndex: 0,
              startTime: null,
              endTime: null,
              pageNumber: 1,
              sectionTitle: 'Keyword Overview',
              relevance: 0.9,
              semanticScore: 0.9
            });
          }
        }
      }
      return matched.slice(0, topK);
    } catch (err) {
      logger.warn('Title topic matching failed', { error: err.message });
      return [];
    }
  }

  async memorySummaryRetrieval(workspaceId, query, topK) {
    try {
      const { default: container } = await import('../../container/workspaceContainer.js');
      const memory = await container.workspaceMemoryService.getMemoryContext(workspaceId);
      if (!memory) return [];

      const queryLower = query.toLowerCase();
      const matches = [];
      const focusAreas = memory.focusAreas || [];
      
      for (const area of focusAreas) {
        if (queryLower.includes(area.toLowerCase())) {
          matches.push({
            text: `Workspace focus area: ${area}. The user has focused on this topic previously in study patterns.`,
            sourceId: 'workspace_memory',
            sourceTitle: 'Workspace Cognitive Memory',
            sourceType: 'memory',
            chunkIndex: 0,
            startTime: null,
            endTime: null,
            pageNumber: null,
            sectionTitle: 'Memory Context',
            relevance: 0.8,
            semanticScore: 0.8
          });
        }
      }
      return matches.slice(0, topK);
    } catch (err) {
      logger.warn('Memory summary retrieval failed', { error: err.message });
      return [];
    }
  }

  async sourceOverviewFallback(workspaceId, topK) {
    try {
      const { default: container } = await import('../../container/workspaceContainer.js');
      const sources = await container.workspaceSourceRepository.findByWorkspace(workspaceId);
      const text = `Workspace Sources Overview:\n` + 
        sources.map(s => `- ${s.title} (${s.type}, status: ${s.status})`).join('\n') + 
        `\nThis workspace contains ${sources.length} sources. Ask me a specific question about these files!`;
      
      return [{
        text,
        sourceId: 'workspace_overview',
        sourceTitle: 'Workspace Overview',
        sourceType: 'overview',
        chunkIndex: 0,
        startTime: null,
        endTime: null,
        pageNumber: null,
        sectionTitle: 'Workspace Overview',
        relevance: 0.7,
        semanticScore: 0.7
      }];
    } catch (err) {
      logger.warn('Source overview fallback failed', { error: err.message });
      return [];
    }
  }

  /**
   * Direct semantic search without BM25 re-ranking.
   *
   * @param {string} workspaceId
   * @param {number[]} queryEmbedding
   * @param {number} topK
   * @param {Object} filters
   * @param {string[]} [filters.sourceIds]
   * @returns {Promise<Array>}
   */
  async semanticSearch(workspaceId, queryEmbedding, topK = 10, filters = {}) {
    const startMs = Date.now();

    const filterClauses = [
      { key: 'workspaceId', match: { value: workspaceId } },
    ];

    if (filters.sourceIds?.length) {
      filterClauses.push({ key: 'sourceId', match: { any: filters.sourceIds } });
    }

    const results = await this.qdrantClient.search(WORKSPACE_COLLECTION, {
      vector: queryEmbedding,
      limit: topK,
      filter: { must: filterClauses },
      with_payload: true,
      score_threshold: 0.3,
    });

    const mapped = results.map((r) => ({
      text: r.payload.text,
      sourceId: r.payload.sourceId,
      sourceTitle: r.payload.sourceTitle,
      sourceType: r.payload.sourceType,
      chunkIndex: r.payload.chunkIndex,
      startTime: r.payload.startTime ?? null,
      endTime: r.payload.endTime ?? null,
      pageNumber: r.payload.pageNumber ?? null,
      sectionTitle: r.payload.sectionTitle ?? null,
      relevance: r.score,
      semanticScore: r.score,
    }));

    logger.info('Semantic search complete', {
      workspaceId,
      returnedCount: mapped.length,
      durationMs: Date.now() - startMs,
    });

    return mapped;
  }

  /**
   * Search within a specific source using hybrid search.
   *
   * @param {string} workspaceId
   * @param {string} sourceId
   * @param {string} query
   * @param {number} topK
   * @returns {Promise<Array>}
   */
  async searchBySource(workspaceId, sourceId, query, topK = 10) {
    return this.hybridSearch(workspaceId, query, {
      topK,
      sourceIds: [sourceId],
    });
  }

  /**
   * Retrieve chunks from a specific source within a time range.
   *
   * @param {string} workspaceId
   * @param {string} sourceId
   * @param {number} startTime  Seconds
   * @param {number} endTime    Seconds
   * @returns {Promise<Array>}
   */
  async searchByTimeRange(workspaceId, sourceId, startTime, endTime) {
    const startMs = Date.now();

    const results = await this.qdrantClient.scroll(WORKSPACE_COLLECTION, {
      filter: {
        must: [
          { key: 'workspaceId', match: { value: workspaceId } },
          { key: 'sourceId', match: { value: sourceId } },
          { key: 'startTime', range: { lte: endTime } },
          { key: 'endTime', range: { gte: startTime } },
        ],
      },
      with_payload: true,
      limit: 100,
    });

    const mapped = (results.points || []).map((r) => ({
      text: r.payload.text,
      sourceId: r.payload.sourceId,
      sourceTitle: r.payload.sourceTitle,
      sourceType: r.payload.sourceType,
      chunkIndex: r.payload.chunkIndex,
      startTime: r.payload.startTime,
      endTime: r.payload.endTime,
      pageNumber: r.payload.pageNumber ?? null,
      sectionTitle: r.payload.sectionTitle ?? null,
    }));

    // Sort by chunkIndex for chronological order
    mapped.sort((a, b) => a.chunkIndex - b.chunkIndex);

    logger.info('Time-range search complete', {
      workspaceId,
      sourceId,
      startTime,
      endTime,
      returnedCount: mapped.length,
      durationMs: Date.now() - startMs,
    });

    return mapped;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Calculate BM25 scores for Qdrant results against query terms.
   * Uses k1=1.5, b=0.75 following the Okapi BM25 formula.
   *
   * @param {Array} results   Qdrant search results with payload.text
   * @param {string[]} queryTerms  Lowercased query tokens (len > 2)
   * @returns {Array<{ resultIndex: number, bm25Score: number }>}
   */
  _calculateBm25Scores(results, queryTerms) {
    if (!queryTerms.length) {
      return results.map((_, i) => ({ resultIndex: i, bm25Score: 0 }));
    }

    const k1 = 1.5;
    const b = 0.75;
    const N = results.length;

    // Pre-compute document lengths
    const docLengths = results.map((r) => {
      const text = (r.payload?.text || '').toLowerCase();
      return text.split(/\s+/).length;
    });
    const avgDl = docLengths.reduce((sum, l) => sum + l, 0) / (N || 1);

    // Document frequency for each query term
    const df = {};
    for (const term of queryTerms) {
      df[term] = 0;
      for (const r of results) {
        const text = (r.payload?.text || '').toLowerCase();
        if (text.includes(term)) {
          df[term] += 1;
        }
      }
    }

    return results.map((r, i) => {
      const text = (r.payload?.text || '').toLowerCase();
      const words = text.split(/\s+/);
      const dl = docLengths[i];
      let score = 0;

      for (const term of queryTerms) {
        // Term frequency
        let tf = 0;
        for (const w of words) {
          if (w.includes(term)) tf += 1;
        }
        if (tf === 0) continue;

        // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
        const idf = Math.log((N - df[term] + 0.5) / (df[term] + 0.5) + 1);

        // BM25 TF component
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDl)));

        score += idf * tfNorm;
      }

      return { resultIndex: i, bm25Score: score };
    });
  }

  /**
   * Reciprocal Rank Fusion of semantic and BM25 scores.
   *
   * @param {Array} semanticResults   Qdrant results (ordered by semantic score)
   * @param {Array<{ resultIndex: number, bm25Score: number }>} bm25Scores
   * @param {number} k  RRF constant (default 60)
   * @returns {Array} Fused results sorted by rrfScore descending
   */
  _reciprocalRankFusion(semanticResults, bm25Scores, k = 60) {
    // Semantic rank: already sorted by score descending
    const semanticRankMap = new Map();
    semanticResults.forEach((_, i) => {
      semanticRankMap.set(i, i + 1); // 1-indexed rank
    });

    // BM25 rank: sort by bm25Score descending, assign ranks
    const bm25Sorted = [...bm25Scores].sort((a, b) => b.bm25Score - a.bm25Score);
    const bm25RankMap = new Map();
    bm25Sorted.forEach((item, rank) => {
      bm25RankMap.set(item.resultIndex, rank + 1); // 1-indexed rank
    });

    // Compute RRF score for each result
    const fused = semanticResults.map((result, i) => {
      const semanticRank = semanticRankMap.get(i);
      const bm25Rank = bm25RankMap.get(i) || semanticResults.length;

      const rrfScore = 1 / (k + semanticRank) + 1 / (k + bm25Rank);

      return {
        ...result,
        payload: result.payload,
        rrfScore,
        semanticScore: result.score,
      };
    });

    fused.sort((a, b) => b.rrfScore - a.rrfScore);
    return fused;
  }

  /**
   * Enforce source diversity by capping results from any single source.
   *
   * @param {Array} results   Fused results sorted by rrfScore
   * @param {number} maxPerSource  Maximum fraction of results from one source
   * @returns {Array}
   */
  _enforceSourceDiversity(results, maxPerSource = 0.6) {
    if (!results.length) return results;

    const maxFromOne = Math.max(1, Math.ceil(results.length * maxPerSource));
    const sourceCounts = new Map();
    const diverse = [];

    for (const result of results) {
      const sid = result.payload?.sourceId;
      const count = sourceCounts.get(sid) || 0;

      if (count < maxFromOne) {
        diverse.push(result);
        sourceCounts.set(sid, count + 1);
      }
    }

    return diverse;
  }
}

export default VectorSearchService;
