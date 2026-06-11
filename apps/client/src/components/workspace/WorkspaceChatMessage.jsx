import { useState, useMemo } from 'react';
import AppIcon from '../AppIcon';
import CitationChip from './CitationChip';
import AdaptiveAnswerHeader, { parseResponseEnvelope } from './AdaptiveAnswerHeader';
import SourceInsightsPanel from './SourceInsightsPanel';
import ConfidenceExplainer from './ConfidenceExplainer';
import LearningPathSuggestions from './LearningPathSuggestions';
import {
  parseEducationalContent,
  PrerequisiteNotice,
  ChapterBlock,
  ConceptDefinitionCard,
  KeyInsightPanel,
  SummaryBanner,
  ExampleWalkthrough,
  FormulaCard,
  RevisionChecklist,
  PracticePromptCard,
} from './EducationalContentRenderer';

/**
 * Rich Markdown Renderer — transforms structured AI responses into
 * beautiful, readable, pedagogically-structured layouts.
 */

// ─── Inline Formatter ──────────────────────────────────────────────────────
function InlineContent({ text, onSelectCitation, messageSources }) {
  if (!text) return null;

  // Split by citations [...], bold (**...**), italic (*...*), inline code (`...`)
  const parts = [];
  let remaining = text;
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\])/g;
  let lastIndex = 0;
  let match;

  // Reset pattern
  pattern.lastIndex = 0;
  const allMatches = [...remaining.matchAll(pattern)];

  let cursor = 0;
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
            return <strong key={i} className="font-semibold text-slate-100">{part.value}</strong>;
          case 'italic':
            return <em key={i} className="italic text-slate-300">{part.value}</em>;
          case 'code':
            return (
              <code key={i} className="px-1.5 py-0.5 bg-white/[0.06] border border-white/8 rounded-md text-[11px] font-mono text-orange-300 mx-0.5">
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

// ─── Code Block with Copy ──────────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/8 bg-[#0b0c10] shadow-sm">
      {/* Code header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          </div>
          {lang && (
            <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest ml-1">
              {lang}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500 hover:text-slate-300 transition"
        >
          <AppIcon name={copied ? 'check' : 'copy'} size={9} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-4 text-[11px] font-mono text-slate-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── Markdown Table ────────────────────────────────────────────────────────
function MarkdownTable({ rows }) {
  if (!rows || rows.length < 2) return null;
  const headers = rows[0];
  const body = rows.slice(2); // skip separator row

  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-white/[0.03] border-b border-white/8">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-300 whitespace-nowrap">
                {h.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rIdx) => (
            <tr key={rIdx} className="border-b border-white/5 hover:bg-white/[0.02] transition">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-4 py-2.5 text-slate-400 align-top">
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

// ─── Block Section (## heading + content) ─────────────────────────────────
function SectionHeading({ level, text, onSelectCitation, messageSources }) {
  if (level === 2) {
    return (
      <div className="mt-5 mb-2 flex items-center gap-2.5">
        <div className="w-0.5 h-4 bg-orange-500 rounded-full shrink-0" />
        <h3 className="text-[13px] font-bold text-slate-100 leading-tight">
          <InlineContent text={text} onSelectCitation={onSelectCitation} messageSources={messageSources} />
        </h3>
      </div>
    );
  }
  return (
    <h4 className="mt-4 mb-1.5 text-[11px] font-bold text-slate-200 uppercase tracking-wide">
      <InlineContent text={text} onSelectCitation={onSelectCitation} messageSources={messageSources} />
    </h4>
  );
}

// ─── Standard Markdown Lines ────────────────────────────────────────────────
function StandardMarkdownLines({ content, onSelectCitation, messageSources, isStreaming }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
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
      const level = hashCount <= 2 ? 2 : 3;
      elements.push(
        <SectionHeading
          key={`heading-${i}`}
          level={level}
          text={headingText}
          onSelectCitation={onSelectCitation}
          messageSources={messageSources}
        />
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
        <blockquote key={`bq-${i}`} className="my-3 pl-4 border-l-2 border-orange-500/30 text-slate-400 italic text-[11px] leading-relaxed space-y-1">
          {quoteLines.map((l, li) => (
            <p key={li}>
              <InlineContent text={l} onSelectCitation={onSelectCitation} messageSources={messageSources} />
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Markdown table detection
    if (trimmed.includes('|') && i + 1 < lines.length && /^\|[-| ]+\|$/.test(lines[i + 1]?.trim())) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableLines.push(lines[i].trim().split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1));
        i++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} rows={tableLines} />);
      continue;
    }

    // Unordered list
    if (/^[-*•] /.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^[-*•] /.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•] /, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2.5 space-y-1.5 pl-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2.5 text-[12px] text-slate-300 leading-relaxed">
              <span className="w-1 h-1 rounded-full bg-orange-400 mt-2 shrink-0" />
              <span>
                <InlineContent text={item} onSelectCitation={onSelectCitation} messageSources={messageSources} />
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(trimmed)) {
      const listItems = [];
      let num = 1;
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        listItems.push({ num: num++, text: lines[i].trim().replace(/^\d+\. /, '') });
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2.5 space-y-1.5 pl-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-3 text-[12px] text-slate-300 leading-relaxed">
              <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
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

    // Empty line — paragraph separator
    if (!trimmed) {
      i++;
      continue;
    }

    // Default paragraph
    elements.push(
      <p key={`p-${i}`} className="text-[12px] text-slate-300 leading-[1.75] mb-2 break-words">
        <InlineContent text={trimmed} onSelectCitation={onSelectCitation} messageSources={messageSources} />
      </p>
    );
    i++;
  }

  return (
    <div className="rich-markdown-lines">
      {elements}
      {isStreaming && (
        <span className="inline-block w-[3px] h-3.5 bg-orange-400 ml-0.5 animate-pulse rounded-sm align-middle" />
      )}
    </div>
  );
}

// ─── Rich Markdown Parser (Supports custom XML pedagogical blocks) ──────────
function RichMarkdown({ content, onSelectCitation, messageSources, isStreaming }) {
  if (!content) return null;

  const blocks = parseEducationalContent(content);

  return (
    <div className="rich-markdown select-text space-y-4">
      {blocks.map((block, idx) => {
        const isLastBlock = idx === blocks.length - 1;

        if (block.type === 'markdown') {
          return (
            <StandardMarkdownLines
              key={idx}
              content={block.content}
              onSelectCitation={onSelectCitation}
              messageSources={messageSources}
              isStreaming={isStreaming && isLastBlock}
            />
          );
        }

        // Render custom pedagogical block natively in the chat stream
        switch (block.type) {
          case 'PrerequisiteNotice':
            return <PrerequisiteNotice key={idx} content={block.content} />;
          case 'ChapterBlock':
            return (
              <ChapterBlock
                key={idx}
                title={block.attrs?.title || 'Chapter'}
                content={block.content}
                onSelectCitation={onSelectCitation}
                messageSources={messageSources}
              />
            );
          case 'ConceptDefinitionCard':
            return (
              <ConceptDefinitionCard
                key={idx}
                term={block.attrs?.term || 'Term'}
                content={block.content}
                onSelectCitation={onSelectCitation}
                messageSources={messageSources}
              />
            );
          case 'KeyInsightPanel':
            return (
              <KeyInsightPanel
                key={idx}
                title={block.attrs?.title || 'Insight'}
                content={block.content}
                onSelectCitation={onSelectCitation}
                messageSources={messageSources}
              />
            );
          case 'SummaryBanner':
            return <SummaryBanner key={idx} content={block.content} />;
          case 'ExampleWalkthrough':
            return (
              <ExampleWalkthrough
                key={idx}
                title={block.attrs?.title || 'Example'}
                content={block.content}
                onSelectCitation={onSelectCitation}
                messageSources={messageSources}
              />
            );
          case 'FormulaCard':
            return (
              <FormulaCard
                key={idx}
                formula={block.attrs?.formula}
                explanation={block.attrs?.explanation}
                content={block.content}
              />
            );
          case 'RevisionChecklist':
            return <RevisionChecklist key={idx} content={block.content} />;
          case 'PracticePromptCard':
            return (
              <PracticePromptCard
                key={idx}
                question={block.attrs?.question || 'Practice Question'}
                answer={block.attrs?.answer || ''}
                difficulty={block.attrs?.difficulty || 'medium'}
                content={block.content}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Follow-up Suggestion Chips ────────────────────────────────────────────
function FollowUpSuggestions({ questions, onSendMessage }) {
  if (!questions?.length) return null;

  return (
    <div className="mt-4 pt-3 border-t border-white/5">
      <div className="flex items-center gap-1.5 mb-2.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
        <AppIcon name="lightbulb" size={9} />
        <span>Ask Next</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSendMessage?.(q)}
            className="text-[10px] text-slate-400 hover:text-orange-300 bg-white/[0.02] hover:bg-orange-500/8 border border-white/8 hover:border-orange-500/25 rounded-xl px-3 py-1.5 transition-all duration-150 text-left leading-tight max-w-[220px]"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Source Bibliography ───────────────────────────────────────────────────
function SourceBibliography({ sources, onSelectCitation }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources?.length) return null;

  const visible = expanded ? sources : sources.slice(0, 4);

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 mb-2.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-400 transition"
      >
        <AppIcon name="file" size={9} />
        <span>{sources.length} Source{sources.length !== 1 ? 's' : ''}</span>
        {sources.length > 4 && (
          <AppIcon name="chevronLeft" size={8} className={`transform transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`} />
        )}
      </button>
      <div className="flex flex-wrap gap-2">
        {visible.map((src, sIdx) => {
          const metaLabel = src.startTime != null
            ? `${Math.floor(src.startTime / 60)}:${String(Math.floor(src.startTime % 60)).padStart(2, '0')}`
            : `P. ${src.pageNumber || 1}`;
          const icon = src.sourceType === 'youtube' ? 'video' : src.sourceType === 'pdf' ? 'file' : 'alignLeft';

          return (
            <button
              key={sIdx}
              onClick={() => onSelectCitation?.({
                sourceId: src.sourceId,
                sourceTitle: src.sourceTitle,
                sourceType: src.sourceType,
                meta: metaLabel,
              })}
              className="flex items-center gap-2 bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-xl px-3 py-1.5 transition-all duration-150 max-w-[180px] min-w-[120px] group"
            >
              <div className="w-4 h-4 rounded-md bg-white/[0.03] border border-white/8 flex items-center justify-center text-slate-500 group-hover:text-orange-400 shrink-0 transition">
                <AppIcon name={icon} size={9} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <span className="text-[10px] font-medium text-slate-300 block truncate leading-tight">
                  {src.sourceTitle}
                </span>
                <span className="text-[8px] text-slate-500 block leading-none mt-0.5">
                  {metaLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trust Panel (Collapsible) ─────────────────────────────────────────────
function TrustPanel({ trustMetrics }) {
  const [open, setOpen] = useState(false);
  if (!trustMetrics) return null;

  const { confidenceLabel, groundingScore, citationAccuracy, coverage, warnings, metrics } = trustMetrics;
  const labelColors = {
    High: 'text-emerald-400 bg-emerald-500/8 border-emerald-500/15',
    Medium: 'text-amber-400 bg-amber-500/8 border-amber-500/15',
    Low: 'text-rose-400 bg-rose-500/8 border-rose-500/15',
  };
  const colors = labelColors[confidenceLabel] || labelColors.Medium;
  const barColor = { High: 'bg-emerald-500', Medium: 'bg-amber-500', Low: 'bg-rose-500' };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[9px] font-semibold text-slate-500 hover:text-slate-400 transition"
      >
        <AppIcon name="shield" size={9} />
        <span>Grounding Confidence</span>
        <span className={`px-1.5 py-0.5 rounded-full border text-[8px] font-bold ${colors}`}>
          {confidenceLabel}
        </span>
        <AppIcon name="chevronLeft" size={8} className={`transform transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="mt-2 p-3 bg-white/[0.01] border border-white/5 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Grounding', value: groundingScore },
              { label: 'Citations', value: citationAccuracy },
              { label: 'Coverage', value: coverage },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-slate-500 font-semibold">{label}</span>
                  <span className="text-[8px] text-slate-300 font-bold">{Math.round((value || 0) * 100)}%</span>
                </div>
                <div className="h-0.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${barColor[confidenceLabel] || 'bg-orange-500'}`}
                    style={{ width: `${(value || 0) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {warnings?.length > 0 && (
            <div className="pt-2 border-t border-white/5 space-y-1">
              {warnings.map((w, wi) => (
                <div key={wi} className="flex items-start gap-1.5 text-[9px] text-amber-400">
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main WorkspaceChatMessage ─────────────────────────────────────────────
export default function WorkspaceChatMessage({
  message,
  isStreaming = false,
  onSelectCitation,
  onSendMessage,
}) {
  const isUser = message.role === 'user';

  // Parse the response envelope only for AI messages
  // useMemo ensures we only re-parse when content changes
  const envelope = useMemo(() => {
    if (isUser || !message.content) return null;
    return parseResponseEnvelope(message.content);
  }, [isUser, message.content]);

  // Body content is the content with envelope markers stripped
  const bodyContent = envelope ? envelope.bodyContent : message.content;

  return (
    <div className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}>
      {/* AI Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 mt-1.5 relative overflow-hidden shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/15 to-transparent" />
          <AppIcon name="bot" size={13} className="relative z-10" />
        </div>
      )}

      {/* Message content */}
      <div className={`flex flex-col gap-2 ${isUser ? 'items-end max-w-xl' : 'items-start max-w-3xl w-full'}`}>
        {/* Bubble */}
        <div className={`w-full ${
          isUser
            ? 'px-2 py-1 text-right'
            : 'rounded-2xl px-5 py-4 bg-white/[0.015] border border-white/5 shadow-md hover:border-white/10 transition-colors duration-300'
        }`}>
          {isUser ? (
            <p className="text-[13px] font-semibold leading-relaxed text-slate-200 whitespace-pre-line break-words inline-block max-w-lg text-left bg-white/5 border border-white/5 rounded-2xl px-4 py-2.5">
              {message.content}
            </p>
          ) : (
            <>
              {/* ── V2: Adaptive Answer Header ─────────────────────────────
                  Renders: intent badge, level badge, TL;DR, key takeaways,
                  real-world analogy, and knowledge gap banner.
                  All parsed from the embedded response envelope markers.
              ── */}
              <AdaptiveAnswerHeader
                content={message.content}
                intent={message.questionIntent}
                level={message.learningLevel}
                isStreaming={isStreaming}
              />

              {/* ── V2: Source Insights Panel ──────────────────────────────
                  Shows "Key Insights From Your Sources" with cross-source
                  synthesis indicator when multiple docs are used.
              ── */}
              {envelope?.sourceInsights?.length > 0 && (
                <SourceInsightsPanel
                  insights={envelope.sourceInsights}
                  sourcesUsed={message.sources || []}
                />
              )}

              {/* ── Main Body (clean content with envelope markers stripped) */}
              <RichMarkdown
                content={bodyContent}
                onSelectCitation={onSelectCitation}
                messageSources={message.sources}
                isStreaming={isStreaming}
              />

              {/* ── Post-content sections — only when not streaming ── */}
              {!isStreaming && (
                <>
                  {/* V2: Learning Path Suggestions (replaces basic FollowUpSuggestions) */}
                  <LearningPathSuggestions
                    questions={message.followUpQuestions}
                    onSelect={onSendMessage}
                  />

                  {/* Source Bibliography (unchanged) */}
                  <SourceBibliography
                    sources={message.sources}
                    onSelectCitation={onSelectCitation}
                  />

                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-slate-400 shrink-0 mt-1.5 shadow-sm">
          <AppIcon name="user" size={13} />
        </div>
      )}
    </div>
  );
}

