import AppIcon from '../AppIcon';

export default function WorkspaceHeader({
  workspace,
  onAddSource,
  onOpenSearch,
  onDeleteWorkspace,
}) {
  if (!workspace) return null;

  return (
    <header className="h-[56px] flex items-center justify-between px-6 border-b border-white/5 bg-[#08090d]/80 backdrop-blur-md select-none shrink-0">
      {/* Left: Workspace Title & Details */}
      <div className="flex items-center gap-3">
        <span className="text-xl">{workspace.emoji || '🧠'}</span>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight leading-none">{workspace.name}</h1>
            
            <div className="flex items-center gap-1.5 border border-white/5 bg-white/[0.02] rounded-full px-2 py-0.5">
              <span className={`flex items-center gap-1.5 text-[9px] font-semibold ${
                workspace.isProcessing
                  ? 'text-amber-400'
                  : workspace.sourceCount === 0
                  ? 'text-slate-400'
                  : 'text-emerald-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  workspace.isProcessing
                    ? 'bg-amber-400 animate-pulse'
                    : workspace.sourceCount === 0
                    ? 'bg-slate-500'
                    : 'bg-emerald-400'
                }`} />
                {workspace.isProcessing ? 'Processing Sources' : workspace.sourceCount === 0 ? 'Empty Workspace' : 'Ready'}
              </span>
              
              <div className="w-px h-2.5 bg-white/10" />
              
              <span className="text-[9px] font-semibold text-slate-400">
                {workspace.sourceCount || 0} {workspace.sourceCount === 1 ? 'Source' : 'Sources'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Premium Cmd+K Search trigger */}
      <div className="flex-1 max-w-md mx-6">
        <button
          onClick={workspace.sourceCount > 0 ? onOpenSearch : undefined}
          disabled={workspace.sourceCount === 0}
          className={`w-full flex items-center justify-between border rounded-xl px-3.5 py-1.5 text-xs transition duration-150 ${
            workspace.sourceCount === 0
              ? 'bg-white/[0.01] border-white/[0.02] cursor-not-allowed'
              : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/5 text-slate-450 hover:text-slate-200 cursor-pointer'
          }`}
        >
          <div className="flex items-center gap-2">
            <AppIcon name="search" size={13} className={workspace.sourceCount === 0 ? 'text-slate-600' : 'text-slate-450'} />
            <span className={workspace.sourceCount === 0 ? 'text-slate-500' : ''}>
              {workspace.sourceCount === 0 ? 'Add sources to enable search' : 'Search grounding sources...'}
            </span>
          </div>
          {workspace.sourceCount === 0 ? (
            <span className="bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/5 text-[9px] font-medium text-slate-500">
              No Sources
            </span>
          ) : (
            <div className="flex items-center gap-0.5 opacity-60">
              <span className="bg-white/[0.05] px-1 py-0.5 rounded-md border border-white/5 text-[9px] font-mono text-slate-400">⌘</span>
              <span className="bg-white/[0.05] px-1.5 py-0.5 rounded-md border border-white/5 text-[9px] font-mono text-slate-400">K</span>
            </div>
          )}
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAddSource}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-md shadow-orange-950/20 hover:scale-[1.01] transition duration-150"
        >
          <AppIcon name="upload" size={12} />
          <span>Add Source</span>
        </button>

        <button
          onClick={onDeleteWorkspace}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent hover:border-white/5 transition"
          title="Delete Workspace"
        >
          <AppIcon name="trash" size={14} className="text-slate-500 hover:text-slate-300" />
        </button>
      </div>
    </header>
  );
}

