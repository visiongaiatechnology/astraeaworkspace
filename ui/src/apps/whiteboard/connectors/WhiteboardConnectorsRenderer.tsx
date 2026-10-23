// STATUS: DIAMANT VGT SUPREME
// Astraea Whiteboard authoritative SVG connector renderer with persistent anchors.

import React from 'react';
import type { WhiteboardItem } from '../types';
import { buildWhiteboardConnectorPath, type WhiteboardConnectorPath } from '../model/whiteboardDiagramEngine';

interface WhiteboardConnectorsRendererProps {
  items: WhiteboardItem[];
  selectedItemId: string | null;
  selectedItemIds?: readonly string[];
  setSelectedItemId: (id: string | null) => void;
  onSelectConnector?: (id: string, additive: boolean) => void;
  connectorPaths?: ReadonlyMap<string, WhiteboardConnectorPath>;
}

export const WhiteboardConnectorsRenderer: React.FC<WhiteboardConnectorsRendererProps> = ({
  items,
  selectedItemId,
  selectedItemIds = [],
  setSelectedItemId,
  onSelectConnector,
  connectorPaths,
}) => {
  const selectedSet = new Set(selectedItemIds);
  const connectors = items
    .filter((item) => item.type === 'connector' && !item.hidden)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.id.localeCompare(b.id));

  return (
    <svg
      className="absolute top-0 left-0 overflow-visible pointer-events-none"
      style={{ width: 1, height: 1, overflow: 'visible' }}
      aria-label="Whiteboard connectors"
    >
      <defs>
        <marker id="arrowhead-blue" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <polygon points="0 1, 8 4, 0 7" fill="#60a5fa" />
        </marker>
        <marker id="arrowhead-slate" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <polygon points="0 1, 8 4, 0 7" fill="#94a3b8" />
        </marker>
      </defs>

      {connectors.map((connector) => {
        const routed = connectorPaths === undefined
          ? buildWhiteboardConnectorPath(connector, items)
          : connectorPaths.get(connector.id);
        if (!routed) return null;
        const { from, to, path, labelX, labelY } = routed;
        const selected = selectedItemId === connector.id || selectedSet.has(connector.id);

        return (
          <g
            key={connector.id}
            // GAP-0051, Runde 280: ein Konnektor war nur mit der Maus
            // auswaehlbar. Ein `<g>` hat keine Rolle und keine Tab-Position,
            // beide muessen ausdruecklich gesetzt werden.
            role="button"
            tabIndex={0}
            // `WhiteboardObjectModel` (workspaceWhiteboard.ts:187-218) hat
            // KEIN `label` und KEIN `kind`. Der zugaengliche Name kommt darum
            // aus den Feldern, die es gibt: `lineLabel` (die Beschriftung eines
            // Konnektors), dann `name`, dann `text` — und `text` ist ein
            // Pflichtfeld, also ist der Name nie leer.
            aria-label={connector.lineLabel || connector.name || connector.text || 'Connector'}
            // GAP-0054, Runde 288: hier stand `selectedSet.has(connector.id)`.
            // Die gemeinsame Ableitung beider Auswahlquellen gibt es schon —
            // `selected` in Zeile 51 vereinigt `selectedItemId` und
            // `selectedItemIds`. `aria-pressed` benutzte sie nicht, darum blieb
            // ein ueber `setSelectedItemId` gewaehlter Konnektor fuer den
            // Screenreader unausgewaehlt, obwohl er sichtbar ausgewaehlt war.
            aria-pressed={selected}
            className="pointer-events-auto cursor-pointer"
            onClick={(event) => {
              event.stopPropagation();
              const additive = event.shiftKey || event.ctrlKey || event.metaKey;
              if (onSelectConnector) onSelectConnector(connector.id, additive);
              else setSelectedItemId(connector.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                const additive = event.shiftKey || event.ctrlKey || event.metaKey;
                if (onSelectConnector) onSelectConnector(connector.id, additive);
                else setSelectedItemId(connector.id);
              }
            }}
          >
            <path d={path} fill="none" stroke="transparent" strokeWidth="14" />
            <path
              d={path}
              fill="none"
              stroke={selected ? '#60a5fa' : '#64748b'}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray={selected ? '4 2' : 'none'}
              markerEnd={selected ? 'url(#arrowhead-blue)' : 'url(#arrowhead-slate)'}
              className="transition-colors"
            />
            {selected && <>
              <circle cx={from.x} cy={from.y} r="4.5" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
              <circle cx={to.x} cy={to.y} r="4.5" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
            </>}
            {connector.lineLabel && (
              <text
                x={labelX}
                y={labelY}
                fill={selected ? '#93c5fd' : '#94a3b8'}
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
                className="select-none"
              >
                {connector.lineLabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
