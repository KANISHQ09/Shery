import AppIcon from '../AppIcon';

export default function OutputCard({ output, isActive, onClick, onDelete }) {
  const getIcon = () => {
    if (output.type === 'study_guide') return 'book';
    if (output.type === 'flashcards') return 'sparkles';
    if (output.type === 'faq') return 'message';
    if (output.type === 'timeline') return 'clock';
    if (output.type === 'key_insights') return 'lightbulb';
    if (output.type === 'key_definitions') return 'alignLeft';
    if (output.type === 'interview_questions') return 'mic';
    if (output.type === 'topic_breakdown') return 'brain';
    if (output.type === 'exam_prep') return 'graduation';
    return 'rocket';
  };

  const getRelativeTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recent';
    }
  };

  return (
    <div
      onClick={output.status === 'ready' ? onClick : undefined}
      className={`relative group border p-3 flex items-center justify-between rounded-xl transition-all duration-300 select-none ${
        output.status === 'ready' ? 'cursor-pointer' : 'cursor-wait opacity-75'
      } ${
        isActive
          ? 'bg-orange-500/[0.04] border-orange-500/25 shadow-[0_4px_16px_rgba(99,102,241,0.08)]'
          : 'bg-[#0a0a0f]/40 border-white/5 hover:border-white/10 hover:bg-white/[0.025] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 pr-6">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-300 ${
          isActive
            ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
            : 'bg-white/[0.02] border-white/5 text-slate-450 group-hover:text-orange-455 group-hover:border-white/10'
        }`}>
          <AppIcon name={getIcon()} size={12} />
        </div>
        <div className="min-w-0">
          <span className={`text-[11px] font-bold truncate block transition duration-150 leading-tight ${isActive ? 'text-orange-400' : 'text-slate-200 group-hover:text-orange-400'}`}>
            {output.title}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            {output.status === 'generating' && (
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
            )}
            <span className="text-[9px] text-slate-500 block leading-none font-medium">
              {output.status === 'generating' ? 'Synthesizing...' : getRelativeTime(output.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-105"
        title="Delete Document"
      >
        <AppIcon name="trash" size={11} />
      </button>
    </div>
  );
}


