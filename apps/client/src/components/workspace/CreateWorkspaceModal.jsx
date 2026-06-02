import { useState } from 'react';
import AppIcon from '../AppIcon';

export default function CreateWorkspaceModal({ isOpen, onClose, onCreate, isPending }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🧠');
  
  const emojis = ['🧠', '💻', '📈', '🔬', '📚', '🎨', '⚖️', '🧬', '⚙️', '🌌', '💡', '🏆'];

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), emoji });
    setName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-md bg-[#0e0f14] border border-white/5 rounded-2xl p-6 shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-150 select-none">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <AppIcon name="brain" className="text-orange-400" size={20} />
            <h3 className="text-sm font-semibold text-slate-200">Create Knowledge Workspace</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-350 transition">
            <AppIcon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">Select Icon</label>
            <div className="grid grid-cols-6 gap-2 p-3 bg-white/[0.01] border border-white/5 rounded-xl">
              {emojis.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`aspect-square text-lg rounded-lg flex items-center justify-center hover:bg-white/[0.04] transition ${
                    emoji === em ? 'bg-orange-950/20 border-orange-500/25 text-orange-400 shadow-sm' : 'border border-transparent text-slate-400'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="ws-name-input" className="block text-xs font-semibold text-slate-400 mb-2">Workspace Name</label>
            <input
              id="ws-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Machine Learning Deep Dive, Web Design Notes"
              className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition"
            >
              {isPending ? (
                <>
                  <AppIcon name="loader" className="animate-spin" size={12} />
                  Creating...
                </>
              ) : (
                <>
                  <AppIcon name="check" size={12} />
                  Create Space
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

