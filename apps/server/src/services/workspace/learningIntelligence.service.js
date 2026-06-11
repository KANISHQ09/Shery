import logger from '../../loggers/logger.js';

class LearningIntelligenceService {
  constructor({
    sourceGraphService,
    workspaceChatRepository,
    workspaceMemoryRepository,
  }) {
    this.sourceGraphService = sourceGraphService;
    this.chatRepo = workspaceChatRepository;
    this.memoryRepo = workspaceMemoryRepository;
  }

  /**
   * Evaluates learning performance and estimated concept mastery
   * @param {string} workspaceId 
   * @returns {Promise<Object>} Mastery report
   */
  async getLearningIntelligence(workspaceId) {
    const startMs = Date.now();

    // 1. Fetch graph details (for total concept clusters & mappings)
    const graph = await this.sourceGraphService.buildGraph(workspaceId);
    const clusters = graph.clusters || [];
    const relationships = graph.relationships || [];
    
    // 2. Fetch memory doc
    const memory = await this.memoryRepo.getOrCreate(workspaceId);
    const revisionHistory = memory.revisionHistory || [];
    const frequentConcepts = memory.frequentConcepts || [];

    // 3. Fetch chat history to extract queries and active discussions
    const chats = await this.chatRepo.findByWorkspace(workspaceId);
    const chatQueries = [];
    chats.forEach(c => {
      const messages = c.messages || [];
      messages.forEach(m => {
        if (m.role === 'user') chatQueries.push(m.content.toLowerCase());
      });
    });

    // 4. Estimate Concept Mastery percentages or load from learningGraph
    const learningGraph = memory.learningGraph || [];
    const estimatedMastery = clusters.map(cluster => {
      const clusterConcepts = new Set(cluster.concepts.map(c => c.toLowerCase()));
      const graphNode = learningGraph.find(n => n.concept.toLowerCase() === cluster.name.toLowerCase());
      
      let score = 10;
      let queryHits = 0;
      
      if (graphNode) {
        score = graphNode.masteryScore;
        queryHits = graphNode.lastDiscussed ? 1 : 0;
      } else {
        // Fallback estimation
        let localHits = 0;
        chatQueries.forEach(query => {
          clusterConcepts.forEach(concept => {
            if (query.includes(concept)) localHits++;
          });
        });
        queryHits = localHits;
        const frequencyWeight = frequentConcepts.find(f => clusterConcepts.has(f.term?.toLowerCase()))?.count || 0;
        score = Math.min(100, Math.round((queryHits * 15) + (frequencyWeight * 10) + 15));
      }

      return {
        clusterName: cluster.name,
        masteryLevel: score,
        status: score >= 75 ? 'Mastered' : score > 10 ? 'Learning' : 'Unexplored',
        concepts: cluster.concepts,
        queryHits,
      };
    });

    // 5. Detect Prerequisite Gaps
    const prerequisiteGaps = [];
    const activeTopics = estimatedMastery.filter(e => e.queryHits > 0 || e.masteryLevel > 10);
    
    for (const active of activeTopics) {
      const graphNode = learningGraph.find(n => n.concept.toLowerCase() === active.clusterName.toLowerCase());
      const basicPrereqs = graphNode ? graphNode.prerequisites : this._getPrerequisitesFor(active.clusterName);
      
      for (const basic of basicPrereqs) {
        const basicStatus = estimatedMastery.find(e => e.clusterName.toLowerCase() === basic.toLowerCase());
        if (!basicStatus || basicStatus.masteryLevel < 40) {
          prerequisiteGaps.push({
            topic: active.clusterName,
            missingPrerequisite: basic,
            impact: 'High',
            recommendation: `Ask questions covering "${basic}" or study introductory materials to build the foundations required for "${active.clusterName}".`
          });
        }
      }
    }

    // 6. Generate Adaptive Tutoring Suggestions
    const suggestions = [];
    if (estimatedMastery.length === 0) {
      suggestions.push({
        type: 'get_started',
        text: 'Welcome to your smart workspace! Upload course transcripts, PDFs or technical docs to start mapping your concept graph.',
        action: 'Upload Sources'
      });
    } else {
      // Find weakest explored topic
      const learningTopics = estimatedMastery.filter(e => e.status === 'Learning');
      if (learningTopics.length > 0) {
        const weakest = learningTopics.sort((a, b) => a.masteryLevel - b.masteryLevel)[0];
        suggestions.push({
          type: 'weak_topic',
          text: `You have been exploring "${weakest.clusterName}" (Mastery: ${weakest.masteryLevel}%), but your active source grounding remains weak. Would you like a grounded overview?`,
          action: `Study ${weakest.clusterName}`,
          topic: weakest.clusterName
        });
      }

      // Check unexplored topics
      const unexplored = estimatedMastery.filter(e => e.status === 'Unexplored');
      if (unexplored.length > 0) {
        suggestions.push({
          type: 'expansion',
          text: `You have highly reliable material covering "${unexplored[0].clusterName}", but you have not active discussed these concepts. Ready to connect them to what you know?`,
          action: `Examine ${unexplored[0].clusterName}`,
          topic: unexplored[0].clusterName
        });
      }
    }

    logger.info('Learning intelligence profiling complete', {
      workspaceId,
      masteryMapped: estimatedMastery.length,
      gapsFound: prerequisiteGaps.length,
      durationMs: Date.now() - startMs
    });

    return {
      mastery: estimatedMastery.sort((a, b) => b.masteryLevel - a.masteryLevel),
      gaps: prerequisiteGaps,
      suggestions,
      metrics: {
        conceptsMastered: estimatedMastery.filter(e => e.status === 'Mastered').length,
        conceptsLearning: estimatedMastery.filter(e => e.status === 'Learning').length,
        conceptsUnexplored: estimatedMastery.filter(e => e.status === 'Unexplored').length,
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Private helper utilities
  // ---------------------------------------------------------------------------

  _isAdvancedTopic(topic) {
    const adv = ['embedding', 'vector', 'agent', 'rag', 'chain', 'retrieval', 'llm', 'inference', 'optimization', 'architecture'];
    return adv.some(term => topic.toLowerCase().includes(term));
  }

  _getPrerequisitesFor(topic) {
    const t = topic.toLowerCase();
    const map = {
      'embedding': ['tokens', 'text analysis', 'vectors'],
      'vector': ['similarity', 'coordinates', 'indexing'],
      'rag': ['embedding', 'retrieval', 'prompts'],
      'agent': ['rag', 'chaining', 'memory', 'planning'],
      'chain': ['prompts', 'llm settings'],
      'retrieval': ['similarity', 'search indexes', 'grounding']
    };

    for (const key of Object.keys(map)) {
      if (t.includes(key)) return map[key];
    }
    return [];
  }
}

export default LearningIntelligenceService;
