import { useMemo } from 'react';

// ============================================================================
// RESPONSE ENVELOPE PARSER
// Extracts <!--TAG:value--> markers from streaming AI content.
// Returns structured data + clean body content with markers stripped.
// ============================================================================

const MARKER_REGEX = /<!--(INTENT|LEVEL|TLDR|TAKEAWAYS|ANALOGY|SOURCE_INSIGHTS|KNOWLEDGE_GAP|LEARNED|PREREQUISITE_WARNING|CONFLICTS):([^>]*?)-->/g;

/**
 * Parse the structured response envelope from the raw AI content string.
 * All markers are stripped from the body so RichMarkdown gets clean text.
 *
 * @param {string} content - Raw streaming content from AI
 * @returns {{
 *   intent: string|null,
 *   level: string|null,
 *   tldr: string|null,
 *   takeaways: string[],
 *   analogy: string|null,
 *   sourceInsights: string[],
 *   knowledgeGap: string|null,
 *   learned: Record<string, string>,
 *   bodyContent: string,
 *   hasEnvelope: boolean,
 * }}
 */
export function parseResponseEnvelope(content) {
  if (!content) {
    return {
      intent: null, level: null, tldr: null, takeaways: [],
      analogy: null, sourceInsights: [], knowledgeGap: null,
      learned: {}, bodyContent: '', hasEnvelope: false,
    };
  }

  const result = {
    intent: null,
    level: null,
    tldr: null,
    takeaways: [],
    analogy: null,
    sourceInsights: [],
    knowledgeGap: null,
    prerequisiteWarning: null,
    conflicts: null,
    learned: {},
    hasEnvelope: false,
  };

  // Extract all markers
  let match;
  const regex = new RegExp(MARKER_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const tag = match[1];
    const value = match[2]?.trim() || '';
    result.hasEnvelope = true;

    switch (tag) {
      case 'INTENT':        result.intent = value || null; break;
      case 'LEVEL':         result.level = value || null; break;
      case 'TLDR':          result.tldr = value || null; break;
      case 'ANALOGY':              result.analogy = value || null; break;
      case 'KNOWLEDGE_GAP':        result.knowledgeGap = value || null; break;
      case 'PREREQUISITE_WARNING': result.prerequisiteWarning = value || null; break;
      case 'CONFLICTS':            result.conflicts = value || null; break;
      case 'TAKEAWAYS':
        result.takeaways = value
          ? value.split('|').map(s => s.trim()).filter(Boolean)
          : [];
        break;
      case 'SOURCE_INSIGHTS':
        result.sourceInsights = value
          ? value.split('||').map(s => s.trim()).filter(Boolean)
          : [];
        break;
      case 'LEARNED':
        if (value) {
          value.split('|').forEach(part => {
            const colonIdx = part.indexOf(':');
            if (colonIdx > 0) {
              const k = part.substring(0, colonIdx).trim();
              const v = part.substring(colonIdx + 1).trim();
              if (k && v) result.learned[k] = v;
            }
          });
        }
        break;
    }
  }

  // Strip all markers from content to produce clean body
  result.bodyContent = content.replace(new RegExp(MARKER_REGEX.source, 'g'), '').trimStart();

  return result;
}

// ============================================================================
// INTENT DISPLAY METADATA
// ============================================================================
const INTENT_META = {
  concept_understanding: { emoji: '💡', label: 'Concept',         color: 'blue'   },
  how_it_works:          { emoji: '⚙️',  label: 'How It Works',   color: 'indigo' },
  comparison:            { emoji: '🔗',  label: 'Comparison',     color: 'violet' },
  exam_prep:             { emoji: '📌',  label: 'Exam Prep',      color: 'amber'  },
  interview_prep:        { emoji: '🎯',  label: 'Interview Prep', color: 'orange' },
  implementation:        { emoji: '🛠️',  label: 'Implementation', color: 'cyan'   },
  troubleshooting:       { emoji: '🔧',  label: 'Troubleshoot',   color: 'rose'   },
  research:              { emoji: '🔬',  label: 'Research',       color: 'teal'   },
  summary:               { emoji: '⚡',  label: 'Summary',        color: 'slate'  },
  deep_dive:             { emoji: '🚀',  label: 'Deep Dive',      color: 'purple' },
  practical_application: { emoji: '🌎',  label: 'Practical',      color: 'green'  },
  core_intuition:        { emoji: '🧠',  label: 'Intuition',      color: 'pink'   },
};

const LEVEL_META = {
  beginner:     { label: 'Beginner',     dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
  intermediate: { label: 'Intermediate', dot: 'bg-amber-400',   text: 'text-amber-300',   border: 'border-amber-500/20',   bg: 'bg-amber-500/5'   },
  advanced:     { label: 'Advanced',     dot: 'bg-purple-400',  text: 'text-purple-300',  border: 'border-purple-500/20',  bg: 'bg-purple-500/5'  },
};

const INTENT_COLORS = {
  blue:   { text: 'text-blue-300',   bg: 'bg-blue-500/8',   border: 'border-blue-500/20'   },
  indigo: { text: 'text-indigo-300', bg: 'bg-indigo-500/8', border: 'border-indigo-500/20' },
  violet: { text: 'text-violet-300', bg: 'bg-violet-500/8', border: 'border-violet-500/20' },
  amber:  { text: 'text-amber-300',  bg: 'bg-amber-500/8',  border: 'border-amber-500/20'  },
  orange: { text: 'text-orange-300', bg: 'bg-orange-500/8', border: 'border-orange-500/20' },
  cyan:   { text: 'text-cyan-300',   bg: 'bg-cyan-500/8',   border: 'border-cyan-500/20'   },
  rose:   { text: 'text-rose-300',   bg: 'bg-rose-500/8',   border: 'border-rose-500/20'   },
  teal:   { text: 'text-teal-300',   bg: 'bg-teal-500/8',   border: 'border-teal-500/20'   },
  slate:  { text: 'text-slate-300',  bg: 'bg-slate-500/8',  border: 'border-slate-500/20'  },
  purple: { text: 'text-purple-300', bg: 'bg-purple-500/8', border: 'border-purple-500/20' },
  green:  { text: 'text-green-300',  bg: 'bg-green-500/8',  border: 'border-green-500/20'  },
  pink:   { text: 'text-pink-300',   bg: 'bg-pink-500/8',   border: 'border-pink-500/20'   },
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function IntentBadge({ intent }) {
  if (!intent) return null;
  const meta = INTENT_META[intent];
  if (!meta) return null;
  const colors = INTENT_COLORS[meta.color] || INTENT_COLORS.blue;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider select-none ${colors.bg} ${colors.border} ${colors.text}`}>
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}

function LevelBadge({ level }) {
  if (!level) return null;
  const meta = LEVEL_META[level];
  if (!meta) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold select-none ${meta.bg} ${meta.border} ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function TLDRCard({ tldr }) {
  if (!tldr) return null;

  return (
    <div className="relative rounded-2xl border border-orange-500/15 bg-gradient-to-br from-orange-500/[0.06] to-amber-500/[0.03] p-5 overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-orange-500/[0.04] blur-2xl pointer-events-none" />
      <div className="flex items-start gap-3 relative">
        <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center text-base shrink-0 mt-0.5">
          🎯
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-extrabold text-orange-400 uppercase tracking-[0.15em] mb-1.5 select-none">
            In One Sentence
          </p>
          <p className="text-[13px] font-semibold text-white leading-snug select-text">
            {tldr}
          </p>
        </div>
      </div>
    </div>
  );
}

function KeyTakeawaysCard({ takeaways }) {
  if (!takeaways?.length) return null;

  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.015] p-5 animate-fade-in animate-slide-in-bottom">
      <p className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2 select-none">
        <span>📌</span> Key Takeaways
      </p>
      <div className="space-y-2.5">
        {takeaways.map((point, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="w-4 h-4 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-400 flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5 select-none">
              {i + 1}
            </span>
            <p className="text-[11.5px] text-slate-300 leading-relaxed select-text">{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalogyCard({ analogy }) {
  if (!analogy) return null;

  return (
    <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-r from-amber-500/[0.04] to-orange-500/[0.02] p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center text-base shrink-0">
        🌎
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] font-extrabold text-amber-400 uppercase tracking-[0.15em] mb-1 select-none">
          Real World Analogy
        </p>
        <p className="text-[11.5px] text-amber-100/80 italic leading-relaxed select-text">
          "{analogy}"
        </p>
      </div>
    </div>
  );
}

function KnowledgeGapBanner({ gap }) {
  if (!gap) return null;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center text-sm shrink-0 mt-0.5">
        ⚠️
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] font-extrabold text-amber-400 uppercase tracking-[0.15em] mb-1 select-none">
          Knowledge Gap Detected
        </p>
        <p className="text-[11px] text-amber-200/70 leading-relaxed select-text">{gap}</p>
      </div>
    </div>
  );
}

function PrerequisiteWarningBanner({ warning }) {
  if (!warning) return null;

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-sm shrink-0 mt-0.5">
        ⚠️
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] font-extrabold text-amber-500 uppercase tracking-[0.15em] mb-1 select-none">
          Prerequisite Warning
        </p>
        <p className="text-[11.5px] text-amber-200 leading-relaxed select-text font-semibold">{warning}</p>
      </div>
    </div>
  );
}

function ConflictAlertCard({ conflicts }) {
  if (!conflicts) return null;

  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4 flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-xl bg-rose-500/12 border border-rose-500/20 flex items-center justify-center text-sm shrink-0 mt-0.5">
        ⚠️
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] font-extrabold text-rose-450 uppercase tracking-[0.15em] mb-1 select-none">
          Source Conflict Detected
        </p>
        <p className="text-[11px] text-rose-200/80 leading-relaxed select-text font-semibold">{conflicts}</p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT: AdaptiveAnswerHeader
// ============================================================================

/**
 * Renders the structured answer envelope extracted from the raw AI content.
 * Also returns the clean body content (with markers stripped) via `onBodyReady`.
 *
 * @param {Object} props
 * @param {string}   props.content       - Raw content from AI (with markers)
 * @param {string}   [props.intent]      - Pre-classified intent (from `done` event)
 * @param {string}   [props.level]       - Pre-classified level (from `done` event)
 * @param {boolean}  [props.isStreaming] - When true, shows skeleton placeholders
 */
export default function AdaptiveAnswerHeader({ content, intent: intentProp, level: levelProp, isStreaming }) {
  const envelope = useMemo(() => parseResponseEnvelope(content), [content]);

  // During streaming, use prop overrides if envelope isn't parsed yet
  const intent = envelope.intent || intentProp;
  const level  = envelope.level  || levelProp;

  const hasBadges = intent || level;
  const hasContent = envelope.hasEnvelope &&
    (envelope.tldr || envelope.takeaways.length > 0 || envelope.analogy || envelope.knowledgeGap);

  if (!hasContent && !hasBadges) return null;

  return (
    <div className="space-y-3 mb-4 animate-fade-in">

      {/* TL;DR Card */}
      {envelope.tldr && (
        <TLDRCard tldr={envelope.tldr} />
      )}

      {/* Key Takeaways */}
      {envelope.takeaways.length > 0 && (
        <KeyTakeawaysCard takeaways={envelope.takeaways} />
      )}

      {/* Analogy */}
      {envelope.analogy && (
        <AnalogyCard analogy={envelope.analogy} />
      )}

      {/* Knowledge Gap Banner */}
      {envelope.knowledgeGap && (
        <KnowledgeGapBanner gap={envelope.knowledgeGap} />
      )}

      {/* Prerequisite Warning Banner */}
      {envelope.prerequisiteWarning && (
        <PrerequisiteWarningBanner warning={envelope.prerequisiteWarning} />
      )}

      {/* Source Conflict Alert Card */}
      {envelope.conflicts && (
        <ConflictAlertCard conflicts={envelope.conflicts} />
      )}

      {/* Subtle divider before main content */}
      {hasContent && (
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-px bg-white/4" />
          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest select-none">Full Explanation</span>
          <div className="flex-1 h-px bg-white/4" />
        </div>
      )}
    </div>
  );
}
