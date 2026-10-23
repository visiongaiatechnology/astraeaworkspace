// STATUS: PLATIN VGT
// Astraea Grid PivotTable Studio - Excel-like field builder.
//
// Fields are chips that move between the Rows / Columns / Values / Filters drop
// zones. Every transfer is implemented once in the bounded builder model and is
// reachable by drag-and-drop *and* by keyboard/button ("+ Zeile", "+ Spalte",
// "+ Wert", "+ Filter"), so nothing is pointer-only. The live preview renders the
// bounded pivot model of the current configuration (state: empty / partial /
// ready / error) and the drill-down shows the source records of a group.

import React, { useMemo, useState } from 'react';
import type {
  GridDataModel,
  GridDataModelRelationship,
  GridCell,
  GridPivotAggregation,
  GridPivotDefinition,
  GridSheetModel,
} from '../../../shared/contracts/workspace';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { parseGridRange } from '../compat/gridProfessional';
import { toA1 } from '../formulas/formula';
import { inspectGridDataModelRelationships, type GridDataModelTableInput } from './gridDataModel';
import {
  MAX_PIVOT_BUILDER_FIELDS,
  PIVOT_AGGREGATIONS,
  PIVOT_AGGREGATION_LABELS,
  buildPivotDefinition,
  describeZone,
  movePivotField,
  pivotBuilderBlockers,
  pivotFieldByColumn,
  setPivotGrouping,
  setPivotValueAggregation,
  type PivotBuilderConfig,
  type PivotFieldRef,
  type PivotZone,
} from './gridPivotBuilder';
import {
  MAX_PIVOT_PREVIEW_COLUMNS,
  MAX_PIVOT_PREVIEW_ROWS,
  buildPivotChartView,
  buildPivotDrillDown,
  buildPivotPreview,
  type PivotDrillDown,
} from './gridPivotPreview';

interface GridPivotPanelProps {
  sheet: GridSheetModel;
  cells: Record<string, GridCell>;
  dataModel?: GridDataModel;
  dataModelTables: GridDataModelTableInput[];
  onCreatePivot: (definition: GridPivotDefinition) => void;
  onUpdatePivot: (definition: GridPivotDefinition) => void;
  onUpdateDataModel: (model: GridDataModel) => void;
}

const DEFAULT_SOURCE_RANGE = 'A1:D100';
const MAX_HEADER_TEXT_LENGTH = 128;

const ZONE_TARGETS: readonly { zone: PivotZone; button: string }[] = [
  { zone: 'rows', button: '+ Zeile' },
  { zone: 'columns', button: '+ Spalte' },
  { zone: 'values', button: '+ Wert' },
  { zone: 'filters', button: '+ Filter' },
];

const DRAG_MIME = 'application/x-astraea-pivot-field+json';

function boundedHeaderText(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text.length > MAX_HEADER_TEXT_LENGTH ? `${text.slice(0, MAX_HEADER_TEXT_LENGTH - 1)}\u2026` : text;
}

function collectFields(cells: Record<string, GridCell>, sourceRange: string): { fields: PivotFieldRef[]; capped: boolean } {
  const bounds = parseGridRange(sourceRange.trim().toUpperCase());
  if (!bounds) return { fields: [], capped: false };
  const fields: PivotFieldRef[] = [];
  let capped = false;
  for (let col = bounds.startCol; col <= bounds.endCol; col++) {
    if (fields.length >= MAX_PIVOT_BUILDER_FIELDS) {
      capped = true;
      break;
    }
    const column = toA1(col, bounds.startRow).replace(/\d+$/, '');
    fields.push({ column, label: boundedHeaderText(cells[toA1(col, bounds.startRow)]?.value, `Spalte ${column}`) });
  }
  return { fields, capped };
}

function zoneOfField(config: PivotBuilderConfig, column: string): PivotZone {
  const key = column.trim().toUpperCase();
  if (config.rows.includes(key)) return 'rows';
  if (config.columns.includes(key)) return 'columns';
  if (config.values.some((slot) => slot.column === key)) return 'values';
  if (config.filters.some((filter) => filter.column === key)) return 'filters';
  return 'available';
}

const inputClass = 'vgt-input w-full min-w-0';
const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

export const GridPivotPanel: React.FC<GridPivotPanelProps> = ({
  sheet,
  cells,
  dataModel,
  dataModelTables,
  onCreatePivot,
  onUpdatePivot,
  onUpdateDataModel,
}) => {
  const [sourceRange, setSourceRange] = useState(DEFAULT_SOURCE_RANGE);
  const [pivotName, setPivotName] = useState(`Pivot ${(sheet.pivots?.length ?? 0) + 1}`);
  const [groupColumn, setGroupColumn] = useState('');
  const [dateGrouping, setDateGrouping] = useState<'none' | 'year' | 'quarter' | 'month' | 'day'>('none');
  const [numberBin, setNumberBin] = useState('');
  const [dragSource, setDragSource] = useState<string>('');
  const [dropTarget, setDropTarget] = useState<PivotZone | ''>('');
  const [newValueAggregation, setNewValueAggregation] = useState<GridPivotAggregation>('sum');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [drillDown, setDrillDown] = useState<PivotDrillDown | null>(null);
  const [relationPrimary, setRelationPrimary] = useState(dataModelTables[0]?.table.id ?? '');
  const [relationPrimaryColumn, setRelationPrimaryColumn] = useState(dataModelTables[0]?.table.columns[0]?.name ?? '');
  const [relationForeign, setRelationForeign] = useState(dataModelTables[1]?.table.id ?? '');
  const [relationForeignColumn, setRelationForeignColumn] = useState(dataModelTables[1]?.table.columns[0]?.name ?? '');
  const [measureName, setMeasureName] = useState('Total');
  const [measureFormula, setMeasureFormula] = useState('SUM_Sales');

  const collected = useMemo(() => collectFields(cells, sourceRange), [cells, sourceRange]);
  const bounds = useMemo(() => parseGridRange(sourceRange.trim().toUpperCase()), [sourceRange]);

  const [config, setConfig] = useState<PivotBuilderConfig>(() => ({
    sourceRange: DEFAULT_SOURCE_RANGE,
    fields: [],
    fieldsCapped: false,
    rows: [],
    columns: [],
    values: [],
    filters: [],
    groupings: [],
    calculatedFields: [],
    style: { headerBackground: '#1e293b', headerTextColor: '#93c5fd', totalBackground: '#172554', alternateRows: true, numberFormatCode: '#,##0.00' },
    name: `Pivot ${(sheet.pivots?.length ?? 0) + 1}`,
  }));

  // The field list follows the source range; fields that left the range are dropped
  // so a stale chip can never reference a column outside the source.
  const activeConfig = useMemo<PivotBuilderConfig>(() => {
    const fields = collected.fields;
    const allowed = new Set(fields.map((field) => field.column));
    const keep = (column: string): boolean => allowed.has(column.trim().toUpperCase());
    return {
      ...config,
      sourceRange: sourceRange.trim().toUpperCase(),
      fields,
      fieldsCapped: collected.capped,
      name: pivotName,
      rows: config.rows.filter(keep),
      columns: config.columns.filter(keep),
      values: config.values.filter((slot) => keep(slot.column)),
      filters: config.filters.filter((filter) => keep(filter.column)),
      groupings: config.groupings.filter((grouping) => keep(grouping.column)),
    };
  }, [collected, config, sourceRange, pivotName]);

  const definition = useMemo(() => buildPivotDefinition(activeConfig, 'pivot-preview'), [activeConfig]);
  const preview = useMemo(
    () => buildPivotPreview({ cells, definition, maxRows: MAX_PIVOT_PREVIEW_ROWS, maxColumns: MAX_PIVOT_PREVIEW_COLUMNS }),
    [cells, definition],
  );
  const chart = useMemo(() => buildPivotChartView(preview), [preview]);
  const blockers = pivotBuilderBlockers(activeConfig);
  const inspections = useMemo(
    () => inspectGridDataModelRelationships(dataModelTables, dataModel?.relationships ?? []),
    [dataModelTables, dataModel?.relationships],
  );

  const applyTransfer = (field: string, to: PivotZone, aggregation?: GridPivotAggregation): void => {
    const from = zoneOfField(activeConfig, field);
    const label = pivotFieldByColumn(activeConfig, field)?.label ?? field;
    const result = aggregation === undefined
      ? movePivotField(activeConfig, field, from, to)
      : movePivotField(activeConfig, field, from, to, aggregation);
    if (!result.ok) {
      const issue = result.issues[0];
      const text = issue.code === 'pivot_builder_value_field_limit'
        ? 'Maximal 32 Werte moeglich. Bitte zuerst einen Wert entfernen.'
        : issue.code === 'pivot_builder_dimension_limit'
          ? 'Maximal 32 Felder je Achse moeglich. Bitte zuerst ein Feld entfernen.'
          : issue.code === 'pivot_builder_self_transfer'
            ? `"${label}" liegt bereits in dieser Zone.`
            : `"${label}" konnte nicht verschoben werden (${issue.code}).`;
      setStatus({ tone: 'error', text });
      return;
    }
    setConfig(result.config);
    setStatus({ tone: 'ok', text: `"${label}" ist jetzt in ${describeZoneDestination(to)}.` });
  };

  const create = (): void => {
    if (!definition) {
      setStatus({ tone: 'error', text: blockers.join(' \u00b7 ') || 'Konfiguration ist unvollstaendig.' });
      return;
    }
    const extra: PivotBuilderConfig = groupColumn.trim()
      ? {
        ...activeConfig,
        groupings: [{
          column: groupColumn.trim().toUpperCase(),
          ...(dateGrouping === 'none' ? {} : { dateGrouping }),
          ...(Number.isFinite(Number(numberBin)) && Number(numberBin) > 0 ? { numberBinSize: Number(numberBin) } : {}),
        }],
      }
      : activeConfig;
    const created = buildPivotDefinition(extra, createGridSecureId('pivot'));
    if (!created) {
      setStatus({ tone: 'error', text: 'Pivot konnte nicht erzeugt werden: Konfiguration unvollstaendig.' });
      return;
    }
    onCreatePivot(created);
    setStatus({ tone: 'ok', text: `Pivot "${created.name}" wurde als eigenes Blatt erzeugt.` });
  };

  const addRelationship = (): void => {
    if (!relationPrimary || !relationForeign || relationPrimary === relationForeign || !relationPrimaryColumn.trim() || !relationForeignColumn.trim()) {
      setStatus({ tone: 'error', text: 'Beziehung benoetigt zwei verschiedene Tabellen und je eine Spalte.' });
      return;
    }
    const relationship: GridDataModelRelationship = {
      id: createGridSecureId('relationship'),
      primaryTableId: relationPrimary,
      primaryColumn: relationPrimaryColumn.trim(),
      foreignTableId: relationForeign,
      foreignColumn: relationForeignColumn.trim(),
    };
    onUpdateDataModel({ relationships: [...(dataModel?.relationships ?? []), relationship].slice(-128), measures: dataModel?.measures ?? [] });
    setStatus({ tone: 'ok', text: 'Beziehung wurde aufgenommen.' });
  };

  const addMeasure = (): void => {
    if (!measureName.trim() || !measureFormula.trim()) {
      setStatus({ tone: 'error', text: 'Measure benoetigt Namen und Formel.' });
      return;
    }
    onUpdateDataModel({
      relationships: dataModel?.relationships ?? [],
      measures: [...(dataModel?.measures ?? []), { id: createGridSecureId('measure'), name: measureName.trim().slice(0, 128), formula: measureFormula.trim().slice(0, 2048) }].slice(-128),
    });
    setStatus({ tone: 'ok', text: 'Measure wurde aufgenommen.' });
  };

  const startDrag = (field: string) => (event: React.DragEvent<HTMLElement>): void => {
    setDragSource(field);
    event.dataTransfer.effectAllowed = 'move';
    // Plain text keeps the drag usable by external consumers; the JSON payload
    // carries the exact zone the chip came from plus the chosen aggregate.
    event.dataTransfer.setData('text/plain', field);
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ field, from: zoneOfField(activeConfig, field), aggregation: newValueAggregation }));
  };

  const dropOn = (zone: PivotZone) => (event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDropTarget('');
    let field = dragSource;
    let from: PivotZone | null = dragSource ? zoneOfField(activeConfig, dragSource) : null;
    let aggregation = newValueAggregation;
    const payload = event.dataTransfer.getData(DRAG_MIME);
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as { field?: unknown; from?: unknown; aggregation?: unknown };
        if (typeof parsed.field === 'string') field = parsed.field;
        if (typeof parsed.from === 'string') from = parsed.from as PivotZone;
        if (typeof parsed.aggregation === 'string') aggregation = parsed.aggregation as GridPivotAggregation;
      } catch {
        // Fall back to the in-memory drag state; a malformed payload never throws.
      }
    }
    if (!field) {
      setStatus({ tone: 'error', text: 'Kein Feld erkannt. Bitte ein Feldchip ziehen oder die Schaltflaeche "+ ..." verwenden.' });
      return;
    }
    if (from === null) from = zoneOfField(activeConfig, field);
    const label = pivotFieldByColumn(activeConfig, field)?.label ?? field;
    const result = zone === 'values'
      ? movePivotField(activeConfig, field, from, zone, aggregation)
      : movePivotField(activeConfig, field, from, zone);
    if (!result.ok) {
      const issue = result.issues[0];
      setStatus({
        tone: 'error',
        text: issue.code === 'pivot_builder_self_transfer'
          ? `"${label}" liegt bereits in dieser Zone.`
          : issue.code === 'pivot_builder_unknown_field'
            ? `"${label}" gehoert nicht zum Quellbereich.`
            : `"${label}" konnte nicht abgelegt werden (${issue.code}).`,
      });
      return;
    }
    setConfig(result.config);
    setDragSource('');
    setStatus({ tone: 'ok', text: `"${label}" ist jetzt in ${describeZoneDestination(zone)}.` });
  };

  const chip = (field: PivotFieldRef, zone: PivotZone): React.ReactElement => (
    <span
      key={field.column}
      draggable
      onDragStart={startDrag(field.column)}
      onDragEnd={() => { setDragSource(''); setDropTarget(''); }}
      className={`inline-flex max-w-full items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[0.6875rem] text-slate-200 ${focusClass}`}
      title={`${field.label} (${field.column})`}
      data-pivot-chip={`${zone}:${field.column}`}
    >
      <span className="truncate" style={{ maxWidth: '9rem' }}>{field.label}</span>
      <span className="font-mono text-[0.5625rem] text-slate-500">{field.column}</span>
      <button
        type="button"
        aria-label={`${field.label} aus ${zoneLabel(zone)} entfernen`}
        onClick={() => applyTransfer(field.column, 'available')}
        className={`rounded px-1 text-slate-400 hover:bg-white/10 hover:text-white ${focusClass}`}
      >{'\u00d7'}</button>
    </span>
  );

  const valueChip = (slot: { column: string; label: string; aggregation: GridPivotAggregation; customLabel?: string }): React.ReactElement => (
    <span
      key={slot.column}
      draggable
      onDragStart={startDrag(slot.column)}
      onDragEnd={() => { setDragSource(''); setDropTarget(''); }}
      className={`inline-flex max-w-full items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[0.6875rem] text-slate-200 ${focusClass}`}
      data-pivot-chip={`values:${slot.column}`}
    >
      <span className="truncate" style={{ maxWidth: '7rem' }}>{slot.customLabel ?? slot.label}</span>
      <select
        aria-label={`Aggregat fuer ${slot.label}`}
        value={slot.aggregation}
        onChange={(event) => {
          const result = setPivotValueAggregation(activeConfig, slot.column, event.target.value as GridPivotAggregation);
          if (!result.ok) {
            setStatus({ tone: 'error', text: `Aggregat konnte nicht gesetzt werden (${result.issues[0].code}).` });
            return;
          }
          setConfig(result.config);
          setStatus({ tone: 'ok', text: `Aggregat fuer "${slot.label}" ist jetzt ${PIVOT_AGGREGATION_LABELS[event.target.value as GridPivotAggregation]}.` });
        }}
        className={`rounded bg-black/40 px-1 py-0.5 text-[0.625rem] text-slate-200 ${focusClass}`}
      >
        {PIVOT_AGGREGATIONS.map((aggregation) => (
          <option key={aggregation} value={aggregation}>{PIVOT_AGGREGATION_LABELS[aggregation]}</option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`${slot.label} aus den Werten entfernen`}
        onClick={() => applyTransfer(slot.column, 'available')}
        className={`rounded px-1 text-slate-400 hover:bg-white/10 hover:text-white ${focusClass}`}
      >{'\u00d7'}</button>
    </span>
  );

  const zoneBox = (zone: PivotZone, title: string): React.ReactElement => (
    <div
      onDragOver={(event) => { event.preventDefault(); setDropTarget(zone); }}
      onDragLeave={() => setDropTarget((current) => (current === zone ? '' : current))}
      onDrop={dropOn(zone)}
      data-pivot-zone={zone}
      data-pivot-drop-active={dropTarget === zone ? 'true' : 'false'}
      aria-label={`${title}: ${describeZone(activeConfig, zone)}`}
      className={`rounded border p-2 space-y-1 ${dropTarget === zone ? 'border-cyan-400/70 bg-cyan-500/5' : 'border-white/10 bg-black/20'}`}
    >
      <div className="text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="space-y-1 break-words">
        {zone === 'rows' && (activeConfig.rows.length === 0
          ? <span className="text-[0.625rem] text-slate-500">Feld hier ablegen oder "+ Zeile" verwenden.</span>
          : activeConfig.rows.map((column) => chip(pivotFieldByColumn(activeConfig, column) ?? { column, label: column }, 'rows')))}
        {zone === 'columns' && (activeConfig.columns.length === 0
          ? <span className="text-[0.625rem] text-slate-500">Feld hier ablegen oder "+ Spalte" verwenden.</span>
          : activeConfig.columns.map((column) => chip(pivotFieldByColumn(activeConfig, column) ?? { column, label: column }, 'columns')))}
        {zone === 'values' && (activeConfig.values.length === 0
          ? <span className="text-[0.625rem] text-slate-500">Feld hier ablegen oder "+ Wert" verwenden.</span>
          : activeConfig.values.map((slot) => valueChip(slot)))}
        {zone === 'filters' && (activeConfig.filters.length === 0
          ? <span className="text-[0.625rem] text-slate-500">Feld hier ablegen oder "+ Filter" verwenden.</span>
          : activeConfig.filters.map((filter) => chip(pivotFieldByColumn(activeConfig, filter.column) ?? { column: filter.column, label: filter.column }, 'filters')))}
      </div>
      <div className="text-[0.625rem] text-slate-500">{describeZone(activeConfig, zone)}</div>
    </div>
  );

  return <div className="space-y-4 min-w-0">
    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <h3 className="font-semibold text-slate-200">PivotTable Studio</h3>
      <label className="block text-[0.625rem] text-slate-400" htmlFor="pivot-source-range">Quellbereich (A1-Schreibweise)</label>
      <input
        id="pivot-source-range"
        aria-label="Quellbereich des Pivots"
        value={sourceRange}
        onChange={(event) => setSourceRange(event.target.value)}
        className={`${inputClass} font-mono ${focusClass}`}
        placeholder="A1:H500"
      />
      {bounds === null && <div className="text-[0.625rem] text-rose-300">Kein gueltiger Bereich. Beispiel: A1:D50</div>}
      <label className="block text-[0.625rem] text-slate-400" htmlFor="pivot-name">Name</label>
      <input
        id="pivot-name"
        aria-label="Name des Pivots"
        value={pivotName}
        onChange={(event) => setPivotName(event.target.value)}
        className={`${inputClass} ${focusClass}`}
        placeholder="Umsatz je Region"
      />
    </section>

    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <h3 className="font-semibold text-slate-200">Felder</h3>
      <p className="text-[0.625rem] text-slate-500">Feldchips in Zeilen, Spalten, Werte und Filter ziehen - oder die Schaltflaechen neben jedem Feld verwenden (Tastatur).</p>
      {activeConfig.fieldsCapped && (
        <div className="text-[0.625rem] text-amber-300">Nur die ersten {MAX_PIVOT_BUILDER_FIELDS} Felder sind auswaehlbar.</div>
      )}
      <div className="flex flex-wrap gap-1" data-pivot-available>
        {activeConfig.fields.length === 0 && <span className="text-[0.625rem] text-slate-500">Kein Feld im Quellbereich gefunden. Kopfzeile pruefen.</span>}
        {activeConfig.fields.map((field) => (
          <span key={field.column} className="inline-flex max-w-full items-center gap-1 rounded border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[0.6875rem] text-slate-300">
            <span
              draggable
              onDragStart={startDrag(field.column)}
              onDragEnd={() => { setDragSource(''); setDropTarget(''); }}
              className={`truncate cursor-grab ${focusClass}`}
              style={{ maxWidth: '10rem' }}
              title={`${field.label} (${field.column})`}
              data-pivot-source-chip={field.column}
            >{field.label}</span>
            {ZONE_TARGETS.map((target) => (
              <button
                key={target.zone}
                type="button"
                aria-label={target.zone === 'values'
                  ? `${field.label} als ${PIVOT_AGGREGATION_LABELS[newValueAggregation]} zu den Werten hinzufuegen`
                  : `${field.label} zu ${zoneLabel(target.zone)} hinzufuegen`}
                onClick={() => applyTransfer(field.column, target.zone, target.zone === 'values' ? newValueAggregation : undefined)}
                className={`rounded px-1 text-[0.625rem] text-slate-400 hover:bg-white/10 hover:text-white ${focusClass}`}
                data-pivot-add={`${target.zone}:${field.column}`}
              >{target.button}</button>
            ))}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded border border-white/10 bg-black/20 p-2">
        <label className="space-y-1 text-[0.625rem] text-slate-400">
          Aggregat fuer neue Werte
          <select
            aria-label="Aggregat fuer neue Werte"
            value={newValueAggregation}
            onChange={(event) => setNewValueAggregation(event.target.value as GridPivotAggregation)}
            className={`${inputClass} ${focusClass}`}
            data-pivot-aggregate-menu
          >
            {PIVOT_AGGREGATIONS.map((aggregation) => (
              <option key={aggregation} value={aggregation}>{PIVOT_AGGREGATION_LABELS[aggregation]}</option>
            ))}
          </select>
        </label>
        <span className="text-[0.625rem] text-slate-500">Gilt fuer "+ Wert" und fuer das Ablegen in der Zone "Werte".</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {zoneBox('rows', 'Zeilen')}
        {zoneBox('columns', 'Spalten')}
        {zoneBox('values', 'Werte')}
        {zoneBox('filters', 'Filter')}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[0.625rem] text-slate-400">
          Gruppieren (Feld)
          <input aria-label="Gruppierungsfeld" value={groupColumn} onChange={(event) => setGroupColumn(event.target.value)} className={`${inputClass} font-mono ${focusClass}`} placeholder="B" />
        </label>
        <label className="space-y-1 text-[0.625rem] text-slate-400">
          Datumsgruppierung
          <select aria-label="Datumsgruppierung" value={dateGrouping} onChange={(event) => setDateGrouping(event.target.value as typeof dateGrouping)} className={`${inputClass} ${focusClass}`}>
            <option value="none">Keine</option>
            <option value="year">Jahr</option>
            <option value="quarter">Quartal</option>
            <option value="month">Monat</option>
            <option value="day">Tag</option>
          </select>
        </label>
        <label className="space-y-1 text-[0.625rem] text-slate-400">
          Zahlenintervall
          <input aria-label="Zahlenintervall" value={numberBin} onChange={(event) => setNumberBin(event.target.value)} className={`${inputClass} ${focusClass}`} placeholder="z. B. 1000" />
        </label>
        <button
          type="button"
          onClick={() => {
            if (!groupColumn.trim()) {
              setStatus({ tone: 'error', text: 'Gruppierung benoetigt ein Feld.' });
              return;
            }
            const result = setPivotGrouping(activeConfig, groupColumn.trim().toUpperCase(), {
              ...(dateGrouping === 'none' ? {} : { dateGrouping }),
              ...(Number.isFinite(Number(numberBin)) && Number(numberBin) > 0 ? { numberBinSize: Number(numberBin) } : {}),
            });
            if (!result.ok) {
              setStatus({ tone: 'error', text: `Gruppierung konnte nicht gespeichert werden (${result.issues[0].code}).` });
              return;
            }
            setConfig(result.config);
            setStatus({ tone: 'ok', text: 'Gruppierung gespeichert.' });
          }}
          className={`vgt-button-secondary self-end ${focusClass}`}
        >Gruppierung uebernehmen</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={create} disabled={definition === null} className={`vgt-button-primary ${focusClass}`} data-pivot-create>Pivot erzeugen</button>
        {blockers.length > 0 && <span className="text-[0.625rem] text-amber-300">{blockers.join(' \u00b7 ')}</span>}
      </div>
      {status && (
        <div role="status" aria-live="polite" className={`rounded px-2 py-1 text-[0.625rem] ${status.tone === 'error' ? 'bg-rose-500/10 text-rose-200' : 'bg-emerald-500/10 text-emerald-200'}`}>
          {status.text}
        </div>
      )}
    </section>

    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 min-w-0">
      <h3 className="font-semibold text-slate-200">Live-Vorschau</h3>
      <div
        role="status"
        aria-live="polite"
        className={`rounded px-2 py-1 text-[0.625rem] ${
          preview.state === 'error' ? 'bg-rose-500/10 text-rose-200'
            : preview.state === 'partial' ? 'bg-amber-500/10 text-amber-200'
              : preview.state === 'empty' ? 'bg-white/5 text-slate-400'
                : 'bg-emerald-500/10 text-emerald-200'
        }`}
        data-pivot-preview-state={preview.state}
      >
        {preview.message}
      </div>
      {preview.state === 'error' && preview.errorDetail && (
        <div className="text-[0.625rem] text-slate-500">Technischer Hinweis: {preview.errorDetail}</div>
      )}
      {preview.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[16rem] border-collapse text-[0.625rem]">
            <caption className="sr-only">Vorschau der Pivot-Tabelle</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-white/10 px-1 py-1 text-left text-slate-400">{activeConfig.rows.join(' / ') || 'Gruppe'}</th>
                {preview.columnKeys.map((columnKey) => (
                  <th key={columnKey} scope="col" className="border-b border-white/10 px-1 py-1 text-right text-slate-400">{columnKey}</th>
                ))}
                <th scope="col" className="border-b border-white/10 px-1 py-1 text-right text-slate-400">Quellzeilen</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="max-w-[12rem] truncate border-b border-white/5 px-1 py-1 text-left font-normal text-slate-200" title={row.label}>
                    <button
                      type="button"
                      className={`text-left hover:text-cyan-300 ${focusClass}`}
                      aria-label={`Aggregat ${row.label} aufklappen und Quelldaten zeigen`}
                      data-pivot-drilldown={row.key}
                      onClick={() => {
                        const records = buildPivotDrillDown({
                          cells,
                          definition: definition ?? {
                            id: 'pivot-preview',
                            name: pivotName,
                            sourceRange: activeConfig.sourceRange,
                            rowColumn: activeConfig.rows[0] ?? 'A',
                            valueColumn: activeConfig.values[0]?.column ?? 'A',
                            aggregation: activeConfig.values[0]?.aggregation ?? 'sum',
                          },
                          sourceRecordRowIndices: row.sourceRecordRowIndices,
                          groupKey: row.key,
                        });
                        setDrillDown(records);
                      }}
                    >{row.label}</button>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.columnKey} className="border-b border-white/5 px-1 py-1 text-right tabular-nums text-slate-300" title={cell.text}>{cell.text}</td>
                  ))}
                  <td className="border-b border-white/5 px-1 py-1 text-right tabular-nums text-slate-500">{row.sourceRowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.grandTotals.length > 0 && preview.rows.length > 0 && (
        <div className="text-[0.625rem] text-slate-400">
          Gesamtergebnis: {preview.grandTotals.map((cell) => `${cell.columnKey} ${cell.text}`).join(' \u00b7 ')}
        </div>
      )}
      {drillDown && (
        <div className="space-y-1 rounded border border-white/10 bg-black/30 p-2" data-pivot-drilldown-panel>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[0.625rem] text-slate-300">Quelldaten fuer "{drillDown.groupKey}"</div>
            <button type="button" onClick={() => setDrillDown(null)} className={`rounded px-1 text-[0.625rem] text-slate-400 hover:text-white ${focusClass}`} aria-label="Quelldaten schliessen">Schliessen</button>
          </div>
          <div className="text-[0.625rem] text-slate-500">{drillDown.message}</div>
          {drillDown.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[0.625rem]">
                <caption className="sr-only">Quelldatensaetze des Aggregats</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-white/10 px-1 py-1 text-left text-slate-400">Zeile</th>
                    {drillDown.headers.map((header) => (
                      <th key={header} scope="col" className="border-b border-white/10 px-1 py-1 text-left text-slate-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillDown.rows.map((record) => (
                    <tr key={record.sourceRowIndex}>
                      <th scope="row" className="border-b border-white/5 px-1 py-1 text-left font-normal text-slate-500">{record.worksheetRow}</th>
                      {record.cells.map((cell) => (
                        <td key={`${record.sourceRowIndex}:${cell.header}`} className="max-w-[10rem] truncate border-b border-white/5 px-1 py-1 text-slate-300" title={cell.value}>{cell.value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>

    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <h3 className="font-semibold text-slate-200">Pivot-Diagramm</h3>
      <div className="text-[0.625rem] text-slate-400" data-pivot-chart-state={chart.state}>{chart.message}</div>
      {chart.series.length > 0 && (
        <div className="space-y-1" data-pivot-chart>
          {chart.categories.map((category, index) => {
            const value = chart.series[0].points[index]?.value ?? 0;
            const percent = chart.maxValue > 0 ? Math.round((Math.abs(value) / chart.maxValue) * 100) : 0;
            return (
              <div key={category} className="flex items-center gap-2 text-[0.625rem] text-slate-300">
                <span className="w-24 truncate" title={category}>{category}</span>
                <span className="h-2 flex-1 rounded bg-white/5">
                  <span className="block h-2 rounded bg-cyan-500/70" style={{ width: `${percent}%` }} />
                </span>
                <span className="w-16 text-right tabular-nums">{value}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[0.625rem] text-slate-500">{chart.accessibleSummary}</p>
    </section>

    {(sheet.pivots ?? []).map((pivot) => {
      const stored = buildPivotPreview({ cells, definition: pivot, maxRows: 12, maxColumns: 4 });
      return (
        <section key={pivot.id} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 min-w-0">
          <div className="font-semibold text-slate-200 break-words">{pivot.name}</div>
          <div className="text-[0.625rem] text-slate-500 break-words">
            {pivot.rowColumns?.join(', ') || pivot.rowColumn} {'\u2192'} {pivot.valueFields?.map((item) => `${item.aggregation}(${item.column})`).join(', ') || `${pivot.aggregation}(${pivot.valueColumn})`}
          </div>
          <div className="text-[0.625rem] text-slate-400" data-stored-pivot-state={stored.state}>{stored.message}</div>
          {stored.rows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => onUpdatePivot({
                ...pivot,
                collapsedKeys: (pivot.collapsedKeys ?? []).includes(row.key)
                  ? (pivot.collapsedKeys ?? []).filter((key) => key !== row.key)
                  : [...(pivot.collapsedKeys ?? []), row.key].slice(0, 10_000),
              })}
              className={`w-full rounded bg-black/20 px-2 py-1 text-left text-[0.625rem] text-slate-300 ${focusClass}`}
              aria-label={`${row.collapsed ? 'Aufklappen' : 'Zuklappen'}: ${row.label}`}
            >
              <span className="mr-2 text-cyan-300" aria-hidden="true">{row.collapsed ? '\u25b8' : '\u25be'}</span>
              <span className="break-words">{row.label}</span>
              <span className="float-right text-slate-500">{row.sourceRowCount} Quellzeilen</span>
            </button>
          ))}
        </section>
      );
    })}

    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <h3 className="font-semibold text-slate-200">Lokales Datenmodell</h3>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Primaertabelle" className={`${inputClass} ${focusClass}`} value={relationPrimary} onChange={(event) => setRelationPrimary(event.target.value)}>
          {dataModelTables.map((item) => <option key={item.table.id} value={item.table.id}>{item.table.name}</option>)}
        </select>
        <input aria-label="Primaerspalte" className={`${inputClass} ${focusClass}`} value={relationPrimaryColumn} onChange={(event) => setRelationPrimaryColumn(event.target.value)} placeholder="Primaerspalte" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Fremdtabelle" className={`${inputClass} ${focusClass}`} value={relationForeign} onChange={(event) => setRelationForeign(event.target.value)}>
          {dataModelTables.map((item) => <option key={item.table.id} value={item.table.id}>{item.table.name}</option>)}
        </select>
        <input aria-label="Fremdspalte" className={`${inputClass} ${focusClass}`} value={relationForeignColumn} onChange={(event) => setRelationForeignColumn(event.target.value)} placeholder="Fremdspalte" />
      </div>
      <button type="button" onClick={addRelationship} className={`vgt-button-secondary w-full ${focusClass}`}>Beziehung hinzufuegen</button>
      {inspections.map((item) => (
        <div key={item.relationshipId} className={`rounded px-2 py-1 text-[0.625rem] ${item.valid ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
          {item.relationshipId}: {item.valid ? 'gueltig' : 'ungueltig'} {'\u00b7'} passend {item.foreignMatched} {'\u00b7'} ohne Partner {item.foreignUnmatched}{item.issues.length ? ` \u00b7 ${item.issues.join(', ')}` : ''}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Measure-Name" className={`${inputClass} ${focusClass}`} value={measureName} onChange={(event) => setMeasureName(event.target.value)} placeholder="Measure" />
        <input aria-label="Measure-Formel" className={`${inputClass} font-mono ${focusClass}`} value={measureFormula} onChange={(event) => setMeasureFormula(event.target.value)} placeholder="SUM_Sales" />
      </div>
      <button type="button" onClick={addMeasure} className={`vgt-button-secondary w-full ${focusClass}`}>Sicheres Measure hinzufuegen</button>
      {(dataModel?.measures ?? []).map((measure) => (
        <div key={measure.id} className="rounded bg-black/20 px-2 py-1 text-[0.625rem] text-slate-300 break-words"><b>{measure.name}</b> = <span className="font-mono">{measure.formula}</span></div>
      ))}
    </section>
  </div>;
};

function zoneLabel(zone: PivotZone): string {
  switch (zone) {
    case 'rows': return 'Zeilen';
    case 'columns': return 'Spalten';
    case 'values': return 'Werte';
    case 'filters': return 'Filter';
    case 'available': return 'verfuegbare Felder';
    default: return zone;
  }
}

function describeZoneDestination(zone: PivotZone): string {
  return zone === 'available' ? 'den verfuegbaren Feldern' : zoneLabel(zone);
}
