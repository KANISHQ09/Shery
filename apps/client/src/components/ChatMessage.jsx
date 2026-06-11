import { parseTimestamps } from './TimestampChip';
import AppIcon from './AppIcon';

/* ════════════════════════════════════════════════════════════════
   INLINE FORMATTER  –  **bold**, `code`, *italic*
   ════════════════════════════════════════════════════════════════ */
function inlineFormat(text, keyPrefix) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-${match.index}`} className="font-bold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={`${keyPrefix}-${match.index}`} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-sky-300">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(
        <em key={`${keyPrefix}-${match.index}`} className="not-italic text-amber-300 font-medium">
          {token.slice(1, -1)}
        </em>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/* ════════════════════════════════════════════════════════════════
   MARKDOWN RENDERER  –  for notes/quiz content and fallback text
   ════════════════════════════════════════════════════════════════ */
function renderMarkdown(text, onSeek) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3) || 'code';
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      elements.push(
        <div key={`code-${index}`} className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="font-mono text-[11px] text-white/40">{lang}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Code</span>
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-xs leading-6 text-slate-200">
            <code>{code.join('\n')}</code>
          </pre>
        </div>
      );
    } else if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${index}`} className="mb-1.5 mt-4 text-[13px] font-bold text-white">
          {inlineFormat(trimmed.slice(4), `h3-${index}`)}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${index}`} className="mb-2 mt-5 border-b border-accent/20 pb-1.5 text-sm font-extrabold text-accent">
          {inlineFormat(trimmed.slice(3), `h2-${index}`)}
        </h2>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      elements.push(
        <ul key={`ul-${index}`} className="my-2 flex flex-col gap-1.5 pl-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex items-start gap-2 text-[13px] leading-6 text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{parseTimestamps(item, onSeek).map((part, partIndex) => (typeof part === 'string' ? inlineFormat(part, `uli-${index}-${itemIndex}-${partIndex}`) : part))}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\.\s/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ''));
        index += 1;
      }
      elements.push(
        <ol key={`ol-${index}`} className="my-2 flex flex-col gap-1.5 pl-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex items-start gap-2 text-[13px] leading-6 text-slate-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">{itemIndex + 1}</span>
              <span>{parseTimestamps(item, onSeek).map((part, partIndex) => (typeof part === 'string' ? inlineFormat(part, `oli-${index}-${itemIndex}-${partIndex}`) : part))}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (trimmed === '') {
      elements.push(<div key={`sp-${index}`} className="h-1.5" />);
    } else {
      elements.push(
        <p key={`p-${index}`} className="mb-1 text-[13px] leading-7 text-slate-300">
          {parseTimestamps(line, onSeek).map((part, partIndex) =>
            typeof part === 'string' ? inlineFormat(part, `p-${index}-${partIndex}`) : part
          )}
        </p>
      );
    }
    index += 1;
  }

  return elements;
}

/* ════════════════════════════════════════════════════════════════
   SHARED PRIMITIVES
   ════════════════════════════════════════════════════════════════ */

/** Section header with icon + all-caps label */
function SectionLabel({ icon, label, color = 'text-slate-400' }) {
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      {icon && <AppIcon name={icon} size={12} className="shrink-0" />}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
  );
}

/** Bullet list with optional coloured dot */
function BulletList({ items, dotColor = 'bg-accent', onSeek, keyPrefix = 'b' }) {
  const list = Array.isArray(items) ? items : (typeof items === 'string' && items.trim() ? [items] : []);
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-slate-300">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          <span className="flex-1">
            {onSeek
              ? parseTimestamps(item, onSeek).map((part, idx) =>
                  typeof part === 'string' ? inlineFormat(part, `${keyPrefix}-${i}-${idx}`) : part
                )
              : inlineFormat(item, `${keyPrefix}-${i}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered step list with connecting line */
function StepList({ steps, onSeek }) {
  const list = Array.isArray(steps) ? steps : (typeof steps === 'string' && steps.trim() ? [steps] : []);
  if (!list.length) return null;
  return (
    <ol className="flex flex-col gap-0">
      {list.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent border border-accent/30">
              {i + 1}
            </span>
            {i < list.length - 1 && (
              <div className="mt-1 mb-1 w-px flex-1 bg-accent/15" style={{ minHeight: '12px' }} />
            )}
          </div>
          <div className={`pb-3 pt-0.5 text-[13px] leading-relaxed text-slate-200 ${i < list.length - 1 ? 'mb-0' : ''}`}>
            {onSeek
              ? parseTimestamps(step, onSeek).map((part, idx) =>
                  typeof part === 'string' ? inlineFormat(part, `step-${i}-${idx}`) : part
                )
              : inlineFormat(step, `step-${i}`)}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Callout card (coloured box with icon + label) */
function CalloutCard({ icon, label, iconColor, borderColor, bgColor, children }) {
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className={`flex items-center gap-2 mb-2.5 ${iconColor}`}>
        {icon && <AppIcon name={icon} size={13} className="shrink-0" />}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-[13px] leading-relaxed text-slate-200">{children}</div>
    </div>
  );
}

/** Timestamp jump chips */
function TimestampChips({ timestamps, onSeek }) {
  if (!Array.isArray(timestamps) || !timestamps.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {timestamps.map((ts, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSeek?.(ts.seconds)}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent transition-all hover:bg-accent/20 hover:border-accent/50"
        >
          <AppIcon name="play" size={9} />
          {ts.display}
        </button>
      ))}
    </div>
  );
}

/** Inline text with timestamp parsing */
function RichText({ text, onSeek, keyPrefix = 'rt' }) {
  if (!text) return null;
  return (
    <>
      {parseTimestamps(text, onSeek).map((part, i) =>
        typeof part === 'string' ? inlineFormat(part, `${keyPrefix}-${i}`) : part
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   ELITE LEARNING — NEW SECTION CARDS
   ════════════════════════════════════════════════════════════════ */

/** Mental Model card — teal/cyan */
function MentalModelCard({ text, onSeek }) {
  if (!text) return null;
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4">
      <div className="flex items-center gap-2 mb-2.5 text-cyan-400">
        <AppIcon name="brain" size={13} className="shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Mental Model</span>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-200 italic">
        <RichText text={text} onSeek={onSeek} keyPrefix="mm" />
      </p>
    </div>
  );
}

/** Real World Example card — emerald */
function RealWorldCard({ text, onSeek }) {
  if (!text) return null;
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
      <div className="flex items-center gap-2 mb-2.5 text-emerald-400">
        <AppIcon name="rocket" size={13} className="shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Real-World Example</span>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-200">
        <RichText text={text} onSeek={onSeek} keyPrefix="rwe" />
      </p>
    </div>
  );
}

/** Exam / Interview Insight card — amber/gold */
function ExamInsightCard({ text, onSeek }) {
  if (!text) return null;
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
      <div className="flex items-center gap-2 mb-2.5 text-amber-400">
        <AppIcon name="trophy" size={13} className="shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Exam / Interview Insight</span>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-200">
        <RichText text={text} onSeek={onSeek} keyPrefix="ei" />
      </p>
    </div>
  );
}

/** Related Concepts pill strip */
function RelatedConceptsSection({ concepts }) {
  const list = Array.isArray(concepts) ? concepts : (typeof concepts === 'string' && concepts.trim() ? [concepts] : []);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel icon="link" label="Related Concepts" color="text-slate-500" />
      <div className="flex flex-wrap gap-1.5">
        {list.map((concept, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[11px] text-slate-400"
          >
            <span className="h-1 w-1 rounded-full bg-accent/60" />
            {concept}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Learn Next progressive topic list */
function LearnNextSection({ topics }) {
  const list = Array.isArray(topics) ? topics : (typeof topics === 'string' && topics.trim() ? [topics] : []);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel icon="arrowRight" label="Learn Next" color="text-violet-400" />
      <div className="flex flex-col gap-1.5">
        {list.map((topic, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-violet-500/15 bg-violet-500/[0.05] px-3 py-2"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">
              {i + 1}
            </span>
            <span className="text-[12px] text-slate-300">{topic}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STANDARD ANSWER CARD  –  type: "answer"
   Elite 10-section layout
   ════════════════════════════════════════════════════════════════ */
function AnswerCard({ data, onSeek }) {
  // Not-covered state
  if (data.notCovered) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-slate-600/30 bg-slate-700/20 px-4 py-3">
          <AppIcon name="alert" size={15} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-[13px] leading-6 text-slate-300">
            {data.directAnswer || data.deepExplanation || data.answer}
          </p>
        </div>
        <LearnNextSection topics={data.learnNext || data.followUpQuestions} />
      </div>
    );
  }

  // Resolve fields — support both new schema and legacy fields
  const directAnswer   = data.directAnswer   || data.deepExplanation || data.answer;
  const mentalModel    = data.mentalModel    || data.exampleAnalogy;
  const howItWorks     = data.howItWorks;
  const whyItMatters   = data.whyItMatters;
  const realWorldEx    = data.realWorldExample;
  const examInsight    = data.examInsight;
  const commonMistakes = data.commonMistakes;
  const relatedConcepts= data.relatedConcepts || data.coreConcepts;
  const keyTakeaway    = data.keyTakeaway || data.conclusion;
  const learnNext      = data.learnNext;
  const followUps      = data.followUpQuestions;

  return (
    <div className="flex flex-col gap-5">
      {/* 0. Topic Overview — chapter title */}
      {data.topicOverview && (
        <div className="border-b border-white/[0.07] pb-3">
          <p className="text-[15px] font-bold leading-snug text-white">{data.topicOverview}</p>
        </div>
      )}

      {/* 1. Direct Answer */}
      {directAnswer && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="arrowRight" label="Answer" color="text-slate-400" />
          <div className="text-[13px] leading-[1.85] text-slate-200">
            <RichText text={directAnswer} onSeek={onSeek} keyPrefix="da" />
          </div>
        </div>
      )}

      {/* 2. Mental Model */}
      <MentalModelCard text={mentalModel} onSeek={onSeek} />

      {/* 3. How It Works — numbered steps */}
      {howItWorks?.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <SectionLabel icon="arrowRight" label="How It Works" color="text-sky-400" />
          <StepList steps={howItWorks} onSeek={onSeek} />
        </div>
      )}

      {/* Legacy keyPoints */}
      {data.keyPoints?.length > 0 && !howItWorks?.length && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alignLeft" label="Key Points" color="text-slate-400" />
          <BulletList items={data.keyPoints} onSeek={onSeek} keyPrefix="kp" />
        </div>
      )}

      {/* 4. Why It Matters */}
      {whyItMatters && (
        <CalloutCard
          icon="target"
          label="Why It Matters"
          iconColor="text-sky-400"
          borderColor="border-sky-500/20"
          bgColor="bg-sky-500/[0.06]"
        >
          <RichText text={whyItMatters} onSeek={onSeek} keyPrefix="wim" />
        </CalloutCard>
      )}

      {/* 5. Real-World Example */}
      <RealWorldCard text={realWorldEx} onSeek={onSeek} />

      {/* 6. Exam / Interview Insight */}
      <ExamInsightCard text={examInsight} onSeek={onSeek} />

      {/* 7. Common Mistakes */}
      {commonMistakes?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alert" label="Common Mistakes to Avoid" color="text-rose-400" />
          <BulletList items={commonMistakes} dotColor="bg-rose-400" keyPrefix="cm" />
        </div>
      )}

      {/* 8. Related Concepts */}
      <RelatedConceptsSection concepts={relatedConcepts} />

      {/* 9. Key Takeaway */}
      {keyTakeaway && (
        <CalloutCard
          icon="lightbulb"
          label="Key Takeaway"
          iconColor="text-amber-400"
          borderColor="border-amber-500/25"
          bgColor="bg-amber-500/[0.07]"
        >
          <p className="font-semibold text-amber-200">{keyTakeaway}</p>
        </CalloutCard>
      )}

      {/* Timestamps */}
      {data.timestamps?.length > 0 && <TimestampChips timestamps={data.timestamps} onSeek={onSeek} />}

      {/* 10. Learn Next */}
      <LearnNextSection topics={learnNext} />

      {/* Legacy follow-ups rendered as learn next if no learnNext field */}
      {!learnNext?.length && Array.isArray(followUps) && followUps.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="arrowRight" label="Explore Further" color="text-slate-500" />
          <div className="flex flex-col gap-1">
            {followUps.map((q, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-400"
              >
                <AppIcon name="arrowRight" size={10} className="shrink-0 text-accent/60" />
                {q}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   HOW CARD  –  type: "howto"
   ════════════════════════════════════════════════════════════════ */
function HowToCard({ data, onSeek }) {
  return (
    <div className="flex flex-col gap-5">
      {data.topicOverview && (
        <div className="border-b border-white/[0.07] pb-3">
          <p className="text-[15px] font-bold leading-snug text-white">{data.topicOverview}</p>
        </div>
      )}

      {data.overview && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="book" label="Overview" color="text-slate-400" />
          <p className="text-[13px] leading-relaxed text-slate-200">
            <RichText text={data.overview} onSeek={onSeek} keyPrefix="htov" />
          </p>
        </div>
      )}

      {data.steps?.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <SectionLabel icon="arrowRight" label="Step-by-Step" color="text-sky-400" />
          <StepList steps={data.steps} onSeek={onSeek} />
        </div>
      )}

      {data.commonPitfalls?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alert" label="Common Pitfalls" color="text-rose-400" />
          <BulletList items={data.commonPitfalls} dotColor="bg-rose-400" keyPrefix="cp" />
        </div>
      )}

      {data.bestPractices?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="checkCircle" label="Best Practices" color="text-emerald-400" />
          <BulletList items={data.bestPractices} dotColor="bg-emerald-400" keyPrefix="bp" />
        </div>
      )}

      <RealWorldCard text={data.realWorldExample} onSeek={onSeek} />

      {data.keyTakeaway && (
        <CalloutCard
          icon="lightbulb"
          label="Key Takeaway"
          iconColor="text-amber-400"
          borderColor="border-amber-500/25"
          bgColor="bg-amber-500/[0.07]"
        >
          <p className="font-semibold text-amber-200">{data.keyTakeaway}</p>
        </CalloutCard>
      )}

      {data.timestamps?.length > 0 && <TimestampChips timestamps={data.timestamps} onSeek={onSeek} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   WHY CARD  –  type: "why"
   ════════════════════════════════════════════════════════════════ */
function WhyCard({ data, onSeek }) {
  return (
    <div className="flex flex-col gap-5">
      {data.topicOverview && (
        <div className="border-b border-white/[0.07] pb-3">
          <p className="text-[15px] font-bold leading-snug text-white">{data.topicOverview}</p>
        </div>
      )}

      {data.coreReason && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="arrowRight" label="Core Reason" color="text-sky-400" />
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4">
            <p className="text-[13px] font-semibold leading-relaxed text-sky-100">
              <RichText text={data.coreReason} onSeek={onSeek} keyPrefix="cr" />
            </p>
          </div>
        </div>
      )}

      {data.mechanism && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="code" label="Underlying Mechanism" color="text-slate-400" />
          <p className="text-[13px] leading-relaxed text-slate-200">
            <RichText text={data.mechanism} onSeek={onSeek} keyPrefix="mech" />
          </p>
        </div>
      )}

      {data.practicalImpact && (
        <CalloutCard
          icon="target"
          label="Practical Impact"
          iconColor="text-emerald-400"
          borderColor="border-emerald-500/20"
          bgColor="bg-emerald-500/[0.06]"
        >
          <RichText text={data.practicalImpact} onSeek={onSeek} keyPrefix="pi" />
        </CalloutCard>
      )}

      {data.counterpoint && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alert" label="What If You Ignored This?" color="text-rose-400" />
          <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.05] px-4 py-3">
            <p className="text-[13px] leading-relaxed text-slate-300">
              <RichText text={data.counterpoint} onSeek={onSeek} keyPrefix="cp" />
            </p>
          </div>
        </div>
      )}

      <RealWorldCard text={data.example} onSeek={onSeek} />

      {data.keyInsight && (
        <CalloutCard
          icon="lightbulb"
          label="Key Insight"
          iconColor="text-amber-400"
          borderColor="border-amber-500/25"
          bgColor="bg-amber-500/[0.07]"
        >
          <p className="font-semibold text-amber-200">{data.keyInsight}</p>
        </CalloutCard>
      )}

      {data.timestamps?.length > 0 && <TimestampChips timestamps={data.timestamps} onSeek={onSeek} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COMPARISON CARD  –  type: "comparison"
   ════════════════════════════════════════════════════════════════ */
function ComparisonCard({ data, onSeek }) {
  return (
    <div className="flex flex-col gap-5">
      {data.topicOverview && (
        <div className="border-b border-white/[0.07] pb-3">
          <p className="text-[15px] font-bold leading-snug text-white">{data.topicOverview}</p>
        </div>
      )}

      {data.overview && (
        <p className="text-[13px] leading-relaxed text-slate-300">
          <RichText text={data.overview} onSeek={onSeek} keyPrefix="cov" />
        </p>
      )}

      {/* Two concept cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[data.conceptA, data.conceptB].map((concept, idx) => {
          if (!concept) return null;
          const isA = idx === 0;
          const borderClass = isA ? 'border-blue-500/25' : 'border-purple-500/25';
          const bgClass     = isA ? 'bg-blue-500/[0.07]' : 'bg-purple-500/[0.07]';
          const labelColor  = isA ? 'text-blue-400' : 'text-purple-400';
          return (
            <div key={idx} className={`rounded-xl border ${borderClass} ${bgClass} p-4 flex flex-col gap-3`}>
              <h4 className={`text-sm font-bold ${labelColor}`}>{concept.name}</h4>
              <p className="text-[13px] leading-relaxed text-slate-300">{concept.definition}</p>
              {concept.strengths?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">Strengths</p>
                  <BulletList items={concept.strengths} dotColor="bg-emerald-400" keyPrefix={`cs${idx}`} />
                </div>
              )}
              {concept.weaknesses?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-400">Weaknesses</p>
                  <BulletList items={concept.weaknesses} dotColor="bg-rose-400" keyPrefix={`cw${idx}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Differences table */}
      {Array.isArray(data.differences) && data.differences.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alignLeft" label="Key Differences" color="text-slate-400" />
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            {/* Header */}
            <div className="grid grid-cols-3 gap-0 border-b border-white/[0.08] bg-white/[0.04]">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Aspect</div>
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-blue-400 border-l border-white/[0.06]">
                {data.conceptA?.name || 'Concept A'}
              </div>
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-purple-400 border-l border-white/[0.06]">
                {data.conceptB?.name || 'Concept B'}
              </div>
            </div>
            {/* Rows */}
            {data.differences.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-3 gap-0 ${i < data.differences.length - 1 ? 'border-b border-white/[0.05]' : ''} ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
              >
                <div className="px-3 py-2.5 text-[11px] font-semibold text-slate-400">{row.aspect}</div>
                <div className="px-3 py-2.5 text-[12px] text-slate-300 border-l border-white/[0.05]">{row.a}</div>
                <div className="px-3 py-2.5 text-[12px] text-slate-300 border-l border-white/[0.05]">{row.b}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy keyDifferences (bullet) */}
      {!data.differences?.length && data.keyDifferences?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alignLeft" label="Key Differences" color="text-slate-400" />
          <BulletList items={data.keyDifferences} keyPrefix="kd" />
        </div>
      )}

      {/* When to use each */}
      {(data.whenToUseA || data.whenToUseB) && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="target" label="When to Use Each" color="text-slate-400" />
          <div className="flex flex-col gap-1.5">
            {data.whenToUseA && (
              <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/15 bg-blue-500/[0.05] px-3 py-2.5">
                <span className="mt-0.5 text-[10px] font-bold text-blue-400 shrink-0">
                  {data.conceptA?.name || 'A'}
                </span>
                <span className="text-[13px] leading-relaxed text-slate-300">{data.whenToUseA}</span>
              </div>
            )}
            {data.whenToUseB && (
              <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/15 bg-purple-500/[0.05] px-3 py-2.5">
                <span className="mt-0.5 text-[10px] font-bold text-purple-400 shrink-0">
                  {data.conceptB?.name || 'B'}
                </span>
                <span className="text-[13px] leading-relaxed text-slate-300">{data.whenToUseB}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legacy useCases */}
      {!data.whenToUseA && data.useCases?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="target" label="When to Use Each" color="text-slate-400" />
          <BulletList items={data.useCases} dotColor="bg-sky-400" keyPrefix="uc" />
        </div>
      )}

      {/* Exam Insight */}
      <ExamInsightCard text={data.examInsight} onSeek={onSeek} />

      {/* Verdict */}
      {(data.verdict || data.conclusion) && (
        <CalloutCard
          icon="checkCircle"
          label="Verdict"
          iconColor="text-emerald-400"
          borderColor="border-emerald-500/20"
          bgColor="bg-emerald-500/[0.07]"
        >
          <p className="font-semibold text-emerald-200">{data.verdict || data.conclusion}</p>
        </CalloutCard>
      )}

      {data.timestamps?.length > 0 && <TimestampChips timestamps={data.timestamps} onSeek={onSeek} />}

      {/* Follow-ups */}
      {Array.isArray(data.followUpQuestions) && data.followUpQuestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel icon="arrowRight" label="Explore Further" color="text-slate-500" />
          <div className="flex flex-col gap-1">
            {data.followUpQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-400">
                <AppIcon name="arrowRight" size={10} className="shrink-0 text-accent/60" />
                {q}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ARCHITECTURE CARD  –  type: "architecture"
   ════════════════════════════════════════════════════════════════ */
function ArchitectureCard({ data, onSeek }) {
  return (
    <div className="flex flex-col gap-5">
      {data.topicOverview && (
        <div className="border-b border-white/[0.07] pb-3">
          <p className="text-[15px] font-bold leading-snug text-white">{data.topicOverview}</p>
        </div>
      )}

      {data.overview && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel icon="book" label="Overview" color="text-slate-400" />
          <div className="text-[13px] leading-relaxed text-slate-200">
            <RichText text={data.overview} onSeek={onSeek} keyPrefix="ao" />
          </div>
        </div>
      )}

      {Array.isArray(data.components) && data.components.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="square" label="Components" color="text-violet-400" />
          <div className="flex flex-col gap-1.5">
            {data.components.map((comp, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg border border-violet-500/15 bg-violet-500/5 px-3 py-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">{i + 1}</span>
                <span className="text-[13px] leading-relaxed text-slate-200">
                  <RichText text={comp} onSeek={onSeek} keyPrefix={`ac-${i}`} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.dataFlow && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="arrowRight" label="Data Flow" color="text-sky-400" />
          <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.05] px-4 py-3">
            <p className="text-[13px] leading-relaxed text-slate-200">
              <RichText text={data.dataFlow} onSeek={onSeek} keyPrefix="df" />
            </p>
          </div>
        </div>
      )}

      {data.howItWorks?.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <SectionLabel icon="arrowRight" label="Step-by-Step Workflow" color="text-sky-400" />
          <StepList steps={data.howItWorks} onSeek={onSeek} />
        </div>
      )}

      {data.tradeoffs?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="target" label="Tradeoffs" color="text-amber-400" />
          <BulletList items={data.tradeoffs} dotColor="bg-amber-400" keyPrefix="tr" />
        </div>
      )}

      {data.failureModes?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="alert" label="Failure Modes" color="text-rose-400" />
          <BulletList items={data.failureModes} dotColor="bg-rose-400" keyPrefix="fm" />
        </div>
      )}

      {data.scalingConsiderations && (
        <div className="flex flex-col gap-2">
          <SectionLabel icon="arrowRight" label="Scaling Considerations" color="text-slate-400" />
          <p className="text-[13px] leading-relaxed text-slate-300">
            <RichText text={data.scalingConsiderations} onSeek={onSeek} keyPrefix="sc" />
          </p>
        </div>
      )}

      <RealWorldCard text={data.realWorldUsage || data.realWorldExample} onSeek={onSeek} />

      {(data.keyTakeaway || data.conclusion) && (
        <CalloutCard
          icon="checkCircle"
          label="Key Takeaway"
          iconColor="text-emerald-400"
          borderColor="border-emerald-500/20"
          bgColor="bg-emerald-500/[0.07]"
        >
          <p className="font-semibold text-emerald-200">{data.keyTakeaway || data.conclusion}</p>
        </CalloutCard>
      )}

      {data.timestamps?.length > 0 && <TimestampChips timestamps={data.timestamps} onSeek={onSeek} />}

      {Array.isArray(data.followUpQuestions) && data.followUpQuestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel icon="arrowRight" label="Explore Further" color="text-slate-500" />
          <div className="flex flex-col gap-1">
            {data.followUpQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-400">
                <AppIcon name="arrowRight" size={10} className="shrink-0 text-accent/60" />
                {q}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   NOTES CARD  –  type: "notes"
   ════════════════════════════════════════════════════════════════ */
function NotesCard({ data, onSeek }) {
  return (
    <div className="flex flex-col gap-3">
      {data.overallTopic && (
        <div className="flex items-center gap-2">
          <AppIcon name="book" size={13} className="text-accent" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
            {data.overallTopic}
          </span>
        </div>
      )}

      {data.summaryText && (
        <p className="text-[13px] leading-[1.75] text-slate-300">{data.summaryText}</p>
      )}

      {Array.isArray(data.keyPoints) && data.keyPoints.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Key Points</p>
          {data.keyPoints.map((kp, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 hover:bg-white/[0.05] transition-colors"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-[1.6] text-slate-100">{kp.text}</p>
                {kp.timestampRange && (
                  <button
                    type="button"
                    onClick={() => onSeek?.(kp.start)}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                  >
                    <AppIcon name="play" size={9} />
                    {kp.timestampRange}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.keyTakeaway && (
        <CalloutCard
          icon="lightbulb"
          label="Key Takeaway"
          iconColor="text-amber-400"
          borderColor="border-amber-500/25"
          bgColor="bg-amber-500/10"
        >
          <p className="font-semibold text-amber-200">{data.keyTakeaway}</p>
        </CalloutCard>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   QUIZ CARD  –  type: "quiz"
   ════════════════════════════════════════════════════════════════ */
function QuizCard({ data }) {
  if (!Array.isArray(data.questions)) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AppIcon name="brain" size={13} className="text-purple-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Quiz</span>
      </div>
      {data.questions.map((q, i) => {
        const options = Array.isArray(q.options) ? q.options : [];
        return (
          <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <p className="mb-3 text-[13px] font-semibold leading-[1.6] text-white">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 font-mono text-[10px] font-bold text-accent">{i + 1}</span>
              {q.question}
            </p>
            <div className="flex flex-col gap-1.5">
              {options.map((opt, j) => {
                const letter = opt.charAt(0);
                const isCorrect = letter === q.answer;
                return (
                  <div
                    key={j}
                    className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-[12px] leading-5 transition-colors ${
                      isCorrect
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 font-semibold'
                        : 'border border-transparent text-slate-400'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                      {letter}
                    </span>
                    {opt.slice(2).trim()}
                    {isCorrect && <AppIcon name="checkCircle" size={12} className="ml-auto shrink-0 text-emerald-400" />}
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <div className="mt-2.5 flex items-start gap-2 border-t border-white/[0.06] pt-2.5">
                <AppIcon name="lightbulb" size={12} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-[11px] leading-5 text-slate-400">{q.explanation}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SUMMARY CARD  –  type: "summary"
   ════════════════════════════════════════════════════════════════ */
function SummaryCard({ data, onSeek }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {data.overallTopic && (
          <div className="flex items-center gap-1.5">
            <AppIcon name="sparkles" size={13} className="text-accent" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-accent">{data.overallTopic}</span>
          </div>
        )}
        {data.estimatedReadingTime && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <AppIcon name="clock" size={10} />
            {data.estimatedReadingTime} read
          </span>
        )}
      </div>

      {data.summaryText && (
        <p className="text-[13px] leading-[1.75] text-slate-300">{data.summaryText}</p>
      )}

      {Array.isArray(data.keyPoints) && data.keyPoints.length > 0 && (
        <div className="flex flex-col gap-2 mt-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Key Points</p>
          {data.keyPoints.map((kp, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-[1.6] text-slate-100">{kp.text}</p>
                {kp.timestampRange && (
                  <button type="button" onClick={() => onSeek?.(kp.start)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline">
                    <AppIcon name="play" size={9} />{kp.timestampRange}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ask me about…</p>
          {data.suggestedQuestions.map((q, i) => (
            <button key={i} type="button" className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-left text-[12px] text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white">
              <AppIcon name="arrowRight" size={11} className="shrink-0 text-accent" />
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   JSON PARSER  –  3-strategy robust extractor
   1. Direct JSON parse (model output is clean)
   2. Strip markdown ```json ... ``` fences
   3. Regex scan — find first { ... } block anywhere in text
   ════════════════════════════════════════════════════════════════ */
function sanitizeJsonString(str) {
  let insideString = false;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i-1] !== '\\')) {
      insideString = !insideString;
      result += char;
    } else if (char === '\n' && insideString) {
      result += '\\n';
    } else if (char === '\r' && insideString) {
      result += '\\r';
    } else {
      result += char;
    }
  }
  return result;
}

function autoCloseJson(str) {
  let insideString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      insideString = !insideString;
      continue;
    }
    if (!insideString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  let closed = str;
  if (insideString) {
    closed += '"';
  }
  while (stack.length) {
    closed += stack.pop();
  }
  return closed;
}

function parseAiContent(content) {
  if (!content) return null;
  
  let jsonCandidate = content.trim();
  
  const fenced = jsonCandidate.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) {
    jsonCandidate = fenced[1].trim();
  } else {
    const start = jsonCandidate.indexOf('{');
    const end = jsonCandidate.lastIndexOf('}');
    if (start !== -1) {
      if (end > start) {
        jsonCandidate = jsonCandidate.slice(start, end + 1);
      } else {
        jsonCandidate = jsonCandidate.slice(start);
      }
    }
  }

  const sanitized = sanitizeJsonString(jsonCandidate);
  const closed = autoCloseJson(sanitized);

  try {
    const cleanJson = closed.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleanJson);
  } catch (err) {
    try {
      return JSON.parse(content.trim());
    } catch {
      return null;
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   AI RESPONSE ROUTER
   ════════════════════════════════════════════════════════════════ */
function AiResponseRenderer({ data, onSeek }) {
  if (!data) return null;

  // Elite Learning Mode types
  if (data.type === 'howto')       return <HowToCard       data={data} onSeek={onSeek} />;
  if (data.type === 'why')         return <WhyCard         data={data} onSeek={onSeek} />;
  if (data.type === 'comparison')  return <ComparisonCard  data={data} onSeek={onSeek} />;
  if (data.type === 'architecture')return <ArchitectureCard data={data} onSeek={onSeek} />;
  if (data.type === 'answer')      return <AnswerCard      data={data} onSeek={onSeek} />;

  // Legacy flag compat
  if (data.isComparison)  return <ComparisonCard  data={data} onSeek={onSeek} />;
  if (data.isArchitecture)return <ArchitectureCard data={data} onSeek={onSeek} />;

  // Notes / quiz / summary
  if (data.type === 'notes')   return <NotesCard   data={data} onSeek={onSeek} />;
  if (data.type === 'quiz')    return <QuizCard    data={data} />;
  if (data.type === 'summary') return <SummaryCard data={data} onSeek={onSeek} />;

  // Unknown type — render best available text field
  const fallback = data.summaryText || data.content || data.directAnswer || data.deepExplanation || data.answer || data.coreReason || '';
  return <div className="break-words">{renderMarkdown(fallback, onSeek)}</div>;
}

/* ════════════════════════════════════════════════════════════════
   STREAMING VIEW  –  hides raw JSON, shows skeleton while building
   ════════════════════════════════════════════════════════════════ */
function StreamingView({ text, onSeek }) {
  const trimmed = text?.trim() || '';

  if (trimmed.startsWith('{')) {
    if (trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return <AiResponseRenderer data={parsed} onSeek={onSeek} />;
      } catch { /* still incomplete */ }
    }
    // Mid-stream JSON — show animated skeleton
    return (
      <div className="flex flex-col gap-3 py-1">
        <div className="h-4 w-2/3 animate-pulse rounded-lg bg-white/10" />
        <div className="flex flex-col gap-2">
          <div className="h-2.5 w-full animate-pulse rounded-full bg-white/[0.07]" />
          <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-white/[0.07]" />
          <div className="h-2.5 w-full animate-pulse rounded-full bg-white/[0.07]" />
          <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-white/[0.07]" />
        </div>
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="h-2 w-1/4 animate-pulse rounded-full bg-white/[0.05]" />
          <div className="h-16 w-full animate-pulse rounded-xl bg-white/[0.05]" />
          <div className="h-16 w-full animate-pulse rounded-xl bg-white/[0.05]" />
        </div>
        <div className="flex gap-2 mt-1">
          <div className="h-6 w-16 animate-pulse rounded-full bg-white/[0.05]" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-white/[0.05]" />
          <div className="h-6 w-14 animate-pulse rounded-full bg-white/[0.05]" />
        </div>
      </div>
    );
  }

  // Plain text fallback (should not happen in strict JSON mode)
  return <div className="break-words text-[13px] leading-7 text-slate-300">{renderMarkdown(trimmed, onSeek)}</div>;
}

/* ════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════════════════════════════ */
export default function ChatMessage({ message, onSeek, isStreaming = false }) {
  const isUser = message.role === 'user';
  const parsed = !isUser ? parseAiContent(message.content) : null;

  if (!isUser) {
    console.log("RAW AI RESPONSE", message.content);
    console.log("PARSED AI RESPONSE", parsed);
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <AppIcon name="sparkles" size={15} />
        </div>
      )}

      {/* Message bubble */}
      <div
        className={`max-w-[88%] rounded-2xl border px-4 py-3 ${
          isUser
            ? 'rounded-br bg-accent text-white border-accent text-sm'
            : 'rounded-bl bg-surface-card text-slate-200 border-line'
        }`}
      >
        {isUser ? (
          <span className="text-sm leading-6">{message.content}</span>
        ) : isStreaming ? (
          <StreamingView text={message.content} onSeek={onSeek} />
        ) : parsed ? (
          <AiResponseRenderer data={parsed} onSeek={onSeek} />
        ) : (
          <div className="break-words">{renderMarkdown(message.content, onSeek)}</div>
        )}

        {/* Blinking cursor while streaming */}
        {isStreaming && (
          <span className="ml-1 inline-block h-4 w-2 animate-blink rounded-sm bg-accent align-middle" />
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-white">
          <AppIcon name="user" size={15} />
        </div>
      )}
    </div>
  );
}
