import { useState, useEffect, useRef } from 'react';
import AppIcon from '../AppIcon';
import { searchWorkspace } from '../../services/workspaceApi';

export default function GlobalSearchModal({ isOpen, onClose, workspaceId, onSelectResult, onRunCommand }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);

  // Available hot commands list
  const commands = [
    { id: 'chat', title: 'Focus Grounding Chat', sub: 'Switch workspace tab to interactive grounding chat', icon: 'message' },
    { id: 'dashboard', title: 'Concept Intelligence Universe', sub: 'Switch workspace tab to concept dashboard map', icon: 'brain' },
    { id: 'studio', title: 'Instructor Generative Studio', sub: 'Switch workspace tab to study guides workbench', icon: 'sparkles' },
    { id: 'guide', title: 'Assemble Study Guide', sub: 'Generate high-fidelity study document grounded in sources', icon: 'book' },
    { id: 'glossary', title: 'Compile Technical Glossary', sub: 'Create concept definitions output sheet', icon: 'code' },
    { id: 'reset', title: 'Reset Active Tutor Session', sub: 'Purge current message history logs', icon: 'trash' },
  ];

  const filteredCommands = query.startsWith('/')
    ? commands.filter(c => c.id.includes(query.slice(1).toLowerCase()))
    : commands;

  const showCommands = !query.trim() || query.startsWith('/');

  // Focus input on mount
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 100);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Execute query search
  useEffect(() => {
    if (!query.trim() || query.startsWith('/') || !workspaceId) {
      setResults([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      setSearching(true);
      searchWorkspace(workspaceId, query.trim())
        .then((data) => {
          setResults(data?.results || []);
          setSelectedIndex(0);
        })
        .catch((err) => console.error('Failed semantic search query', err))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query, workspaceId]);

  // Keyboard navigation listeners
  useEffect(() => {
    if (!isOpen) return;

    const listLength = showCommands ? filteredCommands.length : results.length;
    if (listLength === 0) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % listLength);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + listLength) % listLength);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (showCommands) {
          const selectedCmd = filteredCommands[selectedIndex];
          if (selectedCmd) {
            onRunCommand?.(selectedCmd.id);
            onClose();
          }
        } else {
          const selected = results[selectedIndex];
          if (selected) {
            onSelectResult({
              sourceId: selected.sourceId,
              sourceTitle: selected.sourceTitle,
              sourceType: selected.sourceType,
              meta: selected.startTime !== null ? `${Math.floor(selected.startTime / 60)}:${String(Math.floor(selected.startTime % 60)).padStart(2, '0')}` : `P. ${selected.pageNumber || 1}`
            });
            onClose();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, filteredCommands, showCommands, selectedIndex, onSelectResult, onRunCommand, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-md p-4 pt-20 select-none animate-in fade-in duration-100">
      <div className="w-full max-w-2xl bg-[#0e0f14] border border-white/5 rounded-2xl p-4 shadow-2xl shadow-black/80 flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-100">
        
        {/* Input area */}
        <div className="relative border-b border-white/5 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search documents or type '/' for workspace quick actions..."
            className="w-full bg-white/[0.02] border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition font-semibold"
          />
          <AppIcon name="search" size={14} className="absolute left-3.5 top-3.5 text-slate-405 text-slate-500" />
          
          {searching && (
            <AppIcon name="loader" size={12} className="absolute right-3 top-4 animate-spin text-orange-400" />
          )}
        </div>

        {/* Results / Commands list area */}
        <div className="flex-1 overflow-y-auto mt-3 space-y-1.5 scrollbar-thin select-text">
          
          {/* Display hot commands quick menu */}
          {showCommands && (
            <div className="space-y-1">
              <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest pl-2 mb-1 block">
                Workspace Action Palette
              </span>
              {filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  onClick={() => {
                    onRunCommand?.(cmd.id);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-center justify-between ${
                    selectedIndex === idx
                      ? 'bg-orange-950/20 border-orange-500/25 text-orange-300 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 transition
                      ${selectedIndex === idx ? 'bg-orange-950/40 border-orange-500/20 text-orange-400' : 'bg-white/[0.02] border-white/5 text-slate-400'}`}>
                      <AppIcon name={cmd.icon} size={11} />
                    </div>
                    <div className="min-w-0">
                      <span className={`text-[10px] font-bold leading-none block ${selectedIndex === idx ? 'text-orange-400' : 'text-slate-350'}`}>{cmd.title}</span>
                      <span className="text-[8px] text-slate-500 leading-none block mt-1">{cmd.sub}</span>
                    </div>
                  </div>
                  
                  <span className="text-[8px] text-slate-400 font-mono bg-white/[0.03] border border-white/5 px-2 py-0.5 rounded uppercase font-bold shrink-0">
                    /{cmd.id}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Display standard Semantic Search results */}
          {!showCommands && results.map((res, idx) => (
            <div
              key={idx}
              onClick={() => {
                onSelectResult({
                  sourceId: res.sourceId,
                  sourceTitle: res.sourceTitle,
                  sourceType: res.sourceType,
                  meta: res.startTime !== null ? `${Math.floor(res.startTime / 60)}:${String(Math.floor(res.startTime % 60)).padStart(2, '0')}` : `P. ${res.pageNumber || 1}`
                });
                onClose();
              }}
              className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                selectedIndex === idx
                  ? 'bg-orange-950/20 border-orange-500/25 shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0 pr-3">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition ${
                    selectedIndex === idx ? 'bg-orange-950/40 border-orange-500/20 text-orange-400' : 'bg-white/[0.02] border-white/5 text-slate-400'
                  }`}>
                    <AppIcon name={res.sourceType === 'youtube' ? 'video' : 'file'} size={10} />
                  </div>
                  <span className={`text-[10px] font-bold leading-tight truncate ${selectedIndex === idx ? 'text-orange-300 font-extrabold' : 'text-slate-300'}`}>
                    {res.sourceTitle}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[8px] text-slate-450 font-semibold bg-white/[0.04] border border-white/5 px-2 py-0.5 rounded-md">
                    {res.startTime !== null ? 'Timestamp ' : 'Page '}{res.startTime !== null ? `${Math.floor(res.startTime / 60)}:${String(Math.floor(res.startTime % 60)).padStart(2, '0')}` : res.pageNumber || 1}
                  </span>
                  <span className="text-[9px] font-bold text-orange-400">
                    {Math.round(res.relevance * 100) || 82}%
                  </span>
                </div>
              </div>
              <p className={`text-[10px] leading-normal line-clamp-2 italic pr-4 pl-7 ${selectedIndex === idx ? 'text-orange-200/70' : 'text-slate-500'}`}>
                &ldquo;...{res.text}...&rdquo;
              </p>
            </div>
          ))}

          {results.length === 0 && !showCommands && !searching && (
            <div className="text-center py-10 text-slate-500 text-xs">
              No matching grounding evidence found. Try other key terms.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

