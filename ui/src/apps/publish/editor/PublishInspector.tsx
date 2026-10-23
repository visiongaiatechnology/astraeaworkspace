// STATUS: DIAMANT VGT SUPREME — Astraea Publish Inspector
//
// Befund vor dieser Fassung (gemessen, Runde Publish-2 und -10):
//   • Der Inspektor schrieb `xMm`, `yMm`, `widthMm`, `heightMm` **direkt** in das Modell — an `snapRect`,
//     an der Groessenpruefung und an der Ueberlauf-Neuberechnung vorbei.
//   • Rahmen loeschen filterte `frames` direkt, ohne die Textverkettung zu reparieren.
//   • Ueberlauf wurde als Liste von IDs berechnet, aber **nie angezeigt**; kein Befund war anklickbar.
//   • Rotation, Sperren, Alternativtext, semantische Rolle, Stile, Farbfelder, Master und Tabellen hatten
//     keinen Einstieg.
//
// Diese Fassung kennt nur noch **Befehle** (`PublishInspectorCommands`); die Regeln bleiben im Dokumentmodell.
import React, { useId, useState } from 'react';
import { Sliders, CheckCircle2, AlertTriangle, Trash2, Link2, Unlink, AlignJustify, Type, Palette, Accessibility, Table2 } from 'lucide-react';
import type { PublishDocumentModel, PreflightIssue, PublishFrame, PublishStyleKind, PublishSwatch } from '../contracts/types';
import { detectOversetFrames, estimateTextCapacity, createDefaultPublishTypography, createDefaultTextOptions } from '../model/publishDocumentEngine';
import { PUBLISH_STYLE_KINDS } from '../model/publishStyleOps';
import { describePublishOutputProfile, AVAILABLE_ICC_PROFILES } from '../prepress/publishPrepressEngine';
import { activePublishPreflightProfile, buildPublishPreflightReport } from '../model/publishPresetOps';
import { buildPublishExportPreview } from '../model/publishExportPreview';
import {
  PUBLISH_TEXT_FLOW_LIMITS, PUBLISH_TEXT_WRAP_MODES, availableTextAreaMm2, defaultPublishParagraphBreak,
  describePublishTextWrap, publishColumnDistribution, publishParagraphBreakOf, publishWrapObstacles,
} from '../model/publishTextFlowOps';
import type { PublishTextWrapMode } from '../contracts/types';

/** Die Farbräume, die der Inspektor zum Anlegen anbietet — **dieselben Wörter wie der Vertrag**. */
const PUBLISH_SWATCH_SPACES: readonly PublishSwatch['space'][] = ['CMYK', 'RGB', 'Gray', 'Lab', 'Spot'];
import type { PublishPageRotation } from '../model/publishPageRotation';
import { PUBLISH_PAGE_ROTATIONS } from '../model/publishPageRotation';
import { PUBLISH_NUDGE_COARSE_MM, PUBLISH_NUDGE_STEP_MM, type PublishNudgeDirection } from '../model/publishFrameOps';
import { threadPosition } from '../model/publishThreadRead';
import { runPublishPreflight } from '../prepress/publishPrepressEngine';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { publishFindingCategoryText, publishFindingMessage, publishFrameTypeText, publishInspectorText } from '../publishInspectorLocale';
import type { PublishInspectorCommands } from './publishInspectorCommands';

interface PublishInspectorProps {
  model: PublishDocumentModel;
  onUpdateModel: (updater: (prev: PublishDocumentModel) => PublishDocumentModel) => void;
  showPreflight: boolean;
  commands: PublishInspectorCommands;
}

const ROLES = ['H1', 'H2', 'H3', 'P', 'Figure', 'Table', 'Artifact', 'Link'] as const;
const NUDGE_DIRECTIONS: readonly PublishNudgeDirection[] = ['left', 'right', 'up', 'down'];

export const PublishInspector: React.FC<PublishInspectorProps> = ({
  model,
  onUpdateModel,
  showPreflight,
  commands,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof publishInspectorText>[0]) => publishInspectorText(message, locale);
  const { selectedFrameId, frames } = model;
  const activePage = model.pages[model.activePageIndex];
  const geometry = activePage?.geometry || model.geometry;
  const selectedFrame = frames.find(f => f.id === selectedFrameId);

  const preflightIssues: PreflightIssue[] = runPublishPreflight(model);
  const oversetIds = new Set(detectOversetFrames(model));

  /**
   * Springt zu einem Befund.
   *
   * Vorher gab es keine Navigation: der Befund nannte eine Seite und einen Rahmen, aber der Nutzer musste
   * selbst suchen. `pageIndex` und `frameId` sind Teil des Befunds — genau dafuer.
   */
  const navigateToFinding = (issue: PreflightIssue) => {
    onUpdateModel(prev => ({
      ...prev,
      activePageIndex: issue.pageIndex !== undefined && issue.pageIndex >= 0 && issue.pageIndex < prev.pages.length ? issue.pageIndex : prev.activePageIndex,
      selectedFrameId: issue.frameId && prev.frames.some(frame => frame.id === issue.frameId) ? issue.frameId : prev.selectedFrameId,
    }));
  };

  const textFrame = selectedFrame?.type === 'text' ? selectedFrame : undefined;
  /**
   * **Die Kapazitaet kennt den Umbruch** (`AST-1381`).
   *
   * Gemessen vorher rechnete diese Zeile mit der **vollen** Rahmenflaeche. Lief Text um ein Bild, hielt die
   * Anzeige Text fuer „passend", der unter dem Bild verschwand. Jetzt kommt die **gemessene** freie Flaeche in
   * **dieselbe** Regel (`estimateTextCapacity`) — keine zweite Formel.
   */
  const textObstacles = textFrame ? publishWrapObstacles(model, textFrame) : [];
  const capacity = textFrame ? estimateTextCapacity(textFrame, availableTextAreaMm2(textFrame, textObstacles)) : 0;
  const lostChars = textFrame ? Math.max(0, textFrame.content.length - capacity) : 0;
  const threadInfo = textFrame ? threadPosition(model, textFrame.id) : null;
  const [linkTarget, setLinkTarget] = useState('');
  const threadTargetId = 'publish-thread-target';
  /**
   * Die Formulare zum **Anlegen** (`AST-1386`, `AST-1396`) — der Zustand liegt hier, die Regel im Modell.
   *
   * `useId` fuer die Beschriftungen: *eine Beschriftung ohne `htmlFor` ist keine.*
   */
  const formId = useId();
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleKind, setNewStyleKind] = useState<PublishStyleKind>('paragraph');
  const [newStyleSize, setNewStyleSize] = useState(11);
  const [newSwatchName, setNewSwatchName] = useState('');
  const [newSwatchSpace, setNewSwatchSpace] = useState<PublishSwatch['space']>('CMYK');
  const [newSpotName, setNewSpotName] = useState('');
  const submitStyle = (): void => {
    if (newStyleName.trim().length === 0) return;
    commands.createStyle(newStyleName, newStyleKind, newStyleSize);
    setNewStyleName('');
  };
  const submitSwatch = (): void => {
    if (newSwatchName.trim().length === 0) return;
    commands.createSwatch({
      name: newSwatchName,
      space: newSwatchSpace,
      // Die Komponenten werden **aufgefuellt** — die Pruefung bleibt beim vorhandenen Aufnehmer.
      components: [],
      ...(newSwatchSpace === 'Spot' ? { spotName: newSpotName.trim() || newSwatchName } : {}),
    });
    setNewSwatchName('');
    setNewSpotName('');
  };
  const outputProfile = describePublishOutputProfile(model);
  /** Der Bericht **mit** seinem Profil — die Bilanz, die der Nutzer sieht, ist dieselbe, die geprueft wurde. */
  const report = buildPublishPreflightReport(model);
  /**
   * **Die Vorschau, die der Export ebenfalls befragt** (`AST-1441/1442`) — **eine** Quelle ✓.
   *
   * Was hier steht, ist genau das, was `PublishView.handleExport` vor der Ausgabe entscheidet. *Zwei Rechnungen
   * waeren zwei Antworten auf dieselbe Frage — und die Vorschau wuerde luegen, ohne es zu wissen.*
   */
  const preview = buildPublishExportPreview(model);
  /** Ein Sprung zu einem **Rahmen** — dieselbe Wirkung wie beim Klick auf einen Preflight-Befund. */
  const navigateToFrameId = (frameId: string): void => {
    onUpdateModel((prev) => ({ ...prev, selectedFrameId: prev.frames.some((frame) => frame.id === frameId) ? frameId : prev.selectedFrameId }));
  };
  /**
   * Die **gemessenen** Zahlen der mehrspaltigen Typografie (`AST-1381/1382/1384`) — dieselben Funktionen, die der
   * Canvas zeichnet und die Ueberlaufschaetzung benutzt. *Keine zweite Rechnung fuer die Anzeige.*
   */
  const wrap = textFrame?.text?.textWrap ?? { mode: 'none' as const, offsetMm: 0, contourThreshold: 0.5 };
  const wrapSummary = textFrame ? describePublishTextWrap(model, textFrame.id) : '';
  const textBreak = textFrame ? publishParagraphBreakOf(textFrame) : defaultPublishParagraphBreak();
  const breakConflict = textBreak.keepLinesTogether && textBreak.keepFirstLines > 0 && textBreak.keepLastLines > 0;
  let columnBalanceText = '';
  if (textFrame && textFrame.type === 'text') {
    try {
      const { balance } = publishColumnDistribution(textFrame);
      columnBalanceText = `${balance.columns} column(s) · ${balance.lengths.join('/')} chars · spread ${balance.spread}${balance.conserved ? '' : ' · CHARS LOST'}`;
    } catch (cause) {
      // Eine zu schmale Spalte ist ein **benannter** Zustand, keine stille Ausnahme.
      columnBalanceText = cause instanceof Error ? cause.message : String(cause);
    }
  }
  /**
   * Nur Rahmen, die als Fortsetzung taugen: Text, nicht der eigene, nicht schon in einer Story.
   *
   * Die Ablehnung liegt im Dokumentmodell (`linkPublishFrames` wirft bei einem Zyklus oder einem Ziel mit
   * Fortsetzung). Sie hier **vorwegzunehmen** ist keine zweite Regel: die Bedingung ist "kein Vorgaenger und
   * kein Nachfolger", also genau der Zustand, den `threadPosition` schon meldet.
   */
  const linkCandidates = textFrame
    ? model.frames.filter(candidate => candidate.type === 'text' && candidate.id !== textFrame.id && !candidate.text?.previousFrameId && !candidate.text?.nextFrameId)
    : [];

  return (
    <div className="w-80 border-l border-purple-500/20 bg-[#0c0817] flex flex-col text-slate-200 select-none overflow-y-auto" data-publish-inspector="true">
      {/* Tab Header */}
      <div className="h-10 px-4 border-b border-purple-500/20 flex items-center justify-between text-xs font-semibold text-purple-300">
        <span className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-purple-400" />
          {showPreflight ? t('preflightTitle') : t('pageFrameProperties')}
        </span>
        {selectedFrame && !showPreflight && <span className="font-mono text-[0.625rem] text-slate-500">{t('frameCount').replace('{count}', String(frames.filter(f => f.pageId === activePage?.id).length))}</span>}
      </div>

      <div className="p-4 space-y-5 text-xs">
        {showPreflight ? (
          /* Preflight Mode */
          <div className="space-y-4">
            <div className="rounded-lg bg-purple-950/40 p-3 border border-purple-500/30">
              <h4 className="font-semibold text-purple-200 mb-1">{t('compliance')}</h4>
              <p className="text-[0.6875rem] text-slate-400 leading-relaxed">
                {t('complianceDescription')}
              </p>
            </div>

            {/*
              **Die Vorpruefungsvorgabe festhalten** (`AST-1403`).
              Gemessen vorher: hier lief `runPublishPreflight(model)` **ohne** Profil — also immer mit der Vorgabe.
              Eine Wahl, die nirgends landet, ist keine Wahl: nach Speichern und Wiedereroeffnen ergab dasselbe
              Dokument **andere** Befunde. Echte Beschriftung (`htmlFor`), nicht nur ein Platzhalter.
            */}
            <div className="space-y-1">
              <label className="text-slate-400 block" htmlFor={`${formId}-preflight-profile`}>{t('preflightProfile')}</label>
              <select
                id={`${formId}-preflight-profile`}
                data-publish-preflight-profile={report.profileId}
                value={activePublishPreflightProfile(model).outputProfileId}
                onChange={(event) => commands.setPreflightProfile(event.target.value)}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100"
              >
                {Object.values(AVAILABLE_ICC_PROFILES).map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.name} · max {profile.maxTicPercent}% TIC</option>
                ))}
              </select>
              {/* Die Bilanz in Worten: Fehler, Warnungen und **wie viele Befunde ein Sprungziel tragen**. */}
              <p data-publish-preflight-summary={report.profileId} className="text-[0.625rem] text-slate-500">{report.summary}</p>
            </div>

            {/*
              **Die kombinierte Exportvorschau** (`AST-1441/1442/1444`).
              Sie zeigt **dieselbe** Funktion, die der Export vor der Ausgabe befragt — *eine Quelle, nicht zwei.*
              Und sie ist **ohne Farbe** lesbar: jede Warnung nennt Art, Grad und einen Satz (`AST-1444`).
            */}
            <section className="space-y-2 pt-2 border-t border-purple-500/20" data-publish-export-preview={preview.profileId}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">{t('exportPreview')}</span>
                {/* Der Zustand steht als **Wort** da, nicht nur als Farbe. */}
                <span data-publish-preview-state={preview.blocking ? 'blocked' : 'allowed'}
                  className={`px-1.5 py-0.5 rounded border text-[0.625rem] font-semibold ${preview.blocking ? 'border-rose-500/50 text-rose-200' : 'border-emerald-500/40 text-emerald-200'}`}>
                  {preview.blocking ? t('previewBlocked') : t('previewAllowed')}
                </span>
              </div>
              <p data-publish-preview-summary={preview.profileId} className="text-[0.625rem] text-slate-500 leading-relaxed">{preview.summary}</p>
              <ul className="space-y-1" data-publish-preview-warning-count={preview.warnings.length}>
                {preview.warnings.map((warning) => (
                  <li key={warning.id} data-publish-preview-warning={warning.kind} data-publish-preview-severity={warning.severity}
                    className="rounded border border-purple-500/20 px-2 py-1 text-[0.625rem] text-slate-300">
                    <span className="font-semibold uppercase tracking-wide">{warning.severity} · {warning.kind}</span>
                    {' — '}{warning.text}
                    {warning.navigable && warning.frameId && (
                      <button type="button" className="ml-1 underline decoration-dotted"
                        onClick={() => navigateToFrameId(warning.frameId!)}>{t('navigate')}</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <div className="space-y-2" data-publish-preflight-count={preflightIssues.length}>
              {preflightIssues.length === 0 && <p className="text-[0.6875rem] text-slate-500">{t('findingsEmpty')}</p>}
              {preflightIssues.map((issue) => {
                const navigable = Boolean(issue.frameId || issue.pageId);
                return (
                <div
                  key={issue.id}
                  data-publish-finding={issue.id}
                  data-publish-finding-severity={issue.severity}
                  className={`p-2.5 rounded-lg border flex items-start gap-2.5 ${
                    issue.severity === 'error'
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                      : issue.severity === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                      : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-200'
                  }`}
                >
                  {issue.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <span className="text-[0.625rem] font-bold uppercase tracking-wider opacity-75">
                      {publishFindingCategoryText(issue.category, locale)}
                    </span>
                    <p className="text-[0.6875rem] leading-tight">{publishFindingMessage(issue, locale)}</p>
                    {navigable && (
                      <button type="button" onClick={() => navigateToFinding(issue)} className="text-[0.625rem] underline decoration-dotted text-current opacity-80 hover:opacity-100">
                        {t('navigate')}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-purple-500/20">
              <label className="flex items-center justify-between text-[0.6875rem] text-slate-300">
                <span>{t('simulateOverprint')}</span>
                <input
                  type="checkbox"
                  checked={model.cmykSimulated}
                  onChange={(e) => onUpdateModel(prev => ({ ...prev, cmykSimulated: e.target.checked }))}
                  className="rounded border-purple-500/40 bg-purple-950 text-purple-600 focus:ring-0"
                />
              </label>
            </div>
          </div>
        ) : selectedFrame ? (
          /* Selected Frame Properties */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-purple-200 uppercase tracking-wider text-[0.6875rem]">
                {publishFrameTypeText(selectedFrame.type, locale)} {t('frame')} ({selectedFrame.id})
              </span>
              <button
                type="button"
                onClick={() => commands.removeFrame(selectedFrame.id)}
                className="p-1 rounded hover:bg-rose-900/40 text-rose-400 transition-colors"
                aria-label={t('deleteFrame')} title={t('deleteFrame')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tastatur: jede Richtung als Knopf, damit die Praezisionsbewegung nicht nur an der Tastatur haengt. */}
            <div className="flex items-center gap-1" aria-label={t('nudgeHint')} title={t('nudgeHint')}>
              {NUDGE_DIRECTIONS.map(direction => (
                <button key={direction} type="button" data-publish-nudge={direction}
                  onClick={() => commands.nudgeFrame(selectedFrame.id, direction, false)}
                  className="w-6 h-6 rounded bg-purple-950/40 text-slate-300 hover:bg-purple-900/40 font-mono text-[0.625rem]">
                  {direction === 'left' ? '<' : direction === 'right' ? '>' : direction === 'up' ? '^' : 'v'}
                </button>
              ))}
              <span className="ml-1 text-[0.625rem] text-slate-500">{PUBLISH_NUDGE_STEP_MM} mm / {PUBLISH_NUDGE_COARSE_MM} mm</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[0.6875rem]">
              <div>
                <label className="text-slate-400 block mb-1">{t('xPosition')}</label>
                <input type="number" step="0.1" value={selectedFrame.xMm} aria-label={t('xPosition')}
                  onChange={(e) => commands.setFrameRect(selectedFrame.id, { x: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('yPosition')}</label>
                <input type="number" step="0.1" value={selectedFrame.yMm} aria-label={t('yPosition')}
                  onChange={(e) => commands.setFrameRect(selectedFrame.id, { y: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('width')}</label>
                <input type="number" step="0.1" min="0.1" value={selectedFrame.widthMm} aria-label={t('width')}
                  onChange={(e) => commands.setFrameRect(selectedFrame.id, { width: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('height')}</label>
                <input type="number" step="0.1" min="0.1" value={selectedFrame.heightMm} aria-label={t('height')}
                  onChange={(e) => commands.setFrameRect(selectedFrame.id, { height: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('rotation')}</label>
                <input type="number" step="1" value={selectedFrame.rotationDeg} aria-label={t('rotation')}
                  onChange={(e) => commands.setFrameRect(selectedFrame.id, { rotationDeg: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-1.5 text-[0.6875rem] text-slate-300">
                  <input type="checkbox" checked={selectedFrame.locked} aria-label={t('locked')}
                    onChange={(e) => commands.updateFrame(selectedFrame.id, { locked: e.target.checked })} />
                  {t('locked')}
                </label>
                <label className="flex items-center gap-1.5 text-[0.6875rem] text-slate-300">
                  <input type="checkbox" checked={selectedFrame.hidden} aria-label={t('hidden')}
                    onChange={(e) => commands.updateFrame(selectedFrame.id, { hidden: e.target.checked })} />
                  {t('hidden')}
                </label>
              </div>
            </div>

            {textFrame && (
              <div className="space-y-3 pt-3 border-t border-purple-500/20">
                {/* Ueberlauf: die Zahl sagt, was verloren geht — nicht nur dass etwas nicht passt. */}
                <p data-publish-overset={lostChars > 0 ? String(lostChars) : 'none'}
                  className={`rounded px-2 py-1 text-[0.6875rem] ${lostChars > 0 ? 'bg-rose-950/40 text-rose-200 border border-rose-500/40' : 'bg-emerald-950/20 text-emerald-200 border border-emerald-500/30'}`}>
                  {lostChars > 0 ? t('oversetWarning').replace('{count}', String(lostChars)) : t('oversetNone')}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">{t('fontSize')}</label>
                    <input type="number" min="1" max="720" value={textFrame.typography?.fontSizePt ?? textFrame.fontSizePt ?? 10} aria-label={t('fontSize')}
                      onChange={(e) => commands.updateFrame(textFrame.id, { typography: { ...(textFrame.typography ?? defaultTypography()), fontSizePt: Number(e.target.value) } })}
                      className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">{t('internalColumns')}</label>
                    <select value={textFrame.text?.columns ?? textFrame.columns ?? 1} aria-label={t('internalColumns')}
                      onChange={(e) => commands.updateFrame(textFrame.id, { columns: Number(e.target.value), text: { ...(textFrame.text ?? defaultTextOptions()), columns: Number(e.target.value) } })}
                      className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                      {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-slate-400 block mb-1">{t('tracking')}</label>
                    <input type="number" step="1" min="-1000" max="10000" value={textFrame.typography?.tracking ?? 0} aria-label={t('tracking')}
                      onChange={(e) => commands.setTracking(textFrame.id, Number(e.target.value))}
                      className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                  </div>
                </div>

                <label className="flex items-center justify-between text-[0.6875rem] text-slate-300">
                  <span className="flex items-center gap-1.5"><AlignJustify className="w-3 h-3 text-purple-400" />{t('alignBaselineGrid')}</span>
                  <input type="checkbox" checked={textFrame.text?.alignToBaselineGrid ?? false}
                    onChange={(e) => commands.setBaselineGrid(textFrame.id, e.target.checked)} />
                </label>

                <div>
                  <label className="text-slate-400 block mb-1 flex items-center gap-1.5"><Type className="w-3 h-3 text-purple-400" />{t('style')}</label>
                  <select value={textFrame.paragraphStyleId ?? ''} aria-label={t('style')}
                    onChange={(e) => e.target.value && commands.assignStyle(textFrame.id, e.target.value)}
                    className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                    <option value="">{t('noStyle')}</option>
                    {model.styles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                  </select>
                </div>

                {/*
                  **Einen Stil anlegen** (`AST-1386`) — der Einstieg, der fehlte.
                  Gemessen: Zuweisen war erreichbar, Erzeugen nicht — in einem leeren Dokument (das dieser Batch
                  erst moeglich gemacht hat) stand die Stilliste damit **immer** leer und der Waehler war nutzlos.
                */}
                <div className="space-y-1" data-publish-new-style="true">
                  <label className="text-slate-400 block" htmlFor={`${formId}-style-name`}>{t('newStyle')}</label>
                  <input id={`${formId}-style-name`} type="text" value={newStyleName} aria-label={t('styleName')} placeholder={t('styleName')}
                    onChange={(e) => setNewStyleName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitStyle(); } }}
                    className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                  <div className="flex items-center gap-1">
                    <select value={newStyleKind} aria-label={t('styleKind')}
                      onChange={(e) => setNewStyleKind(e.target.value as PublishStyleKind)}
                      className="flex-1 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                      {PUBLISH_STYLE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                    <input type="number" min="1" max="720" value={newStyleSize} aria-label={t('fontSize')}
                      onChange={(e) => setNewStyleSize(Number(e.target.value))}
                      className="w-16 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                    <button type="button" data-publish-create-style="true" onClick={submitStyle} disabled={newStyleName.trim().length === 0}
                      className="px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-purple-200 disabled:opacity-40">
                      {t('createStyle')}
                    </button>
                  </div>
                </div>

                {/*
                  **Mehrspaltige Typografie** (`AST-1381/1382/1384`).
                  Gemessen vorher: `textWrap`, `columns` (nur gezeichnet) und `PublishTypography.keep` wurden von
                  **niemandem** gelesen. Drei echte Beschriftungen, drei Bedienelemente, und die Zahlen, die der
                  Nutzer sieht, sind **dieselben**, die gemessen werden (`publishWrapObstacles`,
                  `publishColumnDistribution`).
                */}
                <div className="space-y-2 pt-2 border-t border-purple-500/20">
                  <div>
                    <label className="text-slate-400 block mb-1" htmlFor={`${formId}-wrap-mode`}>{t('textWrap')}</label>
                    <div className="flex items-center gap-1">
                      <select id={`${formId}-wrap-mode`} data-publish-wrap-mode={wrap.mode}
                        value={wrap.mode}
                        onChange={(e) => commands.setTextWrap(textFrame.id, e.target.value as PublishTextWrapMode, wrap.offsetMm)}
                        className="flex-1 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                        {PUBLISH_TEXT_WRAP_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
                      </select>
                      <input type="number" min="0" max={PUBLISH_TEXT_FLOW_LIMITS.maxWrapOffsetMm} step="0.5" value={wrap.offsetMm}
                        aria-label={t('wrapGap')} data-publish-wrap-gap={wrap.offsetMm}
                        onChange={(e) => commands.setTextWrap(textFrame.id, wrap.mode, Number(e.target.value))}
                        className="w-20 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                    </div>
                    <p data-publish-wrap-summary={wrap.mode} className="text-[0.625rem] text-slate-500">{wrapSummary}</p>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1" htmlFor={`${formId}-columns`}>{t('columns')}</label>
                    <div className="flex items-center gap-2">
                      <input id={`${formId}-columns`} type="number" min="1" max={PUBLISH_TEXT_FLOW_LIMITS.maxColumns}
                        value={textFrame.text?.columns ?? textFrame.columns ?? 1}
                        data-publish-columns={textFrame.text?.columns ?? textFrame.columns ?? 1}
                        onChange={(e) => commands.setColumns(textFrame.id, Number(e.target.value))}
                        className="w-20 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                      {/* Der Ausgleich als **Zahl**: Unterschied zwischen vollster und leerster Spalte. */}
                      <p data-publish-column-balance={columnBalanceText} className="text-[0.625rem] text-slate-500 flex-1">
                        {columnBalanceText}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block">{t('paragraphBreak')}</span>
                    <label className="flex items-center gap-2 text-[0.6875rem] text-slate-300">
                      <input type="checkbox" data-publish-hyphenation={textBreak.hyphenation ? 'on' : 'off'} checked={textBreak.hyphenation}
                        onChange={(e) => commands.setParagraphBreak(textFrame.id, { ...textBreak, hyphenation: e.target.checked })} />
                      {t('hyphenation')}
                    </label>
                    <label className="flex items-center gap-2 text-[0.6875rem] text-slate-300">
                      <input type="checkbox" data-publish-keep-together={textBreak.keepLinesTogether ? 'on' : 'off'} checked={textBreak.keepLinesTogether}
                        onChange={(e) => commands.setParagraphBreak(textFrame.id, { ...textBreak, keepLinesTogether: e.target.checked })} />
                      {t('keepLinesTogether')}
                    </label>
                    <div className="flex items-center gap-1">
                      <label className="text-[0.625rem] text-slate-400 flex-1" htmlFor={`${formId}-keep-first`}>{t('keepFirstLines')}</label>
                      <input id={`${formId}-keep-first`} type="number" min="0" max={PUBLISH_TEXT_FLOW_LIMITS.maxKeepLines} value={textBreak.keepFirstLines}
                        onChange={(e) => commands.setParagraphBreak(textFrame.id, { ...textBreak, keepFirstLines: Number(e.target.value) })}
                        className="w-16 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                      <label className="text-[0.625rem] text-slate-400 flex-1" htmlFor={`${formId}-keep-last`}>{t('keepLastLines')}</label>
                      <input id={`${formId}-keep-last`} type="number" min="0" max={PUBLISH_TEXT_FLOW_LIMITS.maxKeepLines} value={textBreak.keepLastLines}
                        onChange={(e) => commands.setParagraphBreak(textFrame.id, { ...textBreak, keepLastLines: Number(e.target.value) })}
                        className="w-16 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                    </div>
                    {/* Ein **benannter** Widerspruch statt eines stillen Fehlers. */}
                    {breakConflict && <p data-publish-break-conflict="true" className="text-[0.625rem] text-amber-300">{t('breakConflict')}</p>}
                  </div>
                </div>

                {/* Story-Fluss: verketten, trennen, Ueberlauf aufloesen. Alles drei fehlte sichtbar. */}
                <div className="space-y-2 pt-2 border-t border-purple-500/20" data-publish-thread={threadInfo?.linked ? 'linked' : 'standalone'}>
                  <span className="text-slate-400 block">{t('threading')}</span>
                  <p className="text-[0.625rem] text-slate-500">
                    {threadInfo?.linked ? t('threadLinked').replace('{count}', `${threadInfo.position}/${threadInfo.length}`) : t('threadUnlinked')}
                  </p>
                  {/*
                    Verketten: nur Rahmen anbieten, die als Fortsetzung taugen.
                    Ein Ziel, das schon eine Fortsetzung hat oder selbst mitten in einer Story steckt, wuerde beim
                    Verketten abgelehnt — es hier gar nicht erst anzubieten ist die ehrlichere Oberflaeche.
                  */}
                  {!threadInfo?.linked && linkCandidates.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-slate-400 block" htmlFor={`${threadTargetId}-link`}>{t('threadNext')}</label>
                      <select
                        id={`${threadTargetId}-link`}
                        aria-label={t('threadNext')}
                        value={linkTarget}
                        onChange={(event) => { setLinkTarget(event.target.value); if (event.target.value) commands.linkThread(textFrame.id, event.target.value); }}
                        className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100"
                      >
                        <option value="">—</option>
                        {linkCandidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.id}</option>)}
                      </select>
                    </div>
                  )}
                  {threadInfo?.linked && threadInfo.position === threadInfo.length && (
                    <button type="button" onClick={() => commands.appendThreadFrame(textFrame.id)}
                      className="w-full px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-purple-200 flex items-center justify-center gap-1.5">
                      <Link2 className="w-3 h-3" />{t('threadNext')}
                    </button>
                  )}
                  {threadInfo?.linked && (
                    <button type="button" onClick={() => commands.unlinkThread(textFrame.id)}
                      className="w-full px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-purple-200 flex items-center justify-center gap-1.5">
                      <Unlink className="w-3 h-3" />{t('threadUnlink')}
                    </button>
                  )}
                  {lostChars > 0 && (
                    <button type="button" onClick={() => commands.resolveOverflow(textFrame.id)}
                      className="w-full px-2 py-1 rounded bg-amber-950/50 border border-amber-500/40 text-amber-200">
                      {t('threadResolve')}
                    </button>
                  )}
                </div>

                {/* Farbfelder: Prozess- und Sonderfarben getrennt, weil die Anzeige sie unterscheiden muss. */}
                <div className="space-y-2 pt-2 border-t border-purple-500/20">
                  <span className="text-slate-400 block flex items-center gap-1.5"><Palette className="w-3 h-3 text-purple-400" />{t('swatchFill')}</span>
                  <div className="flex flex-wrap gap-1" data-publish-swatch-count={model.swatches.length}>
                    {(model.swatches.length > 0 ? model.swatches : []).map(swatch => (
                      <button key={swatch.id} type="button" data-publish-swatch={swatch.id}
                        onClick={() => commands.assignSwatch(textFrame.id, swatch.id, 'fill')}
                        title={`${swatch.name} · ${swatch.space}${swatch.space === 'Spot' ? ` (${t('spotColour')})` : ''}`}
                        className={`px-1.5 py-0.5 rounded border text-[0.625rem] ${swatch.space === 'Spot' ? 'border-dashed border-purple-400/60' : 'border-purple-500/30'} text-slate-300`}>
                        {swatch.name}{swatch.space === 'Spot' ? ' ◇' : ''}
                      </button>
                    ))}
                    {model.swatches.length === 0 && <span className="text-[0.625rem] text-slate-500">{t('noSwatch')}</span>}
                  </div>

                  {/*
                    **Ein Farbfeld anlegen** (`AST-1396`) — der Einstieg, der fehlte.
                    Prozess- und Sonderfarbe sind **getrennte** Wege: der Farbraum wird gewaehlt, und bei
                    Sonderfarbe ist der Name Pflicht (der vorhandene Aufnehmer prueft das).
                  */}
                  <div className="space-y-1" data-publish-new-swatch="true">
                    <label className="text-slate-400 block" htmlFor={`${formId}-swatch-name`}>{t('newSwatch')}</label>
                    <input id={`${formId}-swatch-name`} type="text" value={newSwatchName} aria-label={t('swatchName')} placeholder={t('swatchName')}
                      onChange={(e) => setNewSwatchName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSwatch(); } }}
                      className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                    <div className="flex items-center gap-1">
                      <select value={newSwatchSpace} aria-label={t('swatchSpace')}
                        onChange={(e) => setNewSwatchSpace(e.target.value as PublishSwatch['space'])}
                        className="flex-1 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                        {PUBLISH_SWATCH_SPACES.map(space => <option key={space} value={space}>{space}</option>)}
                      </select>
                      {newSwatchSpace === 'Spot' && (
                        <input type="text" value={newSpotName} aria-label={t('spotColour')} placeholder={t('spotColour')}
                          onChange={(e) => setNewSpotName(e.target.value)}
                          className="flex-1 bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                      )}
                      <button type="button" data-publish-create-swatch="true" onClick={submitSwatch} disabled={newSwatchName.trim().length === 0}
                        className="px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-purple-200 disabled:opacity-40">
                        {t('createSwatch')}
                      </button>
                    </div>
                  </div>
                </div>

                {/*
                  **Das Ausgabeprofil anzeigen** (`AST-1396`) — „Spot-/Prozessfarben getrennt behandeln,
                  Ausgabeprofil anzeigen". Die Aussage nennt **beide** Tatsachen: welches Profil und ob es **im
                  Dokument liegt** (`embedded`) oder nur als registrierter Name benutzt wird (`referenced`).
                */}
                <div className="pt-2 border-t border-purple-500/20" data-publish-output-profile={outputProfile.profileId}>
                  <span className="text-slate-400 block">{t('outputProfile')}</span>
                  <p data-publish-output-profile-state={outputProfile.state} className="text-[0.625rem] text-slate-500">{outputProfile.summary}</p>
                </div>

                {/* Barrierefreiheit: Alternativtext und Rolle. Beides war nicht setzbar. */}
                <div className="space-y-2 pt-2 border-t border-purple-500/20">
                  <span className="text-slate-400 block flex items-center gap-1.5"><Accessibility className="w-3 h-3 text-purple-400" />{t('altText')}</span>
                  <textarea value={selectedFrame.altText ?? ''} aria-label={t('altText')} rows={2}
                    onChange={(e) => commands.updateFrame(selectedFrame.id, { altText: e.target.value })}
                    className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100 resize-none" />
                  <label className="text-slate-400 block">{t('semanticRole')}</label>
                  <select value={selectedFrame.semanticRole ?? 'P'} aria-label={t('semanticRole')}
                    onChange={(e) => commands.updateFrame(selectedFrame.id, { semanticRole: e.target.value as PublishFrame['semanticRole'] })}
                    className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                    {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                </div>

                <div className="pt-2 border-t border-purple-500/20">
                  <button type="button" onClick={() => commands.insertTable(selectedFrame.id, 'Price overview', 4, 3)}
                    className="w-full px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-purple-200 flex items-center justify-center gap-1.5">
                    <Table2 className="w-3 h-3" />{t('insertTable')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Page Geometry Properties */
          <div className="space-y-4">
            <h4 className="font-semibold text-purple-200 uppercase tracking-wider text-[0.6875rem]">
              {t('pageSetup')}
            </h4>

            <div className="grid grid-cols-2 gap-2 text-[0.6875rem]">
              <div>
                <label className="text-slate-400 block mb-1">{t('topMargin')}</label>
                <input type="number" step="0.5" value={geometry.marginsMm.top} aria-label={t('topMargin')}
                  onChange={(e) => commands.updateGeometry({ marginsMm: { ...geometry.marginsMm, top: Number(e.target.value) } })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('bottomMargin')}</label>
                <input type="number" step="0.5" value={geometry.marginsMm.bottom} aria-label={t('bottomMargin')}
                  onChange={(e) => commands.updateGeometry({ marginsMm: { ...geometry.marginsMm, bottom: Number(e.target.value) } })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('leftMargin')}</label>
                <input type="number" step="0.5" value={geometry.marginsMm.left} aria-label={t('leftMargin')}
                  onChange={(e) => commands.updateGeometry({ marginsMm: { ...geometry.marginsMm, left: Number(e.target.value) } })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('rightMargin')}</label>
                <input type="number" step="0.5" value={geometry.marginsMm.right} aria-label={t('rightMargin')}
                  onChange={(e) => commands.updateGeometry({ marginsMm: { ...geometry.marginsMm, right: Number(e.target.value) } })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
            </div>

            <div className="pt-3 border-t border-purple-500/20 space-y-2">
              <div>
                <label className="text-slate-400 block mb-1">{t('bleedBoundary')}</label>
                <input type="number" step="0.5" min="0" max="100" value={geometry.bleedMm} aria-label={t('bleedBoundary')}
                  onChange={(e) => commands.updateGeometry({ bleedMm: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('columnGutter')}</label>
                <input type="number" step="0.5" value={geometry.columnGutterMm} aria-label={t('columnGutter')}
                  onChange={(e) => commands.updateGeometry({ columnGutterMm: Number(e.target.value) })}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
              </div>
            </div>

            {/* Master-Seite, Drehung und Seitenanlage: alles drei hatte keinen Einstieg. */}
            {activePage && (
              <div className="pt-3 border-t border-purple-500/20 space-y-2">
                <label className="text-slate-400 block">{t('masterPage')}</label>
                <select value={activePage.masterPageId ?? ''} aria-label={t('masterPage')}
                  onChange={(e) => commands.setMaster(activePage.id, e.target.value || null)}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                  <option value="">{t('masterNone')}</option>
                  {model.masterPages.map(master => <option key={master.id} value={master.id}>{master.name}</option>)}
                </select>

                <label className="text-slate-400 block">{t('rotation')}</label>
                <select value={activePage.rotationDeg} aria-label={t('rotation')}
                  onChange={(e) => commands.setRotation(activePage.id, Number(e.target.value) as PublishPageRotation)}
                  className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100">
                  {PUBLISH_PAGE_ROTATIONS.map(rotation => <option key={rotation} value={rotation}>{rotation}°</option>)}
                </select>

                {model.masterPages.map(master => (
                  <div key={master.id} className="space-y-1 pt-2 border-t border-purple-500/10">
                    <span className="text-[0.625rem] uppercase tracking-wider text-slate-500">{master.name}</span>
                    <input type="text" value={master.headerText} aria-label={t('masterHeader')} placeholder={t('masterHeader')}
                      onChange={(e) => commands.updateMaster(master.id, { headerText: e.target.value })}
                      className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                    <input type="text" value={master.footerText} aria-label={t('masterFooter')} placeholder={t('masterFooter')}
                      onChange={(e) => commands.updateMaster(master.id, { footerText: e.target.value })}
                      className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-100" />
                    <label className="flex items-center justify-between text-[0.6875rem] text-slate-300">
                      <span>{t('masterPageNumbers')}</span>
                      <input type="checkbox" checked={master.showPageNumbers}
                        onChange={(e) => commands.updateMaster(master.id, { showPageNumbers: e.target.checked })} />
                    </label>
                  </div>
                ))}

                <button type="button" onClick={commands.addPage}
                  className="w-full px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-purple-200">
                  {'+ 1'}
                </button>
              </div>
            )}

            {oversetIds.size > 0 && (
              <p data-publish-page-overset={oversetIds.size} className="rounded px-2 py-1 text-[0.6875rem] bg-rose-950/40 text-rose-200 border border-rose-500/40">
                {t('oversetWarning').replace('{count}', String(oversetIds.size))}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function defaultTypography(): NonNullable<PublishFrame['typography']> {
  // Keine eigene Kopie: die Vorgaben stehen im Dokumentmodell, und zwei Saetze Vorgaben waeren zwei Wahrheiten.
  return createDefaultPublishTypography();
}

function defaultTextOptions(): NonNullable<PublishFrame['text']> {
  return createDefaultTextOptions();
}
