import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppIcon from '../AppIcon';
import ArtifactsPanel from './ArtifactsPanel';

export default function StudioPanel({
  outputs = [],
  activeOutputId,
  isGenerating,
  onGenerate,
  onSelectOutput,
  onDeleteOutput,
  onDuplicateOutput,
  onRenameOutput,
  onViewVersions,
  onOpenVisualModal,
  onOpenPresentationModal,
  onOpenAudioModal,
}) {
  const [topicFocus, setTopicFocus] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [isExpandedTools, setIsExpandedTools] = useState(false);

  const tools = [
    // LEARN
    { id: 'study_guide',        label: 'Deep Study Guide',         icon: 'book',        color: 'text-emerald-400', category: 'learn',    desc: 'Comprehensive grounded overview' },
    { id: 'key_insights',       label: 'Research Insights',        icon: 'lightbulb',   color: 'text-yellow-400',  category: 'learn',    desc: 'Top 10 profound takeaways' },
    { id: 'faq',                label: 'Grounded FAQ',             icon: 'message',     color: 'text-orange-400',  category: 'learn',    desc: 'Source-grounded Q&A pairs' },
    // MEMORIZE
    { id: 'flashcards',         label: 'Flashcards',               icon: 'sparkles',    color: 'text-amber-400',   category: 'memorize', desc: 'Active-recall card decks' },
    { id: 'revision_sheet',     label: 'Revision Sheet',           icon: 'rocket',      color: 'text-orange-400',  category: 'memorize', desc: 'Cheat-sheet summary card' },
    { id: 'key_definitions',    label: 'Glossary',                 icon: 'alignLeft',   color: 'text-pink-400',    category: 'memorize', desc: 'Indexed dictionary of terms' },
    // TEST
    { id: 'interview_questions',label: 'Mock Q&A',                 icon: 'mic',         color: 'text-rose-400',    category: 'test',     desc: 'Oral prep & exam queries' },
    { id: 'exam_prep',          label: 'Exam Simulator',           icon: 'graduation',  color: 'text-cyan-400',    category: 'test',     desc: 'MCQ & short-answer exam' },
    // VISUALIZE
    { id: 'topic_breakdown',    label: 'Interactive Mind Map',     icon: 'brain',       color: 'text-violet-400',  category: 'visualize',desc: 'Nested concept clusters' },
    { id: 'mermaid_diagram',    label: 'Mermaid Knowledge Diagram',icon: 'sparkles',    color: 'text-indigo-400',  category: 'visualize',desc: 'Flow & architecture diagrams' },
  ];

  const categories = [
    { id: 'all',      label: 'All' },
    { id: 'learn',    label: 'Learn' },
    { id: 'memorize', label: 'Memorize' },
    { id: 'test',     label: 'Test' },
    { id: 'visualize',label: 'Visualize' },
  ];

  // Progressive synthesis loader — stage-aware labels
  const synthesisSteps = [
    { text: 'Retrieving Sources...', limit: 25 },
    { text: 'Ranking Evidence...', limit: 50 },
    { text: 'Structuring Output...', limit: 75 },
    { text: 'Generating Asset...', limit: 95 },
  ];


  const filteredTools = tools.filter(
    (tool) => activeCategory === 'all' || tool.category === activeCategory
  );

  useEffect(() => {
    let interval;
    if (isGenerating) {
      setSimulatedProgress(0);
      setStepIndex(0);
      interval = setInterval(() => {
        setSimulatedProgress((prev) => {
          if (prev >= 98) return 98; // hold until done
          const nextVal = prev + Math.floor(Math.random() * 8) + 2;
          
          // Update message based on range
          if (nextVal < 25) setStepIndex(0);
          else if (nextVal < 50) setStepIndex(1);
          else if (nextVal < 75) setStepIndex(2);
          else setStepIndex(3);

          return nextVal;
        });
      }, 500);
    } else {
      setSimulatedProgress(0);
      setStepIndex(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const [studyGuideDepth, setStudyGuideDepth] = useState('standard');

  const handleCreate = (type) => {
    if (isGenerating) return;
    onGenerate({
      type,
      depth: type === 'study_guide' ? studyGuideDepth : undefined,
    });
  };

  return (
    <aside className="w-full flex flex-col h-full border-l border-white/5 bg-[#06070a]/80 backdrop-blur-xl select-none shrink-0 z-10 min-h-0">
      {/* Studio Header */}
      <div className="p-4 border-b border-white/5 bg-black/20 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <AppIcon name="sparkles" className="text-orange-400" size={10} />
            </div>
            <span className="text-[10px] font-extrabold text-slate-200 uppercase tracking-widest">Synthesis Lab</span>
          </div>
        </div>


      </div>

      {/* Category Tabs */}
      <div className="px-4 pt-3 flex items-center gap-1 border-b border-white/5 shrink-0 bg-black/10 overflow-x-auto scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2.5 py-2 text-[10px] font-bold border-b-2 transition-all relative whitespace-nowrap ${
              activeCategory === cat.id
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Output Grid and Generated lists */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-5 scrollbar-thin">
        
        {/* Refined V4 primary buttons */}
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <button
            onClick={onOpenPresentationModal}
            disabled={isGenerating}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15 hover:border-orange-500/30 transition text-center disabled:opacity-50 select-none cursor-pointer h-16"
          >
            <AppIcon name="book" size={14} className="text-orange-400 mb-1" />
            <span className="text-[9.5px] font-extrabold text-slate-200">Presentation</span>
          </button>
          <button
            onClick={onOpenVisualModal}
            disabled={isGenerating}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15 hover:border-orange-500/30 transition text-center disabled:opacity-50 select-none cursor-pointer h-16"
          >
            <AppIcon name="sparkles" size={14} className="text-orange-400 mb-1" />
            <span className="text-[9.5px] font-extrabold text-slate-200">Visual</span>
          </button>
          <button
            onClick={onOpenAudioModal}
            disabled={isGenerating}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15 hover:border-orange-500/30 transition text-center disabled:opacity-50 select-none cursor-pointer h-16"
          >
            <AppIcon name="mic" size={14} className="text-orange-400 mb-1" />
            <span className="text-[9.5px] font-extrabold text-slate-200">Audio</span>
          </button>
        </div>

        {/* Generative Cards Grid */}
        <div className="space-y-3">
          {/* Lightweight Quick Actions */}
          {!isExpandedTools ? (
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">Quick Actions</span>
              <div className="flex flex-col gap-1.5">
                {filteredTools.slice(0, 3).map((tool) => {
                  const isStudyGuide = tool.id === 'study_guide';
                  return (
                    <div
                      key={tool.id}
                      onClick={() => {
                        if (isGenerating) return;
                        handleCreate(tool.id);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition group cursor-pointer ${
                        isGenerating ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <AppIcon name={tool.icon} size={12} className={`${tool.color} opacity-80 group-hover:opacity-100 transition`} />
                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-slate-100 transition">{tool.label}</span>
                      </div>
                      {isStudyGuide && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <select
                            value={studyGuideDepth}
                            onChange={(e) => setStudyGuideDepth(e.target.value)}
                            className="bg-neutral-900 border border-white/10 hover:border-orange-500/20 rounded px-1.5 py-0.5 text-[8.5px] font-semibold text-slate-300 focus:outline-none focus:border-orange-500/35 transition cursor-pointer"
                          >
                            <option value="quick">Quick</option>
                            <option value="standard">Standard</option>
                            <option value="deep">Deep</option>
                            <option value="expert">Expert</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setIsExpandedTools(true)}
                className="w-full mt-2 py-2 border border-white/5 bg-transparent hover:bg-white/[0.02] text-[10px] font-bold text-slate-400 hover:text-slate-200 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Open Studio Mode</span>
                <AppIcon name="chevronLeft" size={10} className="-rotate-90" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">Studio Generators</span>
                <button
                  onClick={() => setIsExpandedTools(false)}
                  className="text-[9px] text-orange-400 hover:text-orange-300 font-bold uppercase tracking-wider"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {filteredTools.map((tool) => {
                  const isStudyGuide = tool.id === 'study_guide';
                  return (
                    <motion.div
                      key={tool.id}
                      onClick={(e) => {
                        if (isGenerating) return;
                        handleCreate(tool.id);
                      }}
                      whileHover={{ scale: 1.01, translateY: -1 }}
                      whileTap={{ scale: 0.99 }}
                      className={`flex flex-col items-start p-2.5 rounded-xl bg-white/[0.015] border border-white/5 hover:border-orange-500/20 hover:bg-orange-500/[0.01] transition-premium text-left group min-h-[82px] h-auto justify-between cursor-pointer ${
                        isGenerating ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className={`w-5 h-5 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-center transition group-hover:bg-orange-500/10 group-hover:border-orange-500/20 group-hover:${tool.color}`}>
                          <AppIcon name={tool.icon} size={10} className={`${tool.color} transition-transform duration-300 group-hover:scale-110`} />
                        </div>
                        {isStudyGuide && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={studyGuideDepth}
                              onChange={(e) => setStudyGuideDepth(e.target.value)}
                              className="bg-neutral-900 border border-white/10 hover:border-orange-500/20 rounded px-1 py-0.5 text-[8.5px] font-semibold text-slate-300 focus:outline-none focus:border-orange-500/35 transition cursor-pointer select-none"
                            >
                              <option value="quick">Quick</option>
                              <option value="standard">Standard</option>
                              <option value="deep">Deep</option>
                              <option value="expert">Expert</option>
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="w-full mt-2">
                        <span className="text-[10px] font-bold text-slate-200 block group-hover:text-orange-400 transition truncate w-full">{tool.label}</span>
                        <span className="text-[8px] text-slate-500 leading-tight block group-hover:text-slate-450 transition line-clamp-1 mt-0.5 font-medium">{tool.desc}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Progressive Synthesis Timeline */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#0b0c10]/60 border border-orange-500/15 rounded-xl p-4 space-y-3.5 relative overflow-hidden"
            >
              {/* Pulse background sphere */}
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-orange-500/5 blur-xl pointer-events-none" />

              <div className="flex items-center justify-between relative z-10">
                <span className="text-[9px] font-extrabold text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                  <AppIcon name="loader" size={9} className="animate-spin text-orange-400" />
                  <span>Cognitive Synthesis</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-300">{simulatedProgress}%</span>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden relative z-10">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
                  style={{ width: `${simulatedProgress}%` }}
                  transition={{ ease: 'easeOut' }}
                />
              </div>

              {/* Steps display */}
              <div className="space-y-1.5 pt-1 relative z-10 select-none">
                {synthesisSteps.map((step, sIdx) => {
                  const isActive = stepIndex === sIdx;
                  const isDone = stepIndex > sIdx;

                  return (
                    <div
                      key={sIdx}
                      className={`flex items-center gap-2 text-[9px] transition-all duration-300 ${
                        isActive
                          ? 'text-slate-200 font-bold'
                          : isDone
                          ? 'text-orange-400 opacity-60 font-semibold'
                          : 'text-slate-600 font-medium'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[7px] shrink-0 ${
                        isDone
                          ? 'bg-orange-500/10 border-orange-500 text-orange-400'
                          : isActive
                          ? 'bg-orange-500/10 border-orange-400 text-orange-300 animate-pulse'
                          : 'border-white/5 bg-transparent text-slate-650'
                      }`}>
                        {isDone ? '✓' : sIdx + 1}
                      </div>
                      <span className="truncate">{step.text}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Artifacts Explorer Grid */}
        <ArtifactsPanel
          outputs={outputs}
          activeOutputId={activeOutputId}
          isGenerating={isGenerating}
          onSelectOutput={onSelectOutput}
          onDeleteOutput={onDeleteOutput}
          onDuplicateOutput={onDuplicateOutput}
          onRenameOutput={onRenameOutput}
          onViewVersions={onViewVersions}
          onGenerate={onGenerate}
        />
      </div>
    </aside>
  );
}


