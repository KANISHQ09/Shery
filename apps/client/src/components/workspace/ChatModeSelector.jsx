import { useState, useRef, useEffect } from 'react';
import AppIcon from '../AppIcon';

const MODES = [
  {
    id: 'explain',
    label: 'Pedagogical Teaching',
    desc: 'Structured step-by-step explanations with progressive depth.',
    icon: 'book',
    color: 'orange',
    badge: 'Popular',
  },
  {
    id: 'simplify',
    label: 'Beginner Explanation',
    desc: 'Clear analogies and plain language — no jargon.',
    icon: 'lightbulb',
    color: 'amber',
  },
  {
    id: 'deep_dive',
    label: 'Technical Deep Dive',
    desc: 'Architecture-level depth with code, trade-offs, and mechanics.',
    icon: 'code',
    color: 'violet',
  },
  {
    id: 'research',
    label: 'Research Mode',
    desc: 'Cross-source synthesis with comparative analysis.',
    icon: 'file',
    color: 'sky',
  },
  {
    id: 'quick_summary',
    label: 'Executive Summary',
    desc: '3-5 bullet takeaways in under 150 words.',
    icon: 'settings',
    color: 'slate',
  },
  {
    id: 'interview_prep',
    label: 'Interview Prep',
    desc: 'FAANG-style Q&A with model answers and coaching.',
    icon: 'mic',
    color: 'emerald',
  },
  {
    id: 'architecture',
    label: 'Architecture Analysis',
    desc: 'System components, data flow, and design decisions.',
    icon: 'target',
    color: 'rose',
  },
  {
    id: 'code_walkthrough',
    label: 'Code Walkthrough',
    desc: 'Annotated code review with design rationale.',
    icon: 'alignLeft',
    color: 'orange',
  },
  {
    id: 'revision',
    label: 'Active Recall',
    desc: 'Memory-optimized recall lists, mnemonics, and self-tests.',
    icon: 'rocket',
    color: 'teal',
  },
  {
    id: 'expert',
    label: 'Expert Critique',
    desc: 'Peer-to-peer depth: trade-offs, performance, production.',
    icon: 'shield',
    color: 'orange',
  },
  {
    id: 'exam_prep',
    label: 'Exam Preparation',
    desc: 'Practice questions, graded answers, and exam strategies.',
    icon: 'graduation',
    color: 'amber',
  },
  {
    id: 'beginner',
    label: 'Gentle Primer',
    desc: 'Scaffolded introduction for complete newcomers.',
    icon: 'star',
    color: 'pink',
  },
];

const COLOR_MAP = {
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  slate: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  teal: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  pink: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

export default function ChatModeSelector({ activeMode, onSelectMode }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentMode = MODES.find(m => m.id === activeMode) || MODES[0];
  const activeColors = COLOR_MAP[currentMode.color] || COLOR_MAP.orange;

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-150 ${
          isOpen
            ? 'bg-white/[0.05] border-white/10 text-slate-200'
            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200 hover:bg-white/[0.04]'
        }`}
      >
        <div className={`w-4 h-4 rounded-md flex items-center justify-center border ${activeColors}`}>
          <AppIcon name={currentMode.icon} size={9} />
        </div>
        <span className="max-w-[130px] truncate">{currentMode.label}</span>
        <AppIcon
          name="chevronLeft"
          size={10}
          className={`text-slate-500 transform transition-transform duration-200 ${isOpen ? 'rotate-90' : '-rotate-90'}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[#0d0e14] border border-white/8 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Teaching Mode
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Each mode reshapes tone, depth &amp; structure
            </div>
          </div>

          {/* Mode list */}
          <div className="max-h-72 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
            {MODES.map((item) => {
              const colors = COLOR_MAP[item.color] || COLOR_MAP.orange;
              const isActive = activeMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectMode(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start gap-3 transition-all duration-100 ${
                    isActive
                      ? 'bg-white/[0.06] border border-white/8'
                      : 'border border-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  {/* Icon badge */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${colors}`}>
                    <AppIcon name={item.icon} size={12} />
                  </div>

                  {/* Label and description */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="text-[8px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full leading-none">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 leading-tight block mt-0.5">
                      {item.desc}
                    </span>
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

