// STATUS: DIAMANT VGT SUPREME — bounded whole-model Connect undo/redo
import type{ConnectDocumentModel}from'../domain/types';
export interface ConnectUiHistory{undo:ConnectDocumentModel[];redo:ConnectDocumentModel[];}
export const EMPTY_CONNECT_HISTORY:ConnectUiHistory={undo:[],redo:[]};
const MAX=64;
const clone=(m:ConnectDocumentModel)=>structuredClone(m);
export function recordConnectEdit(history:ConnectUiHistory,current:ConnectDocumentModel):ConnectUiHistory{return{undo:[...history.undo,clone(current)].slice(-MAX),redo:[]};}
export function undoConnectEdit(history:ConnectUiHistory,current:ConnectDocumentModel):{history:ConnectUiHistory;model:ConnectDocumentModel}|undefined{const previous=history.undo.at(-1);if(!previous)return undefined;return{model:clone(previous),history:{undo:history.undo.slice(0,-1),redo:[clone(current),...history.redo].slice(0,MAX)}};}
export function redoConnectEdit(history:ConnectUiHistory,current:ConnectDocumentModel):{history:ConnectUiHistory;model:ConnectDocumentModel}|undefined{const next=history.redo[0];if(!next)return undefined;return{model:clone(next),history:{undo:[...history.undo,clone(current)].slice(-MAX),redo:history.redo.slice(1)}};}
