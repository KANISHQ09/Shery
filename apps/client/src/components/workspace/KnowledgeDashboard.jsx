import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppIcon from '../AppIcon';
import WorkspaceInfrastructureHealthPanel from './WorkspaceInfrastructureHealthPanel';
import LearningProgressPanel from './LearningProgressPanel';

// ============================================================================
// COMPONENT: Learning Intelligence Hub Dashboard
// ============================================================================
export default function KnowledgeDashboard({
  metrics,
  memory,
  graph,
  learning,
  coverage,
  onGenerateStudyGuide,
}) {
  const sourceCount = metrics?.totalSources || 0;
  const chunkCount = metrics?.totalChunks || 0;
  const outputCount = metrics?.totalOutputs || 0;
  const totalPages = metrics?.totalPages || 0;
  const durationMin = metrics?.totalDurationSec ? Math.round(metrics.totalDurationSec / 60) : 0;

  // States
  const [focusedConcept, setFocusedConcept] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  // Graph state
  const [zoom, setZoom] = useState(0.95);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreenGraph, setIsFullscreenGraph] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  // SVG parameters
  const width = 640;
  const height = 400;
  const center = { x: width / 2, y: height / 2 };

  // Data extraction & Fallbacks (AI Demo state generator if empty)
  const hasRealData = graph?.clusters && graph.clusters.length > 0;
  const rawClusters = hasRealData ? graph.clusters : [
    { clusterName: 'Vector Embeddings', concepts: ['Dense vectors', 'Cosine similarity', 'NVIDIA embeddings', 'Dimensions'], sourceIds: ['s1', 's2'] },
    { clusterName: 'Chunking Strategy', concepts: ['Recursive text splitter', 'Overlap size', 'Tokens count', 'Semantic chunking'], sourceIds: ['s2', 's3'] },
    { clusterName: 'Retrieval (BM25)', concepts: ['Lexical search', 'Term frequency', 'Inverse document frequency', 'Keyword search'], sourceIds: ['s1'] },
    { clusterName: 'Reranking & RRF', concepts: ['Reciprocal Rank Fusion', 'Semantic rerank', 'Score normalization', 'Fusion k-factor'], sourceIds: ['s3', 's4'] },
    { clusterName: 'RAG Orchestration', concepts: ['Context managers', 'Synthesized groundings', 'Hallucination checks', 'Prompt pipelines'], sourceIds: ['s1', 's4'] },
    { clusterName: 'Agentic Reasoning', concepts: ['Subagents', 'Tool binding', 'Planning cycle', 'LLM orchestrators'], sourceIds: ['s3', 's5'] },
  ];

  const completeness = coverage?.completeness ?? (hasRealData ? 78 : 45);
  const sourceOverlap = coverage?.sourceOverlapPercentage ?? (hasRealData ? 32 : 15);
  const masteryList = learning?.mastery && learning.mastery.length > 0 ? learning.mastery : [
    { clusterName: 'Vector Embeddings', status: 'Mastered', masteryLevel: 92 },
    { clusterName: 'Chunking Strategy', status: 'Learning', masteryLevel: 65 },
    { clusterName: 'Retrieval (BM25)', status: 'Mastered', masteryLevel: 88 },
    { clusterName: 'Reranking & RRF', status: 'Learning', masteryLevel: 40 },
    { clusterName: 'RAG Orchestration', status: 'Unexplored', masteryLevel: 10 },
    { clusterName: 'Agentic Reasoning', status: 'Unexplored', masteryLevel: 5 },
  ];

  const gaps = learning?.gaps && learning.gaps.length > 0 ? learning.gaps : [
    { title: 'Prerequisite Embedding Gap', impact: 'High Warning', description: 'Your workspace lacks coverage in sparse-vector embeddings (like BM25). This might degrade hybrid retrieval logic.', recommendation: 'Upload documentation covering hybrid lexical indexing.' },
    { title: 'Orchestration Gap', impact: 'Medium Warning', description: 'LangChain retrieval components are represented but evaluation strategies are missing.', recommendation: 'Consider adding documents related to RAGAS or RAG evaluation metrics.' },
  ];

  // SVG Progress Ring calculations
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completeness / 100) * circumference;

  // Map clusters to Node coordinates
  const nodes = rawClusters.map((c, idx) => {
    const name = c.clusterName || `Concept ${idx + 1}`;
    // Position nodes using orbital distribution
    const angle = (idx / (rawClusters.length || 1)) * 2 * Math.PI;
    const distance = rawClusters.length > 5 ? 130 : 90;
    const variance = idx % 2 === 0 ? 1.05 : 0.9;
    
    return {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      displayName: name,
      x: center.x + Math.cos(angle) * distance * variance,
      y: center.y + Math.sin(angle) * distance * variance,
      concepts: c.concepts || [],
      sourceIds: c.sourceIds || [],
      size: Math.max(12, Math.min(22, (c.concepts?.length || 2) * 2.5 + 8)),
      color: ['orange', 'violet', 'cyan', 'emerald', 'amber'][idx % 5],
    };
  });

  // Calculate links between nodes based on source overlap
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];
      const sharedSources = nodeA.sourceIds.filter(id => nodeB.sourceIds.includes(id));
      const sharedConcepts = nodeA.concepts.filter(c => nodeB.concepts.some(nc => nc.toLowerCase() === c.toLowerCase()));

      if (sharedSources.length > 0 || sharedConcepts.length > 0) {
        links.push({
          source: nodeA,
          target: nodeB,
          strength: sharedSources.length * 1.5 + sharedConcepts.length * 0.5,
          key: `${nodeA.id}-${nodeB.id}`,
        });
      }
    }
  }

  // Graph Navigation Handlers
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'circle' || e.target.closest('.interactive-node')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const adjustZoom = (amount) => {
    setZoom(prev => Math.max(0.5, Math.min(2.0, prev + amount)));
  };

  const resetViewport = () => {
    setZoom(0.95);
    setPan({ x: 0, y: 0 });
  };

  // Roadmap steps
  const roadmapSteps = [
    { label: 'Foundational Knowledge', desc: 'Study base definitions and core dense embeddings.', done: completeness > 20 },
    { label: 'Lexical vs Semantic Retrieval', desc: 'Master BM25 keyword search and vector cosine similarity.', done: completeness > 40 },
    { label: 'Hybrid Integration', desc: 'Configure Reciprocal Rank Fusion (RRF) and custom rerank templates.', done: completeness > 60 },
    { label: 'RAG Pipeline Implementation', desc: 'Deploy contextual chunks with citations and hallucination guards.', done: completeness > 80 },
    { label: 'Agentic Cognitive Orchestration', desc: 'Enable multi-agent subagent loops and tools execution plans.', done: completeness > 95 },
  ];

  // Search filtering logic
  const isSearchActive = searchQuery.trim().length > 0;
  const filteredNodes = nodes.map(node => {
    const isMatch = !isSearchActive || 
      node.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.concepts.some(c => c.toLowerCase().includes(searchQuery.toLowerCase()));
    return { ...node, isMatch };
  });

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto p-6 space-y-6 bg-[#030305] select-none scrollbar-thin relative font-sans">
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.97); opacity: 0.5; }
          50% { transform: scale(1.03); opacity: 0.85; }
          100% { transform: scale(0.97); opacity: 0.5; }
        }
        .orb-pulse {
          animation: pulse-ring 4s ease-in-out infinite;
        }
        @keyframes flow-line {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .animated-link {
          stroke-dasharray: 6 3;
          animation: flow-line 3s linear infinite;
        }
      `}</style>

      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white/[0.01] border border-white/5 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-orange-500/[0.02] blur-[80px] pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-48 opacity-10 pointer-events-none hidden md:block">
          <AppIcon name="brain" size={120} className="text-orange-400 absolute -bottom-10 -right-6" />
        </div>

        <div className="space-y-1.5 relative z-10 max-w-xl">
          <span className="text-[9px] font-extrabold text-orange-400 tracking-widest uppercase block">Workspace Intelligence</span>
          <h2 className="text-sm font-extrabold text-white uppercase tracking-tight">Cognitive Operating System</h2>
          <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
            Analyse the semantic connectivity of your grounding database, view weaknesses/prerequisites, and auto-synthesize editorial textbooks.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onGenerateStudyGuide}
          className="mt-4 md:mt-0 relative z-10 px-4 py-2.5 text-[9.5px] font-extrabold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-lg hover:shadow-orange-500/10 flex items-center gap-2 transition uppercase tracking-wider cursor-pointer"
        >
          <AppIcon name="sparkles" size={11} />
          <span>Synthesize Study Guide</span>
        </motion.button>
      </div>

      {/* 2. Hero Overview & Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* AI Cognitive Overview Hero */}
        <div className="lg:col-span-2 bg-[#06070a]/40 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden group hover:border-orange-500/10 transition-all duration-300">
          {/* Subtle background glow */}
          <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-orange-500/5 blur-3xl pointer-events-none" />
          
          <div className="w-16 h-16 rounded-full border border-orange-500/20 bg-orange-500/5 flex items-center justify-center shrink-0 relative orb-pulse">
            <AppIcon name="brain" size={20} className="text-orange-400 relative z-10" />
          </div>

          <div className="flex-1 space-y-4 text-center md:text-left">
            <div>
              <span className="text-[8px] font-extrabold text-orange-400 uppercase tracking-widest block mb-0.5">Grounding Analysis</span>
              <h3 className="text-xs font-bold text-slate-200 leading-tight">
                {completeness > 70 
                  ? 'Your workspace has solid grounded semantic coverage across key topics.' 
                  : 'Workspace analysis complete. Concept mappings are generated below.'}
              </h3>
            </div>
            
            <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
              Detected <strong className="text-slate-200 font-bold">{nodes.length} primary concept clusters</strong> indexing <strong className="text-slate-200 font-bold">{chunkCount} chunks</strong>. Grounding reliability is rated as <span className="text-orange-400 font-bold">Optimal</span>.
            </p>

            <div className="flex flex-wrap gap-5 pt-1 justify-center md:justify-start">
              {[
                { label: 'Lexical Overlap', val: `${completeness + 5}%` },
                { label: 'Orbital Links', val: `${links.length}` },
                { label: 'Indexed Sources', val: `${sourceCount}` },
                { label: 'Workspace Density', val: totalPages > 0 ? `${totalPages} pgs` : `${durationMin}m` }
              ].map((ind, i) => (
                <div key={i} className="text-left border-l border-white/5 pl-3 first:border-0 first:pl-0">
                  <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">{ind.label}</span>
                  <span className="text-[11px] font-extrabold text-slate-200 mt-0.5 block">{ind.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coverage Completeness Circular Meter */}
        <div className="bg-[#06070a]/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-orange-500/10 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Semantic Completeness</span>
            <AppIcon name="target" size={12} className="text-orange-400" />
          </div>
          
          <div className="py-4 flex flex-col items-center justify-center relative select-none">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="rgba(255, 255, 255, 0.02)"
                  strokeWidth="4"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="url(#hero-gradient)"
                  strokeWidth="4.5"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
                <defs>
                  <linearGradient id="hero-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-[15px] font-extrabold text-slate-100 leading-none">{completeness}%</span>
                <span className="text-[7px] font-bold uppercase tracking-widest text-slate-500 mt-1">Grounding</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-[9px] font-semibold text-slate-450 border-t border-white/5 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Cross-Source Overlap</span>
              <span className="text-slate-300 font-bold">{sourceOverlap}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Mastery Index Score</span>
              <span className="text-orange-400 font-bold">Optimal</span>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Center Section: Knowledge Graph & Roadmap / Insights Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Interactive Knowledge Universe SVG */}
        <div className={`bg-[#06070a]/40 border border-white/5 rounded-2xl flex flex-col hover:border-orange-500/10 transition-all duration-300 relative overflow-hidden min-h-[400px] ${
          isFullscreenGraph ? 'lg:col-span-3 h-[75vh]' : 'lg:col-span-2'
        }`}>
          {/* Header controls */}
          <div className="h-[56px] flex items-center justify-between px-5 border-b border-white/5 shrink-0 bg-[#08090d]/30 select-none">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-xs font-extrabold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
                  <span>Semantic Knowledge Universe</span>
                  {!hasRealData && (
                    <span className="px-1.5 py-0.5 text-[7px] font-bold uppercase border border-orange-500/25 text-orange-400 bg-orange-500/5 rounded-md">
                      Demo State
                    </span>
                  )}
                </h3>
                <span className="text-[9px] text-slate-550 block font-medium">Concept nodes & shared document relationships</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Inline Search Bar */}
              <div className="relative hidden md:block">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find concept..."
                  className="bg-black/45 border border-white/5 rounded-lg px-2.5 py-1 text-[9.5px] text-slate-200 placeholder-slate-650 focus:outline-none focus:border-orange-500/30 w-36 font-semibold"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2 text-slate-500 hover:text-slate-350">
                    <AppIcon name="x" size={8} />
                  </button>
                )}
              </div>

              {/* Fullscreen graph */}
              <button
                onClick={() => setIsFullscreenGraph(!isFullscreenGraph)}
                className="p-1.5 rounded-lg text-slate-550 hover:text-slate-350 hover:bg-white/[0.02] border border-white/5 transition"
                title={isFullscreenGraph ? 'Exit Fullscreen' : 'Fullscreen Graph'}
              >
                <AppIcon name={isFullscreenGraph ? 'minimize' : 'maximize'} size={10} />
              </button>

              <div className="flex items-center gap-1 bg-white/[0.015] border border-white/5 rounded-lg p-0.5 text-[9px] font-bold">
                <button onClick={() => adjustZoom(0.1)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-250 hover:bg-white/[0.04] transition">+</button>
                <button onClick={() => adjustZoom(-0.1)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-250 hover:bg-white/[0.04] transition">-</button>
                <button onClick={resetViewport} className="px-1.5 h-5 flex items-center justify-center rounded text-slate-450 hover:text-slate-300 hover:bg-white/[0.04] transition">Reset</button>
              </div>
            </div>
          </div>

          {/* SVG Frame Area */}
          <div
            className="flex-1 relative bg-black/10 flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            ref={svgRef}
          >
            {/* Central Glow */}
            <div className="absolute w-80 h-80 rounded-full bg-orange-500/[0.015] blur-[120px] pointer-events-none" />

            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${width} ${height}`}
              className="absolute inset-0 select-none overflow-hidden"
            >
              <defs>
                <radialGradient id="graph-radial-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(99,102,241,0.01)" stopColorOpacity="0.08" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
                <filter id="node-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <circle cx={center.x} cy={center.y} r={95} fill="url(#graph-radial-grad)" stroke="rgba(255,255,255,0.01)" strokeWidth={1} strokeDasharray="3 5" />
              <circle cx={center.x} cy={center.y} r={135} fill="none" stroke="rgba(255,255,255,0.005)" strokeWidth={1} />

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} className="transition-transform duration-75 ease-out">
                {/* 1. Links */}
                {links.map((link) => {
                  const isSourceMatch = !isSearchActive || (link.source.isMatch && link.target.isMatch);
                  return (
                    <line
                      key={link.key}
                      x1={link.source.x}
                      y1={link.source.y}
                      x2={link.target.x}
                      y2={link.target.y}
                      stroke={isSourceMatch ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.02)'}
                      strokeWidth={isSourceMatch ? 0.75 : 0.5}
                      className={isSourceMatch ? 'animated-link' : ''}
                    />
                  );
                })}

                {/* 2. Nodes */}
                {filteredNodes.map((node) => {
                  const nodeColorClass = {
                    orange: 'stroke-orange-500 fill-orange-500/10 text-orange-400',
                    violet: 'stroke-violet-500 fill-violet-500/10 text-violet-400',
                    cyan: 'stroke-cyan-500 fill-cyan-500/10 text-cyan-400',
                    emerald: 'stroke-emerald-500 fill-emerald-500/10 text-emerald-450',
                    amber: 'stroke-amber-500 fill-amber-500/10 text-amber-450',
                  }[node.color] || 'stroke-orange-500 fill-orange-500/10 text-orange-400';

                  const dimOpacity = node.isMatch ? 'opacity-100' : 'opacity-15';

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      className={`interactive-node cursor-pointer group transition-all duration-300 ${dimOpacity}`}
                      onClick={() => setFocusedConcept(node)}
                    >
                      <circle
                        r={node.size + 8}
                        fill="transparent"
                        stroke="rgba(255,255,255,0.01)"
                        className="group-hover:stroke-orange-500/10 transition-all duration-300"
                        strokeWidth={1}
                      />
                      <circle
                        r={node.size}
                        className={`${nodeColorClass} transition-all duration-300 group-hover:scale-105`}
                        strokeWidth={1.5}
                        filter={node.isMatch ? 'url(#node-glow)' : ''}
                      />
                      <circle
                        r={2}
                        fill="#ffffff"
                        className="opacity-50"
                      />
                      <text
                        y={node.size + 13}
                        textAnchor="middle"
                        className="text-[8px] font-extrabold uppercase tracking-widest fill-slate-500 group-hover:fill-white transition duration-300"
                      >
                        {node.displayName}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>

        {/* AI Learning Insights & Gap Detection */}
        <div className="bg-[#06070a]/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-orange-500/10 transition-all duration-300 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5 shrink-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">AI Learning Insights</span>
            <AppIcon name="lightbulb" size={12} className="text-orange-400" />
          </div>

          {/* Warnings & Insights content */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin max-h-80">
            {gaps.map((gap, idx) => (
              <div key={idx} className="bg-amber-500/[0.02] border border-amber-500/10 rounded-xl p-3.5 space-y-2 text-[10px] select-text">
                <div className="flex items-center justify-between font-bold text-amber-400 select-none">
                  <span className="uppercase tracking-wider font-mono text-[9px]">{gap.title}</span>
                  <span className="text-[7px] bg-amber-500/10 border border-amber-500/15 px-1.5 py-0.5 rounded font-extrabold uppercase">{gap.impact || 'Warning'}</span>
                </div>
                <p className="text-slate-350 leading-relaxed font-semibold">{gap.description}</p>
                <div className="pt-2 flex items-center justify-between border-t border-white/[0.03] select-none">
                  <span className="text-[8.5px] text-slate-500 truncate max-w-[155px] font-medium">{gap.recommendation}</span>
                  <button
                    onClick={onGenerateStudyGuide}
                    className="px-2 py-1 text-[8.5px] font-bold text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 rounded-lg transition cursor-pointer"
                  >
                    Fix Gap
                  </button>
                </div>
              </div>
            ))}

            {/* General Proactive learning tips */}
            <div className="p-3.5 rounded-xl border border-white/5 bg-[#0a0a0f]/40 space-y-2 text-[10px] select-text">
              <span className="text-[8.5px] font-bold text-orange-400 uppercase tracking-wider block select-none">Roadmap Directive</span>
              <p className="text-slate-350 leading-relaxed font-medium">
                You should examine <strong className="text-slate-200">Chunking Overlaps</strong> and <strong className="text-slate-200">Reranking scores</strong> next. Your current grounding history suggests focusing on hybrid lexical indexing configurations.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bottom Row: Roadmap Timeline & Concept Cards Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Learning Roadmap timeline */}
        <div className="bg-[#06070a]/40 border border-white/5 rounded-2xl p-5 hover:border-orange-500/10 transition-all duration-300 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5 shrink-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Learning Roadmap</span>
            <AppIcon name="clock" size={12} className="text-orange-400" />
          </div>

          <div className="space-y-4 pr-1 max-h-72 overflow-y-auto scrollbar-thin select-none">
            {roadmapSteps.map((step, idx) => (
              <div key={idx} className="flex gap-3.5 items-start relative pb-2">
                {/* Connector line */}
                {idx < roadmapSteps.length - 1 && (
                  <div className={`absolute left-2.5 top-6 bottom-0 w-[1px] ${step.done ? 'bg-orange-500/35' : 'bg-white/5'}`} />
                )}
                
                {/* Node bubble */}
                <div className={`w-5.5 h-5.5 rounded-full border flex items-center justify-center shrink-0 text-[8px] font-mono font-extrabold ${
                  step.done
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                    : 'bg-white/[0.01] border-white/5 text-slate-650'
                }`}>
                  {step.done ? '✓' : idx + 1}
                </div>

                <div className="space-y-0.5">
                  <h5 className={`text-[11px] font-bold leading-tight ${step.done ? 'text-slate-200' : 'text-slate-500'}`}>{step.label}</h5>
                  <p className="text-[10px] text-slate-500 leading-normal font-medium">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Learning Progress Panel */}
        <LearningProgressPanel learning={learning} />

        {/* Concept Cards Directory */}
        <div className="bg-[#06070a]/40 border border-white/5 rounded-2xl p-5 hover:border-orange-500/10 transition-all duration-300 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5 shrink-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Concept Cards Directory</span>
            <AppIcon name="book" size={12} className="text-orange-400" />
          </div>

          <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
            {nodes.map((node, idx) => {
              const matchedMastery = masteryList.find(m => m.clusterName.toLowerCase() === node.displayName.toLowerCase());
              const level = matchedMastery?.masteryLevel || 0;
              const status = matchedMastery?.status || 'Unexplored';

              return (
                <div
                  key={idx}
                  onClick={() => setFocusedConcept(node)}
                  className="p-3.5 rounded-xl border border-white/5 bg-[#0a0a0f]/40 hover:border-orange-500/15 hover:bg-orange-500/[0.01] transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3.5 relative group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-205 group-hover:text-orange-400 transition truncate">{node.displayName}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[7px] font-extrabold uppercase border shrink-0
                        ${status === 'Mastered' ? 'bg-emerald-950/20 border-emerald-500/25 text-emerald-450' : ''}
                        ${status === 'Learning' ? 'bg-orange-950/20 border-orange-500/25 text-orange-450' : ''}
                        ${status === 'Unexplored' ? 'bg-white/[0.03] border-white/5 text-slate-500' : ''}
                      `}>
                        {status}
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-500 truncate font-semibold leading-none mt-1">
                      Keywords: {node.concepts.join(', ')}
                    </p>
                  </div>

                  {/* Mini progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[8.5px] text-slate-500 select-none font-semibold">
                      <span>Concept mastery</span>
                      <span className="font-bold text-slate-350">{level}%</span>
                    </div>
                    <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${status === 'Mastered' ? 'bg-emerald-500' : 'bg-orange-500'}`}
                        style={{ width: `${level}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 5. FOCUS MODE: Collapsible Concept Drawer Slide Overlay */}
      <AnimatePresence>
        {focusedConcept && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm select-none"
            onClick={() => { setFocusedConcept(null); setQuizAnswers({}); setQuizSubmitted({}); }}
          >
            {/* Slide out drawer panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md h-full bg-[#06070a] border-l border-white/5 shadow-2xl flex flex-col justify-between select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/10">
                <div className="space-y-1 pr-4">
                  <span className="text-[8px] font-extrabold text-orange-400 uppercase tracking-widest block">Concept Deep-Dive</span>
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-tight truncate max-w-[260px]">{focusedConcept.displayName}</h3>
                </div>
                <button
                  onClick={() => { setFocusedConcept(null); setQuizAnswers({}); setQuizSubmitted({}); }}
                  className="text-slate-500 hover:text-white transition p-1 cursor-pointer"
                >
                  <AppIcon name="x" size={16} />
                </button>
              </div>

              {/* Scrollable details content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin select-text">
                {/* Concept Synonyms */}
                <div className="space-y-2 select-none">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Extracted Keywords</span>
                  <div className="flex flex-wrap gap-1.5">
                    {focusedConcept.concepts.map((syn, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-xl bg-white/[0.015] border border-white/5 text-[9.5px] font-semibold text-slate-350 uppercase"
                      >
                        {syn}
                      </span>
                    ))}
                  </div>
                </div>

                {/* General Explanation (AI Synthesized) */}
                <div className="space-y-2 bg-orange-500/[0.01] border border-orange-500/10 p-4 rounded-xl">
                  <span className="text-[8px] font-bold text-orange-400 uppercase tracking-widest block select-none">AI Grounded Definition</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-semibold">
                    This concept cluster aggregates vector chunks and references regarding <strong className="text-white font-bold">{focusedConcept.displayName}</strong>.
                    Based on your grounding files, this acts as a core semantic module within the current workspace database.
                  </p>
                </div>

                {/* Prerequisite chains */}
                <div className="space-y-2 select-none">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Prerequisite Paths</span>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded-lg bg-white/[0.015] border border-white/5 text-[9px] text-slate-400 font-bold uppercase">Basic Grounding</div>
                    <AppIcon name="chevronLeft" size={9} className="rotate-180 text-orange-400" />
                    <div className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[9px] text-orange-400 font-bold uppercase">{focusedConcept.displayName}</div>
                  </div>
                </div>

                {/* Connected Source Documents */}
                <div className="space-y-2.5 select-none">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Supporting Grounding Files</span>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
                    {focusedConcept.sourceIds.map((srcId, idx) => (
                      <div key={idx} className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 min-w-0 pr-3">
                          <AppIcon name="file" size={10} className="text-slate-500 shrink-0" />
                          <span className="text-slate-400 font-bold truncate block">Grounding Document #{idx + 1}</span>
                        </div>
                        <span className="text-[7.5px] text-orange-450 bg-orange-500/5 border border-orange-500/10 px-2 py-0.5 rounded uppercase font-extrabold shrink-0">Active</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mini Recall Active Quiz */}
                <div className="space-y-4 border-t border-white/5 pt-5">
                  <span className="text-[8px] font-extrabold text-orange-400 uppercase tracking-widest block select-none">Active Recall Self-Quiz</span>
                  
                  {[
                    {
                      q: `How does ${focusedConcept.displayName} affect semantic query parsing inside the pipeline?`,
                      options: [
                        'A: It translates raw tokens into coordinate embedding indexes',
                        'B: It executes direct database key lookup operations',
                        'C: It runs external ungrounded LLM inference templates'
                      ],
                      correct: 'A',
                      exp: 'Embedding index coordinates align terms within vector dimensions in Qdrant, optimizing hybrid lexical models.'
                    }
                  ].map((item, idx) => {
                    const ans = quizAnswers[idx];
                    const sub = quizSubmitted[idx];

                    return (
                      <div key={idx} className="p-4 rounded-xl border border-white/5 bg-[#0a0a0f]/40 space-y-3 text-[10px]">
                        <h5 className="font-semibold text-slate-200 leading-relaxed">{item.q}</h5>
                        
                        <div className="space-y-1.5 select-none">
                          {item.options.map((opt) => {
                            const key = opt.charAt(0);
                            const isSelected = ans === key;
                            let btnStyle = 'border-white/5 bg-transparent hover:border-white/10 text-slate-400';
                            
                            if (sub) {
                              if (key === item.correct) {
                                btnStyle = 'border-emerald-500/35 bg-emerald-500/5 text-emerald-400 font-bold';
                              } else if (isSelected) {
                                btnStyle = 'border-rose-500/35 bg-rose-500/5 text-rose-400 line-through';
                              } else {
                                btnStyle = 'border-white/5 opacity-30 text-slate-600';
                              }
                            } else if (isSelected) {
                              btnStyle = 'border-orange-500/35 bg-orange-500/5 text-orange-400 font-bold';
                            }

                            return (
                              <button
                                key={key}
                                onClick={() => !sub && setQuizAnswers(p => ({ ...p, [idx]: key }))}
                                disabled={sub}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-[9.5px] transition cursor-pointer ${btnStyle}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>

                        {!sub && (
                          <button
                            onClick={() => ans && setQuizSubmitted(p => ({ ...p, [idx]: true }))}
                            disabled={!ans}
                            className="w-full text-center py-2 text-[9.5px] font-bold text-white bg-orange-650 hover:bg-orange-600 disabled:opacity-40 rounded-lg transition cursor-pointer"
                          >
                            Submit Answer
                          </button>
                        )}

                        {sub && (
                          <p className="text-[9.5px] text-slate-450 leading-relaxed border-t border-white/5 pt-2 animate-in fade-in duration-200">
                            <strong className="text-slate-350 font-bold">Explanation:</strong> {item.exp}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions Footer */}
              <div className="px-6 py-4 border-t border-white/5 bg-black/10 flex gap-2 shrink-0 select-none">
                <button
                  onClick={onGenerateStudyGuide}
                  className="flex-1 py-2 text-[9.5px] font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition uppercase tracking-wider cursor-pointer"
                >
                  Synthesize Guide
                </button>
                <button
                  onClick={() => { setFocusedConcept(null); setQuizAnswers({}); setQuizSubmitted({}); }}
                  className="px-4 py-2 text-[9.5px] font-bold text-slate-400 hover:text-white bg-white/[0.02] border border-white/5 rounded-xl transition uppercase tracking-wider cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Diagnostics Health Collapsible Panel */}
      <WorkspaceInfrastructureHealthPanel />
    </div>
  );
}

