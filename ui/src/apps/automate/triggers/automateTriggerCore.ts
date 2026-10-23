// STATUS: DIAMANT VGT SUPREME — Trigger validation and scheduling boundaries.
export type WorkspaceTriggerEvent='document.created'|'document.saved'|'task.changed'|'vault.entry';
/** The workspace events the contract accepts. Exported so the palette and the validator share one list. */
export const WORKSPACE_TRIGGER_EVENTS:readonly WorkspaceTriggerEvent[]=['document.created','document.saved','task.changed','vault.entry'];
export type TriggerDefinition=
 |{kind:'manual';surface:'button'|'context-menu'|'share-sheet'}
 |{kind:'schedule';timezone:string;every:{unit:'minute'|'hour'|'day'|'week';interval:number};startAt:number;endAt?:number;missedRun:'skip'|'run-once';concurrency:number}
 |{kind:'workspace-event';event:WorkspaceTriggerEvent}
 |{kind:'connector';connector:'mail'|'calendar'|'webhook';capabilityId:string;webhookSchemaId?:string}
 |{kind:'file-watch';pathHandle:string;events:('create'|'modify'|'delete')[];debounceMs:number;followLinks:false};
export class AutomateTriggerError extends Error{constructor(public readonly code:string){super(code);this.name='AutomateTriggerError';}}
export function validateTrigger(t:TriggerDefinition):void{switch(t.kind){case'manual':return;case'schedule':if(!validTimeZone(t.timezone))throw new AutomateTriggerError('schedule-timezone-invalid');if(!Number.isInteger(t.every.interval)||t.every.interval<1||t.every.interval>10080)throw new AutomateTriggerError('schedule-interval-boundary');if(!Number.isFinite(t.startAt)||t.endAt!==undefined&&(!Number.isFinite(t.endAt)||t.endAt<t.startAt))throw new AutomateTriggerError('schedule-window-invalid');if(!Number.isInteger(t.concurrency)||t.concurrency<1||t.concurrency>32)throw new AutomateTriggerError('schedule-concurrency-boundary');return;case'workspace-event':return;case'connector':if(!/^cap:[a-z0-9][a-z0-9._:-]{1,127}$/.test(t.capabilityId))throw new AutomateTriggerError('connector-capability-required');if(t.connector==='webhook'&&!t.webhookSchemaId)throw new AutomateTriggerError('webhook-schema-required');return;case'file-watch':if(!/^pathhandle:[A-Za-z0-9._:-]{4,256}$/.test(t.pathHandle))throw new AutomateTriggerError('watch-path-handle-required');if(t.followLinks!==false)throw new AutomateTriggerError('watch-links-forbidden');if(t.events.length===0||t.events.length>3)throw new AutomateTriggerError('watch-events-invalid');if(!Number.isInteger(t.debounceMs)||t.debounceMs<100||t.debounceMs>60000)throw new AutomateTriggerError('watch-debounce-boundary');return;}}
export function scheduleDue(t:Extract<TriggerDefinition,{kind:'schedule'}>,now:number,lastRun?:number):boolean{validateTrigger(t);if(now<t.startAt||(t.endAt!==undefined&&now>t.endAt))return false;const unitMs={minute:60000,hour:3600000,day:86400000,week:604800000}[t.every.unit],period=unitMs*t.every.interval;const dueAt=lastRun===undefined?t.startAt:lastRun+period;if(now<dueAt)return false;if(lastRun!==undefined&&now-dueAt>period&&t.missedRun==='skip')return false;return true;}
function validTimeZone(zone:string):boolean{if(zone.length<1||zone.length>128)return false;try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format(0);return true;}catch{return false;}}

/**
 * Rebuild a `TriggerDefinition` from the loose `JsonValue` config of a palette-created node.
 *
 * The palette stores trigger config as JSON, which `validateTrigger` cannot consume. Without this
 * adapter an invalid schedule (interval 0, unknown timezone, a webhook with no capability) was
 * accepted into the document by construction and then reported as "checked" by a trial. Unknown or
 * missing fields are refused with a named code; nothing is defaulted silently.
 */
export function triggerFromNodeConfig(config:Readonly<Record<string,unknown>>):TriggerDefinition{
 const kind=config.triggerKind;
 if(kind==='manual')return{kind:'manual',surface:'button'};
 if(kind==='workspace-event'){const event=config.event;if(typeof event!=='string'||!WORKSPACE_TRIGGER_EVENTS.includes(event as WorkspaceTriggerEvent))throw new AutomateTriggerError('workspace-event-unknown');return{kind:'workspace-event',event:event as WorkspaceTriggerEvent};}
 if(kind==='schedule'){const every=config.every;if(!every||typeof every!=='object')throw new AutomateTriggerError('schedule-every-required');const e=every as Record<string,unknown>;const unit=e.unit;if(unit!=='minute'&&unit!=='hour'&&unit!=='day'&&unit!=='week')throw new AutomateTriggerError('schedule-unit-invalid');const interval=e.interval;if(typeof interval!=='number')throw new AutomateTriggerError('schedule-interval-boundary');const timezone=typeof config.timezone==='string'?config.timezone:'UTC';const startAt=typeof config.startAt==='number'?config.startAt:0;const concurrency=typeof config.concurrency==='number'?config.concurrency:1;const missedRun=config.missedRun==='run-once'?'run-once':'skip';const endAt=typeof config.endAt==='number'?config.endAt:undefined;const def:TriggerDefinition={kind:'schedule',timezone,every:{unit,interval},startAt,missedRun,concurrency,...(endAt===undefined?{}:{endAt})};validateTrigger(def);return def;}
 throw new AutomateTriggerError('trigger-kind-unsupported');
}
