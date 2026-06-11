import { motion } from 'framer-motion';
import AppIcon from '../AppIcon';

export default function LearningProgressPanel({ learning }) {
  const mastery = learning?.mastery || [];

  // Group concepts by mastery score
  const learned = mastery.filter(m => m.masteryLevel >= 75);
  const currentlyLearning = mastery.filter(m => m.masteryLevel > 10 && m.masteryLevel < 75);
  const locked = mastery.filter(m => m.masteryLevel <= 10);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="bg-[#06070a]/40 border border-white/5 rounded-2xl p-5 hover:border-orange-500/10 transition-all duration-300 flex flex-col justify-between space-y-5">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
        <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest flex items-center gap-2 select-none">
          <AppIcon name="graduation" size={14} className="text-orange-400" />
          Learning Progress Journey
        </span>
        <span className="text-[9px] text-slate-500 font-mono font-semibold select-none">
          {learned.length} of {mastery.length} Mastered
        </span>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin"
      >
        {/* 1. YOU'VE LEARNED */}
        <div className="space-y-2">
          <h4 className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-wider select-none flex items-center gap-1.5">
            <span>✓</span> You've Learned
          </h4>
          {learned.length > 0 ? (
            <div className="grid grid-cols-1 gap-1.5">
              {learned.map((item, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/[0.02] border border-emerald-500/10"
                >
                  <span className="text-xs font-semibold text-emerald-350">{item.clusterName}</span>
                  <span className="text-[9px] font-bold text-emerald-450 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">
                    {item.masteryLevel}%
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-600 italic select-none pl-1">No concepts fully mastered yet. Keep learning!</p>
          )}
        </div>

        {/* 2. CURRENTLY LEARNING */}
        <div className="space-y-2">
          <h4 className="text-[9px] font-extrabold text-orange-400 uppercase tracking-wider select-none flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Currently Learning
          </h4>
          {currentlyLearning.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {currentlyLearning.map((item, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  className="p-3 rounded-xl bg-white/[0.01] border border-white/5 space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200">{item.clusterName}</span>
                    <span className="text-[10px] font-bold text-orange-400 font-mono">
                      {item.masteryLevel}%
                    </span>
                  </div>
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all duration-300"
                      style={{ width: `${item.masteryLevel}%` }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-600 italic select-none pl-1">No concepts actively in progress.</p>
          )}
        </div>

        {/* 3. WHAT TO LEARN NEXT (LOCKED) */}
        <div className="space-y-2">
          <h4 className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider select-none flex items-center gap-1.5">
            <span>🔒</span> What to Learn Next (Locked)
          </h4>
          {locked.length > 0 ? (
            <div className="grid grid-cols-1 gap-1.5">
              {locked.map((item, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.005] border border-white/3 opacity-50 group hover:opacity-80 transition duration-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AppIcon name="lock" size={10} className="text-slate-600 shrink-0" />
                    <span className="text-xs font-medium text-slate-400 truncate">{item.clusterName}</span>
                  </div>
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    Locked
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-600 italic select-none pl-1">No locked concepts.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
