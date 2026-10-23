// STATUS: DIAMANT VGT SUPREME — Astraea Publish professional typography and long-form text engine
import type {
  PublishDocumentModel, PublishFrame, PublishStyle, PublishStyleKind, PublishDeclarativeStyleRule,
  PublishTypography, PublishFootnote, PublishEndnote,
} from '../../../shared/contracts/publish/workspacePublish';
import { PublishModelError, PUBLISH_LIMITS, createDefaultPublishTypography } from '../model/publishDocumentEngine';

export interface ResolvedPublishStyle { id:string; kind:PublishStyleKind; properties:Record<string,string|number|boolean>; lineage:string[]; }
export interface PublishGlyph { scalar:number; character:string; hex:string; }
export interface PublishStyleMatch { start:number; end:number; characterStyleId:string; ruleId:string; }
export interface PublishComposedLine { text:string; start:number; end:number; widthUnits:number; hyphenated:boolean; }
export interface PublishComposition { lines:PublishComposedLine[]; overset:boolean; consumedCharacters:number; footnotes:PublishFootnote[]; endnotes:PublishEndnote[]; }

const MAX_STYLE_DEPTH=64;
const MAX_TEXT_SCAN=8_000_000;
const MAX_MATCHES=250_000;

export function resolvePublishStyle(styles:readonly PublishStyle[],styleId:string):ResolvedPublishStyle{
  const byId=new Map(styles.map(s=>[s.id,s] as const));const style=byId.get(styleId);if(!style)throw new PublishModelError('style-missing');const lineage:PublishStyle[]=[];const seen=new Set<string>();let cur:PublishStyle|undefined=style;
  while(cur){if(seen.has(cur.id))throw new PublishModelError('style-cycle');if(lineage.length>=MAX_STYLE_DEPTH)throw new PublishModelError('style-depth-limit');seen.add(cur.id);lineage.unshift(cur);cur=cur.parentStyleId?byId.get(cur.parentStyleId):undefined;}
  const properties:Record<string,string|number|boolean>={};for(const s of lineage)Object.assign(properties,s.properties);return{id:style.id,kind:style.kind,properties,lineage:lineage.map(s=>s.id)};
}

export function upsertPublishStyle(model:PublishDocumentModel,style:PublishStyle):PublishDocumentModel{
  if(!style.id||!style.name||!['paragraph','character','object','table','cell'].includes(style.kind))throw new PublishModelError('style-invalid');const current=model.styles.find(s=>s.id===style.id);if(!current&&model.styles.length>=PUBLISH_LIMITS.maxStyles)throw new PublishModelError('style-limit');const styles=current?model.styles.map(s=>s.id===style.id?structuredClone(style):s):[...model.styles,structuredClone(style)];resolvePublishStyle(styles,style.id);return{...model,styles,revision:model.revision+1};
}

export function listGlyphs(text:string):PublishGlyph[]{if(text.length>MAX_TEXT_SCAN)throw new PublishModelError('glyph-scan-limit');const out:PublishGlyph[]=[];const seen=new Set<number>();for(const c of text){const scalar=c.codePointAt(0)!;if(seen.has(scalar))continue;seen.add(scalar);out.push({scalar,character:c,hex:`U+${scalar.toString(16).toUpperCase().padStart(4,'0')}`});if(out.length>=65_536)break;}return out;}

function isWordBoundary(c:string|undefined):boolean{return c===undefined||/\s|[.,;:!?()\[\]{}<>"'“”‘’/\\-]/u.test(c);}
function findLiteral(text:string,value:string,caseSensitive:boolean):Array<[number,number]>{const hay=caseSensitive?text:text.toLocaleLowerCase();const needle=caseSensitive?value:value.toLocaleLowerCase();if(!needle)return[];const out:Array<[number,number]>=[];let from=0;while(from<=hay.length-needle.length){const i=hay.indexOf(needle,from);if(i<0)break;out.push([i,i+needle.length]);if(out.length>MAX_MATCHES)throw new PublishModelError('style-match-limit');from=i+Math.max(1,needle.length);}return out;}
function digits(text:string):Array<[number,number]>{const out:Array<[number,number]>=[];for(let i=0;i<text.length;){if(text.charCodeAt(i)>=48&&text.charCodeAt(i)<=57){const s=i++;while(i<text.length&&text.charCodeAt(i)>=48&&text.charCodeAt(i)<=57)i++;out.push([s,i]);}else i++;if(out.length>MAX_MATCHES)throw new PublishModelError('style-match-limit');}return out;}
function emails(text:string):Array<[number,number]>{const out:Array<[number,number]>=[];const tokens=text.split(/(\s+)/);let offset=0;for(const token of tokens){if(token.length<=320&&token.includes('@')&&!/[<>"']/.test(token)){const at=token.indexOf('@');const dot=token.lastIndexOf('.');if(at>0&&dot>at+1&&dot<token.length-1)out.push([offset,offset+token.length]);}offset+=token.length;if(out.length>MAX_MATCHES)throw new PublishModelError('style-match-limit');}return out;}
function urls(text:string):Array<[number,number]>{const out:Array<[number,number]>=[];for(const prefix of ['https://','http://']){for(const [s,e] of findLiteral(text,prefix,false)){let end=e;while(end<text.length&&!isWordBoundary(text[end]))end++;out.push([s,end]);if(out.length>MAX_MATCHES)throw new PublishModelError('style-match-limit');}}return out.sort((a,b)=>a[0]-b[0]);}

export function applyDeclarativeStyleRules(text:string,rules:readonly PublishDeclarativeStyleRule[]):PublishStyleMatch[]{
  if(text.length>MAX_TEXT_SCAN||rules.length>1024)throw new PublishModelError('style-rule-boundary');const matches:PublishStyleMatch[]=[];
  for(const rule of rules){let spans:Array<[number,number]>=[];const p=rule.pattern;switch(p.kind){case'literal':spans=findLiteral(text,p.value??'',Boolean(p.caseSensitive));break;case'prefix':{const v=p.value??'';for(const [s,e] of findLiteral(text,v,Boolean(p.caseSensitive)))if(isWordBoundary(text[s-1]))spans.push([s,e]);break;}case'suffix':{const v=p.value??'';for(const [s,e] of findLiteral(text,v,Boolean(p.caseSensitive)))if(isWordBoundary(text[e]))spans.push([s,e]);break;}case'word':{const v=p.value??'';for(const [s,e] of findLiteral(text,v,Boolean(p.caseSensitive)))if(isWordBoundary(text[s-1])&&isWordBoundary(text[e]))spans.push([s,e]);break;}case'digits':spans=digits(text);break;case'email':spans=emails(text);break;case'url':spans=urls(text);break;}
    for(const [start,end] of spans){matches.push({start,end,characterStyleId:rule.characterStyleId,ruleId:rule.id});if(matches.length>MAX_MATCHES)throw new PublishModelError('style-match-limit');}
  }
  return matches.sort((a,b)=>a.start-b.start||a.end-b.end||a.ruleId.localeCompare(b.ruleId));
}

export function validateTypography(t:PublishTypography):void{
  if(!t.fontFamily||t.fontFamily.length>512||!Number.isFinite(t.fontSizePt)||t.fontSizePt<1||t.fontSizePt>2000||!Number.isFinite(t.leadingPt)||t.leadingPt<1||t.leadingPt>3000)throw new PublishModelError('typography-size-boundary');
  if(!Number.isFinite(t.tracking)||t.tracking<-1000||t.tracking>10_000||!Number.isFinite(t.baselineShiftPt)||Math.abs(t.baselineShiftPt)>5000)throw new PublishModelError('typography-spacing-boundary');
  if(t.horizontalScalePercent<10||t.horizontalScalePercent>1000||t.verticalScalePercent<10||t.verticalScalePercent>1000)throw new PublishModelError('typography-scale-boundary');
  if(!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(t.language))throw new PublishModelError('typography-language-invalid');
  const axes=t.openType.variableAxes??{};if(Object.keys(axes).length>64||Object.entries(axes).some(([k,v])=>!/^[A-Za-z0-9]{1,8}$/.test(k)||!Number.isFinite(v)||Math.abs(v)>1_000_000))throw new PublishModelError('variable-font-axis-boundary');
}

const LOCAL_HYPHEN_HINTS:Record<string,string[]>= {en:['tion','ing','ment','able','ness','pre','inter'],de:['ung','lich','keit','heit','schaft','ver','ge'],fr:['ment','tion','ique','re'],es:['ción','mente','ado','ido']};
function hyphenateCandidate(word:string,language:string):string[]{if(word.length<7)return[word];const hints=LOCAL_HYPHEN_HINTS[language.split('-')[0].toLowerCase()]??[];for(const h of hints){const i=word.toLocaleLowerCase().indexOf(h,3);if(i>=3&&i<=word.length-3)return[word.slice(0,i),word.slice(i)];}const mid=Math.floor(word.length/2);return[word.slice(0,mid),word.slice(mid)];}

function widthUnits(text:string,t:PublishTypography):number{let units=0;for(const c of text){const cp=c.codePointAt(0)!;if(c===' ')units+=.33;else if(cp>=0x2e80)units+=1;else if(/[ilI1.,'`]/.test(c))units+=.28;else if(/[MW@#%]/.test(c))units+=.9;else units+=.55;}return units*(t.fontSizePt/10)*(t.horizontalScalePercent/100)+(Math.max(0,text.length-1)*t.tracking/1000);}

export function composeTextFrame(frame:PublishFrame):PublishComposition{
  if(frame.type!=='text')throw new PublishModelError('compose-non-text-frame');const t=frame.typography??createDefaultPublishTypography();validateTypography(t);const opts=frame.text;const insets=opts?.insetsMm??{top:2,right:2,bottom:2,left:2};const columns=Math.max(1,opts?.columns??frame.columns??1);const gutter=opts?.columnGutterMm??4;const usableW=Math.max(1,frame.widthMm-insets.left-insets.right);const usableH=Math.max(1,frame.heightMm-insets.top-insets.bottom);const columnW=(usableW-(columns-1)*gutter)/columns;const maxWidthUnits=Math.max(1,columnW/(t.fontSizePt*.352778))*10;const lineHeightMm=t.leadingPt*.352778;const maxLines=Math.max(1,Math.floor(usableH/lineHeightMm))*columns;const source=frame.content;if(source.length>MAX_TEXT_SCAN)throw new PublishModelError('compose-text-limit');const lines:PublishComposedLine[]=[];let pos=0;
  while(pos<source.length&&lines.length<maxLines){if(source[pos]==='\n'){lines.push({text:'',start:pos,end:pos+1,widthUnits:0,hyphenated:false});pos++;continue;}const lineStart=pos;let line='';let lastGood=pos;let hyphenated=false;while(pos<source.length&&source[pos]!=='\n'){let next=source.indexOf(' ',pos);const nl=source.indexOf('\n',pos);if(next<0||(nl>=0&&nl<next))next=nl>=0?nl:source.length;const word=source.slice(pos,next);const spacer=line?' ':'';const candidate=line+spacer+word;if(widthUnits(candidate,t)<=maxWidthUnits){line=candidate;pos=next<source.length&&source[next]===' '?next+1:next;lastGood=pos;continue;}if(!line&&t.hyphenation){const parts=hyphenateCandidate(word,t.language);if(parts.length===2){const first=parts[0]+'-';if(widthUnits(first,t)<=maxWidthUnits){line=first;pos+=parts[0].length;hyphenated=true;lastGood=pos;}}}break;}
    if(!line&&pos===lineStart){line=source[pos];pos++;lastGood=pos;}lines.push({text:line,start:lineStart,end:lastGood,widthUnits:widthUnits(line,t),hyphenated});if(pos<source.length&&source[pos]==='\n')pos++;
  }
  return{lines,overset:pos<source.length,consumedCharacters:pos,footnotes:structuredClone(frame.footnotes??[]),endnotes:structuredClone(frame.endnotes??[])};
}

export function addFootnote(frame:PublishFrame,note:Omit<PublishFootnote,'id'|'frameId'>):PublishFrame{if(frame.type!=='text')throw new PublishModelError('footnote-non-text');const current=frame.footnotes??[];if(current.length>=4096)throw new PublishModelError('footnote-limit');const id=`footnote-${frame.id}-${current.length+1}`;return{...frame,footnotes:[...current,{...note,id,frameId:frame.id}]};}
export function addEndnote(frame:PublishFrame,note:Omit<PublishEndnote,'id'|'frameId'>):PublishFrame{if(frame.type!=='text')throw new PublishModelError('endnote-non-text');const current=frame.endnotes??[];if(current.length>=4096)throw new PublishModelError('endnote-limit');const id=`endnote-${frame.id}-${current.length+1}`;return{...frame,endnotes:[...current,{...note,id,frameId:frame.id}]};}

export function styleMatchesForFrame(frame:PublishFrame):PublishStyleMatch[]{return applyDeclarativeStyleRules(frame.content,frame.declarativeStyleRules??[]);}
