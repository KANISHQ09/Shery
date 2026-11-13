import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  useClearFailedLessonsMutation,
  useDeleteLessonMutation,
  useDeleteFailedLessonMutation,
  useFailedLessonsQuery,
  useIngestUrlLessonMutation,
  useIngestYoutubeLessonMutation,
  useLessonsQuery,
  useUploadLessonMutation,
} from '../api/lessonQueries';
import { useLessonStatus } from '../hooks/useLessonStatus';
import LessonStatusBadge from '../components/LessonStatusBadge';
import Navbar from '../components/Navbar';
import AppIcon from '../components/AppIcon';
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES } from '../config/env';

const fieldClass =
  'w-full rounded-[10px] border border-line bg-surface-input px-3.5 py-[11px] text-sm text-white outline-none transition placeholder:text-muted focus:border-accent-border focus:ring-4 focus:ring-accent/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-muted';

function appendFormValue(formData, key, value) {
  if (value === undefined || value === null || value === '') return;
  formData.append(key, value);
}

function formatSource(lesson) {
  if (lesson.source === 'youtube') return 'YouTube captions';
  if (lesson.source === 'upload') return 'Uploaded media';
  if (lesson.source === 'url') return 'Public URL';
  return lesson.source || 'Lesson';
}

function LessonRow({ lesson, index, onDelete, deleting }) {
  const lessonId = lesson.id || lesson.lessonId;
  const { status, progress, chunkCount, error } = useLessonStatus(
    lessonId,
    lesson.status !== 'ready' && lesson.status !== 'failed'
  );
  const currentStatus = status || lesson.status;
  const indexedChunks = chunkCount || lesson.chunkCount || 0;
  const chapters = lesson.topicSegments?.length || 0;
  const isReady = currentStatus === 'ready';

  return (
    <div className="grid gap-3 border-b border-line px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_180px_170px] md:items-center md:px-5">
      <div className="min-w-0">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-hover text-[11px] font-bold text-muted-text">
            {index + 1}
          </span>
          <p className="min-w-0 truncate text-sm font-semibold text-white">{lesson.title || 'Untitled lesson'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-muted">
          <span>
            <AppIcon name={lesson.source === 'youtube' ? 'video' : 'upload'} size={13} /> {formatSource(lesson)}
          </span>
          {lesson.duration > 0 && (
            <span>
              <AppIcon name="clock" size={13} /> {Math.round(lesson.duration / 60)} min
            </span>
          )}
          {indexedChunks > 0 && (
            <span>
              <AppIcon name="bot" size={13} /> {indexedChunks} chunks
            </span>
          )}
          {chapters > 0 && (
            <span>
              <AppIcon name="target" size={13} /> {chapters} chapters
            </span>
          )}
        </div>
        {lesson.description && <p className="mt-2 line-clamp-2 pl-9 text-xs leading-5 text-muted-text">{lesson.description}</p>}
      </div>

      <LessonStatusBadge status={currentStatus} progress={progress} chunkCount={indexedChunks} error={error} />

      <div className="flex flex-wrap justify-start gap-2 md:justify-end">
        <Link
          to={`/lesson/${lessonId}`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
            isReady
              ? 'border-accent-border bg-accent-soft text-accent'
              : 'pointer-events-none border-line bg-surface-hover text-muted opacity-60'
          }`}
        >
          <AppIcon name="play" size={13} /> Watch
        </Link>
        <Link
          to={`/lesson/${lessonId}/quiz`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
            isReady
              ? 'border-line bg-surface-hover text-muted-text hover:text-white'
              : 'pointer-events-none border-line bg-surface-hover text-muted opacity-60'
          }`}
        >
          <AppIcon name="brain" size={13} /> Quiz
        </Link>
        <button
          type="button"
          onClick={() => onDelete(lesson)}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AppIcon name={deleting ? 'loader' : 'trash'} size={13} className={deleting ? 'animate-spin' : ''} /> Delete
        </button>
      </div>
    </div>
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

function Stat({ label, value, icon }) {
  return (
    <div className="rounded-lg border border-line bg-surface-hover px-3.5 py-3">
      <p className="mb-1 text-[11px] font-semibold uppercase text-muted">
        <AppIcon name={icon} size={13} /> {label}
      </p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function SubmitButton({ busy, disabled, icon, busyText, children }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted"
    >
      <AppIcon name={busy ? 'loader' : icon} size={15} className={busy ? 'animate-spin' : ''} />
      {busy ? busyText : children}
    </button>
  );
}

function FailedLessonCard({ lesson, onDelete, deleting }) {
  const lessonId = lesson.id || lesson.lessonId;
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{lesson.title || 'Failed lesson'}</p>
          <p className="mt-1 text-xs text-red-300">
            <AppIcon name="alert" size={13} /> {lesson.error || lesson.failureReason || 'Processing failed'}
          </p>
          <p className="mt-1 text-xs text-muted">
            <AppIcon name={lesson.source === 'youtube' ? 'video' : lesson.source === 'url' ? 'link' : 'upload'} size={13} /> {formatSource(lesson)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(lessonId)}
          disabled={deleting}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AppIcon name={deleting ? 'loader' : 'trash'} size={13} className={deleting ? 'animate-spin' : ''} />
          Delete
        </button>
      </div>
    </div>
  );
}

export default function CourseManagerPage() {
  const { courseId } = useParams();
  const fileInputRef = useRef(null);
  const ingestMutation = useIngestYoutubeLessonMutation();
  const ingestUrlMutation = useIngestUrlLessonMutation();
  const uploadMutation = useUploadLessonMutation();
  const deleteLessonMutation = useDeleteLessonMutation(courseId);
  const deleteFailedMutation = useDeleteFailedLessonMutation(courseId);
  const clearFailedMutation = useClearFailedLessonsMutation(courseId);
  const [selectedFile, setSelectedFile] = useState(null);
  const [deletingLessonId, setDeletingLessonId] = useState('');
  const [youtubeForm, setYoutubeForm] = useState({
    title: '',
    description: '',
    youtubeUrl: '',
    moduleId: '',
    order: 1,
  });
  const [urlForm, setUrlForm] = useState({
    title: '',
    description: '',
    sourceUrl: '',
    moduleId: '',
    language: 'auto',
    order: 1,
  });
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    moduleId: '',
    language: 'auto',
    order: 1,
  });

  const lessonsQuery = useLessonsQuery(courseId, {
    refetchInterval: (query) => {
      const lessons = query.state.data?.lessons || [];
      return lessons.some((lesson) => lesson.status !== 'ready' && lesson.status !== 'failed') ? 3000 : false;
    },
  });
  const failedQuery = useFailedLessonsQuery(courseId);
  const lessons = lessonsQuery.data?.lessons || [];
  const failedLessons = failedQuery.data?.lessons || [];
  const readyCount = lessons.filter((lesson) => lesson.status === 'ready').length;
  const processingCount = lessons.filter((lesson) => lesson.status !== 'ready' && lesson.status !== 'failed').length;
  const failedCount = failedQuery.data?.total ?? failedLessons.length;
  const totalChunks = lessons.reduce((total, lesson) => total + (lesson.chunkCount || 0), 0);

  const updateYoutubeField = (field, value) => setYoutubeForm((form) => ({ ...form, [field]: value }));
  const updateUrlField = (field, value) => setUrlForm((form) => ({ ...form, [field]: value }));
  const updateUploadField = (field, value) => setUploadForm((form) => ({ ...form, [field]: value }));

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Max upload size is ${MAX_UPLOAD_MB} MB`);
      return;
    }
    setSelectedFile(file);
    if (!uploadForm.title) updateUploadField('title', file.name.replace(/\.[^/.]+$/, ''));
  };

  const submitYoutube = async (event) => {
    event.preventDefault();
    if (!youtubeForm.title.trim() || !youtubeForm.youtubeUrl.trim()) {
      toast.error('Title and YouTube URL are required');
      return;
    }

    try {
      await ingestMutation.mutateAsync({
        ...youtubeForm,
        title: youtubeForm.title.trim(),
        youtubeUrl: youtubeForm.youtubeUrl.trim(),
        courseId,
      });
      toast.success('YouTube lesson added. Captions are being indexed.');
      setYoutubeForm((form) => ({ ...form, title: '', description: '', youtubeUrl: '' }));
    } catch (err) {
      if (err.data?.details?.suggestedAction === 'upload_video') {
        setUploadForm((form) => ({
          ...form,
          title: youtubeForm.title,
          description: youtubeForm.description,
          moduleId: youtubeForm.moduleId,
          order: youtubeForm.order,
        }));
      }
      toast.error(err.message || 'Failed to ingest YouTube lesson');
    }
  };

  const submitUpload = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      toast.error('Select a video or audio file first');
      return;
    }
    if (!uploadForm.title.trim()) {
      toast.error('Lesson title is required');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      appendFormValue(formData, 'courseId', courseId);
      Object.entries(uploadForm).forEach(([key, value]) => appendFormValue(formData, key, value));
      await uploadMutation.mutateAsync(formData);
      toast.success('Upload started. Processing status will update here.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadForm((form) => ({ ...form, title: '', description: '' }));
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    }
  };

  const submitUrl = async (event) => {
    event.preventDefault();
    if (!urlForm.title.trim() || !urlForm.sourceUrl.trim()) {
      toast.error('Title and public URL are required');
      return;
    }

    try {
      await ingestUrlMutation.mutateAsync({
        ...urlForm,
        title: urlForm.title.trim(),
        sourceUrl: urlForm.sourceUrl.trim(),
        courseId,
      });
      toast.success('Public recording added. Processing status will update here.');
      setUrlForm((form) => ({ ...form, title: '', description: '', sourceUrl: '' }));
    } catch (err) {
      toast.error(err.message || 'Failed to ingest public URL');
    }
  };

  const deleteFailed = async (lessonId) => {
    try {
      await deleteFailedMutation.mutateAsync(lessonId);
      toast.success('Failed lesson deleted');
    } catch (err) {
      toast.error(err.message || 'Could not delete failed lesson');
    }
  };

  const deleteLesson = async (lesson) => {
    const lessonId = lesson.id || lesson.lessonId;
    const confirmed = window.confirm(`Delete "${lesson.title || 'this lesson'}"? This removes the lesson, transcript chunks, and uploaded video file.`);
    if (!confirmed) return;

    setDeletingLessonId(lessonId);
    try {
      await deleteLessonMutation.mutateAsync(lessonId);
      toast.success('Lesson deleted');
    } catch (err) {
      toast.error(err.message || 'Could not delete lesson');
    } finally {
      setDeletingLessonId('');
    }
  };

  const clearFailed = async () => {
    try {
      await clearFailedMutation.mutateAsync();
      toast.success('Failed lessons cleared');
    } catch (err) {
      toast.error(err.message || 'Could not clear failed lessons');
    }
  };

  return (
    <div className="min-h-screen bg-surface-base font-sans text-white">
      <Navbar />
      <main className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link to="/instructor" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-text hover:text-white">
              <AppIcon name="chevronLeft" size={14} /> Instructor Studio
            </Link>
            <h1 className="text-2xl font-extrabold">Course Lesson Manager</h1>
            <p className="mt-1.5 text-sm text-muted">
              Course ID: <span className="font-mono text-muted-text">{courseId}</span>
            </p>
          </div>
          <Link to="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-card px-4 py-2 text-sm font-semibold text-muted-text hover:text-white">
            <AppIcon name="book" size={15} /> Student view
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Lessons" value={lessons.length} icon="video" />
          <Stat label="Ready" value={readyCount} icon="checkCircle" />
          <Stat label="Processing" value={processingCount} icon="loader" />
          <Stat label="AI Chunks" value={totalChunks} icon="bot" />
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <form onSubmit={submitYoutube} className="rounded-2xl border border-line bg-surface-card p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Add YouTube Lesson</h2>
                <p className="mt-1 text-xs leading-5 text-muted">Uses available YouTube captions, then stores transcript chunks for AI tools.</p>
              </div>
              <span className="rounded-full border border-accent-border bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                <AppIcon name="video" size={13} /> Captions
              </span>
            </div>
            <div className="grid gap-4">
              <Field label="Lesson title *">
                <input className={fieldClass} value={youtubeForm.title} onChange={(event) => updateYoutubeField('title', event.target.value)} placeholder="Introduction to Machine Learning" />
              </Field>
              <Field label="YouTube URL *">
                <input className={fieldClass} value={youtubeForm.youtubeUrl} onChange={(event) => updateYoutubeField('youtubeUrl', event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Module ID">
                  <input className={fieldClass} value={youtubeForm.moduleId} onChange={(event) => updateYoutubeField('moduleId', event.target.value)} placeholder="optional" />
                </Field>
                <Field label="Order">
                  <input type="number" min="1" className={fieldClass} value={youtubeForm.order} onChange={(event) => updateYoutubeField('order', event.target.value)} />
                </Field>
              </div>
              <Field label="Description">
                <textarea className={`${fieldClass} min-h-[84px] resize-y`} value={youtubeForm.description} onChange={(event) => updateYoutubeField('description', event.target.value)} placeholder="What should students expect?" />
              </Field>
              <SubmitButton busy={ingestMutation.isPending} disabled={!youtubeForm.title.trim() || !youtubeForm.youtubeUrl.trim()} icon="rocket" busyText="Creating...">
                Create YouTube Lesson
              </SubmitButton>
            </div>
          </form>

          <form onSubmit={submitUrl} className="rounded-2xl border border-line bg-surface-card p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Import Public Recording</h2>
                <p className="mt-1 text-xs leading-5 text-muted">Use Google Drive, Zoom download links, or any readable media URL.</p>
              </div>
              <span className="rounded-full border border-accent-border bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                <AppIcon name="link" size={13} /> URL
              </span>
            </div>
            <div className="grid gap-4">
              <Field label="Lesson title *">
                <input className={fieldClass} value={urlForm.title} onChange={(event) => updateUrlField('title', event.target.value)} placeholder="Meeting recording" />
              </Field>
              <Field label="Public source URL *">
                <input className={fieldClass} value={urlForm.sourceUrl} onChange={(event) => updateUrlField('sourceUrl', event.target.value)} placeholder="https://drive.google.com/file/d/..." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language">
                  <select className={fieldClass} value={urlForm.language} onChange={(event) => updateUrlField('language', event.target.value)}>
                    <option value="auto">Auto</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi / Hinglish</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </Field>
                <Field label="Module ID">
                  <input className={fieldClass} value={urlForm.moduleId} onChange={(event) => updateUrlField('moduleId', event.target.value)} placeholder="optional" />
                </Field>
                <Field label="Order">
                  <input type="number" min="1" className={fieldClass} value={urlForm.order} onChange={(event) => updateUrlField('order', event.target.value)} />
                </Field>
              </div>
              <Field label="Description">
                <textarea className={`${fieldClass} min-h-[84px] resize-y`} value={urlForm.description} onChange={(event) => updateUrlField('description', event.target.value)} placeholder="Optional context for this recording" />
              </Field>
              <SubmitButton busy={ingestUrlMutation.isPending} disabled={!urlForm.title.trim() || !urlForm.sourceUrl.trim()} icon="link" busyText="Importing...">
                Import Recording
              </SubmitButton>
            </div>
          </form>

          <form onSubmit={submitUpload} className="rounded-2xl border border-line bg-surface-card p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Upload Video or Audio</h2>
                <p className="mt-1 text-xs leading-5 text-muted">Sends media to the backend upload endpoint with browser seeking support after processing.</p>
              </div>
              <span className="rounded-full border border-accent-border bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                <AppIcon name="upload" size={13} /> {MAX_UPLOAD_MB} MB
              </span>
            </div>
            <div className="grid gap-4">
              <div className="flex flex-col">
                <span className={labelClass}>Media file *</span>
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
                  className="cursor-pointer rounded-xl border-2 border-dashed border-accent-border bg-accent/5 px-4 py-6 text-center transition hover:bg-accent/10"
                >
                  {selectedFile ? (
                    <div>
                      <p className="font-semibold text-accent">
                        <AppIcon name="paperclip" size={15} /> {selectedFile.name}
                      </p>
                      <p className="mt-1 text-xs text-muted">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB selected</p>
                    </div>
                  ) : (
                    <div>
                      <AppIcon name="upload" size={34} strokeWidth={1.8} className="mb-2 text-accent" />
                      <p className="text-sm text-muted-text">Click or drag media here</p>
                    </div>
                  )}
                </div>
              </div>
              <Field label="Lesson title *">
                <input className={fieldClass} value={uploadForm.title} onChange={(event) => updateUploadField('title', event.target.value)} placeholder="Lecture 3 - Gradient Descent" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language">
                  <select className={fieldClass} value={uploadForm.language} onChange={(event) => updateUploadField('language', event.target.value)}>
                    <option value="auto">Auto</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi / Hinglish</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </Field>
                <Field label="Module ID">
                  <input className={fieldClass} value={uploadForm.moduleId} onChange={(event) => updateUploadField('moduleId', event.target.value)} placeholder="optional" />
                </Field>
                <Field label="Order">
                  <input type="number" min="1" className={fieldClass} value={uploadForm.order} onChange={(event) => updateUploadField('order', event.target.value)} />
                </Field>
              </div>
              <Field label="Description">
                <textarea className={`${fieldClass} min-h-[84px] resize-y`} value={uploadForm.description} onChange={(event) => updateUploadField('description', event.target.value)} placeholder="What should students expect?" />
              </Field>
              <SubmitButton busy={uploadMutation.isPending} disabled={!selectedFile} icon="upload" busyText="Uploading...">
                Upload and Process
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-surface-card">
          <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold">Course Lessons</h2>
              <p className="mt-1 text-xs text-muted">
                Status polls while lessons process. Ready lessons unlock video, AI tutor, summaries, captions, chapters, and quizzes.
              </p>
            </div>
            {failedCount > 0 && <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400">{failedCount} failed</span>}
          </header>

          {lessonsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-16 text-muted">
              <AppIcon name="loader" size={28} className="animate-spin text-accent" /> Loading lessons...
            </div>
          ) : lessons.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <AppIcon name="graduation" size={44} strokeWidth={1.8} className="mb-3 text-accent" />
              <p className="font-semibold text-white">No video lessons yet</p>
              <p className="mt-1 text-sm text-muted">Add a YouTube URL or upload media to make the AI lesson tools visible here.</p>
            </div>
          ) : (
            <div>
              {lessons.map((lesson, index) => (
                <LessonRow
                  key={lesson.id || lesson.lessonId}
                  lesson={lesson}
                  index={index}
                  onDelete={deleteLesson}
                  deleting={deletingLessonId === (lesson.id || lesson.lessonId)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-red-500/20 bg-surface-card">
          <header className="flex flex-col gap-3 border-b border-red-500/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold">Failed Lessons</h2>
              <p className="mt-1 text-xs text-muted">Videos without captions, private links, and broken uploads appear here so the main dashboard stays clean.</p>
            </div>
            {failedCount > 0 && (
              <button
                type="button"
                onClick={clearFailed}
                disabled={clearFailedMutation.isPending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AppIcon name={clearFailedMutation.isPending ? 'loader' : 'trash'} size={13} className={clearFailedMutation.isPending ? 'animate-spin' : ''} />
                Clear all failed
              </button>
            )}
          </header>

          {failedQuery.isLoading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-10 text-muted">
              <AppIcon name="loader" size={24} className="animate-spin text-accent" /> Loading failed lessons...
            </div>
          ) : failedCount === 0 ? (
            <div className="px-5 py-10 text-center">
              <AppIcon name="checkCircle" size={34} strokeWidth={1.8} className="mb-2 text-green-500" />
              <p className="text-sm font-semibold text-white">No failed lessons</p>
              <p className="mt-1 text-xs text-muted">New failures from YouTube captions or private URLs will show here.</p>
            </div>
          ) : (
            <div className="grid gap-3 p-4">
              {failedLessons.map((lesson) => (
                <FailedLessonCard
                  key={lesson.id || lesson.lessonId}
                  lesson={lesson}
                  onDelete={deleteFailed}
                  deleting={deleteFailedMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
