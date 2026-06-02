import { useEffect, useState, useRef } from 'react';
import AppIcon from '../AppIcon';

export default function WorkspaceTranscriptStatus({ progress = 0, stageMessage = 'Initializing...' }) {
  const [logs, setLogs] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Add stageMessage as a log entry if not already present
    if (stageMessage) {
      setLogs((prev) => {
        // Prevent repeating logs consecutively
        if (prev.length > 0 && prev[prev.length - 1].message === stageMessage) {
          return prev;
        }
        return [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            message: stageMessage,
            pct: progress
          }
        ].slice(-30); // keep last 30 log lines
      });
    }
  }, [stageMessage, progress]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [logs]);

  return (
    <div className="bg-black/40 border border-line rounded-2xl p-4 font-mono text-[10px] space-y-3">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-2 text-muted">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-alert/30" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent/30" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/30" />
          </div>
          <span className="text-[9px] uppercase tracking-wider font-bold">Acoustic Engine Terminal</span>
        </div>
        <AppIcon name="terminal" size={10} className="text-accent" />
      </div>

      <div ref={scrollRef} className="max-h-[160px] overflow-y-auto space-y-1.5 scrollbar-thin text-green-400/90 leading-normal">
        {logs.map((log, index) => (
          <div key={index} className="flex items-start gap-1.5">
            <span className="text-muted shrink-0">[{log.timestamp}]</span>
            <span className="text-accent shrink-0">&gt;</span>
            <span className="break-all">{log.message}</span>
            <span className="text-green-500/50 ml-auto font-black shrink-0">{log.pct}%</span>
          </div>
        ))}
        {progress < 100 && (
          <div className="flex items-center gap-1.5 text-accent animate-pulse">
            <span>[{new Date().toLocaleTimeString()}]</span>
            <span>&gt;</span>
            <span>Awaiting acoustic processing cycles...</span>
            <span className="w-1.5 h-3 bg-accent ml-1" />
          </div>
        )}
        <div className="h-2" />
      </div>
    </div>
  );
}
