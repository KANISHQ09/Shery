import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIVideoChat, VideoStudio } from '../components/HeroDemo';
import AppIcon from '../components/AppIcon';

const navItems = [
  ['home', 'Home'],
  ['features', 'Features'],
  ['studio', 'Studio'],
  ['ai-chat', 'AI Chat'],
  ['usp', 'Why Us'],
  ['contact', 'Contact'],
];

const stats = [
  {
    icon: 'rocket',
    title: '10x Faster Revision',
    desc: 'Jump to the core concept without scrubbing through hours of video.',
  },
  {
    icon: 'brain',
    title: 'AI-Powered Context',
    desc: 'The assistant understands transcripts, slides, timestamps, and learning intent.',
  },
  {
    icon: 'bot',
    title: '24/7 Learning Assistant',
    desc: 'Ask course-specific questions anytime and get answers grounded in your lecture.',
  },
];

const problems = [
  ['alert', 'Passive Watching', 'Long videos create fatigue and make retention harder than it needs to be.'],
  ['search', 'Concept Hunt', 'Students lose study time finding the exact lecture moment they need.'],
  ['bot', 'Generic AI', 'Standard chatbots do not know what happened at minute 14:02 of your class.'],
  ['square', 'Static Content', 'Linear videos cannot adapt to the questions students ask while studying.'],
];

const features = [
  ['book', 'Smart Chapters', 'AI detects topic shifts and generates clear chapters with timestamps.', 'md:col-span-3 lg:col-span-3'],
  ['play', 'Jump-to-Moment', 'Ask a question and move to the exact frame where the concept appears.', 'md:col-span-3 lg:col-span-3'],
  ['brain', 'Session Memory', 'SheryAI keeps useful context across questions inside your study flow.', 'md:col-span-2'],
  ['message', 'Contextual Q&A', 'Ask about a slide, code snippet, phrase, or visual idea from the lecture.', 'md:col-span-2'],
  ['sparkles', 'Smart Summaries', 'Create concise study notes from any processed lecture in seconds.', 'md:col-span-2'],
];

const steps = [
  ['1', 'Upload', 'Upload a lecture video or paste a YouTube link.'],
  ['2', 'Extract', 'SheryAI extracts transcript, OCR, and important visual moments.'],
  ['3', 'Analyze', 'The AI builds a searchable knowledge layer for the lecture.'],
  ['4', 'Interact', 'Ask questions, jump to moments, summarize, and revise faster.'],
];

function useScrolledPast(offset = 48) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset]);

  return isScrolled;
}

function useLandingLessonFlow() {
  const demoRef = useRef(null);
  const chatRef = useRef(null);
  const [activeLesson, setActiveLesson] = useState(null);

  const scrollToStudio = useCallback(() => {
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleLessonReady = useCallback((lesson) => {
    setActiveLesson(lesson);
    window.setTimeout(() => {
      chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, []);

  return {
    activeLesson,
    chatRef,
    demoRef,
    handleLessonReady,
    resetLesson: () => setActiveLesson(null),
    scrollToStudio,
  };
}

function Brand() {
  return (
    <a href="#home" className="inline-flex items-baseline text-xl font-black tracking-tight text-white">
      SHERY <span className="ml-1 text-accent">AI</span>
    </a>
  );
}

function Navbar({ onGetStarted }) {
  const isScrolled = useScrolledPast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileOpen]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b transition ${isScrolled || mobileOpen ? 'border-white/10 bg-black/85 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl' : 'border-transparent bg-black/35 backdrop-blur-md'}`}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Brand />

        <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-text md:flex">
          {navItems.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="transition hover:text-white">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onGetStarted} className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-muted-text transition hover:border-white/20 hover:text-white md:inline-flex">
            Sign In
          </button>
          <button type="button" onClick={onGetStarted} className="hidden rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow-[0_12px_30px_rgba(232,87,42,0.25)] transition hover:bg-accent-hover sm:inline-flex">
            Get Started
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white transition hover:border-white/20 md:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <AppIcon name={mobileOpen ? 'x' : 'menu'} size={20} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-x-0 top-[72px] z-50 border-t border-white/10 bg-[#070707] px-5 pb-6 pt-3 shadow-[0_30px_80px_rgba(0,0,0,0.75)] md:hidden">
          <nav className="flex flex-col">
            {navItems.map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={close} className="border-b border-white/5 py-4 text-sm font-semibold text-muted-text">
                {label}
              </a>
            ))}
          </nav>
          <button type="button" onClick={() => { close(); onGetStarted(); }} className="mt-5 w-full rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white uppercase tracking-wider">
            Get Started
          </button>
        </div>
      )}
    </header>
  );
}

function SectionHeader({ eyebrow, icon, title, text, compact = false }) {
  return (
    <header className={`mx-auto text-center ${compact ? 'mb-10 max-w-3xl' : 'mb-14 max-w-4xl'}`}>
      {eyebrow && (
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-accent">
          <AppIcon name={icon} size={15} /> {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">{title}</h2>
      {text && <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-text sm:text-base sm:leading-7">{text}</p>}
    </header>
  );
}

function Hero({ onGetStarted, onTryDemo }) {
  const prompts = useMemo(() => ['What is gradient descent?', 'Explain backpropagation', 'Jump to 14:22'], []);

  return (
    <section id="home" className="relative overflow-hidden border-b border-white/10 bg-[#050505] px-5 pb-20 pt-32 sm:px-6 lg:px-8 lg:pb-24 lg:pt-36">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(232,87,42,0.22),transparent_58%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-5xl font-black leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Learn <span className="bg-gradient-to-r from-accent via-orange-400 to-amber-300 bg-clip-text text-transparent">Faster</span>.
            <br />
            Understand <span className="bg-gradient-to-r from-accent via-orange-400 to-amber-300 bg-clip-text text-transparent">Better</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-text sm:text-lg sm:leading-8">
            AI-powered learning companion that transforms long video lectures into interactive, searchable, and personalized learning experiences.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={onGetStarted} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-sm font-bold text-white shadow-[0_18px_45px_rgba(232,87,42,0.28)] transition hover:bg-accent-hover">
              Start Learning <AppIcon name="arrowRight" size={17} />
            </button>
            <button type="button" onClick={onTryDemo} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/[0.06]">
              Try Demo
            </button>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl rounded-[28px] border border-white/10 bg-white/[0.035] p-4 shadow-[0_42px_130px_rgba(0,0,0,0.72)] backdrop-blur sm:p-6">
          <div className="mb-5 flex gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(232,87,42,0.12),transparent_42%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.14),transparent_34%)]" />
              <button type="button" className="relative flex h-16 w-16 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-accent shadow-[0_0_42px_rgba(232,87,42,0.26)]" aria-label="Play demo preview">
                <AppIcon name="play" size={30} />
              </button>
            </div>
            <div className="flex flex-col justify-center gap-3">
              {prompts.map((item, index) => (
                <div key={item} className={`rounded-xl border px-4 py-3 text-sm ${index === 2 ? 'border-accent-border bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.04] text-muted-text'}`}>
                  {item}
                </div>
              ))}
              <div className="mt-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs font-semibold text-emerald-300">
                Context found across transcript, chapters, and visual moments.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section className="border-b border-white/10 bg-[#060606] px-5 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
        {stats.map((item) => (
          <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
            <AppIcon name={item.icon} size={30} className="mb-5 text-accent" />
            <h3 className="text-lg font-extrabold text-white">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-text">{item.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Problems() {
  return (
    <section className="border-b border-white/10 bg-[#050505] px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          title="Why Traditional LMS Platforms Fail"
          text="Learning platforms have not evolved with the way students actually study after class."
          compact
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {problems.map(([icon, title, desc]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-6">
              <AppIcon name={icon} size={26} className="mb-5 text-red-400" />
              <h3 className="text-base font-extrabold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-text">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Solution() {
  return (
    <section className="border-b border-white/10 bg-[#080808] px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.86fr]">
        <div>
          <span className="mb-5 inline-flex rounded-full border border-accent-border bg-accent/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-accent">Our Solution</span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Meet Shery AI</h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-text">
            A contextual learning assistant that integrates directly into the lecture experience and knows what is being discussed on screen at each moment.
          </p>
          <div className="mt-8 grid gap-4">
            {[
              ['book', 'Session Memory', 'AI remembers previous questions and the exact module context.'],
              ['rocket', 'Streaming Responses', 'Get real-time learning support while the idea is still fresh.'],
            ].map(([icon, title, desc]) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <AppIcon name={icon} size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-text">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_38px_110px_rgba(0,0,0,0.6)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <AppIcon name="bot" size={25} />
            </div>
            <div>
              <h3 className="font-extrabold text-white">Contextual Assistant</h3>
              <span className="mt-1 inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">Beta</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="ml-auto max-w-[86%] rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-sm font-semibold leading-6 text-white">
              Explain the Docker Compose YAML structure simply.
            </div>
            <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-white/10 bg-[#101010] px-4 py-3 text-sm leading-6 text-slate-300">
              Docker Compose defines services, networks, and volumes for multi-container apps.
              <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent">
                <AppIcon name="play" size={13} /> Jump to 05:22
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesGrid() {
  return (
    <section id="features" className="border-b border-white/10 bg-[#050505] px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader title="Core Intelligence Features" compact />
        <div className="grid auto-rows-fr grid-cols-1 gap-5 md:grid-cols-6">
          {features.map(([icon, title, desc, span]) => (
            <article key={title} className={`rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-white/20 ${span}`}>
              <AppIcon name={icon} size={28} className="mb-5 text-accent" />
              <h3 className="text-lg font-extrabold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-text">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="border-b border-white/10 bg-[#080808] px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader title="Master Any Course in 4 Steps" compact />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([num, title, desc]) => (
            <article key={num} className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-black text-white shadow-[0_16px_45px_rgba(232,87,42,0.22)]">{num}</div>
              <h3 className="mt-5 text-lg font-extrabold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-text">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoStudioSection({ studioRef, onLessonReady }) {
  return (
    <section id="studio" ref={studioRef} className="border-b border-white/10 bg-[#070707] px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        icon="video"
        eyebrow="Video Studio"
        title="Add Any Video. AI Does the Rest."
        text="Paste a YouTube URL or upload your lecture. SheryAI transcribes, indexes, and makes it fully conversational in minutes."
      />
      <VideoStudio onLessonReady={onLessonReady} />
    </section>
  );
}

function AIChatSection({ chatRef, activeLesson, onBack, onStudioClick }) {
  return (
    <section id="ai-chat" ref={chatRef} className="border-b border-white/10 bg-[#050505] px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        icon="bot"
        eyebrow="AI Video Chat"
        title="ChatGPT, but for Your Videos"
        text="Ask anything, get timestamped answers, and understand every concept your lecturer explains instantly."
      />

      {activeLesson ? (
        <div className="mx-auto h-[680px] max-w-[900px] overflow-hidden rounded-[28px] border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.8)]">
          <AIVideoChat lesson={activeLesson} onBack={onBack} />
        </div>
      ) : (
        <div className="mx-auto max-w-[720px] rounded-[28px] border border-white/10 bg-[#0a0a0a] p-8 text-center shadow-[0_25px_80px_rgba(0,0,0,0.42)] sm:p-12">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-accent-border bg-accent/10 text-accent">
            <AppIcon name="video" size={36} />
          </div>
          <h3 className="text-2xl font-extrabold text-white">Add a Video First</h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-text">
            Use the Video Studio above to add a YouTube lecture or upload a video. Once it is processed, this chat becomes available.
          </p>
          <button type="button" onClick={onStudioClick} className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-7 py-3 text-sm font-bold text-white transition hover:bg-accent-hover">
            <AppIcon name="arrowUp" size={16} /> Go to Video Studio
          </button>
        </div>
      )}
    </section>
  );
}

function USP() {
  return (
    <section id="usp" className="border-b border-white/10 bg-[#050505] px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-white/[0.035] p-7 text-center shadow-[0_36px_110px_rgba(0,0,0,0.5)] sm:p-12">
        <h2 className="text-3xl font-black text-white sm:text-4xl">More Than Just Video AI</h2>
        <p className="mx-auto mt-5 max-w-3xl text-xl font-semibold leading-8 text-slate-200">
          We do not help users watch videos. We help them <span className="text-accent">understand</span> them.
        </p>
        <div className="mt-9 grid gap-4 text-left md:grid-cols-2">
          <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-red-300">
              <AppIcon name="xCircle" size={17} /> Standard Platforms
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-text">Scrubbing for info, no context, forgetful chat interfaces, passive watching.</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-emerald-300">
              <AppIcon name="checkCircle" size={17} /> Shery AI
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-text">Contextual grounding, session-aware memory, visual link triggers, deep retention.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA({ onGetStarted }) {
  return (
    <section className="bg-[#080808] px-5 py-20 text-center sm:px-6 lg:px-8">
      <h2 className="mx-auto max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">Ready to Transform the Way You Learn?</h2>
      <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted-text sm:text-base">Join students saving hours every week with contextual video learning.</p>
      <button type="button" onClick={onGetStarted} className="mt-8 rounded-xl bg-accent px-8 py-3.5 text-sm font-bold text-white shadow-[0_18px_45px_rgba(232,87,42,0.25)] transition hover:bg-accent-hover">
        Start Learning Now
      </button>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="border-t border-white/10 bg-black px-5 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.3fr_1fr_auto]">
        <div>
          <Brand />
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-text">The AI command center for modern education. Learn smarter, revise faster.</p>
        </div>
        <div className="grid grid-cols-3 gap-5 text-sm">
          {[
            ['Legal', 'Privacy', 'Terms'],
            ['Support', 'Security', 'Help Center'],
            ['Dev', 'API Docs', 'Integrations'],
          ].map(([title, first, second]) => (
            <div key={title}>
              <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-white">{title}</h3>
              <a href="#home" className="mb-2 block text-muted-text transition hover:text-white">{first}</a>
              <a href="#home" className="block text-muted-text transition hover:text-white">{second}</a>
            </div>
          ))}
        </div>
        <div className="flex gap-3 md:justify-end">
          <a href="#home" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-muted-text transition hover:border-white/20 hover:text-white" aria-label="SheryAI links">
            <AppIcon name="link" size={18} />
          </a>
          <a href="#home" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-muted-text transition hover:border-white/20 hover:text-white" aria-label="Developer resources">
            <AppIcon name="code" size={18} />
          </a>
        </div>
      </div>
      <p className="mx-auto mt-9 max-w-7xl border-t border-white/10 pt-6 text-xs text-muted">© 2026 Shery AI. Built for the future of learning.</p>
    </footer>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const lessonFlow = useLandingLessonFlow();
  const goLogin = useCallback(() => navigate('/login'), [navigate]);

  return (
    <div className="min-h-screen scroll-smooth bg-[#050505] font-sans text-white">
      <Navbar onGetStarted={goLogin} />
      <main>
        <Hero onGetStarted={goLogin} onTryDemo={lessonFlow.scrollToStudio} />
        <Stats />
        <Problems />
        <Solution />
        <FeaturesGrid />
        <HowItWorks />
        <VideoStudioSection studioRef={lessonFlow.demoRef} onLessonReady={lessonFlow.handleLessonReady} />
        <AIChatSection
          chatRef={lessonFlow.chatRef}
          activeLesson={lessonFlow.activeLesson}
          onBack={lessonFlow.resetLesson}
          onStudioClick={lessonFlow.scrollToStudio}
        />
        <USP />
        <CTA onGetStarted={goLogin} />
      </main>
      <Footer />
    </div>
  );
}
