import { useState } from 'react';
import AppIcon from '../AppIcon';
import WorkspaceVideoUploadCard from './WorkspaceVideoUploadCard';

export default function AddSourceModal({ isOpen, onClose, onAddSource, workspaceId }) {
  const [activeTab, setActiveTab] = useState('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [text, setText] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleYoutubeSubmit = async (e) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', 'youtube');
      formData.append('youtubeUrl', youtubeUrl.trim());
      formData.append('title', 'YouTube Video Source');

      await onAddSource(formData);
      setYoutubeUrl('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit YouTube source');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Only PDF documents are supported at this time.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('PDF file size exceeds the 15MB limit.');
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handlePdfSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', 'pdf');
      formData.append('file', selectedFile);

      await onAddSource(formData);
      setSelectedFile(null);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to upload PDF document');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !textTitle.trim()) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', 'text');
      formData.append('text', text.trim());
      formData.append('title', textTitle.trim());

      await onAddSource(formData);
      setText('');
      setTextTitle('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit text source');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-[#0e0f14] border border-white/5 rounded-2xl p-6 shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-150 select-none">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <AppIcon name="upload" className="text-orange-400" size={18} />
            <h3 className="text-sm font-semibold text-slate-200">Add Grounding Material</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-350 transition">
            <AppIcon name="x" size={16} />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-white/5 mb-5">
          {[
            { id: 'youtube', label: 'YouTube Link', icon: 'link' },
            { id: 'video', label: 'Local Video', icon: 'video' },
            { id: 'pdf', label: 'PDF Document', icon: 'file' },
            { id: 'text', label: 'Paste Text', icon: 'alignLeft' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setError(null);
                setActiveTab(tab.id);
              }}
              className={`flex-1 pb-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <AppIcon name={tab.icon} size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 text-xs text-rose-400 bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl leading-normal animate-in slide-in-from-top-1 duration-150 font-semibold">
            {error}
          </div>
        )}

        {/* Form content */}
        {activeTab === 'youtube' && (
          <form onSubmit={handleYoutubeSubmit} className="space-y-4">
            <p className="text-[11px] text-slate-450 leading-normal">
              Extract and post-process auto-captions from public lectures, educational videos, or code walkthroughs.
            </p>
            <div>
              <label htmlFor="youtube-url-input" className="block text-xs font-semibold text-slate-400 mb-2">Video URL</label>
              <input
                id="youtube-url-input"
                type="url"
                required
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !youtubeUrl.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition"
              >
                {isSubmitting ? 'Submitting...' : 'Ingest Video'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'pdf' && (
          <form onSubmit={handlePdfSubmit} className="space-y-4">
            <p className="text-[11px] text-slate-450 leading-normal">
              Upload searchable textbooks, lecture slides, research articles, or study sheets (limit 15MB).
            </p>

            {/* Custom file selector container */}
            <div className="border-2 border-dashed border-white/5 hover:border-white/10 hover:bg-white/[0.015] bg-white/[0.005] rounded-2xl p-6 text-center transition relative">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <AppIcon name="file" size={24} className="text-slate-500 mx-auto mb-3" />
              {selectedFile ? (
                <div>
                  <span className="text-xs font-bold text-slate-200 block truncate mb-1">{selectedFile.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {Math.round(selectedFile.size / 1024 / 1024 * 100) / 100} MB
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-xs font-bold text-slate-200 block mb-1">Click to select PDF document</span>
                  <span className="text-[10px] text-slate-500">or drag and drop your file here</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !selectedFile}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition"
              >
                {isSubmitting ? 'Uploading...' : 'Ingest Document'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'text' && (
          <form onSubmit={handleTextSubmit} className="space-y-4">
            <p className="text-[11px] text-slate-450 leading-normal">
              Paste textbook definitions, article excerpts, syllabus sheets, or interview preparation questions.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="text-title-input" className="block text-xs font-semibold text-slate-400 mb-1.5">Document Title</label>
                <input
                  id="text-title-input"
                  type="text"
                  required
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="e.g. Chapter 4 Definitions"
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition"
                />
              </div>
              <div>
                <label htmlFor="text-content-input" className="block text-xs font-semibold text-slate-400 mb-1.5">Content Text</label>
                <textarea
                  id="text-content-input"
                  required
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your source text content here..."
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !text.trim() || !textTitle.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition"
              >
                {isSubmitting ? 'Submitting...' : 'Ingest Text'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'video' && (
          <WorkspaceVideoUploadCard
            workspaceId={workspaceId}
            onSourceAdded={() => {
              onClose();
            }}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>
    </div>
  );
}

