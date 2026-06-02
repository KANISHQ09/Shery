import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppIcon from '../AppIcon';
import { downloadSummaryPDF } from '../../utils/summaryPdf';

export default function StudioWorkbench({
  outputs = [],
  isGenerating,
  onSelectOutput,
  onDeleteOutput,
}) {
  const [hoveredAsset, setHoveredAsset] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    'Parsing grounding files...',
    'Extracting semantic definitions...',
    'Structuring chapter outlines...',
    'Composing active recall quizzes...',
    'Polishing editorial layout...',
  ];

  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % steps.length);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  // Concept tags for the reactor animation
  const activeConcepts = [
    'Dense Vectors', 'Cosine Similarity', 'RRF Fusion', 'BM25 Retrieval',
    'Recursive Chunking', 'Recall Quizzes', 'Timelines', 'Glossary',
    'Synthesized Knowledge', 'Textbook Outlines'
  ];

  const handleDownloadPDF = (e, out) => {
    e.stopPropagation();
    const cleanContent = out.content
      .replace(/<(?:PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|TimelineStep|MindMapNode|QuizQuestion)([^>]*)>/gi, '')
      .replace(/<\/(?:PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|TimelineStep|MindMapNode|QuizQuestion)>/gi, '\n');

    downloadSummaryPDF(cleanContent, out.title, {
      brandName: 'SheryAI Studio',
      headerTitle: 'Generative Study Asset',
    });
  };

  const getAssetMetaDescription = (type) => {
    if (type === 'study_guide') return 'A comprehensive textbook-style study manual mapping core definitions, formulas, and progressive walkthrough chapters.';
    if (type === 'flashcards') return 'An interactive visual deck of flashcards designed with active recall algorithms and spaced repetition states.';
    if (type === 'faq') return 'A grounding FAQ dataset outlining critical questions, student conceptual blockers, and detailed answers.';
    if (type === 'timeline') return 'A linear historical flow tracking prerequisites, milestone sequences, and chronological concept maps.';
    if (type === 'key_insights') return 'An executive summary listing core insights, warning callouts, and expert concept takeaways.';
    if (type === 'key_definitions') return 'A structured glossary containing terms, detailed semantic annotations, and index tags.';
    if (type === 'interview_questions') return 'Mock Q&A board representing potential examiner questions with model answers.';
    if (type === 'topic_breakdown') return 'A hierarchical, branched mind-map representing concept clusters and source node structures.';
    if (type === 'exam_prep') return 'A full mock examination player including multiple-choice verification checks.';
    return 'An editorial workspace synthesis document compiled from grounded files.';
  };

  const getIcon = (type) => {
    if (type === 'study_guide') return 'book';
    if (type === 'flashcards') return 'sparkles';
    if (type === 'faq') return 'message';
    if (type === 'timeline') return 'clock';
    if (type === 'key_insights') return 'lightbulb';
    if (type === 'key_definitions') return 'alignLeft';
    if (type === 'interview_questions') return 'mic';
    if (type === 'topic_breakdown') return 'brain';
    if (type === 'exam_prep') return 'graduation';
    return 'rocket';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#030305]/20 overflow-hidden relative border-r border-white/5">
      {/* Visual background details */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-orange-500/[0.01] blur-[120px] pointer-events-none" />

      {/* Main viewport area */}
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
        <AnimatePresence mode="wait">
          {isGenerating ? (
            /* Synthesis Processing Stage */
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="h-full flex flex-col items-center justify-center space-y-8 select-none py-12"
            >
              {/* Glowing Particle Reactor Core */}
              <div className="relative w-48 h-48 flex items-center justify-center">
                {/* Orbital lines */}
                <div className="absolute inset-0 rounded-full border border-white/[0.02] scale-100 animate-spin" style={{ animationDuration: '20s' }} />
                <div className="absolute inset-4 rounded-full border border-dashed border-orange-500/10 scale-90 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }} />
                
                {/* Glowing Core */}
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-orange-500/10 via-amber-500/20 to-pink-500/10 flex items-center justify-center relative shadow-[0_0_50px_rgba(99,102,241,0.2)]">
                  <div className="absolute inset-1 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <AppIcon name="sparkles" size={24} className="text-orange-400 animate-pulse" />
                  </div>
                </div>

                {/* Floating active orbital concepts */}
                {activeConcepts.map((c, idx) => {
                  const angle = (idx / activeConcepts.length) * 2 * Math.PI;
                  const distance = 95;
                  const x = Math.cos(angle) * distance;
                  const y = Math.sin(angle) * distance;

                  return (
                    <motion.div
                      key={c}
                      className="absolute px-2 py-0.5 rounded-md bg-[#0a0a0f]/80 border border-white/5 text-[7px] font-bold text-slate-400 font-mono tracking-wider shadow-lg"
                      style={{ x, y }}
                      animate={{
                        x: [x, Math.cos(angle + 0.5) * (distance - 12), x],
                        y: [y, Math.sin(angle + 0.5) * (distance - 12), y],
                        opacity: [0.3, 0.9, 0.3],
                      }}
                      transition={{
                        duration: 8 + (idx % 3) * 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      {c}
                    </motion.div>
                  );
                })}
              </div>

              {/* Status information */}
              <div className="text-center space-y-2 max-w-sm">
                <span className="text-[9px] font-extrabold text-orange-400 uppercase tracking-widest block">AI Textbook Synthesis Engine</span>
                <h3 className="text-sm font-extrabold text-white">{steps[currentStep]}</h3>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                  Applying custom structured rendering rules to build highly organized, grounded educational materials.
                </p>
              </div>
            </motion.div>
          ) : outputs.length === 0 ? (
            /* Welcome / Empty Workbench Stage */
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center space-y-6 text-center select-none py-12"
            >
              <div className="w-16 h-16 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center">
                <AppIcon name="sparkles" size={24} className="text-orange-400 animate-pulse" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-tight">Instructor Studio Workbench</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                  Weave vector-indexed files into gorgeous publication-quality textbook guides, flashcard decks, timelines, and exams.
                </p>
              </div>
              <div className="text-[9px] text-slate-500 max-w-xs leading-normal bg-white/[0.01] border border-white/5 rounded-xl p-3.5 font-medium">
                💡 **Pro-Tip:** Use the focus field on the right sidebar to generate study resources strictly targeting a specific chapter or concept.
              </div>
            </motion.div>
          ) : (
            /* Gallery Workbench view */
            <motion.div
              key="gallery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4 select-none">
                <div>
                  <h3 className="text-sm font-extrabold text-white tracking-tight uppercase">Synthesized Document Library</h3>
                  <span className="text-[10px] text-slate-500 block font-medium">Browse, edit, and read publication-ready educational materials</span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[9px] font-bold text-orange-400 font-mono">
                  {outputs.length} Assets
                </span>
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {outputs.map((out) => (
                  <motion.div
                    key={out.id}
                    onClick={() => onSelectOutput(out)}
                    whileHover={{ scale: 1.01, y: -2 }}
                    className="p-5 rounded-2xl border border-white/5 bg-[#0a0a0f]/40 hover:border-orange-500/15 hover:bg-orange-500/[0.01] transition-all duration-300 cursor-pointer flex flex-col justify-between h-48 group shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] relative overflow-hidden"
                    onMouseEnter={() => setHoveredAsset(out.id)}
                    onMouseLeave={() => setHoveredAsset(null)}
                  >
                    {/* Glowing border card element */}
                    {hoveredAsset === out.id && (
                      <div className="absolute inset-0 border border-orange-500/20 rounded-2xl pointer-events-none animate-pulse" />
                    )}

                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between gap-3 select-none">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                            <AppIcon name={getIcon(out.type)} size={12} />
                          </div>
                          <span className="text-[12px] font-bold text-slate-200 group-hover:text-orange-400 transition truncate leading-tight">
                            {out.title}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase border shrink-0 bg-white/[0.02] border-white/5 text-slate-400 group-hover:border-orange-500/25 group-hover:text-orange-400 transition">
                          {out.type.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <p className="text-[10px] text-slate-450 leading-relaxed font-medium line-clamp-3 select-text pr-2">
                        {getAssetMetaDescription(out.type)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.03] select-none">
                      <span className="text-[8.5px] font-semibold text-slate-500 font-mono">
                        {new Date(out.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>

                      <div className="flex items-center gap-2">
                        {out.type !== 'flashcards' && (
                          <button
                            onClick={(e) => handleDownloadPDF(e, out)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-orange-400 hover:bg-white/[0.02] border border-white/5 transition"
                            title="Download PDF"
                          >
                            <AppIcon name="upload" size={10} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteOutput(out.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-550 hover:text-rose-400 hover:bg-white/[0.02] border border-white/5 transition"
                          title="Delete Document"
                        >
                          <AppIcon name="trash" size={10} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

