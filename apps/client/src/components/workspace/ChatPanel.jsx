import { useState, useRef, useEffect } from 'react';
import AppIcon from '../AppIcon';
import WorkspaceChatMessage from './WorkspaceChatMessage';
import ChatModeSelector from './ChatModeSelector';

const THINKING_STAGES = [
  { icon: 'search', label: 'Searching knowledge vectors...' },
  { icon: 'filter', label: 'Reranking by semantic relevance...' },
  { icon: 'layers', label: 'Assembling grounded context...' },
  { icon: 'bot', label: 'Synthesizing expert response...' },
];

const EMPTY_STATE_SUGGESTIONS = [
  'What are the core concepts covered in my sources?',
  'Explain the main architecture described here.',
  'What are the key takeaways from these materials?',
  'Compare the different approaches mentioned.',
];



export default function ChatPanel({
  messages = [],
  isStreaming,
  currentStreamText,
  sources = [],
  error,
  mode,
  onSelectMode,
  depth,
  onSelectDepth,
  onSendMessage,
  onStopStreaming,
  onClearSession,
  onSelectCitation,
  workspaceSources = [],
  outputs = [],
  onSelectOutput,
}) {
  const [input, setInput] = useState('');
  const [thinkingStage, setThinkingStage] = useState(0);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  const hasDegradedSources = workspaceSources.some(s =>
    ['ready_without_vectors', 'indexing_pending', 'indexing_retrying'].includes(s.status)
  );

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamText]);

  // Progressive thinking stage animation
  useEffect(() => {
    if (isStreaming && !currentStreamText) {
      setThinkingStage(0);
      const timers = THINKING_STAGES.map((_, i) =>
        setTimeout(() => setThinkingStage(i), i * 900)
      );
      return () => timers.forEach(t => clearTimeout(t));
    }
  }, [isStreaming, currentStreamText]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (q) => {
    if (!isStreaming) {
      onSendMessage(q);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#030305] relative overflow-hidden min-h-0">
      {/* Panel Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-[#06070a]/40 backdrop-blur-md shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          {/* Live indicator */}
          <div className="relative w-2 h-2 shrink-0">
            <div className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-45" />
            <div className="relative w-2 h-2 rounded-full bg-orange-500" />
          </div>
          <span className="text-xs font-bold tracking-tight text-slate-100">Knowledge Workspace Tutor</span>
          {hasDegradedSources ? (
            <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AppIcon name="alert" size={8} />
              <span>BM25 Fallback</span>
            </span>
          ) : workspaceSources.length > 0 ? (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <AppIcon name="check" size={8} />
              <span>Fully Grounded</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <ChatModeSelector activeMode={mode} onSelectMode={onSelectMode} />
          <button
            onClick={onClearSession}
            className="px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/5 rounded-xl transition cursor-pointer"
            title="Clear Chat"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Degraded Sources Warning Banner */}
      {hasDegradedSources && (
        <div className="bg-amber-950/10 border-b border-amber-900/15 px-6 py-2.5 flex items-center gap-2.5 text-[10px] text-amber-450 font-semibold select-none shrink-0">
          <AppIcon name="alert" size={11} className="text-amber-550 shrink-0" />
          <span>
            Some sources are still indexing. Responses use BM25 keyword matching until vector indexing completes.
          </span>
        </div>
      )}

      {/* Message Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin min-h-0 relative">
        <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-8">

          {/* The Knowledge Journey: Always visible at the top */}
          <div className="max-w-3xl mx-auto w-full pt-12 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-12 text-slate-300">
            {workspaceSources.length > 0 ? (
              <>
                {/* Document Overview */}
                <section className="space-y-4">
                  <h1 className="text-3xl font-bold text-slate-100 tracking-tight">
                    {workspaceSources.length === 1 
                      ? workspaceSources[0].title 
                      : `${workspaceSources.length} Grounding Sources Active`}
                  </h1>
                  <p className="text-sm leading-relaxed text-slate-400 max-w-2xl">
                    {workspaceSources.length === 1
                      ? `A comprehensive knowledge document covering core concepts from ${workspaceSources[0].title}.`
                      : 'A unified knowledge space synthesizing insights across all your uploaded documents.'}
                  </p>
                </section>

                {/* Thin Divider */}
                <div className="h-px bg-white/[0.03] w-full" />

                {/* Key Concepts */}
                <section className="space-y-6">
                  <h2 className="text-xs font-semibold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                    <AppIcon name="brain" size={14} />
                    Key Concepts
                  </h2>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['Differential Equations', 'Laplace Transform', 'Fourier Series', 'Complex Analysis'].map((topic, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-orange-500 mt-0.5">•</span>
                        <span className="text-sm font-medium text-slate-200">{topic}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Recent Generated Notes (Option B) */}
                {outputs && outputs.length > 0 && (
                  <>
                    {/* Thin Divider */}
                    <div className="h-px bg-white/[0.03] w-full" />
                    
                    <section className="space-y-6">
                      <h2 className="text-xs font-semibold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                        <AppIcon name="book" size={14} />
                        Recent Generated Notes
                      </h2>
                      <div className="grid grid-cols-2 gap-4">
                        {outputs.slice(0, 4).map((output) => (
                          <button
                            key={output.id}
                            onClick={() => onSelectOutput && onSelectOutput(output)}
                            className="group flex flex-col p-4 rounded-xl bg-white/[0.015] border border-white/5 hover:border-orange-500/20 hover:bg-orange-500/[0.02] transition text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <AppIcon name={output.type === 'study_guide' ? 'book' : 'sparkles'} size={14} className="text-emerald-450" />
                              <span className="text-xs font-bold text-slate-200 group-hover:text-orange-300 transition truncate">
                                {output.title || 'Generated Notes'}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                              {output.content?.substring(0, 100) || 'Click to view full notes.'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center select-none pt-12">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6">
                  <AppIcon name="upload" size={26} className="text-orange-400 animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-2">Knowledge Space Empty</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-sm mb-8">
                  Upload a document in the left sidebar to generate a Knowledge Overview and start chatting.
                </p>
              </div>
            )}
          </div>

          {/* Message list */}
          {messages.map((msg) => (
            <WorkspaceChatMessage
              key={msg.id}
              message={msg}
              onSelectCitation={onSelectCitation}
              onSendMessage={!isStreaming ? onSendMessage : undefined}
            />
          ))}

          {/* AI Thinking State */}
          {isStreaming && !currentStreamText && (
            <div className="flex gap-3.5 justify-start animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent animate-pulse" />
                <AppIcon name="bot" size={13} className="text-orange-400 relative z-10" />
              </div>
              <div className="bg-white/[0.012] border border-white/5 rounded-2xl rounded-tl-sm p-4 space-y-3 min-w-[240px] shadow-md">
                {THINKING_STAGES.map((stage, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 text-[10px] font-semibold transition-all duration-300 ${i === thinkingStage
                        ? 'text-orange-300'
                        : i < thinkingStage
                          ? 'text-slate-500'
                          : 'text-slate-700'
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${i === thinkingStage
                        ? 'bg-orange-400 animate-ping'
                        : i < thinkingStage
                          ? 'bg-slate-650'
                          : 'bg-white/[0.03]'
                      }`} />
                    {stage.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Streaming message bubble */}
          {isStreaming && currentStreamText && (
            <WorkspaceChatMessage
              message={{
                role: 'assistant',
                content: currentStreamText,
                sources,
              }}
              isStreaming
              onSelectCitation={onSelectCitation}
            />
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2.5 p-4 bg-rose-950/15 border border-rose-900/20 rounded-2xl text-[11px] text-rose-455 max-w-xl">
              <AppIcon name="alert" size={14} className="shrink-0 mt-0.5 text-rose-500" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Spacer to ensure bottom padding is respected during scroll */}
          <div className="h-4" />
        </div>
      </div>

      {/* Massive Chat Input Bar */}
      <div className="w-full bg-[#030305]/90 backdrop-blur-xl pt-4 pb-8 shrink-0 z-10 sticky bottom-0 border-t border-white/[0.03]">
        <div className="max-w-3xl mx-auto px-6 relative">
          
          {/* Inline Suggestions (Immediately anchored to the top of the chat input) */}
          {messages.length === 0 && workspaceSources.length > 0 && !isStreaming && (
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-none pb-1">
              {[
                'What are the core concepts covered in my sources?',
                'Explain the main architecture described here.',
                'What are the key takeaways from these materials?',
                'Compare the different approaches mentioned.',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(q)}
                  className="text-[11px] px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/5 text-slate-400 hover:text-orange-300 hover:bg-orange-500/10 hover:border-orange-500/20 transition whitespace-nowrap cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input Box */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative rounded-2xl bg-white/[0.02] border border-white/10 focus-within:border-orange-500/40 focus-within:bg-white/[0.04] transition-all duration-300 shadow-2xl">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask anything in ${mode.replace('_', ' ')} mode…`}
                rows={1}
                className="w-full bg-transparent p-5 pr-14 text-base text-slate-100 placeholder-slate-500 resize-none outline-none min-h-[120px] scrollbar-none leading-relaxed"
              />

              {/* Send / Stop button */}
              <div className="absolute right-4 bottom-4">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopStreaming}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-950/30 border border-rose-900/30 text-rose-400 hover:bg-rose-900/25 transition cursor-pointer"
                    title="Stop"
                  >
                    <AppIcon name="square" size={11} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-orange-600 disabled:bg-white/[0.02] disabled:text-slate-600 text-white hover:bg-orange-500 transition disabled:cursor-not-allowed shadow-lg shadow-orange-900/20 cursor-pointer"
                  >
                    <AppIcon name="send" size={13} />
                  </button>
                )}
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}

