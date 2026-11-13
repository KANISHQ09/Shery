import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useLessonStatus } from '../hooks/useLessonStatus';
import ChatMessage from './ChatMessage';
import AppIcon from './AppIcon';
import { useIngestYoutubeLessonMutation, useUploadLessonMutation } from '../api/lessonQueries';
import { uploadLesson } from '../services/api';
import { useLectureSummaryMutation } from '../api/chatQueries';
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES } from '../config/env';

const fieldClass = 'w-full rounded-[10px] border border-[#2a2a2a] bg-[#111] px-3.5 py-[11px] text-sm text-white outline-none focus:border-accent-border focus:ring-4 focus:ring-accent/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-[#666]';

function Badge({ lessonId, initialStatus }) {
  const skip = initialStatus === 'ready' || initialStatus === 'failed';
  const { status, progress } = useLessonStatus(lessonId, !skip);
  const current = status || initialStatus;
  const ready = current === 'ready';
  const failed = current === 'failed';

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${ready ? 'text-green-500' : failed ? 'text-red-500' : 'text-amber-500'}`}>
      <AppIcon name={ready ? 'checkCircle' : failed ? 'xCircle' : 'settings'} size={13} />
      {ready ? 'Ready' : failed ? 'Failed' : 'Processing'}
      {progress > 0 && !ready && <span className="text-[#666]">({progress}%)</span>}
    </span>
  );
}

export function VideoStudio({ onLessonReady }) {
  const [tab, setTab] = useState('youtube');
  const [ytForm, setYt] = useState({ title: '', youtubeUrl: '', description: '' });
  const [upForm, setUp] = useState({ title: '', description: '' });
  const [file, setFile] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [uploadStep, setUploadStep] = useState(''); // 'requesting' | 'uploading' | 'confirming' | ''
  const ingestMutation = useIngestYoutubeLessonMutation();
  // eslint-disable-next-line no-unused-vars
  const uploadMutation = useUploadLessonMutation(); // kept for CourseManagerPage compatibility
  const fileRef = useRef(null);

  const submitYT = async (event) => {
    event.preventDefault();
    if (!ytForm.youtubeUrl || !ytForm.title) {
      setErr('Title and YouTube URL are required');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const data = await ingestMutation.mutateAsync({ ...ytForm, courseId: 'demo-course-001', order: 1 });
      if (!data.lessonId) throw new Error(data.error || 'No lessonId returned');
      setLessons((prev) => [{ lessonId: data.lessonId, title: ytForm.title, source: 'youtube', youtubeUrl: ytForm.youtubeUrl, status: 'processing' }, ...prev]);
      setYt({ title: '', youtubeUrl: '', description: '' });
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  };

  const submitUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      setErr('Please select a video file');
      return;
    }
    if (!upForm.title) {
      setErr('Title is required');
      return;
    }
    setBusy(true);
    setErr('');
    setUploadStep('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', upForm.title);
      fd.append('description', upForm.description);
      fd.append('courseId', 'demo-course-001');
      fd.append('order', '1');
      const data = await uploadLesson(fd, setUploadStep);
      const lessonId = data?.lessonId || data?.data?.lessonId;
      if (!lessonId) throw new Error(data?.error || 'Upload failed — no lessonId returned from server.');
      setLessons((prev) => [{ lessonId, title: upForm.title, source: 'upload', status: 'uploading' }, ...prev]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setUp({ title: '', description: '' });
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
      setUploadStep('');
    }
  };

  const handleFilePick = (event) => {
    const nextFile = event.target.files[0];
    if (!nextFile) return;
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setErr(`Max file size is ${MAX_UPLOAD_MB} MB`);
      return;
    }
    setFile(nextFile);
    if (!upForm.title) setUp((form) => ({ ...form, title: nextFile.name.replace(/\.[^/.]+$/, '') }));
  };

  return (
    <div className="mx-auto max-w-[820px] px-6">
      <section className="mb-7 overflow-hidden rounded-[20px] border border-[#1e1e1e] bg-[#0e0e0e]">
        <div className="flex border-b border-[#1e1e1e] px-1">
          {[
            ['youtube', 'video', 'YouTube URL'],
            ['upload', 'upload', 'Upload Video'],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setErr('');
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-5 py-3.5 text-[13px] font-semibold transition ${
                tab === id ? 'border-accent text-accent' : 'border-transparent text-[#555]'
              }`}
            >
              <AppIcon name={icon} size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="p-7">
          {tab === 'youtube' && (
            <form onSubmit={submitYT} className="flex flex-col gap-[18px]">
              <Field label="Lesson Title *">
                <input className={fieldClass} placeholder="e.g. Introduction to Machine Learning" value={ytForm.title} onChange={(event) => setYt((form) => ({ ...form, title: event.target.value }))} required />
              </Field>
              <Field label="YouTube URL *">
                <input className={fieldClass} placeholder="https://www.youtube.com/watch?v=..." value={ytForm.youtubeUrl} onChange={(event) => setYt((form) => ({ ...form, youtubeUrl: event.target.value }))} required />
              </Field>
              <Field label="Description (optional)">
                <textarea className={`${fieldClass} min-h-[72px] resize-y`} placeholder="What is this lesson about?" value={ytForm.description} onChange={(event) => setYt((form) => ({ ...form, description: event.target.value }))} />
              </Field>
              {err && <p className="text-[13px] text-red-400"><AppIcon name="alert" size={14} /> {err}</p>}
              <SubmitRow busy={busy} disabled={!ytForm.title.trim() || !ytForm.youtubeUrl.trim()} busyText="Submitting..." icon="rocket" text="Create Lesson">
                Transcription takes 1-3 minutes.
              </SubmitRow>
            </form>
          )}

          {tab === 'upload' && (
            <form onSubmit={submitUpload} className="flex flex-col gap-[18px]">
              <div className="flex flex-col">
                <span className={labelClass}>Video File * (MP4, WebM, MOV - max {MAX_UPLOAD_MB} MB)</span>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(event) => event.key === 'Enter' && fileRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFilePick({ target: { files: event.dataTransfer.files } });
                  }}
                  className={`cursor-pointer rounded-[14px] border-2 border-dashed p-8 text-center transition ${file ? 'border-accent bg-accent/5' : 'border-[#333] bg-[#0a0a0a]'}`}
                >
                  <input ref={fileRef} type="file" accept="video/*,audio/*" className="hidden" onChange={handleFilePick} />
                  {file ? (
                    <div>
                      <p className="font-semibold text-accent"><AppIcon name="paperclip" size={15} /> {file.name}</p>
                      <p className="mt-1 text-xs text-[#555]">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div>
                      <AppIcon name="upload" size={32} strokeWidth={1.8} className="mb-2 text-accent" />
                      <p className="text-sm text-[#555]">Click or drag and drop your video here</p>
                    </div>
                  )}
                </div>
              </div>
              <Field label="Lesson Title *">
                <input className={fieldClass} placeholder="e.g. Lecture 3 - Gradient Descent" value={upForm.title} onChange={(event) => setUp((form) => ({ ...form, title: event.target.value }))} required />
              </Field>
              <Field label="Description (optional)">
                <textarea className={`${fieldClass} min-h-[72px] resize-y`} placeholder="What is this lecture about?" value={upForm.description} onChange={(event) => setUp((form) => ({ ...form, description: event.target.value }))} />
              </Field>
              {err && <p className="text-[13px] text-red-400"><AppIcon name="alert" size={14} /> {err}</p>}
              {uploadStep && (
                <div className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">
                  <AppIcon name="loader" size={12} className="animate-spin" />
                  {uploadStep === 'requesting' && 'Step 1/3 — Requesting upload URL...'}
                  {uploadStep === 'uploading' && 'Step 2/3 — Uploading video...'}
                  {uploadStep === 'confirming' && 'Step 3/3 — Confirming and queuing...'}
                </div>
              )}
              <SubmitRow busy={busy} disabled={!file} busyText="Uploading..." icon="upload" text="Upload & Process">
                Supports Hindi, Hinglish, and accented English.
              </SubmitRow>
            </form>
          )}
        </div>
      </section>

      {lessons.length > 0 ? (
        <section className="overflow-hidden rounded-[20px] border border-[#1e1e1e] bg-[#0e0e0e]">
          <header className="flex items-center justify-between border-b border-[#1a1a1a] px-6 py-4">
            <div>
              <h3 className="text-[15px] font-bold text-white">Session Videos</h3>
              <p className="mt-0.5 text-xs text-[#555]">Auto-updating every 3 s. Click a ready lesson to chat.</p>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">{lessons.length}</span>
          </header>
          {lessons.map((lesson) => (
            <LessonRow key={lesson.lessonId} lesson={lesson} onReady={onLessonReady} />
          ))}
        </section>
      ) : (
        <section className="rounded-[20px] border border-[#1e1e1e] bg-[#0e0e0e] p-14 text-center">
          <AppIcon name="graduation" size={48} strokeWidth={1.8} className="mb-3.5 text-accent" />
          <p className="text-sm text-[#555]">No videos added yet. Use the form above to get started.</p>
        </section>
      )}
    </div>
  );
}

function LessonRow({ lesson, onReady }) {
  const skip = lesson.status === 'ready' || lesson.status === 'failed';
  const { status } = useLessonStatus(lesson.lessonId, !skip);
  const current = status || lesson.status;
  const ready = current === 'ready';

  return (
    <button
      type="button"
      onClick={() => ready && onReady?.(lesson)}
      className={`flex w-full items-center justify-between gap-3 border-b border-[#111] px-6 py-3.5 text-left transition ${ready ? 'cursor-pointer hover:bg-accent/5' : 'cursor-default'}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{lesson.title}</p>
        <p className="mt-1 truncate text-[11px] text-[#555]">
          <AppIcon name={lesson.source === 'youtube' ? 'video' : 'upload'} size={13} /> {lesson.source === 'youtube' ? 'YouTube' : 'Upload'}
          {lesson.youtubeUrl ? ` · ${lesson.youtubeUrl.substring(0, 42)}...` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <Badge lessonId={lesson.lessonId} initialStatus={lesson.status} />
        {ready && <span className="text-[11px] font-semibold text-accent">Chat</span>}
      </div>
    </button>
  );
}

export function AIVideoChat({ lesson, onBack }) {
  const { messages, isStreaming, currentStreamText, followUps, error, sendMessage, stopStreaming, clearSession } = useChat(lesson?.lessonId);
  const [input, setInput] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const summaryMutation = useLectureSummaryMutation();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, currentStreamText]);

  const send = (text = input) => {
    const message = (typeof text === 'string' ? text : input).trim();
    if (!message || isStreaming) return;
    setInput('');
    sendMessage(message, () => 0);
  };

  const fetchSummary = async () => {
    setShowSummary(true);
    setLoading(true);
    setSummary('');
    try {
      const data = await summaryMutation.mutateAsync({ lessonId: lesson.lessonId, type: 'full' });
      setSummary(data.summary || 'No summary available.');
    } catch {
      setSummary('Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  };

  const starters = ['Give me a full summary', 'What are the key concepts?', 'What problems does this solve?', 'Quiz me on the main ideas'];
  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <div className="flex h-full flex-col bg-[#050505] font-sans">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#1a1a1a] bg-[#0a0a0a] px-5 py-3">
        <button type="button" onClick={onBack} className="rounded-lg border border-[#222] px-3 py-1.5 text-xs text-[#666]">Back</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white"><AppIcon name="video" size={14} /> {lesson?.title || 'AI Video Chat'}</p>
          <p className="text-[11px] text-[#444]">AI Video Intelligence · Powered by SheryAI</p>
        </div>
        <button type="button" onClick={fetchSummary} className="rounded-lg border border-[#222] bg-[#111] px-3.5 py-1.5 text-xs text-[#888]"><AppIcon name="file" size={14} /> Summary</button>
        {hasMessages && <button type="button" onClick={clearSession} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-1.5 text-xs text-red-400"><AppIcon name="trash" size={14} /> Clear</button>}
      </header>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6">
        {!hasMessages && (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-accent to-orange-400 text-white shadow-[0_0_40px_rgba(232,87,42,0.3)]">
                <AppIcon name="video" size={32} />
              </div>
              <h3 className="mb-2 text-[22px] font-extrabold text-white">AI Video Intelligence</h3>
              <p className="max-w-[400px] text-sm leading-6 text-[#555]">Ask me anything about <strong className="text-accent">{lesson?.title}</strong>.</p>
            </div>
            <div className="w-full max-w-[560px]">
              <p className="mb-3 text-left text-[11px] font-bold uppercase tracking-wider text-[#444]">Try asking</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {starters.map((question) => (
                  <button key={question} type="button" onClick={() => send(question)} className="rounded-xl border border-[#1e1e1e] bg-[#0e0e0e] px-3.5 py-3 text-left text-[13px] leading-5 text-[#888] transition hover:border-accent-border hover:text-white">
                    <AppIcon name="message" size={13} /> {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => <ChatMessage key={message.id} message={message} onSeek={() => {}} />)}
        {isStreaming && currentStreamText && <ChatMessage message={{ role: 'assistant', content: currentStreamText, id: 'streaming' }} isStreaming />}
        {error && <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-400"><AppIcon name="alert" size={14} /> {error}</div>}
        {followUps.length > 0 && !isStreaming && (
          <div className="pl-10">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#444]">Follow-up questions</p>
            <div className="flex flex-wrap gap-2">
              {followUps.map((question) => <button key={question} type="button" onClick={() => send(question)} className="rounded-full border border-accent-border bg-accent/5 px-3.5 py-1.5 text-xs text-accent">{question}</button>)}
            </div>
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-[#1a1a1a] bg-[#0a0a0a] px-5 py-4">
        <div className="mx-auto flex max-w-[860px] items-end gap-2.5 rounded-2xl border border-[#222] bg-[#111] px-3.5 py-2.5">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything about this video..."
            rows={1}
            className="max-h-[120px] flex-1 resize-none overflow-y-auto border-none bg-transparent text-sm leading-6 text-white outline-none"
          />
          <button type="button" onClick={isStreaming ? stopStreaming : send} disabled={!isStreaming && !input.trim()} className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 ${isStreaming ? 'bg-red-500/20 text-red-400' : 'bg-accent'}`}>
            <AppIcon name={isStreaming ? 'square' : 'send'} size={15} />
          </button>
        </div>
      </footer>

      {showSummary && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-6 backdrop-blur" onClick={() => setShowSummary(false)}>
          <section className="max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-3xl border border-[#1e1e1e] bg-[#0e0e0e] p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-extrabold text-white"><AppIcon name="file" size={22} className="text-accent" /> Lecture Summary</h3>
              <button type="button" onClick={() => setShowSummary(false)} className="rounded-lg border border-[#222] px-2.5 py-1 text-[#555]"><AppIcon name="x" size={16} /></button>
            </div>
            {loading ? <div className="py-14 text-center text-[#555]"><AppIcon name="loader" size={42} className="animate-spin text-accent" /><p className="mt-3">Generating summary...</p></div> : <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{summary}</p>}
          </section>
        </div>
      )}
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

function SubmitRow({ busy, disabled, busyText, icon, text, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <button type="submit" disabled={busy || disabled} className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-7 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#333] disabled:opacity-60">
        {busy ? <AppIcon name="loader" size={15} className="animate-spin" /> : <AppIcon name={icon} size={15} />}
        {busy ? busyText : text}
      </button>
      <p className="text-xs text-[#555]">{children}</p>
    </div>
  );
}
