import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useIngestYoutubeLessonMutation } from '../api/lessonQueries';
import { uploadLesson } from '../services/api';
import { useLessonStatus } from '../hooks/useLessonStatus';
import LessonStatusBadge from '../components/LessonStatusBadge';
import Navbar from '../components/Navbar';
import AppIcon from '../components/AppIcon';
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES } from '../config/env';

const DEFAULT_COURSE_ID = 'demo-course-001';

const fieldClass =
  'w-full rounded-[10px] border border-line bg-surface-input px-3.5 py-[11px] text-sm text-white outline-none transition focus:border-accent-border focus:ring-4 focus:ring-accent/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-muted';

function LessonRow({ lesson }) {
  const { status, progress, chunkCount, error } = useLessonStatus(
    lesson.lessonId,
    lesson.status !== 'ready' && lesson.status !== 'failed'
  );

  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{lesson.title}</p>
        <p className="mt-1 truncate text-xs text-muted">
          <AppIcon name={lesson.source === 'youtube' ? 'video' : 'upload'} size={13} />
          {' '}
          {lesson.source === 'youtube' ? 'YouTube' : 'Upload'}
          {lesson.youtubeUrl ? ` · ${lesson.youtubeUrl.substring(0, 42)}...` : ''}
        </p>
      </div>
      <LessonStatusBadge status={status || lesson.status} progress={progress} chunkCount={chunkCount} error={error} />
    </div>
  );
}

export default function InstructorPage() {
  const [activeTab, setActiveTab] = useState('youtube');
  const [lessons, setLessons] = useState([]);
  const ingestMutation = useIngestYoutubeLessonMutation();
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [ytForm, setYtForm] = useState({
    title: '',
    description: '',
    youtubeUrl: '',
    courseId: DEFAULT_COURSE_ID,
    order: 1,
  });
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    courseId: DEFAULT_COURSE_ID,
    language: 'auto',
    order: 1,
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadStep, setUploadStep] = useState(''); // 'requesting' | 'uploading' | 'confirming' | ''
  const handleYoutubeSubmit = async (event) => {
    event.preventDefault();
    if (!ytForm.youtubeUrl || !ytForm.title) return toast.error('Title and YouTube URL required');
    try {
      const res = await ingestMutation.mutateAsync(ytForm);
      setLessons((prev) => [
        { lessonId: res.lessonId, title: ytForm.title, source: 'youtube', youtubeUrl: ytForm.youtubeUrl, status: 'processing' },
        ...prev,
      ]);
      toast.success('Lesson created. Processing in background...');
      setYtForm((form) => ({ ...form, title: '', description: '', youtubeUrl: '' }));
    } catch (err) {
      if (err.data?.details?.suggestedAction === 'upload_video') {
        setUploadForm((form) => ({
          ...form,
          title: ytForm.title,
          description: ytForm.description,
          courseId: ytForm.courseId,
          order: ytForm.order,
        }));
        setActiveTab('upload');
      }
      toast.error(err.message || 'Failed to ingest lesson');
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Max ${MAX_UPLOAD_MB} MB`);
      return;
    }
    setSelectedFile(file);
    if (!uploadForm.title) setUploadForm((form) => ({ ...form, title: file.name.replace(/\.[^/.]+$/, '') }));
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) return toast.error('Please select a video file');
    if (!uploadForm.title) return toast.error('Title required');
    setUploadError('');
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      Object.entries(uploadForm).forEach(([key, value]) => fd.append(key, value));
      const res = await uploadLesson(fd, setUploadStep);
      setUploadStep('');
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      const lessonId = res?.lessonId || res?.data?.lessonId;
      setLessons((prev) => [{ lessonId, title: uploadForm.title, source: 'upload', status: 'uploading' }, ...prev]);
      toast.success('Video uploading. Processing will start automatically.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadForm((form) => ({ ...form, title: '', description: '' }));
    } catch (err) {
      setUploadStep('');
      setIsUploading(false);
      const msg = err.message || 'Upload failed. Check the browser console for details.';
      setUploadError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base font-sans text-white">
      <Navbar />
      <main className="mx-auto max-w-[820px] px-6 py-10">
        <header className="mb-9">
          <h1 className="mb-1.5 text-[28px] font-extrabold">Instructor Studio</h1>
          <p className="text-sm text-muted">Add lessons via YouTube URL or upload a video. AI transcribes and indexes it automatically.</p>
        </header>

        <section className="mb-7 overflow-hidden rounded-2xl border border-line bg-surface-card">
          <div className="flex gap-1 border-b border-line px-5 pt-4">
            <TabButton active={activeTab === 'youtube'} onClick={() => setActiveTab('youtube')} icon="video">
              YouTube URL
            </TabButton>
            <TabButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon="upload">
              Upload Video
            </TabButton>
          </div>

          <div className="p-6">
            {activeTab === 'youtube' && (
              <form onSubmit={handleYoutubeSubmit} className="flex flex-col gap-4">
                <Field label="Lesson Title *">
                  <input
                    className={fieldClass}
                    placeholder="e.g. Introduction to Machine Learning"
                    value={ytForm.title}
                    onChange={(event) => setYtForm((form) => ({ ...form, title: event.target.value }))}
                    required
                  />
                </Field>
                <Field label="YouTube URL *">
                  <input
                    className={fieldClass}
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={ytForm.youtubeUrl}
                    onChange={(event) => setYtForm((form) => ({ ...form, youtubeUrl: event.target.value }))}
                    required
                  />
                </Field>
                <Field label="Description (optional)">
                  <textarea
                    className={`${fieldClass} min-h-[72px] resize-y`}
                    placeholder="What is this lesson about?"
                    value={ytForm.description}
                    onChange={(event) => setYtForm((form) => ({ ...form, description: event.target.value }))}
                  />
                </Field>
                <FormFooter busy={ingestMutation.isPending} disabled={ingestMutation.isPending} icon="rocket" busyText="Submitting..." text="Create Lesson">
                  Transcription takes 1-3 minutes. You can leave this page.
                </FormFooter>
              </form>
            )}

            {activeTab === 'upload' && (
              <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <span className={labelClass}>Video File * (MP4, WebM, MOV - max {MAX_UPLOAD_MB} MB)</span>
                  <input ref={fileInputRef} type="file" accept="video/*,audio/*" className="hidden" onChange={handleFileChange} />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleFileChange({ target: { files: event.dataTransfer.files } });
                    }}
                    className="cursor-pointer rounded-xl border-2 border-dashed border-accent-border bg-accent/5 p-7 text-center transition hover:bg-accent/10"
                  >
                    {selectedFile ? (
                      <div>
                        <p className="font-semibold text-accent">
                          <AppIcon name="paperclip" size={15} /> {selectedFile.name}
                        </p>
                        <p className="mt-1 text-xs text-muted">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                    ) : (
                      <div>
                        <AppIcon name="upload" size={36} strokeWidth={1.8} className="mb-2 text-accent" />
                        <p className="text-sm text-muted-text">Click or drag and drop your video here</p>
                      </div>
                    )}
                  </div>
                </div>
                <Field label="Lesson Title *">
                  <input
                    className={fieldClass}
                    placeholder="e.g. Lecture 3 - Gradient Descent"
                    value={uploadForm.title}
                    onChange={(event) => setUploadForm((form) => ({ ...form, title: event.target.value }))}
                    required
                  />
                </Field>
                <Field label="Language">
                  <select
                    className={fieldClass}
                    value={uploadForm.language}
                    onChange={(event) => setUploadForm((form) => ({ ...form, language: event.target.value }))}
                  >
                    <option value="auto">Auto-detect (recommended)</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi / Hinglish</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </Field>
                <Field label="Description (optional)">
                  <textarea
                    className={`${fieldClass} min-h-[72px] resize-y`}
                    placeholder="What is this lecture about?"
                    value={uploadForm.description}
                    onChange={(event) => setUploadForm((form) => ({ ...form, description: event.target.value }))}
                  />
                </Field>
                {/* Inline upload status/error feedback */}
                {uploadStep && (
                  <div className="flex items-center gap-2 rounded-lg border border-accent-border bg-accent/10 px-3.5 py-2.5 text-xs font-semibold text-accent">
                    <AppIcon name="loader" size={13} className="animate-spin" />
                    {uploadStep === 'requesting' && 'Step 1/3 — Requesting secure upload URL...'}
                    {uploadStep === 'uploading' && 'Step 2/3 — Uploading video to storage...'}
                    {uploadStep === 'confirming' && 'Step 3/3 — Confirming upload and queuing transcription...'}
                  </div>
                )}
                {uploadError && !uploadStep && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                    <AppIcon name="alert" size={13} className="mt-0.5 shrink-0" />
                    <span><strong>Upload failed:</strong> {uploadError}</span>
                  </div>
                )}
                <FormFooter
                  busy={isUploading}
                  disabled={isUploading || !selectedFile}
                  icon="upload"
                  busyText="Uploading..."
                  text="Upload & Process"
                >
                  Supports Hindi, Hinglish, and accented English.
                </FormFooter>
              </form>
            )}
          </div>
        </section>

        {lessons.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface-card">
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-bold">Session Lessons</h2>
                <p className="mt-0.5 text-xs text-muted">Updates every 3 seconds automatically.</p>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">{lessons.length}</span>
            </header>
            {lessons.map((lesson) => (
              <LessonRow key={lesson.lessonId} lesson={lesson} />
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-line bg-surface-card px-6 py-14 text-center">
            <AppIcon name="graduation" size={48} strokeWidth={1.8} className="mb-3.5 text-accent" />
            <p className="text-sm text-muted-text">No lessons added yet. Use the form above to get started.</p>
          </section>
        )}
      </main>
    </div>
  );
}

function TabButton({ active, icon, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-[22px] py-2 text-[13px] font-semibold transition ${
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-hover hover:text-white'
      }`}
    >
      <AppIcon name={icon} size={15} />
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function FormFooter({ busy, disabled, icon, busyText, text, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-6 py-[11px] text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-surface-hover disabled:opacity-60"
      >
        {busy ? <AppIcon name="loader" size={15} className="animate-spin" /> : <AppIcon name={icon} size={15} />}
        {busy ? busyText : text}
      </button>
      <p className="text-xs text-muted">{children}</p>
    </div>
  );
}
