// STATUS: DIAMANT VGT SUPREME — Draw connector inspector (route, waypoints, label, arrowheads).
//
// Shown whenever the selection contains a connector. Reads the canonical connector data off the object
// and writes only through the canvas session, so routing keeps exactly one owner (`drawRoutingEngine`).
import React from 'react';
import type { DrawArrowhead, DrawConnectorRoute, DrawDocumentModel, DrawObject } from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { drawInteractionText } from '../drawInteractionLocale';
import type { DrawSessionCommand } from '../interactions/drawCanvasSession';

export interface DrawConnectorPanelProps {
  readonly model: DrawDocumentModel;
  readonly locale: WorkspaceLocale;
  readonly selectedIds: readonly string[];
  readonly onCommand: (command: DrawSessionCommand) => void;
}

/** `custom` is reached by adding waypoints, not by picking it from a list. */
const ROUTES: readonly DrawConnectorRoute[] = ['orthogonal', 'straight', 'curved'];
const ARROWHEADS: readonly DrawArrowhead[] = ['none', 'triangle', 'open', 'diamond', 'circle'];
const FIELD = 'rounded border border-white/15 bg-slate-950 px-1.5 py-0.5 text-[0.6875rem] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300';
const BUTTON = 'rounded border border-white/15 px-1.5 py-0.5 text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40';

function firstConnector(model: DrawDocumentModel, selectedIds: readonly string[]): DrawObject | null {
  for (const id of selectedIds) {
    const object = model.objects[id];
    if (object?.type === 'connector' && object.connector) return object;
  }
  return null;
}

export const DrawConnectorPanel: React.FC<DrawConnectorPanelProps> = ({ model, locale, selectedIds, onCommand }) => {
  const t = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);
  const connector = firstConnector(model, selectedIds);
  if (!connector || !connector.connector) return null;
  const data = connector.connector;
  const routeLabel: Record<DrawConnectorRoute, Parameters<typeof drawInteractionText>[0]> = {
    straight: 'routeStraight', orthogonal: 'routeOrthogonal', curved: 'routeCurved', custom: 'routeOrthogonal',
  };

  return (
    <section
      data-vgt-panel="connector"
      data-vgt-connector-id={connector.id}
      data-vgt-connector-route={data.route}
      data-vgt-connector-waypoints={data.waypoints.length}
      className="flex flex-col gap-2 border-l border-white/10 bg-slate-900/60 p-3"
      aria-label={t('connectorRoute')}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{connector.name}</h2>
      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('connectorRoute')}
        <select
          data-vgt-connector-route-select="true"
          className={FIELD}
          value={data.route}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onCommand({ kind: 'connector-route', route: event.target.value as DrawConnectorRoute })}
        >
          {ROUTES.map((route) => <option key={route} value={route}>{t(routeLabel[route])}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('connectorLabel')}
        <input
          data-vgt-connector-label="true"
          className={FIELD}
          defaultValue={data.semantic.label ?? ''}
          onBlur={(event: React.FocusEvent<HTMLInputElement>) => onCommand({ kind: 'connector-label', text: event.currentTarget.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1 text-[0.625rem] text-slate-300">
        <span>{`${t('connectorRoute')}: ${data.waypoints.length}`}</span>
        <button type="button" data-vgt-command="connector-clear-waypoints" className={BUTTON} onClick={() => onCommand({ kind: 'connector-clear-waypoints' })}>{t('clearWaypoints')}</button>
      </div>
      <p className="text-[0.625rem] leading-snug text-slate-400">{t('connectorWaypointHint')}</p>
      <div className="flex flex-wrap items-center gap-1">
        {ARROWHEADS.map((arrow) => (
          <button
            key={`start-${arrow}`} type="button" data-vgt-connector-arrow-start={arrow} className={BUTTON}
            aria-pressed={data.arrowStart === arrow}
            onClick={() => onCommand({ kind: 'connector-arrowheads', arrowStart: arrow, arrowEnd: data.arrowEnd })}
            aria-label={`${t('connectorRoute')}: ${arrow}`}
          >{`←${arrow}`}</button>
        ))}
        {ARROWHEADS.map((arrow) => (
          <button
            key={`end-${arrow}`} type="button" data-vgt-connector-arrow-end={arrow} className={BUTTON}
            aria-pressed={data.arrowEnd === arrow}
            onClick={() => onCommand({ kind: 'connector-arrowheads', arrowStart: data.arrowStart, arrowEnd: arrow })}
            aria-label={`${t('connectorRoute')}: ${arrow}`}
          >{`${arrow}→`}</button>
        ))}
      </div>
      <button type="button" data-vgt-command="disconnect" className={BUTTON} onClick={() => onCommand({ kind: 'disconnect' })}>{t('disconnectSelection')}</button>
    </section>
  );
};

export default DrawConnectorPanel;
