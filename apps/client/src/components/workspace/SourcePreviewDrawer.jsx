import { useState, useEffect, useRef } from 'react';
import AppIcon from '../AppIcon';
import { getWorkspace, getSourceStatus, retrySource } from '../../services/workspaceApi';
import WorkspaceVideoPreview from './WorkspaceVideoPreview';
import WorkspaceIngestionTimeline from './WorkspaceIngestionTimeline';
import WorkspaceTranscriptStatus from './WorkspaceTranscriptStatus';

export default function SourcePreviewDrawer({
  isOpen,
  onClose,
  citation,
  workspaceId,
}) {
  const [sourceData, setSourceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startTimeSeconds, setStartTimeSeconds] = useState(0);

  const highlightRef = useRef(null);
  const scrollRef = useRef(null);

  const fetchSource = () => {
    if (!citation?.sourceId) return;
    setLoading(true);
    getWorkspace(workspaceId)
      .then((data) => {
        const source = data?.sources?.find((s) => s.id === citation.sourceId);
        setSourceData(source);
        
        // Parse time coordinate from meta info
        if (source?.type === 'youtube' && citation.meta) {
          const match = citation.meta.match(/(\d{1,2}):(\d{2})/);
          if (match) {
            const mins = parseInt(match[1], 10);
            const secs = parseInt(match[2], 10);
            setStartTimeSeconds(mins * 60 + secs);
          }
        }
      })
      .catch((err) => console.error('Failed to load preview source data', err))
      .finally(() => setLoading(false));
  };

  // Fetch full transcript details when a citation is selected
  useEffect(() => {
    if (!isOpen || !citation?.sourceId) return;
    setSourceData(null);
    setStartTimeSeconds(0);
    fetchSource();
  }, [isOpen, citation?.sourceId, workspaceId]);

  // Scroll to highlight element
  useEffect(() => {
    if (sourceData && highlightRef.current && scrollRef.current) {
      setTimeout(() => {
        const container = scrollRef.current;
        const target = highlightRef.current;
        container.scrollTo({
          top: target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2,
          behavior: 'smooth'
        });
      }, 300);
    }
  }, [sourceData]);

  // Live polling for processing sources
  useEffect(() => {
    const isTerminal = ['ready', 'completed', 'failed', 'error', 'cancelled'].includes(sourceData?.status);
    if (!isOpen || !sourceData || isTerminal) {
      return;
    }

    const intervalId = setInterval(() => {
      getSourceStatus(workspaceId, sourceData.id)
        .then((updatedStatus) => {
          if (updatedStatus) {
            setSourceData((prev) => {
              if (!prev || prev.id !== sourceData.id) return prev;
              
              const isReady = updatedStatus.status === 'ready' || updatedStatus.status === 'completed';
              
              if (isReady) {
                // If transition to ready, load full source details (transcripts, segmented topics)
                getWorkspace(workspaceId).then((data) => {
                  const fullSource = data?.sources?.find((s) => s.id === sourceData.id);
                  if (fullSource) setSourceData(fullSource);
                });
                clearInterval(intervalId);
              }
              
              return {
                ...prev,
                ...updatedStatus
              };
            });
          }
        })
        .catch((err) => console.error('Failed to poll source status', err));
    }, 2000);

    return () => clearInterval(intervalId);
  }, [isOpen, sourceData?.id, sourceData?.status, workspaceId]);

  if (!isOpen) return null;

  const getYoutubeVideoId = () => {
    return sourceData?.meta?.videoId || citation?.sourceId;
  };

  const handleJumpToTime = (timeStr) => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      setStartTimeSeconds(mins * 60 + secs);
    }
  };

  const isHighlighted = (textBlock) => {
    if (!citation?.meta) return false;
    const cleanText = textBlock.toLowerCase();
    
    // Check if it's a PDF page
    if (sourceData?.type === 'pdf') {
      const pageMatch = citation.meta.match(/P\.\s*(\d+)/i) || citation.meta.match(/page\s*(\d+)/i);
      if (pageMatch) {
        return cleanText.includes(`page ${pageMatch[1]}`);
      }
    }
    
    // Otherwise check conceptual similarity
    return cleanText.includes(citation.meta.toLowerCase());
  };

  const isProcessingStatus = (status) => {
    return [
      'pending', 'processing', 'queued', 'uploading', 'validating', 'parsing',
      'extracting_audio', 'generating_transcript', 'enhancing_transcript',
      'semantic_cleaning', 'chunking', 'embedding', 'indexing', 'graph_building',
      'failed', 'error', 'retrying'
    ].includes(status);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-[#0b0c10] border-l border-white/5 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 select-none">
      {/* Drawer Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#white]/[0.02] border border-white/5 text-orange-400 flex items-center justify-center shrink-0">
            <AppIcon name={sourceData?.type === 'youtube' ? 'video' : sourceData?.type === 'pdf' ? 'file' : 'alignLeft'} size={12} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-slate-200 truncate pr-2">
              {sourceData?.title || citation?.sourceTitle || 'Source Preview'}
            </h3>
            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block mt-0.5">
              {sourceData?.type || 'Grounding Document'}
            </span>
          </div>
        </div>

        <button onClick={onClose} className="text-slate-500 hover:text-slate-350 transition">
          <AppIcon name="x" size={16} />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-555 text-slate-500 gap-2 py-20">
            <AppIcon name="loader" size={20} className="animate-spin text-orange-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Retrieving Source...</span>
          </div>
        ) : sourceData ? (
          isProcessingStatus(sourceData.status) ? (
            <div className="space-y-4 py-4">
              <WorkspaceIngestionTimeline 
                progress={sourceData.progress} 
                stageMessage={sourceData.progressStage} 
                status={sourceData.status}
                error={sourceData.error}
                errorDetails={sourceData.errorDetails}
                onRetry={async () => {
                  try {
                    const d = await retrySource(workspaceId, sourceData.id);
                    if (d.data?.success || d.success) {
                      // Trigger a refetch
                      fetchSource();
                    } else {
                      alert(d.error || 'Failed to retry ingestion');
                    }
                  } catch (err) {
                    alert('Network error while retrying ingestion');
                  }
                }}
              />
              <WorkspaceTranscriptStatus progress={sourceData.progress} stageMessage={sourceData.progressStage} />
            </div>
          ) : sourceData.type === 'video' ? (
            <WorkspaceVideoPreview source={sourceData} workspaceId={workspaceId} initialTimeSeconds={startTimeSeconds} />
          ) : (
            <>
              {/* Partially Ready / Degraded Banner */}
              {['partially_ready', 'transcript_ready', 'ready_without_vectors', 'indexing_pending', 'indexing_retrying'].includes(sourceData.status) && (
                <div className="bg-orange-950/10 border border-dashed border-orange-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                    <span className={`w-1.5 h-1.5 rounded-full ${sourceData.status === 'ready_without_vectors' ? 'bg-rose-500' : 'bg-orange-500'} animate-ping`} />
                    <span>
                      {sourceData.status === 'ready_without_vectors' 
                        ? 'Grounded Chat Active (Degraded)' 
                        : sourceData.status === 'indexing_pending'
                        ? 'Vector Indexing Pending'
                        : sourceData.status === 'indexing_retrying'
                        ? 'Vector Indexing Retrying'
                        : 'Nvidia Vector Indexing in Progress'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {sourceData.status === 'ready_without_vectors'
                      ? 'The Qdrant vector database is currently offline or unreachable. Grounded AI chat remains active using high-precision BM25 keyword matching fallback.'
                      : sourceData.status === 'indexing_pending'
                      ? 'The source text is extracted and fully searchable. Embedding vector generation is queued and will execute automatically in the background.'
                      : sourceData.status === 'indexing_retrying'
                      ? 'The system is retrying vector indexing and connecting to the knowledge store.'
                      : 'The source text is fully available for chat. High-performance semantic indexing is computing in the background.'}
                  </p>
                  <div className="w-full bg-white/[0.04] h-1 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${sourceData.progress || 70}%` }} />
                  </div>
                </div>
              )}

              {/* YouTube embed player if video */}
              {sourceData.type === 'youtube' && (
                <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/5 shadow-lg">
                  <iframe
                    key={startTimeSeconds}
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${getYoutubeVideoId()}?autoplay=1&start=${startTimeSeconds}&enablejsapi=1`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              )}

              {/* Document stats */}
              <div className="grid grid-cols-2 gap-3 bg-white/[0.02] border border-white/5 rounded-xl p-3.5 text-[10px]">
                <div>
                  <span className="text-slate-500 block mb-0.5">Total Chapters/Topics</span>
                  <span className="font-bold text-slate-200">{sourceData.topicSegments?.length || 0} segments</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Document Length</span>
                  <span className="font-bold text-slate-200">
                    {sourceData.type === 'pdf'
                      ? `${sourceData.meta?.pages || 1} pages`
                      : sourceData.type === 'youtube'
                      ? `${Math.floor((sourceData.meta?.duration || 0) / 60)} minutes`
                      : `${sourceData.transcript?.split(/\s+/).length || 0} words`}
                  </span>
                </div>
              </div>

              {/* Highlighted context / Topic Segment details */}
              {citation && (
                <div className="bg-orange-950/20 border border-orange-500/25 rounded-xl p-3.5 text-xs text-orange-200">
                  <div className="flex items-center gap-1.5 text-orange-400 font-bold text-[10px] uppercase tracking-wider mb-1">
                    <AppIcon name="sparkles" size={10} />
                    <span>Grounding Reference</span>
                  </div>
                  <p className="leading-relaxed italic">
                    &ldquo;...answering query referencing segment {citation.meta || 'General'}...&rdquo;
                  </p>
                </div>
              )}

              {/* Scrollable Transcript Text */}
              <div className="space-y-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Full Indexed Content</span>
                <div ref={scrollRef} className="bg-white/[0.01] border border-white/5 rounded-xl p-4 max-h-[300px] overflow-y-auto text-xs leading-relaxed text-slate-300 font-normal space-y-3 scrollbar-thin select-text">
                  {sourceData.topicSegments && sourceData.topicSegments.length > 0 ? (
                    sourceData.topicSegments.map((seg, idx) => {
                      const highlight = isHighlighted(seg.title);
                      return (
                        <div
                          key={idx}
                          ref={highlight ? highlightRef : null}
                          className={`p-3 rounded-xl border transition ${
                            highlight
                              ? 'bg-orange-950/20 border border-orange-500/25 text-orange-200 shadow-sm shadow-orange-950/10'
                              : 'bg-white/[0.015] border border-white/5 hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-slate-200 text-[11px] truncate pr-4">{seg.title}</span>
                            {sourceData.type === 'youtube' && (
                              <button
                                onClick={() => handleJumpToTime(seg.startTimeLabel || '0:00')}
                                className="text-[9px] font-bold text-orange-400 bg-orange-950/20 border border-orange-500/25 px-2 py-0.5 rounded-full hover:bg-orange-950/40 transition"
                              >
                                Jump
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-450 leading-normal">{seg.summary}</p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="whitespace-pre-line break-words">{sourceData.transcript || 'Content empty'}</p>
                  )}
                </div>
              </div>
            </>
          )
        ) : (
          <div className="text-center py-20 text-slate-500 text-xs">Source could not be previewed.</div>
        )}
      </div>
    </div>
  );
}

