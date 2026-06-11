import StudioGenerationService from '../apps/server/src/services/workspace/studioGeneration.service.js';

const text = `
  LangChain is a framework. LangChain uses chains. LangChain is cool.
  Embeddings are vectors. Embeddings model data. Embeddings map text.
  VectorStore is a DB. VectorStore stores keys. VectorStore is fast.
  Agents use tools. Agents call models.
  Tools run code. Tools query api.
  Build a prototype. Build the core. Build real system.
  SingleConcept is a lone concept.
`;

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

const allSentences = [];
const chunkSentences = text.split(/(?<=[.!?])\s+/);
for (const s of chunkSentences) {
  const trimmed = s.trim();
  if (trimmed.length >= 10) {
    allSentences.push(trimmed);
  }
}

const finalSortedConcepts = ['LangChain', 'Embeddings', 'VectorStore', 'Agents', 'Tools'];

// Step 2: Build rejectedConcepts set
const rejectedConcepts = new Set();
for (const original of allSentences) {
  const matches = original.match(/\b[A-Z][a-zA-Z0-9-']+(?:\s+[A-Z][a-zA-Z0-9-']+){0,2}\b/g) || [];
  for (const match of matches) {
    const clean = match.trim().replace(/[*_`"']/g, '').replace(/[.,:;!?()]/g, '');
    if (clean.length < 4) continue;
    const lower = clean.toLowerCase();
    if (stopWords.has(lower) || rejectedWords.has(lower)) continue;
    const subWords = lower.split(/\s+/);
    if (subWords.some(w => stopWords.has(w) || rejectedWords.has(w))) continue;

    if (!finalSortedConcepts.includes(clean)) {
      rejectedConcepts.add(clean.toLowerCase());
    }
  }
}

console.log('rejectedConcepts:', Array.from(rejectedConcepts));

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSentenceSafe = (s) => {
  const lower = s.toLowerCase();
  const hasBannedPhrase = ['integrate & connect', 'cloud infrastructure', 'prototype & deploy'].some(b => lower.includes(b));
  if (hasBannedPhrase) return false;

  // Check rejectedWords
  for (const rw of rejectedWords) {
    if (new RegExp('\\b' + escapeRegExp(rw) + '\\b', 'i').test(lower)) {
      console.log(`Sentence "${s}" rejected because of word "${rw}"`);
      return false;
    }
  }

  // Check rejectedConcepts
  for (const rc of rejectedConcepts) {
    if (lower.includes(rc)) {
      console.log(`Sentence "${s}" rejected because of concept "${rc}"`);
      return false;
    }
  }

  return true;
};

for (const s of allSentences) {
  console.log(`Sentence "${s}" safe:`, isSentenceSafe(s));
}
