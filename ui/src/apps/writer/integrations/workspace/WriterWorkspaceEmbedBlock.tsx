// STATUS: DIAMANT VGT SUPREME — Passive Writer workspace embed renderer
import React from 'react';
import { ExternalLink, Link2, LockKeyhole, RefreshCw, Trash2 } from 'lucide-react';
import type { WriterWorkspaceEmbed } from '../../../../shared/contracts/workspace';
import { ChartRenderer } from '../../../../shared/charts/ChartRenderer';
import { normalizeCanonicalChart } from '../../../../shared/charts/chartModel';
import { resolveWriterWorkspaceEmbedState, type WriterWorkspaceSourcePresence } from './writerEmbedPresence';

export interface WriterWorkspaceEmbedBlockProps {
  embed: WriterWorkspaceEmbed;
  readOnly?: boolean;
  /**
   * Whether the source document still exists (W-245/W-254). `unknown` is the default: a caller that cannot
   * know must not be turned into a claim that the source is fine.
   */
  sourcePresence?: WriterWorkspaceSourcePresence;
  onOpenSource?: () => void;
  onOpenAsset?: () => void;
  onDelete?: () => void;
}

function TableSnapshot({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-auto max-h-72 rounded-xl border border-white/10">
      <table className="w-full text-[0.6875rem] border-collapse">
        <thead className="sticky top-0 bg-slate-900/95">
          <tr>{columns.map((column, index) => <th key={`${column}-${index}`} className="px-2 py-1.5 text-left font-semibold text-slate-300 border-b border-white/10">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white/[0.025]">
              {columns.map((_, colIndex) => <td key={colIndex} className="px-2 py-1.5 text-slate-400 border-b border-white/[0.05] align-top">{row[colIndex] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && <div className="px-2 py-1 text-[0.625rem] text-slate-500">+ {rows.length - 100} weitere Zeilen im referenzierten Snapshot</div>}
    </div>
  );
}

function SnapshotBody({ embed }: { embed: WriterWorkspaceEmbed }) {
  const snapshot = embed.snapshot;
  if (snapshot.type === 'table') return <TableSnapshot columns={snapshot.columns} rows={snapshot.rows} />;
  if (snapshot.type === 'chart') {
    const chart=snapshot.chart ?? normalizeCanonicalChart({
      id:`writer-embed-${embed.id}`,chart_type:'column',title:snapshot.title,categories:snapshot.categories,
      series:snapshot.series,source:{kind:'inline',live:false,state:'frozen'},source_state:'frozen',render_mode:'2d',
    });
    return <ChartRenderer chart={chart} height={190} interactive />;
  }
  if (snapshot.type === 'summary') return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{snapshot.metrics.map((metric) => <div key={metric.label} className="rounded-lg bg-white/[0.035] border border-white/[0.06] px-2.5 py-2"><div className="text-[0.5625rem] uppercase tracking-wide text-slate-500">{metric.label}</div><div className="text-sm font-semibold text-slate-200 mt-0.5">{metric.value}</div></div>)}</div>
      {snapshot.lines.length > 0 && <ul className="text-[0.6875rem] text-slate-400 space-y-1">{snapshot.lines.slice(0, 32).map((line, index) => <li key={index}>• {line}</li>)}</ul>}
    </div>
  );
  if (snapshot.type === 'timeline') return <div className="space-y-1.5">{snapshot.items.slice(0, 80).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-white/[0.03] px-2.5 py-1.5"><div><div className="text-[0.6875rem] text-slate-200">{item.label}</div><div className="text-[0.5625rem] text-slate-500">{item.start || '—'} → {item.end || '—'} · {item.status || '—'}</div></div><div className="text-[0.625rem] font-mono text-cyan-300">{item.progress ?? 0}%</div></div>)}</div>;
  if (snapshot.type === 'slide') return <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-400/20 p-4"><div className="text-sm font-bold text-slate-100">{snapshot.title}</div><div className="text-xs text-slate-400 mt-1">{snapshot.subtitle}</div><ul className="mt-3 text-[0.6875rem] text-slate-300 space-y-1">{snapshot.bulletPoints.map((item, index) => <li key={index}>• {item}</li>)}</ul><div className="mt-3 text-[0.5625rem] text-slate-500">{snapshot.sceneObjectCount} Szenenobjekte · {snapshot.commentCount} Kommentare</div></div>;
  if (snapshot.type === 'frame') return <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="text-xs font-semibold text-amber-200">{snapshot.name}</div>{snapshot.text && <div className="text-[0.6875rem] text-slate-400 mt-1">{snapshot.text}</div>}<div className="mt-2 grid grid-cols-2 gap-1">{snapshot.containedItems.slice(0, 20).map((item) => <div key={item.id} className="rounded bg-white/[0.03] px-2 py-1 text-[0.625rem] text-slate-400">{item.type}: {item.text || '—'}</div>)}</div></div>;
  if (snapshot.type === 'pdf-page') return <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.035] p-3"><div className="text-xs font-bold text-rose-200">Seite {snapshot.pageNumber} · {snapshot.title}</div>{snapshot.subtitle && <div className="text-[0.625rem] text-slate-500 mt-0.5">{snapshot.subtitle}</div>}<div className="mt-2 text-[0.6875rem] text-slate-400 space-y-1">{snapshot.sections.slice(0, 24).map((section) => <div key={section.id}><span className="text-slate-500">{section.type}:</span> {section.content}</div>)}</div></div>;
  if (snapshot.type === 'pdf-annotation') return <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.035] p-3"><div className="text-[0.625rem] uppercase text-rose-300">{snapshot.annotationType} · Seite {snapshot.page}</div><div className="text-xs text-slate-300 mt-1">{snapshot.text}</div>{snapshot.author && <div className="text-[0.5625rem] text-slate-500 mt-2">{snapshot.author}</div>}</div>;
  if (snapshot.type === 'vault-asset') return <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.035] p-3 flex items-center justify-between gap-3"><div><div className="text-xs font-semibold text-emerald-200">{snapshot.name}</div><div className="text-[0.5625rem] text-slate-500 mt-1">{snapshot.mimeType || 'Workspace asset'} · {snapshot.sizeBytes.toLocaleString()} Bytes · Integrität: {snapshot.integrityState || 'unverified'}</div></div><LockKeyhole className="w-5 h-5 text-emerald-400" /></div>;
  return <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.035] p-3"><div className="text-xs font-semibold text-violet-200">{snapshot.name}</div><div className="text-[0.6875rem] text-slate-400 mt-1">{snapshot.description}</div><div className="mt-2 text-[0.5625rem] text-slate-500">Rolle: {snapshot.role} · {snapshot.linkedDocumentIds.length} Dokumente · {snapshot.retainedWriterCommentIds.length} Writer-Kommentare gebunden</div></div>;
}

export const WriterWorkspaceEmbedBlock: React.FC<WriterWorkspaceEmbedBlockProps> = ({
  embed,
  readOnly = false,
  sourcePresence = 'unknown',
  onOpenSource,
  onOpenAsset,
  onDelete,
}) => {
  // W-245/W-251/W-254: the state is decided once, by a pure function, and then stated in words. The header
  // used to print the internal value (`Live` / `Snapshot`) and the two reasons why content "does not change"
  // looked the same. Colour still supports the state; it never carries it alone.
  const state = resolveWriterWorkspaceEmbedState({ mode: embed.mode, presence: sourcePresence });
  const badgeTone = state.tone === 'ok'
    ? 'bg-emerald-500/10 text-emerald-300'
    : state.tone === 'frozen'
      ? 'bg-slate-700/50 text-slate-300'
      : 'bg-amber-500/15 text-amber-200';
  return (
    <section
      className="my-3 rounded-2xl bg-slate-950/85 border border-cyan-500/20 shadow-lg overflow-hidden"
      data-writer-workspace-embed={embed.id}
      data-writer-workspace-embed-state={state.code}
      data-vgt-app-guide-anchor={embed.mode === 'Live' ? 'Writer:live-refresh' : undefined}
    >
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.07] bg-white/[0.02]">
        <div className="min-w-0 flex items-center gap-2"><Link2 className="w-3.5 h-3.5 text-cyan-300 shrink-0"/><div className="truncate text-[0.6875rem] font-semibold text-slate-200">{embed.title}</div><span className={`text-[0.5625rem] font-mono px-1.5 py-0.5 rounded ${badgeTone}`}>{state.badge}</span>{state.code === 'live' && <RefreshCw className="w-3 h-3 text-emerald-400"/>}</div>
        <div className="flex items-center gap-1">
          {onOpenAsset && <button type="button" onClick={onOpenAsset} className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-300" aria-label="Vault-Asset ohne Temp-Datei öffnen" title="Vault-Asset ohne Temp-Datei öffnen"><LockKeyhole className="w-3.5 h-3.5"/></button>}
          {onOpenSource && (
            <button
              type="button"
              onClick={onOpenSource}
              // Offering an action that cannot work would be a lie; the reason is written below.
              disabled={!state.canOpenSource}
              aria-disabled={!state.canOpenSource}
              className="p-1.5 rounded hover:bg-cyan-500/10 text-cyan-300 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              aria-label={state.canOpenSource ? 'Quelldokument öffnen' : 'Quelldokument öffnen — nicht verfügbar, die Quelldatei fehlt'}
              title={state.canOpenSource ? 'Quelldokument öffnen' : 'Die Quelldatei ist nicht mehr im Arbeitsbereich'}
            >
              <ExternalLink className="w-3.5 h-3.5"/>
            </button>
          )}
          {!readOnly && onDelete && <button type="button" onClick={onDelete} className="p-1.5 rounded hover:bg-rose-500/10 text-rose-300" aria-label="Referenz entfernen" title="Referenz entfernen"><Trash2 className="w-3.5 h-3.5"/></button>}
        </div>
      </header>
      <div className="p-3"><SnapshotBody embed={embed}/></div>
      {state.detail && (
        <p
          role="status"
          data-writer-workspace-embed-detail={state.code}
          className={`px-3 pb-2 text-[0.625rem] leading-relaxed ${state.tone === 'warning' ? 'text-amber-200' : 'text-slate-400'}`}
        >
          {state.detail}
        </p>
      )}
      <footer className="px-3 py-1.5 border-t border-white/[0.05] text-[0.5625rem] font-mono text-slate-600 truncate">{embed.uri} · source v{embed.sourceVersion}</footer>
    </section>
  );
};
