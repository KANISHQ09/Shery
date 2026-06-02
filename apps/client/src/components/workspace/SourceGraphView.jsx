import { useState, useRef, useEffect } from 'react';
import AppIcon from '../AppIcon';

export default function SourceGraphView({ graph }) {
  const relationships = graph?.relationships || [];
  const clusters = graph?.clusters || [];

  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  // SVG parameters
  const width = 700;
  const height = 450;
  const center = { x: width / 2, y: height / 2 };

  // 1. Position clusters as nodes on an orbital map
  const nodes = clusters.map((c, idx) => {
    const name = c.clusterName || c.name || `concept-${idx}`;
    // Arrange nodes in a beautiful golden ratio spiral or beautiful distribution
    const angle = (idx / (clusters.length || 1)) * 2 * Math.PI;
    const distance = clusters.length > 6 ? 140 : 100;
    
    // Slight offset for odd/even indices to add depth
    const variance = idx % 2 === 0 ? 1.05 : 0.9;
    const x = center.x + Math.cos(angle) * distance * variance;
    const y = center.y + Math.sin(angle) * distance * variance;

    return {
      id: name.toLowerCase(),
      displayName: name,
      x,
      y,
      concepts: c.concepts || [],
      sourceIds: c.sourceIds || [],
      size: Math.max(12, Math.min(24, (c.concepts?.length || 2) * 2.5 + 10))
    };
  });

  // Automatically select the first node on mount
  useEffect(() => {
    if (nodes.length > 0 && !selectedNode) {
      setSelectedNode(nodes[0]);
    }
  }, [clusters]);

  // 2. Identify links between nodes that share sources or concepts
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      // Intersection of sourceIds to identify semantic relevance links
      const sharedSources = nodeA.sourceIds.filter(id => nodeB.sourceIds.includes(id));
      
      // Also check concept overlaps
      const conceptsSet = new Set(nodeB.concepts.map(con => con.toLowerCase()));
      const sharedConcepts = nodeA.concepts.filter(con => conceptsSet.has(con.toLowerCase()));

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

  // Panning & dragging event handlers
  const handleMouseDown = (e) => {
    // Avoid dragging when clicking on actual nodes
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
    setZoom(prev => Math.max(0.6, Math.min(2.0, prev + amount)));
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const activeNode = selectedNode || (nodes.length > 0 ? nodes[0] : null);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent select-none overflow-hidden border-t border-white/5">
      {/* Header controls */}
      <div className="h-[56px] flex items-center justify-between px-6 border-b border-white/5 shrink-0 bg-[#08090d]/30">
        <div>
          <h2 className="text-xs font-bold text-slate-200 tracking-tight">Interactive Concept Universe</h2>
          <span className="text-[10px] text-slate-500 block">Animate concept links, dependencies, and source overlap maps</span>
        </div>
        
        {/* Navigation Toolbar */}
        <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 rounded-xl p-1 text-[9px]">
          <button 
            onClick={() => adjustZoom(0.15)} 
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition"
            title="Zoom In"
          >
            +
          </button>
          <button 
            onClick={() => adjustZoom(-0.15)} 
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition"
            title="Zoom Out"
          >
            -
          </button>
          <button 
            onClick={resetViewport} 
            className="px-2 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition font-bold"
            title="Recenter Map"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Main Workspace split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 min-h-0">
        
        {/* Left side Graph matrix */}
        <div className="lg:col-span-2 relative min-h-[300px] bg-[#0b0c10]/40 flex items-center justify-center cursor-grab active:cursor-grabbing border-r border-white/5"
             onMouseDown={handleMouseDown}
             onMouseMove={handleMouseMove}
             onMouseUp={handleMouseUp}
             onMouseLeave={handleMouseUp}
             ref={svgRef}>
          
          {/* Ambient central background star glow */}
          <div className="absolute w-[300px] h-[300px] rounded-full bg-orange-500/[0.02] blur-[100px] pointer-events-none select-none" />

          {nodes.length > 0 ? (
            <svg 
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${width} ${height}`} 
              className="absolute inset-0 select-none overflow-hidden"
            >
              {/* SVG Defs for glows and gradients */}
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <radialGradient id="central-gradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.005)" stopColor-opacity="0.1" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>

              {/* Central base orbital grid */}
              <circle cx={center.x} cy={center.y} r={100} fill="url(#central-gradient)" stroke="rgba(255,255,255,0.02)" strokeWidth={1} strokeDasharray="3 6" />
              <circle cx={center.x} cy={center.y} r={140} fill="none" stroke="rgba(255,255,255,0.01)" strokeWidth={1} />
              
              {/* Wrapped Matrix (Zoom & Pan applied here) */}
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} className="transition-transform duration-75 ease-out">
                
                {/* 1. DRAW LINKS */}
                {links.map((link) => {
                  const isHovered = hoveredNode && (link.source.id === hoveredNode.id || link.target.id === hoveredNode.id);
                  const isSelected = activeNode && (link.source.id === activeNode.id || link.target.id === activeNode.id);
                  
                  return (
                    <line
                      key={link.key}
                      x1={link.source.x}
                      y1={link.source.y}
                      x2={link.target.x}
                      y2={link.target.y}
                      stroke={isHovered ? 'rgba(99, 102, 241, 0.4)' : isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.02)'}
                      strokeWidth={isHovered ? 1.5 : 0.75}
                      strokeDasharray={isHovered ? '4 3' : 'none'}
                      className="transition-all duration-300"
                    />
                  );
                })}

                {/* 2. DRAW NODES */}
                {nodes.map((node) => {
                  const isSelected = activeNode?.id === node.id;
                  const isHovered = hoveredNode?.id === node.id;
                  
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="interactive-node cursor-pointer group"
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => setSelectedNode(node)}
                    >
                      {/* Ambient outer pulsing halo ring */}
                      <circle
                        r={node.size + 10}
                        fill="transparent"
                        stroke={isSelected ? 'rgba(99, 102, 241, 0.3)' : isHovered ? 'rgba(255,255,255,0.06)' : 'transparent'}
                        strokeWidth={1}
                        className="transition-all duration-300"
                      />

                      {/* Primary Node core fill */}
                      <circle
                        r={node.size}
                        fill={isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)'}
                        stroke={isSelected ? '#6366f1' : isHovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}
                        strokeWidth={isSelected ? 1.5 : 1}
                        filter={isSelected ? 'url(#glow)' : 'none'}
                        className="transition-all duration-300"
                      />

                      {/* Little micro core dot */}
                      <circle
                        r={3}
                        fill={isSelected ? '#818cf8' : 'rgba(255,255,255,0.15)'}
                        className="transition-all duration-300"
                      />

                      {/* Text Tag Label */}
                      <text
                        y={node.size + 14}
                        textAnchor="middle"
                        fill={isSelected ? '#818cf8' : isHovered ? '#cbd5e1' : '#64748b'}
                        className="text-[9px] font-bold tracking-wide select-none pointer-events-none transition-all duration-300 uppercase"
                      >
                        {node.displayName}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div className="text-center py-12 text-slate-500 text-xs space-y-2 select-none">
              <AppIcon name="brain" size={24} className="text-slate-400 animate-pulse mx-auto" />
              <span>Not enough document segments processed yet to construct universe mappings.</span>
            </div>
          )}
        </div>

        {/* Right side Detail metadata panel */}
        <div className="p-6 bg-[#0b0c10]/40 overflow-y-auto flex flex-col justify-between select-none">
          {activeNode ? (
            <div className="space-y-6">
              {/* Concept Meta Header */}
              <div className="border-b border-white/5 pb-4 space-y-1.5 animate-in fade-in duration-200">
                <span className="text-[9px] font-extrabold text-orange-400 bg-orange-950/20 border border-orange-500/25 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Concept cluster node
                </span>
                <h3 className="text-sm font-extrabold text-slate-200 leading-tight uppercase tracking-tight">
                  {activeNode.displayName}
                </h3>
                <span className="text-[10px] text-slate-450 block">
                  Mapping {activeNode.concepts.length} semantic synonyms across sources
                </span>
              </div>

              {/* Synonyms keywords bubbles */}
              <div className="space-y-2.5 animate-in fade-in duration-300">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Semantic keywords network
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activeNode.concepts.map((concept, cIdx) => (
                    <span 
                      key={cIdx} 
                      className="bg-white/[0.02] border border-white/5 px-2.5 py-1 rounded-xl text-[9px] font-semibold text-slate-300 uppercase hover:bg-white/[0.04] transition"
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              </div>

              {/* Related Document overlap connections */}
              <div className="space-y-3">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Linked Grounding Sources
                </span>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                  {activeNode.sourceIds.length > 0 ? (
                    activeNode.sourceIds.map((srcId, idx) => {
                      // Attempt to matching title from relationships or relationships references
                      const matchingRel = relationships.find(r => r.sourceA.id === srcId || r.sourceB.id === srcId);
                      const title = matchingRel 
                        ? (matchingRel.sourceA.id === srcId ? matchingRel.sourceA.title : matchingRel.sourceB.title)
                        : `Indexed Source #${idx + 1}`;
                      
                      return (
                        <div key={srcId} className="bg-white/[0.01] border border-white/5 rounded-xl p-3 flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-2 min-w-0 pr-3">
                            <AppIcon name="file" size={10} className="text-slate-400 shrink-0" />
                            <span className="text-slate-300 font-bold truncate block">{title}</span>
                          </div>
                          <span className="text-[8px] text-orange-400 bg-orange-950/20 border border-orange-500/25 px-2 py-0.5 rounded-md uppercase font-extrabold shrink-0">
                            Active
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-[10px] text-slate-500 py-2">
                      Cascaded overlap mapped directly from general grounding matrix.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center py-12 text-slate-500 text-xs">
              Select any node in the semantic universe to see full topic associations.
            </div>
          )}
          
          <div className="border-t border-white/5 pt-3 text-[9px] text-slate-500 font-semibold leading-relaxed">
            Pro-Tip: Use mouse wheel to zoom. Click and drag the blank space to pan the canvas around coordinates.
          </div>
        </div>
      </div>
    </div>
  );
}

