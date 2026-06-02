import { useState, useEffect, useRef } from 'react';
import AppIcon from '../AppIcon';
import { downloadSummaryPDF } from '../../utils/summaryPdf';
import EducationalContentRenderer from './EducationalContentRenderer';

export default function OutputViewer({ isOpen, onClose, output }) {
  const [copied, setCopied] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const scrollRef = useRef(null);

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

  if (!isOpen || !output) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(output.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = () => {
    // Strip XML tags for PDF download to avoid printing raw tags
    const cleanContent = output.content
      .replace(/<(?:PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|TimelineStep|MindMapNode|QuizQuestion)([^>]*)>/gi, '')
      .replace(/<\/(?:PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|TimelineStep|MindMapNode|QuizQuestion)>/gi, '\n');

    downloadSummaryPDF(cleanContent, output.title, {
      brandName: 'SheryAI Studio',
      headerTitle: 'Generative Study Asset',
    });
  };

  // Parse document outline/headings for the sidebar
  const getOutline = () => {
    const headings = [];
    
    // Find chapter blocks: <ChapterBlock title="Title">
    const chapterBlockRegex = /<ChapterBlock\s+title="([^"]+)"/gi;
    let match;
    while ((match = chapterBlockRegex.exec(output.content)) !== null) {
      headings.push({ text: match[1], type: 'chapter' });
    }

    // Find timeline steps: <TimelineStep title="Title"
    if (headings.length === 0) {
      const timelineStepRegex = /<TimelineStep\s+title="([^"]+)"/gi;
      let tlMatch;
      while ((tlMatch = timelineStepRegex.exec(output.content)) !== null) {
        headings.push({ text: tlMatch[1], type: 'step' });
      }
    }

    // Find quiz questions: <QuizQuestion question="Text"
    if (headings.length === 0) {
      const quizRegex = /<QuizQuestion\s+question="([^"]+)"/gi;
      let qMatch;
      while ((qMatch = quizRegex.exec(output.content)) !== null) {
        headings.push({ text: qMatch[1], type: 'question' });
      }
    }

    // Fallback: Find standard markdown headings (## Heading)
    if (headings.length === 0) {
      const mdHeadingRegex = /^##\s+(.+)$/gm;
      let mdMatch;
      while ((mdMatch = mdHeadingRegex.exec(output.content)) !== null) {
        headings.push({ text: mdMatch[1], type: 'md-h2' });
      }
    }

    return headings;
  };

  const outline = getOutline();
  const hasOutline = outline.length > 0;

  const scrollToSection = (index) => {
    if (scrollRef.current) {
      const element = scrollRef.current;
      // Scroll roughly to the index proportion or scan inner text elements if needed
      const totalHeight = element.scrollHeight;
      const targetScroll = (totalHeight / outline.length) * index;
      element.scrollTo({
        top: Math.min(targetScroll, totalHeight),
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 md:p-6 select-none">
      {/* Scroll indicator bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/[0.03] z-50">
        <div
          className="h-full bg-orange-500 transition-all duration-100 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
          style={{ width: `${scrollPercent}%` }}
        />
      </div>

      <div className={`w-full h-[92vh] bg-surface-card border border-white/6 rounded-2xl flex flex-col shadow-2xl transition-all duration-300 relative ${
        focusMode ? 'max-w-3xl' : 'max-w-5xl'
      }`}>
        {/* Modal Header */}
        {!focusMode && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-black/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <AppIcon name={output.type === 'study_guide' ? 'book' : 'sparkles'} size={14} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-white leading-none tracking-tight">{output.title}</h3>
                <span className="text-[8px] text-orange-455 font-bold uppercase tracking-widest block mt-1.5">
                  Studio Asset • {output.type.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Focus Mode Toggle */}
              <button
                onClick={() => setFocusMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-slate-400 hover:text-white bg-white/[0.02] border border-white/5 rounded-xl transition"
                title="Enter Reading Focus Mode"
              >
                <AppIcon name="maximize" size={10} />
                <span>Focus</span>
              </button>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-slate-400 hover:text-white bg-white/[0.02] border border-white/5 rounded-xl transition"
              >
                <AppIcon name="paperclip" size={10} />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              {/* Download PDF */}
              {output.type !== 'flashcards' && (
                <button
                  onClick={handleDownloadPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl transition"
                >
                  <AppIcon name="upload" size={10} />
                  <span>PDF</span>
                </button>
              )}

              <button onClick={onClose} className="text-slate-500 hover:text-white transition pl-2">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-bold text-slate-400 hover:text-white bg-[#0d0e12]/80 border border-white/8 backdrop-blur-md rounded-xl transition shadow-lg"
            >
              <AppIcon name="minimize" size={10} />
              <span>Exit Focus</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-[#0d0e12]/80 border border-white/8 backdrop-blur-md flex items-center justify-center text-slate-400 hover:text-white transition shadow-lg"
            >
              <AppIcon name="x" size={12} />
            </button>
          </div>
        )}

        {/* Document Body Area */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Outline Sidebar Panel */}
          {!focusMode && hasOutline && (
            <aside className="w-56 border-r border-white/5 p-4 overflow-y-auto shrink-0 space-y-4 bg-black/5 hidden md:block">
              <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block">Document Index</span>
              <nav className="space-y-1">
                {outline.map((heading, hIdx) => (
                  <button
                    key={hIdx}
                    onClick={() => scrollToSection(hIdx)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10.5px] font-medium text-slate-400 hover:text-orange-400 hover:bg-white/[0.015] truncate block transition"
                    title={heading.text}
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            </aside>
          )}

          {/* Reading Scroll viewport */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto py-8 px-6 md:px-12 scrollbar-thin select-text"
          >
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Focus mode title highlight */}
              {focusMode && (
                <div className="pb-6 border-b border-white/5 mb-8 select-none">
                  <span className="text-[8px] text-orange-455 font-extrabold uppercase tracking-widest mb-1.5 block">Textbook Mode</span>
                  <h1 className="text-xl font-extrabold text-white leading-tight">{output.title}</h1>
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
        </div>

        {/* Modal Footer bibliography */}
        {!focusMode && output.sourcesUsed && output.sourcesUsed.length > 0 && (
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

