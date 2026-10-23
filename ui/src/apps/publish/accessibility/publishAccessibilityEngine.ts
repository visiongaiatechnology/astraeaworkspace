// STATUS: DIAMANT VGT SUPREME — Astraea Publish accessibility audit and reading-order contract
import type { PublishDocumentModel, PublishFrame } from '../../../shared/contracts/publish/workspacePublish';
import { assertPublishDocument } from '../model/publishDocumentEngine';

export interface PublishAccessibilityFinding { id:string; severity:'error'|'warning'; code:string; pageId:string; frameId?:string; message:string; }
export interface PublishReadingOrderEntry { pageId:string; frameId:string; role:NonNullable<PublishFrame['semanticRole']>; label:string; }

function visibleFrames(model:PublishDocumentModel,pageId:string):PublishFrame[]{return model.frames.filter(f=>f.pageId===pageId&&!f.hidden&&f.semanticRole!=='Artifact').sort((a,b)=>a.yMm-b.yMm||a.xMm-b.xMm||a.id.localeCompare(b.id));}
export function buildPublishReadingOrder(model:PublishDocumentModel):PublishReadingOrderEntry[]{assertPublishDocument(model);const out:PublishReadingOrderEntry[]=[];for(const page of model.pages)for(const frame of visibleFrames(model,page.id))out.push({pageId:page.id,frameId:frame.id,role:frame.semanticRole??(frame.type==='image'?'Figure':frame.type==='table'?'Table':'P'),label:(frame.altText||frame.name||frame.content.slice(0,120)||frame.id).trim()});return out;}
export function auditPublishAccessibility(model:PublishDocumentModel):PublishAccessibilityFinding[]{
  assertPublishDocument(model);const findings:PublishAccessibilityFinding[]=[];let lastHeading=0;
  for(const page of model.pages){for(const frame of visibleFrames(model,page.id)){
    const role=frame.semanticRole??(frame.type==='image'?'Figure':frame.type==='table'?'Table':'P');
    if((frame.type==='image'||role==='Figure')&&!frame.altText?.trim())findings.push({id:`a11y-alt-${frame.id}`,severity:'error',code:'figure-alt-missing',pageId:page.id,frameId:frame.id,message:'Figure/image frame requires explicit alternative text or Artifact semantics.'});
    if(role==='Link'&&!frame.workspaceReferenceId&&!frame.content.trim())findings.push({id:`a11y-link-${frame.id}`,severity:'error',code:'link-name-missing',pageId:page.id,frameId:frame.id,message:'Interactive link requires an accessible name.'});
    const heading=role==='H1'?1:role==='H2'?2:role==='H3'?3:0;if(heading){if(lastHeading&&heading>lastHeading+1)findings.push({id:`a11y-heading-${frame.id}`,severity:'warning',code:'heading-level-skip',pageId:page.id,frameId:frame.id,message:`Heading level jumps from H${lastHeading} to H${heading}.`});lastHeading=heading;}
  }}
  return findings;
}
