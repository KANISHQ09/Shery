import { useState } from 'react';
import AppIcon from '../AppIcon';

// ============================================================================
// CONFIDENCE EXPLAINER
//
// Upgraded trust panel replacing the basic confidence badge.
// Shows confidence level always-visible, with an expandable deep-dive section
// explaining WHY the confidence is what it is.
// ============================================================================

const CONFIDENCE_CONFIG = {
  High: {
    label: 'High Confidence',
    emoji: '✅',
    dotColor: 'bg-emerald-400',
    textColor: 'text-emerald-300',
    borderColor: 'border-emerald-500/20',
    bgColor: 'bg-emerald-500/[0.04]',
    expandBg: 'bg-emerald-500/[0.02]',
    expandBorder: 'border-emerald-500/10',
    barColor: 'bg-emerald-500',
    description: 'The AI found strong, consistent evidence in your uploaded sources.',
  },
  Medium: {
    label: 'Medium Confidence',
    emoji: '🟡',
    dotColor: 'bg-amber-400',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-500/20',
    bgColor: 'bg-amber-500/[0.04]',
    expandBg: 'bg-amber-500/[0.02]',
    expandBorder: 'border-amber-500/10',
    barColor: 'bg-amber-500',
    description: 'Partial evidence found. Some aspects may draw on limited source coverage.',
  },
  Low: {
    label: 'Low Confidence',
    emoji: '⚠️',
    dotColor: 'bg-rose-400',
    textColor: 'text-rose-300',
    borderColor: 'border-rose-500/20',
    bgColor: 'bg-rose-500/[0.04]',
    expandBg: 'bg-rose-500/[0.02]',
    expandBorder: 'border-rose-500/10',
    barColor: 'bg-rose-500',
    description: 'Limited evidence in your sources. Consider uploading more relevant materials.',
  },
};

function ScoreBar({ label, value, barColor }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px] text-slate-500">
        <span>{label}</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * @param {Object}  props
 * @param {Object}  props.trustMetrics  - From retrievalEvaluation.evaluateRetrieval()
 * @param {Array}   props.sourcesUsed   - Source objects used in retrieval
 */
export default function ConfidenceExplainer({ trustMetrics, sourcesUsed = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!trustMetrics) return null;

  const {
    confidenceLabel = 'Medium',
    groundingScore = 0,
    hallucinationRisk = 0,
    citationAccuracy = 0,
    coverage = 0,
    warnings = [],
    metrics = {},
  } = trustMetrics;

  const config = CONFIDENCE_CONFIG[confidenceLabel] || CONFIDENCE_CONFIG.Medium;
  const sourceCount = sourcesUsed.length || metrics.evaluatedChunksCount || 0;

  // Calculate agreement level from grounding score
  const agreementLabel = groundingScore >= 0.8
    ? 'Strong agreement across sources'
    : groundingScore >= 0.5
    ? 'Moderate agreement'
    : 'Sources have limited overlap on this topic';

  return (
    <div className={`rounded-2xl border overflow-hidden ${config.borderColor} ${config.bgColor}`}>
      {/* Always-visible header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.015] transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">{config.emoji}</span>
          <div className="text-left">
            <p className={`text-[10.5px] font-bold ${config.textColor}`}>{config.label}</p>
            <p className="text-[9px] text-slate-500 mt-0.5 hidden sm:block">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sourceCount > 0 && (
            <span className="text-[9px] font-semibold text-slate-500 bg-white/[0.03] border border-white/6 px-2 py-0.5 rounded-full">
              {sourceCount} source{sourceCount !== 1 ? 's' : ''}
            </span>
          )}
          <AppIcon
            name={expanded ? 'chevronUp' : 'chevronDown'}
            size={12}
            className="text-slate-500"
          />
        </div>
      </button>

      {/* Expandable detail section */}
      {expanded && (
        <div className={`border-t ${config.expandBorder} ${config.expandBg} px-4 py-4 space-y-4 animate-slide-in-top`}>
          <p className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-[0.12em] select-none">
            Why This Answer Has {confidenceLabel} Confidence
          </p>

          {/* Key facts */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{sourceCount}</p>
              <p className="text-[9px] text-slate-500 mt-0.5">Sources Used</p>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{metrics.groundedStatements || 0}<span className="text-sm text-slate-400">/{metrics.totalStatements || 0}</span></p>
              <p className="text-[9px] text-slate-500 mt-0.5">Statements Grounded</p>
            </div>
          </div>

          {/* Agreement indicator */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${config.dotColor}`} />
            <p className="text-[10px] text-slate-300">{agreementLabel}</p>
          </div>

          {/* Score bars */}
          <div className="space-y-2.5">
            <ScoreBar label="Source Grounding" value={groundingScore} barColor={config.barColor} />
            <ScoreBar label="Citation Accuracy" value={citationAccuracy} barColor={config.barColor} />
            <ScoreBar label="Query Coverage" value={coverage} barColor={config.barColor} />
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Considerations</p>
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/[0.04] border border-amber-500/10">
                  <span className="text-amber-400 text-xs shrink-0">⚠</span>
                  <p className="text-[10px] text-amber-200/70 leading-relaxed">{w}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
