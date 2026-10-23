// STATUS: DIAMANT VGT SUPREME — bounded whole-flow undo/redo history.
import type { AutomateDocumentModel } from '../model/types';
export interface AutomateHistoryState{past:AutomateDocumentModel[];present:AutomateDocumentModel;future:AutomateDocumentModel[];}
const MAX=64;
function clean(model:AutomateDocumentModel):AutomateDocumentModel{return structuredClone(model);}
export function createAutomateHistory(model:AutomateDocumentModel):AutomateHistoryState{return{past:[],present:clean(model),future:[]};}
export function pushAutomateHistory(state:AutomateHistoryState,next:AutomateDocumentModel):AutomateHistoryState{if(JSON.stringify(state.present)===JSON.stringify(next))return state;const past=[...state.past,clean(state.present)];if(past.length>MAX)past.splice(0,past.length-MAX);return{past,present:clean(next),future:[]};}
export function undoAutomateHistory(state:AutomateHistoryState):AutomateHistoryState{const previous=state.past[state.past.length-1];if(!previous)return state;return{past:state.past.slice(0,-1),present:clean(previous),future:[clean(state.present),...state.future].slice(0,MAX)};}
export function redoAutomateHistory(state:AutomateHistoryState):AutomateHistoryState{const next=state.future[0];if(!next)return state;const past=[...state.past,clean(state.present)].slice(-MAX);return{past,present:clean(next),future:state.future.slice(1)};}
export function canUndoAutomate(state:AutomateHistoryState){return state.past.length>0;}export function canRedoAutomate(state:AutomateHistoryState){return state.future.length>0;}
