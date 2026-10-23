// STATUS: DIAMANT VGT SUPREME — bounded Insight undo/redo history
import type { InsightDocumentModel } from '../domain/types';
import { normalizeInsightModel } from '../core/insightCore';
export const INSIGHT_HISTORY_LIMIT=64;
const clone=<T>(v:T):T=>structuredClone(v);
export interface InsightHistoryState{past:InsightDocumentModel[];present:InsightDocumentModel;future:InsightDocumentModel[];}
function forward(model:InsightDocumentModel,minRevision:number):InsightDocumentModel{const n=normalizeInsightModel(clone(model));n.revision=Math.max(n.revision,minRevision);return n;}
export function createInsightHistory(model:InsightDocumentModel):InsightHistoryState{return{past:[],present:clone(normalizeInsightModel(model)),future:[]};}
export function pushInsightHistory(state:InsightHistoryState,next:InsightDocumentModel):InsightHistoryState{return{past:[...state.past.slice(-(INSIGHT_HISTORY_LIMIT-1)),clone(state.present)],present:forward(next,state.present.revision+1),future:[]};}
export function undoInsightHistory(state:InsightHistoryState):InsightHistoryState{if(!state.past.length)return state;const previous=forward(state.past.at(-1)!,state.present.revision+1);return{past:state.past.slice(0,-1),present:previous,future:[clone(state.present),...state.future].slice(0,INSIGHT_HISTORY_LIMIT)};}
export function redoInsightHistory(state:InsightHistoryState):InsightHistoryState{if(!state.future.length)return state;const [candidate,...rest]=state.future;return{past:[...state.past.slice(-(INSIGHT_HISTORY_LIMIT-1)),clone(state.present)],present:forward(candidate,state.present.revision+1),future:rest.map(clone)};}
