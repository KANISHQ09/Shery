import { useState, useEffect, useRef, useMemo } from 'react';
import AppIcon from '../AppIcon';
import { downloadSummaryPDF } from '../../utils/summaryPdf';
import EducationalContentRenderer from './EducationalContentRenderer';
import { getArtifactVersions } from '../../services/workspaceApi';

export default function OutputViewer({ isOpen, onClose, output, workspaceId, onSelectOutput, refetchWorkspace }) {
  const [copied, setCopied] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [versions, setVersions] = useState([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const scrollRef = useRef(null);
  const audioRef = useRef(null);
  const [isTimeout, setIsTimeout] = useState(false);

  useEffect(() => {
    setIsTimeout(false);
    if (isOpen && output?.status === 'generating') {
      const timer = setTimeout(() => {
        setIsTimeout(true);
        if (refetchWorkspace) {
          refetchWorkspace();
        }
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [output?.status, output?.id, isOpen, refetchWorkspace]);

  // Lazy generation features and progressive section requests have been removed in V4.5 for high speed performance.

  // Stop/reset audio when the active output switches or when the modal closes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      audioRef.current.load();
      audioRef.current.playbackRate = playbackRate;
    }
  }, [output?.id, isOpen]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return '00:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => console.error('Audio play error:', err));
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const parsedTranscript = useMemo(() => {
    if (!output?.content) return [];
    const lines = output.content.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.map((line, idx) => {
      const speakerMatch = line.match(/^(?:\[|)?(?:\*\*)?([^:\*\]]+)(?:\*\*)?(?:\]|):?\s*(.*)$/);
      if (speakerMatch && speakerMatch[1] && speakerMatch[2] && speakerMatch[1].length < 30) {
        const speaker = speakerMatch[1].trim();
        const text = speakerMatch[2].trim();
        if (text && !speaker.startsWith('#') && !speaker.startsWith('-')) {
          return {
            id: idx,
            type: 'dialogue',
            speaker,
            text,
          };
        }
      }
      return {
        id: idx,
        type: 'text',
        text: line,
      };
    });
  }, [output?.content]);

  // Fetch revisions list for version history picker
  useEffect(() => {
    if (isOpen && output?.artifactId && workspaceId) {
      setIsLoadingVersions(true);
      getArtifactVersions(workspaceId, output.artifactId)
        .then((res) => {
          setVersions(res.data?.list || []);
        })
        .catch((err) => console.error('Failed to load artifact versions', err))
        .finally(() => setIsLoadingVersions(false));
    }
  }, [isOpen, output?.artifactId, workspaceId]);

  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const totalScrollable = scrollHeight - clientHeight;
        if (totalScrollable > 0) {
          setScrollPercent((scrollTop / totalScrollable) * 100);
        } else {
          setScrollPercent(0);
        }
      }
    };

    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [isOpen, output]);

  const type = output?.artifactType || output?.type;

  // Parse slides JSON if presentation
  const parsedSlides = useMemo(() => {
    if (type === 'presentation' && output?.content) {
      try {
        return JSON.parse(output.content);
      } catch (e) {
        console.error('Failed to parse presentation slides JSON', e);
        return null;
      }
    }
    return null;
  }, [output, type]);

  if (!isOpen || !output) return null;

  const handleCopy = () => {
    if (parsedSlides) {
      const text = parsedSlides.map((s) => `Slide ${s.slideNumber}: ${s.title}\n${s.bulletPoints.map(b => `- ${b}`).join('\n')}\nNotes: ${s.speakerNotes}`).join('\n\n');
      navigator.clipboard.writeText(text);
    } else {
      navigator.clipboard.writeText(output.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = () => {
    const cleanContent = output.content
      .replace(/<(?:PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|MindMapNode|QuizQuestion)([^>]*)>/gi, '')
      .replace(/<\/(?:PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|MindMapNode|QuizQuestion)>/gi, '\n');

    downloadSummaryPDF(cleanContent, output.title, {
      brandName: 'SheryAI Studio',
      headerTitle: 'Generative Study Asset',
    });
  };

  const activeSlide = parsedSlides?.[activeSlideIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 md:p-6 select-none">
      {/* Scroll indicator bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/[0.03] z-50">
        <div
          className="h-full bg-orange-500 transition-all duration-100 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
          style={{ width: `${scrollPercent}%` }}
        />
      </div>

      <div className={`w-full h-[92vh] bg-[#0c0d12] border border-white/6 rounded-2xl flex flex-col shadow-2xl transition-all duration-300 relative ${
        focusMode ? 'max-w-3xl' : 'max-w-5xl'
      }`}>
        {/* Modal Header */}
        {!focusMode && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-black/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <AppIcon name={type === 'presentation' ? 'book' : type === 'diagram' ? 'sparkles' : type === 'audio' || type === 'interview_questions' ? 'mic' : 'alignLeft'} size={14} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold text-white leading-none tracking-tight">{output.title}</h3>
                  
                  {/* Version Picker */}
                  {versions.length > 1 && (
                    <select
                      value={output.id}
                      onChange={(e) => {
                        const target = versions.find((v) => v.id === e.target.value);
                        if (target) onSelectOutput(target);
                      }}
                      className="bg-[#14161f] border border-white/5 text-[9px] font-bold text-orange-400 rounded-md px-1.5 py-0.5 focus:outline-none"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>Version {v.version} {v.isLatest ? '(Latest)' : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
                <span className="text-[8px] text-orange-455 font-bold uppercase tracking-widest block mt-1.5">
                  Studio Asset • {type.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-slate-400 hover:text-white bg-white/[0.02] border border-white/5 rounded-xl transition cursor-pointer"
              >
                <AppIcon name="paperclip" size={10} />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              {/* Direct Download Button for PPTX / PNG */}
              {output.downloadUrl ? (
                <a
                  href={output.downloadUrl}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-white bg-orange-650 hover:bg-orange-600 border border-orange-500/20 rounded-xl transition"
                >
                  <AppIcon name="upload" size={10} className="rotate-180" />
                  <span>Download {type === 'presentation' ? 'PPTX' : type === 'diagram' ? 'PNG' : type === 'audio' ? 'MP3' : 'Asset'}</span>
                </a>
              ) : (
                type !== 'flashcards' && (
                  <button
                    onClick={handleDownloadPDF}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl transition cursor-pointer"
                  >
                    <AppIcon name="upload" size={10} />
                    <span>PDF</span>
                  </button>
                )
              )}

              <button onClick={onClose} className="text-slate-500 hover:text-white transition pl-2 cursor-pointer">
                <AppIcon name="x" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Floating Focus Mode Banner */}
        {focusMode && (
          <div className="absolute right-6 top-6 z-40 flex items-center gap-3 animate-in fade-in duration-200">
            <button
              onClick={() => setFocusMode(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-slate-400 hover:text-white bg-[#0d0e12]/80 border border-white/8 backdrop-blur-md rounded-xl transition shadow-lg cursor-pointer"
            >
              <AppIcon name="minimize" size={10} />
              <span>Exit Focus</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-[#0d0e12]/80 border border-white/8 backdrop-blur-md flex items-center justify-center text-slate-400 hover:text-white transition shadow-lg cursor-pointer"
            >
              <AppIcon name="x" size={12} />
            </button>
          </div>
        )}

        {/* Document Body Area */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {output.status === 'generating' && !isTimeout ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-6 select-none bg-[#0a0a0f]/50 backdrop-blur-md w-full">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-white/[0.02] scale-100 animate-spin" style={{ animationDuration: '10s' }} />
                <div className="absolute inset-3 rounded-full border border-dashed border-orange-500/10 scale-90 animate-spin" style={{ animationDuration: '6s', animationDirection: 'reverse' }} />
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500/10 via-amber-500/20 to-pink-500/10 flex items-center justify-center shadow-lg">
                  <div className="absolute inset-1 rounded-full bg-black/60 flex items-center justify-center border border-white/5">
                    <AppIcon name="sparkles" size={16} className="text-orange-400 animate-pulse" />
                  </div>
                </div>
              </div>
              <div className="text-center space-y-2 max-w-xs animate-pulse">
                <h3 className="text-xs font-extrabold text-white tracking-widest uppercase">Preparing Study Asset...</h3>
                <p className="text-[10px] text-slate-500 leading-normal font-medium px-4">
                  Applying custom structured rendering rules to build highly organized, grounded materials.
                </p>
              </div>
            </div>
          ) : type === 'presentation' && parsedSlides ? (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              
              {/* Left Column: Slide thumbnails list */}
              <aside className="w-52 border-r border-white/5 p-4 overflow-y-auto shrink-0 bg-black/10 space-y-3 scrollbar-thin">
                <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block">Slides Outline</span>
                <div className="space-y-2">
                  {parsedSlides.map((slide, idx) => (
                    <button
                      key={slide.slideNumber}
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`w-full p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        idx === activeSlideIndex
                          ? 'border-orange-500/20 bg-orange-500/[0.015] text-slate-200 font-bold'
                          : 'border-white/5 bg-[#0d0e12]/30 text-slate-400 hover:border-white/10 hover:text-slate-350'
                      }`}
                    >
                      <span className="text-[8.5px] font-mono text-slate-500 block">Slide #{slide.slideNumber}</span>
                      <span className="text-[10px] truncate block mt-0.5">{slide.title}</span>
                    </button>
                  ))}
                </div>
              </aside>

              {/* Right Column: Presenter active slide view */}
              <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-4 scrollbar-thin bg-[#0a0a0f]/20">
                {activeSlide ? (
                  <div className="space-y-4 max-w-3xl mx-auto w-full">
                    {/* Visual representation of slide */}
                    <div className="aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-[#10121a] to-[#0a0a0f] border border-white/5 p-8 flex flex-col justify-between shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-orange-500/[0.015] blur-3xl pointer-events-none" />
                      
                      {/* Slide Title */}
                      <h2 className="text-xl md:text-2xl font-extrabold text-slate-100 tracking-tight leading-snug">
                        {activeSlide.title}
                      </h2>

                      {/* Accent Divider */}
                      <div className="h-0.5 bg-orange-500/25 w-24 rounded-full mt-2" />

                      {/* Bullets */}
                      <div className="flex-1 flex flex-col justify-center space-y-3 pt-6">
                        {activeSlide.bulletPoints?.map((bullet, bIdx) => (
                          <div key={bIdx} className="flex items-start gap-2.5 text-xs text-slate-300 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 shrink-0" />
                            <p className="leading-relaxed">{bullet}</p>
                          </div>
                        ))}
                      </div>

                      {/* Footer page identifier */}
                      <div className="flex items-center justify-between pt-4 border-t border-white/[0.02] text-[9px] text-slate-500 font-bold">
                        <span>SheryAI Presentation Builder</span>
                        <span>Slide {activeSlide.slideNumber} of {parsedSlides.length}</span>
                      </div>
                    </div>

                    {/* Presenter Speaker Notes card below */}
                    {activeSlide.speakerNotes && (
                      <div className="p-4 rounded-2xl border border-white/5 bg-[#14151e]/30 space-y-2">
                        <span className="text-[8.5px] font-extrabold text-orange-400 uppercase tracking-widest block flex items-center gap-1">
                          <AppIcon name="mic" size={9} />
                          <span>Presenter Speaker Notes</span>
                        </span>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-medium select-text">
                          {activeSlide.speakerNotes}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    Select a slide to preview
                  </div>
                )}
              </div>
            </div>
          ) : type === 'diagram' ? (
            
            /* RENDER VISUAL DIAGRAM VIEW */
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#07080c]/50 relative">
              {/* Zoom Control Bar */}
              <div className="absolute bottom-6 right-6 z-25 flex items-center gap-1.5 bg-black/60 border border-white/5 p-1.5 rounded-xl backdrop-blur-md shadow-lg select-none">
                <button
                  onClick={() => setZoom(prev => Math.max(prev - 25, 50))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.05] transition cursor-pointer"
                  title="Zoom Out"
                >
                  <AppIcon name="minus" size={10} />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-350 px-2 w-10 text-center select-none">
                  {zoom}%
                </span>
                <button
                  onClick={() => setZoom(prev => Math.min(prev + 25, 250))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.05] transition cursor-pointer"
                  title="Zoom In"
                >
                  <AppIcon name="plus" size={10} />
                </button>
                <button
                  onClick={() => setZoom(100)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.05] transition cursor-pointer"
                  title="Reset Zoom"
                >
                  <AppIcon name="refresh" size={10} />
                </button>
              </div>

              {/* Large Image Viewport */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-8 scrollbar-thin">
                <div
                  className="transition-transform duration-200 ease-out select-none shadow-2xl border border-white/5 rounded-2xl overflow-hidden max-w-full"
                  style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center' }}
                >
                  <img
                    src={output.downloadUrl || ''}
                    alt={output.title}
                    className="max-h-[70vh] object-contain rounded-2xl select-none"
                    draggable={false}
                  />
                </div>
              </div>

              {/* Prompt/Provenance Metadata Pane */}
              <div className="px-6 py-4.5 border-t border-white/5 shrink-0 bg-black/10 space-y-2">
                <span className="text-[8.5px] font-extrabold text-orange-450 uppercase tracking-widest block select-none">Expanded LLM prompt details</span>
                <p className="text-[10.5px] text-slate-400 leading-relaxed font-mono select-text bg-[#0a0a0f] p-3 rounded-xl border border-white/5 max-h-24 overflow-y-auto scrollbar-thin">
                  {output.content || 'Grounded technical flowchart visual prompt detail.'}
                </p>
              </div>
            </div>
          ) : type === 'audio' ? (
            
            /* RENDER AUDIO SUMMARY VIEW */
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              {/* Left Column: Glassmorphic Audio Player Deck */}
              <aside className="w-full md:w-[360px] border-r border-white/5 p-6 flex flex-col items-center justify-between shrink-0 bg-black/10 overflow-y-auto scrollbar-thin">
                <div className="w-full flex flex-col items-center py-6">
                  {/* Pulse visualizer circle */}
                  <div className="relative w-36 h-36 rounded-full bg-gradient-to-br from-[#1b1c26] to-[#0a0a0f] border border-white/10 flex items-center justify-center shadow-lg mb-6 group">
                    <div className={`absolute inset-0.5 rounded-full border border-dashed border-orange-500/30 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '10s' }} />
                    <div className={`w-28 h-28 rounded-full bg-black/40 flex items-center justify-center transition-all ${isPlaying ? 'scale-105 shadow-orange-500/10 shadow-2xl' : ''}`}>
                      <AppIcon name="mic" size={32} className={`text-orange-400 transition-all ${isPlaying ? 'animate-pulse' : ''}`} />
                    </div>
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-100 text-center px-2 leading-snug line-clamp-2 select-text">
                    {output.title}
                  </h4>
                  <span className="text-[9px] font-extrabold text-orange-455 uppercase tracking-widest mt-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                    Audio Briefing
                  </span>

                  {output.downloadUrl ? (
                    <>
                      {/* HTML5 Audio Tag */}
                      <audio
                        ref={audioRef}
                        src={output.downloadUrl}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleAudioEnded}
                        preload="metadata"
                      />

                      {/* Playback Progress Slider */}
                      <div className="w-full space-y-1.5 mt-8 px-2">
                        <input
                          type="range"
                          min={0}
                          max={duration || 100}
                          value={currentTime}
                          onChange={handleSeek}
                          className="w-full h-1 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-orange-500 transition-colors focus:outline-none"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 font-bold">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      {/* Play & Pause Control Button */}
                      <div className="flex items-center justify-center gap-4 mt-6">
                        <button
                          onClick={handlePlayPause}
                          className="w-14 h-14 rounded-full bg-orange-650 hover:bg-orange-600 flex items-center justify-center text-white transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-orange-950/40 cursor-pointer"
                        >
                          <AppIcon name={isPlaying ? 'pause' : 'play'} size={20} className={!isPlaying ? 'ml-0.5' : ''} />
                        </button>
                      </div>

                      {/* Playback Rate Speed Selectors */}
                      <div className="w-full mt-8 space-y-2.5 px-2">
                        <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block text-center">
                          Playback Speed
                        </span>
                        <div className="flex justify-center gap-1.5">
                          {[1.0, 1.25, 1.5, 2.0].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => setPlaybackRate(rate)}
                              className={`px-3 py-1 text-[10.5px] font-mono font-bold rounded-lg border transition cursor-pointer ${
                                playbackRate === rate
                                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                                  : 'border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full mt-8 p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center space-y-2 select-none">
                      <p className="text-[10px] text-orange-400 font-bold tracking-tight">Audio Synthesis Pending</p>
                      <p className="text-[9px] text-slate-550 leading-normal">
                        Audio synthesis pending next release. Feel free to read the generated script outline on the right.
                      </p>
                    </div>
                  )}
                </div>

                {/* Optional help note */}
                <div className="text-[9px] text-slate-500 font-medium text-center leading-normal max-w-[200px] border-t border-white/[0.02] pt-4 w-full">
                  {output.downloadUrl ? 'Fully grounded on workspace sources. Download the MP3 from the header to listen offline.' : 'Narrative script outline synthesized from workspace grounding context.'}
                </div>
              </aside>

              {/* Right Column: Scrollable text script / transcript */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden min-h-0 bg-[#0a0a0f]/20">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <div className="w-5 h-5 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                    <AppIcon name="alignLeft" size={10} />
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-200 uppercase tracking-widest">
                    Grounded Script Transcript
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin select-text">
                  {parsedTranscript.map((item) => (
                    <div key={item.id}>
                      {item.type === 'dialogue' ? (
                        <div className="space-y-1">
                          <span className="text-[9.5px] font-extrabold text-orange-400 uppercase tracking-wide block">
                            {item.speaker}
                          </span>
                          <p className="text-[11.5px] text-slate-300 leading-relaxed font-medium bg-white/[0.01] border border-white/[0.03] px-3.5 py-2.5 rounded-xl">
                            {item.text}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11.5px] text-slate-400 leading-relaxed font-medium py-1">
                          {item.text}
                        </p>
                      )}
                    </div>
                  ))}
                  {parsedTranscript.length === 0 && (
                    <p className="text-[11.5px] text-slate-500 italic text-center py-8">
                      No transcript script content available.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            
            /* RENDER EDITORIAL STUDY GUIDE VIEW */
            <>
              {/* Outline Sidebar Panel — hidden for interview_questions and flashcards */}
              {!focusMode && type !== 'interview_questions' && type !== 'flashcards' && (
                <aside className="w-56 border-r border-white/5 p-4 overflow-y-auto shrink-0 space-y-4 bg-black/5 hidden md:block">
                  <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block">Document Index</span>
                  <nav className="space-y-1">
                    {/* We can construct simple heading outline mapping */}
                    <div className="text-[10px] text-slate-500 font-semibold italic p-2 select-none">Chapter Index Overview</div>
                  </nav>
                </aside>
              )}

              {/* Reading Scroll viewport */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-8 px-6 md:px-12 scrollbar-thin select-text"
              >
                <div className={type === 'flashcards' ? 'max-w-3xl mx-auto space-y-6 w-full' : type === 'interview_questions' ? 'max-w-4xl mx-auto space-y-4 w-full' : 'max-w-2xl mx-auto space-y-4'}>
                  {focusMode && (
                    <div className="pb-6 border-b border-white/5 mb-8 select-none">
                      <span className="text-[8px] text-orange-455 font-extrabold uppercase tracking-widest mb-1.5 block">Textbook Mode</span>
                      <h1 className="text-xl font-extrabold text-white leading-tight">{output.title}</h1>
                    </div>
                  )}

                  {/* If generation has timed out on frontend but still generating, show banner */}
                  {(output.status === 'generating' || isTimeout) && !output.content && (
                    <div className="p-4.5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.015] text-center select-none space-y-2">
                      <span className="text-[10px] font-extrabold text-orange-450 uppercase tracking-widest block">Generated from available sources.</span>
                      <p className="text-[9px] text-slate-400 leading-normal">
                        Timeout threshold reached. Fallback study guide material has been generated based on available sources.
                      </p>
                    </div>
                  )}

                  <EducationalContentRenderer
                    type={output.type}
                    content={output.content}
                    onSelectCitation={null}
                    messageSources={output.sourcesUsed}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer bibliography */}
        {!focusMode && type !== 'flashcards' && output.sourcesUsed && output.sourcesUsed.length > 0 && (
          <div className="px-6 py-4.5 border-t border-white/5 shrink-0 bg-black/10">
            <span className="text-[8px] font-extrabold text-slate-550 uppercase tracking-widest block mb-2">
              Verified Grounding Sources
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {output.sourcesUsed.map((src, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 bg-white/[0.015] border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 font-semibold"
                >
                  <AppIcon name={src.type === 'youtube' ? 'video' : src.type === 'pdf' ? 'file' : 'alignLeft'} size={9} className="text-slate-500" />
                  <span>{src.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
