import { useState } from 'react';
import AppIcon from '../AppIcon';

export default function PresentationGeneratorModal({ isOpen, onClose, onGenerateOutline, sources = [] }) {
  const [prompt, setPrompt] = useState('');
  const [slideCount, setSlideCount] = useState(10);
  const [theme, setTheme] = useState('Professional');
  const [audience, setAudience] = useState('General');
  const [presentationType, setPresentationType] = useState('Study Deck');
  const [scope, setScope] = useState('entire_workspace'); // 'entire_workspace' | 'selected_files'
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const themes = [
    { id: 'Professional', label: 'Professional', desc: 'Clean Navy & Slate, Arial' },
    { id: 'Modern', label: 'Modern', desc: 'Indigo & Fuchsia, Minimalist' },
    { id: 'Dark Tech', label: 'Dark Tech', desc: 'Electric Orange & Dark, Courier' },
    { id: 'Startup Pitch', label: 'Startup Pitch', desc: 'Coral & Mint, Montserrat' },
    { id: 'Academic', label: 'Academic', desc: 'Harvard Crimson, Georgia serif' },
  ];

  const handleToggleFile = (fid) => {
    setSelectedFileIds((prev) =>
      prev.includes(fid) ? prev.filter((id) => id !== fid) : [...prev, fid]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const sourceDocuments = scope === 'selected_files' ? selectedFileIds : [];
      await onGenerateOutline({
        prompt: prompt.trim(),
        slideCount,
        theme,
        audience,
        presentationType,
        sourceDocuments,
      });
    } catch (err) {
      setError(err.message || 'Failed to generate presentation outline');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-[#0e0f14] border border-white/5 rounded-2xl p-6 shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-150 select-none max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <AppIcon name="book" className="text-orange-400" size={12} />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Generate Presentation Outline</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-350 transition">
            <AppIcon name="x" size={16} />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-5 scrollbar-thin">
          {error && (
            <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl leading-normal font-semibold">
              {error}
            </div>
          )}

          {/* Prompt topic */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">Presentation Topic / Guidelines</label>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Create a presentation explaining semantic vector databases, indexing options, and cosine metrics..."
              className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition resize-none font-medium"
            />
          </div>

          {/* Presentation Type & Audience Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">Presentation Type</label>
              <select
                value={presentationType}
                onChange={(e) => setPresentationType(e.target.value)}
                className="w-full bg-[#0a0a0f] border border-white/5 text-xs text-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/30"
              >
                {[
                  'Investor Pitch',
                  'Research Report',
                  'Study Deck',
                  'Product Demo',
                  'Business Proposal',
                  'Technical Architecture',
                  'Educational Presentation'
                ].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">Target Audience</label>
              <input
                type="text"
                required
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Investors, Tech Leads, Students..."
                className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition font-medium"
              />
            </div>
          </div>

          {/* Slide Count & Theme Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">Slide Count</label>
              <select
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="w-full bg-[#0a0a0f] border border-white/5 text-xs text-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/30"
              >
                {[5, 8, 10, 12, 15].map((num) => (
                  <option key={num} value={num}>{num} Slides</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">Design Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full bg-[#0a0a0f] border border-white/5 text-xs text-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/30"
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Themes Preview Grid (Compact info) */}
          <div className="space-y-1.5 p-3.5 bg-white/[0.005] border border-white/5 rounded-xl">
            <span className="text-[9px] font-extrabold text-slate-550 uppercase tracking-widest block mb-1">Theme Styles Detail</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9.5px] font-medium text-slate-450 leading-relaxed">
              {themes.map((t) => (
                <div key={t.id} className="flex justify-between border-b border-white/[0.02] py-0.5">
                  <span className={theme === t.id ? 'text-orange-400 font-bold' : ''}>{t.label}</span>
                  <span className="text-slate-500">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scoping Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-400">Grounding Scope</label>
              <span className="text-[9px] font-mono text-slate-500 font-bold bg-white/[0.02] border border-white/5 px-2 py-0.5 rounded">
                {scope === 'entire_workspace' ? `${sources.length} sources total` : `${selectedFileIds.length} files selected`}
              </span>
            </div>

            <div className="flex bg-white/[0.02] border border-white/5 rounded-xl p-0.5 text-xs font-semibold text-slate-400">
              <button
                type="button"
                onClick={() => setScope('entire_workspace')}
                className={`flex-1 py-1.5 rounded-lg text-center transition ${
                  scope === 'entire_workspace' ? 'bg-white/[0.04] text-orange-400 border border-white/5' : 'hover:text-slate-200'
                }`}
              >
                Entire Workspace
              </button>
              <button
                type="button"
                onClick={() => setScope('selected_files')}
                className={`flex-1 py-1.5 rounded-lg text-center transition ${
                  scope === 'selected_files' ? 'bg-white/[0.04] text-orange-400 border border-white/5' : 'hover:text-slate-200'
                }`}
              >
                Selected Files Only
              </button>
            </div>

            {scope === 'selected_files' && (
              <div className="border border-white/5 rounded-xl p-3 bg-white/[0.005] max-h-36 overflow-y-auto space-y-1.5 scrollbar-thin">
                {sources.map((src) => {
                  const isChecked = selectedFileIds.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => handleToggleFile(src.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-[10.5px] font-semibold border transition ${
                        isChecked
                          ? 'border-orange-500/20 bg-orange-500/[0.01] text-slate-200'
                          : 'border-transparent bg-transparent text-slate-500 hover:bg-white/[0.01] hover:text-slate-350'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 text-[8px] ${
                        isChecked ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 'border-white/10'
                      }`}>
                        {isChecked && '✓'}
                      </div>
                      <span className="truncate">{src.title}</span>
                    </button>
                  );
                })}
                {sources.length === 0 && (
                  <span className="text-[10px] text-slate-500 block text-center py-2">No sources uploaded in workspace</span>
                )}
              </div>
            )}
          </div>

          {/* Submit block */}
          <div className="flex justify-end gap-3 pt-3 border-t border-white/5 shrink-0">
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim() || (scope === 'selected_files' && selectedFileIds.length === 0)}
              className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition cursor-pointer"
            >
              {isSubmitting ? 'Starting...' : 'Generate Outline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
