// STATUS: DIAMANT VGT SUPREME — Accessible draggable/zoomable flow canvas with theme-owned materials.
import React, { useMemo, useRef } from 'react';
import { AlertTriangle, Bug, GitBranch, Link2, Maximize2, PlayCircle, ShieldCheck, X, Zap } from 'lucide-react';
import './AutomateCanvasTheme.css';
import type { AutomateDocumentModel, FlowNode } from '../model/types';
import { moveNode, setDesignerViewport, toggleBreakpoint, validateFlowModel } from '../model/automateFlowCore';
import { automateNodeType, useAutomateCopy } from '../locale/automateLocale';
import { computeTraversedPath, isConnectionOnPath, isNodeOnPath, pathPosition } from '../execution/automatePathCore';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';

interface AutomateCanvasProps {
  model: AutomateDocumentModel;
  onUpdateModel: (updater: (prev: AutomateDocumentModel) => AutomateDocumentModel) => void;
  /** Node id currently arming a new edge, or null when not connecting. */
  connectingFromNodeId?: string | null;
  onStartConnect?: (nodeId: string) => void;
  onCompleteConnect?: (toNodeId: string) => void;
  onCancelConnect?: () => void;
}

interface DragState {
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

function readWorkspaceScale(): number {
  if (typeof document === 'undefined') return 1;
  const fontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.min(4, Math.max(1, fontSize / 16));
}

const NODE_STATUS_CLASS: Record<string, string> = {
  // A trial ("simulated") node was checked, not executed — it must not borrow the success treatment.
  success: 'automate-status-dot--success',
  simulated: 'automate-status-dot--trial',
  failed: 'automate-status-dot--critical',
  cancelled: 'automate-status-dot--critical',
  quarantined: 'automate-status-dot--critical',
  running: 'automate-status-dot--running',
};

function nodeIcon(type: FlowNode['type']): React.ReactNode {
  if (type === 'trigger') return <PlayCircle className="automate-node-icon automate-node-icon--trigger" aria-hidden="true"/>;
  if (type === 'condition' || type === 'switch') return <GitBranch className="automate-node-icon automate-node-icon--control" aria-hidden="true"/>;
  if (type === 'action') return <Zap className="automate-node-icon automate-node-icon--action" aria-hidden="true"/>;
  return <ShieldCheck className="automate-node-icon automate-node-icon--approval" aria-hidden="true"/>;
}

function statusClass(status: FlowNode['lastExecutionStatus']): string {
  return status ? NODE_STATUS_CLASS[status] ?? 'automate-status-dot--idle' : 'automate-status-dot--idle';
}

export const AutomateCanvas: React.FC<AutomateCanvasProps> = ({ model, onUpdateModel, connectingFromNodeId = null, onStartConnect, onCompleteConnect, onCancelConnect }) => {
  const copy = useAutomateCopy();
  const { locale } = useWorkspaceLocale();
  const drag = useRef<DragState | null>(null);
  const [layoutScale, setLayoutScale] = React.useState(readWorkspaceScale);
  const issues = useMemo(() => validateFlowModel(model), [model]);
  // The traversed path is derived once per model change and shared by the edges and the node badges, so
  // the drawing and the text can never disagree.
  const path = useMemo(() => computeTraversedPath(model), [model]);
  const { nodes, connections, selectedNodeId, designer } = model;
  const graphWidth = (Math.max(0, ...nodes.map((node) => node.x + 224)) + 64) * layoutScale;
  const graphHeight = (Math.max(0, ...nodes.map((node) => node.y + 84)) + 64) * layoutScale;

  React.useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setLayoutScale(readWorkspaceScale()));
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, []);

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    const scale = (designer.zoom || 1) * layoutScale;
    onUpdateModel((previous) => moveNode(
      previous,
      currentDrag.nodeId,
      currentDrag.startX + (event.clientX - currentDrag.startClientX) / scale,
      currentDrag.startY + (event.clientY - currentDrag.startClientY) / scale,
    ));
  };

  const pointerUp = () => { drag.current = null; };

  const wheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    onUpdateModel((previous) => setDesignerViewport(
      previous,
      previous.designer.zoom * (event.deltaY < 0 ? 1.1 : 0.9),
      previous.designer.panX,
      previous.designer.panY,
    ));
  };

  return (
    <div
      data-vgt-automate-canvas="true"
      role="application"
      aria-label={copy.canvas}
      tabIndex={0}
      className="automate-canvas flex-1 relative overflow-auto select-none"
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onWheel={wheel}
      onClick={() => onUpdateModel((previous) => ({ ...previous, selectedNodeId: null }))}
    >
      <div
        className="automate-canvas-grid absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundSize: `${24 * designer.zoom}px ${24 * designer.zoom}px`,
          backgroundPosition: `${designer.panX}px ${designer.panY}px`,
        }}
      />
      <div className="automate-canvas-toolbar absolute left-3 top-3 z-20 flex items-center gap-1 p-1" role="toolbar" aria-label={copy.canvasControls}>
        <button aria-label={copy.zoomOut} onClick={(event: React.MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onUpdateModel((previous) => setDesignerViewport(previous, previous.designer.zoom - 0.1, previous.designer.panX, previous.designer.panY)); }}>−</button>
        <span className="automate-canvas-zoom">{Math.round(designer.zoom * 100)}%</span>
        <button aria-label={copy.zoomIn} onClick={(event: React.MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onUpdateModel((previous) => setDesignerViewport(previous, previous.designer.zoom + 0.1, previous.designer.panX, previous.designer.panY)); }}>+</button>
        <button aria-pressed={designer.minimapVisible} onClick={(event: React.MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onUpdateModel((previous) => ({ ...previous, designer: { ...previous.designer, minimapVisible: !previous.designer.minimapVisible } })); }}>
          <Maximize2 aria-hidden="true"/><span>{copy.minimap}</span>
        </button>
        <button
          aria-pressed={connectingFromNodeId !== null}
          disabled={selectedNodeId === null && connectingFromNodeId === null}
          title={copy.connectHint}
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            if (connectingFromNodeId !== null) onCancelConnect?.();
            else if (selectedNodeId !== null) onStartConnect?.(selectedNodeId);
          }}
          data-automate-connect-control={connectingFromNodeId !== null ? 'armed' : 'idle'}
          className="automate-connect-button"
        >
          {connectingFromNodeId !== null ? <X aria-hidden="true"/> : <Link2 aria-hidden="true"/>}
          <span>{connectingFromNodeId !== null ? copy.connectCancel : copy.connectNodes}</span>
        </button>
      </div>
      <div style={{ transform: `translate(${designer.panX}px,${designer.panY}px) scale(${designer.zoom})`, transformOrigin: '0 0' }} className="absolute inset-0">
        <svg className="automate-connections absolute inset-0 pointer-events-none" aria-hidden="true" style={{ width: `max(100%, ${graphWidth}px)`, height: `max(100%, ${graphHeight}px)` }}>
          {connections.map((connection) => {
            const from = nodes.find((node) => node.id === connection.fromNodeId);
            const to = nodes.find((node) => node.id === connection.toNodeId);
            if (!from || !to) return null;
            const x1 = (from.x + 224) * layoutScale;
            const y1 = (from.y + 42) * layoutScale;
            const x2 = to.x * layoutScale;
            const y2 = (to.y + 42) * layoutScale;
            const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
            // The taken edge is decided by the DERIVED path, not by `lastExecutionStatus === 'success'`:
            // a trial can only ever produce `simulated`, so that test was never true for a trial and the
            // canvas drew no path at all (AST-1726).
            const isTaken = isConnectionOnPath(path, connection.id);
            return (
              <path
                key={connection.id}
                data-automate-edge-taken={isTaken ? 'true' : 'false'}
                d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                fill="none"
                strokeWidth={isTaken ? 3 : 2}
                strokeDasharray={isTaken ? undefined : '4 4'}
                opacity={isTaken ? 0.95 : 0.55}
              />
            );
          })}
        </svg>
        {nodes.map((node) => {
          const selected = selectedNodeId === node.id;
          const onPath = isNodeOnPath(path, node.id);
          const position = pathPosition(path, node.id);
          return (
            <div
              key={node.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              data-automate-node-id={node.id}
              data-automate-node-on-path={onPath ? 'true' : 'false'}
              data-automate-node-path-position={onPath ? position + 1 : undefined}
              data-automate-connect-source={connectingFromNodeId === node.id ? 'true' : undefined}
              aria-label={`${automateNodeType(locale, node.type)}: ${copy.templateTitle(node.title)}`}
              onClick={(event: React.MouseEvent<HTMLDivElement>) => {
                event.stopPropagation();
                // While an edge is armed, a click on another node completes the connection instead of
                // merely re-selecting — the only way an edge can be created from the visible surface.
                if (connectingFromNodeId !== null && connectingFromNodeId !== node.id) onCompleteConnect?.(node.id);
                else onUpdateModel((previous) => ({ ...previous, selectedNodeId: node.id }));
              }}
              onDoubleClick={(event: React.MouseEvent<HTMLDivElement>) => { event.stopPropagation(); onUpdateModel((previous) => toggleBreakpoint(previous, node.id)); }}
              onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { nodeId: node.id, startClientX: event.clientX, startClientY: event.clientY, startX: node.x, startY: node.y };
              }}
              className={`automate-flow-node absolute w-56 p-3.5 cursor-grab active:cursor-grabbing${selected ? ' is-selected' : ''}${onPath ? ' is-on-path' : ''}`}
              style={{ left: node.x * layoutScale, top: node.y * layoutScale }}
            >
              {onPath && (
                <span
                  data-automate-path-badge={position + 1}
                  className="automate-node-path-badge text-[0.5625rem] font-black"
                >
                  {copy.pathStep(position + 1, path.nodeIds.length)}
                </span>
              )}
              <div className="automate-node-heading flex items-center justify-between pb-2 mb-2">
                <div className="flex items-center gap-1.5">{nodeIcon(node.type)}<span className="automate-node-category text-[0.6875rem] font-bold uppercase tracking-wider">{copy.templateCategory(node.category)}</span></div>
                <div className="flex items-center gap-1">
                  {node.breakpoint && <Bug aria-label={copy.breakpoint} className="automate-breakpoint-icon"/>}
                  <span data-automate-node-status={node.lastExecutionStatus ?? 'idle'} className={`automate-status-dot ${statusClass(node.lastExecutionStatus)}`} aria-label={`${copy.executionStatus(node.lastExecutionStatus ?? 'idle')}${node.lastExecutionStatus === 'simulated' ? ` · ${copy.trialBadge}` : ''}`}/>
                </div>
              </div>
              <div className="automate-node-title text-xs font-semibold mb-1">{copy.templateTitle(node.title)}</div>
              {node.lastExecutionStatus === 'simulated' && (
                <div data-automate-trial-badge="true" className="automate-node-trial-badge text-[0.5625rem] font-black uppercase tracking-wider mb-1">{copy.trialStepMessage(copy.templateTitle(node.title))}</div>
              )}
              <div className="automate-node-config text-[0.625rem] font-mono truncate">{JSON.stringify(node.config)}</div>
              <span className="automate-flow-port automate-flow-port--input absolute -left-1.5 top-9" aria-hidden="true"/>
              <span className="automate-flow-port automate-flow-port--output absolute -right-1.5 top-9" aria-hidden="true"/>
            </div>
          );
        })}
      </div>
      {designer.minimapVisible && (
        <div aria-label={copy.minimapLabel} className="automate-minimap absolute right-3 bottom-3 z-20 w-44 h-28 overflow-hidden">
          {nodes.map((node) => <span key={node.id} className="automate-minimap-node absolute" title={node.title} style={{ left: `${Math.max(2, Math.min(95, (node.x + 1000) / 40))}%`, top: `${Math.max(2, Math.min(90, (node.y + 500) / 25))}%` }}/>) }
        </div>
      )}
      {designer.validationPanelVisible && (
        <aside aria-live="polite" className="automate-validation absolute left-3 bottom-3 z-20 max-w-sm p-2 text-[0.625rem]">
          {issues.length === 0
            ? <span className="automate-validation-success">{copy.validationPass}</span>
            : <span className="automate-validation-warning"><AlertTriangle aria-hidden="true"/>{copy.validationIssues(issues.length)} {issues.slice(0, 3).map((issue) => copy.validationCode(issue.code)).join(', ')}</span>}
        </aside>
      )}
    </div>
  );
};
