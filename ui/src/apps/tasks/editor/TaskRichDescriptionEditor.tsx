// STATUS: PLATIN — safe Markdown source editor + DOM-rendered preview, no innerHTML
import React, { useRef, useState } from 'react';
import { Bold, Code2, Eye, Heading2, Italic, List, Pencil } from 'lucide-react';

interface TaskRichDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type WrapAction = { prefix: string; suffix: string; placeholder: string };

function renderInline(text: string): React.ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="px-1 py-0.5 rounded bg-slate-800 text-cyan-300">{part.slice(1, -1)}</code>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function Preview({ value }: { value: string }) {
  const lines = value.split('\n').slice(0, 2_000);
  return (
    <div className="min-h-[7rem] max-h-64 overflow-auto rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-300">
      {lines.map((line, index) => {
        if (line.startsWith('## ')) return <h3 key={index} className="mt-2 mb-1 font-bold text-blue-300">{renderInline(line.slice(3))}</h3>;
        if (line.startsWith('# ')) return <h2 key={index} className="mt-2 mb-1 text-sm font-bold text-slate-100">{renderInline(line.slice(2))}</h2>;
        if (/^\s*[-*+]\s+/.test(line)) return <div key={index} className="flex gap-2"><span aria-hidden="true">•</span><span>{renderInline(line.replace(/^\s*[-*+]\s+/, ''))}</span></div>;
        if (!line.trim()) return <div key={index} className="h-2" />;
        return <p key={index} className="whitespace-pre-wrap break-words leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

export const TaskRichDescriptionEditor: React.FC<TaskRichDescriptionEditorProps> = ({ value, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const wrapSelection = ({ prefix, suffix, placeholder }: WrapAction) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(next);
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const prefixLine = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const lineStart = value.lastIndexOf('\n', Math.max(0, el.selectionStart - 1)) + 1;
    onChange(`${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`);
    queueMicrotask(() => el.focus());
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/45 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-2 py-1.5">
        <div className="flex items-center gap-1" aria-label="Description formatting controls">
          <button type="button" onClick={() => wrapSelection({ prefix: '**', suffix: '**', placeholder: 'bold text' })} className="p-1.5 rounded hover:bg-white/10" aria-label="Bold" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => wrapSelection({ prefix: '*', suffix: '*', placeholder: 'italic text' })} className="p-1.5 rounded hover:bg-white/10" aria-label="Italic" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => wrapSelection({ prefix: '`', suffix: '`', placeholder: 'code' })} className="p-1.5 rounded hover:bg-white/10" aria-label="Inline code" title="Inline code"><Code2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => prefixLine('## ')} className="p-1.5 rounded hover:bg-white/10" aria-label="Heading" title="Heading"><Heading2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => prefixLine('- ')} className="p-1.5 rounded hover:bg-white/10" aria-label="List" title="List"><List className="w-3.5 h-3.5" /></button>
        </div>
        <button type="button" onClick={() => setPreview((current) => !current)} className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300 hover:bg-white/10">
          {preview ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? <Preview value={value} /> : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, 200_000))}
          rows={6}
          maxLength={200_000}
          placeholder="Context, acceptance criteria, Markdown formatting, workspace references..."
          className="w-full bg-slate-950 px-3 py-2 text-slate-100 outline-none resize-y text-xs leading-relaxed"
        />
      )}
    </div>
  );
};
