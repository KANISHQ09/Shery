import { motion } from 'framer-motion';
import AppIcon from '../AppIcon';

export default function WorkspaceEmptyState({ onAddSource, activities = [], graphNodes = [], workspaceName = 'Workspace' }) {
  // Generate random coordinates for floating particles
  const particles = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    x: Math.random() * 400 - 200,
    y: Math.random() * 400 - 200,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 10 + 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="flex-1 flex flex-col relative bg-[#030305] select-none overflow-hidden min-h-0">
      {/* Background Animated Particles */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-orange-500/20"
            style={{
              width: p.size,
              height: p.size,
              left: '50%',
              top: '50%',
            }}
            animate={{
              x: [0, p.x, 0],
              y: [0, p.y, 0],
              opacity: [0.1, 0.6, 0.1],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Scrollable Content Wrapper */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col w-full relative z-10 px-4 py-8 sm:p-8">
        <div className="my-auto w-full max-w-2xl mx-auto text-center flex flex-col items-center py-4">
        {/* Animated Siri-like AI Orb Container */}
        <div className="mb-8">
          <div className="ai-orb-container">
            <div className="ai-orb-glow" />
            <div className="ai-orb-body" />
            <div className="absolute z-10 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              <AppIcon name="brain" size={24} strokeWidth={2.5} className="animate-pulse" />
            </div>
          </div>
        </div>

        {/* Title & Description */}
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-2xl font-bold text-slate-100 tracking-tight mb-3"
        >
          Initialize Cognitive Workspace
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed mb-8"
        >
          Ground SheryAI's cognitive reasoning engine strictly in your personal files.
          Upload study guides, past lectures, video transcripts, or PDFs to begin.
        </motion.p>

        {/* Cognitive Graph Preview Widget */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="w-full max-w-md mx-auto mb-10 text-left p-4 rounded-xl border border-white/5 bg-white/[0.02] shadow-inner"
        >
          <div className="flex items-center gap-2 mb-3">
            <AppIcon name="brain" size={14} className="text-orange-400" />
            <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Knowledge Graph Preview</h3>
          </div>
          
          {(!graphNodes || graphNodes.length === 0) ? (
            <div className="text-xs text-slate-500 font-mono pl-3 border-l border-white/10 ml-2 py-1">
              <p className="mb-3 text-slate-400 font-sans text-[10px]">No concepts indexed yet.<br/>Upload content to generate a cognitive knowledge graph.</p>
              <div className="text-slate-300 font-semibold mb-1">{workspaceName}</div>
              <div className="text-slate-500/80 leading-relaxed">├── Concepts</div>
              <div className="text-slate-500/80 leading-relaxed">├── Topics</div>
              <div className="text-slate-500/80 leading-relaxed">└── Relationships</div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 font-mono pl-3 border-l border-white/10 ml-2 py-1">
              <div className="text-slate-300 font-semibold mb-1">{workspaceName}</div>
              <div className="text-slate-400 leading-relaxed">├── Neural Networks</div>
              <div className="text-slate-500 leading-relaxed">│   ├── CNN</div>
              <div className="text-slate-500 leading-relaxed">│   └── RNN</div>
              <div className="text-slate-400 leading-relaxed">├── Supervised Learning</div>
              <div className="text-slate-400 leading-relaxed">└── Reinforcement Learning</div>
            </div>
          )}
        </motion.div>

        {/* Asymmetrical Suggested Actions Grid */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-2 gap-4 w-full max-w-xl mb-10 text-left"
        >
          {[
            {
              title: 'Ground on YouTube',
              desc: 'Convert any online video lecture or tutorial into chat-ready study content.',
              icon: 'video',
              color: 'text-orange-400 border-orange-500/10 hover:border-orange-500/25 hover:bg-orange-500/5',
            },
            {
              title: 'Ground on Documents',
              desc: 'Process textbook chapters, research PDFs, summaries, or manuals.',
              icon: 'file',
              color: 'text-amber-400 border-amber-500/10 hover:border-amber-500/25 hover:bg-amber-500/5',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              onClick={onAddSource}
              className={`p-4 border rounded-2xl cursor-pointer transition-all duration-300 ${item.color}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <AppIcon name={item.icon} size={15} />
                <span className="text-xs font-bold text-slate-200">{item.title}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Primary CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          onClick={onAddSource}
          className="inline-flex items-center gap-2.5 px-6 py-3.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-lg hover:shadow-orange-500/10 hover:scale-[1.01] cursor-pointer transition-all duration-200"
        >
          <AppIcon name="upload" size={14} />
          <span>Upload grounding files</span>
        </motion.button>

        {/* Recent Activity Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="w-full max-w-xl text-left border-t border-white/5 pt-6 mt-10"
        >
          <div className="flex items-center gap-2 mb-4">
            <AppIcon name="clock" size={14} className="text-slate-500" />
            <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Recent Activity</h3>
          </div>
          
          {(!activities || activities.length === 0) ? (
            <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] flex items-center justify-center text-center">
              <span className="text-[11px] text-slate-500 leading-relaxed font-medium">
                No activity yet.<br/>Upload your first source to start building your knowledge workspace.
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((act, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20 text-orange-400">
                    <AppIcon name="check" size={10} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{act.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{act.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  </div>
  );
}

