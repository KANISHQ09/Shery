import { useState, useMemo } from 'react';
import AppIcon from '../AppIcon';

export default function ArtifactsPanel({
  outputs = [],
  activeOutputId,
  isGenerating,
  onSelectOutput,
  onDeleteOutput,
  onDuplicateOutput,
  onRenameOutput,
  onViewVersions,
  onGenerate,
}) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredOutputs = useMemo(() => {
    return outputs.filter((out) => {
      const titleLower = (out.title || '').toLowerCase();
      const promptLower = (out.generationPrompt || '').toLowerCase();
      const matchesSearch = titleLower.includes(search.toLowerCase()) || promptLower.includes(search.toLowerCase());
      
      const type = out.artifactType || out.type;
      const matchesType =
        filterType === 'all' ||
        (filterType === 'presentation' && type === 'presentation') ||
        (filterType === 'diagram' && (type === 'diagram' || type === 'visual')) ||
        (filterType === 'study' && type !== 'presentation' && type !== 'diagram' && type !== 'visual');

      return matchesSearch && matchesType;
    });
  }, [outputs, search, filterType]);

  const handleStartRename = (e, out) => {
    e.stopPropagation();
    setEditingId(out.id);
    setEditTitle(out.title || '');
  };

  const handleSaveRename = async (e, out) => {
    e.stopPropagation();
    if (!editTitle.trim()) return;
    try {
      await onRenameOutput(out.id, editTitle.trim());
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicate = async (e, out) => {
    e.stopPropagation();
    try {
      await onDuplicateOutput(out.id);
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type) => {
    if (type === 'presentation') return 'book';
    if (type === 'diagram' || type === 'visual') return 'sparkles';
    return 'alignLeft';
  };

  const getLabel = (type) => {
    if (type === 'presentation') return 'Presentation';
    if (type === 'diagram' || type === 'visual') return 'Visual Diagram';
    return 'Study Guide';
  };

  return (
    <div className="w-full flex flex-col h-full bg-black/10 select-none min-h-0">
      {/* Header filter controls */}
      <div className="p-4 border-b border-white/5 bg-black/15 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-widest block">Knowledge Artifacts</span>
          <span className="px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[8.5px] font-mono font-bold text-orange-400">
            {filteredOutputs.length} items
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artifacts..."
            className="w-full bg-[#0a0a0f] border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 transition font-medium"
          />
          <AppIcon name="search" size={11} className="absolute left-3 top-2.5 text-slate-500" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-350">
              <AppIcon name="x" size={10} />
            </button>
          )}
        </div>

        {/* Tab Filters */}
        <div className="flex bg-[#0a0a0f] border border-white/5 rounded-xl p-0.5 text-[10px] font-semibold text-slate-500 shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'presentation', label: 'Slides' },
            { id: 'diagram', label: 'Visuals' },
            { id: 'study', label: 'Editorial' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`flex-1 py-1 rounded-lg text-center transition ${
                filterType === tab.id ? 'bg-white/[0.04] text-orange-400 border border-white/5' : 'hover:text-slate-250'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Artifacts List */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2.5 scrollbar-thin">
        {filteredOutputs.map((out) => {
          const type = out.artifactType || out.type;
          const isEditing = editingId === out.id;
          const isSelected = activeOutputId === out.id;
          const isRetryable = out.status === 'retryable';

          let borderBgStyle = '';
          if (isRetryable) {
            borderBgStyle = isSelected
              ? 'border-amber-500/40 bg-amber-500/[0.02] shadow-[0_4px_16px_rgba(245,158,11,0.15)]'
              : 'border-amber-500/20 bg-amber-500/[0.005] hover:border-amber-500/30';
          } else if (isSelected) {
            borderBgStyle = 'border-orange-500/25 bg-orange-500/[0.015] shadow-[0_4px_16px_rgba(0,0,0,0.2)]';
          } else {
            borderBgStyle = 'border-white/5 bg-[#0d0e12]/30 hover:border-orange-500/15 hover:bg-orange-500/[0.01]';
          }

          return (
            <div
              key={out.id}
              onClick={() => !isEditing && onSelectOutput(out)}
              className={`p-4.5 rounded-2xl border transition-all duration-300 relative group flex flex-col justify-between min-h-[110px] ${borderBgStyle} ${isEditing ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {/* Card Main Info */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2.5 select-none shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                      <AppIcon name={getIcon(type)} size={11} />
                    </div>
                    <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-slate-500">
                      {getLabel(type)}
                    </span>
                  </div>

                  {/* Version tag */}
                  {out.version && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewVersions(out);
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/[0.02] border border-white/5 text-[8px] font-bold text-slate-400 hover:border-orange-500/20 hover:text-orange-400 transition"
                      title="Click to view version registry"
                    >
                      v{out.version}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 bg-[#0a0a0f] border border-white/5 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                    />
                    <button
                      onClick={(e) => handleSaveRename(e, out)}
                      className="p-1 hover:bg-white/5 rounded text-emerald-400"
                    >
                      ✓
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      className="p-1 hover:bg-white/5 rounded text-rose-455"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className="text-[11.5px] font-bold text-slate-200 block truncate leading-tight group-hover:text-orange-400 transition">
                    {out.title}
                  </span>
                )}

                {/* Subtitle/Prompt detail */}
                {!isEditing && out.generationPrompt && (
                  <p className="text-[9px] text-slate-500 line-clamp-1 leading-normal font-medium italic select-text">
                    "{out.generationPrompt}"
                  </p>
                )}

                {isRetryable && (
                  <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[8.5px] font-bold text-amber-400 bg-amber-500/5 border border-amber-500/15 px-2 py-0.5 rounded flex items-center gap-1 select-none">
                      <AppIcon name="alert" size={9} />
                      Interrupted
                    </span>
                    <button
                      onClick={() => onGenerate?.({ type: out.type, depth: out.depth })}
                      className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-[8.5px] font-bold text-black select-none transition flex items-center gap-1 cursor-pointer animate-pulse"
                    >
                      <AppIcon name="refresh" size={8} />
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.02] mt-3 select-none">
                <span className="text-[8.5px] font-semibold text-slate-600 font-mono">
                  {new Date(out.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => handleStartRename(e, out)}
                    className="p-1 rounded-lg text-slate-550 hover:text-orange-400 hover:bg-white/[0.02] border border-white/5 transition"
                    title="Rename Artifact"
                  >
                    <AppIcon name="edit" size={10} />
                  </button>
                  <button
                    onClick={(e) => handleDuplicate(e, out)}
                    className="p-1 rounded-lg text-slate-550 hover:text-orange-400 hover:bg-white/[0.02] border border-white/5 transition"
                    title="Duplicate Artifact"
                  >
                    <AppIcon name="copy" size={10} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteOutput(out.id);
                    }}
                    className="p-1 rounded-lg text-slate-550 hover:text-rose-450 hover:bg-white/[0.02] border border-white/5 transition"
                    title="Delete Artifact"
                  >
                    <AppIcon name="trash" size={10} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredOutputs.length === 0 && !isGenerating && (
          <div className="text-center py-12 border border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center p-4">
            <AppIcon name="file" size={14} className="text-slate-600 mb-2" />
            <span className="text-[10px] text-slate-500 font-semibold">No knowledge artifacts synthesized</span>
            <span className="text-[8px] text-slate-650 mt-1 max-w-[160px] leading-relaxed text-center font-medium">
              Click visual or slide options in the Synthesis Lab panel to build.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
