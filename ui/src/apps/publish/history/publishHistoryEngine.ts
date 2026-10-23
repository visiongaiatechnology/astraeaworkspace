// STATUS: DIAMANT VGT SUPREME — bounded local Publish undo/redo history
import type { PublishDocumentModel } from '../../../shared/contracts/publish/workspacePublish';
import { assertPublishDocument, syncPublishCompatibility } from '../model/publishDocumentEngine';

export const PUBLISH_HISTORY_LIMIT=64;
const clone=<T>(value:T):T=>structuredClone(value);
export interface PublishHistoryState { past:PublishDocumentModel[]; present:PublishDocumentModel; future:PublishDocumentModel[]; }

function normalizedForward(model:PublishDocumentModel,minimumRevision:number):PublishDocumentModel{
  const next=syncPublishCompatibility(clone(model));
  if(next.revision<minimumRevision)next.revision=minimumRevision;
  assertPublishDocument(next);
  return next;
}
export function createPublishHistory(model:PublishDocumentModel):PublishHistoryState{assertPublishDocument(model);return{past:[],present:clone(model),future:[]};}
export function pushPublishHistory(state:PublishHistoryState,nextInput:PublishDocumentModel):PublishHistoryState{
  const next=normalizedForward(nextInput,state.present.revision+1);
  return{past:[...state.past.slice(-(PUBLISH_HISTORY_LIMIT-1)),clone(state.present)],present:next,future:[]};
}
export function undoPublishHistory(state:PublishHistoryState):PublishHistoryState{
  if(!state.past.length)return state;
  const previous=normalizedForward(state.past[state.past.length-1],state.present.revision+1);
  return{past:state.past.slice(0,-1),present:previous,future:[clone(state.present),...state.future].slice(0,PUBLISH_HISTORY_LIMIT)};
}
export function redoPublishHistory(state:PublishHistoryState):PublishHistoryState{
  if(!state.future.length)return state;
  const [candidate,...rest]=state.future;
  const next=normalizedForward(candidate,state.present.revision+1);
  return{past:[...state.past.slice(-(PUBLISH_HISTORY_LIMIT-1)),clone(state.present)],present:next,future:rest.map(clone)};
}
