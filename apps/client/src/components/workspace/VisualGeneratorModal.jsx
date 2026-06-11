import { useState } from 'react';
import AppIcon from '../AppIcon';

export default function VisualGeneratorModal({ isOpen, onClose, onGenerate, sources = [] }) {
  const [prompt, setPrompt] = useState('');
  const [visualType, setVisualType] = useState('Concept Diagram');
  const [scope, setScope] = useState('entire_workspace'); // 'entire_workspace' | 'selected_files'
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const visualTypes = [
    { id: 'Concept Diagram', label: 'Concept Diagram', desc: 'Isometric shapes & text labels' },
    { id: 'Architecture Diagram', label: 'Architecture Diagram', desc: 'Software engineering blocks & pipes' },
    { id: 'Flowchart', label: 'Flowchart', desc: 'Branching boxes & decision diamonds' },
    { id: 'Infographic', label: 'Infographic', desc: 'Visual cards & statistics' },
    { id: 'Mind Map', label: 'Mind Map', desc: 'Central concept branching radially' },
    { id: 'Hero Illustration', label: 'Hero Illustration', desc: 'High-fidelity tech artistic design' },
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
      const payload = {
        prompt: prompt.trim(),
        visualType,
        sourceDocuments: scope === 'selected_files' ? selectedFileIds : [],
      };
      await onGenerate(payload);
      setPrompt('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to trigger visual generation');
    } finally {
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
              <AppIcon name="sparkles" className="text-orange-400" size={12} />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Generate Technical Visual</h3>
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

          {/* Prompt input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">Describe the Visual</label>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Show a multi-layered block diagram of RAG chunking and retrieval pipelines..."
              className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition resize-none font-medium"
            />
          </div>

          {/* Visual Type selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">Visual Type</label>
            <div className="grid grid-cols-2 gap-2">
              {visualTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setVisualType(type.id)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between h-[68px] ${
                    visualType === type.id
                      ? 'border-orange-500/30 bg-orange-500/[0.02] text-orange-400'
                      : 'border-white/5 bg-white/[0.01] text-slate-400 hover:border-white/10 hover:text-slate-300'
                  }`}
                >
                  <span className="text-[10.5px] font-bold block">{type.label}</span>
                  <span className="text-[8px] text-slate-500 leading-tight block truncate mt-1 font-medium">{type.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Smart Document Scoping */}
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

          {/* Submit panel */}
          <div className="flex justify-end gap-3 pt-3 border-t border-white/5 shrink-0">
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim() || (scope === 'selected_files' && selectedFileIds.length === 0)}
              className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition cursor-pointer"
            >
              {isSubmitting ? 'Starting...' : 'Generate Visual'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
