// STATUS: DIAMANT VGT SUPREME — Astraea Publish Toolbar (quiet, grouped, collapsible)
//
// **Nutzerbefund:** Eine einzige überladene h-12-Leiste mit 25+ Einzelknöpfen (Seiten, Rahmen, alle Formen,
// SVG, Vault, Zoom, Undo/Redo, Preflight, Studio, fünf Exportziele, Historie) — „riesiges Chaos".
//
// **Neue Struktur (zwei ruhige Ebenen statt einer Wand):**
//   1. Primärleiste `role="toolbar"` mit klar getrennten Gruppen (durch Hairline-Separatoren und, auf breiten
//      Screens, kleine Gruppenlabels):
//        Dokument  — Seiten-Panel, Neues Layoutdokument
//        Einfügen  — Textrahmen, Bildrahmen, Formen (Menü), SVG (Datei), Vault-Asset (mit Grund)
//        Ansicht   — Zoom −/Prozent/+
//        Verlauf   — Undo/Redo
//        Ausgabe   — Preflight, Druckvorstufe, Export (Menü mit allen Zielen)
//   2. Sekundäre „Seite & Dokument"-Leiste (einklappbar, `aria-expanded`): Seitennavigation, Seite anhängen,
//      Spalten-Schnellwahl, Hilfslinien. Seltenes ist damit aus der Primärleiste verschwunden, ohne an
//      Erreichbarkeit zu verlieren.
//
// **Keine Attrappen, keine gelockerten Zusicherungen:**
//   • Alle bisherigen Handler, `aria-label` und `data-*`-Verträge bleiben erhalten (Exportziele, Vault-Einstieg,
//     App-Guide-Anker `Publish:first`/`Publish:second`, Preflight-Zähler).
//   • Die Formen wandern in ein echtes Menü (`aria-haspopup`/`aria-expanded`), der Datei-Einstieg für SVG bleibt
//     ein echtes Dateifeld. Die Vault-Blockierung nennt ihren Grund weiterhin als Text.
//   • Menüs und Einklappen sind lokaler UI-State; keine neue Persistenz, keine neuen Dependencies.
//   • Umbrechen statt Überlappen: die Primärleiste darf bei schmaler Breite in eine zweite Zeile umbrechen.
import React, { useEffect, useRef, useState } from 'react';
import {
  Columns,
  Plus,
  Type,
  Image as ImageIcon,
  Layers,
  CheckCircle2,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  Sliders,
  Undo2,
  Redo2,
  FilePlus2,
  PanelLeft,
  AlertTriangle,
  Shapes,
  FileImage,
  LockKeyhole,
} from 'lucide-react';
import type { PublishDocumentModel } from '../contracts/types';
import { addPublishPage, setActivePublishPage, updateActivePageGeometry } from '../model/publishDocumentEngine';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { publishToolbarFormat, publishToolbarText } from '../publishToolbarLocale';
import { publishExportTargetText, publishWorkspaceText } from '../publishWorkspaceLocale';
import type { PublishExportTarget } from '../interchange/publishExportDelivery';
import type { PublishShapeKind } from '../model/publishShapeOps';
import { PUBLISH_SHAPE_KINDS } from '../model/publishShapeOps';

interface PublishToolbarProps {
  model: PublishDocumentModel;
  onUpdateModel: (updater: (prev: PublishDocumentModel) => PublishDocumentModel) => void;
  onAddFrame: (type: 'text' | 'image') => void;
  /** **Der Einstieg für Vektoren und Formen** (`AST-1406`) — fehlt er, wird kein Formen-Menü gezeigt. */
  onAddShape?: (kind: PublishShapeKind) => void;
  /** **Ein SVG einbetten** (`AST-1407`) — reicht die Bytes des gewählten SVG an die Ansicht. */
  onEmbedSvg?: (file: { name: string; bytes: Uint8Array }) => void;
  /**
   * **Der Einstieg für geschützte Vault-Assets** (`AST-1226`) — fehlt er, wird kein Knopf gezeigt.
   * Die Wirkung liegt in der Ansicht (`placeWorkspaceAsset`); die Leiste löst sie nur aus.
   */
  onPickVaultAsset?: () => void;
  /**
   * Warum der Einstieg gesperrt ist (`null` = bereit). Ein deaktivierter Knopf **nennt** seinen Grund
   * als Text daneben — nicht nur als Tooltip und nicht nur als Farbe.
   */
  vaultAssetBlockedReason?: string | null;
  /** Sichtbarer Einstieg „Neues Layoutdokument". Fehlt er, wird der Knopf nicht gezeigt. */
  onNewDocument?: () => void;
  /** Ein Exportziel je Eintrag im Export-Menü: „PDF/X Export" rief vorher `buildPublishPdf(target:'PDF')` auf. */
  onExport?: (target: PublishExportTarget) => void;
  /** Waehrend des Exports sind die Exporteinträge gesperrt: ein zweiter Lauf erzeugte zwei Dateien. */
  exporting?: PublishExportTarget | null;
  documentTitle?: string;
  showPreflight: boolean;
  onTogglePreflight: () => void;
  onOpenStudioModal?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  pagesPanelOpen?: boolean;
  onTogglePagesPanel?: () => void;
  /** Anzahl der Ueberlaufbefunde, damit der Preflight-Knopf nicht nur eine Farbe zeigt. */
  preflightErrorCount?: number;
}

/** Die Exportziele in der Reihenfolge, in der sie angeboten werden. `pdfx4` ist die Vorgabe. */
export const PUBLISH_EXPORT_TARGETS: readonly PublishExportTarget[] = ['pdfx4', 'pdfx1a', 'html', 'epub', 'package'];

/**
 * Stabile DOM-IDs für die beiden Menüs und die Sekundärleiste.
 *
 * Bewusst **kein** `useId`: die Ansicht wird in einem Determinismus-Test zweimal per
 * `renderToStaticMarkup` gerendert und muss zeichengleich sein (`publishViewRenderWitness`). Statische IDs
 * sind hier zulässig, weil pro Seite genau eine Publish-Ansicht existiert.
 */
const SHAPE_MENU_ID = 'publish-shape-menu';
const EXPORT_MENU_ID = 'publish-export-menu';
const PAGE_BAR_ID = 'publish-page-settings-bar';

/** Gemeinsame Klassen — ruhige, dunkle Glas-Flächen mit violetten Akzenten. */
const GROUP_LABEL = 'hidden 2xl:inline shrink-0 select-none text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500';
const GROUP = 'flex shrink-0 items-center gap-1';
const SEPARATOR = 'mx-0.5 h-5 w-px shrink-0 bg-purple-500/20';
const TOOL_BUTTON = 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-950/40 px-2 py-1.5 text-[0.6875rem] font-medium text-purple-100 transition-colors hover:bg-purple-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-40';
const TOOL_LABEL = 'hidden lg:inline';
const ICON_BUTTON = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-purple-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-30';
const MENU_PANEL = 'absolute top-full z-50 mt-1 rounded-xl border border-purple-500/30 bg-[#120c24] p-2 shadow-2xl shadow-black/60';
const MENU_ITEM = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.6875rem] font-medium text-slate-200 transition-colors hover:bg-purple-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-50';

export const PublishToolbar: React.FC<PublishToolbarProps> = ({
  model,
  onUpdateModel,
  onAddFrame,
  onAddShape,
  onEmbedSvg,
  onPickVaultAsset,
  vaultAssetBlockedReason = null,
  onNewDocument,
  onExport,
  exporting = null,
  documentTitle,
  showPreflight,
  onTogglePreflight,
  onOpenStudioModal,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoomPercent,
  onZoomOut,
  onZoomIn,
  pagesPanelOpen = true,
  onTogglePagesPanel,
  preflightErrorCount = 0,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof publishToolbarText>[0]) => publishToolbarText(message, locale);
  const w = (message: Parameters<typeof publishWorkspaceText>[0]) => publishWorkspaceText(message, locale);
  const busy = exporting !== null;

  /** Lokaler UI-Zustand der neuen Struktur — Menüs und einklappbare Sekundärleiste. */
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [pageBarOpen, setPageBarOpen] = useState(true);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const shapeTriggerRef = useRef<HTMLButtonElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const shapePanelRef = useRef<HTMLDivElement>(null);
  const exportPanelRef = useRef<HTMLDivElement>(null);

  /** Fokussiert direkt nach dem Öffnen den ersten Eintrag — sonst bliebe ein „menu" nur mit Tab erreichbar. */
  const focusFirstMenuItem = (panel: HTMLDivElement | null) => {
    window.setTimeout(() => panel?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 0);
  };

  /**
   * Der Tastaturvertrag eines echten `role="menu"`: Pfeiltasten/Home/End bewegen den Fokus, `Escape`
   * schließt und gibt den Fokus an den Trigger zurück. *Ein Menü ohne diesen Vertrag wäre eine
   * Rollenbehauptung ohne Verhalten.*
   */
  const handleMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    close: () => void,
    trigger: React.RefObject<HTMLButtonElement | null>,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
    if (items.length === 0) return;
    event.preventDefault();
    const active = window.document.activeElement;
    const index = items.indexOf(active as HTMLElement);
    let next = 0;
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
    else if (event.key === 'End') next = items.length - 1;
    items[next]?.focus();
  };

  /**
   * Ein Offenhalten kostet Kontext: Klick außerhalb oder `Escape` schließt jedes offene Menü. Kein
   * zweiter Handler pro Menü — *eine* Regel für beide. Fokus, der im Menü stand, geht an den Trigger zurück.
   */
  useEffect(() => {
    if (!shapeMenuOpen && !exportMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (shapeMenuOpen && !shapeMenuRef.current?.contains(target)) setShapeMenuOpen(false);
      if (exportMenuOpen && !exportMenuRef.current?.contains(target)) setExportMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (shapeMenuOpen) {
        if (shapePanelRef.current?.contains(window.document.activeElement)) shapeTriggerRef.current?.focus();
        setShapeMenuOpen(false);
      }
      if (exportMenuOpen) {
        if (exportPanelRef.current?.contains(window.document.activeElement)) exportTriggerRef.current?.focus();
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [shapeMenuOpen, exportMenuOpen]);

  return (
    <div data-publish-toolbar-stack="true" className="flex shrink-0 flex-col border-b border-purple-500/20 bg-[#0c0817] select-none">
      {/* ── 1. Primärleiste: wenige, klar getrennte Gruppen ─────────────────────────────────────────── */}
      <div
        role="toolbar"
        aria-label={t('toolbar')}
        data-publish-primary-toolbar="true"
        className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5"
      >
        {/* Marke */}
        <div className="flex shrink-0 items-center gap-1.5 pr-1 text-xs font-bold uppercase tracking-wider text-purple-400">
          <Layers className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('dtp')}</span>
        </div>

        <div className={SEPARATOR} aria-hidden="true" />

        {/* Gruppe: Dokument */}
        <div role="group" aria-label={t('documentGroup')} data-publish-group="document" className={GROUP}>
          <span className={GROUP_LABEL}>{t('documentGroup')}</span>
          {onTogglePagesPanel && (
            <button
              type="button"
              onClick={onTogglePagesPanel}
              aria-pressed={pagesPanelOpen}
              aria-label={pagesPanelOpen ? w('hidePages') : w('showPages')}
              title={pagesPanelOpen ? w('hidePages') : w('showPages')}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${pagesPanelOpen ? 'border-purple-500/40 bg-purple-900/40 text-purple-200' : 'border-transparent text-slate-400 hover:bg-purple-900/30 hover:text-slate-200'}`}
            >
              <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {onNewDocument && (
            <button
              type="button"
              onClick={onNewDocument}
              data-publish-new-document-entry="true"
              title={w('newDocumentDescription')}
              className={TOOL_BUTTON}
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className={TOOL_LABEL}>{w('newDocument')}</span>
            </button>
          )}
        </div>

        <div className={SEPARATOR} aria-hidden="true" />

        {/* Gruppe: Einfügen */}
        <div role="group" aria-label={t('insertGroup')} data-publish-group="insert" className={GROUP}>
          <span className={GROUP_LABEL}>{t('insertGroup')}</span>

          <button
            type="button"
            onClick={() => onAddFrame('text')}
            className={TOOL_BUTTON}
            title={t('addTextFrame')}
            aria-label={t('textFrame')}
          >
            <Type className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={TOOL_LABEL}>{t('textFrame')}</span>
          </button>

          <button
            type="button"
            onClick={() => onAddFrame('image')}
            className={TOOL_BUTTON}
            title={t('addImageFrame')}
            aria-label={t('imageFrame')}
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={TOOL_LABEL}>{t('imageFrame')}</span>
          </button>

          {/*
            **Formen als Menü statt Knopfwand** (`AST-1406` bleibt erfüllt): jeder Formtyp behält seinen
            eigenen, benannten Eintrag (`data-publish-add-shape`), nur gebündelt hinter einem echten
            Disclosure-Trigger.
          */}
          {onAddShape && (
            <div ref={shapeMenuRef} className="relative shrink-0">
              <button
                ref={shapeTriggerRef}
                type="button"
                data-publish-shapes-trigger="true"
                aria-haspopup="menu"
                aria-expanded={shapeMenuOpen}
                aria-controls={SHAPE_MENU_ID}
                onClick={() => setShapeMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' || shapeMenuOpen) return;
                  event.preventDefault();
                  setShapeMenuOpen(true);
                  focusFirstMenuItem(shapePanelRef.current);
                }}
                title={t('shapesMenu')}
                className={TOOL_BUTTON}
              >
                <Shapes className="h-3.5 w-3.5" aria-hidden="true" />
                <span className={TOOL_LABEL}>{t('shapesMenu')}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${shapeMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              <div
                ref={shapePanelRef}
                id={SHAPE_MENU_ID}
                role="menu"
                aria-label={t('shapesMenu')}
                onKeyDown={(event) => handleMenuKeyDown(event, () => setShapeMenuOpen(false), shapeTriggerRef)}
                data-publish-shapes-menu={shapeMenuOpen ? 'open' : 'closed'}
                data-publish-menu-placement="below-trigger"
                className={`${MENU_PANEL} left-0 w-64 ${shapeMenuOpen ? 'block' : 'hidden'}`}
              >
                <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('shapesMenu')}</p>
                <div className="grid grid-cols-2 gap-1">
                  {PUBLISH_SHAPE_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={() => { onAddShape(kind); setShapeMenuOpen(false); }}
                      data-publish-add-shape={kind}
                      title={`${t('shape')}: ${kind}`}
                      aria-label={`${t('shape')}: ${kind}`}
                      className="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-950/30 px-2 py-1.5 text-[0.6875rem] text-purple-100 transition-colors hover:bg-purple-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                    >
                      <Shapes className="h-3 w-3" aria-hidden="true" />
                      <span>{kind}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/*
            **Ein SVG einbetten** (`AST-1407`) — ein echtes Dateifeld, kein Attrappen-Knopf.
            Die Bytes gehen durch den **vorhandenen** Aufnehmer (`embedPublishSvg` → `ingestPublishAsset`), der
            Format, Groesse und aktive Inhalte prueft. *Kein zweiter Aufnahmeweg.*
          */}
          {onEmbedSvg && (
            <label
              data-publish-embed-svg="true"
              title={t('embedSvg')}
              className={`${TOOL_BUTTON} cursor-pointer`}
            >
              <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
              <span className={TOOL_LABEL}>{t('embedSvg')}</span>
              <input
                type="file"
                accept="image/svg+xml,.svg"
                className="sr-only"
                aria-label={t('embedSvg')}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file.arrayBuffer().then((buffer) => onEmbedSvg({ name: file.name || 'shape.svg', bytes: new Uint8Array(buffer) }));
                  // Zuruecksetzen, damit dieselbe Datei erneut gewaehlt werden kann.
                  event.target.value = '';
                }}
              />
            </label>
          )}

          {/*
            **AST-1226 — der sichtbare Einstieg für geschützte Vault-Assets in Publish.**
            Gemessen vorher: `VaultPicker` → **0 Treffer** in `apps/publish`. Der Knopf steht hier, weil hier
            schon Bild, Form und SVG gewählt werden — *kein zweiter Ort für dieselbe Wahl.*
            Gesperrt ist er **deaktiviert und benannt**: der Grund steht als Text daneben.
          */}
          {onPickVaultAsset && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                data-vault-picker-entry="Publish"
                onClick={onPickVaultAsset}
                disabled={vaultAssetBlockedReason !== null}
                aria-label="Place a protected Vault asset"
                title={vaultAssetBlockedReason ?? 'Place a protected Vault asset'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2 py-1.5 text-[0.6875rem] font-medium text-emerald-200 transition-colors hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Place a protected Vault asset</span>
              </button>
              {vaultAssetBlockedReason !== null && (
                <span
                  role="status"
                  data-vault-blocked-reason="true"
                  className="max-w-[16rem] truncate text-[0.625rem] leading-tight text-amber-300/80"
                  title={vaultAssetBlockedReason}
                >
                  {vaultAssetBlockedReason}
                </span>
              )}
            </div>
          )}
        </div>

        <div className={SEPARATOR} aria-hidden="true" />

        {/* Gruppe: Ansicht (Zoom) */}
        <div role="group" aria-label={t('zoom')} data-publish-group="view" className={GROUP}>
          <span className={GROUP_LABEL}>{t('viewGroup')}</span>
          <button type="button" onClick={onZoomOut} disabled={zoomPercent <= 100} aria-label={t('zoomOut')} title={t('zoomOut')} className={ICON_BUTTON}>−</button>
          <output aria-live="polite" className="w-11 shrink-0 text-center font-mono text-[0.625rem] text-slate-300">{zoomPercent}%</output>
          <button type="button" onClick={onZoomIn} disabled={zoomPercent >= 300} aria-label={t('zoomIn')} title={t('zoomIn')} className={ICON_BUTTON}>+</button>
        </div>

        <div className={SEPARATOR} aria-hidden="true" />

        {/* Gruppe: Verlauf */}
        <div role="group" aria-label={t('historyGroup')} data-publish-group="history" className={GROUP}>
          <span className={GROUP_LABEL}>{t('historyGroup')}</span>
          <button type="button" onClick={onUndo} disabled={!canUndo} aria-label={t('undo')} title={t('undoTitle')} className={ICON_BUTTON}><Undo2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <button type="button" onClick={onRedo} disabled={!canRedo} aria-label={t('redo')} title={t('redoTitle')} className={ICON_BUTTON}><Redo2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>

        {/* Gruppe: Ausgabe — an das rechte Ende gesetzt, damit die Leiste ruhig atmet. */}
        <div role="group" aria-label={t('outputGroup')} data-publish-group="output" className="ml-auto flex shrink-0 items-center gap-1">
          <span className={GROUP_LABEL}>{t('outputGroup')}</span>

          <button
            type="button"
            onClick={onTogglePreflight}
            aria-pressed={showPreflight}
            data-publish-preflight-trigger="true"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
              showPreflight
                ? 'border-amber-500/50 bg-amber-950/60 text-amber-300'
                : 'border-purple-500/25 bg-purple-950/40 text-slate-200 hover:bg-purple-900/40'
            }`}
            title={t('preflightTitle')}
            aria-label={preflightErrorCount > 0 ? `${t('preflight')} · ${preflightErrorCount}` : t('preflight')}
          >
            {preflightErrorCount > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
            <span className={TOOL_LABEL}>{t('preflight')}</span>
            {/* Die Zahl ist der Grund, nicht die Farbe: „2 Ueberlaufbefunde" statt eines roten Punktes. */}
            {preflightErrorCount > 0 && <span data-publish-preflight-count={preflightErrorCount} className="rounded bg-rose-500/20 px-1 font-mono text-[0.625rem] text-rose-200">{preflightErrorCount}</span>}
          </button>

          {onOpenStudioModal && (
            <button type="button" onClick={onOpenStudioModal} className={TOOL_BUTTON} title={t('studioTitle')} aria-label={t('studio')}>
              <Sliders className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
              <span className={TOOL_LABEL}>{t('studio')}</span>
            </button>
          )}

          {/*
            **Ein Export-Menü statt fünf Einzelknöpfen** — jedes Ziel behält seinen eigenen, benannten Eintrag
            (`data-publish-export-button`) und den Busy-Zustand. Der Trigger trägt den App-Guide-Anker
            `Publish:second`, weil er der sichtbare Ausgabe-Einstieg ist.
          */}
          {onExport && (
            <div ref={exportMenuRef} className="relative shrink-0">
              <button
                ref={exportTriggerRef}
                type="button"
                data-publish-export-trigger="true"
                data-vgt-app-guide-anchor="Publish:second"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                aria-controls={EXPORT_MENU_ID}
                onClick={() => setExportMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' || exportMenuOpen) return;
                  event.preventDefault();
                  setExportMenuOpen(true);
                  focusFirstMenuItem(exportPanelRef.current);
                }}
                title={t('exportMenuTitle')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-white shadow-lg shadow-purple-900/30 transition-all hover:from-purple-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/70"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('exportMenu')}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              <div
                ref={exportPanelRef}
                id={EXPORT_MENU_ID}
                role="menu"
                aria-label={t('exportMenuTitle')}
                onKeyDown={(event) => handleMenuKeyDown(event, () => setExportMenuOpen(false), exportTriggerRef)}
                data-publish-export-menu={exportMenuOpen ? 'open' : 'closed'}
                data-publish-menu-placement="below-trigger"
                className={`${MENU_PANEL} right-0 w-72 ${exportMenuOpen ? 'block' : 'hidden'}`}
              >
                <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('exportMenuTitle')}</p>
                {PUBLISH_EXPORT_TARGETS.map((target) => (
                  <button
                    key={target}
                    type="button"
                    role="menuitem"
                    onClick={() => { setExportMenuOpen(false); onExport(target); }}
                    disabled={busy}
                    aria-busy={exporting === target}
                    aria-label={busy ? w('exportRunning').replace('{target}', publishExportTargetText(target, locale)) : publishExportTargetText(target, locale)}
                    data-publish-export-button={target}
                    className={MENU_ITEM}
                  >
                    <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{publishExportTargetText(target, locale)}</span>
                    {exporting === target && <span className="shrink-0 font-mono text-[0.5625rem] uppercase text-purple-300">running</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Der Titel ist sichtbar: der Dateiname des Exports entsteht daraus. */}
          {documentTitle && (
            <span data-publish-document-title={documentTitle} className="hidden max-w-40 shrink-0 truncate text-[0.625rem] text-slate-500 xl:inline" title={documentTitle}>{documentTitle}</span>
          )}
        </div>
      </div>

      {/* ── 2. Sekundärleiste: Seite & Dokument (einklappbar, seltener gebraucht) ───────────────────── */}
      <div
        data-publish-secondary-bar="true"
        data-publish-secondary-state={pageBarOpen ? 'open' : 'collapsed'}
        className="flex min-h-9 flex-wrap items-center gap-2 border-t border-purple-500/10 bg-[#0a0714] px-3 py-1"
      >
        <button
          type="button"
          data-publish-secondary-toggle="true"
          aria-expanded={pageBarOpen}
          aria-controls={PAGE_BAR_ID}
          aria-label={pageBarOpen ? t('collapseDocumentBar') : t('expandDocumentBar')}
          title={pageBarOpen ? t('collapseDocumentBar') : t('expandDocumentBar')}
          onClick={() => setPageBarOpen((open) => !open)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-purple-900/40 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        >
          {pageBarOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>

        <div id={PAGE_BAR_ID} role="group" aria-label={t('documentBar')} data-publish-page-bar="true" className={`flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 ${pageBarOpen ? '' : 'hidden'}`}>
          {/* Seitennavigation */}
          <div role="group" aria-label={w('pagesPanel')} data-publish-group="page-navigation" className={GROUP}>
            <button
              type="button"
              disabled={model.activePageIndex <= 0}
              onClick={() => onUpdateModel(prev => setActivePublishPage(prev, Math.max(0, prev.activePageIndex - 1)))}
              className={ICON_BUTTON}
              aria-label={t('previousPage')} title={t('previousPage')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="font-mono text-[0.6875rem] font-medium text-purple-200">
              {publishToolbarFormat('pageOf', locale, { count: 0, current: model.activePageIndex + 1, total: model.pagesCount })}
            </span>
            <button
              type="button"
              disabled={model.activePageIndex >= model.pagesCount - 1}
              onClick={() => onUpdateModel(prev => setActivePublishPage(prev, Math.min(prev.pages.length - 1, prev.activePageIndex + 1)))}
              className={ICON_BUTTON}
              aria-label={t('nextPage')} title={t('nextPage')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onUpdateModel(prev => addPublishPage(prev))}
              data-vgt-app-guide-anchor="Publish:first"
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-500/30 bg-purple-950/50 px-2 py-1 text-[0.6875rem] text-purple-300 transition-colors hover:bg-purple-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              title={t('appendPage')}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>{t('add')}</span>
            </button>
          </div>

          <div className={SEPARATOR} aria-hidden="true" />

          {/* Spalten-Schnellwahl der aktiven Seite */}
          <div role="group" aria-label={t('columns')} data-publish-group="columns" className={GROUP}>
            <Columns className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
            <span className="text-[0.6875rem] text-slate-400">{t('columns')}</span>
            {[1, 2, 3, 4].map((cols) => (
              <button
                key={cols}
                type="button"
                aria-label={publishToolbarFormat('setColumns', locale, { count: cols, current: 0, total: 0 })}
                aria-pressed={model.geometry.columns === cols}
                onClick={() => onUpdateModel(prev => updateActivePageGeometry(prev, { columns: cols }))}
                className={`h-6 w-6 rounded text-[0.6875rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
                  model.geometry.columns === cols
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-950/40 text-slate-400 hover:bg-purple-900/40 hover:text-slate-200'
                }`}
              >
                {cols}
              </button>
            ))}
          </div>

          <div className={SEPARATOR} aria-hidden="true" />

          {/* Hilfslinien */}
          <button
            type="button"
            onClick={() => onUpdateModel(prev => ({ ...prev, showGuides: !prev.showGuides }))}
            aria-pressed={model.showGuides}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[0.6875rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
              model.showGuides ? 'border-purple-500/40 bg-purple-900/40 text-purple-300' : 'border-transparent text-slate-400 hover:bg-purple-900/30 hover:text-slate-200'
            }`}
            title={t('toggleGuides')}
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            <span>{t('guides')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
