// STATUS: DIAMANT VGT SUPREME — bounded Markdown + stable-ID knowledge renderer
import React, { useState } from 'react';
import { CheckSquare, ExternalLink, Link2, Sparkles } from 'lucide-react';
import { extractMarkdownFootnotes, isMarkdownTableSeparator, sanitizeMarkdownHref, splitMarkdownTableRow } from './notesMarkdownEditing';
import { describeFencedCodeBlock, editMarkdownTable, setFencedCodeLanguage, type NoteTableOperation } from './notesTableEditing';
import { parseWikiReferences, type ParsedWikiReference, type ResolvedKnowledgeReference } from '../../knowledge-graph/notesKnowledgeGraph';
import { reportRichTextSecurityWarning, warnBeforeExternalRichTextOpen } from '../../../../platform/security/richTextLinkSecurity';

interface MarkdownRendererProps {
  content: string;
  onNavigateToPage: (pageTitleOrId: string) => void;
  onUpdateContent: (newContent: string) => void;
  resolveKnowledgeReference?: (reference: Pick<ParsedWikiReference, 'targetLabel' | 'anchor' | 'transclusion'>) => ResolvedKnowledgeReference | null;
  onConvertChecklistToTask?: (lineIndex: number) => void;
}

type KnowledgeResolver = NonNullable<MarkdownRendererProps['resolveKnowledgeReference']>;
const INLINE_PATTERN = /(!?\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\([^\)\n]+\)|\[\^[^\]\n]+\]|`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|==[^=\n]+==|<u>[^<\n]+<\/u>|\{color:#[0-9a-fA-F]{6}\}[^\n]+?\{\/color\}|\*[^*\n]+\*)/g;

function renderWikiReference(part: string, index: number, onNavigateToPage: (pageTitleOrId: string) => void, resolve?: KnowledgeResolver): React.ReactNode {
  const reference = parseWikiReferences(part)[0];
  if (!reference) return part;
  const resolved = resolve?.(reference) ?? null;
  const fallbackLabel = `${reference.targetLabel || 'Current page'}${reference.anchor ? `#${reference.anchor}` : ''}`;
  const label = reference.displayLabel || resolved?.title || fallbackLabel;
  if (reference.transclusion) {
    return <span key={index} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded mx-0.5 border text-[0.6875rem] ${resolved ? 'bg-purple-500/15 border-purple-500/30 text-purple-200' : 'bg-red-500/10 border-red-500/20 text-red-300'}`} title={resolved?.preview ?? `Unresolved transclusion: ${fallbackLabel}`}><Sparkles className="w-3 h-3" />{label}</span>;
  }
  if (resolve && !resolved) return <span key={index} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-300 text-[0.6875rem] mx-0.5" title={`Broken note link: ${fallbackLabel}`}><Link2 className="w-3 h-3" />{label}</span>;
  return <button key={index} type="button" onClick={(event) => { event.stopPropagation(); onNavigateToPage(resolved?.pageId ?? reference.targetLabel); }} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 hover:text-white text-[0.6875rem] font-medium mx-0.5" title={resolved?.preview ? `${resolved.title}${reference.anchor ? ` · ${reference.anchor}` : ''}\n${resolved.preview}` : `Jump to note: ${fallbackLabel}`}><Link2 className="w-3 h-3 text-blue-400" /><span>{label}</span>{reference.anchor && <span className="text-[0.5625rem] text-blue-500">#{reference.anchor}</span>}</button>;
}

export const renderInlineSpans = (text: string, onNavigateToPage: (pageTitleOrId: string) => void, resolve?: KnowledgeResolver): React.ReactNode => text.split(INLINE_PATTERN).filter((part) => part !== '').map((part, index) => {
  if ((part.startsWith('[[') || part.startsWith('![[')) && part.endsWith(']]')) return renderWikiReference(part, index, onNavigateToPage, resolve);
  const markdownLink = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdownLink) {
    const href = sanitizeMarkdownHref(markdownLink[2]);
    if (!href) {
      return <button key={index} type="button" onClick={() => reportRichTextSecurityWarning('Security warning: unsafe rich-text link was blocked.')} className="text-red-300" title="Unsafe or unsupported link">{markdownLink[1]}</button>;
    }
    const external = /^https?:/i.test(href);
    return <a key={index} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={(event) => { if (!warnBeforeExternalRichTextOpen(href)) event.preventDefault(); }} className="inline-flex items-center gap-1 text-cyan-300 underline underline-offset-2 hover:text-cyan-200">{markdownLink[1]}{external && <ExternalLink className="w-2.5 h-2.5" />}</a>;
  }
  const footnote = part.match(/^\[\^([^\]]+)\]$/);
  if (footnote) return <sup key={index} className="text-cyan-300 font-mono">[{footnote[1]}]</sup>;
  if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-white/10 font-mono text-[0.6875rem]">{part.slice(1, -1)}</code>;
  if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-bold text-slate-100">{part.slice(2, -2)}</strong>;
  if (part.startsWith('~~') && part.endsWith('~~')) return <del key={index} className="text-slate-400">{part.slice(2, -2)}</del>;
  if (part.startsWith('==') && part.endsWith('==')) return <mark key={index} className="bg-amber-300/25 text-amber-100 rounded px-0.5">{part.slice(2, -2)}</mark>;
  if (part.startsWith('<u>') && part.endsWith('</u>')) return <u key={index} className="underline-offset-2">{part.slice(3, -4)}</u>;
  const color = part.match(/^\{color:(#[0-9a-fA-F]{6})\}(.+)\{\/color\}$/);
  if (color) return <span key={index} style={{ color: color[1] }}>{color[2]}</span>;
  if (part.startsWith('*') && part.endsWith('*')) return <em key={index} className="italic text-slate-200">{part.slice(1, -1)}</em>;
  return part;
});

export const MarkdownPreview: React.FC<MarkdownRendererProps> = ({ content, onNavigateToPage, onUpdateContent, resolveKnowledgeReference, onConvertChecklistToTask }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  const footnotes = extractMarkdownFootnotes(content);
  // AST-0709: a refused table/code edit is named instead of silently doing nothing.
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const reportEdit = (message: string) => setEditNotice(message);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\[\^[^\]]+\]:/.test(line)) { index += 1; continue; }

    const transclusion = line.trim().match(/^!\[\[([^\]\n]{1,768})\]\]$/);
    if (transclusion) {
      const parsed = parseWikiReferences(line.trim())[0];
      const resolved = parsed && resolveKnowledgeReference ? resolveKnowledgeReference(parsed) : null;
      elements.push(<aside key={`embed-${index}`} className={`my-3 rounded-xl border p-3 ${resolved ? 'border-purple-500/25 bg-purple-500/[0.06]' : 'border-red-500/20 bg-red-500/[0.04]'}`}>
        <div className="flex items-center justify-between gap-2 mb-2"><span className={`text-[0.625rem] uppercase font-bold tracking-wider ${resolved ? 'text-purple-300' : 'text-red-300'}`}>Transclusion</span>{resolved && <button type="button" onClick={() => onNavigateToPage(resolved.pageId)} className="text-[0.625rem] text-blue-300 hover:text-white">Open source</button>}</div>
        <div className="text-xs font-semibold text-slate-200 mb-1">{resolved?.title ?? parsed?.targetLabel ?? transclusion[1]}</div>
        <pre className="whitespace-pre-wrap font-sans text-[0.6875rem] leading-relaxed text-slate-400 max-h-64 overflow-auto">{resolved?.preview ?? 'Referenced page or block could not be resolved.'}</pre>
      </aside>);
      index += 1; continue;
    }

    if (line.startsWith('```')) {
      // AST-0706: the fence keeps its own language control, so a code block can be edited without leaving
      // the live preview. The pure edit lives in `notesTableEditing`.
      const fenceStart = index;
      const language = line.slice(3).trim(); const buffer: string[] = []; index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) { buffer.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      elements.push(<div key={`code-${index}`} className="my-3 rounded-lg bg-black/60 border border-white/10 p-3 font-mono text-xs text-blue-300 overflow-x-auto relative">
        <div className="absolute top-2 right-2 flex items-center gap-1 text-[0.5625rem] text-slate-600 uppercase tracking-widest">
          <label className="sr-only" htmlFor={`notes-code-language-${fenceStart}`}>Code block language</label>
          <input
            id={`notes-code-language-${fenceStart}`}
            defaultValue={language}
            onBlur={(event) => {
              const result = setFencedCodeLanguage(content, fenceStart, event.target.value);
              if (result.ok) { if (result.content !== content) onUpdateContent(result.content); }
              else reportEdit(result.message);
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
            className="w-20 rounded border border-white/10 bg-slate-950/80 px-1 py-0.5 text-[0.5625rem] normal-case tracking-normal text-slate-300"
            aria-label={`Language of the code block starting on line ${fenceStart + 1}`}
          />
          <span aria-hidden="true">{describeFencedCodeBlock({ openLineIndex: fenceStart, closeLineIndex: index - 1, language }, buffer.join('\n'))}</span>
        </div>
        <pre>{buffer.join('\n')}</pre>
      </div>); continue;
    }

    const callout = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO)\]\s*(.*)$/i);
    if (callout) {
      const body = [callout[2]]; index += 1;
      while (index < lines.length && /^>\s?/.test(lines[index])) { body.push(lines[index].replace(/^>\s?/, '')); index += 1; }
      elements.push(<aside key={`callout-${index}`} className="my-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] p-3"><div className="text-[0.625rem] font-bold uppercase tracking-wider text-cyan-300 mb-1">{callout[1]}</div><div className="text-xs text-slate-300 leading-relaxed">{body.map((entry, i) => <React.Fragment key={i}>{renderInlineSpans(entry, onNavigateToPage, resolveKnowledgeReference)}{i < body.length - 1 && <br />}</React.Fragment>)}</div></aside>); continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) {
      // AST-0706: a table can be edited structurally from the preview. Every operation is bounded and a
      // refusal is reported instead of silently producing a malformed table.
      const tableStart = index;
      const header = splitMarkdownTableRow(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { rows.push(splitMarkdownTableRow(lines[index])); index += 1; }
      const applyTableOperation = (operation: NoteTableOperation) => {
        const result = editMarkdownTable(content, tableStart, operation);
        if (result.ok) { if (result.content !== content) onUpdateContent(result.content); return; }
        reportEdit(result.message);
      };
      elements.push(<div key={`table-${index}`} className="my-3 overflow-x-auto rounded-lg border border-white/10">
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-white/[0.02] px-2 py-1 text-[0.5625rem] text-slate-500" role="group" aria-label={`Table controls for the table starting on line ${tableStart + 1}`}>
          <span className="uppercase tracking-wider">Table {header.length}×{rows.length + 1}</span>
          <button type="button" onClick={() => applyTableOperation('add-row-below')} className="rounded border border-white/10 px-1.5 py-0.5 hover:text-slate-200" aria-label="Add table row">+ row</button>
          <button type="button" onClick={() => applyTableOperation('delete-row')} className="rounded border border-white/10 px-1.5 py-0.5 hover:text-slate-200" aria-label="Delete last table row">− row</button>
          <button type="button" onClick={() => applyTableOperation('add-column-right')} className="rounded border border-white/10 px-1.5 py-0.5 hover:text-slate-200" aria-label="Add table column">+ column</button>
          <button type="button" onClick={() => applyTableOperation('delete-column')} className="rounded border border-white/10 px-1.5 py-0.5 hover:text-slate-200" aria-label="Delete last table column">− column</button>
        </div>
        <table className="w-full border-collapse text-xs"><thead className="bg-slate-900"><tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border-b border-r border-white/10 px-2 py-1.5 text-left text-slate-200 font-semibold">{renderInlineSpans(cell, onNavigateToPage, resolveKnowledgeReference)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="odd:bg-white/[0.02]">{header.map((_, cellIndex) => <td key={cellIndex} className="border-t border-r border-white/[0.06] px-2 py-1.5 text-slate-300">{renderInlineSpans(row[cellIndex] ?? '', onNavigateToPage, resolveKnowledgeReference)}</td>)}</tr>)}</tbody></table>
      </div>); continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) { elements.push(<hr key={index} className="my-4 border-0 border-t border-white/15" />); index += 1; continue; }
    const checklist = line.match(/^(\s*)- \[([ xX])\] (.*)$/);
    if (checklist) {
      const checked = checklist[2].toLowerCase() === 'x';
      const currentIndex = index;
      const binding = checklist[3].match(/^(.*?)\s+\^(task-[A-Za-z0-9_-]{1,128})\s*$/);
      const visibleText = (binding ? binding[1] : checklist[3]).trim();
      elements.push(<div key={index} className="w-full flex items-start gap-2 my-1 text-xs group">
        <button type="button" onClick={() => { const updated = [...lines]; updated[currentIndex] = `${checklist[1]}- [${checked ? ' ' : 'x'}] ${checklist[3]}`; onUpdateContent(updated.join('\n')); }} className="flex items-start gap-2 min-w-0 flex-1 text-left">
          <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/20 bg-slate-900 group-hover:border-blue-400'}`}>{checked && <CheckSquare className="w-2.5 h-2.5" />}</span>
          <span className={checked ? 'line-through text-slate-500' : 'text-slate-300'}>{renderInlineSpans(visibleText, onNavigateToPage, resolveKnowledgeReference)}</span>
        </button>
        {binding ? <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[0.5625rem] text-emerald-300" title={`Linked canonical task ${binding[2]}`}>Task linked</span> : onConvertChecklistToTask ? <button type="button" onClick={() => onConvertChecklistToTask(currentIndex)} className="shrink-0 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[0.5625rem] text-cyan-300 hover:bg-cyan-500/20">Link Task</button> : null}
      </div>); index += 1; continue;
    }

    if (line.startsWith('# ')) { elements.push(<h1 key={index} className="text-xl md:text-2xl font-black text-slate-100 mt-5 mb-2 pb-1 border-b border-white/[0.08] tracking-tight">{renderInlineSpans(line.slice(2), onNavigateToPage, resolveKnowledgeReference)}</h1>); index += 1; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={index} className="text-base md:text-lg font-bold text-blue-300 mt-4 mb-1.5 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-blue-400" /><span>{renderInlineSpans(line.slice(3), onNavigateToPage, resolveKnowledgeReference)}</span></h2>); index += 1; continue; }
    if (line.startsWith('### ')) { elements.push(<h3 key={index} className="text-xs md:text-sm font-semibold text-slate-200 uppercase tracking-wider mt-3 mb-1">{renderInlineSpans(line.slice(4), onNavigateToPage, resolveKnowledgeReference)}</h3>); index += 1; continue; }
    if (line.startsWith('> ')) { elements.push(<blockquote key={index} className="border-l-2 border-blue-500/70 pl-3 my-2 text-xs italic text-slate-400 bg-blue-500/[0.03] py-1 rounded-r">{renderInlineSpans(line.slice(2), onNavigateToPage, resolveKnowledgeReference)}</blockquote>); index += 1; continue; }
    if (/^\s*[-*+]\s+/.test(line)) { elements.push(<li key={index} className="ml-4 text-xs text-slate-300 list-disc my-0.5">{renderInlineSpans(line.replace(/^\s*[-*+]\s+/, ''), onNavigateToPage, resolveKnowledgeReference)}</li>); index += 1; continue; }
    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (numbered) { elements.push(<div key={index} className="ml-4 text-xs text-slate-300 my-0.5 flex gap-2"><span className="font-mono text-blue-400">{numbered[1]}.</span><span>{renderInlineSpans(numbered[2], onNavigateToPage, resolveKnowledgeReference)}</span></div>); index += 1; continue; }
    if (!line.trim()) { elements.push(<div key={index} className="h-2" />); index += 1; continue; }
    elements.push(<p key={index} className="text-xs leading-relaxed text-slate-300 my-1">{renderInlineSpans(line, onNavigateToPage, resolveKnowledgeReference)}</p>); index += 1;
  }

  if (footnotes.size > 0) elements.push(<section key="footnotes" className="mt-6 pt-3 border-t border-white/10"><div className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500 mb-2">Footnotes</div>{Array.from(footnotes.entries()).map(([id, text]) => <div key={id} className="text-[0.6875rem] text-slate-400 mb-1"><sup className="text-cyan-300">[{id}]</sup> {renderInlineSpans(text, onNavigateToPage, resolveKnowledgeReference)}</div>)}</section>);
  if (editNotice) elements.push(<div key="edit-notice" role="status" aria-live="polite" className="mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[0.625rem] text-amber-200"><span>{editNotice}</span><button type="button" onClick={() => setEditNotice(null)} className="text-amber-300/80 hover:text-amber-100" aria-label="Dismiss table message">Dismiss</button></div>);
  return <>{elements}</>;
};
