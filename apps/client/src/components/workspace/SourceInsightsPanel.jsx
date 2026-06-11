// ============================================================================
// SOURCE INSIGHTS PANEL
//
// Renders the key insights extracted from sources by the AI model.
// Shows "Key Insights From Your Sources" as a standalone premium panel.
// Handles multi-document cross-source synthesis indicator.
// ============================================================================

/**
 * @param {Object}   props
 * @param {string[]} props.insights    - Array of insight strings (from envelope parser)
 * @param {Array}    props.sourcesUsed - Source objects (for count and multi-doc detection)
 */
export default function SourceInsightsPanel({ insights = [], sourcesUsed = [] }) {
  if (!insights || insights.length === 0) return null;

  const isMultiDoc = sourcesUsed.length > 1;
  const sourceCount = sourcesUsed.length;

  return (
    <div className="my-4 rounded-2xl border border-white/6 bg-white/[0.012] overflow-hidden animate-slide-in-bottom">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/5 bg-white/[0.015] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-orange-500/12 border border-orange-500/20 flex items-center justify-center text-sm select-none">
            🔑
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-orange-300 uppercase tracking-[0.12em] select-none">
              Key Insights From Your Sources
            </p>
            {sourceCount > 0 && (
              <p className="text-[9px] text-slate-500 mt-0.5 select-none">
                Synthesized from {sourceCount} source{sourceCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Multi-source badge */}
        {isMultiDoc && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/8 border border-violet-500/20 text-[9px] font-bold text-violet-300 uppercase tracking-wider shrink-0 select-none">
            🔗 Cross-Source
          </span>
        )}
      </div>

      {/* Insights list */}
      <div className="p-4 space-y-2.5">
        {insights.map((insight, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-xl border border-white/4 bg-white/[0.008] hover:bg-white/[0.018] hover:border-white/8 transition-all duration-200 group"
          >
            {/* Numbered pill */}
            <span className="w-5 h-5 rounded-full bg-orange-500/12 border border-orange-500/20 text-orange-400 text-[8px] font-bold flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-orange-500/18 transition-colors select-none">
              {i + 1}
            </span>
            <p className="text-[11.5px] text-slate-300 leading-relaxed select-text flex-1">
              {insight}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
