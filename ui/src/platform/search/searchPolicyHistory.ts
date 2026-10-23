// STATUS: DIAMANT VGT SUPREME — bounded reversible Search administration state.
import type {SearchAdminPolicy} from './searchTypes';
const MAX_HISTORY=64;
export interface SearchPolicyHistory{past:SearchAdminPolicy[];present:SearchAdminPolicy;future:SearchAdminPolicy[];}
function clone(policy:SearchAdminPolicy):SearchAdminPolicy{return structuredClone(policy);}
function same(a:SearchAdminPolicy,b:SearchAdminPolicy):boolean{return JSON.stringify(a)===JSON.stringify(b);}
export function createSearchPolicyHistory(policy:SearchAdminPolicy):SearchPolicyHistory{return{past:[],present:clone(policy),future:[]};}
export function pushSearchPolicyHistory(history:SearchPolicyHistory,next:SearchAdminPolicy):SearchPolicyHistory{if(same(history.present,next))return history;return{past:[...history.past,clone(history.present)].slice(-MAX_HISTORY),present:clone(next),future:[]};}
export function undoSearchPolicyHistory(history:SearchPolicyHistory):SearchPolicyHistory{const prior=history.past.at(-1);if(!prior)return history;return{past:history.past.slice(0,-1),present:clone(prior),future:[clone(history.present),...history.future].slice(0,MAX_HISTORY)};}
export function redoSearchPolicyHistory(history:SearchPolicyHistory):SearchPolicyHistory{const next=history.future[0];if(!next)return history;return{past:[...history.past,clone(history.present)].slice(-MAX_HISTORY),present:clone(next),future:history.future.slice(1)};}
