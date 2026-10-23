// STATUS: DIAMANT VGT SUPREME — Astraea Insight canonical BI/analytics model

export type InsightScalar = string | number | boolean | null;
export type InsightRow = Record<string, InsightScalar>;
export type InsightDataType = 'string'|'integer'|'number'|'boolean'|'date'|'datetime'|'duration'|'currency'|'percentage'|'unknown';
export type InsightPrivacyLevel = 'public'|'organizational'|'private'|'restricted';
export type InsightTrustLevel = 'local-trusted'|'workspace-trusted'|'external-approved'|'untrusted';
export type InsightSourceKind = 'grid'|'database'|'forms'|'projects'|'tasks'|'vault-file'|'workspace-fabric'|'csv'|'tsv'|'json'|'parquet'|'xlsx'|'ods'|'external-db'|'http'|'odbc';
export type InsightConnectorState = 'idle'|'testing'|'ready'|'degraded'|'failed'|'cancelled';
export type InsightRelationshipCardinality = 'one-to-one'|'one-to-many'|'many-to-one'|'many-to-many';
export type InsightFilterDirection = 'single'|'both';
export type InsightSecurityRole = 'viewer'|'editor'|'modeler';
export type InsightCertification = 'none'|'promoted'|'certified';
export type InsightRefreshMode = 'manual'|'scheduled';
export type InsightVisualKind = 'bar'|'column'|'line'|'area'|'pie'|'donut'|'scatter'|'bubble'|'combo'|'waterfall'|'funnel'|'treemap'|'gauge'|'kpi'|'card'|'table'|'matrix'|'map'|'histogram'|'box-plot'|'heatmap'|'sparkline'|'distribution'|'statistical'|'custom';
export type AggregationFunction = 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX'|'COUNT_DISTINCT';
export type InsightQueryStepKind = 'select'|'remove'|'rename'|'filter'|'sort'|'split'|'merge'|'replace'|'convert'|'fill'|'pivot'|'unpivot'|'transpose'|'group'|'aggregate'|'join'|'append';

export interface InsightColumnSchema { name:string; type:InsightDataType; nullable:boolean; description?:string; }
export interface InsightSourceSchema { tables:Array<{name:string;columns:InsightColumnSchema[]}>; discoveredAt:number; }
export interface InsightDataSource {
  id:string;
  name:string;
  kind:InsightSourceKind;
  canonicalUri:string;
  privacy:InsightPrivacyLevel;
  trust:InsightTrustLevel;
  enabled:boolean;
  secretHandle?:string;
  netGateCapabilityId?:string;
  schema?:InsightSourceSchema;
  lastTest?:{at:number;state:InsightConnectorState;latencyMs:number;message:string};
  options?:Readonly<Record<string,InsightScalar>>;
}

export interface InsightConnectorPolicy { timeoutMs:number; maxRetries:number; maxPages:number; maxRows:number; maxBytes:number; }
export interface InsightConnectorPage { rows:InsightRow[]; nextCursor?:string; byteLength:number; }
export interface InsightConnectorAdapter {
  testConnection(source:InsightDataSource,secret:string|undefined,signal:AbortSignal):Promise<{ok:boolean;message:string}>;
  discoverSchema(source:InsightDataSource,secret:string|undefined,signal:AbortSignal):Promise<InsightSourceSchema>;
  readPage(source:InsightDataSource,secret:string|undefined,cursor:string|undefined,signal:AbortSignal):Promise<InsightConnectorPage>;
}

export interface InsightQueryStep {
  id:string;
  type:InsightQueryStepKind;
  enabled?:boolean;
  column?:string;
  columns?:string[];
  operator?:'='|'!='|'>'|'>='|'<'|'<='|'contains'|'startsWith'|'endsWith'|'isNull'|'notNull';
  value?:InsightScalar;
  direction?:'asc'|'desc';
  target?:string;
  delimiter?:string;
  replacement?:InsightScalar;
  dataType?:InsightDataType;
  method?:'down'|'up';
  keyColumns?:string[];
  aggregations?:Array<{column:string;as:string;fn:AggregationFunction}>;
  join?:{rightQueryId:string;leftKey:string;rightKey:string;kind:'inner'|'left'|'right'|'full'};
  appendQueryId?:string;
  pivot?:{keyColumn:string;valueColumn:string;aggregate:AggregationFunction};
  unpivot?:{columns:string[];nameColumn:string;valueColumn:string};
}
export interface InsightQuery {
  id:string;
  name:string;
  sourceId?:string;
  referenceQueryId?:string;
  duplicateOfQueryId?:string;
  steps:InsightQueryStep[];
  parameters:Record<string,InsightScalar>;
  reusable:boolean;
  folding:'disabled'|'auto'|'trusted-only';
  version:number;
}
export interface InsightQueryExecutionLimits { maxRows:number; maxColumns:number; maxBytes:number; maxSteps:number; maxJoinComparisons:number; maxCpuMs:number; }
export interface InsightQueryResult { rows:InsightRow[]; columns:string[]; elapsedMs:number; folded:boolean; warnings:string[]; }

export interface InsightSemanticColumn { id:string; name:string; dataType:InsightDataType; hidden:boolean; format?:string; sortByColumnId?:string; description?:string; displayFolder?:string; calculatedExpression?:string; }
export interface InsightSemanticTable { id:string; name:string; queryId?:string; columns:InsightSemanticColumn[]; hidden:boolean; dateTable?:{dateColumnId:string;start:string;end:string}; calculatedExpression?:string; }
export interface InsightRelationship { id:string; fromTableId:string; fromColumnId:string; toTableId:string; toColumnId:string; cardinality:InsightRelationshipCardinality; filterDirection:InsightFilterDirection; active:boolean; }
export interface InsightMeasure { id:string; name:string; tableId:string; expression:string; format?:string; description?:string; displayFolder?:string; }
export interface InsightKpiDefinition { id:string; name:string; measureId:string; targetExpression?:string; statusExpression?:string; trendExpression?:string; }
export interface InsightHierarchy { id:string; name:string; tableId:string; levels:Array<{id:string;columnId:string;name:string}>; }
export interface InsightRlsRule { id:string; role:string; tableId:string; expression:string; }
export interface InsightOlsRule { id:string; role:string; objectKind:'table'|'column'|'measure'; objectId:string; access:'none'|'read'; }
export interface InsightSemanticModel { tables:InsightSemanticTable[]; relationships:InsightRelationship[]; measures:InsightMeasure[]; kpis:InsightKpiDefinition[]; hierarchies:InsightHierarchy[]; rls:InsightRlsRule[]; ols:InsightOlsRule[]; }

export interface InsightVisualEncoding { category?:string; series?:string; values?:string[]; x?:string; y?:string; size?:string; latitude?:string; longitude?:string; /** How several rows of one category are combined. Absent means SUM (documented default). */ aggregation?:AggregationFunction; }
export interface InsightVisualFormat {
  title?:string; showLegend?:boolean; legendPosition?:'top'|'right'|'bottom'|'left'; showLabels?:boolean; numberFormat?:string;
  xScale?:'linear'|'log'|'time'|'band'; yScale?:'linear'|'log'|'time'|'band'; referenceLines?:number[]; errorBars?:boolean;
  conditionalColors?:Array<{operator:'>'|'>='|'<'|'<='|'=';value:number;colorToken:string}>;
}
export interface InsightVisual {
  id:string; kind:InsightVisualKind; title:string; queryId:string; x:number;y:number;width:number;height:number; layer:number; visible:boolean;
  encoding:InsightVisualEncoding; format:InsightVisualFormat; hierarchyId?:string; drillLevel?:number; smallMultipleBy?:string; tooltipFields?:string[];
  customVisual?:{packageId:string;signature:string;capabilities:string[]};
}
export interface InsightFilter { id:string; scope:'report'|'page'|'visual'; scopeId?:string; field:string; operator:'in'|'notIn'|'between'|'='|'!='|'>'|'>='|'<'|'<='; values:InsightScalar[]; enabled:boolean; }
export interface InsightSlicer { id:string; field:string; kind:'list'|'dropdown'|'date-range'|'hierarchy'; selection:InsightScalar[]; }
export interface InsightBookmark { id:string; name:string; pageId:string; filters:InsightFilter[]; slicers:InsightSlicer[]; visualVisibility:Record<string,boolean>; }
export type InsightReportObject =
  | {id:string;kind:'text';x:number;y:number;width:number;height:number;layer:number;visible:boolean;text:string;style?:Record<string,InsightScalar>}
  | {id:string;kind:'image';x:number;y:number;width:number;height:number;layer:number;visible:boolean;assetRef:string;altText:string}
  | {id:string;kind:'shape';x:number;y:number;width:number;height:number;layer:number;visible:boolean;shape:'rect'|'ellipse'|'line';style?:Record<string,InsightScalar>}
  | {id:string;kind:'button';x:number;y:number;width:number;height:number;layer:number;visible:boolean;label:string;action:{type:'bookmark'|'page'|'back'|'workspace-link';target:string}};
export interface InsightReportPage { id:string; name:string; width:number; height:number; visuals:InsightVisual[]; objects:InsightReportObject[]; filters:InsightFilter[]; slicers:InsightSlicer[]; layers:string[]; compactLayout?:Array<{visualId:string;x:number;y:number;width:number;height:number}>; tooltipPage?:boolean; drillthroughFields?:string[]; }
export interface InsightTheme { id:string; name:string; tokens:Record<string,string>; }
export interface InsightReportModel { pages:InsightReportPage[]; activePageId:string; reportFilters:InsightFilter[]; bookmarks:InsightBookmark[]; theme:InsightTheme; gridSize:number; snap:boolean; }

export interface InsightPerformanceSample { id:string; kind:'query'|'measure'|'visual'; objectId:string; durationMs:number; at:number; rows?:number; }
export interface InsightLineageNode { id:string; kind:'source'|'query'|'table'|'measure'|'visual'|'workspace-embed'; label:string; ref:string; }
export interface InsightLineageEdge { from:string; to:string; }
export interface InsightLineageGraph { nodes:InsightLineageNode[]; edges:InsightLineageEdge[]; }

export interface InsightRefreshConfig { mode:InsightRefreshMode; schedule?:{intervalMinutes:number;enabled:boolean}; incremental?:{enabled:boolean;keyColumn:string;timeColumn?:string;partitionSize:number}; }
export interface InsightCacheMetadata { enabled:boolean; quotaBytes:number; usedBytes:number; lastRefreshAt?:number; sourceState:'fresh'|'stale'|'offline'|'partial'|'empty'; snapshotAt?:number; partitionKeys:string[]; /** BATCH-INSIGHT-8: the sealed offline snapshot itself (base64 of the authenticated cache entries). It travels with the document, so the offline promise survives Save/Close/Reopen. */ snapshotCiphertext?:string; }
export interface InsightGovernance { owner:string; certification:InsightCertification; roles:Record<string,InsightSecurityRole>; sensitivity:'public'|'internal'|'confidential'|'restricted'; exportUnderlyingData:boolean; }
export interface InsightAuditEvent { id:string; at:number; action:'dataset'|'policy'|'share'|'export'|'refresh'; objectId:string; actor:string; outcome:'allowed'|'denied'|'failed'; detailCode:string; }
export interface InsightWorkspaceReference { id:string; canonicalUri:string; sourceDocumentId:string; sourceKind:'grid'|'database'|'forms'|'projects'|'tasks'|'vault'|'fabric'|'writer'|'present'|'spaces'|'whiteboard'; selector?:string; mode:'live'|'frozen'|'broken'; sourceVersion?:number; }

export interface KpiMetric { id:string; title:string; value:string|number; changePct:number; trend:'up'|'down'|'neutral'; targetValue?:string|number; category:string; /** Which measure the card projects. Absent for legacy cards that are resolved through the seeded id map. */ measure?:InsightKpiMeasure; }
/** The measurable quantities a KPI card can be bound to. Domain concept: it is persisted on the card. */
export type InsightKpiMeasure = 'revenue'|'margin'|'activeUsers'|'anomaly';
export interface InsightRecord extends Record<string, InsightScalar> { id:string; region:string; product:string; quarter:string; revenue:number; cost:number; activeUsers:number; anomalyScore:number; }

export interface InsightDocumentModel {
  schemaVersion:2;
  revision:number;
  datasetName:string;
  records:InsightRecord[];
  kpis:KpiMetric[];
  querySteps:InsightQueryStep[];
  pivotConfig:{rowDimension:keyof InsightRecord;colDimension:keyof InsightRecord;measure:'revenue'|'cost'|'activeUsers';aggFunc:AggregationFunction};
  sources:InsightDataSource[];
  queries:InsightQuery[];
  semanticModel:InsightSemanticModel;
  report:InsightReportModel;
  refresh:InsightRefreshConfig;
  cache:InsightCacheMetadata;
  governance:InsightGovernance;
  workspaceReferences:InsightWorkspaceReference[];
  performance:InsightPerformanceSample[];
  audit:InsightAuditEvent[];
}

export const DEFAULT_INSIGHT_MODEL:InsightDocumentModel={
  schemaVersion:2,revision:1,datasetName:'Sovereign-Operations-2026',
  records:[
    {id:'rec-1',region:'Europe-Central',product:'Astraea Enterprise Core',quarter:'Q1',revenue:145000,cost:42000,activeUsers:1240,anomalyScore:0.02},
    {id:'rec-2',region:'Europe-Central',product:'Sovereign Mesh',quarter:'Q1',revenue:98000,cost:31000,activeUsers:850,anomalyScore:0.01},
    {id:'rec-3',region:'Europe-North',product:'Astraea Enterprise Core',quarter:'Q1',revenue:112000,cost:38000,activeUsers:910,anomalyScore:0.03},
    {id:'rec-4',region:'Europe-North',product:'KeyVault HSM Enclave',quarter:'Q1',revenue:76000,cost:22000,activeUsers:430,anomalyScore:0},
    {id:'rec-5',region:'Europe-Central',product:'Astraea Enterprise Core',quarter:'Q2',revenue:168000,cost:45000,activeUsers:1420,anomalyScore:0.01},
    {id:'rec-6',region:'Europe-Central',product:'Sovereign Mesh',quarter:'Q2',revenue:124000,cost:34000,activeUsers:1100,anomalyScore:0.04},
    {id:'rec-7',region:'Europe-North',product:'Astraea Enterprise Core',quarter:'Q2',revenue:135000,cost:41000,activeUsers:1050,anomalyScore:0.02},
    {id:'rec-8',region:'Europe-North',product:'KeyVault HSM Enclave',quarter:'Q2',revenue:89000,cost:24000,activeUsers:510,anomalyScore:0.01},
  ],
  kpis:[
    {id:'kpi-rev',title:'Total Operating Revenue',value:'$947,000',changePct:18.4,trend:'up',category:'Finance'},
    {id:'kpi-margin',title:'Operating Gross Margin',value:'70.8%',changePct:4.2,trend:'up',category:'Finance'},
    {id:'kpi-users',title:'Active Sovereign Nodes',value:'7,510',changePct:22.1,trend:'up',category:'Topology'},
    {id:'kpi-anomaly',title:'NetGate Anomaly Rate',value:'0.018%',changePct:-15.3,trend:'down',category:'Security'},
  ],
  querySteps:[{id:'step-1',type:'filter',column:'quarter',operator:'=',value:'Q2'},{id:'step-2',type:'sort',column:'revenue',direction:'desc'}],
  pivotConfig:{rowDimension:'region',colDimension:'product',measure:'revenue',aggFunc:'SUM'},
  sources:[{id:'src-local',name:'Embedded Operations Sample',kind:'json',canonicalUri:'vgt://insight/embedded/operations',privacy:'organizational',trust:'local-trusted',enabled:true}],
  queries:[{id:'q-main',name:'Operations',sourceId:'src-local',steps:[{id:'step-1',type:'filter',column:'quarter',operator:'=',value:'Q2'},{id:'step-2',type:'sort',column:'revenue',direction:'desc'}],parameters:{},reusable:true,folding:'disabled',version:1}],
  semanticModel:{
    tables:[{id:'tbl-ops',name:'Operations',queryId:'q-main',hidden:false,columns:[
      {id:'col-id',name:'id',dataType:'string',hidden:true},{id:'col-region',name:'region',dataType:'string',hidden:false},{id:'col-product',name:'product',dataType:'string',hidden:false},
      {id:'col-quarter',name:'quarter',dataType:'string',hidden:false},{id:'col-revenue',name:'revenue',dataType:'currency',hidden:false,format:'$#,##0'},
      {id:'col-cost',name:'cost',dataType:'currency',hidden:false,format:'$#,##0'},{id:'col-users',name:'activeUsers',dataType:'integer',hidden:false},{id:'col-anomaly',name:'anomalyScore',dataType:'percentage',hidden:false}
    ]}],relationships:[],measures:[{id:'measure-revenue',name:'Total Revenue',tableId:'tbl-ops',expression:'SUM(revenue)',format:'$#,##0'}],kpis:[{id:'model-kpi-revenue',name:'Revenue',measureId:'measure-revenue'}],hierarchies:[],rls:[],ols:[]
  },
  report:{pages:[{id:'page-overview',name:'Overview',width:1280,height:720,visuals:[
    {id:'vis-revenue',kind:'column',title:'Revenue by Region',queryId:'q-main',x:32,y:32,width:560,height:300,layer:1,visible:true,encoding:{category:'region',values:['revenue']},format:{showLegend:true,showLabels:true,numberFormat:'$#,##0'}},
    {id:'vis-matrix',kind:'matrix',title:'Operations Matrix',queryId:'q-main',x:620,y:32,width:620,height:520,layer:1,visible:true,encoding:{category:'region',series:'product',values:['revenue']},format:{showLegend:false,showLabels:true}}
  ],objects:[{id:'txt-title',kind:'text',x:32,y:0,width:500,height:32,layer:2,visible:true,text:'Sovereign Operations Overview'}],filters:[],slicers:[],layers:['Background','Visuals','Annotations']}],activePageId:'page-overview',reportFilters:[],bookmarks:[],theme:{id:'theme-sovereign',name:'Sovereign',tokens:{background:'#07050d',surface:'#0e0a1b',accent:'#a855f7'}},gridSize:8,snap:true},
  refresh:{mode:'manual'},cache:{enabled:true,quotaBytes:64*1024*1024,usedBytes:0,sourceState:'stale',partitionKeys:[]},
  governance:{owner:'local-owner',certification:'none',roles:{},sensitivity:'internal',exportUnderlyingData:true},workspaceReferences:[],performance:[],audit:[]
};
