// STATUS: DIAMANT VGT SUPREME — Go-To, Local Clipboard History & Named Version UI
import React, { useMemo, useState } from 'react';
import { ClipboardList, GitBranch, Navigation, Trash2, X, CornerDownLeft, ShieldCheck } from 'lucide-react';
import type {
  WriterBookmark,
  WriterComment,
  WriterEquationBlockData,
  WriterFootnote,
  WriterImageBlockData,
  WriterNamedVersion,
  WriterSectionDefinition,
  WriterTableBlockData,
} from '../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../layout/pagination/writerPagination';
import type { WriterClipboardEntry } from '../productivity/clipboard/writerClipboardHistory';
import { buildWriterGoToTargets, type WriterGoToKind } from './writerNavigationEngine';
import type { WriterProductivityOperationResult, WriterSessionVersionEntry } from '../productivity/useWriterProductivityState';

interface WriterNavigationActionsProps {
  pages: readonly WriterPaginationPage[];
  sections: readonly WriterSectionDefinition[];
  bookmarks: readonly WriterBookmark[];
  footnotes: readonly WriterFootnote[];
  comments: readonly WriterComment[];
  tables: readonly WriterTableBlockData[];
  images: readonly WriterImageBlockData[];
  equations: readonly WriterEquationBlockData[];
  namedVersions: readonly WriterNamedVersion[];
  sessionVersions: readonly WriterSessionVersionEntry[];
  clipboardHistoryEnabled: boolean;
  clipboardHistory: readonly WriterClipboardEntry[];
  productivityMessage?: string | null;
  onSetClipboardHistoryEnabled: (enabled: boolean) => void;
  onClearClipboardHistory: () => void;
  onInsertClipboardEntry: (id: string) => void;
  onCreateNamedVersion: (name: string) => WriterProductivityOperationResult;
  onRestoreNamedVersion: (id: string) => WriterProductivityOperationResult;
  onDeleteNamedVersion: (id: string) => WriterProductivityOperationResult;
  onRestoreSessionVersion: (historyIndex: number) => WriterProductivityOperationResult;
  onJumpToParagraph: (paragraphId: string) => void;
}

type Panel = 'goto' | 'clipboard' | 'versions' | null;

export const WriterNavigationActions: React.FC<WriterNavigationActionsProps> = (props) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [goToKind, setGoToKind] = useState<WriterGoToKind>('page');
  const [versionName, setVersionName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const targets = useMemo(() => buildWriterGoToTargets({
    pages: props.pages,
    sections: props.sections,
    bookmarks: props.bookmarks,
    footnotes: props.footnotes,
    comments: props.comments,
    tables: props.tables,
    images: props.images,
    equations: props.equations,
  }), [props.bookmarks, props.comments, props.equations, props.footnotes, props.images, props.pages, props.sections, props.tables]);

  const execute = (result: WriterProductivityOperationResult) => setMessage(result.message ?? (result.ok ? 'Aktion abgeschlossen.' : 'Aktion fehlgeschlagen.'));

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 border-t border-white/10 p-2">
        <button type="button" onClick={() => setPanel('goto')} className="rounded-lg bg-white/5 px-2 py-1.5 text-[0.625rem] text-slate-300 hover:bg-white/10"><Navigation className="mx-auto mb-0.5 h-3.5 w-3.5 text-blue-400" />Go To</button>
        <button type="button" onClick={() => setPanel('clipboard')} className="rounded-lg bg-white/5 px-2 py-1.5 text-[0.625rem] text-slate-300 hover:bg-white/10"><ClipboardList className="mx-auto mb-0.5 h-3.5 w-3.5 text-cyan-400" />Clipboard</button>
        <button type="button" onClick={() => setPanel('versions')} className="rounded-lg bg-white/5 px-2 py-1.5 text-[0.625rem] text-slate-300 hover:bg-white/10"><GitBranch className="mx-auto mb-0.5 h-3.5 w-3.5 text-purple-400" />Versions</button>
      </div>
      {panel && (
        <div className="absolute inset-2 z-30 flex flex-col rounded-2xl border border-white/15 bg-slate-950/98 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-bold text-slate-100">{panel === 'goto' ? 'Go To' : panel === 'clipboard' ? 'Lokale Clipboard History' : 'Version History & Named Versions'}</span>
            <button aria-label="Close current navigation panel" type="button" onClick={() => { setPanel(null); setMessage(null); }} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          </div>

          {panel === 'goto' && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="mb-2 grid grid-cols-3 gap-1">
                {(['page', 'section', 'bookmark', 'footnote', 'comment', 'object'] as WriterGoToKind[]).map((kind) => (
                  <button key={kind} type="button" onClick={() => setGoToKind(kind)} className={`rounded px-2 py-1 text-[0.625rem] ${goToKind === kind ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}>{kind}</button>
                ))}
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {targets.filter((target) => target.kind === goToKind).map((target) => (
                  <button key={target.id} type="button" disabled={!target.paragraphId} onClick={() => { if (target.paragraphId) { props.onJumpToParagraph(target.paragraphId); setPanel(null); } }} className="w-full rounded-lg border border-white/5 bg-white/[0.03] p-2 text-left text-[0.625rem] text-slate-300 hover:border-blue-500/40 disabled:opacity-40">{target.label}</button>
                ))}
              </div>
            </div>
          )}

          {panel === 'clipboard' && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <label className="mb-2 flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2 text-[0.625rem] text-cyan-100">
                <input type="checkbox" checked={props.clipboardHistoryEnabled} onChange={(event) => props.onSetClipboardHistoryEnabled(event.target.checked)} className="mt-0.5" />
                <span><b>Explizit aktivieren.</b> Verlauf bleibt ausschließlich im Arbeitsspeicher dieser Writer-Sitzung und wird weder in Dokument noch Cloud geschrieben.</span>
              </label>
              <div className="mb-2 flex items-center justify-between"><span className="text-[0.625rem] text-slate-500">{props.clipboardHistory.length}/32 Einträge</span><button type="button" onClick={props.onClearClipboardHistory} className="text-[0.625rem] text-rose-400 hover:text-rose-300">Leeren</button></div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {props.clipboardHistory.length === 0 ? <p className="p-5 text-center text-[0.625rem] text-slate-500">Noch keine kopierten Textinhalte erfasst.</p> : props.clipboardHistory.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-2">
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-[0.625rem] text-slate-300">{entry.text}</p>
                    <div className="mt-1 flex items-center justify-between"><span className="text-[0.5625rem] text-slate-600">{new Date(entry.capturedAt).toLocaleTimeString()}</span><button type="button" onClick={() => props.onInsertClipboardEntry(entry.id)} className="flex items-center gap-1 text-[0.625rem] text-cyan-400"><CornerDownLeft className="h-3 w-3" />Einfügen</button></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {panel === 'versions' && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="mb-2 flex gap-1.5"><input value={versionName} onChange={(event) => setVersionName(event.target.value)} maxLength={128} placeholder="Versionsname…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-purple-500" /><button type="button" onClick={() => { const result = props.onCreateNamedVersion(versionName); execute(result); if (result.ok) setVersionName(''); }} disabled={!versionName.trim()} className="rounded-lg bg-purple-600 px-3 py-1 text-[0.625rem] font-semibold text-white disabled:opacity-40">Snapshot</button></div>
              <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[0.5625rem] text-slate-500"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />Benannte Versionen enthalten keinen Schutz-Hash und überschreiben beim Restore nicht den aktuellen Dokumentschutz.</div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                <p className="px-1 pt-1 text-[0.5625rem] font-bold uppercase tracking-wider text-slate-600">Benannte Versionen</p>
                {props.namedVersions.length === 0 ? <p className="p-3 text-center text-[0.625rem] text-slate-500">Noch keine benannten Versionen.</p> : props.namedVersions.map((version) => (
                  <div key={version.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-2">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[0.6875rem] font-semibold text-slate-200">{version.name}</p><p className="text-[0.5625rem] text-slate-500">v{version.sourceDocumentVersion} · {new Date(version.createdAt).toLocaleString()}</p></div><button aria-label="Delete saved version" type="button" onClick={() => execute(props.onDeleteNamedVersion(version.id))} className="p-1 text-slate-500 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button></div>
                    <button type="button" onClick={() => execute(props.onRestoreNamedVersion(version.id))} className="mt-2 w-full rounded-lg bg-white/5 py-1 text-[0.625rem] text-purple-300 hover:bg-purple-500/10">Wiederherstellen</button>
                  </div>
                ))}
                <p className="px-1 pt-2 text-[0.5625rem] font-bold uppercase tracking-wider text-slate-600">Sitzungsverlauf · max. 100 Snapshots</p>
                {props.sessionVersions.map((version) => (
                  <div key={`${version.historyIndex}:${version.version}`} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2">
                    <div><p className="text-[0.625rem] font-semibold text-slate-300">v{version.version}{version.current ? ' · aktuell' : ''}</p><p className="text-[0.5625rem] text-slate-600">{new Date(version.modifiedAt).toLocaleString()}</p></div>
                    {!version.current && <button type="button" onClick={() => execute(props.onRestoreSessionVersion(version.historyIndex))} className="rounded bg-white/5 px-2 py-1 text-[0.5625rem] text-purple-300">Restore</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(message || props.productivityMessage) && <div className="border-t border-white/10 px-3 py-2 text-[0.625rem] text-slate-300">{message ?? props.productivityMessage}</div>}
        </div>
      )}
    </>
  );
};
