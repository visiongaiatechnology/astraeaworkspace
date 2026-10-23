// STATUS: DIAMANT VGT SUPREME — local-only Notes Workspace reference renderer
import React, { useMemo } from 'react';
import { ExternalLink, RefreshCw, Snowflake } from 'lucide-react';
import type { NoteWorkspaceEmbedData, WorkspaceDocument, WriterWorkspaceEmbedSnapshot } from '../../../../shared/contracts/workspace';
import { resolveNoteWorkspaceEmbed } from '../../integrations/notesWorkspaceEmbed';

interface Props {
  embed: NoteWorkspaceEmbedData;
  workspaceDocuments: readonly WorkspaceDocument[];
  onChange: (embed: NoteWorkspaceEmbedData) => void;
  onOpenSource?: (documentId: string) => void;
}

function SnapshotView({ snapshot }: { snapshot: WriterWorkspaceEmbedSnapshot }) {
  if (snapshot.type === 'table') return <div className="overflow-auto max-h-48"><table className="w-full border-collapse text-[0.5625rem]"><thead><tr>{snapshot.columns.slice(0, 12).map((column) => <th key={column} className="border border-white/10 p-1 text-left text-slate-400">{column}</th>)}</tr></thead><tbody>{snapshot.rows.slice(0, 24).map((row, index) => <tr key={index}>{row.slice(0, 12).map((cell, cellIndex) => <td key={cellIndex} className="border border-white/10 p-1 text-slate-300">{cell}</td>)}</tr>)}</tbody></table></div>;
  if (snapshot.type === 'summary') return <div className="space-y-2"><div className="grid grid-cols-2 gap-1">{snapshot.metrics.slice(0, 12).map((metric) => <div key={`${metric.label}:${metric.value}`} className="rounded border border-white/10 bg-white/[0.02] p-1"><div className="text-[0.5rem] uppercase text-slate-600">{metric.label}</div><div className="text-[0.625rem] text-slate-300 truncate">{metric.value}</div></div>)}</div>{snapshot.lines.slice(0, 16).map((line, index) => <div key={index} className="text-[0.5625rem] text-slate-400 truncate">{line}</div>)}</div>;
  if (snapshot.type === 'chart') return <div className="space-y-1"><div className="text-xs font-semibold text-slate-200">{snapshot.title}</div><div className="text-[0.5625rem] text-slate-500">{snapshot.categories.length} categories · {snapshot.series.length} series</div>{snapshot.series.slice(0, 8).map((series) => <div key={series.name} className="flex items-center justify-between gap-2 text-[0.5625rem]"><span className="truncate text-slate-400">{series.name}</span><span className="font-mono text-cyan-300">{series.values.slice(0, 4).join(' · ')}</span></div>)}</div>;
  if (snapshot.type === 'timeline') return <div className="space-y-1">{snapshot.items.slice(0, 24).map((item) => <div key={item.id} className="rounded border border-white/10 px-2 py-1 text-[0.5625rem]"><div className="text-slate-300 truncate">{item.label}</div><div className="text-slate-600">{item.start ?? '—'} → {item.end ?? '—'} {item.progress == null ? '' : `· ${item.progress}%`}</div></div>)}</div>;
  if (snapshot.type === 'slide') return <div><div className="text-xs font-semibold text-slate-200">{snapshot.title}</div><div className="text-[0.625rem] text-slate-500">{snapshot.subtitle}</div><ul className="mt-1 list-disc pl-4 text-[0.5625rem] text-slate-400">{snapshot.bulletPoints.slice(0, 12).map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
  if (snapshot.type === 'frame') return <div><div className="text-xs font-semibold text-slate-200">{snapshot.name}</div><div className="text-[0.5625rem] text-slate-400 whitespace-pre-wrap">{snapshot.text}</div><div className="mt-1 text-[0.5625rem] text-slate-600">{snapshot.containedItems.length} contained items</div></div>;
  if (snapshot.type === 'pdf-page') return <div><div className="text-xs font-semibold text-slate-200">Page {snapshot.pageNumber} · {snapshot.title}</div>{snapshot.subtitle && <div className="text-[0.5625rem] text-slate-500">{snapshot.subtitle}</div>}<div className="mt-1 text-[0.5625rem] text-slate-400">{snapshot.sections.slice(0, 8).map((section) => section.content).join(' · ')}</div></div>;
  if (snapshot.type === 'pdf-annotation') return <div className="text-[0.5625rem] text-slate-300">Page {snapshot.page} · {snapshot.annotationType}<div className="mt-1 text-slate-400">{snapshot.text}</div></div>;
  if (snapshot.type === 'vault-asset') return <div className="text-[0.5625rem] text-slate-300">{snapshot.name}<div className="text-slate-500">{snapshot.mimeType} · {snapshot.sizeBytes.toLocaleString()} bytes</div></div>;
  return <div className="text-[0.5625rem] text-slate-300">{snapshot.name}<div className="text-slate-500">{snapshot.description}</div></div>;
}

export const NotesWorkspaceEmbedBlock: React.FC<Props> = ({ embed, workspaceDocuments, onChange, onOpenSource }) => {
  const resolved = useMemo(() => resolveNoteWorkspaceEmbed(embed, workspaceDocuments), [embed, workspaceDocuments]);
  const freeze = () => onChange({ ...resolved, mode: 'Frozen' });
  const makeLive = () => onChange({ ...resolved, mode: 'Live' });
  return <div className="h-full overflow-auto p-3 bg-slate-950/35">
    <div className="flex items-center gap-2 mb-2"><span className="text-[0.625rem] font-semibold text-cyan-200 truncate flex-1">{resolved.title}</span><span className={`text-[0.5rem] uppercase ${resolved.mode === 'Live' ? 'text-emerald-300' : 'text-slate-500'}`}>{resolved.mode}</span></div>
    <SnapshotView snapshot={resolved.snapshot}/>
    <div className="mt-3 flex flex-wrap gap-1 border-t border-white/10 pt-2">
      {resolved.mode === 'Live' ? <button type="button" onClick={freeze} className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[0.5625rem] text-slate-400"><Snowflake className="w-3 h-3"/>Freeze current</button> : <button type="button" onClick={makeLive} className="flex items-center gap-1 rounded border border-emerald-500/20 px-2 py-1 text-[0.5625rem] text-emerald-300"><RefreshCw className="w-3 h-3"/>Resume live</button>}
      {onOpenSource && <button type="button" onClick={() => onOpenSource(resolved.sourceDocumentId)} className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[0.5625rem] text-slate-400"><ExternalLink className="w-3 h-3"/>Open source</button>}
      <span className="ml-auto text-[0.5rem] font-mono text-slate-600">v{resolved.sourceVersion}</span>
    </div>
  </div>;
};
