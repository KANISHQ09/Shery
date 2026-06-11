// ============================================================================
// LEARNING PATH SUGGESTIONS
//
// Renders structured, learning-path-aware follow-up question suggestions.
// Handles both new object format {question, reason, type} and legacy string format.
// ============================================================================

const TYPE_CONFIG = {
  deeper:    { emoji: '🚀', label: 'Go deeper',           color: 'text-purple-300', bg: 'bg-purple-500/6',  border: 'border-purple-500/15', hover: 'hover:border-purple-500/30 hover:bg-purple-500/10' },
  practical: { emoji: '🌎', label: 'See it in practice',  color: 'text-green-300',  bg: 'bg-green-500/6',   border: 'border-green-500/15',  hover: 'hover:border-green-500/30  hover:bg-green-500/10'  },
  compare:   { emoji: '🔗', label: 'Compare approaches',  color: 'text-violet-300', bg: 'bg-violet-500/6',  border: 'border-violet-500/15', hover: 'hover:border-violet-500/30 hover:bg-violet-500/10' },
  clarify:   { emoji: '💡', label: 'Build intuition',     color: 'text-amber-300',  bg: 'bg-amber-500/6',   border: 'border-amber-500/15',  hover: 'hover:border-amber-500/30  hover:bg-amber-500/10'  },
  challenge: { emoji: '⚠️', label: 'Understand trade-offs',color: 'text-rose-300',  bg: 'bg-rose-500/6',    border: 'border-rose-500/15',   hover: 'hover:border-rose-500/30   hover:bg-rose-500/10'   },
};

const DEFAULT_TYPE = {
  emoji: '→', label: 'Explore further', color: 'text-slate-300', bg: 'bg-white/[0.02]', border: 'border-white/6', hover: 'hover:border-white/12 hover:bg-white/[0.04]',
};

/**
 * Normalize a follow-up item to always have {question, reason, type}.
 */
function normalizeItem(item) {
  if (typeof item === 'string') {
    return { question: item, reason: 'Explore further', type: 'deeper' };
  }
  return {
    question: item.question || '',
    reason: item.reason || 'Explore further',
    type: item.type || 'deeper',
  };
}

/**
 * @param {Object}    props
 * @param {Array}     props.questions   - Follow-up questions (string[] or object[])
 * @param {Function}  props.onSelect    - Called with the question string when clicked
 */
export default function LearningPathSuggestions({ questions, onSelect }) {
  if (!questions || questions.length === 0) return null;

  const items = questions.map(normalizeItem).filter(item => item.question.trim().length > 0);

  if (items.length === 0) return null;

  return (
    <div className="mt-5 space-y-3 animate-slide-in-bottom">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm">🧠</span>
        <p className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-[0.12em] select-none">
          Continue Your Learning Journey
        </p>
      </div>

      {/* Suggestion grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => {
          const typeStyle = TYPE_CONFIG[item.type] || DEFAULT_TYPE;

          return (
            <button
              key={i}
              onClick={() => onSelect?.(item.question)}
              className={`group flex flex-col items-start gap-1.5 text-left p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${typeStyle.bg} ${typeStyle.border} ${typeStyle.hover}`}
            >
              {/* Type label + emoji */}
              <span className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider ${typeStyle.color} select-none`}>
                <span>{typeStyle.emoji}</span>
                <span>{item.reason || typeStyle.label}</span>
              </span>
              {/* Question text */}
              <p className="text-[11px] text-slate-300 leading-snug group-hover:text-white transition-colors select-text">
                {item.question}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
