import { useState } from 'react';
import AppIcon from '../AppIcon';

export default function AudioGeneratorModal({ isOpen, onClose, onGenerate, sources = [] }) {
  const [prompt, setPrompt] = useState('');
  const [audioType, setAudioType] = useState('podcast');
  const [voice, setVoice] = useState('alloy');
  const [provider, setProvider] = useState('openai'); // 'openai' | 'elevenlabs'
  const [scope, setScope] = useState('entire_workspace'); // 'entire_workspace' | 'selected_files'
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const audioTypes = [
    { id: 'podcast', label: 'Podcast Mode', desc: 'NotebookLM-style engaging dialogue' },
    { id: 'lecture', label: 'Lecture Mode', desc: 'Expert tutor explaining concepts' },
    { id: 'study_revision', label: 'Study Revision', desc: 'Punchy flash revision briefing' },
    { id: 'executive_summary', label: 'Executive Summary', desc: 'Objective business-focused briefing' },
  ];

  // OpenAI voices
  const openAiVoices = [
    { id: 'alloy', label: 'Alloy', desc: 'Neutral & balanced' },
    { id: 'echo', label: 'Echo', desc: 'Warm & deep' },
    { id: 'fable', label: 'Fable', desc: 'Narrative & dramatic' },
    { id: 'onyx', label: 'Onyx', desc: 'Deep & authoritative' },
    { id: 'nova', label: 'Nova', desc: 'Energetic & bright' },
    { id: 'shimmer', label: 'Shimmer', desc: 'Professional & clear' },
  ];

  // ElevenLabs voices (standard IDs)
  const elevenlabsVoices = [
    { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', desc: 'Standard female voice' },
    { id: 'AZnzlk1Xhg7KHkWDMrbu', label: 'Nicole', desc: 'Whispery female voice' },
    { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', desc: 'Energetic female voice' },
    { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni', desc: 'Deep male voice' },
    { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie', desc: 'Casual male voice' },
    { id: 'TxGEqn7nU7ARD4x02NpV', label: 'Liam', desc: 'Clean male voice' },
  ];

  const voices = provider === 'openai' ? openAiVoices : elevenlabsVoices;

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
      await onGenerate({
        prompt: prompt.trim(),
        audioType,
        voice,
        provider,
        sourceDocuments,
      });
      setPrompt('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to generate audio content');
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
              <AppIcon name="mic" className="text-orange-400" size={12} />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Generate Grounded Audio</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-350 transition cursor-pointer">
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

          {/* Topic guidelines */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">Audio Topic / Guidelines</label>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Explain the visual difference between CNN kernels and multi-head attention layers..."
              className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition resize-none font-medium"
            />
          </div>

          {/* Audio Type Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">Format Style</label>
            <div className="grid grid-cols-2 gap-2">
              {audioTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setAudioType(type.id)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between h-[68px] ${
                    audioType === type.id
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

          {/* Provider & Voice Selector */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">TTS Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  const newProvider = e.target.value;
                  setProvider(newProvider);
                  // Auto reset voice selection matching new provider defaults
                  setVoice(newProvider === 'openai' ? 'alloy' : '21m00Tcm4TlvDq8ikWAM');
                }}
                className="w-full bg-[#0a0a0f] border border-white/5 text-xs text-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/30"
              >
                <option value="openai">OpenAI TTS (Efficient)</option>
                <option value="elevenlabs">ElevenLabs (Premium)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">Voice Narrator</label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full bg-[#0a0a0f] border border-white/5 text-xs text-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/30"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.label} ({v.desc})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Document Scoping Selector */}
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

          {/* Submit Panel */}
          <div className="flex justify-end gap-3 pt-3 border-t border-white/5 shrink-0">
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim() || (scope === 'selected_files' && selectedFileIds.length === 0)}
              className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition cursor-pointer"
            >
              {isSubmitting ? 'Starting...' : 'Generate Audio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
