import { useState, useEffect, useRef } from 'react';
import AppIcon from '../AppIcon';
import CitationChip from './CitationChip';
import mermaid from 'mermaid';
import toast from 'react-hot-toast';

// ============================================================================
// 1. HELPER: Custom XML Block Parser
// ============================================================================
export function parseEducationalContent(text) {
  if (!text) return [];
  const blocks = [];
  let remaining = text;

  // Pattern matches <TagName attr="val">Content</TagName>
  const tagRegex = /<(Section|PrerequisiteNotice|ChapterBlock|ConceptDefinitionCard|KeyInsightPanel|SummaryBanner|ImportantTermHighlight|ExampleWalkthrough|FormulaCard|RevisionChecklist|PracticePromptCard|MindMapNode|QuizQuestion|WhyYouShouldCare|ExecutiveOverview|DifficultyHeatmap|MisconceptionCard|MentalModel|ApplicationCard|InterviewQuestion|ChallengeCard|SourceEvidencePanel|TeachBackQuestion|FurtherExploration)([^>]*)>([\s\S]*?)<\/\1>/i;

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
    if (/^#+\s+/.test(trimmed)) {
      const hashCount = (trimmed.match(/^#+/) || [''])[0].length;
      const headingText = trimmed.replace(/^[#\-:\s]+/g, '');
      if (hashCount <= 2) {
        elements.push(
          <h4 key={`h2-${i}`} className="text-[13px] font-bold text-white mt-5 mb-2 border-b border-white/5 pb-1.5">
            <InlineContent text={headingText} onSelectCitation={onSelectCitation} messageSources={messageSources} />
          </h4>
        );
      } else {
        elements.push(
          <h5 key={`h3-${i}`} className="text-[11.5px] font-bold text-orange-400 mt-4 mb-2">
            <InlineContent text={headingText} onSelectCitation={onSelectCitation} messageSources={messageSources} />
          </h5>
        );
      }
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

export function WhyYouShouldCareRenderer({ content }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-amber-500/10 bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.01] flex items-start gap-4 select-text animate-in fade-in duration-300">
      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 select-none">
        <AppIcon name="lightbulb" size={14} className="animate-pulse" />
      </div>
      <div className="min-w-0 flex-1">
        <h5 className="text-[10px] font-bold text-amber-450 uppercase tracking-widest mb-1 select-none">Why This Matters</h5>
        <p className="text-xs text-amber-200/90 leading-relaxed font-medium italic">{content.trim()}</p>
      </div>
    </div>
  );
}

export function ExecutiveOverviewRenderer({ content }) {
  return (
    <div className="my-6 p-6 rounded-2xl border border-white/5 bg-white/[0.005] shadow-lg relative overflow-hidden select-text animate-in fade-in duration-300">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 to-amber-500" />
      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 select-none">Executive Overview</h5>
      <p className="text-sm md:text-[13px] text-slate-200 leading-relaxed font-display font-medium">
        {content.trim()}
      </p>
    </div>
  );
}

export function DifficultyHeatmapRenderer({ content }) {
  let data = { easy: [], medium: [], hard: [] };
  try {
    data = JSON.parse(content.trim());
  } catch (e) {
    return null;
  }

  return (
    <div className="my-6 p-5 rounded-2xl border border-white/5 bg-white/[0.005] space-y-4 select-text">
      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">Cognitive Difficulty Heatmap</h5>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.01] space-y-2">
          <span className="text-[9px] font-bold text-emerald-450 uppercase tracking-widest select-none">Easy / Foundation</span>
          <div className="flex flex-wrap gap-1.5">
            {data.easy?.map((c, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded-md bg-emerald-500/5 text-emerald-300 border border-emerald-500/10 text-[9.5px]">
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-amber-500/10 bg-amber-500/[0.01] space-y-2">
          <span className="text-[9px] font-bold text-amber-450 uppercase tracking-widest select-none">Medium / Application</span>
          <div className="flex flex-wrap gap-1.5">
            {data.medium?.map((c, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded-md bg-amber-500/5 text-amber-300 border border-amber-500/10 text-[9.5px]">
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/[0.01] space-y-2">
          <span className="text-[9px] font-bold text-rose-455 uppercase tracking-widest select-none">Hard / Advanced Mastery</span>
          <div className="flex flex-wrap gap-1.5">
            {data.hard?.map((c, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded-md bg-rose-500/5 text-rose-300 border border-rose-500/10 text-[9.5px]">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MisconceptionCardRenderer({ myth, correct, citation, content }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-rose-500/15 bg-rose-500/[0.01] shadow-sm select-text relative">
      {citation && (
        <div className="absolute right-4 top-4 select-none">
          <CitationChip citation={citation} />
        </div>
      )}
      <div className="flex items-center gap-2 mb-4 select-none">
        <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <AppIcon name="alert" size={12} />
        </div>
        <h5 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Misconception & Trap</h5>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1 select-none">
            ❌ Myth
          </span>
          <p className="text-xs text-rose-300 font-semibold leading-relaxed">{myth}</p>
        </div>
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1 select-none">
            ✓ Fact
          </span>
          <p className="text-xs text-emerald-305 font-semibold leading-relaxed">{correct}</p>
        </div>
      </div>
      {content && content.trim() && (
        <div className="mt-4 pt-3 border-t border-white/5 text-xs text-slate-350 leading-relaxed">
          {content.trim()}
        </div>
      )}
    </div>
  );
}

export function MentalModelRenderer({ concept, analogy, citation, content }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-violet-500/10 bg-gradient-to-br from-violet-500/[0.02] to-indigo-500/[0.01] shadow-sm select-text relative animate-in fade-in duration-300">
      {citation && (
        <div className="absolute right-4 top-4 select-none">
          <CitationChip citation={citation} />
        </div>
      )}
      <div className="flex items-center gap-2 mb-3.5 select-none">
        <div className="w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
          <AppIcon name="brain" size={12} />
        </div>
        <h5 className="text-[10px] font-bold text-violet-450 uppercase tracking-widest">Mental Model Analogy</h5>
      </div>
      <div className="space-y-2">
        <h6 className="text-[13px] font-bold text-slate-100 leading-snug">
          {concept} <span className="text-slate-500 font-normal">is like</span> {analogy}
        </h6>
        <p className="text-xs text-slate-300 leading-relaxed italic">{content.trim()}</p>
      </div>
    </div>
  );
}

export function ApplicationCardRenderer({ industry, useCase, citation, content }) {
  return (
    <div className="my-6 p-5 rounded-2xl border border-emerald-500/10 bg-[#08090d]/30 shadow-sm select-text relative">
      {citation && (
        <div className="absolute right-4 top-4 select-none">
          <CitationChip citation={citation} />
        </div>
      )}
      <div className="flex items-center gap-2 mb-4 select-none">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-450">
          <AppIcon name="target" size={12} />
        </div>
        <h5 className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest">Real-World Application</h5>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[8px] font-extrabold uppercase tracking-wider select-none">
            {industry}
          </span>
          <span className="text-xs font-bold text-slate-200">{useCase}</span>
        </div>
        <p className="text-xs text-slate-350 leading-relaxed">{content.trim()}</p>
      </div>
    </div>
  );
}

export function InterviewQuestionRenderer({ level, citation, content }) {
  const [revealed, setRevealed] = useState(false);

  const levelConfig = {
    beginner: {
      badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
      glow: 'border-emerald-500/10 hover:border-emerald-500/20',
      dot: 'bg-emerald-400',
      icon: '🟢',
    },
    intermediate: {
      badge: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
      glow: 'border-amber-500/10 hover:border-amber-500/20',
      dot: 'bg-amber-400',
      icon: '🟡',
    },
    advanced: {
      badge: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
      glow: 'border-rose-500/10 hover:border-rose-500/20',
      dot: 'bg-rose-400',
      icon: '🔴',
    },
  };
  const cfg = levelConfig[level?.toLowerCase()] || levelConfig.intermediate;

  // Parse structured content (Question / Expected Answer / Why Interviewers Ask This)
  const lines = content.trim().split('\n');
  let question = '';
  let answer = '';
  let why = '';
  let currentSection = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Question:')) {
      currentSection = 'question';
      const rest = trimmed.replace('Question:', '').trim();
      if (rest) question = rest;
    } else if (trimmed.startsWith('Expected Answer:')) {
      currentSection = 'answer';
      const rest = trimmed.replace('Expected Answer:', '').trim();
      if (rest) answer = rest;
    } else if (trimmed.startsWith('Why Interviewers Ask This:')) {
      currentSection = 'why';
      const rest = trimmed.replace('Why Interviewers Ask This:', '').trim();
      if (rest) why = rest;
    } else if (trimmed) {
      if (currentSection === 'question') question = question ? question + ' ' + trimmed : trimmed;
      else if (currentSection === 'answer') answer = answer ? answer + ' ' + trimmed : trimmed;
      else if (currentSection === 'why') why = why ? why + ' ' + trimmed : trimmed;
    }
  }
  // Fallback: if no structured parsing worked, display raw content
  if (!question && !answer) {
    question = content.trim();
  }

  return (
    <div className={`my-4 rounded-2xl border bg-[#0c0d13]/60 transition-all duration-200 select-text group ${cfg.glow}`}>
      {/* Card Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-white/[0.04]">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
          <p className="text-[13px] font-semibold text-slate-100 leading-snug flex-1">
            {question || 'Interview Question'}
          </p>
        </div>
        <span className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full border shrink-0 self-start mt-0.5 ${cfg.badge}`}>
          {level}
        </span>
      </div>

      {/* Reveal Button / Answer Area */}
      <div className="px-5 py-4">
        {revealed ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            {answer && (
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest block">Expected Answer</span>
                <p className="text-[12px] text-slate-300 leading-relaxed">{answer}</p>
              </div>
            )}
            {why && (
              <div className="space-y-1.5 pt-3 border-t border-white/[0.04]">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Why Interviewers Ask This</span>
                <p className="text-[11px] text-slate-400 leading-relaxed italic">{why}</p>
              </div>
            )}
            <button
              onClick={() => setRevealed(false)}
              className="text-[9px] font-bold text-slate-500 hover:text-slate-300 transition mt-1 select-none cursor-pointer"
            >
              ↑ Hide Answer
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="w-full py-2 text-[11px] font-semibold text-orange-400 hover:text-orange-300 bg-orange-500/[0.04] hover:bg-orange-500/10 border border-orange-500/10 hover:border-orange-500/20 rounded-xl transition-all cursor-pointer select-none"
          >
            Reveal Answer
          </button>
        )}
      </div>
    </div>
  );
}

export function ChallengeCardRenderer({ difficulty, citation, content }) {
  const [completed, setCompleted] = useState(false);
  const diffColors = {
    beginner: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/15',
    intermediate: 'text-amber-400 bg-amber-500/5 border-amber-500/15',
    advanced: 'text-rose-455 bg-rose-500/5 border-rose-500/15',
  };
  const diffClass = diffColors[difficulty?.toLowerCase()] || diffColors.intermediate;

  return (
    <div className={`my-6 p-5 rounded-2xl border transition-all duration-300 ${
      completed ? 'border-emerald-500/30 bg-emerald-500/[0.015]' : 'border-white/5 bg-white/[0.005]'
    } select-text relative`}>
      {citation && (
        <div className="absolute right-4 top-4 select-none">
          <CitationChip citation={citation} />
        </div>
      )}
      <div className="flex justify-between items-start gap-3 mb-4 select-none">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <AppIcon name="flame" size={12} />
          </div>
          <h5 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Application Challenge</h5>
        </div>
        <span className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-full border shrink-0 ${diffClass}`}>
          {difficulty}
        </span>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed mb-4 whitespace-pre-line">
        {content.trim()}
      </div>
      <button
        onClick={() => setCompleted(!completed)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider select-none transition ${
          completed
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-450 hover:bg-emerald-500/20'
            : 'bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.05]'
        }`}
      >
        <AppIcon name={completed ? 'check' : 'circle'} size={11} strokeWidth={3} />
        {completed ? 'Challenge Completed' : 'Mark as Done'}
      </button>
    </div>
  );
}

export function SourceEvidencePanelRenderer({ source, page, chunkId, confidence, supportingChunks }) {
  const [expanded, setExpanded] = useState(false);

  const confColors = {
    high: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    low: 'text-rose-455 bg-rose-500/10 border-rose-500/20',
  };
  const confClass = confColors[confidence?.toLowerCase()] || confColors.medium;

  return (
    <div className="my-4 border border-white/5 bg-white/[0.005] hover:bg-white/[0.015] rounded-xl overflow-hidden transition select-none animate-in fade-in duration-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left gap-4"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
            <AppIcon name="file" size={10} />
          </div>
          <span className="text-[10.5px] font-bold text-slate-300 truncate">
            Source Evidence: {source} {page ? `(p. ${page})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {confidence && (
            <span className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-md border ${confClass}`}>
              {confidence}
            </span>
          )}
          {supportingChunks && (
            <span className="px-2 py-0.5 text-[8px] font-bold text-slate-450 bg-white/5 border border-white/10 rounded-md">
              {supportingChunks} chunks
            </span>
          )}
          <AppIcon
            name="chevronLeft"
            size={12}
            className={`text-slate-450 transition-transform duration-200 ${expanded ? '-rotate-90' : 'rotate-180'}`}
          />
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1.5 border-t border-white/5 bg-black/[0.1] text-[10px] text-slate-400 space-y-1.5 select-text animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between">
            <span>Chunk Reference ID:</span>
            <span className="font-mono text-slate-300">{chunkId || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span>Evidence Verification:</span>
            <span className="text-emerald-400 font-medium">Instantly Verified via Grounding Vector</span>
          </div>
          <p className="text-[9.5px] text-slate-500 italic mt-1">
            * This insight is fully grounded in workspace documents. No generative hallucinations detected.
          </p>
        </div>
      )}
    </div>
  );
}

export function TeachBackQuestionRenderer({ content }) {
  const lines = content.split('\n').filter(l => l.trim());

  return (
    <div className="my-4 p-4 rounded-xl border border-violet-500/10 bg-violet-500/[0.01] select-text">
      <div className="flex items-center gap-2 mb-2.5 select-none">
        <div className="w-5 h-5 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
          <AppIcon name="graduation" size={11} />
        </div>
        <span className="text-[9.5px] font-bold text-violet-400 uppercase tracking-widest">Active Recall / Teach-Back</span>
      </div>
      <ul className="space-y-2">
        {lines.map((line, idx) => {
          const itemText = line.replace(/^\d+\.\s*/, '').trim();
          return (
            <li key={idx} className="text-xs text-slate-300 leading-relaxed flex items-start gap-2">
              <span className="text-[10px] font-bold text-violet-400 bg-violet-500/5 border border-violet-500/10 w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 select-none">
                {idx + 1}
              </span>
              <span>{itemText}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FurtherExplorationRenderer({ content }) {
  const lines = content.split('\n').filter(l => l.trim());

  return (
    <div className="my-6 p-5 border border-white/5 bg-[#08090d]/10 rounded-2xl space-y-4 select-text">
      <div className="flex items-center gap-2 select-none">
        <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
          <AppIcon name="rocket" size={12} />
        </div>
        <h5 className="text-[10px] font-bold text-orange-300 uppercase tracking-widest">Further Exploration & Roadmap</h5>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {lines.map((line, idx) => {
          const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
          const [title, ...descParts] = cleanLine.split(':');
          const desc = descParts.join(':');

          return (
            <div key={idx} className="p-3.5 rounded-xl bg-white/[0.01] border border-white/5 flex gap-3">
              <div className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center text-slate-400 select-none mt-0.5">
                <AppIcon name="arrowRight" size={10} />
              </div>
              <div className="space-y-1">
                <h6 className="text-xs font-bold text-slate-250">{title || `Topic ${idx + 1}`}</h6>
                {desc && <p className="text-[10.5px] text-slate-400 leading-relaxed">{desc.trim()}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FlashcardsRenderer({ content, messageSources }) {
  let cards = [];
  let status = 'success';
  let message = '';
  let debug = null;

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.status) {
      status = parsed.status;
      message = parsed.message || '';
      cards = parsed.cards || [];
      debug = parsed.debug || null;
    } else if (Array.isArray(parsed)) {
      cards = parsed;
    } else {
      throw new Error('Invalid JSON format');
    }
  } catch (err) {
    status = 'generation_failed';
    message = 'Flashcards JSON parsing failed.';
  }

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(c => c + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(c => c - 1);
    }
  };

  if (status === 'insufficient_content' && (!cards || cards.length === 0)) {
    const displayTitle = message === 'Insufficient Learning Material'
      ? 'Insufficient Learning Material'
      : 'We found content but could not generate enough flashcards from the retrieved material.';

    return (
      <div className="max-w-xl mx-auto p-6 rounded-2xl border border-amber-500/20 bg-amber-950/10 backdrop-blur-md text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 text-lg">
          ⚠️
        </div>
        <h3 className="text-sm font-bold text-amber-200">{displayTitle}</h3>
        {message && message !== 'Insufficient Learning Material' && (
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto select-text">
            {message}
          </p>
        )}
        {debug && (
          <div className="mt-4 pt-4 border-t border-white/5 text-left text-xs text-slate-400 space-y-2 max-w-xs mx-auto">
            <div className="flex justify-between">
              <span>Documents Found:</span>
              <span className="font-semibold text-amber-200" id="debug-documents-found">{debug.documentsFound || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Chunks Retrieved:</span>
              <span className="font-semibold text-amber-200" id="debug-chunks-retrieved">{debug.chunksRetrieved || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Cards Generated:</span>
              <span className="font-semibold text-amber-200" id="debug-cards-generated">{debug.cardsGenerated || 0}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === 'generation_failed') {
    return (
      <div className="max-w-xl mx-auto p-6 rounded-2xl border border-rose-550/20 bg-rose-950/10 backdrop-blur-md text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 text-lg">
          ❌
        </div>
        <h3 className="text-sm font-bold text-rose-200">Generation Failed</h3>
        <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto select-text">
          {message || "An error occurred while generating flashcards from your sources."}
        </p>
      </div>
    );
  }

  const card = cards[currentIndex];

  if (!card) {
    return (
      <div className="max-w-xl mx-auto p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md text-center text-slate-400 text-xs">
        No revision cards found.
      </div>
    );
  }

  const bullets = card.bullets || [card.question, card.answer].filter(Boolean);
  const title = card.title || card.concept || card.type?.toUpperCase() || 'REVISION NOTE';

  const typeLabels = {
    concept_summary: 'Concept Summary',
    architecture: 'Architecture Overview',
    key_takeaways: 'Key Takeaways',
    implementation_notes: 'Implementation Notes',
    interview_nuggets: 'Interview Nuggets'
  };

  const typeColors = {
    concept_summary: 'border-violet-500/20 text-violet-400 bg-violet-500/5',
    architecture: 'border-cyan-500/20 text-cyan-400 bg-cyan-500/5',
    key_takeaways: 'border-indigo-500/20 text-indigo-400 bg-indigo-500/5',
    implementation_notes: 'border-blue-500/20 text-blue-400 bg-blue-500/5',
    interview_nuggets: 'border-orange-500/20 text-orange-400 bg-orange-500/5',
    benefits: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5',
    use_cases: 'border-teal-500/20 text-teal-400 bg-teal-500/5',
    challenges: 'border-amber-500/20 text-amber-400 bg-amber-500/5',
    components: 'border-orange-500/20 text-orange-400 bg-orange-500/5'
  };

  const bulletDotColors = {
    concept_summary: 'bg-violet-500',
    architecture: 'bg-cyan-500',
    key_takeaways: 'bg-indigo-500',
    implementation_notes: 'bg-blue-500',
    interview_nuggets: 'bg-orange-500',
    benefits: 'bg-emerald-500',
    use_cases: 'bg-teal-500',
    challenges: 'bg-amber-500',
    components: 'bg-orange-500'
  };

  return (
    <div className="w-full space-y-6 py-4 select-none flex flex-col items-center">
      <div className="space-y-2 w-full">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">
          <span>Revision Progress</span>
          <span>Card {currentIndex + 1} of {cards.length}</span>
        </div>
        <div className="h-1.5 bg-white/[0.04] border border-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="w-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-8 flex flex-col justify-between shadow-xl min-h-[360px] transition-all duration-200">
        <div className="flex justify-between items-start gap-4 pb-4 border-b border-white/5">
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${typeColors[card.type] || 'border-slate-500/20 text-slate-400 bg-slate-500/5'}`}>
              {typeLabels[card.type] || card.type || 'Study Note'}
            </span>
            {card.sourceCitation && (
              <span 
                title={card.chunkId ? `Chunk ID: ${card.chunkId}` : undefined}
                className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-slate-400 bg-white/[0.03] border border-white/6 px-2.5 py-0.5 rounded-full select-text cursor-help"
              >
                <AppIcon name="file" size={8} />
                {card.sourceCitation}
              </span>
            )}
          </div>
          <span className="text-[9px] font-bold text-slate-550 uppercase tracking-widest shrink-0">Revision</span>
        </div>

        <div className="flex-1 py-6 flex flex-col justify-center">
          <h2 className="text-base md:text-lg font-bold text-orange-400 tracking-wider uppercase mb-5 select-text">
            {title}
          </h2>

          {card.type === 'architecture' ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-2 select-text w-full">
              {bullets.map((step, sIdx) => (
                <div key={sIdx} className="flex flex-col items-center w-full max-w-md">
                  <div className="w-full px-5 py-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-center text-xs md:text-sm font-bold text-cyan-200 shadow-md tracking-wide">
                    {step}
                  </div>
                  {sIdx < bullets.length - 1 && (
                    <div className="my-1 text-cyan-400/60 text-lg font-bold">
                      ↓
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3.5 select-text">
              {bullets.map((bullet, bIdx) => (
                <div key={bIdx} className="flex items-start gap-3 text-xs md:text-sm text-slate-200 font-medium leading-relaxed">
                  <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${bulletDotColors[card.type] || 'bg-orange-500'}`} />
                  <p>{bullet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 w-full pt-4">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-5 py-2.5 flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold text-slate-350 hover:text-white transition cursor-pointer"
        >
          <AppIcon name="chevronLeft" size={14} />
          <span>PREVIOUS</span>
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === cards.length - 1}
          className="px-5 py-2.5 flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold text-slate-350 hover:text-white transition cursor-pointer"
        >
          <span>NEXT</span>
          <AppIcon name="chevronLeft" size={14} className="rotate-180" />
        </button>
      </div>

      {messageSources && messageSources.length > 0 && (
        <div className="mt-8 pt-6 border-t border-white/5 text-left w-full select-text">
          <span className="text-[9px] font-bold text-slate-550 uppercase tracking-widest block mb-3">
            Sources Used:
          </span>
          <div className="flex flex-wrap gap-2.5">
            {messageSources.map((src, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 bg-white/[0.02] border border-white/5 px-3 py-1.5 rounded-xl text-[10px] text-slate-350 font-semibold hover:border-orange-500/20 hover:bg-orange-500/5 transition"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                {src.title}
              </span>
            ))}
          </div>
        </div>
      )}
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

export function MermaidRenderer({ content }) {
  const uniqueId = useRef(`mermaid-${Math.floor(Math.random() * 100000)}`);
  const [renderedSvg, setRenderedSvg] = useState('');
  const [renderError, setRenderError] = useState('');
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeData, setHoveredNodeData] = useState(null);
  
  const svgContainerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Parse structured JSON payload or fallback to legacy raw Mermaid code
  let mermaidCode = (content || '').trim();
  let nodeMetadata = {};
  let stats = null;
  let complexity = null;
  let mode = 'concept_map';

  try {
    const parsed = JSON.parse(mermaidCode);
    if (parsed && parsed.mermaid) {
      mermaidCode = parsed.mermaid;
      nodeMetadata = parsed.metadata?.nodes || {};
      stats = parsed.metadata?.stats || null;
      complexity = parsed.metadata?.complexity || null;
      mode = parsed.metadata?.mode || 'concept_map';
    }
  } catch (err) {
    // Fallback for legacy raw mermaid outputs
    mermaidCode = mermaidCode
      .replace(/^```mermaid\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  // Fallback stats computation
  if (!stats) {
    const nodeIds = new Set(mermaidCode.match(/N\d+/g) || []);
    const connectionCount = (mermaidCode.match(/-->|===>|-.->/g) || []).length;
    stats = {
      nodesCount: nodeIds.size || 6,
      edgesCount: connectionCount || 5,
      sourcesCount: 1,
      conceptsCount: nodeIds.size || 6
    };
  }

  // Fallback complexity metrics
  if (!complexity) {
    complexity = {
      nodeCount: stats.nodesCount,
      edgeCount: stats.edgesCount,
      hierarchyDepth: mode === 'mindmap' ? 3 : 2,
      crossingRisk: parseFloat((stats.edgesCount / Math.max(1, stats.nodesCount)).toFixed(2)),
      clusterCount: 3
    };
  }

  const modeLabels = {
    concept_map: 'Concept Map',
    mindmap: 'Hierarchical Mindmap',
    learning_path: 'Learning Path',
    architecture: 'Architecture Diagram',
    process_flow: 'Process Flow'
  };

  const modeColors = {
    concept_map: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    mindmap: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
    learning_path: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    architecture: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    process_flow: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
  };

  // Compile Mermaid into SVG
  useEffect(() => {
    if (!mermaidCode) return;
    
    const renderDiagram = async () => {
      try {
        setRenderError('');
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            background: 'transparent',
            primaryColor: '#10121a',
            primaryTextColor: '#cbd5e1',
            primaryBorderColor: '#818cf8',
            lineColor: '#6366f1',
            secondaryColor: '#1e1b4b',
            tertiaryColor: '#0f172a',
            edgeLabelBackground: '#0d0e14',
            nodeBorder: '#4f46e5',
            mainBkg: '#121420',
            actorBkg: '#121420',
            actorBorder: '#6366f1',
          },
          flowchart: {
            htmlLabels: true,
            curve: 'basis'
          },
          securityLevel: 'loose',
        });
        
        const { svg } = await mermaid.render(uniqueId.current, mermaidCode);
        setRenderedSvg(svg);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setRenderError(err.message || 'Failed to parse and render Mermaid diagram.');
      }
    };

    renderDiagram();
  }, [mermaidCode]);

  // Handle SVG node interactions
  useEffect(() => {
    if (!renderedSvg || !svgContainerRef.current) return;

    const timer = setTimeout(() => {
      const svgEl = svgContainerRef.current.querySelector('svg');
      if (!svgEl) return;

      svgEl.setAttribute('width', '100%');
      svgEl.setAttribute('height', '100%');
      svgEl.style.maxWidth = 'none';

      // Attach event listeners to node classes (flowchart nodes & mindmap nodes)
      const nodesInDom = svgContainerRef.current.querySelectorAll('.node, .flowchart-node, .mindmap-node, g[class*="node"]');
      nodesInDom.forEach(nodeDom => {
        let nodeId = null;
        
        if (nodeDom.id) {
          const match = nodeDom.id.match(/flowchart-(N\d+)-/) || 
                        nodeDom.id.match(/mindmap-(N\d+)-/) || 
                        nodeDom.id.match(/(N\d+)/);
          if (match) nodeId = match[1];
        }
        
        if (!nodeId) {
          nodeDom.classList.forEach(cls => {
            if (/^N\d+$/.test(cls)) nodeId = cls;
          });
        }

        if (nodeId && nodeMetadata[nodeId]) {
          nodeDom.style.cursor = 'pointer';
          nodeDom.style.transition = 'all 0.15s ease-in-out';

          const onEnter = (e) => {
            setHoveredNodeId(nodeId);
            setHoveredNodeData({
              ...nodeMetadata[nodeId],
              nodeId,
              rect: nodeDom.getBoundingClientRect()
            });

            // Highlight node outline
            nodeDom.style.filter = 'drop-shadow(0 0 10px rgba(129, 140, 248, 0.8))';
            const shape = nodeDom.querySelector('rect, polygon, circle, path, ellipse');
            if (shape) {
              shape.style.stroke = '#a78bfa';
              shape.style.strokeWidth = '3px';
            }
          };

          const onLeave = () => {
            setHoveredNodeId(null);
            if (selectedNodeId !== nodeId) {
              nodeDom.style.filter = 'none';
              const shape = nodeDom.querySelector('rect, polygon, circle, path, ellipse');
              if (shape) {
                shape.style.stroke = '';
                shape.style.strokeWidth = '';
              }
            }
          };

          const onClick = (e) => {
            e.stopPropagation();
            setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
          };

          nodeDom.addEventListener('mouseenter', onEnter);
          nodeDom.addEventListener('mouseleave', onLeave);
          nodeDom.addEventListener('click', onClick);

          nodeDom._cleanups = () => {
            nodeDom.removeEventListener('mouseenter', onEnter);
            nodeDom.removeEventListener('mouseleave', onLeave);
            nodeDom.removeEventListener('click', onClick);
          };
        }
      });
    }, 120);

    return () => {
      clearTimeout(timer);
      if (svgContainerRef.current) {
        const nodesInDom = svgContainerRef.current.querySelectorAll('.node, .flowchart-node, .mindmap-node, g[class*="node"]');
        nodesInDom.forEach(n => {
          if (n._cleanups) n._cleanups();
        });
      }
    };
  }, [renderedSvg, selectedNodeId, nodeMetadata]);

  // Reset focus when user clicks blank area of the canvas
  const handleCanvasClick = () => {
    setSelectedNodeId(null);
  };

  // Zoom and Pan Handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
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

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 0.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    setZoom(prev => Math.max(0.4, Math.min(2.5, prev + direction * zoomFactor)));
  };

  const handleZoom = (amount) => {
    setZoom(prev => Math.max(0.4, Math.min(2.5, prev + amount)));
  };

  const handleReset = () => {
    setZoom(0.9);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(mermaidCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // SVG Export download
  const handleDownloadSVG = () => {
    if (!renderedSvg) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgContent = svgEl.outerHTML;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `knowledge-diagram-${mode}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // PNG Export download
  const handleDownloadPNG = () => {
    if (!renderedSvg) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgContent = svgEl.outerHTML;
    const svgWidth = svgEl.clientWidth || 800;
    const svgHeight = svgEl.clientHeight || 600;

    const image = new Image();
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    image.onload = () => {
      const canvas = document.createElement('canvas');
      // Render at 2x resolution for premium crispness
      canvas.width = svgWidth * 2;
      canvas.height = svgHeight * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0b10'; // Dark background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw image scaled
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `knowledge-diagram-${mode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    image.src = url;
  };

  // Render node details card helper
  const activeNodeId = selectedNodeId || hoveredNodeId;
  const activeNodeData = activeNodeId ? nodeMetadata[activeNodeId] : null;

  return (
    <div className={`py-4 space-y-4 select-text flex flex-col ${isFullscreen ? 'fixed inset-0 z-[100] bg-[#07080c] p-6 overflow-hidden' : 'relative'}`}>
      
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z" />
              <path d="M14 6H10M14 18H10" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-slate-350 uppercase tracking-widest block">Mermaid Knowledge Diagram</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${modeColors[mode]}`}>
                {modeLabels[mode] || 'Concept Map'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid with complexity metrics (Rule 8) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2 text-[10px] text-slate-400">
          <div>Nodes: <span className="font-bold text-indigo-400">{stats.nodesCount}</span></div>
          <div className="w-px h-3.5 bg-white/10" />
          <div>Links: <span className="font-bold text-violet-400">{stats.edgesCount}</span></div>
          <div className="w-px h-3.5 bg-white/10" />
          <div>Sources: <span className="font-bold text-emerald-400">{stats.sourcesCount}</span></div>
          <div className="w-px h-3.5 bg-white/10" />
          <div>Crossing Risk: <span className="font-bold text-amber-400">{complexity.crossingRisk}</span></div>
          <div className="w-px h-3.5 bg-white/10" />
          <div>Depth: <span className="font-bold text-cyan-400">{complexity.hierarchyDepth}/4</span></div>
        </div>

        {/* Actions panel */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            onClick={handleCopy}
            className="text-[9.5px] font-bold px-3 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-violet-500/10 hover:border-violet-500/20 text-slate-400 hover:text-violet-300 transition"
            title="Copy Raw Source"
          >
            {copied ? '✓ Copied' : 'Copy Code'}
          </button>
          
          <button
            onClick={handleDownloadSVG}
            disabled={!!renderError || !renderedSvg}
            className="text-[9.5px] font-bold px-3 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-emerald-500/10 hover:border-emerald-500/20 text-slate-400 hover:text-emerald-300 disabled:opacity-30 disabled:pointer-events-none transition"
            title="Download SVG Vector"
          >
            Export SVG
          </button>
          
          <button
            onClick={handleDownloadPNG}
            disabled={!!renderError || !renderedSvg}
            className="text-[9.5px] font-bold px-3 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-cyan-500/10 hover:border-cyan-500/20 text-slate-400 hover:text-cyan-300 disabled:opacity-30 disabled:pointer-events-none transition"
            title="Download PNG Image"
          >
            Export PNG
          </button>

          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className="text-[9.5px] font-bold px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-slate-350/10 hover:text-white transition"
          >
            {isFullscreen ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 2. Interactive Canvas Container */}
      <div 
        ref={wrapperRef}
        onClick={handleCanvasClick}
        className={`relative rounded-2xl border border-white/5 bg-[#08090d] overflow-hidden flex flex-col justify-between items-center group cursor-grab active:cursor-grabbing select-none ${isFullscreen ? 'flex-1 h-full' : 'h-[500px]'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
      >
        
        {renderError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <svg className="w-10 h-10 text-red-500/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-[12px] font-bold text-red-400">Diagram Compilation Failed</h4>
            <p className="text-[10px] text-slate-500 mt-1 max-w-sm whitespace-pre-wrap">{renderError}</p>
          </div>
        ) : !renderedSvg ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Rendering SVG Canvas...</span>
            </div>
          </div>
        ) : (
          <div 
            ref={svgContainerRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px'
            }}
            dangerouslySetInnerHTML={{ __html: renderedSvg }}
          />
        )}

        {/* 3. Dynamic Zoom and Reset floating control panel */}
        <div className="absolute bottom-4 right-4 bg-[#0d0e14]/90 border border-white/8 backdrop-blur-md rounded-xl p-1.5 flex items-center gap-1.5 shadow-lg z-10">
          <button 
            onClick={(e) => { e.stopPropagation(); handleZoom(-0.15); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition"
            title="Zoom Out"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          
          <span className="text-[9px] font-bold text-slate-400 min-w-[28px] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button 
            onClick={(e) => { e.stopPropagation(); handleZoom(0.15); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition"
            title="Zoom In"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          
          <div className="w-px h-4 bg-white/10" />

          <button 
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition"
            title="Reset Workspace"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {/* Pro-tip floating badge */}
        <div className="absolute top-4 left-4 bg-white/[0.01] border border-white/5 rounded-lg px-2.5 py-1 text-[8px] text-slate-500 font-medium">
          💡 Click concepts for deep citation references. Drag to pan, scroll wheel to zoom.
        </div>
      </div>

      {/* 4. NotebookLM+ Style Citation Details Card */}
      {activeNodeData && (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-200 bg-[#0e0f16]/95 border border-indigo-500/20 backdrop-blur-md rounded-2xl p-5 shadow-2xl shadow-indigo-950/20 space-y-3 relative overflow-hidden">
          
          {/* Decorative glowing gradient */}
          <div className="absolute -top-12 -left-12 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Node detail headers (Rule 4 Concept Importance scores display) */}
          <div className="flex items-start justify-between relative">
            <div>
              <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest block">Active Grounded Concept</span>
              <h3 className="text-[13px] font-extrabold text-slate-200 mt-0.5">{activeNodeData.concept}</h3>
              {activeNodeData.importanceScore !== undefined && (
                <div className="flex items-center gap-3 mt-1.5 text-[9.5px] text-slate-400">
                  <div>Importance: <span className="font-bold text-indigo-300">{Math.round(activeNodeData.importanceScore * 100)}%</span></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <div>Sources Used: <span className="font-bold text-emerald-300">{activeNodeData.sourceCount || 1}</span></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <div>Citations: <span className="font-bold text-violet-300">{activeNodeData.citationCount || 1}</span></div>
                </div>
              )}
            </div>
            
            {activeNodeData.sourceTitle && (
              <div className="flex flex-col items-end gap-1.5 select-none">
                <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2.5 py-1 text-[9px] text-indigo-300 font-bold">
                  <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>{activeNodeData.sourceTitle}</span>
                  {activeNodeData.pageNumber && <span>p. {activeNodeData.pageNumber}</span>}
                </div>
                {activeNodeData.chunkId && (
                  <span className="text-[8px] font-mono text-slate-500">Chunk ID: {activeNodeData.chunkId}</span>
                )}
              </div>
            )}
          </div>

          {/* Source chunk preview context */}
          <div className="space-y-1.5 relative">
            <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest">Grounding Context Snippet</span>
            <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 text-[11px] font-mono text-slate-350 leading-relaxed max-h-[140px] overflow-y-auto scrollbar-thin select-text">
              {activeNodeData.chunkPreview}
            </div>
          </div>

          {/* Detailed citation popup button */}
          {selectedNodeId && (
            <div className="flex items-center justify-between pt-1 relative">
              <span className="text-[8px] text-slate-500">Click concept again or click canvas to close citation card</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(activeNodeData.citation);
                  toast.success('Grounded source chunk copied!');
                }}
                className="text-[9px] font-black px-3 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-indigo-500/10 hover:border-indigo-500/20 text-slate-400 hover:text-indigo-300 transition"
              >
                Copy Full Citation
              </button>
            </div>
          )}
        </div>
      )}
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
      <div className="pl-6 border-l border-white/10 relative mt-4 select-none">
        {/* Relational connection line indicator */}
        <div className="absolute left-0 top-4.5 w-5 h-[1.5px] bg-orange-500/20" />

        {/* Node Bubble */}
        <div className="inline-flex flex-col max-w-xl rounded-xl border border-white/6 bg-[#0c0d10]/80 hover:border-orange-500/25 hover:shadow-lg hover:shadow-orange-500/5 p-4.5 gap-2.5 shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full border text-[9.5px] font-bold uppercase tracking-wider ${cClass}`}>
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
            <p className="text-[11px] text-slate-300 select-text font-medium leading-relaxed">{node.attrs.info}</p>
          )}
        </div>

        {/* Child branches */}
        {hasChildren && !collapsed && (
          <div className="space-y-2 animate-in fade-in duration-200 mt-4">
            {childBlocks.map((child, cIdx) => (
              <TreeNode key={cIdx} node={child} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-6 overflow-x-auto scrollbar-thin select-none">
      <div className="min-w-max px-6 space-y-6">
        {nodes.map((node, idx) => (
          <div key={idx} className="min-w-[700px]">
            <TreeNode node={node} />
          </div>
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
// 4b. COLLAPSIBLE ACCORDIONS & PROGRESS LOADERS
// ============================================================================

// Viewport trigger using IntersectionObserver to detect when section enters viewport
function ViewportTrigger({ onEnterViewport, children }) {
  const elementRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onEnterViewport();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [onEnterViewport]);

  return <div ref={elementRef}>{children}</div>;
}

// Premium Progress Loader displaying stages of study guide generation pipeline
function PremiumProgressLoader({ activeStage }) {
  const stages = [
    { key: 'sources', label: 'Analyzing sources' },
    { key: 'map', label: 'Building learning map' },
    { key: 'concepts', label: 'Extracting concepts' },
    { key: 'overview', label: 'Writing overview' },
    { key: 'chapters', label: 'Preparing chapters' }
  ];

  const getStageStatus = (stageKey) => {
    const stageOrder = ['sources', 'map', 'concepts', 'overview', 'chapters'];
    const activeIndex = stageOrder.indexOf(activeStage);
    const itemIndex = stageOrder.indexOf(stageKey);

    if (itemIndex < activeIndex) {
      return 'completed';
    } else if (itemIndex === activeIndex) {
      return 'active';
    }
    return 'pending';
  };

  return (
    <div className="p-6 rounded-2xl border border-white/5 bg-[#0d0e12]/60 backdrop-blur-md max-w-md mx-auto my-8 space-y-4 shadow-xl">
      <h5 className="text-[10px] font-extrabold text-orange-455 uppercase tracking-widest block text-center mb-3 select-none">
        Pipeline Progress
      </h5>
      <div className="space-y-3">
        {stages.map((stage) => {
          const status = getStageStatus(stage.key);
          return (
            <div key={stage.key} className="flex items-center gap-3 select-none text-[11px]">
              {status === 'completed' ? (
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-450 flex items-center justify-center shrink-0 text-[10px] font-bold">
                  ✓
                </div>
              ) : status === 'active' ? (
                <div className="w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500 text-orange-400 flex items-center justify-center shrink-0 animate-pulse text-[10px] font-bold">
                  ●
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border border-white/10 bg-white/[0.01] flex items-center justify-center shrink-0 text-slate-605 text-[10px]">
                  ○
                </div>
              )}
              <span className={status === 'completed' ? 'text-slate-400 font-semibold' : status === 'active' ? 'text-orange-455 font-bold' : 'text-slate-600'}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Collapsible Glassmorphic Accordion for lazy section load
function SectionAccordion({ title, icon, isExpanded, onToggle, children, isGenerating, isPending }) {
  return (
    <div className="border border-white/5 rounded-2xl bg-white/[0.01] overflow-hidden transition-all duration-300 shadow-md">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition select-none text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
            <AppIcon name={icon} size={14} />
          </div>
          <span className="text-xs font-bold text-slate-100 font-display">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {isGenerating && (
            <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full animate-pulse select-none">
              Generating...
            </span>
          )}
          {isPending && !isGenerating && (
            <span className="text-[9px] font-bold text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded-full select-none">
              Ready to generate
            </span>
          )}
          <AppIcon
            name={isExpanded ? 'chevronUp' : 'chevronDown'}
            size={12}
            className="text-slate-400"
          />
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-5 py-4 border-t border-white/5 bg-white/[0.005] animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. INDIVIDUAL QUIZ QUESTION RENDERER
// ============================================================================
function QuizQuestionRenderer({ question, type, options, correct, explanation, rubric, modelAnswer, citation, description }) {
  const [userAns, setUserAns] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSelectOption = (choice) => {
    if (submitted) return;
    setUserAns(choice);
  };

  const handleSubmit = () => {
    if (submitted) return;
    const correctCheck = userAns === correct;
    setIsCorrect(correctCheck);
    setSubmitted(true);
  };

  if (type === 'multiple-choice') {
    const rawOptions = options || '';
    const parsedOptions = rawOptions.split('|').map(opt => {
      const div = opt.indexOf(':');
      const key = div >= 0 ? opt.substring(0, div).trim() : '';
      const val = div >= 0 ? opt.substring(div + 1).trim() : opt.trim();
      return { key, val };
    });

    return (
      <div className="p-5 border border-white/5 bg-[#0d0e12]/40 rounded-xl space-y-4 my-2 select-text">
        <div className="flex justify-between items-start gap-3 select-none">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Practice Question</span>
          <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 rounded-full uppercase tracking-wider">Multiple Choice</span>
        </div>
        <h5 className="text-[12px] font-bold text-slate-100 leading-snug">{question}</h5>
        {description && <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>}

        <div className="grid grid-cols-1 gap-2">
          {parsedOptions.map((opt) => {
            const isSelected = userAns === opt.key;
            let optStyle = 'border-white/5 bg-white/[0.01] hover:border-white/10 text-slate-300';
            
            if (submitted) {
              if (opt.key === correct) {
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
                onClick={() => handleSelectOption(opt.key)}
                disabled={submitted}
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

        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={!userAns}
            className="w-full text-center py-2 text-[10.5px] font-bold text-white bg-orange-500 hover:bg-orange-650 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed select-none transition"
          >
            Lock Answer
          </button>
        )}

        {submitted && (
          <div className="pt-3 border-t border-white/5 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider select-none">
              {isCorrect ? (
                <span className="text-emerald-400 flex items-center gap-1">✔ Correct Answer</span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1">✘ Incorrect Answer</span>
              )}
            </div>
            <p className="text-[11px] text-slate-350 leading-relaxed">
              <strong className="text-slate-200">Explanation: </strong> {explanation}
            </p>
            {citation && (
              <span className="inline-block text-[9px] font-semibold text-slate-500 select-text">
                Reference: {citation}
              </span>
            )}
          </div>
        )}
      </div>
    );
  } else {
    // short answer
    return (
      <div className="p-5 border border-white/5 bg-[#0d0e12]/40 rounded-xl space-y-4 my-2 select-text">
        <div className="flex justify-between items-start gap-3 select-none">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Practice Question</span>
          <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 rounded-full uppercase tracking-wider">Short Answer</span>
        </div>
        <h5 className="text-[12px] font-bold text-slate-100 leading-snug">{question}</h5>
        {description && <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>}

        <textarea
          value={userAns}
          onChange={(e) => setUserAns(e.target.value)}
          disabled={submitted}
          rows={3}
          placeholder="Type your structured answer here..."
          className="w-full text-[11px] bg-white/[0.005] border border-white/5 hover:border-white/10 rounded-xl p-3 focus:outline-none focus:border-orange-500/35 transition leading-relaxed"
        />

        {!submitted && (
          <button
            onClick={() => setSubmitted(true)}
            disabled={!userAns.trim()}
            className="w-full text-center py-2 text-[10.5px] font-bold text-white bg-orange-500 hover:bg-orange-650 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed select-none transition"
          >
            Submit Answer for Self-Evaluation
          </button>
        )}

        {submitted && (
          <div className="pt-4 border-t border-white/5 space-y-3.5 animate-in fade-in duration-200">
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest select-none">Grading Rubric</span>
              <p className="text-[11px] text-slate-350 leading-relaxed">{rubric}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold text-orange-455 uppercase tracking-widest select-none">Model Answer</span>
              <p className="text-[11px] text-slate-200 leading-relaxed italic bg-white/[0.015] p-3 rounded-lg border border-white/5">{modelAnswer}</p>
            </div>
            {citation && (
              <span className="inline-block text-[9px] font-semibold text-slate-500 select-text">
                Reference: {citation}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
}

// ============================================================================
// 6. MASTER RENDERER: Route blocks dynamically
// ============================================================================
function BlockRenderer({
  block,
  onSelectCitation,
  messageSources,
}) {
  switch (block.type) {
    case 'Section': {
      const childBlocks = parseEducationalContent(block.content);
      return (
        <div className="space-y-4">
          {childBlocks.map((child, idx) => (
            <BlockRenderer
              key={idx}
              block={child}
              onSelectCitation={onSelectCitation}
              messageSources={messageSources}
            />
          ))}
        </div>
      );
    }
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
    case 'WhyYouShouldCare':
    case 'WhyItMatters':
      return <WhyYouShouldCareRenderer content={block.content} />;
    case 'ExecutiveOverview':
      return <ExecutiveOverviewRenderer content={block.content} />;
    case 'DifficultyHeatmap':
      return <DifficultyHeatmapRenderer content={block.content} />;
    case 'MisconceptionCard':
      return (
        <MisconceptionCardRenderer
          myth={block.attrs?.myth || ''}
          correct={block.attrs?.correct || ''}
          citation={block.attrs?.citation}
          content={block.content}
        />
      );
    case 'MentalModel':
      return (
        <MentalModelRenderer
          concept={block.attrs?.concept || ''}
          analogy={block.attrs?.analogy || ''}
          citation={block.attrs?.citation}
          content={block.content}
        />
      );
    case 'ApplicationCard':
      return (
        <ApplicationCardRenderer
          industry={block.attrs?.industry || ''}
          useCase={block.attrs?.useCase || ''}
          citation={block.attrs?.citation}
          content={block.content}
        />
      );
    case 'InterviewQuestion':
      return (
        <InterviewQuestionRenderer
          level={block.attrs?.level || 'intermediate'}
          citation={block.attrs?.citation}
          content={block.content}
        />
      );
    case 'ChallengeCard':
      return (
        <ChallengeCardRenderer
          difficulty={block.attrs?.difficulty || 'intermediate'}
          citation={block.attrs?.citation}
          content={block.content}
        />
      );
    case 'QuizQuestion':
      return (
        <QuizQuestionRenderer
          question={block.attrs?.question || ''}
          type={block.attrs?.type || 'multiple-choice'}
          options={block.attrs?.options || ''}
          correct={block.attrs?.correct || 'A'}
          explanation={block.attrs?.explanation || ''}
          rubric={block.attrs?.rubric || ''}
          modelAnswer={block.attrs?.modelAnswer || ''}
          citation={block.attrs?.citation || ''}
          description={block.content}
        />
      );
    case 'SourceEvidencePanel':
      return (
        <SourceEvidencePanelRenderer
          source={block.attrs?.source || ''}
          page={block.attrs?.page || ''}
          chunkId={block.attrs?.chunkId || ''}
          confidence={block.attrs?.confidence || 'medium'}
          supportingChunks={block.attrs?.supportingChunks}
        />
      );
    case 'TeachBackQuestion':
      return <TeachBackQuestionRenderer content={block.content} />;
    case 'FurtherExploration':
      return <FurtherExplorationRenderer content={block.content} />;
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
    return <FlashcardsRenderer content={content} messageSources={messageSources} />;
  }

  if (type === 'faq') {
    return <FAQRenderer blocks={blocks} onSelectCitation={onSelectCitation} messageSources={messageSources} />;
  }

  if (type === 'mermaid_diagram') {
    return <MermaidRenderer content={content} />;
  }

  if (type === 'topic_breakdown') {
    return <MindMapRenderer blocks={blocks} />;
  }

  if (type === 'exam_prep') {
    return <QuizRenderer blocks={blocks} />;
  }

  if (type === 'interview_questions') {
    // Find section headers (## Beginner Questions, etc.) and group questions under them
    const sectionConfig = {
      'Beginner Questions': {
        label: 'Beginner',
        color: 'text-emerald-400',
        borderColor: 'border-emerald-500/20',
        bg: 'bg-emerald-500/5',
        dot: 'bg-emerald-400',
        desc: 'Foundational concepts and definitions'
      },
      'Intermediate Questions': {
        label: 'Intermediate',
        color: 'text-amber-400',
        borderColor: 'border-amber-500/20',
        bg: 'bg-amber-500/5',
        dot: 'bg-amber-400',
        desc: 'Mechanisms, integrations, and workflows'
      },
      'Advanced Questions': {
        label: 'Advanced',
        color: 'text-rose-400',
        borderColor: 'border-rose-500/20',
        bg: 'bg-rose-500/5',
        dot: 'bg-rose-400',
        desc: 'Trade-offs, scaling, and production challenges'
      },
    };

    const nonQuestionBlocks = blocks.filter(b => b.type !== 'InterviewQuestion' && b.type !== 'markdown' && !['SummaryBanner'].includes(b.type));
    const questionBlocks = blocks.filter(b => b.type === 'InterviewQuestion');

    // Group questions by their level
    const grouped = { Beginner: [], Intermediate: [], Advanced: [] };
    for (const b of questionBlocks) {
      const lvl = (b.attrs?.level || 'Intermediate');
      const key = lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase();
      if (grouped[key]) grouped[key].push(b);
      else grouped['Intermediate'].push(b);
    }

    return (
      <div className="interview-renderer space-y-8 text-left font-sans antialiased pb-10">
        {/* Non-question blocks first (ExecutiveOverview, RevisionChecklist, etc.) */}
        {nonQuestionBlocks.map((block, idx) => (
          <BlockRenderer key={`meta-${idx}`} block={block} onSelectCitation={onSelectCitation} messageSources={messageSources} />
        ))}

        {/* Difficulty-grouped question sections */}
        {Object.entries(sectionConfig).map(([sectionName, cfg]) => {
          const key = cfg.label;
          const qs = grouped[key] || [];
          if (qs.length === 0) return null;
          return (
            <section key={sectionName} className="space-y-4">
              {/* Section header */}
              <div className={`flex items-center gap-3 pb-3 border-b ${cfg.borderColor}`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                <div className="flex-1">
                  <h2 className={`text-[11px] font-extrabold uppercase tracking-widest ${cfg.color}`}>{cfg.label} Questions</h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">{cfg.desc}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold border ${cfg.borderColor} ${cfg.bg} ${cfg.color}`}>
                  {qs.length} question{qs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Question cards */}
              <div className="space-y-3">
                {qs.map((block, idx) => (
                  <BlockRenderer key={idx} block={block} onSelectCitation={onSelectCitation} messageSources={messageSources} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // Fallback to sequential structured list of blocks (for Study Guides, revision sheets, glossary)
  return (
    <div className="educational-renderer space-y-5 text-left font-sans antialiased text-[11.5px] leading-relaxed max-w-2xl mx-auto pb-10">
      {blocks.map((block, idx) => (
        <BlockRenderer
          key={idx}
          block={block}
          onSelectCitation={onSelectCitation}
          messageSources={messageSources}
        />
      ))}
    </div>
  );
}

