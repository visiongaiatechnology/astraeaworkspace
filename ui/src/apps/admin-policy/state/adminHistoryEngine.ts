// STATUS: DIAMANT VGT SUPREME — bounded policy undo/redo snapshots
import type{AdminPolicyModel}from'../model/types';
export interface AdminPolicyHistory{past:AdminPolicyModel[];present:AdminPolicyModel;future:AdminPolicyModel[];}
const MAX=64,clone=(v:AdminPolicyModel)=>JSON.parse(JSON.stringify(v)) as AdminPolicyModel;
export function createAdminPolicyHistory(model:AdminPolicyModel):AdminPolicyHistory{return{past:[],present:clone(model),future:[]};}
export function pushAdminPolicyHistory(h:AdminPolicyHistory,next:AdminPolicyModel):AdminPolicyHistory{if(JSON.stringify(h.present)===JSON.stringify(next))return h;return{past:[...h.past,clone(h.present)].slice(-MAX),present:clone(next),future:[]};}
export function undoAdminPolicyHistory(h:AdminPolicyHistory):AdminPolicyHistory{const prev=h.past.at(-1);if(!prev)return h;return{past:h.past.slice(0,-1),present:clone(prev),future:[clone(h.present),...h.future].slice(0,MAX)};}
export function redoAdminPolicyHistory(h:AdminPolicyHistory):AdminPolicyHistory{const next=h.future[0];if(!next)return h;return{past:[...h.past,clone(h.present)].slice(-MAX),present:clone(next),future:h.future.slice(1)};}
