import { useState, useMemo } from 'react';
import AppIcon from '../AppIcon';
import SourceCard from './SourceCard';

export default function SourcesPanel({
  sources = [],
  activeSourceId,
  onSelectSource,
  onDeleteSource,
  onAddSource,
}) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');

  const filteredSources = useMemo(() => {
    return sources.filter((src) => {
      const matchesSearch = src.title.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || src.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [sources, search, filterType]);

  return (
    <section
      style={{ width: '280px', minWidth: '280px', maxWidth: '280px' }}
      className="hidden md:flex shrink-0 h-full flex flex-col border-r border-white/5 bg-[#0d0e12]/60 backdrop-blur-md select-none overflow-hidden min-h-0"
    >
      {/* Search & Filter Header */}
      <div className="p-4 border-b border-white/5 bg-black/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Sources</span>
          <button
            onClick={onAddSource}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.02] border border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition"
            title="Upload Source"
          >
            <AppIcon name="upload" size={12} />
          </button>
        </div>

        {/* Local Search input */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter sources..."
            className="w-full bg-white/[0.01] border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.03] transition"
          />
          <AppIcon name="search" size={12} className="absolute left-3 top-2.5 text-slate-500" />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
            >
              <AppIcon name="x" size={10} />
            </button>
          )}
        </div>

        {/* Tab Filters */}
        <div className="flex bg-white/[0.02] border border-white/5 rounded-lg p-0.5 text-[10px] font-semibold text-slate-500">
          {[
            { id: 'all', label: 'All' },
            { id: 'pdf', label: 'PDF' },
            { id: 'youtube', label: 'YouTube' },
            { id: 'text', label: 'Text' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`flex-1 py-1 rounded-md text-center transition ${filterType === tab.id
                ? 'bg-white/[0.04] text-orange-400 border border-white/5'
                : 'hover:text-slate-200'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2 scrollbar-thin">
        {filteredSources.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            isActive={activeSourceId === source.id}
            onClick={() => onSelectSource(source.id)}
            onDelete={() => onDeleteSource(source.id)}
          />
        ))}

        {filteredSources.length === 0 && (
          <div className="text-center py-10 px-4">
            <span className="text-xs text-slate-500 block mb-3">No matching sources</span>
            {sources.length === 0 && (
              <button
                onClick={onAddSource}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 rounded-xl hover:bg-orange-500/20 transition"
              >
                <AppIcon name="upload" size={12} />
                <span>Add Documents</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

