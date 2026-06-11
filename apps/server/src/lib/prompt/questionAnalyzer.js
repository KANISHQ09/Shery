/**
 * SHERYAI QUESTION ANALYZER
 *
 * Synchronous intent classifier and learning-level detector.
 * Runs before prompt construction to enable adaptive response generation.
 * No I/O, no async — pure heuristics on the question string + chat history.
 */

// ---------------------------------------------------------------------------
// Intent type constants
// ---------------------------------------------------------------------------
export const INTENT_TYPES = {
  CONCEPT_UNDERSTANDING: 'concept_understanding',
  HOW_IT_WORKS:         'how_it_works',
  COMPARISON:           'comparison',
  EXAM_PREP:            'exam_prep',
  INTERVIEW_PREP:       'interview_prep',
  IMPLEMENTATION:       'implementation',
  TROUBLESHOOTING:      'troubleshooting',
  RESEARCH:             'research',
  SUMMARY:              'summary',
  DEEP_DIVE:            'deep_dive',
  PRACTICAL_APPLICATION:'practical_application',
  CORE_INTUITION:       'core_intuition',
};

// ---------------------------------------------------------------------------
// Learning level constants
// ---------------------------------------------------------------------------
export const LEVEL_LABELS = {
  BEGINNER:     'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED:     'advanced',
};

// ---------------------------------------------------------------------------
// Intent pattern table
// Each entry: { intent, patterns: RegExp[], weight }
// Higher weight wins when multiple patterns match
// ---------------------------------------------------------------------------
const INTENT_PATTERNS = [
  {
    intent: INTENT_TYPES.CORE_INTUITION,
    weight: 10,
    patterns: [
      /\b(intuition|intuitive|eli5|simple terms|simply put|like what|analogy|metaphor|in plain english|layman)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.CONCEPT_UNDERSTANDING,
    weight: 6,
    patterns: [
      /^(what is|what are|what does|what do|define|definition of|explain what|tell me about|describe)\b/i,
      /\b(what is|what are)\b.{3,60}\?/i,
    ],
  },
  {
    intent: INTENT_TYPES.HOW_IT_WORKS,
    weight: 7,
    patterns: [
      /^how does|^how do|^how is|^how are/i,
      /\b(how does|how do|how is|mechanism|under the hood|internally|works internally|works behind)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.COMPARISON,
    weight: 8,
    patterns: [
      /\b(vs\.?|versus|compare|comparison|difference between|differences|better than|worse than|which is|which one|pros and cons|trade[-\s]?off)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.EXAM_PREP,
    weight: 9,
    patterns: [
      /\b(exam|test|marks|mcq|short answer|long answer|for exam|exam question|university|semester|define for|important for exam)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.INTERVIEW_PREP,
    weight: 9,
    patterns: [
      /\b(interview|faang|google|amazon|system design|asked in|explain to interviewer|how would you explain|common interview)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.IMPLEMENTATION,
    weight: 8,
    patterns: [
      /\b(implement|implementation|code|build|create|how to build|step by step|show me how|write a|example code|snippet)\b/i,
      /^(implement|write|build|create|code)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.TROUBLESHOOTING,
    weight: 10,
    patterns: [
      /\b(error|issue|bug|problem|not working|doesn'?t work|fail|fix|debug|why does|why is it|wrong|broken|crash)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.RESEARCH,
    weight: 7,
    patterns: [
      /\b(research|synthesize|across sources|compare sources|evidence|papers|literature|findings|survey)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.SUMMARY,
    weight: 6,
    patterns: [
      /\b(summarize|summary|overview|brief|tldr|tl;dr|in short|quick recap|give me a summary|what are the key points)\b/i,
      /^(summarize|give me|provide a summary)/i,
    ],
  },
  {
    intent: INTENT_TYPES.DEEP_DIVE,
    weight: 8,
    patterns: [
      /\b(deep dive|in depth|in detail|detailed|technical details|advanced|architecture of|internals of|complete guide)\b/i,
    ],
  },
  {
    intent: INTENT_TYPES.PRACTICAL_APPLICATION,
    weight: 7,
    patterns: [
      /\b(use case|real world|in production|when to use|when should|industry|practical|applied|example in|real example)\b/i,
    ],
  },
];

// ---------------------------------------------------------------------------
// Beginner signal patterns
// ---------------------------------------------------------------------------
const BEGINNER_SIGNALS = [
  /^(what is|what are|i don'?t understand|can you explain|please explain|i'?m new|i'?m a beginner|help me understand|simple|simply)\b/i,
  /\b(i'?m confused|don'?t know|never heard|what does .+ mean|basic|basics|start)\b/i,
];

// ---------------------------------------------------------------------------
// Advanced signal patterns
// ---------------------------------------------------------------------------
const ADVANCED_SIGNALS = [
  /\b(trade[-\s]?offs|complexity|latency|throughput|scalability|optimize|benchmark|profil|architecture|distributed|consensus|sharding|eventual consistency|memory layout|cache invalidation|garbage collect|concurrency|race condition|deadlock|idempotent|CAP theorem)\b/i,
  /\b(implementation detail|time complexity|space complexity|big[-\s]?o|amortized|formal definition|rigorous|proof|mathematical|theorem)\b/i,
];

// ---------------------------------------------------------------------------
// Technical vocabulary that signals intermediate+
// ---------------------------------------------------------------------------
const TECHNICAL_TERMS = /\b(embedding|vector|llm|rag|transformer|attention|tokenizer|inference|gradient|backprop|neural|api|endpoint|async|cache|index|chunk|retrieval|pipeline|batch|stream)\b/i;

// ---------------------------------------------------------------------------
// classifyIntent — main export
// ---------------------------------------------------------------------------

/**
 * Classify the question intent and estimate user learning level.
 *
 * @param {string} question  — The current user message
 * @param {Array}  history   — Recent chat messages [{role, content}]
 * @returns {{
 *   intent: string,
 *   learningLevel: string,
 *   topicKeywords: string[],
 *   hasProcedural: boolean,
 *   hasCode: boolean,
 *   isMultiIntent: boolean,
 * }}
 */
export function classifyIntent(question, history = []) {
  const q = (question || '').trim();

  // ── 1. Intent classification ──────────────────────────────────────────────
  let bestIntent = INTENT_TYPES.CONCEPT_UNDERSTANDING; // safe default
  let bestWeight = -1;

  for (const entry of INTENT_PATTERNS) {
    const matched = entry.patterns.some(re => re.test(q));
    if (matched && entry.weight > bestWeight) {
      bestWeight = entry.weight;
      bestIntent = entry.intent;
    }
  }

  // ── 2. Structural flags ───────────────────────────────────────────────────
  const hasProcedural = /\b(step|steps|step by step|how to|process|workflow|pipeline|sequence)\b/i.test(q);
  const hasCode = /\b(code|implement|example|snippet|function|class|method|algorithm|pseudo)\b/i.test(q) ||
                  /```/.test(q);

  // Check if multiple intents detected (e.g., "explain AND compare")
  const matchedIntentCount = INTENT_PATTERNS.filter(entry =>
    entry.patterns.some(re => re.test(q))
  ).length;
  const isMultiIntent = matchedIntentCount > 2;

  // ── 3. Learning level detection ───────────────────────────────────────────
  const learningLevel = detectLearningLevel(q, history);

  // ── 4. Topic keywords extraction (simple noun phrases) ───────────────────
  const topicKeywords = extractTopicKeywords(q);

  return {
    intent: bestIntent,
    learningLevel,
    topicKeywords,
    hasProcedural,
    hasCode,
    isMultiIntent,
  };
}

// ---------------------------------------------------------------------------
// detectLearningLevel — internal
// ---------------------------------------------------------------------------
function detectLearningLevel(question, history) {
  let beginnerScore = 0;
  let advancedScore = 0;

  // Check current question
  if (BEGINNER_SIGNALS.some(re => re.test(question))) beginnerScore += 3;
  if (ADVANCED_SIGNALS.some(re => re.test(question))) advancedScore += 3;
  if (TECHNICAL_TERMS.test(question)) advancedScore += 1;

  // Question length heuristic — longer, multi-part questions suggest expertise
  const words = question.split(/\s+/).length;
  if (words < 8) beginnerScore += 1;
  if (words > 25) advancedScore += 1;

  // Analyse recent user messages in history
  const recentUserMessages = history
    .filter(m => m.role === 'user')
    .slice(-6);

  for (const msg of recentUserMessages) {
    const text = msg.content || '';
    if (BEGINNER_SIGNALS.some(re => re.test(text))) beginnerScore += 1;
    if (ADVANCED_SIGNALS.some(re => re.test(text))) advancedScore += 1;
    if (TECHNICAL_TERMS.test(text)) advancedScore += 0.5;
    // Very short follow-up questions suggest beginner
    if (text.split(/\s+/).length < 6) beginnerScore += 0.5;
  }

  // Determine level
  if (advancedScore >= 3) return LEVEL_LABELS.ADVANCED;
  if (beginnerScore >= 3) return LEVEL_LABELS.BEGINNER;
  return LEVEL_LABELS.INTERMEDIATE;
}

// ---------------------------------------------------------------------------
// extractTopicKeywords — internal
// ---------------------------------------------------------------------------
function extractTopicKeywords(question) {
  const STOP = new Set([
    'the','a','an','and','but','or','for','nor','on','at','by','from',
    'in','to','of','with','about','against','between','into','is','are',
    'was','were','be','been','being','have','has','had','do','does','did',
    'will','would','shall','should','may','might','must','can','could',
    'what','how','when','where','why','which','who','whom','this','that',
    'these','those','i','you','he','she','it','we','they','me','him',
    'her','us','them','my','your','his','its','our','their','please',
    'explain','tell','describe','give','show','provide','help',
  ]);

  const cleaned = question
    .replace(/[?!.,;:'"""()[\]{}/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const words = cleaned.split(' ').filter(w => w.length > 2 && !STOP.has(w));

  // Build bigrams for multi-word concepts
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }

  return [...new Set([...bigrams.slice(0, 3), ...words.slice(0, 5)])].slice(0, 6);
}

// ---------------------------------------------------------------------------
// Intent → display metadata (used by the frontend badge)
// ---------------------------------------------------------------------------
export const INTENT_DISPLAY = {
  [INTENT_TYPES.CONCEPT_UNDERSTANDING]: { emoji: '💡', label: 'Concept',        color: 'blue'   },
  [INTENT_TYPES.HOW_IT_WORKS]:          { emoji: '⚙️',  label: 'How It Works',  color: 'indigo' },
  [INTENT_TYPES.COMPARISON]:            { emoji: '🔗',  label: 'Comparison',    color: 'violet' },
  [INTENT_TYPES.EXAM_PREP]:             { emoji: '📌',  label: 'Exam Prep',     color: 'amber'  },
  [INTENT_TYPES.INTERVIEW_PREP]:        { emoji: '🎯',  label: 'Interview Prep',color: 'orange' },
  [INTENT_TYPES.IMPLEMENTATION]:        { emoji: '🛠️',  label: 'Implementation',color: 'cyan'   },
  [INTENT_TYPES.TROUBLESHOOTING]:       { emoji: '🔧',  label: 'Troubleshoot',  color: 'rose'   },
  [INTENT_TYPES.RESEARCH]:              { emoji: '🔬',  label: 'Research',      color: 'teal'   },
  [INTENT_TYPES.SUMMARY]:               { emoji: '⚡',  label: 'Summary',       color: 'slate'  },
  [INTENT_TYPES.DEEP_DIVE]:             { emoji: '🚀',  label: 'Deep Dive',     color: 'purple' },
  [INTENT_TYPES.PRACTICAL_APPLICATION]: { emoji: '🌎',  label: 'Practical',     color: 'green'  },
  [INTENT_TYPES.CORE_INTUITION]:        { emoji: '🧠',  label: 'Intuition',     color: 'pink'   },
};

export default { classifyIntent, INTENT_TYPES, LEVEL_LABELS, INTENT_DISPLAY };
