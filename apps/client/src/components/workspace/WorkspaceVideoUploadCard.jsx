import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AppIcon from '../AppIcon';
import { uploadVideoSource } from '../../services/workspaceApi';
import { workspaceKeys } from '../../api/workspaceQueries';

export default function WorkspaceVideoUploadCard({ workspaceId, onSourceAdded, onError }) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file) => {
    if (!file) return;

    const allowedExtensions = ['.mp4', '.mov', '.mkv', '.webm'];
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(extension)) {
      onError('Unsupported format. Please select a .mp4, .mov, .mkv, or .webm video.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      onError('Video exceeds 200MB size limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title.trim() || selectedFile.name);

      const response = await uploadVideoSource(workspaceId, formData);
      
      // Invalidate queries so that the workspace list, metrics, and details refresh immediately!
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(workspaceId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.graph(workspaceId) });

      setSelectedFile(null);
      setTitle('');
      if (onSourceAdded) onSourceAdded(response.data);
    } catch (err) {
      onError(err.message || 'Failed to upload local video file.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-450 leading-normal">
        Upload local lecture captures, tutorials, or screen walkthroughs (.mp4, .mov, .mkv, .webm, max 200MB).
      </p>

      <form onSubmit={handleUpload} className="space-y-4">
        {/* Drag and Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-2xl p-8 text-center transition cursor-pointer relative select-none ${
            dragActive 
              ? 'border-orange-500 bg-orange-950/10 scale-[1.01]' 
              : selectedFile 
                ? 'border-orange-500/30 bg-white/[0.02] hover:bg-white/[0.03]' 
                : 'border-white/5 bg-white/[0.005] hover:bg-white/[0.015]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.mkv,.webm"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className={`p-3 rounded-full bg-white/[0.02] border border-white/5 ${dragActive ? 'text-orange-400 border-orange-500/30 animate-pulse' : 'text-slate-500'}`}>
              <AppIcon name="video" size={24} />
            </div>

            {selectedFile ? (
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-200 block truncate max-w-[280px] mx-auto">
                  {selectedFile.name}
                </span>
                <span className="text-[10px] text-slate-500">
                  {Math.round(selectedFile.size / 1024 / 1024 * 100) / 100} MB
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-200 block">
                  Click to choose video file
                </span>
                <span className="text-[10px] text-slate-500">
                  or drag and drop your file here
                </span>
              </div>
            )}
          </div>
        </div>

        {selectedFile && (
          <div className="space-y-1">
            <label htmlFor="video-title-input" className="block text-[11px] font-semibold text-slate-400 mb-1.5">
              Source Title
            </label>
            <input
              id="video-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Setting up RAG Database"
              className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition"
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="submit"
            disabled={isUploading || !selectedFile}
            className="px-5 py-2.5 text-xs font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:bg-white/[0.01] disabled:text-slate-500 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-950/50 transition"
          >
            {isUploading ? (
              <>
                <AppIcon name="loader" className="animate-spin" size={13} />
                Streaming Upload...
              </>
            ) : (
              <>
                <AppIcon name="upload" size={13} />
                Ingest Local Video
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

