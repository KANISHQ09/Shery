import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ChatPanel from '../components/ChatPanel';
import CustomVideoPlayer from '../components/CustomVideoPlayer';
import LessonStatusBadge from '../components/LessonStatusBadge';
import VideoChapterBar from '../components/VideoChapterBar';
import SubtitleOverlay, { SubtitleControls } from '../components/SubtitleOverlay';
import { useSubtitles } from '../hooks/useSubtitles';
import { useLessonQuery, useLessonsQuery, useRegenerateChaptersMutation } from '../api/lessonQueries';
import { getLesson } from '../services/api';
import { buildApiUrl } from '../config/env';
import { useLessonStatus } from '../hooks/useLessonStatus';
import AppIcon from '../components/AppIcon';
import ProgressSummary from '../components/ProgressSummary';
import SummaryPdfModal from '../components/SummaryPdfModal';

const DEMO_COURSE = 'demo-course-001';

function buildVideoUrl(lesson) {
  if (!lesson) return '';
  if (lesson.youtubeVideoId || lesson.source === 'youtube') return '';
  const id = lesson.lessonId || lesson.id;
  return buildApiUrl(`/api/lessons/${id}/video?role=student&delivery=proxy`);
}

async function readVideoEndpointError(videoSrc) {
  if (!videoSrc) return '';
  try {
    const response = await fetch(videoSrc, {
      headers: {
        Range: 'bytes=0-0',
        'x-demo-role': localStorage.getItem('demo_role') || 'student',
      },
    });
    if (response.ok || response.status === 206) return '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data.message || data.error || `Video request failed with HTTP ${response.status}.`;
    }
    const text = await response.text();
    return text?.trim() || `Video request failed with HTTP ${response.status}.`;
  } catch {
    return '';
  }
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__sheryYouTubeApiPromise) return window.__sheryYouTubeApiPromise;

  window.__sheryYouTubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('Could not load YouTube player API'));
    document.head.appendChild(script);
  });

  return window.__sheryYouTubeApiPromise;
}

function SidebarLessonRow({ lesson, index, isActive, onClick }) {
  const isReady = lesson.status === 'ready';
  return (
    <button
      type="button"
      onClick={() => isReady && onClick(lesson)}
      className={`flex w-full items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-left transition ${
        isActive
          ? 'border-accent-border bg-accent-soft text-accent'
          : isReady
            ? 'border-transparent text-muted-text hover:bg-surface-hover hover:text-white'
            : 'border-transparent text-muted'
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          isActive
            ? 'border-accent bg-accent text-white'
            : isReady
              ? 'border-green-500/30 bg-green-500/10 text-green-500'
              : 'border-line bg-white/5 text-muted'
        }`}
      >
        <AppIcon name={isActive ? 'play' : isReady ? 'check' : 'circle'} size={12} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {index + 1} - {lesson.title}
      </span>
      {lesson.chunkCount > 0 && <span className="shrink-0 text-[10px] text-muted">{lesson.chunkCount}c</span>}
    </button>
  );
}

export default function LessonPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [midTab, setMidTab] = useState('ai');
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoError, setVideoError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [regeneratingChapters, setRegeneratingChapters] = useState(false);

  const playerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const pollRef = useRef(null);
  const videoRef = useRef(null);
  const currentTimeRef = useRef(0);
  const autoRegenDone = useRef(false);
  const lessonQuery = useLessonQuery(lessonId);
  const activeCourseId = lesson?.courseId || lessonQuery.data?.lesson?.courseId || DEMO_COURSE;
  const lessonsQuery = useLessonsQuery(activeCourseId);
  const regenerateMutation = useRegenerateChaptersMutation(lessonId);
  const allLessons = lessonsQuery.data?.lessons || [];
  const loading = lessonQuery.isLoading || lessonsQuery.isLoading;

  const { status: liveStatus } = useLessonStatus(lessonId, lesson?.status !== 'ready' && lesson?.status !== 'failed');

  useEffect(() => {
    if (lessonQuery.data?.lesson) setLesson(lessonQuery.data.lesson);
  }, [lessonQuery.data]);

  useEffect(() => {
    autoRegenDone.current = false;
    currentTimeRef.current = 0;
    setCurrentTime(0);
  }, [lessonId]);

  useEffect(() => {
    if (liveStatus === 'ready' && lesson?.status !== 'ready') {
      getLesson(lessonId).then((data) => setLesson(data.lesson)).catch(() => {});
    }
  }, [liveStatus, lesson?.status, lessonId]);

  useEffect(() => {
    const isReady = (liveStatus || lesson?.status) === 'ready';
    if (!isReady || !lesson || autoRegenDone.current) return;
    if ((lesson.topicSegments?.length ?? 0) <= 1) {
      autoRegenDone.current = true;
      regenerateMutation.mutateAsync()
        .then((data) => {
          if (data.topicSegments) setLesson((prev) => ({ ...prev, topicSegments: data.topicSegments }));
        })
        .catch(() => {
          // Reset so it can retry if the user revisits or the component re-renders
          autoRegenDone.current = false;
        });
    }
  }, [lesson?.status, liveStatus, lesson?.topicSegments?.length, lessonId]);

  useEffect(() => {
    if (lesson?.videoUrl || lesson?.status === 'failed' || lesson?.source !== 'upload') return;
    const timer = setInterval(() => {
      getLesson(lessonId)
        .then((data) => {
          if (data.lesson?.videoUrl) setLesson(data.lesson);
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [lesson?.videoUrl, lesson?.source, lesson?.status, lessonId]);

  useEffect(() => {
    if (!lesson?.youtubeVideoId || !playerRef.current) return undefined;
    let cancelled = false;
    clearInterval(pollRef.current);
    youtubePlayerRef.current?.destroy?.();
    youtubePlayerRef.current = null;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerRef.current) return;
        youtubePlayerRef.current = new YT.Player(playerRef.current, {
          videoId: lesson.youtubeVideoId,
          playerVars: {
            controls: 1,
            enablejsapi: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              const duration = Number(event.target.getDuration?.() || 0);
              if (duration > 0) setVideoDuration(duration);
              pollRef.current = window.setInterval(() => {
                const t = Number(event.target.getCurrentTime?.() || 0);
                const nextDuration = Number(event.target.getDuration?.() || 0);
                currentTimeRef.current = t;
                setCurrentTime(Math.floor(t));
                if (nextDuration > 0) setVideoDuration(nextDuration);
              }, 250);
            },
          },
        });
      })
      .catch(() => setVideoError('YouTube player could not load. Try opening the video on YouTube.'));

    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
      youtubePlayerRef.current?.destroy?.();
      youtubePlayerRef.current = null;
    };
    // `loading` matters: while it is true the player <div> is not mounted (playerRef is null),
    // so the effect must re-run once the page finishes loading.
  }, [lesson?.youtubeVideoId, lessonId, loading]);

  const seekTo = useCallback(
    (seconds) => {
      if (lesson?.youtubeVideoId) {
        youtubePlayerRef.current?.seekTo?.(seconds, true);
      } else if (videoRef.current) {
        videoRef.current.currentTime = seconds;
        videoRef.current.play().catch(() => {});
      }
      setCurrentTime(seconds);
      currentTimeRef.current = seconds;
    },
    [lesson?.youtubeVideoId]
  );

  const getVideoTime = useCallback(() => {
    if (videoRef.current) return Math.floor(videoRef.current.currentTime || 0);
    return currentTime;
  }, [currentTime]);

  const currentIdx = allLessons.findIndex((item) => item.id === lessonId || item.lessonId === lessonId);
  const prevLesson = allLessons[currentIdx - 1];
  const nextLesson = allLessons[currentIdx + 1];
  const currentStatus = liveStatus || lesson?.status;
  const isReady = currentStatus === 'ready';
  const isYouTube = Boolean(lesson?.youtubeVideoId);
  const canLoadUploadedVideo = !isYouTube && (Boolean(lesson?.videoUrl) || isReady);
  const readyCount = allLessons.filter((item) => item.status === 'ready').length;
  const pct = allLessons.length > 0 ? Math.round((readyCount / allLessons.length) * 100) : 0;
  const videoSrc = buildVideoUrl(lesson);

  const subtitles = useSubtitles(lessonId, isYouTube ? null : videoRef, isYouTube ? currentTimeRef : null, isYouTube);

  const handleVideoLoadError = useCallback(async () => {
    const endpointMessage = await readVideoEndpointError(videoSrc);
    if (/not found/i.test(endpointMessage)) {
      setVideoError('Video file not found on server. This lesson record still exists, but the stored media file is missing. Re-upload or re-import the lesson from Course Lesson Manager.');
      return;
    }
    setVideoError(endpointMessage || 'Video could not load. Check the backend video endpoint, storage access, or CORS response.');
  }, [videoSrc]);

  useEffect(() => {
    setVideoError('');
  }, [lessonId, lesson?.videoUrl, lesson?.source]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-base">
        <AppIcon name="loader" size={36} className="animate-spin text-accent" />
        <p className="text-[13px] text-muted">Loading lesson...</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-y-auto bg-surface-base xl:h-screen xl:max-h-screen xl:min-h-0 xl:overflow-hidden">
      <Navbar />

      <main className={`grid min-h-0 flex-1 grid-cols-1 overflow-visible xl:overflow-hidden ${sidebarCollapsed ? 'xl:grid-cols-[52px_minmax(320px,0.9fr)_minmax(420px,1.15fr)]' : 'xl:grid-cols-[240px_minmax(320px,0.9fr)_minmax(420px,1.15fr)]'}`}>
        <aside className={`${sidebarCollapsed ? 'hidden xl:flex' : 'flex'} order-3 min-h-[300px] min-w-0 flex-col overflow-hidden border-t border-line bg-surface-nav xl:order-1 xl:min-h-0 xl:border-r xl:border-t-0`}>
          <header className="border-b border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              {!sidebarCollapsed && <Link to="/dashboard" className="text-xs font-medium text-muted-text">Back to course</Link>}
              <button type="button" onClick={() => setSidebarCollapsed((value) => !value)} className="rounded-lg border border-line bg-surface-card px-2 py-1 text-xs text-muted">
                {sidebarCollapsed ? 'Open' : 'Hide'}
              </button>
            </div>

            {!sidebarCollapsed && (
              <ProgressSummary
                percent={pct}
                compact
                stats={[{ label: 'Lessons', value: `${readyCount}/${allLessons.length}` }]}
                className="rounded-xl"
              />
            )}
          </header>

          {!sidebarCollapsed && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pb-16 xl:pb-2.5">
              <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                <AppIcon name="book" size={13} /> Lessons <span className="ml-auto">{allLessons.length}</span>
              </div>
              <div className="grid gap-1 sm:grid-cols-2 xl:flex xl:flex-col">
                {allLessons.map((item, index) => (
                  <SidebarLessonRow
                    key={item.id || item.lessonId}
                    lesson={item}
                    index={index}
                    isActive={(item.id || item.lessonId) === lessonId}
                    onClick={(next) => navigate(`/lesson/${next.id || next.lessonId}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="order-2 flex h-[680px] min-h-[520px] min-w-0 flex-col overflow-hidden border-t border-line bg-surface-base sm:h-[720px] xl:order-2 xl:h-auto xl:min-h-0 xl:border-r xl:border-t-0">
          <header className="flex shrink-0 items-center overflow-x-auto border-b border-line bg-surface-nav px-3 sm:px-4">
            <TabButton active={midTab === 'class'} onClick={() => setMidTab('class')} icon="circleDot">Class</TabButton>
            <TabButton active={midTab === 'ai'} onClick={() => setMidTab('ai')} icon="bot">AI Tutor</TabButton>
            {subtitles.hasTranscript && (
              <TabButton active={midTab === 'transcript'} onClick={() => setMidTab('transcript')} icon="alignLeft">Transcript</TabButton>
            )}
            <div className="ml-auto flex min-w-0 items-center gap-2 overflow-hidden">
              <LessonStatusBadge status={currentStatus} chunkCount={lesson?.chunkCount || 0} />
            </div>
          </header>

          {midTab === 'class' ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold leading-7 text-white">{lesson?.title}</h2>
                  {lesson?.description && <p className="mt-1.5 text-[13px] leading-6 text-muted-text">{lesson.description}</p>}
                </div>
                {isReady && (
                  <Link to={`/lesson/${lessonId}/quiz`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
                    <AppIcon name="brain" size={13} /> Quiz
                  </Link>
                )}
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                <Pill icon={lesson?.source === 'youtube' ? 'video' : 'upload'}>{lesson?.source === 'youtube' ? 'YouTube' : 'Upload'}</Pill>
                {lesson?.chunkCount > 0 && <Pill icon="bot">{lesson.chunkCount} AI chunks</Pill>}
              </div>

              {isReady && (
                <section className="mb-6">
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                      <AppIcon name="target" size={13} /> Chapters {lesson?.topicSegments?.length > 0 ? `(${lesson.topicSegments.length})` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        setRegeneratingChapters(true);
                        try {
                          await regenerateMutation.mutateAsync();
                          const data = await getLesson(lessonId);
                          if (data.lesson) setLesson(data.lesson);
                        } finally {
                          setRegeneratingChapters(false);
                        }
                      }}
                      disabled={regeneratingChapters}
                      className="inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent disabled:opacity-60"
                    >
                      <AppIcon name={regeneratingChapters ? 'loader' : 'refresh'} size={12} className={regeneratingChapters ? 'animate-spin' : ''} />
                      {regeneratingChapters ? 'Generating...' : 'Regenerate'}
                    </button>
                  </div>
                  {lesson?.topicSegments?.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {lesson.topicSegments.map((segment, index) => (
                        <button
                          key={`${segment.startTime}-${index}`}
                          type="button"
                          onClick={() => seekTo(segment.startTime)}
                          className="flex items-center gap-2 rounded-lg border border-line bg-surface-card px-3 py-2 text-left transition hover:border-accent-border hover:bg-accent-soft"
                        >
                          <span className="shrink-0 font-mono text-[11px] text-accent">{segment.startLabel}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-white">{segment.topic}</span>
                          <AppIcon name="play" size={12} className="text-accent" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted">Chapters are being generated from the lecture transcript.</p>
                  )}
                </section>
              )}

              {!isReady && (
                <section className="rounded-2xl border border-line bg-surface-card p-8 text-center">
                  <AppIcon name="settings" size={24} className="mb-1.5 text-accent" />
                  <p className="text-[13px] text-muted">AI is processing this lesson. The chat and chapters unlock when indexing is ready.</p>
                </section>
              )}

              {lesson?.youtubeUrl && (
                <a href={lesson.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-card px-3 py-2 text-[13px] text-muted-text">
                  <AppIcon name="video" size={14} /> Open on YouTube
                </a>
              )}
            </div>
          ) : midTab === 'transcript' ? (
            <TranscriptPanel
              blocks={subtitles.blocks}
              rawChunks={subtitles.rawChunks}
              loading={subtitles.loading}
              error={subtitles.error}
              currentTime={currentTime}
              onSeek={seekTo}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              {isReady ? (
                <ChatPanel lessonId={lessonId} lesson={lesson} onSeek={seekTo} getVideoTime={getVideoTime} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                  <AppIcon name="bot" size={48} strokeWidth={1.8} className="text-accent" />
                  <h3 className="text-lg font-bold text-white">AI Tutor preparing</h3>
                  <p className="max-w-[320px] text-sm leading-6 text-muted">This lesson is still being transcribed and indexed.</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="order-1 flex h-[min(68vh,560px)] min-h-[320px] min-w-0 flex-col overflow-hidden bg-black sm:min-h-[420px] xl:order-3 xl:h-auto xl:min-h-0">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-nav px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-white">
              <AppIcon name="video" size={15} className="text-accent" /> Video Lecture
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isReady && <Link to={`/lesson/${lessonId}/quiz`} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">Quiz</Link>}

              <SubtitleControls subtitles={subtitles} />
            </div>
          </header>

          <div className="group/video relative min-h-0 flex-1 overflow-hidden bg-black">
            {lesson?.youtubeVideoId ? (
              <div
                ref={playerRef}
                className="block h-full w-full bg-black [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
              />
            ) : canLoadUploadedVideo ? (
              <CustomVideoPlayer
                ref={videoRef}
                src={videoSrc}
                title={lesson?.title || 'Lesson video'}
                subtitles={subtitles}
                segments={lesson?.topicSegments || []}
                onLoadedMetadata={(event) => {
                  setVideoDuration(event.currentTarget.duration || 0);
                  setVideoError('');
                }}
                onError={handleVideoLoadError}
                onTimeUpdate={(event) => {
                  const t = Math.floor(event.currentTarget.currentTime);
                  currentTimeRef.current = t;
                  setCurrentTime(t);
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
                <AppIcon name="loader" size={44} className="animate-spin" />
                <p className="text-[13px]">Preparing video...</p>
              </div>
            )}
            {lesson?.youtubeVideoId && (
              <div className="absolute bottom-16 right-4 z-40 opacity-0 transition group-hover/video:opacity-100 group-focus-within/video:opacity-100">
                <SubtitleControls subtitles={subtitles} />
              </div>
            )}

            {videoError && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-5 text-center">
                <div className="max-w-[360px] rounded-2xl border border-line bg-surface-card p-5 shadow-2xl">
                  <AppIcon name="alert" size={28} className="mx-auto mb-3 text-accent" />
                  <p className="text-sm font-semibold text-white">Video is not loading</p>
                  <p className="mt-2 text-xs leading-5 text-muted-text">{videoError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setVideoError('');
                      videoRef.current?.load?.();
                    }}
                    className="mt-4 inline-flex items-center justify-center rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-xs font-semibold text-accent"
                  >
                    Retry video
                  </button>
                  {lesson?.courseId && (
                    <Link to={`/instructor/course/${lesson.courseId}`} className="ml-2 mt-4 inline-flex items-center justify-center rounded-lg border border-line bg-surface-hover px-3 py-2 text-xs font-semibold text-muted-text">
                      Re-upload lesson
                    </Link>
                  )}
                </div>
              </div>
            )}
             <SubtitleOverlay subtitles={subtitles} />
            {isYouTube && (
              <VideoChapterBar segments={lesson?.topicSegments || []} duration={videoDuration || lesson?.duration || 0} currentTime={currentTime} onSeek={seekTo} />
            )}
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 z-50 flex shrink-0 items-center justify-between border-t border-line bg-surface-nav px-3 py-2.5 sm:px-5 xl:static">
        <button
          type="button"
          onClick={() => prevLesson && navigate(`/lesson/${prevLesson.id || prevLesson.lessonId}`)}
          disabled={!prevLesson}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-card text-white disabled:text-muted"
        >
          <AppIcon name="chevronLeft" size={18} />
        </button>
        <div className="mx-3 max-w-[46vw] truncate rounded-full border border-line bg-surface-card px-4 py-2 text-center text-xs text-muted-text sm:max-w-[460px] sm:px-5">{lesson?.title}</div>
        <button
          type="button"
          onClick={() => nextLesson && navigate(`/lesson/${nextLesson.id || nextLesson.lessonId}`)}
          disabled={!nextLesson}
          className="flex h-9 w-9 rotate-180 items-center justify-center rounded-full border border-line bg-surface-card text-white disabled:text-muted"
        >
          <AppIcon name="chevronLeft" size={18} />
        </button>
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-[-1px] inline-flex items-center gap-1.5 border-b-2 px-[18px] py-2.5 text-[13px] ${
        active ? 'border-accent font-semibold text-white' : 'border-transparent text-muted'
      }`}
    >
      <AppIcon name={icon} size={14} className={active ? 'text-accent' : ''} />
      {children}
    </button>
  );
}

function Pill({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-card px-3 py-1.5 text-[13px] text-muted-text">
      <AppIcon name={icon} size={13} />
      {children}
    </span>
  );
}

function fmtTimestamp(seconds = 0) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function TranscriptPanel({ blocks, rawChunks, loading, error, currentTime, onSeek }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  // Determine active block index with binary search
  const activeIdx = (() => {
    if (!blocks.length) return -1;
    if (currentTime < blocks[0].startTime) return -1;
    if (currentTime >= blocks[blocks.length - 1].endTime) {
      return currentTime - blocks[blocks.length - 1].endTime < 0.5 ? blocks.length - 1 : -1;
    }
    let lo = 0, hi = blocks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const b = blocks[mid];
      if (currentTime < b.startTime) hi = mid - 1;
      else if (currentTime >= b.endTime) lo = mid + 1;
      else return mid;
    }
    const prev = lo - 1;
    if (prev >= 0 && currentTime - blocks[prev].endTime < 0.5) return prev;
    return -1;
  })();

  // Use raw transcript chunks (one per subtitle line) if available, otherwise sentence blocks
  const items = rawChunks.length > 0 ? rawChunks.map((chunk, i) => ({
    id: i,
    startTime: Number(chunk.startTime ?? chunk.start ?? 0),
    endTime: Number(chunk.endTime ?? chunk.end ?? 0),
    text: chunk.text || chunk.caption || chunk.content || '',
  })).filter(it => it.text.trim()) : blocks.map((b, i) => ({
    id: i,
    startTime: b.startTime,
    endTime: b.endTime,
    text: b.words.map(w => w.word).join(' '),
  }));

  // Determine which item is currently active based on currentTime
  const activeItemIdx = (() => {
    if (!items.length) return -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (currentTime >= items[i].startTime) return i;
    }
    return -1;
  })();

  // Auto-scroll to keep active item in view
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const isVisible = elTop >= containerTop + 40 && elBottom <= containerBottom - 40;
      if (!isVisible) {
        container.scrollTo({
          top: elTop - container.clientHeight / 2 + el.offsetHeight / 2,
          behavior: 'smooth',
        });
      }
    }
  }, [activeItemIdx]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-8 text-muted">
        <AppIcon name="loader" size={20} className="animate-spin text-accent" />
        <span className="text-sm">Loading transcript…</span>
      </div>
    );
  }

  if (error || !items.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <AppIcon name="alignLeft" size={32} strokeWidth={1.5} className="text-muted opacity-40" />
        <p className="text-sm text-muted">{error || 'No transcript available for this lesson.'}</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <AppIcon name="alignLeft" size={12} />
        Transcript
        <span className="ml-1 font-normal normal-case text-muted/60">{items.length} segments</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((item, idx) => {
          const isActive = idx === activeItemIdx;
          return (
            <button
              key={item.id}
              ref={isActive ? activeRef : null}
              type="button"
              onClick={() => onSeek?.(item.startTime)}
              className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-all duration-150 ${
                isActive
                  ? 'bg-accent/10 ring-1 ring-accent/20'
                  : 'hover:bg-surface-hover'
              }`}
            >
              <span className={`mt-0.5 shrink-0 font-mono text-[10px] tabular-nums transition ${
                isActive ? 'text-accent font-semibold' : 'text-muted/60 group-hover:text-muted'
              }`}>
                {fmtTimestamp(item.startTime)}
              </span>
              <span className={`flex-1 text-[13px] leading-relaxed transition ${
                isActive ? 'text-white font-medium' : 'text-muted-text group-hover:text-white/80'
              }`}>
                {item.text}
              </span>
              {isActive && (
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
