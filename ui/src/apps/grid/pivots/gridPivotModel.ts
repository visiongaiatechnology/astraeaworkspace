// STATUS: DIAMANT VGT SUPREME
// Persistent bounded multi-axis PivotTable model with grouping, filters, collapse and drill-down provenance.

import type {
  GridCell,
  GridPivotAggregation,
  GridPivotDefinition,
  GridPivotGroupingDefinition,
  GridPivotValueField,
} from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { evaluateGridSafeExpression } from '../../../shared/expressions/gridSafeExpression';
import { parseGridRange } from '../compat/gridProfessional';

const MAX_PIVOT_SOURCE_CELLS = 250_000;
const MAX_PIVOT_ROWS = 20_000;
const MAX_PIVOT_FIELDS = 32;
const MAX_PIVOT_GROUPS = 20_000;
const SEP = ' | ';

interface MetricAccumulator {
  numeric: number[];
  count: number;
  distinct: Set<string>;
}

interface PivotBucket {
  rowPath: string[];
  columnPath: string[];
  accumulators: MetricAccumulator[];
  sourceRecordRowIndices: Set<number>;
}

export interface GridPivotMetricValue {
  id: string;
  label: string;
  value: number;
}

export interface GridPivotMaterializedRow {
  key: string;
  rowPath: string[];
  depth: number;
  isSubtotal: boolean;
  collapsed: boolean;
  sourceRecordRowIndices: number[];
  cells: Record<string, GridPivotMetricValue[]>; // columnKey -> metrics
}

export interface GridPivotTableModel {
  rowFields: string[];
  columnFields: string[];
  valueFields: GridPivotValueField[];
  columnKeys: string[];
  rows: GridPivotMaterializedRow[];
  grandTotals: Record<string, GridPivotMetricValue[]>;
}

function columnIndex(column: string): number {
  const normalized = column.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(normalized)) throw new Error('pivot_invalid_column');
  let value = 0;
  for (const char of normalized) value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function normalizeFields(definition: GridPivotDefinition): { rows:string[]; columns:string[]; values:GridPivotValueField[] } {
  const rows = (definition.rowColumns?.length ? definition.rowColumns : [definition.rowColumn]).map((item)=>item.trim().toUpperCase()).filter(Boolean).slice(0,MAX_PIVOT_FIELDS);
  const columns = (definition.columnColumns ?? []).map((item)=>item.trim().toUpperCase()).filter(Boolean).slice(0,MAX_PIVOT_FIELDS);
  const values = (definition.valueFields?.length ? definition.valueFields : [{column:definition.valueColumn,aggregation:definition.aggregation}])
    .map((item)=>({column:item.column.trim().toUpperCase(),aggregation:item.aggregation,label:item.label?.trim().slice(0,128)})).slice(0,MAX_PIVOT_FIELDS);
  if (!rows.length || !values.length) throw new Error('pivot_requires_rows_and_values');
  return {rows,columns,values};
}

function groupingFor(column: string, definition: GridPivotDefinition): GridPivotGroupingDefinition | undefined {
  return definition.groupings?.find((item)=>item.column.trim().toUpperCase()===column);
}

function groupValue(value: unknown, grouping?: GridPivotGroupingDefinition): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '(blank)';
  if (!grouping) return raw.slice(0,256);
  const manual = grouping.manualGroups?.[raw];
  if (manual) return String(manual).slice(0,256);
  if (grouping.dateGrouping) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth()+1;
      if (grouping.dateGrouping==='year') return String(year);
      if (grouping.dateGrouping==='quarter') return `${year}-Q${Math.ceil(month/3)}`;
      if (grouping.dateGrouping==='month') return `${year}-${String(month).padStart(2,'0')}`;
      return date.toISOString().slice(0,10);
    }
  }
  if (grouping.numberBinSize && grouping.numberBinSize>0) {
    const number = Number(raw);
    if (Number.isFinite(number)) {
      const size = Math.max(Number.EPSILON, grouping.numberBinSize);
      const lower = Math.floor(number/size)*size;
      return `${lower} - ${lower+size}`;
    }
  }
  return raw.slice(0,256);
}

function rowPassesFilters(row:number, cells:Record<string,GridCell>, definition:GridPivotDefinition):boolean {
  const filters = definition.filters ?? [];
  for (const filter of filters) {
    const raw = cells[toA1(columnIndex(filter.column),row)]?.value;
    const text = String(raw ?? '');
    if (filter.allowedValues?.length && !filter.allowedValues.map(String).includes(text)) return false;
    const numeric = Number(raw);
    if (filter.min !== undefined && (!Number.isFinite(numeric) || numeric < filter.min)) return false;
    if (filter.max !== undefined && (!Number.isFinite(numeric) || numeric > filter.max)) return false;
    if (filter.dateFrom || filter.dateTo) {
      const time = new Date(text).getTime();
      if (!Number.isFinite(time)) return false;
      if (filter.dateFrom && time < new Date(filter.dateFrom).getTime()) return false;
      if (filter.dateTo && time > new Date(filter.dateTo).getTime()) return false;
    }
  }
  for (const timeline of definition.timelineFilters ?? []) {
    const raw = cells[toA1(columnIndex(timeline.column),row)]?.value;
    const time = new Date(String(raw ?? '')).getTime();
    if (!Number.isFinite(time)) return false;
    if (timeline.from && time < new Date(timeline.from).getTime()) return false;
    if (timeline.to && time > new Date(timeline.to).getTime()) return false;
  }
  return true;
}

function createAccumulators(length:number):MetricAccumulator[]{
  return Array.from({length},()=>({numeric:[],count:0,distinct:new Set<string>()}));
}

function addMetric(acc:MetricAccumulator, raw:unknown):void {
  if (raw !== null && raw !== undefined && raw !== '') {
    acc.count += 1;
    acc.distinct.add(String(raw));
    const value = Number(raw);
    if (Number.isFinite(value)) acc.numeric.push(value);
  }
}

function aggregate(acc:MetricAccumulator, aggregation:GridPivotAggregation):number {
  if (aggregation==='count') return acc.count;
  if (aggregation==='distinct_count') return acc.distinct.size;
  if (!acc.numeric.length) return 0;
  if (aggregation==='sum') return acc.numeric.reduce((sum,value)=>sum+value,0);
  if (aggregation==='average') return acc.numeric.reduce((sum,value)=>sum+value,0)/acc.numeric.length;
  if (aggregation==='min') return Math.min(...acc.numeric);
  return Math.max(...acc.numeric);
}

function metricId(field:GridPivotValueField,index:number):string {
  return `${field.column}:${field.aggregation}:${index}`;
}
function metricLabel(field:GridPivotValueField):string {
  return field.label || `${field.aggregation.toUpperCase()}(${field.column})`;
}
function safeVar(label:string):string { return label.replace(/[^A-Za-z0-9_]/g,'_').replace(/^([^A-Za-z_])/,'_$1').slice(0,128); }

function materializeMetrics(bucket:PivotBucket, values:GridPivotValueField[], definition:GridPivotDefinition):GridPivotMetricValue[]{
  const metrics = values.map((field,index)=>({id:metricId(field,index),label:metricLabel(field),value:aggregate(bucket.accumulators[index],field.aggregation)}));
  const vars:Record<string,number>={};
  metrics.forEach((metric,index)=>{ vars[safeVar(metric.label)]=metric.value; vars[safeVar(values[index].column)]=metric.value; });
  for (const calc of (definition.calculatedFields ?? []).slice(0,32)) {
    let value=0;
    try { value=evaluateGridSafeExpression(calc.formula,vars); } catch { value=0; }
    const rounded=Math.round(value*1e10)/1e10;
    metrics.push({id:`calc:${safeVar(calc.name)}`,label:calc.name.slice(0,128),value:rounded});
    vars[safeVar(calc.name)]=rounded;
  }
  return metrics.map((metric)=>({...metric,value:Math.round(metric.value*1e10)/1e10}));
}


function evaluateCalculatedItemFormula(formula:string, variables:Record<string,number>):number {
  try {
    const value=evaluateGridSafeExpression(formula,variables);
    return Number.isFinite(value)?Math.round(value*1e10)/1e10:0;
  } catch { return 0; }
}

function applyCalculatedItems(
  rows:GridPivotMaterializedRow[],
  columnKeys:string[],
  grandTotals:Record<string,GridPivotMetricValue[]>,
  definition:GridPivotDefinition,
):{rows:GridPivotMaterializedRow[];columnKeys:string[];grandTotals:Record<string,GridPivotMetricValue[]>}{
  const items=(definition.calculatedItems??[]).slice(0,32);
  if(!items.length)return {rows,columnKeys,grandTotals};
  const nextRows=rows.map((row)=>({...row,cells:{...row.cells}}));
  const nextColumnKeys=[...columnKeys];
  const nextGrandTotals={...grandTotals};
  for(const item of items){
    const field=item.field.trim().toUpperCase();
    const name=item.name.trim().slice(0,128);
    const formula=item.formula.trim().slice(0,2048);
    if(!name||!formula)continue;
    if(definition.rowColumns?.[0]?.trim().toUpperCase()===field || definition.rowColumn.trim().toUpperCase()===field){
      const fieldFilter=(definition.filters??[]).find((filter)=>filter.column.trim().toUpperCase()===field);
      if(fieldFilter?.allowedValues?.length && !fieldFilter.allowedValues.includes(name)) continue;
      const topLevel=nextRows.filter((row)=>row.depth===1);
      const synthetic:GridPivotMaterializedRow={key:name,rowPath:[name],depth:1,isSubtotal:false,collapsed:false,sourceRecordRowIndices:[],cells:{}};
      for(const columnKey of nextColumnKeys){
        const maxMetrics=Math.max(0,...topLevel.map((row)=>row.cells[columnKey]?.length??0));
        const metrics:GridPivotMetricValue[]=[];
        for(let metricIndex=0;metricIndex<maxMetrics;metricIndex++){
          const vars:Record<string,number>={};
          for(const row of topLevel){const metric=row.cells[columnKey]?.[metricIndex];if(metric)vars[safeVar(row.rowPath[0]??row.key)]=metric.value;}
          const sample=topLevel.map((row)=>row.cells[columnKey]?.[metricIndex]).find(Boolean);
          metrics.push({id:`calc-item:${safeVar(name)}:${metricIndex}`,label:sample?.label??name,value:evaluateCalculatedItemFormula(formula,vars)});
        }
        synthetic.cells[columnKey]=metrics;
      }
      const existing=nextRows.findIndex((row)=>row.key===name); if(existing>=0)nextRows.splice(existing,1); nextRows.push(synthetic);
    } else if((definition.columnColumns??[]).map((value)=>value.trim().toUpperCase()).includes(field)){
      const fieldFilter=(definition.filters??[]).find((filter)=>filter.column.trim().toUpperCase()===field);
      if(fieldFilter?.allowedValues?.length && !fieldFilter.allowedValues.includes(name)) continue;
      if(!nextColumnKeys.includes(name))nextColumnKeys.push(name);
      for(const row of nextRows){
        const maxMetrics=Math.max(0,...nextColumnKeys.filter((key)=>key!==name).map((key)=>row.cells[key]?.length??0));
        const metrics:GridPivotMetricValue[]=[];
        for(let metricIndex=0;metricIndex<maxMetrics;metricIndex++){
          const vars:Record<string,number>={};
          for(const key of nextColumnKeys){if(key===name)continue;const metric=row.cells[key]?.[metricIndex];if(metric)vars[safeVar(key)]=metric.value;}
          const sample=Object.values(row.cells).map((values)=>values[metricIndex]).find(Boolean);
          metrics.push({id:`calc-item:${safeVar(name)}:${metricIndex}`,label:sample?.label??name,value:evaluateCalculatedItemFormula(formula,vars)});
        }
        row.cells[name]=metrics;
      }
      const maxMetrics=Math.max(0,...Object.values(nextGrandTotals).map((values)=>values.length));
      const totals:GridPivotMetricValue[]=[];
      for(let metricIndex=0;metricIndex<maxMetrics;metricIndex++){
        const vars:Record<string,number>={};
        for(const [key,metrics] of Object.entries(nextGrandTotals)){const metric=metrics[metricIndex];if(metric)vars[safeVar(key)]=metric.value;}
        const sample=Object.values(nextGrandTotals).map((values)=>values[metricIndex]).find(Boolean);
        totals.push({id:`calc-item:${safeVar(name)}:${metricIndex}`,label:sample?.label??name,value:evaluateCalculatedItemFormula(formula,vars)});
      }
      nextGrandTotals[name]=totals;
    }
  }
  nextRows.sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true,sensitivity:'base'}));
  nextColumnKeys.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
  return {rows:nextRows,columnKeys:nextColumnKeys,grandTotals:nextGrandTotals};
}

function isDescendantOfCollapsed(rowPath:string[], collapsed:Set<string>):boolean {
  for(let depth=1;depth<rowPath.length;depth++) if(collapsed.has(rowPath.slice(0,depth).join(SEP))) return true;
  return false;
}

export function buildPivotTableModel(cells:Record<string,GridCell>,definition:GridPivotDefinition):GridPivotTableModel {
  const bounds=parseGridRange(definition.sourceRange);
  if(!bounds) throw new Error('pivot_invalid_source_range');
  const sourceCells=(bounds.endRow-bounds.startRow+1)*(bounds.endCol-bounds.startCol+1);
  if(sourceCells>MAX_PIVOT_SOURCE_CELLS || bounds.endRow-bounds.startRow>MAX_PIVOT_ROWS) throw new Error('pivot_source_limit');
  const {rows:rowFields,columns:columnFields,values:valueFields}=normalizeFields(definition);
  const allFields=[...rowFields,...columnFields,...valueFields.map((item)=>item.column),...(definition.filters??[]).map((item)=>item.column),...(definition.timelineFilters??[]).map((item)=>item.column)];
  for(const field of allFields){const index=columnIndex(field);if(index<bounds.startCol||index>bounds.endCol)throw new Error(`pivot_field_outside_source:${field}`);}

  const buckets=new Map<string,PivotBucket>();
  const grand=new Map<string,PivotBucket>();
  const columnKeySet=new Set<string>();
  const ensure=(map:Map<string,PivotBucket>,key:string,rowPath:string[],columnPath:string[]):PivotBucket=>{
    let bucket=map.get(key); if(!bucket){if(map.size>=MAX_PIVOT_GROUPS)throw new Error('pivot_group_limit');bucket={rowPath,columnPath,accumulators:createAccumulators(valueFields.length),sourceRecordRowIndices:new Set<number>()};map.set(key,bucket);}return bucket;
  };

  for(let row=bounds.startRow+1;row<=bounds.endRow;row++){
    if(!rowPassesFilters(row,cells,definition)) continue;
    const fullRowPath=rowFields.map((field)=>groupValue(cells[toA1(columnIndex(field),row)]?.value,groupingFor(field,definition)));
    const columnPath=columnFields.map((field)=>groupValue(cells[toA1(columnIndex(field),row)]?.value,groupingFor(field,definition)));
    const columnKey=columnPath.length?columnPath.join(SEP):'(values)'; columnKeySet.add(columnKey);
    for(let depth=1;depth<=fullRowPath.length;depth++){
      const rowPath=fullRowPath.slice(0,depth), rowKey=rowPath.join(SEP), key=`${rowKey}\u0000${columnKey}`;
      const bucket=ensure(buckets,key,rowPath,columnPath); bucket.sourceRecordRowIndices.add(row);
      valueFields.forEach((field,index)=>addMetric(bucket.accumulators[index],cells[toA1(columnIndex(field.column),row)]?.value));
    }
    const grandBucket=ensure(grand,columnKey,[],columnPath); grandBucket.sourceRecordRowIndices.add(row);
    valueFields.forEach((field,index)=>addMetric(grandBucket.accumulators[index],cells[toA1(columnIndex(field.column),row)]?.value));
  }

  const collapsed=new Set((definition.collapsedKeys??[]).map(String));
  const groupedRows=new Map<string,GridPivotMaterializedRow>();
  for(const bucket of buckets.values()){
    if(isDescendantOfCollapsed(bucket.rowPath,collapsed)) continue;
    const rowKey=bucket.rowPath.join(SEP); let row=groupedRows.get(rowKey);
    if(!row){row={key:rowKey,rowPath:bucket.rowPath,depth:bucket.rowPath.length,isSubtotal:bucket.rowPath.length<rowFields.length,collapsed:collapsed.has(rowKey),sourceRecordRowIndices:[],cells:{}};groupedRows.set(rowKey,row);}
    const columnKey=bucket.columnPath.length?bucket.columnPath.join(SEP):'(values)';
    row.cells[columnKey]=materializeMetrics(bucket,valueFields,definition);
    row.sourceRecordRowIndices=Array.from(new Set([...row.sourceRecordRowIndices,...bucket.sourceRecordRowIndices])).sort((a,b)=>a-b);
  }
  const rows=Array.from(groupedRows.values()).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true,sensitivity:'base'}));
  const grandTotals:Record<string,GridPivotMetricValue[]>={}; for(const [key,bucket] of grand) grandTotals[key]=materializeMetrics(bucket,valueFields,definition);
  const calculated=applyCalculatedItems(rows,Array.from(columnKeySet).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),grandTotals,definition);
  return {rowFields,columnFields,valueFields,columnKeys:calculated.columnKeys,rows:calculated.rows,grandTotals:calculated.grandTotals};
}

export function togglePivotCollapsed(definition:GridPivotDefinition,rowKey:string):GridPivotDefinition {
  const keys=new Set(definition.collapsedKeys??[]); if(keys.has(rowKey))keys.delete(rowKey);else keys.add(rowKey);
  return {...definition,collapsedKeys:Array.from(keys).slice(0,10_000)};
}

export function applyPivotSlicer(definition:GridPivotDefinition,column:string,selectedValues:string[]):GridPivotDefinition {
  const key=column.trim().toUpperCase(); const filters=(definition.filters??[]).filter((filter)=>filter.column.trim().toUpperCase()!==key);
  return {...definition,filters:selectedValues.length?[...filters,{column:key,allowedValues:selectedValues.slice(0,2_048)}]:filters};
}

export function applyPivotTimeline(definition:GridPivotDefinition,column:string,from?:string,to?:string):GridPivotDefinition {
  const key=column.trim().toUpperCase(); const rest=(definition.timelineFilters??[]).filter((item)=>item.column.trim().toUpperCase()!==key);
  return {...definition,timelineFilters:from||to?[...rest,{column:key,from,to}]:rest};
}

export function pivotTableModelToCells(model:GridPivotTableModel,definition:GridPivotDefinition):Record<string,GridCell>{
  const cells:Record<string,GridCell>={}; const style=definition.style??{};
  const headerBg=style.headerBackground&&/^#[0-9a-f]{6}$/i.test(style.headerBackground)?style.headerBackground:'#1e293b';
  const headerText=style.headerTextColor&&/^#[0-9a-f]{6}$/i.test(style.headerTextColor)?style.headerTextColor:'#93c5fd';
  let col=0; for(const field of model.rowFields) cells[toA1(col++,0)]={value:field,bold:true,background:headerBg,text_color:headerText};
  for(const columnKey of model.columnKeys) for(const valueField of model.valueFields){cells[toA1(col++,0)]={value:`${columnKey} · ${metricLabel(valueField)}`,bold:true,background:headerBg,text_color:headerText};}
  let rowIndex=1;
  for(const row of model.rows){
    row.rowPath.forEach((value,index)=>{cells[toA1(index,rowIndex)]={value:index===row.rowPath.length-1?`${row.collapsed?'▸':'▾'} ${value}`:value,bold:row.isSubtotal,background:style.alternateRows&&rowIndex%2===0?'#0f172a':undefined};});
    let valueCol=model.rowFields.length;
    for(const columnKey of model.columnKeys){const metrics=row.cells[columnKey]??[];for(const metric of metrics.slice(0,model.valueFields.length)){cells[toA1(valueCol++,rowIndex)]={value:metric.value,format:'number',numberFormatCode:style.numberFormatCode};}}
    rowIndex++;
  }
  const totalRow=rowIndex; cells[toA1(0,totalRow)]={value:'Grand Total',bold:true,background:style.totalBackground??'#172554'}; col=model.rowFields.length;
  for(const columnKey of model.columnKeys){const metrics=model.grandTotals[columnKey]??[];for(const metric of metrics.slice(0,model.valueFields.length)) cells[toA1(col++,totalRow)]={value:metric.value,bold:true,format:'number',background:style.totalBackground??'#172554',numberFormatCode:style.numberFormatCode};}
  return cells;
}
