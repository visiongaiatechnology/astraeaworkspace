// STATUS: DIAMANT VGT SUPREME — passive Present workspace snapshot renderer
import React from 'react';
import type { PresentWorkspaceSceneObject, WriterWorkspaceEmbedSnapshot } from '../../../../shared/contracts/workspace';
import { LockKeyhole, RefreshCw, Snowflake } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PRESENT_OFFICE_COPY, presentWorkspaceSnapshotMetricLabel } from '../../locale/presentOfficeLocale';
import { PRESENT_WORKFLOW_COPY } from '../../locale/presentWorkflowLocale';
import type { PresentLinkStatus } from '../../integrations/presentLinkStatus';

interface Props {
  object: PresentWorkspaceSceneObject;
  /** Live-link state resolved by `presentLinkStatus`; `null` when the caller did not resolve it. */
  linkStatus?: PresentLinkStatus | null;
}

const bounded = (value: string, max = 512) => value.slice(0, max);

function TableSnapshot({ snapshot }: { snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'table' }> }) {
  return (
    <div className="h-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/70">
      <table className="w-full table-fixed border-collapse text-[0.5625rem]">
        <thead className="bg-slate-900/95">
          <tr>{snapshot.columns.slice(0, 12).map((column, index) => <th key={`${column}-${index}`} className="truncate border-b border-white/10 px-1.5 py-1 text-left font-semibold text-slate-300">{bounded(column, 96)}</th>)}</tr>
        </thead>
        <tbody>
          {snapshot.rows.slice(0, 18).map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white/[0.025]">
              {snapshot.columns.slice(0, 12).map((_, colIndex) => <td key={colIndex} className="truncate border-b border-white/[0.04] px-1.5 py-1 text-slate-400">{bounded(row[colIndex] ?? '', 128)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartSnapshot({ snapshot, locale }: { snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'chart' }>; locale: ReturnType<typeof useWorkspaceLocale>['locale'] }) {
  const max = Math.max(1, ...snapshot.series.flatMap((series) => series.values.map((value) => Math.abs(value))));
  const fallbackTitle = PRESENT_OFFICE_COPY[locale].workspaceIntegration.snapshotDetails.chart;
  return (
    <div className="h-full space-y-1 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 p-2">
      <div className="truncate text-[0.625rem] font-semibold text-slate-200">{bounded(snapshot.title || fallbackTitle)}</div>
      <div className="flex h-[calc(100%-18px)] items-end gap-1">
        {snapshot.series.slice(0, 6).flatMap((series, seriesIndex) => series.values.slice(0, 16).map((value, valueIndex) => (
          <div
            key={`${series.name}-${seriesIndex}-${valueIndex}`}
            className="min-w-1 flex-1 rounded-t bg-cyan-400/65"
            style={{ height: `${Math.max(3, Math.min(100, Math.abs(value) / max * 100))}%` }}
            title={`${bounded(series.name, 96)} · ${bounded(snapshot.categories[valueIndex] ?? String(valueIndex + 1), 96)}: ${value}`}
          />
        )))}
      </div>
    </div>
  );
}

function SummarySnapshot({ object, snapshot, locale }: { object: PresentWorkspaceSceneObject; snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'summary' }>; locale: ReturnType<typeof useWorkspaceLocale>['locale'] }) {
  return (
    <div className="h-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        {snapshot.metrics.slice(0, 8).map((metric) => <div key={`${metric.label}-${metric.value}`} className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.035] px-2 py-1"><div className="truncate text-[0.5rem] uppercase tracking-wide text-slate-500">{bounded(presentWorkspaceSnapshotMetricLabel(locale, object.integrationKind, metric.label), 96)}</div><div className="truncate text-[0.6875rem] font-semibold text-slate-200">{bounded(metric.value, 160)}</div></div>)}
      </div>
      {snapshot.lines.length > 0 && <div className="mt-2 space-y-0.5 text-[0.5625rem] text-slate-400">{snapshot.lines.slice(0, 8).map((line, index) => <div key={index} className="truncate">• {bounded(line, 256)}</div>)}</div>}
    </div>
  );
}

function TimelineSnapshot({ snapshot }: { snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'timeline' }> }) {
  return <div className="h-full space-y-1 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 p-2">{snapshot.items.slice(0, 12).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded bg-white/[0.03] px-2 py-1"><div className="min-w-0"><div className="truncate text-[0.5625rem] text-slate-200">{bounded(item.label, 160)}</div><div className="truncate text-[0.5rem] text-slate-500">{bounded(item.start || '—', 32)} → {bounded(item.end || '—', 32)} · {bounded(item.status || '—', 64)}</div></div><div className="text-[0.5625rem] font-mono text-cyan-300">{Math.max(0, Math.min(100, item.progress ?? 0))}%</div></div>)}</div>;
}

function DetailSnapshot({ snapshot, locale }: { snapshot: Exclude<WriterWorkspaceEmbedSnapshot, { type: 'table' | 'chart' | 'summary' | 'timeline' }>; locale: ReturnType<typeof useWorkspaceLocale>['locale'] }) {
  const copy = PRESENT_OFFICE_COPY[locale].workspaceIntegration;
  const details = copy.snapshotDetails;
  if (snapshot.type === 'slide') return <div className="h-full overflow-hidden rounded-lg border border-indigo-400/20 bg-indigo-500/[0.06] p-3"><div className="truncate text-sm font-bold text-slate-100">{bounded(snapshot.title)}</div><div className="mt-1 truncate text-[0.625rem] text-slate-400">{bounded(snapshot.subtitle)}</div><div className="mt-2 space-y-1 text-[0.5625rem] text-slate-300">{snapshot.bulletPoints.slice(0, 8).map((item, index) => <div key={index} className="truncate">• {bounded(item, 256)}</div>)}</div></div>;
  if (snapshot.type === 'frame') return <div className="h-full overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="truncate text-xs font-semibold text-amber-200">{bounded(snapshot.name)}</div><div className="mt-1 line-clamp-3 text-[0.5625rem] text-slate-400">{bounded(snapshot.text, 512)}</div><div className="mt-2 grid grid-cols-2 gap-1">{snapshot.containedItems.slice(0, 10).map((item) => <div key={item.id} className="truncate rounded bg-white/[0.03] px-1.5 py-1 text-[0.5rem] text-slate-400">{bounded(item.type, 32)}: {bounded(item.text || '—', 96)}</div>)}</div></div>;
  if (snapshot.type === 'pdf-page') return <div className="h-full overflow-hidden rounded-lg border border-rose-400/20 bg-rose-400/[0.035] p-3"><div className="truncate text-xs font-bold text-rose-200">{copy.pdfPage(snapshot.pageNumber, bounded(snapshot.title))}</div>{snapshot.subtitle && <div className="mt-0.5 truncate text-[0.5625rem] text-slate-500">{bounded(snapshot.subtitle)}</div>}<div className="mt-2 space-y-1 text-[0.5625rem] text-slate-400">{snapshot.sections.slice(0, 12).map((section) => <div key={section.id} className="truncate"><span className="text-slate-500">{bounded(section.type, 32)}:</span> {bounded(section.content, 256)}</div>)}</div></div>;
  if (snapshot.type === 'pdf-annotation') return <div className="h-full overflow-hidden rounded-lg border border-rose-400/20 bg-rose-400/[0.035] p-3"><div className="text-[0.5625rem] uppercase text-rose-300">{bounded(snapshot.annotationType, 64)} · {copy.pdfPage(snapshot.page, '')}</div><div className="mt-1 line-clamp-6 text-[0.625rem] text-slate-300">{bounded(snapshot.text, 1024)}</div></div>;
  if (snapshot.type === 'vault-asset') return <div className="flex h-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-emerald-400/20 bg-emerald-400/[0.035] p-3"><div className="min-w-0"><div className="truncate text-xs font-semibold text-emerald-200">{bounded(snapshot.name)}</div><div className="mt-1 truncate text-[0.5625rem] text-slate-500">{bounded(snapshot.mimeType || copy.vaultAssetFallback, 96)} · {snapshot.sizeBytes.toLocaleString()} B · {details.integrityStates[snapshot.integrityState || 'unverified']}</div></div><LockKeyhole className="h-5 w-5 shrink-0 text-emerald-400" /></div>;
  return <div className="h-full overflow-hidden rounded-lg border border-violet-400/20 bg-violet-400/[0.035] p-3"><div className="truncate text-xs font-semibold text-violet-200">{bounded(snapshot.name)}</div><div className="mt-1 line-clamp-4 text-[0.5625rem] text-slate-400">{bounded(snapshot.description, 768)}</div><div className="mt-2 text-[0.5rem] text-slate-500">{details.role}: {bounded(snapshot.role, 64)} · {details.linkedDocuments(snapshot.linkedDocumentIds.length)}</div></div>;
}

export const PresentWorkspaceSnapshotView: React.FC<Props> = ({ object, linkStatus = null }) => {
  const { locale } = useWorkspaceLocale();
  const modeCopy = PRESENT_WORKFLOW_COPY[locale].workspace;
  return <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-cyan-400/20 bg-slate-950/90 shadow-lg">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5">
      <div className="min-w-0 truncate text-[0.5625rem] font-semibold text-slate-200">{bounded(object.title, 256)}</div>
      <div className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[0.5rem] font-mono ${object.mode === 'Live' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>
        {object.mode === 'Live' ? <RefreshCw className="h-2.5 w-2.5" /> : <Snowflake className="h-2.5 w-2.5" />}
        {object.mode === 'Live' ? modeCopy.live : modeCopy.frozen}
      </div>
    </div>
    {/* The resolved link state is always visible text: "updated" and "offline" must be distinguishable
        without colour, and an offline link must never look like a current one. */}
    {linkStatus && (
      <div
        data-present-link-state={linkStatus.state}
        role={linkStatus.attention ? 'status' : undefined}
        aria-live={linkStatus.attention ? 'polite' : undefined}
        className={`shrink-0 border-b border-white/[0.05] px-2.5 py-0.5 text-[0.5rem] font-mono ${
          linkStatus.attention ? 'bg-amber-500/10 text-amber-200' : 'bg-emerald-500/[0.07] text-emerald-200'
        }`}
      >
        {linkStatus.label}
      </div>
    )}
    <div className="min-h-0 flex-1 p-2">
      {object.snapshot.type === 'table' && <TableSnapshot snapshot={object.snapshot} />}
      {object.snapshot.type === 'chart' && <ChartSnapshot snapshot={object.snapshot} locale={locale} />}
      {object.snapshot.type === 'summary' && <SummarySnapshot object={object} snapshot={object.snapshot} locale={locale} />}
      {object.snapshot.type === 'timeline' && <TimelineSnapshot snapshot={object.snapshot} />}
      {!['table', 'chart', 'summary', 'timeline'].includes(object.snapshot.type) && <DetailSnapshot snapshot={object.snapshot as Exclude<WriterWorkspaceEmbedSnapshot, { type: 'table' | 'chart' | 'summary' | 'timeline' }>} locale={locale} />}
    </div>
    <div className="shrink-0 truncate border-t border-white/[0.05] px-2.5 py-1 text-[0.4375rem] font-mono text-slate-600">{bounded(object.uri, 512)} · v{object.sourceVersion}</div>
  </div>;
};
