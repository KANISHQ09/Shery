import { useState, useRef, useEffect } from 'react';
import AppIcon from '../AppIcon';
import { buildApiUrl } from '../../config/env';

export default function WorkspaceVideoPreview({
  source,
  workspaceId,
  initialTimeSeconds = 0,
}) {
  const videoRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const activeSentenceRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [activeSlideIndex, setActiveSlideIndex] = useState(-1);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);

  // Jump to initial timing if provided
  useEffect(() => {
    if (videoRef.current && initialTimeSeconds > 0) {
      videoRef.current.currentTime = initialTimeSeconds;
      setCurrentTime(initialTimeSeconds);
    }
  }, [initialTimeSeconds, source.id]);

  // Video URL resolved securely via backend streaming endpoint
  const videoUrl = buildApiUrl(`/api/workspaces/${workspaceId}/sources/${source.id}/video?uid=${localStorage.getItem('sheryai_workspace_uid') || ''}`);

  // Handle time update to sync highlights
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // 1. Determine active Topic Segment
    if (source.topicSegments?.length) {
      const activeSegIdx = source.topicSegments.findIndex((seg, idx) => {
        const nextSeg = source.topicSegments[idx + 1];
        const end = nextSeg ? nextSeg.timestamp || 0 : Infinity;
        const start = seg.timestamp || 0;
        return time >= start && time < end;
      });
      setActiveSegmentIndex(activeSegIdx);
    }

    // 2. Determine active Slide
    if (source.slideEvents?.length) {
      const activeSlideIdx = source.slideEvents.findIndex((slide, idx) => {
        const nextSlide = source.slideEvents[idx + 1];
        const end = nextSlide ? nextSlide.timestamp || 0 : Infinity;
        const start = slide.timestamp || 0;
        return time >= start && time < end;
      });
      setActiveSlideIndex(activeSlideIdx);
    }
  };

  const handleJumpToTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Scroll sync active segment in transcript
  useEffect(() => {
    if (activeSentenceRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const target = activeSentenceRef.current;
      const targetTop = target.offsetTop;
      const targetBottom = targetTop + target.offsetHeight;
      const containerScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;

      if (targetTop < containerScrollTop) {
        container.scrollTo({ top: targetTop - 8, behavior: 'smooth' });
      } else if (targetBottom > containerScrollTop + containerHeight) {
        container.scrollTo({ top: targetBottom - containerHeight + 8, behavior: 'smooth' });
      }
    }
  }, [activeSegmentIndex]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const getThumbnailUrl = (filename) => {
    return buildApiUrl(`/api/workspaces/${workspaceId}/sources/${source.id}/thumbnail/${filename}?uid=${localStorage.getItem('sheryai_workspace_uid') || ''}`);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 1. SECURE PREMIUM PLAYER */}
      <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-line shadow-2xl group">
        <video
          ref={videoRef}
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="w-full h-full object-contain"
          controls
        />

        {/* Hover overlay custom play-pause indicator for arc-grade interaction */}
        <div 
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer pointer-events-none"
        >
          <div className="w-12 h-12 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white backdrop-blur-sm transform scale-90 group-hover:scale-100 transition duration-300 pointer-events-auto">
            <AppIcon name={isPlaying ? 'pause' : 'play'} size={20} />
          </div>
        </div>
      </div>

      {/* 2. SLIDES & FRAMES CAROUSEL STRIP */}
      {source.thumbnails && source.thumbnails.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] font-black text-muted uppercase tracking-wider block">Visual Timeline Keyframes</span>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin select-none">
            {source.thumbnails.map((thumb, idx) => {
              const active = activeSegmentIndex === idx || (idx === source.thumbnails.length - 1 && currentTime >= thumb.timestamp);
              return (
                <div
                  key={idx}
                  onClick={() => handleJumpToTime(thumb.timestamp)}
                  className={`relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden border cursor-pointer transition-all duration-300 ${
                    active 
                      ? 'border-accent ring-2 ring-accent/20 scale-[1.02]' 
                      : 'border-line hover:border-white/20'
                  }`}
                >
                  <img
                    src={getThumbnailUrl(thumb.filename)}
                    alt={`Frame at ${thumb.timeLabel}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1">
                    <span className="text-[8px] font-black text-white">{thumb.timeLabel}</span>
                  </div>
                  {active && (
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. SCENE INTELLIGENCE TIMELINE EVENTS */}
      {source.slideEvents && source.slideEvents.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] font-black text-muted uppercase tracking-wider block">Scene Timeline Transitions</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin select-none">
            {source.slideEvents.map((slide, idx) => {
              const active = activeSlideIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleJumpToTime(slide.timestamp)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold transition shrink-0 ${
                    active
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-white/[0.015] border-line text-muted hover:text-white hover:border-white/10'
                  }`}
                >
                  <AppIcon name={slide.type === 'ide_code' ? 'terminal' : 'presentation'} size={8} />
                  <span>{slide.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. SYNCED SCROLL TRANSCRIPT */}
      <div className="space-y-2 flex-1 flex flex-col min-h-0">
        <span className="text-[9px] font-black text-muted uppercase tracking-wider block">Synced Interactive Transcript</span>
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-white/[0.01] border border-line rounded-2xl p-4 space-y-3.5 scrollbar-thin max-h-[220px]"
        >
          {source.topicSegments && source.topicSegments.length > 0 ? (
            source.topicSegments.map((seg, idx) => {
              const active = activeSegmentIndex === idx;
              
              // Calculate segment timing labels
              const mins = Math.floor((seg.timestamp || 0) / 60);
              const secs = Math.floor((seg.timestamp || 0) % 60);
              const timeLabel = `${mins}:${String(secs).padStart(2, '0')}`;

              return (
                <div
                  key={idx}
                  ref={active ? activeSentenceRef : null}
                  onClick={() => handleJumpToTime(seg.timestamp || 0)}
                  className={`p-3 rounded-xl border cursor-pointer transition duration-200 ${
                    active
                      ? 'bg-accent/10 border-accent/30 text-white shadow-md'
                      : 'bg-white/[0.005] border-transparent hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-white text-[11px] truncate pr-4">{seg.title}</span>
                    <span className="text-[9px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">
                      {timeLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/70 leading-relaxed font-normal">{seg.summary}</p>
                </div>
              );
            })
          ) : (
            <p className="text-[10px] text-muted text-center py-8">Interactive transcript segments unavailable.</p>
          )}
        </div>
      </div>
    </div>
  );
}
