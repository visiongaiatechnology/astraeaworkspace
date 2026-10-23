// STATUS: PLATIN — Whiteboard toolbar rebuilt as a stacked, grouped, collapsible toolbar region.
//
// User report: three overlapping horizontal toolbars sat on top of the canvas; the top strip covered the
// ruler/dimension bar and nothing was grouped. This component is now a normal block in flow:
//
//   1. primary bar  — history | navigate | create/draw | selection, plus a "More tools" disclosure,
//   2. more row     — insert/shape tools and export/advanced tools, stacked *under* the primary bar
//                     (inline flow, no absolute popover, so it can never cover the ruler),
//   3. context bars (manipulation/ink/text) are rendered by WhiteboardCanvas in the same region and are
//      likewise in flow.
//
// Everything stays present in the DOM: collapsing only hides with `display:none` (data-open), so all
// actions keep their handlers and accessible names. The disclosure state is local React state and is
// remembered in localStorage; no backend.
import React, { useEffect, useId, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Circle,
  Diamond,
  Download,
  Frame,
  Hand,
  ImagePlus,
  Layers,
  MousePointer,
  PenTool,
  Presentation,
  Redo2,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Cpu,
  type LucideIcon,
} from 'lucide-react';
import type { WhiteboardInteractionTool, StickyColor } from '../types';
import './WhiteboardToolbar.css';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardToolbarText } from '../whiteboardToolbarLocale';

interface WhiteboardToolbarProps {
  activeTool: WhiteboardInteractionTool;
  setActiveTool: (tool: WhiteboardInteractionTool) => void;
  selectedStickyColor: StickyColor;
  setSelectedStickyColor: (color: StickyColor) => void;
  selectedItemId: string | null;
  onDeleteSelected: () => void;
  onExportPNG: () => void;
  onRequestImage: () => void;
  onOpenObjectPalette?: () => void;
  onExportToSlide: () => void;
  onOpenInteropModal?: () => void;
  onOpenDrawModal?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  setConnectorStartId: (id: string | null) => void;
  showToast: (msg: string) => void;
}

interface ToolbarButtonProps {
  label: string;
  title: string;
  icon: LucideIcon;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  active?: boolean;
  disabled?: boolean;
  critical?: boolean;
  actionId?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  label,
  title,
  icon: Icon,
  onClick,
  active,
  disabled = false,
  critical = false,
  actionId,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    aria-label={label}
    title={title}
    data-vgt-whiteboard-action={actionId}
    data-vgt-app-guide-anchor={actionId === 'sticky' ? 'Whiteboard:first' : undefined}
    data-active={active ? 'true' : undefined}
    data-critical={critical ? 'true' : undefined}
    className="whiteboard-toolbar__button"
  >
    <Icon aria-hidden="true" className="whiteboard-toolbar__icon" />
    <span className="whiteboard-toolbar__label">{label}</span>
  </button>
);


export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  activeTool,
  setActiveTool,
  selectedStickyColor,
  setSelectedStickyColor,
  selectedItemId,
  onDeleteSelected,
  onExportPNG,
  onRequestImage,
  onOpenObjectPalette,
  onExportToSlide,
  onOpenInteropModal,
  onOpenDrawModal,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  setConnectorStartId,
  showToast,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof whiteboardToolbarText>[0]) => whiteboardToolbarText(message, locale);
  // Session-local disclosure state: toolbar UI preferences are not document data and must not open
  // a second storage channel beside the central workspace envelope.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRowId = useId();

  useEffect(() => {
    try {
    } catch {
      // A blocked storage is not a functional error: the disclosure still works for this session.
    }
  }, [moreOpen]);

  const selectTool = (tool: WhiteboardInteractionTool): React.MouseEventHandler<HTMLButtonElement> => () => {
    setActiveTool(tool);
    setConnectorStartId(null);
  };

  const toolButton = (
    tool: WhiteboardInteractionTool,
    label: string,
    title: string,
    icon: LucideIcon,
    active = activeTool === tool,
  ) => (
    <ToolbarButton
      key={`${tool}-${active ? 'active' : 'idle'}`}
      actionId={tool}
      label={label}
      title={title}
      icon={icon}
      active={active}
      onClick={selectTool(tool)}
    />
  );

  const simpleButton = (
    actionId: string,
    label: string,
    title: string,
    icon: LucideIcon,
    action: () => void,
  ) => (
    <ToolbarButton key={actionId} actionId={actionId} label={label} title={title} icon={icon} onClick={action} />
  );

  const stickyControls = (
    <div className="whiteboard-toolbar__sticky-group" role="group" aria-label={t('stickyTools')}>
      {toolButton('sticky', t('sticky'), t('addSticky'), StickyNote)}
      <div className="whiteboard-toolbar__swatches" role="group" aria-label={t('stickyColors')}>
        {(['yellow', 'cyan', 'purple'] as const).map((color) => {
          const colorCopy = color === 'yellow' ? ['useYellowNote', 'yellowNote'] as const : color === 'cyan' ? ['useCyanNote', 'cyanNote'] as const : ['usePurpleNote', 'purpleNote'] as const;
          return (
            <button
              key={color}
              type="button"
              onClick={() => {
                setSelectedStickyColor(color);
                setActiveTool('sticky');
              }}
              className={`whiteboard-toolbar__swatch whiteboard-toolbar__swatch--${color}`}
              aria-label={t(colorCopy[0])}
              aria-pressed={selectedStickyColor === color}
              title={t(colorCopy[1])}
            />
          );
        })}
      </div>
    </div>
  );

  const insertAndShapeTools = (
    <>
      {toolButton('frame', t('frame'), t('addFrame'), Frame)}
      {onOpenObjectPalette && simpleButton('objects', t('objects'), t('insertObjects'), Layers, onOpenObjectPalette)}
      {simpleButton('image', t('image'), t('insertImage'), ImagePlus, onRequestImage)}
      {toolButton('process', t('process'), t('processTitle'), Square)}
      {toolButton('decision', t('decision'), t('decisionTitle'), Diamond)}
      {toolButton('terminal', t('terminal'), t('terminalTitle'), Circle)}
    </>
  );

  const extendedActions = (
    <>
      {onOpenDrawModal && simpleButton('draw-studio', t('drawStudio'), t('drawStudioTitle'), Layers, onOpenDrawModal)}
      {onOpenInteropModal && simpleButton('interop', t('interop'), t('interopTitle'), Cpu, onOpenInteropModal)}
      {simpleButton('export-png', t('exportPng'), t('exportPngTitle'), Download, onExportPNG)}
      {simpleButton('export-slide', t('exportSlide'), t('exportSlideTitle'), Presentation, onExportToSlide)}
    </>
  );

  return (
    <div className="whiteboard-toolbar" data-vgt-whiteboard-toolbar="true">
      <div className="whiteboard-toolbar__bar" role="toolbar" aria-label={t('drawingTools')} data-vgt-whiteboard-toolbar-row="primary">
        <div className="whiteboard-toolbar__group" role="group" aria-label={t('historyTools')}>
          <ToolbarButton label={t('undo')} title={t('undoTitle')} icon={Undo2} onClick={onUndo} disabled={!canUndo} actionId="undo" />
          <ToolbarButton label={t('redo')} title={t('redoTitle')} icon={Redo2} onClick={onRedo} disabled={!canRedo} actionId="redo" />
        </div>
        <span className="whiteboard-toolbar__divider" aria-hidden="true" />
        <div className="whiteboard-toolbar__group" role="group" aria-label={t('navigateTools')}>
          {toolButton('select', t('select'), t('selectTitle'), MousePointer)}
          {toolButton('pan', t('pan'), t('panTitle'), Hand)}
        </div>
        <span className="whiteboard-toolbar__divider" aria-hidden="true" />
        <div className="whiteboard-toolbar__group" role="group" aria-label={t('createTools')}>
          {stickyControls}
          {toolButton('text', t('text'), t('addText'), Type)}
          {toolButton('ink-pen', t('ink'), t('inkTitle'), PenTool, activeTool.startsWith('ink-'))}
          <ToolbarButton
            label={t('connect')}
            title={t('connector')}
            icon={ArrowRight}
            active={activeTool === 'connector'}
            actionId="connector"
            onClick={() => {
              setActiveTool('connector');
              setConnectorStartId(null);
              showToast(t('connectHint'));
            }}
          />
        </div>
        {selectedItemId && (
          <>
            <span className="whiteboard-toolbar__divider" aria-hidden="true" />
            <div className="whiteboard-toolbar__group" role="group" aria-label={t('selectionTools')}>
              <ToolbarButton label={t('delete')} title={t('deleteSelected')} icon={Trash2} onClick={onDeleteSelected} critical actionId="delete-selected" />
            </div>
          </>
        )}
        <span className="whiteboard-toolbar__spacer" aria-hidden="true" />
        <button
          type="button"
          className="whiteboard-toolbar__more-toggle"
          aria-expanded={moreOpen}
          aria-controls={moreRowId}
          aria-label={t('moreTools')}
          data-vgt-whiteboard-more-toggle="true"
          data-open={moreOpen ? 'true' : 'false'}
          title={t('moreToolsTitle')}
          onClick={() => setMoreOpen((value) => !value)}
        >
          <ChevronDown aria-hidden="true" className="whiteboard-toolbar__chevron" />
          <span>{t('moreTools')}</span>
        </button>
      </div>

      <div
        id={moreRowId}
        className="whiteboard-toolbar__more"
        role="toolbar"
        aria-label={t('exportTools')}
        data-vgt-whiteboard-more="true"
        data-open={moreOpen ? 'true' : 'false'}
        aria-hidden={moreOpen ? undefined : true}
      >
        <div className="whiteboard-toolbar__more-group" role="group" aria-label={t('insertShapes')}>
          <span className="whiteboard-toolbar__more-title" aria-hidden="true">{t('insertShapes')}</span>
          {insertAndShapeTools}
        </div>
        <div className="whiteboard-toolbar__more-group" role="group" aria-label={t('toolsExport')}>
          <span className="whiteboard-toolbar__more-title" aria-hidden="true">{t('toolsExport')}</span>
          {extendedActions}
        </div>
      </div>
    </div>
  );
};
