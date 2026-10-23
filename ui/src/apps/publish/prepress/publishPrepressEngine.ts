// STATUS: DIAMANT VGT SUPREME — Astraea Publish ICC, ink, separations and navigable preflight engine
import type { PublishDocumentModel, PublishPreflightFinding, PublishPreflightProfile, PublishSwatch } from '../contracts/types';
import { detectOversetFrames, PublishModelError } from '../model/publishDocumentEngine';

export type IccProfileId = 'FOGRA39' | 'FOGRA51' | 'SWOP_2006' | 'GRACOL_2013';
export interface IccProfile {id:IccProfileId;name:string;standard:string;maxTicPercent:number;description:string;colorSpace:'CMYK';}
export interface CmykColor {c:number;m:number;y:number;k:number;totalInk:number;}
export interface SeparationPlate {id:string;name:string;colorHex:string;density:number;active:boolean;isSpot:boolean;}
export interface TicViolation {id:string;pageIndex:number;frameId:string;xMm:number;yMm:number;measuredTic:number;limitTic:number;description:string;}
export interface PrepressInspectionReport {timestamp:number;profile:IccProfile;maxTicMeasured:number;ticViolationsCount:number;violations:TicViolation[];separations:SeparationPlate[];findings:PublishPreflightFinding[];pdfXCompliant:boolean;summary:string;}

export const AVAILABLE_ICC_PROFILES:Record<IccProfileId,IccProfile>={
 FOGRA39:{id:'FOGRA39',name:'ISO Coated v2 (ECI) / FOGRA39',standard:'ISO 12647-2:2004',maxTicPercent:330,description:'European sheet-fed offset profile for coated stock.',colorSpace:'CMYK'},
 FOGRA51:{id:'FOGRA51',name:'PSO Coated v3 / FOGRA51',standard:'ISO 12647-2:2013',maxTicPercent:300,description:'Modern European offset profile with OBA compensation.',colorSpace:'CMYK'},
 SWOP_2006:{id:'SWOP_2006',name:'SWOP 2006 Coated #3 / 20x',standard:'ANSI CGATS.17',maxTicPercent:300,description:'North American web offset publication profile.',colorSpace:'CMYK'},
 GRACOL_2013:{id:'GRACOL_2013',name:'GRACoL 2013 Coated (CRPC6)',standard:'ISO 15339',maxTicPercent:320,description:'North American commercial sheet-fed G7 profile.',colorSpace:'CMYK'},
};

export function rgbToCmyk(r:number,g:number,b:number):CmykColor{for(const v of [r,g,b])if(!Number.isFinite(v))throw new PublishModelError('color-component-invalid');const R=Math.max(0,Math.min(255,r))/255,G=Math.max(0,Math.min(255,g))/255,B=Math.max(0,Math.min(255,b))/255;const k=1-Math.max(R,G,B);if(k>=.999999)return{c:0,m:0,y:0,k:100,totalInk:100};const c=Math.round(((1-R-k)/(1-k))*100),m=Math.round(((1-G-k)/(1-k))*100),y=Math.round(((1-B-k)/(1-k))*100),kv=Math.round(k*100);return{c,m,y,k:kv,totalInk:c+m+y+kv};}
export function hexToCmyk(hex:string):CmykColor{const clean=hex.trim().replace(/^#/,'');if(!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean))throw new PublishModelError('color-hex-invalid');const h=clean.length===3?clean.split('').map(c=>c+c).join(''):clean;return rgbToCmyk(parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16));}
export function colorToCmyk(swatch:PublishSwatch):CmykColor{const c=swatch.components;if(swatch.tintPercent<0||swatch.tintPercent>100)throw new PublishModelError('swatch-tint-invalid');const t=swatch.tintPercent/100;if(swatch.space==='CMYK'||swatch.space==='Spot'){if(c.length<4||c.slice(0,4).some(v=>!Number.isFinite(v)||v<0||v>100))throw new PublishModelError('swatch-components-invalid');const [C,M,Y,K]=c.slice(0,4).map(v=>Math.round(v*t));return{c:C,m:M,y:Y,k:K,totalInk:C+M+Y+K};}if(swatch.space==='RGB'){if(c.length<3)throw new PublishModelError('swatch-components-invalid');const base=rgbToCmyk(c[0],c[1],c[2]);return{c:Math.round(base.c*t),m:Math.round(base.m*t),y:Math.round(base.y*t),k:Math.round(base.k*t),totalInk:Math.round(base.totalInk*t)};}if(swatch.space==='Gray'){const k=Math.round((c[0]??0)*t);return{c:0,m:0,y:0,k,totalInk:k};}if(swatch.space==='Lab'){const L=Math.max(0,Math.min(100,c[0]??50));const gray=Math.round((100-L)*2.55);return rgbToCmyk(gray,gray,gray);}throw new PublishModelError('swatch-space-invalid');}
export function softProofHex(hex:string,profileId:IccProfileId):{source:string;profile:IccProfileId;cmyk:CmykColor;clipped:boolean}{const cmyk=hexToCmyk(hex),limit=AVAILABLE_ICC_PROFILES[profileId].maxTicPercent;return{source:hex,profile:profileId,cmyk,clipped:cmyk.totalInk>limit};}

export function createDefaultPreflightProfile(profileId:IccProfileId='FOGRA51'):PublishPreflightProfile{const p=AVAILABLE_ICC_PROFILES[profileId];return{id:`preflight-${profileId}`,name:`${p.name} Print`,minImageDpi:250,requireBleedMm:3,requireEmbeddedFonts:true,allowedColorSpaces:['CMYK','Gray','Lab','Spot'],maxTicPercent:p.maxTicPercent,disallowTransparency:false,outputProfileId:profileId};}

/**
 * **Das Ausgabeprofil anzeigen** (`AST-1396`) — „Spot-/Prozessfarben getrennt behandeln, Ausgabeprofil anzeigen".
 *
 * Gemessen vorher: die vier ICC-Profile standen in `AVAILABLE_ICC_PROFILES`, aber **kein** Feld der Oberflaeche
 * nannte das **aktive**. Der Nutzer sah die Auswahl im Prepress-Dialog, nicht aber, welches Profil das Dokument
 * fuehrt — *und ob es ueberhaupt **im Dokument** liegt (`model.iccProfiles`) oder nur als Name benutzt wird.*
 *
 * Genau diese Unterscheidung ist die Aussage: **`embedded`** heisst „das Profil liegt im Dokument",
 * **`referenced`** heisst „nur der registrierte Name wird benutzt". *Fuer PDF/X-4 genuegt `referenced`; fuer
 * PDF/X-1a nicht — und das ist der Grund, warum die Ausgabe ohne Profilbytes benannt verweigert wird.*
 */
export interface PublishOutputProfileView {
  readonly profileId:IccProfileId;
  readonly name:string;
  readonly standard:string;
  readonly maxTicPercent:number;
  readonly description:string;
  /** Liegt das Profil **im Dokument**? — die eine Unterscheidung, die der Nutzer sehen muss. */
  readonly state:'embedded'|'referenced';
  /** Ein Satz fuer die Oberflaeche — **ohne Farbe**, mit beiden Tatsachen. */
  readonly summary:string;
}

export function describePublishOutputProfile(model:PublishDocumentModel,profileId:IccProfileId='FOGRA51'):PublishOutputProfileView{
  const profile=AVAILABLE_ICC_PROFILES[profileId]??AVAILABLE_ICC_PROFILES.FOGRA51;
  const embedded=model.iccProfiles.some((candidate)=>candidate.id===profileId);
  const state:PublishOutputProfileView['state']=embedded?'embedded':'referenced';
  return{profileId:profile.id,name:profile.name,standard:profile.standard,maxTicPercent:profile.maxTicPercent,description:profile.description,state,
    summary:`${profile.name} · ${profile.standard} · max ${profile.maxTicPercent}% TIC · ${state==='embedded'?'profile embedded in the document':'registered condition name only'}`};
}

function finding(id:string,severity:PublishPreflightFinding['severity'],category:PublishPreflightFinding['category'],message:string,extra:Partial<PublishPreflightFinding>={}):PublishPreflightFinding{return{id,severity,category,message,navigable:Boolean(extra.frameId||extra.assetId||extra.pageId),...extra};}

export function runPublishPreflight(model:PublishDocumentModel,profile:PublishPreflightProfile=createDefaultPreflightProfile(),availableFonts:ReadonlySet<string>=new Set(['system-ui, sans-serif','Georgia, serif','Arial','Helvetica','Times New Roman'])):PublishPreflightFinding[]{
 const findings:PublishPreflightFinding[]=[];const overset=new Set(detectOversetFrames(model));
 for(const [index,page] of model.pages.entries()){if(page.geometry.bleedMm<profile.requireBleedMm)findings.push(finding(`bleed-${page.id}`,'error','Bleed',`Bleed ${page.geometry.bleedMm}mm is below required ${profile.requireBleedMm}mm.`,{pageId:page.id,pageIndex:index}));if(page.geometry.safeAreaMm<=0)findings.push(finding(`safe-${page.id}`,'warning','Output','No print safety area configured.',{pageId:page.id,pageIndex:index}));}
 for(const frame of model.frames){const pageIndex=model.pages.findIndex(p=>p.id===frame.pageId);if(overset.has(frame.id))findings.push(finding(`overset-${frame.id}`,'error','Overflow','Text frame has overset content.',{frameId:frame.id,pageId:frame.pageId,pageIndex}));if(frame.type==='text'){const font=frame.typography?.fontFamily??frame.fontFamily??'';if(!font||(!availableFonts.has(font)&&!model.assets.some(a=>a.kind==='font'&&a.name===font&&a.status!=='missing')))findings.push(finding(`font-${frame.id}`,'error','Font',`Font is unavailable or not embedded: ${font||'(unset)'}.`,{frameId:frame.id,pageId:frame.pageId,pageIndex}));}if((frame.opacity??1)<1&&profile.disallowTransparency)findings.push(finding(`transparency-${frame.id}`,'error','Transparency','Transparency is disallowed by the active profile.',{frameId:frame.id,pageId:frame.pageId,pageIndex}));}
 for(const asset of model.assets){const frame=model.frames.find(f=>f.assetId===asset.id);const pageIndex=frame?model.pages.findIndex(p=>p.id===frame.pageId):undefined;if(asset.status==='missing'||asset.status==='remote-blocked')findings.push(finding(`link-${asset.id}`,'error','Link',`Asset link is ${asset.status}.`,{assetId:asset.id,frameId:frame?.id,pageId:frame?.pageId,pageIndex}));else if(asset.status==='modified')findings.push(finding(`link-${asset.id}`,'warning','Link','Asset changed since it was placed.',{assetId:asset.id,frameId:frame?.id,pageId:frame?.pageId,pageIndex}));if(asset.dpi!==undefined&&asset.dpi<profile.minImageDpi)findings.push(finding(`dpi-${asset.id}`,'error','Resolution',`Asset resolution ${asset.dpi} DPI is below ${profile.minImageDpi} DPI.`,{assetId:asset.id,frameId:frame?.id,pageId:frame?.pageId,pageIndex}));if(asset.colorSpace&&!profile.allowedColorSpaces.includes(asset.colorSpace))findings.push(finding(`colorspace-${asset.id}`,'warning','Color',`Asset color space ${asset.colorSpace} is outside the active output profile.`,{assetId:asset.id,frameId:frame?.id,pageId:frame?.pageId,pageIndex}));}
 for(const swatch of model.swatches){const c=colorToCmyk(swatch);if(c.totalInk>profile.maxTicPercent)findings.push(finding(`tic-swatch-${swatch.id}`,'error','Color',`Swatch ${swatch.name} exceeds total ink coverage (${c.totalInk}% > ${profile.maxTicPercent}%).`));}
 if(!model.iccProfiles.some(p=>p.id===profile.outputProfileId)&&!AVAILABLE_ICC_PROFILES[profile.outputProfileId as IccProfileId])findings.push(finding('output-profile-missing','error','Output','Output intent ICC profile is unavailable.'));
 return findings.sort((a,b)=>{const rank={error:0,warning:1,info:2};return rank[a.severity]-rank[b.severity]||a.id.localeCompare(b.id);});
}

export function analyzePublishPrepress(model:PublishDocumentModel,profileId:IccProfileId='FOGRA51'):PrepressInspectionReport{
 const profile=AVAILABLE_ICC_PROFILES[profileId]??AVAILABLE_ICC_PROFILES.FOGRA51;const violations:TicViolation[]=[];let max=0,cSum=0,mSum=0,ySum=0,kSum=0,samples=0;
 for(const frame of model.frames){const colors=[frame.fillColor,frame.strokeColor].filter((v):v is string=>Boolean(v&&v!=='transparent'));if(frame.type==='text')colors.push('#1e293b');for(const color of colors){let c:CmykColor;try{c=hexToCmyk(color);}catch{continue;}samples++;max=Math.max(max,c.totalInk);cSum+=c.c;mSum+=c.m;ySum+=c.y;kSum+=c.k;if(c.totalInk>profile.maxTicPercent)violations.push({id:`tic-${frame.id}-${violations.length+1}`,pageIndex:frame.pageIndex,frameId:frame.id,xMm:frame.xMm,yMm:frame.yMm,measuredTic:c.totalInk,limitTic:profile.maxTicPercent,description:`Total Ink Coverage exceeds limit (${c.totalInk}% > ${profile.maxTicPercent}%).`});}}
 for(const swatch of model.swatches){const c=colorToCmyk(swatch);samples++;max=Math.max(max,c.totalInk);cSum+=c.c;mSum+=c.m;ySum+=c.y;kSum+=c.k;
  // GAP-0053, Runde 297: eine Schwaeze wurde GEZAEHLT, aber nicht GEMELDET.
  // `colorToCmyk` nimmt bei einer CMYK-Schwaeze die Komponenten DIREKT, damit
  // sind Werte bis 400 % erreichbar — im Gegensatz zu `hexToCmyk` in der
  // Frames-Schleife, das als UCR-Naeherung hoechstens 300 % erzeugt. Ohne
  // diese Zeile konnte `maxTicMeasured` 400 % melden, waehrend `violations`
  // leer blieb und `ticViolationsCount` 0 sagte: ein Widerspruch im selben
  // Bericht. `runPublishPreflight` (Zeile 64) prueft Schwaeze laengst — hier
  // fehlte es.
  //
  // `frameId` traegt die Schwaeze-ID: eine Schwaeze ist ein Dokumentobjekt,
  // aber KEIN Rahmen. Die Position bleibt darum 0 — sie ist fuer eine Schwaeze
  // nicht definiert, und das ist eine Grenze des Modells, keine Messung.
  if(c.totalInk>profile.maxTicPercent)violations.push({id:`tic-swatch-${swatch.id}`,pageIndex:0,frameId:swatch.id,xMm:0,yMm:0,measuredTic:c.totalInk,limitTic:profile.maxTicPercent,description:`Swatch ${swatch.name} exceeds total ink coverage (${c.totalInk}% > ${profile.maxTicPercent}%).`});}
 const divisor=Math.max(1,samples);const spot=model.swatches.filter(s=>s.space==='Spot').map((s)=>({id:`spot-${s.id}`,name:`Spot: ${s.name}`,colorHex:'#888888',density:Math.min(100,Math.round(colorToCmyk(s).totalInk/4)),active:true,isSpot:true}));const separations:SeparationPlate[]=[{id:'c',name:'Process Cyan',colorHex:'#00ffff',density:Math.min(100,Math.round(cSum/divisor)),active:true,isSpot:false},{id:'m',name:'Process Magenta',colorHex:'#ff00ff',density:Math.min(100,Math.round(mSum/divisor)),active:true,isSpot:false},{id:'y',name:'Process Yellow',colorHex:'#ffff00',density:Math.min(100,Math.round(ySum/divisor)),active:true,isSpot:false},{id:'k',name:'Process Black',colorHex:'#111111',density:Math.min(100,Math.round(kSum/divisor)),active:true,isSpot:false},...spot];const findings=runPublishPreflight(model,createDefaultPreflightProfile(profileId));const errors=findings.filter(f=>f.severity==='error').length;return{timestamp:Date.now(),profile,maxTicMeasured:max,ticViolationsCount:violations.length,violations,separations,findings,pdfXCompliant:errors===0&&violations.length===0,summary:errors===0&&violations.length===0?`Prepress PASSED for ${profile.name}. Max TIC ${max}%.`:`Prepress detected ${errors} blocking issue(s) and ${violations.length} TIC violation(s). Max TIC ${max}%.`};
}
