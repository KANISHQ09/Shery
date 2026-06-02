import { useState, useEffect } from 'react';
import AppIcon from '../AppIcon';
import CitationChip from './CitationChip';

// ============================================================================
// 1. HELPER: Custom XML Block Parser
// ============================================================================
export function parseEducationalContent(text) {
  if (!text) return [];
  const blocks = [];
  let remaining = text;

  // Pattern matches <TagName attr="val">Content</TagName>
  const tagRegex = /<(PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|TimelineStep|MindMapNode|QuizQuestion)([^>]*)>([\s\S]*?)<\/\1>/i;

  while (remaining) {
    const match = remaining.match(tagRegex);
    if (!match) {
      blocks.push({ type: 'markdown', content: remaining });
      break;
    }

    const matchIndex = match.index;
    const preText = remaining.substring(0, matchIndex);
    if (preText.trim()) {
      blocks.push({ type: 'markdown', content: preText });
    }

    const tagName = match[1];
    const rawAttrs = match[2];
    const innerContent = match[3];

    // Parse attributes
    const attrs = {};
    const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const name = attrMatch[1];
      const val = attrMatch[2] || attrMatch[3] || attrMatch[4];
      attrs[name] = val;
    }

    blocks.push({
      type: tagName,
      attrs,
      content: innerContent,
    });

    remaining = remaining.substring(matchIndex + match[0].length);
  }

  return blocks;
}

// ============================================================================
// 2. COMPONENT: Standard Rich Markdown Parser
// ============================================================================
export function InlineContent({ text, onSelectCitation, messageSources }) {
  if (!text) return null;

  const parts = [];
  let remaining = text;
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\])/g;
  let cursor = 0;
  const allMatches = [...remaining.matchAll(pattern)];

  for (const m of allMatches) {
    if (m.index > cursor) {
      parts.push({ type: 'text', value: remaining.substring(cursor, m.index) });
    }
    const raw = m[0];
    if (raw.startsWith('**')) {
      parts.push({ type: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('*')) {
      parts.push({ type: 'italic', value: raw.slice(1, -1) });
    } else if (raw.startsWith('`')) {
      parts.push({ type: 'code', value: raw.slice(1, -1) });
    } else if (raw.startsWith('[')) {
      parts.push({ type: 'citation', value: raw.slice(1, -1) });
    }
    cursor = m.index + raw.length;
  }
  if (cursor < remaining.length) {
    parts.push({ type: 'text', value: remaining.substring(cursor) });
  }

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'bold':
            return <strong key={i} className="font-bold text-white">{part.value}</strong>;
          case 'italic':
            return <em key={i} className="italic text-slate-300">{part.value}</em>;
          case 'code':
            return (
              <code key={i} className="px-1.5 py-0.5 bg-white/[0.06] border border-white/8 rounded-md text-[10.5px] font-mono text-orange-300 mx-0.5">
                {part.value}
              </code>
            );
          case 'citation': {
            const raw = part.value;
            const divIdx = raw.lastIndexOf(' — ');
            const title = divIdx >= 0 ? raw.substring(0, divIdx).trim() : raw;
            const meta = divIdx >= 0 ? raw.substring(divIdx + 3).trim() : '';
            const matched = messageSources?.find(
              s => s.sourceTitle?.toLowerCase().includes(title.toLowerCase()) ||
                   title.toLowerCase().includes(s.sourceTitle?.toLowerCase())
            );
            return (
              <CitationChip
                key={i}
                rawText={raw}
                title={title}
                meta={meta}
                sourceId={matched?.sourceId}
                sourceType={matched?.sourceType}
                onClick={() => onSelectCitation?.({
                  sourceId: matched?.sourceId,
                  sourceTitle: matched?.sourceTitle || title,
                  sourceType: matched?.sourceType,
                  meta,
                })}
              />
            );
          }
          default:
            return <span key={i}>{part.value}</span>;
        }
      })}
    </>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/8 bg-[#0b0c10] shadow-md select-text">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/5 select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-white/10" />
            <div className="w-2 h-2 rounded-full bg-white/10" />
            <div className="w-2 h-2 rounded-full bg-white/10" />
          </div>
          {lang && (
            <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest ml-1">
              {lang}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 hover:text-slate-350 transition"
        >
          <AppIcon name={copied ? 'check' : 'paperclip'} size={9} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[10.5px] font-mono text-slate-300 leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownTable({ rows }) {
  if (!rows || rows.length < 2) return null;
  const headers = rows[0];
  const body = rows.slice(2);

  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/8 bg-white/[0.005] select-text">
      <table className="w-full text-[11px] text-left border-collapse">
        <thead>
          <tr className="bg-white/[0.03] border-b border-white/8 text-white select-none">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-bold text-slate-200">
                {h.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rIdx) => (
            <tr key={rIdx} className="border-b border-white/5 hover:bg-white/[0.015] transition">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-4 py-2.5 text-slate-350 align-top">
                  {cell.trim()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StandardMarkdown({ content, onSelectCitation, messageSources }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.replace(/^```/, '').trim() || 'code';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />
      );
      i++;
      continue;
    }

    // Headings
    if (/^## /.test(trimmed)) {
      elements.push(
        <h4 key={`h2-${i}`} className="text-[13px] font-bold text-white mt-5 mb-2 border-b border-white/5 pb-1.5">
          <InlineContent text={trimmed.replace(/^## /, '')} onSelectCitation={onSelectCitation} messageSources={messageSources} />
        </h4>
      );
      i++;
      continue;
    }
    if (/^### /.test(trimmed)) {
      elements.push(
        <h5 key={`h3-${i}`} className="text-[11.5px] font-bold text-orange-400 mt-4 mb-2">
          <InlineContent text={trimmed.replace(/^### /, '')} onSelectCitation={onSelectCitation} messageSources={messageSources} />
        </h5>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-white/5" />);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().replace(/^> /, ''));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="my-3 pl-4 border-l-2 border-orange-500/30 text-slate-400 italic text-[11px] leading-relaxed">
          {quoteLines.map((l, li) => (
            <p key={li} className="mb-1">
              <InlineContent text={l} onSelectCitation={onSelectCitation} messageSources={messageSources} />
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Table
    if (trimmed.includes('|') && i + 1 < lines.length && /^\|[-| ]+\|$/.test(lines[i + 1]?.trim())) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableLines.push(lines[i].trim().split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1));
        i++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} rows={tableLines} />);
      continue;
    }

    // Unordered List
    if (/^[-*•] /.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^[-*•] /.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•] /, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-3 space-y-1.5 pl-2">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2.5 text-[11.5px] text-slate-350 leading-relaxed">
              <span className="w-1 h-1 rounded-full bg-orange-400 mt-2 shrink-0" />
              <span className="flex-1">
                <InlineContent text={item} onSelectCitation={onSelectCitation} messageSources={messageSources} />
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered List
    if (/^\d+\. /.test(trimmed)) {
      const listItems = [];
      let num = 1;
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        listItems.push({ num: num++, text: lines[i].trim().replace(/^\d+\. /, '') });
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-3 space-y-1.5 pl-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2.5 text-[11.5px] text-slate-350 leading-relaxed">
              <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 select-none">
                {item.num}
              </span>
              <span className="flex-1">
                <InlineContent text={item.text} onSelectCitation={onSelectCitation} messageSources={messageSources} />
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (!trimmed) {
      i++;
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="text-[12px] text-slate-300 leading-relaxed mb-3 break-words select-text">
        <InlineContent text={trimmed} onSelectCitation={onSelectCitation} messageSources={messageSources} />
      </p>
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

// ============================================================================
// 3. COMPONENT: Custom Pedagogical Rich Blocks
// ============================================================================
export function PrerequisiteNotice({ content }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-amber-500/10 bg-amber-500/[0.02] backdrop-blur-sm flex items-start gap-4 select-text animate-in fade-in duration-300">
      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
        <AppIcon name="lock" size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <h5 className="text-[10px] font-bold text-amber-450 uppercase tracking-widest mb-1">Prerequisite Core Topic</h5>
        <p className="text-xs text-amber-250/90 leading-relaxed">{content.trim()}</p>
      </div>
    </div>
  );
}

export function ChapterBlock({ title, content, onSelectCitation, messageSources }) {
  const parsed = parseEducationalContent(content);
  return (
    <div className="my-10 space-y-6 border-l-2 border-orange-500/20 pl-6 md:pl-8 py-2 relative">
      {/* Decorative chapter badge */}
      <div className="absolute left-[-6px] top-3.5 w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-300/40 shadow-[0_0_10px_rgba(99,102,241,0.6)]" />
      <h3 className="text-base font-bold text-slate-100 tracking-tight uppercase border-b border-white/5 pb-3 pr-2 select-none font-display">
        {title}
      </h3>
      <div className="space-y-5">
        {parsed.map((block, idx) => (
          <BlockRenderer key={idx} block={block} onSelectCitation={onSelectCitation} messageSources={messageSources} />
        ))}
      </div>
    </div>
  );
}

export function ConceptDefinitionCard({ term, content, onSelectCitation, messageSources }) {
  return (
    <div className="my-5 p-5 rounded-2xl border border-white/5 bg-white/[0.01] hover:border-orange-500/20 hover:bg-orange-500/[0.015] transition-all duration-300 shadow-sm relative group select-text">
      <div className="absolute right-4 top-4 text-slate-650 group-hover:text-orange-400 transition-colors select-none">
        <AppIcon name="alignLeft" size={13} />
      </div>
      <h5 className="text-xs font-bold text-slate-100 group-hover:text-orange-300 transition-colors mb-2 font-display">
        {term}
      </h5>
      <div className="text-xs text-slate-350 leading-relaxed">
        <StandardMarkdown content={content} onSelectCitation={onSelectCitation} messageSources={messageSources} />
      </div>
    </div>
  );
}

export function KeyInsightPanel({ title, content, onSelectCitation, messageSources }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-orange-500/10 bg-orange-500/[0.015] shadow-[0_4px_24px_rgba(99,102,241,0.02)] flex gap-4 select-text">
      <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 select-none">
        <AppIcon name="lightbulb" size={16} className="animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="text-[10px] font-bold text-orange-300 uppercase tracking-widest mb-1.5 select-none">{title || 'Key Conceptual Insight'}</h5>
        <div className="text-xs text-slate-200 leading-relaxed italic">
          <StandardMarkdown content={content} onSelectCitation={onSelectCitation} messageSources={messageSources} />
        </div>
      </div>
    </div>
  );
}

export function SummaryBanner({ content }) {
  return (
    <div className="my-6 p-5 rounded-2xl bg-gradient-to-r from-orange-950/10 to-amber-950/10 border border-orange-500/10 shadow-sm relative overflow-hidden select-text">
      <div className="absolute right-[-15px] bottom-[-15px] opacity-[0.02] select-none pointer-events-none">
        <AppIcon name="rocket" size={90} />
      </div>
      <h5 className="text-[10px] font-bold text-orange-350 uppercase tracking-widest mb-2 select-none">Chapter Summary</h5>
      <p className="text-xs text-slate-350 leading-relaxed">{content.trim()}</p>
    </div>
  );
}

export function ExampleWalkthrough({ title, content, onSelectCitation, messageSources }) {
  return (
    <div className="my-6 rounded-2xl border border-white/5 overflow-hidden shadow-sm bg-white/[0.005] select-text">
      <div className="px-5 py-3 border-b border-white/5 bg-white/[0.015] flex items-center gap-2 select-none">
        <AppIcon name="code" size={13} className="text-orange-400" />
        <span className="text-xs font-bold text-slate-200 tracking-wide font-display">{title || 'Practical Walkthrough'}</span>
      </div>
      <div className="p-5 text-xs text-slate-355 leading-relaxed">
        <StandardMarkdown content={content} onSelectCitation={onSelectCitation} messageSources={messageSources} />
      </div>
    </div>
  );
}

export function FormulaCard({ formula, explanation, content }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-orange-500/10 bg-[#08090d]/40 flex flex-col items-center text-center shadow-inner relative select-text">
      <div className="text-xl font-mono text-orange-300 py-4 italic tracking-wide break-words max-w-full font-display">
        {formula}
      </div>
      {explanation && (
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest border-t border-white/5 pt-2 px-6 block mt-1.5 select-none">
          {explanation}
        </span>
      )}
      {content && (
        <p className="text-xs text-slate-450 mt-2.5 max-w-md leading-relaxed">{content.trim()}</p>
      )}
    </div>
  );
}

export function RevisionChecklist({ content }) {
  const lines = content.split('\n').filter(l => l.trim());
  const [checkedItems, setCheckedItems] = useState({});

  const toggleCheck = (idx) => {
    setCheckedItems(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  return (
    <div className="my-6 p-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.01] shadow-sm select-none">
      <div className="flex items-center gap-2 mb-4">
        <AppIcon name="trophy" size={14} className="text-emerald-400" />
        <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Active Revision Checklist</h5>
      </div>
      <div className="space-y-3">
        {lines.map((line, idx) => {
          const itemText = line.replace(/^[-*•]\s*(?:\[[ x]\])?\s*/i, '').trim();
          const isCompleted = checkedItems[idx] || line.includes('[x]');

          return (
            <div
              key={idx}
              onClick={() => toggleCheck(idx)}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <div className={`mt-0.5 w-4 h-4 rounded-lg border flex items-center justify-center shrink-0 transition duration-200 ${
                isCompleted
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-450'
                  : 'border-white/10 bg-white/[0.01] group-hover:border-white/20'
              }`}>
                {isCompleted && <AppIcon name="check" size={10} strokeWidth={3} />}
              </div>
              <span className={`text-xs leading-relaxed transition-all select-text ${
                isCompleted ? 'text-slate-500 line-through' : 'text-slate-300 group-hover:text-slate-100'
              }`}>
                {itemText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PracticePromptCard({ question, answer, difficulty = 'medium', content }) {
  const [revealed, setRevealed] = useState(false);

  const diffColors = {
    easy: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    medium: 'text-amber-400 bg-amber-500/5 border-amber-500/10',
    hard: 'text-rose-455 bg-rose-500/5 border-rose-500/10',
  };
  const diffClass = diffColors[difficulty.toLowerCase()] || diffColors.medium;

  return (
    <div className="my-5 border border-white/5 bg-[#08090d]/30 rounded-2xl overflow-hidden shadow-sm select-text">
      {/* Card header */}
      <div className="px-5 py-3.5 bg-white/[0.015] flex items-center justify-between border-b border-white/5 gap-4 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
            <AppIcon name="book" size={11} />
          </div>
          <span className="text-xs font-bold text-slate-100 truncate font-display">{question}</span>
        </div>
        <span className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-full border shrink-0 ${diffClass}`}>
          {difficulty}
        </span>
      </div>

      {/* Concept details */}
      {content && content.trim() && (
        <div className="px-5 pt-3.5 text-xs text-slate-400 italic">
          {content.trim()}
        </div>
      )}

      {/* Answer Area */}
      <div className="p-4 border-t border-white/[0.03]">
        {revealed ? (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            <div className="text-xs text-slate-300 leading-relaxed">
              {answer}
            </div>
            <button
              onClick={() => setRevealed(false)}
              className="text-[9px] font-bold text-slate-500 hover:text-slate-350 flex items-center gap-1 select-none cursor-pointer"
            >
              Hide Solution
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="w-full text-center py-2.5 text-xs font-bold text-orange-400 hover:text-orange-300 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 hover:border-orange-500/20 rounded-xl transition cursor-pointer select-none"
          >
            Reveal Model Answer
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 4. COMPONENT: Studio Formats (Flashcards, FAQ, Timeline, Quiz, Mindmap)
// ============================================================================

export function FlashcardsRenderer({ content }) {
  let cards = [];
  try {
    cards = JSON.parse(content);
    if (!Array.isArray(cards)) throw new Error();
  } catch {
    // fallback if malformed JSON
    return (
      <div className="p-4 text-xs text-rose-400 border border-rose-500/20 bg-rose-500/5 rounded-xl">
        Flashcards JSON parsed failed. Raw Output:
        <pre className="mt-2 p-3 bg-black/40 rounded text-slate-300 whitespace-pre-line font-mono">{content}</pre>
      </div>
    );
  }

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState({});

  const card = cards[currentIndex];

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setFlipped(false);
      setTimeout(() => setCurrentIndex(c => c + 1), 150);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setFlipped(false);
      setTimeout(() => setCurrentIndex(c => c - 1), 150);
    }
  };

  const handleRate = (level) => {
    setRatings(prev => ({ ...prev, [currentIndex]: level }));
    handleNext();
  };

  const currentRating = ratings[currentIndex];

  if (!card) return null;

  return (
    <div className="max-w-xl mx-auto space-y-6 py-4 select-none">
      {/* Progress tracker */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <span>Active-Recall Progress</span>
          <span>Card {currentIndex + 1} of {cards.length}</span>
        </div>
        <div className="h-1 bg-white/[0.04] border border-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 3D Flip Card Container */}
      <div
        onClick={() => setFlipped(!flipped)}
        className="h-64 cursor-pointer relative perspective-1000 group w-full"
      >
        <div className={`w-full h-full duration-500 transform-style-3d relative transition-transform ${flipped ? 'rotate-y-180' : ''}`}>
          {/* FRONT (Question) */}
          <div className="absolute inset-0 backface-hidden rounded-2xl border border-white/10 bg-white/[0.015] hover:bg-white/[0.025] hover:border-orange-500/30 p-8 flex flex-col justify-between shadow-lg transition-premium">
            <div className="flex justify-between items-start gap-4">
              <span className="px-2.5 py-0.5 rounded-full border border-orange-500/20 text-orange-400 bg-orange-500/5 text-[9px] font-bold uppercase tracking-wider">
                {card.concept || 'Flashcard'}
              </span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Question</span>
            </div>
            <div className="text-center font-bold text-white text-base md:text-lg leading-snug px-4">
              {card.question}
            </div>
            <div className="text-center text-[9px] font-extrabold text-orange-400 uppercase tracking-wider group-hover:scale-105 transition">
              Click to Flip card
            </div>
          </div>

          {/* BACK (Answer) */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-orange-500/25 bg-orange-950/15 p-8 flex flex-col justify-between shadow-2xl">
            <div className="flex justify-between items-start gap-4">
              {card.sourceCitation && (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-slate-400 bg-white/[0.03] border border-white/6 px-2 py-0.5 rounded-full select-text">
                  <AppIcon name="file" size={8} />
                  {card.sourceCitation}
                </span>
              )}
              <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">Answer Reveal</span>
            </div>
            <div className="text-center text-slate-200 text-sm md:text-base leading-relaxed px-4 overflow-y-auto max-h-32 scrollbar-thin select-text">
              {card.answer}
            </div>
            {card.memoryCue && (
              <div className="text-[9.5px] text-slate-450 border-t border-white/5 pt-2 italic text-center select-text">
                Cue: {card.memoryCue}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation & Spaced repetition controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Next/Prev */}
        <div className="flex gap-2">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="p-2.5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed text-slate-350 hover:text-white transition"
          >
            <AppIcon name="chevronLeft" size={16} />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
            className="p-2.5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed text-slate-350 hover:text-white transition"
          >
            <AppIcon name="chevronLeft" size={16} className="rotate-180" />
          </button>
        </div>

        {/* Spaced Repetition Buttons */}
        <div className="flex gap-2 w-full sm:w-auto">
          {[
            { label: 'Hard 🔴', level: 'hard', color: 'hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-400 border-rose-500/10' },
            { label: 'Medium 🟡', level: 'medium', color: 'hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-400 border-amber-500/10' },
            { label: 'Easy 🟢', level: 'easy', color: 'hover:bg-emerald-500/10 hover:border-emerald-500/30 text-emerald-400 border-emerald-500/10' },
          ].map((btn) => (
            <button
              key={btn.level}
              onClick={() => handleRate(btn.level)}
              className={`flex-1 sm:flex-none px-4 py-2 border text-[10px] font-bold uppercase tracking-wider rounded-xl bg-white/[0.01] transition ${btn.color} ${
                currentRating === btn.level ? 'bg-white/5 border-white/20' : ''
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FAQRenderer({ blocks, onSelectCitation, messageSources }) {
  const [searchQuery, setSearchQuery] = useState('');
  const faqItems = blocks.filter(b => b.type === 'PracticePromptCard');

  const filtered = faqItems.filter(item => {
    const qText = (item.attrs?.question || '').toLowerCase();
    const aText = (item.attrs?.answer || '').toLowerCase();
    return qText.includes(searchQuery.toLowerCase()) || aText.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-5 py-2 select-text">
      {/* FAQ Search */}
      <div className="relative select-none">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter frequently asked questions..."
          className="w-full bg-white/[0.01] border border-white/6 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-550 focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.025] transition"
        />
        <div className="absolute left-3.5 top-3 text-slate-550">
          <AppIcon name="search" size={11} />
        </div>
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-2.5 text-slate-550 hover:text-slate-350">
            <AppIcon name="x" size={10} />
          </button>
        )}
      </div>

      {/* Accordions */}
      <div className="space-y-3">
        {filtered.map((item, idx) => (
          <PracticePromptCard
            key={idx}
            question={item.attrs?.question || 'Question'}
            answer={item.attrs?.answer || ''}
            difficulty={item.attrs?.difficulty || 'medium'}
            content={item.content}
          />
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-10 bg-white/[0.005] border border-white/5 border-dashed rounded-xl select-none">
            <span className="text-[11px] text-slate-550">No matching questions found.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelineRenderer({ blocks }) {
  const steps = blocks.filter(b => b.type === 'TimelineStep');

  return (
    <div className="py-4 select-text">
      {/* Horizontal timeline track */}
      <div className="flex gap-5 overflow-x-auto pb-6 scrollbar-thin px-2 relative min-w-full">
        {steps.map((step, idx) => (
          <div key={idx} className="flex shrink-0 items-start">
            {/* Step Card */}
            <div className="w-64 rounded-xl border border-white/6 bg-white/[0.01] hover:border-orange-500/20 hover:bg-white/[0.02] p-4.5 space-y-2.5 transition relative select-text">
              <div className="flex items-center justify-between gap-2 select-none">
                <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 rounded-full">
                  Step {idx + 1}
                </span>
                {step.attrs?.citation && (
                  <span className="text-[8.5px] font-semibold text-slate-500 italic max-w-[100px] truncate">
                    {step.attrs.citation}
                  </span>
                )}
              </div>
              <h5 className="text-[11.5px] font-extrabold text-slate-100 leading-snug">{step.attrs?.title || 'Timeline Milestone'}</h5>
              {step.attrs?.subtitle && (
                <span className="text-[9.5px] text-slate-450 font-bold uppercase tracking-wider block select-none">{step.attrs.subtitle}</span>
              )}
              <p className="text-[10.5px] text-slate-350 leading-relaxed">{step.content?.trim()}</p>
            </div>

            {/* Connecting Arrow */}
            {idx < steps.length - 1 && (
              <div className="flex items-center justify-center h-full px-2 select-none shrink-0 self-center">
                <div className="w-6 h-[1.5px] bg-orange-500/20 relative">
                  <div className="absolute right-0 top-[-3.5px] w-2 h-2 rounded-full border-r-[1.5px] border-t-[1.5px] border-orange-500/30 transform rotate-45" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MindMapRenderer({ blocks }) {
  const nodes = blocks.filter(b => b.type === 'MindMapNode');

  // Simple nested tree renderer with collapse state
  const TreeNode = ({ node }) => {
    const [collapsed, setCollapsed] = useState(false);
    const hasChildren = node.content && node.content.includes('<MindMapNode');
    
    let childBlocks = [];
    if (hasChildren) {
      childBlocks = parseEducationalContent(node.content).filter(b => b.type === 'MindMapNode');
    }

    const colorClasses = {
      orange: 'border-orange-500/30 bg-orange-500/5 text-orange-400',
      violet: 'border-violet-500/30 bg-violet-500/5 text-violet-400',
      cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400',
      emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
      amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    };
    const cClass = colorClasses[node.attrs?.color || 'orange'] || colorClasses.orange;

    return (
      <div className="pl-6 border-l border-white/5 relative mt-3 select-none">
        {/* Relational connection line indicator */}
        <div className="absolute left-0 top-3.5 w-4.5 h-[1px] bg-white/5" />
        
        {/* Node Bubble */}
        <div className="inline-flex flex-col max-w-sm rounded-xl border border-white/6 bg-[#0c0d10] hover:border-orange-500/15 p-3.5 gap-1 shadow-sm transition">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${cClass}`}>
              {node.attrs?.label || 'Node'}
            </span>
            {hasChildren && (
              <button
                onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                className="text-slate-500 hover:text-slate-350 p-0.5 rounded"
              >
                <AppIcon name="chevronLeft" size={9} className={`transform transition-transform ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            )}
          </div>
          {node.attrs?.info && (
            <p className="text-[10.5px] text-slate-350 select-text font-medium leading-relaxed mt-1">{node.attrs.info}</p>
          )}
        </div>

        {/* Child branches */}
        {hasChildren && !collapsed && (
          <div className="space-y-1.5 animate-in fade-in duration-200">
            {childBlocks.map((child, cIdx) => (
              <TreeNode key={cIdx} node={child} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-2 overflow-x-auto scrollbar-thin select-none">
      <div className="min-w-[600px] p-2 space-y-4">
        {nodes.map((node, idx) => (
          <TreeNode key={idx} node={node} />
        ))}
      </div>
    </div>
  );
}

export function QuizRenderer({ blocks }) {
  const quizItems = blocks.filter(b => b.type === 'QuizQuestion');
  const [answers, setAnswers] = useState({});
  const [submissions, setSubmissions] = useState({});
  const [score, setScore] = useState(0);
  const [totalAttempted, setTotalAttempted] = useState(0);

  const handleSelectOption = (qIdx, choice) => {
    if (submissions[qIdx]) return;
    setAnswers(prev => ({ ...prev, [qIdx]: choice }));
  };

  const handleTextAnswerChange = (qIdx, text) => {
    if (submissions[qIdx]) return;
    setAnswers(prev => ({ ...prev, [qIdx]: text }));
  };

  const handleSubmitQuestion = (qIdx, correctOption) => {
    if (submissions[qIdx]) return;
    const isCorrect = answers[qIdx] === correctOption;
    setSubmissions(prev => ({ ...prev, [qIdx]: { isCorrect, submitted: true } }));
    setTotalAttempted(t => t + 1);
    if (isCorrect) setScore(s => s + 1);
  };

  const handleSubmitShortAnswer = (qIdx) => {
    if (submissions[qIdx]) return;
    setSubmissions(prev => ({ ...prev, [qIdx]: { submitted: true } }));
    setTotalAttempted(t => t + 1);
  };

  return (
    <div className="space-y-6 py-2 select-text">
      {/* Score overview header */}
      {totalAttempted > 0 && (
        <div className="p-4 rounded-xl border border-orange-500/10 bg-orange-500/[0.015] flex items-center justify-between select-none animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AppIcon name="trophy" size={14} className="text-orange-400" />
            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Self-Assessment Grade</span>
          </div>
          <span className="text-[13px] font-extrabold text-orange-400">
            {score} / {totalAttempted} Correct ({Math.round((score / totalAttempted) * 100)}%)
          </span>
        </div>
      )}

      {/* Quiz elements */}
      <div className="space-y-5">
        {quizItems.map((q, idx) => {
          const type = q.attrs?.type || 'multiple-choice';
          const isSubmitted = submissions[idx]?.submitted;
          const userAns = answers[idx] || '';

          if (type === 'multiple-choice') {
            const rawOptions = q.attrs?.options || '';
            const correctOpt = q.attrs?.correct || 'A';
            const options = rawOptions.split('|').map(opt => {
              const div = opt.indexOf(':');
              const key = div >= 0 ? opt.substring(0, div).trim() : '';
              const val = div >= 0 ? opt.substring(div + 1).trim() : opt.trim();
              return { key, val };
            });

            return (
              <div key={idx} className="p-5 border border-white/5 bg-[#0d0e12]/40 rounded-xl space-y-4">
                <div className="flex justify-between items-start gap-3 select-none">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Question {idx + 1}</span>
                  <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 rounded-full uppercase tracking-wider">Multiple Choice</span>
                </div>
                <h5 className="text-[12px] font-bold text-slate-100 leading-snug">{q.attrs?.question}</h5>

                {/* Options grid */}
                <div className="grid grid-cols-1 gap-2">
                  {options.map((opt) => {
                    const isSelected = userAns === opt.key;
                    let optStyle = 'border-white/5 bg-white/[0.01] hover:border-white/10 text-slate-300';
                    
                    if (isSubmitted) {
                      if (opt.key === correctOpt) {
                        optStyle = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold';
                      } else if (isSelected) {
                        optStyle = 'border-rose-500/40 bg-rose-500/10 text-rose-450 line-through';
                      } else {
                        optStyle = 'border-white/5 bg-white/[0.005] opacity-50 text-slate-400';
                      }
                    } else if (isSelected) {
                      optStyle = 'border-orange-500/40 bg-orange-500/10 text-orange-400 font-bold';
                    }

                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleSelectOption(idx, opt.key)}
                        disabled={isSubmitted}
                        className={`text-left px-4 py-2.5 rounded-xl border text-[11px] transition ${optStyle}`}
                      >
                        <span className="inline-block mr-2 uppercase text-[10px] select-none font-bold text-orange-400 bg-orange-500/5 w-4 h-4 rounded border border-orange-500/15 text-center leading-none align-middle">
                          {opt.key}
                        </span>
                        <span className="align-middle select-text">{opt.val}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Submit button */}
                {!isSubmitted && (
                  <button
                    onClick={() => handleSubmitQuestion(idx, correctOpt)}
                    disabled={!userAns}
                    className="w-full text-center py-2 text-[10.5px] font-bold text-white bg-orange-500 hover:bg-orange-650 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed select-none transition"
                  >
                    Lock Answer
                  </button>
                )}

                {/* Feedback revealed */}
                {isSubmitted && (
                  <div className="pt-3 border-t border-white/5 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider select-none">
                      {submissions[idx]?.isCorrect ? (
                        <span className="text-emerald-400 flex items-center gap-1">✔ Correct Answer</span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1">✘ Incorrect Answer</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-350 leading-relaxed">
                      <strong className="text-slate-200">Explanation: </strong> {q.attrs?.explanation}
                    </p>
                    {q.attrs?.citation && (
                      <span className="inline-block text-[9px] font-semibold text-slate-500 select-text">
                        Reference: {q.attrs.citation}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          } else {
            // short answer
            return (
              <div key={idx} className="p-5 border border-white/5 bg-[#0d0e12]/40 rounded-xl space-y-4">
                <div className="flex justify-between items-start gap-3 select-none">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Question {idx + 1}</span>
                  <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 rounded-full uppercase tracking-wider">Short Answer</span>
                </div>
                <h5 className="text-[12px] font-bold text-slate-100 leading-snug">{q.attrs?.question}</h5>

                <textarea
                  value={userAns}
                  onChange={(e) => handleTextAnswerChange(idx, e.target.value)}
                  disabled={isSubmitted}
                  rows={3}
                  placeholder="Type your structured answer here..."
                  className="w-full text-[11px] bg-white/[0.005] border border-white/5 hover:border-white/10 rounded-xl p-3 focus:outline-none focus:border-orange-500/35 transition leading-relaxed"
                />

                {!isSubmitted && (
                  <button
                    onClick={() => handleSubmitShortAnswer(idx)}
                    disabled={!userAns.trim()}
                    className="w-full text-center py-2 text-[10.5px] font-bold text-white bg-orange-500 hover:bg-orange-650 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed select-none transition"
                  >
                    Submit Answer for Self-Evaluation
                  </button>
                )}

                {/* Model Rubric revealed */}
                {isSubmitted && (
                  <div className="pt-4 border-t border-white/5 space-y-3.5 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest select-none">Grading Rubric</span>
                      <p className="text-[11px] text-slate-350 leading-relaxed">{q.attrs?.rubric}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-extrabold text-orange-455 uppercase tracking-widest select-none">Model Answer</span>
                      <p className="text-[11px] text-slate-200 leading-relaxed italic bg-white/[0.015] p-3 rounded-lg border border-white/5">{q.attrs?.modelAnswer}</p>
                    </div>
                    {q.attrs?.citation && (
                      <span className="inline-block text-[9px] font-semibold text-slate-500 select-text">
                        Reference: {q.attrs.citation}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 5. MASTER RENDERER: Route blocks dynamically
// ============================================================================
function BlockRenderer({ block, onSelectCitation, messageSources }) {
  switch (block.type) {
    case 'markdown':
      return <StandardMarkdown content={block.content} onSelectCitation={onSelectCitation} messageSources={messageSources} />;
    case 'PrerequisiteNotice':
      return <PrerequisiteNotice content={block.content} />;
    case 'ChapterBlock':
      return (
        <ChapterBlock
          title={block.attrs?.title || 'Chapter'}
          content={block.content}
          onSelectCitation={onSelectCitation}
          messageSources={messageSources}
        />
      );
    case 'ConceptDefinitionCard':
      return (
        <ConceptDefinitionCard
          term={block.attrs?.term || 'Term'}
          content={block.content}
          onSelectCitation={onSelectCitation}
          messageSources={messageSources}
        />
      );
    case 'KeyInsightPanel':
      return (
        <KeyInsightPanel
          title={block.attrs?.title || 'Insight'}
          content={block.content}
          onSelectCitation={onSelectCitation}
          messageSources={messageSources}
        />
      );
    case 'SummaryBanner':
      return <SummaryBanner content={block.content} />;
    case 'ExampleWalkthrough':
      return (
        <ExampleWalkthrough
          title={block.attrs?.title || 'Example'}
          content={block.content}
          onSelectCitation={onSelectCitation}
          messageSources={messageSources}
        />
      );
    case 'FormulaCard':
      return <FormulaCard formula={block.attrs?.formula} explanation={block.attrs?.explanation} content={block.content} />;
    case 'RevisionChecklist':
      return <RevisionChecklist content={block.content} />;
    case 'PracticePromptCard':
      return (
        <PracticePromptCard
          question={block.attrs?.question || 'Practice Question'}
          answer={block.attrs?.answer || ''}
          difficulty={block.attrs?.difficulty || 'medium'}
          content={block.content}
        />
      );
    default:
      return null;
  }
}

export default function EducationalContentRenderer({
  type,
  content,
  onSelectCitation,
  messageSources,
}) {
  const blocks = parseEducationalContent(content);

  // Dedicated layout handlers based on studio asset type
  if (type === 'flashcards') {
    return <FlashcardsRenderer content={content} />;
  }

  if (type === 'faq') {
    return <FAQRenderer blocks={blocks} onSelectCitation={onSelectCitation} messageSources={messageSources} />;
  }

  if (type === 'timeline') {
    return <TimelineRenderer blocks={blocks} />;
  }

  if (type === 'topic_breakdown') {
    return <MindMapRenderer blocks={blocks} />;
  }

  if (type === 'exam_prep') {
    return <QuizRenderer blocks={blocks} />;
  }

  // Fallback to progressive structured list of blocks (for Study Guides, revision sheets, glossary)
  return (
    <div className="educational-renderer space-y-5 text-left font-sans antialiased text-[11.5px] leading-relaxed max-w-2xl mx-auto pb-10">
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} onSelectCitation={onSelectCitation} messageSources={messageSources} />
      ))}
    </div>
  );
}

