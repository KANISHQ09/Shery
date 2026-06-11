import { useState } from 'react';
import AppIcon from '../AppIcon';

export default function PresentationOutlineEditor({ outline = [], onCompile, onCancel, theme: initialTheme = 'Professional' }) {
  const [slides, setSlides] = useState(outline);
  const [theme, setTheme] = useState(initialTheme);
  const [isCompiling, setIsCompiling] = useState(false);
  const [activeSlideId, setActiveSlideId] = useState(slides[0]?.slideNumber || 1);

  const themes = ['Professional', 'Modern', 'Dark Tech', 'Startup Pitch', 'Academic'];

  const handleUpdateSlideField = (slideNumber, field, value) => {
    setSlides((prev) =>
      prev.map((s) => (s.slideNumber === slideNumber ? { ...s, [field]: value } : s))
    );
  };

  const handleUpdateBullets = (slideNumber, textValue) => {
    const bullets = textValue
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    handleUpdateSlideField(slideNumber, 'bulletPoints', bullets);
  };

  const handleAddSlide = () => {
    const nextNum = slides.length > 0 ? Math.max(...slides.map((s) => s.slideNumber)) + 1 : 1;
    const newSlide = {
      slideNumber: nextNum,
      title: 'New Slide Title',
      description: 'Enter slide objective here',
      bulletPoints: ['First bullet point', 'Second bullet point'],
      speakerNotes: 'Speaker notes for the presenter...',
    };
    setSlides((prev) => [...prev, newSlide]);
    setActiveSlideId(nextNum);
  };

  const handleDeleteSlide = (slideNumber) => {
    const filtered = slides.filter((s) => s.slideNumber !== slideNumber);
    // Re-index slide numbers sequentially
    const reindexed = filtered.map((s, idx) => ({ ...s, slideNumber: idx + 1 }));
    setSlides(reindexed);
    if (activeSlideId === slideNumber) {
      setActiveSlideId(reindexed[0]?.slideNumber || 1);
    }
  };

  const handleMoveSlide = (idx, direction) => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === slides.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const reordered = [...slides];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    // Re-index slide numbers sequentially
    const reindexed = reordered.map((s, i) => ({ ...s, slideNumber: i + 1 }));
    setSlides(reindexed);
    setActiveSlideId(reindexed[targetIdx].slideNumber);
  };

  const handleCompile = async () => {
    setIsCompiling(true);
    try {
      await onCompile(slides, theme);
    } finally {
      setIsCompiling(false);
    }
  };

  const activeSlide = slides.find((s) => s.slideNumber === activeSlideId);

  return (
    <div className="w-full h-full bg-[#08090d] border border-white/5 rounded-2xl overflow-hidden flex flex-col select-none">
      {/* Editor Header */}
      <div className="px-6 py-4.5 border-b border-white/5 bg-black/25 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Presentation Outline Review</h3>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">Tweak topics, slide details, and reorder before final compilation</p>
        </div>

        {/* Theme Picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500">Theme:</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-[#0f1015] border border-white/5 text-[10.5px] font-semibold text-orange-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500/30"
            >
              {themes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[10.5px] font-bold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCompile}
            disabled={isCompiling || slides.length === 0}
            className="px-4 py-1.5 text-[10.5px] font-bold text-white bg-orange-650 hover:bg-orange-600 rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isCompiling ? 'Compiling...' : 'Compile PPTX'}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Side: Interactive Slide List */}
        <aside className="w-64 border-r border-white/5 overflow-y-auto p-4 space-y-3 bg-black/10 shrink-0 scrollbar-thin">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">Slides ({slides.length})</span>
            <button
              onClick={handleAddSlide}
              className="p-1 rounded bg-white/[0.02] border border-white/5 text-orange-400 hover:text-orange-300 transition"
              title="Add New Slide"
            >
              <AppIcon name="plus" size={10} />
            </button>
          </div>

          <div className="space-y-1.5">
            {slides.map((slide, idx) => {
              const isActive = slide.slideNumber === activeSlideId;
              return (
                <div
                  key={slide.slideNumber}
                  onClick={() => setActiveSlideId(slide.slideNumber)}
                  className={`group p-3 rounded-xl border text-left transition relative cursor-pointer ${
                    isActive
                      ? 'border-orange-500/20 bg-orange-500/[0.015] text-slate-200'
                      : 'border-white/5 bg-[#0d0e12]/30 text-slate-450 hover:border-white/10 hover:text-slate-350'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-500 group-hover:text-orange-400 transition">
                      #{slide.slideNumber}
                    </span>
                    
                    {/* Arrange tools */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveSlide(idx, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-0.5 hover:bg-white/5 rounded text-slate-450 hover:text-white disabled:opacity-30"
                      >
                        <AppIcon name="arrowUp" size={8} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveSlide(idx, 'down');
                        }}
                        disabled={idx === slides.length - 1}
                        className="p-0.5 hover:bg-white/5 rounded text-slate-450 hover:text-white disabled:opacity-30"
                      >
                        <AppIcon name="arrowDown" size={8} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSlide(slide.slideNumber);
                        }}
                        className="p-0.5 hover:bg-rose-950/20 rounded text-slate-450 hover:text-rose-400"
                        title="Delete Slide"
                      >
                        <AppIcon name="trash" size={8} />
                      </button>
                    </div>
                  </div>

                  <span className="text-[10.5px] font-bold block truncate mt-1 leading-tight select-none">
                    {slide.title || 'Untitled Slide'}
                  </span>
                  <span className="text-[8px] text-slate-500 block truncate mt-0.5 leading-normal select-none">
                    {slide.description || 'No description'}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Side: Active Slide Content Editor */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#0a0a0f]/35 scrollbar-thin">
          {activeSlide ? (
            <div className="space-y-4">
              {/* Slide metadata info */}
              <div className="flex items-center gap-1.5 pb-3 border-b border-white/5">
                <span className="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase border bg-orange-500/10 border-orange-500/20 text-orange-400 font-mono">
                  Slide {activeSlide.slideNumber}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Configure slide layout properties below</span>
              </div>

              {/* Title Input */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400">Slide Title</label>
                <input
                  type="text"
                  value={activeSlide.title || ''}
                  onChange={(e) => handleUpdateSlideField(activeSlide.slideNumber, 'title', e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition font-bold"
                  placeholder="Slide Title"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400">Slide Objective / Description</label>
                <input
                  type="text"
                  value={activeSlide.description || ''}
                  onChange={(e) => handleUpdateSlideField(activeSlide.slideNumber, 'description', e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition font-medium"
                  placeholder="Objective (meta information for review)"
                />
              </div>

              {/* Bullet Points Area */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400">Slide Bullets (one per line)</label>
                <textarea
                  rows={6}
                  value={activeSlide.bulletPoints?.join('\n') || ''}
                  onChange={(e) => handleUpdateBullets(activeSlide.slideNumber, e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition resize-none font-mono leading-relaxed"
                  placeholder="Line 1 bullet point&#10;Line 2 bullet point..."
                />
              </div>

              {/* Speaker Notes */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400">Speaker Presenter Notes</label>
                <textarea
                  rows={4}
                  value={activeSlide.speakerNotes || ''}
                  onChange={(e) => handleUpdateSlideField(activeSlide.slideNumber, 'speakerNotes', e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.03] transition resize-none font-medium leading-relaxed"
                  placeholder="Add presenter instructions here..."
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center flex-col text-slate-500 p-8 select-none">
              <AppIcon name="file" size={24} className="mb-2" />
              <span className="text-xs font-medium">Add a slide in the sidebar to start customizing.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
