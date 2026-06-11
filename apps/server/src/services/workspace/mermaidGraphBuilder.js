import logger from '../../loggers/logger.js';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'to', 'of', 'for', 'in', 'that', 'it', 'with', 'as', 'was', 'are', 'be', 'this', 'you', 'i', 'he', 'she', 'they', 'we', 'or', 'but', 'not', 'your', 'my', 'our', 'their', 'his', 'her', 'its', 'from', 'by', 'about', 'more', 'some', 'has', 'have', 'had', 'been', 'were', 'does', 'do', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'into', 'than', 'then', 'only', 'so', 'up', 'down', 'out', 'over', 'under', 'again', 'further', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'other', 'such', 'no', 'nor', 'too', 'very', 'just', 'now', 'using', 'used', 'use', 'how', 'what', 'where', 'when', 'why', 'who', 'whom', 'whose', 'which', 'this', 'these', 'those', 'each', 'concept', 'concepts', 'systems', 'system', 'process', 'data', 'details', 'key', 'main', 'important', 'core', 'technical'
]);

// Rule 1: Extended Rejected words/phrases set (Common English vocabulary)
const REJECTED_WORDS = new Set([
  'plan', 'workflow', 'real', 'bug', 'feasibility',
  'build', 'perform', 'prepare', 'time', 'trust', 'research', 'develop', 'create', 'connect', 'understand',
  'integration', 'implement', 'configure', 'setup', 'deploy', 'monitor', 'test', 'debug', 'optimize',
  'improve', 'enhance', 'evaluate', 'assess', 'review', 'check', 'verify', 'validate', 'assert', 'compile',
  'design', 'define', 'study', 'explain', 'learn', 'teach', 'building', 'developing', 'researching',
  'understanding', 'connecting', 'planning', 'creating', 'making', 'running', 'executing', 'analyzing',
  'generating', 'fetching', 'retrieving', 'searching', 'loading', 'writing', 'reading', 'processing',
  'integrating', 'implementing', 'configuring', 'deploying', 'monitoring', 'testing', 'debugging',
  'optimizing', 'improving', 'enhancing', 'evaluating', 'assessing', 'reviewing', 'checking', 'verifying',
  'validating', 'asserting', 'compiling', 'designed', 'defined', 'studied', 'explained', 'learned', 'taught',
  'integrated', 'implemented', 'configured', 'deployed', 'monitored', 'tested', 'debugged', 'optimized',
  'improved', 'enhanced', 'evaluated', 'assessed', 'reviewed', 'checked', 'verified', 'validated',
  'asserted', 'compiled', 'lecture', 'course', 'class', 'section', 'chapter', 'introduction', 'overview',
  'example', 'summary', 'notice', 'prerequisite', 'warning', 'note', 'info', 'detail', 'details',
  'concept', 'concepts', 'step', 'steps', 'phase', 'phases', 'stage', 'stages', 'goal', 'goals',
  'task', 'tasks', 'activity', 'activities', 'action', 'actions', 'work', 'practice', 'theory',
  'approach', 'method', 'methodology', 'diagram', 'diagrams', 'figure', 'figures', 'illustration',
  'table', 'tables', 'core', 'main', 'important', 'key', 'basic', 'advanced', 'simple', 'complex',
  'easy', 'hard', 'fast', 'slow', 'quick', 'rapid', 'speed', 'today', 'yesterday', 'tomorrow',
  'now', 'then', 'future', 'past', 'present', 'always', 'never', 'sometimes', 'often', 'rarely',
  'seldom', 'frequently', 'usually', 'generally', 'typically', 'normally',
  'welcome', 'let', 'lets', 'please', 'indeed', 'also', 'another', 'others', 'here', 'there',
  'everyone', 'someone', 'anyone', 'gets', 'set', 'get', 'use', 'using', 'used', 'put',
  'give', 'take', 'go', 'come', 'find', 'keep', 'start', 'stop', 'begin', 'end'
]);

// Structural/generic concepts to penalize for Root Node selection
const STRUCTURAL_WORDS = new Set([
  'workflow', 'system', 'process', 'architecture', 'architecture_diagram', 'component', 'module', 'integration',
  'framework', 'library', 'tool', 'tools', 'pipeline', 'pipelines', 'schema', 'schemas', 'data', 'information',
  'database', 'databases', 'infrastructure'
]);

// Rule 4: Allowed relationship verbs
const ALLOWED_RELATION_VERBS = new Set([
  'contains', 'uses', 'depends_on', 'retrieves', 'stores', 'calls', 'extends', 'generates'
]);

const RELATIONSHIP_VERBS_REGEX = [
  'uses', 'depends on', 'calls', 'implements', 'creates', 'queries', 'sends to',
  'receives from', 'contains', 'manages', 'configures', 'requires', 'extends',
  'part of', 'processes', 'enables', 'stores', 'runs on', 'translates to', 'interacts with',
  'connects to', 'supports', 'represents', 'produces', 'provides', 'generates', 'reads', 'writes', 'saves', 'fetches', 'queries'
];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanConcept(str) {
  return (str || '')
    .replace(/[*_`"']/g, '')
    .replace(/[.,:;!?()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRejectedWordSingle(clean) {
  if (REJECTED_WORDS.has(clean)) return true;
  
  if (clean.endsWith('ing')) {
    const base = clean.slice(0, -3);
    if (REJECTED_WORDS.has(base) || REJECTED_WORDS.has(base + 'e')) return true;
  }
  if (clean.endsWith('ed')) {
    const base = clean.slice(0, -2);
    if (REJECTED_WORDS.has(base) || REJECTED_WORDS.has(base + 'e')) return true;
  }
  if (clean.endsWith('s') && !clean.endsWith('ss')) {
    const base = clean.slice(0, -1);
    if (REJECTED_WORDS.has(base)) return true;
  }
  if (clean.endsWith('es')) {
    const base = clean.slice(0, -2);
    if (REJECTED_WORDS.has(base)) return true;
  }
  return false;
}

function isRejectedWord(concept) {
  const clean = concept.toLowerCase().trim();
  if (isRejectedWordSingle(clean)) return true;
  
  // Multi-word / sub-phrase check: reject if any word is a blacklisted word
  const subWords = clean.split(/\s+/);
  if (subWords.length > 1) {
    for (const sw of subWords) {
      if (isRejectedWordSingle(sw)) return true;
    }
  }
  return false;
}

function isValidConcept(str) {
  if (!str || str.length < 3 || str.length > 40) return false;
  if (/^\d+$/.test(str)) return false; // purely digits
  const clean = str.toLowerCase().trim();
  if (STOP_WORDS.has(clean)) return false;
  if (isRejectedWord(str)) return false;
  return true;
}

function getConceptCasingAndType(concept) {
  const trimmed = concept.trim();
  
  // Acronym (2-6 uppercase letters, optional plural 's')
  if (/^[A-Z]{2,5}s?$/.test(trimmed)) {
    return { type: 'acronym', confidence: 1.0 };
  }
  
  // PascalCase (starts with uppercase, followed by lowercase, has at least one internal uppercase)
  if (/^[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
    return { type: 'pascal', confidence: 1.0 };
  }
  
  // camelCase (starts with lowercase, has at least one internal uppercase)
  if (/^[a-z]+[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
    return { type: 'camel', confidence: 1.0 };
  }

  // Multi-word capitalized noun (e.g. "Vector Store", "Prompt Templates")
  if (/^[A-Z][a-zA-Z0-9]*(\s+[A-Z][a-zA-Z0-9]*)+$/.test(trimmed)) {
    return { type: 'multi_word_capitalized', confidence: 0.85 };
  }

  // Single capitalized word (e.g. "Agents", "Chains", "Memory", "Tools", "Embeddings")
  if (/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
    return { type: 'single_capitalized', confidence: 0.5 };
  }

  return { type: 'generic', confidence: 0.1 };
}

const KNOWN_TECH_ENTITIES = new Set([
  'langchain', 'rag', 'embeddings', 'vector store', 'retriever', 'memory', 'agents', 'prompt templates', 'tools', 'chains', 'models'
]);

function getDomainWeight(concept) {
  const clean = concept.toLowerCase().trim();
  if (KNOWN_TECH_ENTITIES.has(clean)) {
    return 5;
  }
  
  const info = getConceptCasingAndType(concept);
  if (info.type === 'acronym') {
    return 4;
  }
  if (info.type === 'pascal' || info.type === 'camel' || info.type === 'multi_word_capitalized' || info.type === 'single_capitalized') {
    return 3;
  }
  return 0;
}

function countOccurrences(text, phrase) {
  try {
    const escaped = escapeRegExp(phrase);
    const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
    return (text.match(regex) || []).length;
  } catch (err) {
    return 0;
  }
}

// Rule 5: Auto-select diagram type
function detectDiagramMode(text, matchedChunks) {
  const allTitlesAndText = (matchedChunks || []).map(c => (c.sourceTitle || '') + ' ' + (c.text || '')).join(' ').toLowerCase();
  const eduKeywords = ['lecture', 'notes', 'textbook', 'tutorial', 'study material', 'study guide'];
  const hasEduKeyword = eduKeywords.some(kw => allTitlesAndText.includes(kw));
  if (hasEduKeyword) {
    return 'concept_map'; // force mindmap mode
  }

  const textLower = text.toLowerCase();
  
  const architectureScore = (textLower.match(/\b(architecture|component|module|service|system|dependency|infrastructure|client|server|database|api|backend|frontend|microservice|layer|tier|stack)\b/g) || []).length;
  const workflowScore = (textLower.match(/\b(flow|transformation|pipeline|stage|step|process|then|next|sequence|transition|transform|procedure|workflow)\b/g) || []).length;
  
  if (architectureScore > workflowScore && architectureScore >= 2) {
    return 'architecture'; // flowchart LR
  }
  if (workflowScore > architectureScore && workflowScore >= 2) {
    return 'process_flow'; // flowchart TD
  }
  return 'concept_map'; // mindmap (educational notes default)
}

// Rule 4: Map generic/unallowed verbs to strictly allowed set
function mapToAllowedRelation(label) {
  const clean = (label || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (ALLOWED_RELATION_VERBS.has(clean)) return clean;

  const mapping = {
    'implements': 'extends',
    'inherits': 'extends',
    'queries': 'retrieves',
    'reads': 'retrieves',
    'fetches': 'retrieves',
    'gets': 'retrieves',
    'writes': 'stores',
    'saves': 'stores',
    'updates': 'stores',
    'produces': 'generates',
    'provides': 'generates',
    'creates': 'generates',
    'makes': 'generates',
    'runs_on': 'depends_on',
    'requires': 'depends_on',
    'needed_by': 'depends_on',
    'connects_to': 'uses',
    'interacts_with': 'uses',
    'related_to': 'uses',
    'related': 'uses',
    'part_of': 'contains',
    'has': 'contains',
    'sends_to': 'calls',
    'calls': 'calls',
    'invokes': 'calls'
  };

  return mapping[clean] || 'uses';
}

/**
 * Extracts pure noun concepts and metadata from the retrieved chunks.
 */
function extractConceptsAndMetadata(matchedChunks) {
  const allText = matchedChunks.map(c => c.text).join('\n');
  const candidateMetadata = new Map();
  const rawExtractedConcepts = [];

  const addCandidate = (phrase, weightType, weightValue) => {
    const cleaned = cleanConcept(phrase);
    rawExtractedConcepts.push(phrase);
    if (!isValidConcept(cleaned)) return;
    if (!candidateMetadata.has(cleaned)) {
      candidateMetadata.set(cleaned, {
        phrase: cleaned,
        weights: []
      });
    }
    candidateMetadata.get(cleaned).weights.push(weightValue);
  };

  // 1a. Markdown Headings (e.g. # Heading, ## Section, ### Sub)
  const headingRegex = /^\s*#+\s+(.+)$/gm;
  let headingMatch;
  while ((headingMatch = headingRegex.exec(allText)) !== null) {
    addCandidate(headingMatch[1], 'heading', 10.0);
  }

  // 1b. Bold headers (e.g. **Section:** or **Chapter Block**)
  const boldHeaderRegex = /^\s*\*\*(.+?)\*\*[:.]?\s*$/gm;
  let boldHeaderMatch;
  while ((boldHeaderMatch = boldHeaderRegex.exec(allText)) !== null) {
    addCandidate(boldHeaderMatch[1], 'heading', 10.0);
  }

  // 1c. Definition patterns
  const defPatterns = [
    /([A-Z][a-zA-Z0-9\s-]{2,30})\s+is\s+(?:a|an|the|defined\s+as)\s+/gi,
    /([A-Z][a-zA-Z0-9\s-]{2,30})\s+refers\s+to\s+/gi,
    /([A-Z][a-zA-Z0-9\s-]{2,30})\s+can\s+be\s+defined\s+as\s+/gi,
    /([A-Z][a-zA-Z0-9\s-]{2,30})\s+consists\s+of\s+/gi
  ];
  for (const regex of defPatterns) {
    let match;
    while ((match = regex.exec(allText)) !== null) {
      addCandidate(match[1], 'definition', 10.0);
    }
  }

  // 2. Bold text tags: **Concept**
  const boldRegex = /\*\*(.*?)\*\*/g;
  let match;
  while ((match = boldRegex.exec(allText)) !== null) {
    addCandidate(match[1], 'bold', 4.0);
  }

  // 3. Capitalized sequences (2-3 words)
  const capSeqRegex = /\b[A-Z][a-zA-Z0-9-]+\s+[A-Z][a-zA-Z0-9-]+(?:\s+[A-Z][a-zA-Z0-9-]+)?\b/g;
  while ((match = capSeqRegex.exec(allText)) !== null) {
    addCandidate(match[0], 'capSeq', 3.0);
  }

  // 4. Acronyms (e.g. RAG, LLM)
  const acronymRegex = /\b[A-Z]{2,6}\b/g;
  while ((match = acronymRegex.exec(allText)) !== null) {
    addCandidate(match[0], 'acronym', 3.0);
  }

  // 5. PascalCase
  const pascalRegex = /\b[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*\b/g;
  while ((match = pascalRegex.exec(allText)) !== null) {
    addCandidate(match[0], 'pascal', 4.5);
  }

  // 6. camelCase
  const camelRegex = /\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g;
  while ((match = camelRegex.exec(allText)) !== null) {
    addCandidate(match[0], 'camel', 4.5);
  }

  // 7. General capitalized words fallback
  const wordRegex = /\b[A-Z][a-zA-Z0-9]{2,19}\b/g;
  while ((match = wordRegex.exec(allText)) !== null) {
    addCandidate(match[0], 'fallback', 2.0);
  }

  // Perform Concept Quality Scoring & Gate Filter
  const conceptsAfterRejectFilter = Array.from(candidateMetadata.keys());

  const scoredItems = Array.from(candidateMetadata.values())
    .map(cand => {
      const phrase = cand.phrase;
      const occurrences = countOccurrences(allText, phrase);
      const frequencyScore = Math.min(1.0, occurrences / 8.0);
      
      const weights = cand.weights;
      const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
      const semanticImportance = Math.min(1.0, maxWeight / 10.0);
      
      let chunksWithConcept = 0;
      for (const chunk of matchedChunks) {
        if (chunk.text.toLowerCase().includes(phrase.toLowerCase())) {
          chunksWithConcept++;
        }
      }
      const citationCount = chunksWithConcept / matchedChunks.length;
      
      const domainWeight = getDomainWeight(phrase);
      const domainConfidence = domainWeight / 5.0;
      
      const qualityScore = (frequencyScore * 0.2) + (semanticImportance * 0.3) + (citationCount * 0.2) + (domainConfidence * 0.3);
      
      return {
        concept: phrase,
        qualityScore,
        frequencyScore,
        semanticImportance,
        citationCount,
        domainConfidence,
        occurrences
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);

  const conceptsAfterQualityScoring = scoredItems.map(item => ({
    concept: item.concept,
    qualityScore: parseFloat(item.qualityScore.toFixed(3))
  }));

  let threshold = 0.6;
  let filtered = [];
  while (threshold >= 0.35) {
    filtered = scoredItems
      .filter(item => item.qualityScore >= threshold);

    // If we have at least 12 concepts (or we ran out of candidateMetadata), we can stop relaxing
    if (filtered.length >= 12 || filtered.length === candidateMetadata.size) {
      break;
    }
    threshold -= 0.05;
  }

  // Deduplicate and take top 15 concepts
  const selectedConcepts = [];
  for (const item of filtered) {
    if (selectedConcepts.length >= 15) break;
    const isSub = selectedConcepts.some(
      s => s.toLowerCase().includes(item.concept.toLowerCase()) || 
           item.concept.toLowerCase().includes(s.toLowerCase())
    );
    if (!isSub) {
      selectedConcepts.push(item.concept);
    }
  }

  logger.info('[Mermaid V6 Diagnostics] Concept Extraction Pipeline:', {
    rawExtractedConcepts,
    conceptsAfterRejectFilter,
    conceptsAfterQualityScoring,
    finalSelectedConcepts: selectedConcepts
  });

  // Map to nodes with citation metadata
  const nodes = selectedConcepts.map((concept, index) => {
    const primaryChunk = matchedChunks.find(c => 
      c.text.toLowerCase().includes(concept.toLowerCase())
    ) || matchedChunks[0];

    const text = primaryChunk.text;
    const idx = text.toLowerCase().indexOf(concept.toLowerCase());
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + concept.length + 60);
    const chunkPreview = text.substring(start, end).trim() + (end < text.length ? '...' : '');

    const sourceIdsSet = new Set(
      matchedChunks
        .filter(c => c.text.toLowerCase().includes(concept.toLowerCase()))
        .map(c => c.sourceId)
    );

    return {
      id: `N${index}`,
      label: concept,
      sourceTitle: primaryChunk.sourceTitle || 'Unknown Source',
      pageNumber: primaryChunk.pageNumber || null,
      chunkIndex: primaryChunk.chunkIndex ?? null,
      chunkId: primaryChunk.chunkId || primaryChunk.id || (primaryChunk.chunkIndex !== null ? `chunk_${primaryChunk.chunkIndex}` : 'unknown'),
      chunkPreview,
      citation: text,
      firstSeenIdx: primaryChunk.chunkIndex ?? 9999,
      citationCount: countOccurrences(allText, concept),
      sourceCount: Math.max(1, sourceIdsSet.size)
    };
  });

  return nodes;
}

/**
 * Builds the Concept Co-occurrence Graph and calculates degree centrality.
 */
function buildCooccurrenceGraph(nodes, matchedChunks) {
  const allText = matchedChunks.map(c => c.text).join('\n');
  const sentences = allText.split(/(?<=[.!?])\s+/);

  const coocMatrix = {};
  for (const node of nodes) {
    coocMatrix[node.id] = {};
    for (const other of nodes) {
      coocMatrix[node.id][other.id] = 0;
    }
  }

  for (const sentence of sentences) {
    const textLower = sentence.toLowerCase();
    const presentNodeIds = [];
    for (const node of nodes) {
      if (textLower.includes(node.label.toLowerCase())) {
        presentNodeIds.push(node.id);
      }
    }
    // Increment weights
    for (let i = 0; i < presentNodeIds.length; i++) {
      for (let j = i + 1; j < presentNodeIds.length; j++) {
        const idA = presentNodeIds[i];
        const idB = presentNodeIds[j];
        coocMatrix[idA][idB] += 1.0;
        coocMatrix[idB][idA] += 1.0;
      }
    }
  }

  // Extract major headings from matchedChunks text
  const headings = [];
  const headingRegex = /^\s*#+\s+(.+)$/gm;
  const boldHeaderRegex = /^\s*\*\*(.+?)\*\*[:.]?\s*$/gm;
  for (const chunk of matchedChunks) {
    if (chunk.text) {
      let m;
      headingRegex.lastIndex = 0;
      while ((m = headingRegex.exec(chunk.text)) !== null) {
        headings.push(m[1].toLowerCase().trim());
      }
      boldHeaderRegex.lastIndex = 0;
      while ((m = boldHeaderRegex.exec(chunk.text)) !== null) {
        headings.push(m[1].toLowerCase().trim());
      }
    }
  }

  // Calculate degree centrality (weight centrality) and rootCentrality (penalizing structural concepts and boosting title concepts)
  const centrality = {};
  const rootCentrality = {};
  for (const node of nodes) {
    let sum = 0;
    for (const other of nodes) {
      sum += coocMatrix[node.id][other.id];
    }
    // Add small frequency boost to resolve ties (cap boost at 0.25)
    const val = sum + Math.min(0.25, node.citationCount * 0.1);
    centrality[node.id] = val;

    // Root selection centrality calculation
    let rootVal = val;
    const cleanLabel = node.label.toLowerCase().trim();

    // 1. Authority boost if the concept matches words in the sourceTitle
    let inTitle = false;
    for (const chunk of matchedChunks) {
      if (chunk.sourceTitle && chunk.sourceTitle.toLowerCase().includes(cleanLabel)) {
        inTitle = true;
        break;
      }
    }
    if (inTitle) {
      rootVal += 10.0;
    }

    // 2. Structural penalty
    if (STRUCTURAL_WORDS.has(cleanLabel)) {
      rootVal *= 0.1;
    }

    // 3. Root Node Verification:
    // If the root candidate concept is not found in document titles, source titles, or extracted major headings, apply a 50% penalty to its root selection centrality.
    let foundInTitlesOrHeadings = false;
    for (const chunk of matchedChunks) {
      if (chunk.sourceTitle && chunk.sourceTitle.toLowerCase().includes(cleanLabel)) {
        foundInTitlesOrHeadings = true;
        break;
      }
    }
    if (!foundInTitlesOrHeadings) {
      for (const heading of headings) {
        if (heading.includes(cleanLabel) || cleanLabel.includes(heading)) {
          foundInTitlesOrHeadings = true;
          break;
        }
      }
    }
    if (!foundInTitlesOrHeadings) {
      rootVal *= 0.5;
    }

    rootCentrality[node.id] = rootVal;
  }

  return { coocMatrix, centrality, rootCentrality };
}

/**
 * Assigns parent connections and levels deterministically (capping depth to 4 levels)
 */
function assignHierarchyAndClustering(nodes, coocMatrix, centrality, rootCentrality) {
  if (nodes.length === 0) return { rootNode: null, levels: {}, parents: {}, hierarchyDepth: 0 };

  // Sort nodes by rootCentrality descending to select root node
  const sortedNodes = [...nodes].sort((a, b) => rootCentrality[b.id] - rootCentrality[a.id]);
  const rootNode = sortedNodes[0];

  const rootCandidateScores = sortedNodes.map(n => ({
    concept: n.label,
    id: n.id,
    rootCentrality: parseFloat(rootCentrality[n.id].toFixed(3)),
    centrality: parseFloat(centrality[n.id].toFixed(3))
  }));

  logger.info('[Mermaid V6 Diagnostics] Root Candidate Scores:', {
    rootCandidateScores
  });

  const levels = {};
  const parents = {};

  // Level 1: Root Concept
  levels[rootNode.id] = 1;
  parents[rootNode.id] = null;

  // Level 2: Major Concept Groups (Neighbors of Root with highest co-occurrence)
  const rootNeighbors = nodes
    .filter(n => n.id !== rootNode.id)
    .map(n => ({ id: n.id, weight: coocMatrix[rootNode.id][n.id] }))
    .sort((a, b) => b.weight - a.weight);

  const level2Count = Math.min(4, Math.max(2, Math.floor(nodes.length * 0.3)));
  const level2Ids = new Set();
  for (let i = 0; i < level2Count && i < rootNeighbors.length; i++) {
    const id = rootNeighbors[i].id;
    levels[id] = 2;
    parents[id] = rootNode.id;
    level2Ids.add(id);
  }

  // Remaining nodes to place at Level 3 or 4
  const remaining = nodes.filter(n => n.id !== rootNode.id && !level2Ids.has(n.id));

  // Determine Level 3 nodes (Sub Concepts)
  const level3Ids = new Set();
  for (const node of remaining) {
    let bestL2Id = null;
    let bestL2Weight = -1;

    for (const l2Id of level2Ids) {
      const w = coocMatrix[node.id][l2Id];
      if (w > bestL2Weight) {
        bestL2Weight = w;
        bestL2Id = l2Id;
      }
    }

    const rootW = coocMatrix[node.id][rootNode.id];
    if (rootW > bestL2Weight && rootW > 0 && level2Ids.size < 4) {
      levels[node.id] = 2;
      parents[node.id] = rootNode.id;
      level2Ids.add(node.id);
    } else if (bestL2Id) {
      levels[node.id] = 3;
      parents[node.id] = bestL2Id;
      level3Ids.add(node.id);
    } else {
      // Fallback
      levels[node.id] = 2;
      parents[node.id] = rootNode.id;
      level2Ids.add(node.id);
    }
  }

  // Level 4 (Details): Nodes linking strongly to Level 3 nodes rather than Level 2 parents
  for (const id3 of level3Ids) {
    const parentId = parents[id3];
    const parentW = coocMatrix[id3][parentId];

    let bestL3Id = null;
    let bestL3Weight = -1;
    for (const otherL3Id of level3Ids) {
      if (otherL3Id !== id3) {
        const w = coocMatrix[id3][otherL3Id];
        if (w > bestL3Weight) {
          bestL3Weight = w;
          bestL3Id = otherL3Id;
        }
      }
    }

    if (bestL3Weight > parentW * 1.6 && bestL3Weight > 1.5) {
      if (parents[bestL3Id] !== id3) {
        levels[id3] = 4;
        parents[id3] = bestL3Id;
        level3Ids.delete(id3);
      }
    }
  }

  // Calculate hierarchyDepth
  const maxDepth = Math.max(...Object.values(levels));

  return { rootNode, levels, parents, hierarchyDepth: maxDepth };
}

/**
 * Extracts relationship connections at the sentence/chunk level.
 */
function extractRelationships(nodes, matchedChunks) {
  const allText = matchedChunks.map(c => c.text).join('\n');
  const sentences = allText.split(/(?<=[.!?])\s+/);
  const edges = [];
  let edgeIdCounter = 0;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];
      
      let relationFound = false;

      for (const sentence of sentences) {
        const hasA = sentence.toLowerCase().includes(nodeA.label.toLowerCase());
        const hasB = sentence.toLowerCase().includes(nodeB.label.toLowerCase());

        if (hasA && hasB) {
          let matchedVerb = null;
          for (const verb of RELATIONSHIP_VERBS_REGEX) {
            const escA = escapeRegExp(nodeA.label);
            const escB = escapeRegExp(nodeB.label);

            const regexForward = new RegExp('\\b' + escA + '\\b[\\s\\S]{1,60}?\\b(' + escapeRegExp(verb) + ')\\b[\\s\\S]{1,60}?\\b' + escB + '\\b', 'i');
            const regexBackward = new RegExp('\\b' + escB + '\\b[\\s\\S]{1,60}?\\b(' + escapeRegExp(verb) + ')\\b[\\s\\S]{1,60}?\\b' + escA + '\\b', 'i');

            if (regexForward.test(sentence)) {
              matchedVerb = { verb, direction: 'forward' };
              break;
            } else if (regexBackward.test(sentence)) {
              matchedVerb = { verb, direction: 'backward' };
              break;
            }
          }

          if (matchedVerb) {
            edges.push({
              id: `E${edgeIdCounter++}`,
              source: matchedVerb.direction === 'forward' ? nodeA.id : nodeB.id,
              target: matchedVerb.direction === 'forward' ? nodeB.id : nodeA.id,
              label: mapToAllowedRelation(matchedVerb.verb), // Rule 4: Map strictly to allowed verbs
              confidence: 1.0,
              isTreeEdge: false
            });
            relationFound = true;
            break;
          }
        }
      }

      if (!relationFound) {
        const sentenceCooc = sentences.some(s => 
          s.toLowerCase().includes(nodeA.label.toLowerCase()) && 
          s.toLowerCase().includes(nodeB.label.toLowerCase())
        );

        if (sentenceCooc) {
          edges.push({
            id: `E${edgeIdCounter++}`,
            source: nodeA.id,
            target: nodeB.id,
            label: 'uses', // Banned related_to fallback to uses
            confidence: 0.5,
            isTreeEdge: false
          });
          relationFound = true;
        }
      }

      if (!relationFound) {
        const chunkCooc = matchedChunks.some(c => 
          c.text.toLowerCase().includes(nodeA.label.toLowerCase()) && 
          c.text.toLowerCase().includes(nodeB.label.toLowerCase())
        );

        if (chunkCooc) {
          edges.push({
            id: `E${edgeIdCounter++}`,
            source: nodeA.id,
            target: nodeB.id,
            label: 'uses', // Banned related_to fallback to uses
            confidence: 0.25,
            isTreeEdge: false
          });
        }
      }
    }
  }

  return edges;
}

/**
 * Refines low-confidence relationship labels using Gemini Flash and maps to allowed verbs.
 */
async function refineRelationshipsWithLLM(edges, nodes, matchedChunks, geminiFlash) {
  if (!geminiFlash) return edges;

  const lowConfidence = edges.filter(e => e.confidence < 0.35);
  if (lowConfidence.length === 0) return edges;

  const targetEdges = lowConfidence.slice(0, 6);
  const nodesMap = new Map(nodes.map(n => [n.id, n.label]));

  const edgeListStr = targetEdges.map((e, idx) => 
    `${idx + 1}. "${nodesMap.get(e.source)}" and "${nodesMap.get(e.target)}"`
  ).join('\n');

  const contextText = matchedChunks.slice(0, 4).map(c => c.text).join('\n\n');
  const prompt = `You are a high-speed relationship extractor. Given the context, label the relationship between these concept pairs using ONLY one of these allowed verbs: contains, uses, depends_on, retrieves, stores, calls, extends, generates.
Do NOT use any other labels.

Context:
${contextText.substring(0, 2000)}

Concept Pairs to Label:
${edgeListStr}

Return JSON array only:
[
  {"source": "Concept A", "target": "Concept B", "label": "one of: contains, uses, depends_on, retrieves, stores, calls, extends, generates"},
  ...
]`;

  try {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('LLM relationship refinement timed out (1000ms limit)')), 1000);
    });
    
    const apiCall = geminiFlash.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 250,
        responseMimeType: 'application/json' 
      }
    });

    const response = await Promise.race([apiCall, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
    const text = response.response?.text().trim() || '';
    
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const edge = targetEdges.find(e => {
          const sLabel = nodesMap.get(e.source).toLowerCase();
          const tLabel = nodesMap.get(e.target).toLowerCase();
          const pSource = (item.source || '').toLowerCase();
          const pTarget = (item.target || '').toLowerCase();
          return (sLabel === pSource && tLabel === pTarget) || (sLabel === pTarget && tLabel === pSource);
        });

        if (edge && item.label) {
          edge.label = mapToAllowedRelation(item.label);
          edge.confidence = 0.95;
        }
      }
    }
  } catch (err) {
    logger.warn('[MermaidBuilder V3] LLM relationship label refinement skipped/timed out', {
      error: err.message
    });
  }

  return edges;
}

/**
 * Calculates node importance score (0.0 to 1.0) based on centrality, sources, and citations.
 */
function calculateImportanceScores(nodes, centrality, totalSources) {
  const maxCentrality = Math.max(...Object.values(centrality)) || 1.0;
  const maxCitations = Math.max(...nodes.map(n => n.citationCount)) || 1.0;

  for (const node of nodes) {
    const normCentrality = centrality[node.id] / maxCentrality;
    const normCitations = node.citationCount / maxCitations;
    const normSources = node.sourceCount / Math.max(1, totalSources);
    
    // Weight centrality 50%, citations 30%, sources 20%
    const score = (normCentrality * 0.5) + (normCitations * 0.3) + (normSourcedWeight(normSources) * 0.2);
    node.importanceScore = parseFloat(score.toFixed(3));
  }
}

function normSourcedWeight(norm) {
  return isNaN(norm) ? 0 : norm;
}

/**
 * Evaluates Complexity Metrics and applies Quality Gates.
 * Discards lowest confidence relationship edges if threshold exceeded (Rules 2, 6, 7).
 */
function enforceComplexityGate(nodes, edges, parents, hierarchyDepth) {
  const treeEdgesCount = nodes.length - 1; // n-1 tree edges for root tree
  const maxTotalEdges = 20; // Rule 3: Max 20 edges
  
  // Exclude tree connections from pruning list
  let crossEdges = edges.filter(e => !e.isTreeEdge);
  
  let crossingRisk = crossEdges.length / nodes.length;

  // Gate Check
  if (crossingRisk > 0.4 || (nodes.length - 1 + crossEdges.length) > maxTotalEdges || hierarchyDepth > 5) {
    // Sort cross edges by confidence descending
    crossEdges.sort((a, b) => b.confidence - a.confidence);
    
    // Calculate allowed cross edges count to satisfy risk <= 0.4 and total edges <= 20
    const allowedByRisk = Math.floor(nodes.length * 0.4);
    const allowedByTotal = maxTotalEdges - treeEdgesCount;
    const finalCrossCount = Math.min(allowedByRisk, allowedByTotal);
    
    crossEdges = crossEdges.slice(0, Math.max(0, finalCrossCount));
    crossingRisk = crossEdges.length / nodes.length;
  }

  // Build final edge list holding both tree edges and filtered cross edges
  const finalEdges = [];
  
  // Add tree hierarchy edges
  let edgeCounter = 0;
  for (const node of nodes) {
    const parentId = parents[node.id];
    if (parentId) {
      finalEdges.push({
        id: `tree-E${edgeCounter++}`,
        source: parentId,
        target: node.id,
        label: 'contains',
        confidence: 1.0,
        isTreeEdge: true
      });
    }
  }

  // Add cross edges
  for (const cross of crossEdges) {
    finalEdges.push({
      ...cross,
      id: `cross-E${edgeCounter++}`
    });
  }

  return {
    finalEdges,
    complexity: {
      nodeCount: nodes.length,
      edgeCount: finalEdges.length,
      hierarchyDepth,
      crossingRisk: parseFloat(crossingRisk.toFixed(3)),
      clusterCount: nodes.filter(n => parents[n.id] === nodes[0].id).length
    }
  };
}

/**
 * Serializes the graph nodes and simplified edges to Mermaid text syntax.
 */
function serializeToMermaid(nodes, edges, mode, parents, levels) {
  let mermaidStr = '';
  const sanitize = (lbl) => (lbl || '').replace(/["'(){}[\];]/g, '').trim();

  // Root Visual Highlight Styling
  const styles = [];
  for (const n of nodes) {
    const score = n.importanceScore;
    if (score >= 0.7) {
      styles.push(`  style ${n.id} fill:#1e1b4b,stroke:#818cf8,stroke-width:3px,color:#a5b4fc`);
    } else if (score >= 0.4) {
      styles.push(`  style ${n.id} fill:#111827,stroke:#6366f1,stroke-width:2px,color:#c7d2fe`);
    } else if (score >= 0.2) {
      styles.push(`  style ${n.id} fill:#0f172a,stroke:#4b5563,stroke-width:1px,color:#cbd5e1`);
    } else {
      styles.push(`  style ${n.id} fill:#030712,stroke:#374151,stroke-width:1px,color:#9ca3af`);
    }
  }

  if (mode === 'mindmap') {
    mermaidStr += 'mindmap\n';
    
    const rootNode = nodes[0];
    mermaidStr += `  root(("${sanitize(rootNode.label)}"))\n`;
    
    // Recurse hierarchy levels to print nested indentation
    const l2Nodes = nodes.filter(n => parents[n.id] === rootNode.id);
    for (const l2 of l2Nodes) {
      mermaidStr += `    ${l2.id}("${sanitize(l2.label)}")\n`;
      const l3Nodes = nodes.filter(n => parents[n.id] === l2.id);
      for (const l3 of l3Nodes) {
        mermaidStr += `      ${l3.id}["${sanitize(l3.label)}"]\n`;
        const l4Nodes = nodes.filter(n => parents[n.id] === l3.id);
        for (const l4 of l4Nodes) {
          mermaidStr += `        ${l4.id}("${sanitize(l4.label)}")\n`;
        }
      }
    }
  } else {
    // Flowchart LR or flowchart TD
    const orientation = mode === 'architecture' ? 'LR' : 'TD';
    mermaidStr += `flowchart ${orientation}\n`;

    // Write nodes with shape based on Level
    for (const n of nodes) {
      const lvl = levels[n.id] || 4;
      if (lvl === 1) {
        mermaidStr += `  ${n.id}(("${sanitize(n.label)}"))\n`;
      } else if (lvl === 2) {
        mermaidStr += `  ${n.id}("${sanitize(n.label)}")\n`;
      } else {
        mermaidStr += `  ${n.id}["${sanitize(n.label)}"]\n`;
      }
    }

    // Write edges
    for (const edge of edges) {
      if (edge.isTreeEdge) {
        // Thick arrow for hierarchical spanning tree relationships
        mermaidStr += `  ${edge.source} == contains ==> ${edge.target}\n`;
      } else {
        // Dotted/normal arrows with action verb labels for relationships
        mermaidStr += `  ${edge.source} -->|${edge.label}| ${edge.target}\n`;
      }
    }

    // Inject styles
    if (styles.length > 0) {
      mermaidStr += '\n' + styles.join('\n') + '\n';
    }
  }

  return mermaidStr;
}

/**
 * Main orchestration entrypoint to build the Mermaid Knowledge Graph V3.
 */
export async function buildMermaidDiagram(matchedChunks, geminiFlash) {
  const allText = matchedChunks.map(c => c.text).join('\n');
  const uniqueSources = new Set(matchedChunks.map(c => c.sourceId)).size;
  
  // Mode detection
  const detectedMode = detectDiagramMode(allText, matchedChunks);

  // 1. Concept extraction
  const nodes = extractConceptsAndMetadata(matchedChunks);

  if (nodes.length === 0) {
    return { mermaid: 'Unable to construct a high-confidence concept map.', metadata: { nodes: {}, stats: { nodesCount: 0, edgesCount: 0, sourcesCount: 0 }, mode: 'concept_map' } };
  }

  // 2. Co-occurrence mapping & Centrality calculation
  const { coocMatrix, centrality, rootCentrality } = buildCooccurrenceGraph(nodes, matchedChunks);

  // 3. Parental level clustering
  const { rootNode, levels, parents, hierarchyDepth } = assignHierarchyAndClustering(nodes, coocMatrix, centrality, rootCentrality);

  // 4. Calculate importance values
  calculateImportanceScores(nodes, centrality, uniqueSources);

  // Final Quality Gate Check
  const rootLabelLower = rootNode.label.toLowerCase();
  const rootCasing = getConceptCasingAndType(rootNode.label);
  const isRootGeneric = REJECTED_WORDS.has(rootLabelLower) || 
                        STRUCTURAL_WORDS.has(rootLabelLower) || 
                        rootCasing.confidence < 0.5;

  const genericNounsCount = nodes.filter(n => getDomainWeight(n.label) === 0).length;
  const genericNounsRatio = genericNounsCount / nodes.length;
  const genericRatioExceeded = genericNounsRatio > 0.20;

  const rootImportance = rootNode.importanceScore;
  const rootConfidenceLow = rootImportance < 0.7;

  if (isRootGeneric || genericRatioExceeded || rootConfidenceLow) {
    logger.warn('[Mermaid V6 Quality Gate] Diagram rejected:', {
      isRootGeneric,
      rootConcept: rootNode.label,
      rootCasingConfidence: rootCasing.confidence,
      genericNounsRatio,
      rootImportance
    });
    return {
      mermaid: "Unable to construct a high-confidence concept map.",
      metadata: {
        nodes: {},
        stats: {
          nodesCount: 0,
          edgesCount: 0,
          sourcesCount: uniqueSources,
          conceptsCount: 0
        },
        complexity: {
          nodeCount: 0,
          edgeCount: 0,
          hierarchyDepth: 0,
          crossingRisk: 0,
          clusterCount: 0
        },
        mode: 'concept_map'
      }
    };
  }

  // 5. Relationship Extraction
  let edges = extractRelationships(nodes, matchedChunks);

  // 6. Relationship label refinement using Gemini
  edges = await refineRelationshipsWithLLM(edges, nodes, matchedChunks, geminiFlash);

  // 7. Complexity metrics assessment and cross-edge gate pruning
  const { finalEdges, complexity } = enforceComplexityGate(nodes, edges, parents, hierarchyDepth);

  // 8. Convert mode indicator to mindmap if concept_map (educational default)
  const mode = detectedMode === 'concept_map' ? 'mindmap' : detectedMode;

  // 9. Serialize graph syntax
  const mermaidSyntax = serializeToMermaid(nodes, finalEdges, mode, parents, levels);

  // Map metadata
  const nodeMetadataMap = {};
  for (const n of nodes) {
    nodeMetadataMap[n.id] = {
      concept: n.label,
      sourceTitle: n.sourceTitle,
      pageNumber: n.pageNumber,
      chunkId: n.chunkId,
      chunkPreview: n.chunkPreview,
      citation: n.citation,
      importanceScore: n.importanceScore,
      sourceCount: n.sourceCount,
      citationCount: n.citationCount
    };
  }

  return {
    mermaid: mermaidSyntax.trim(),
    metadata: {
      nodes: nodeMetadataMap,
      stats: {
        nodesCount: nodes.length,
        edgesCount: finalEdges.length,
        sourcesCount: uniqueSources,
        conceptsCount: nodes.length
      },
      complexity,
      mode
    }
  };
}
