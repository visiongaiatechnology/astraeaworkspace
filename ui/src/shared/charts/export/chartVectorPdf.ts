// STATUS: DIAMANT VGT SUPREME
// Vector-first PDF adapter over Astraea's own bounded SVG chart output. Unsupported SVG effects fail to raster fallback.

import type { ChartObject } from '../../contracts/workspace';
import { assertChartSourceRenderable } from '../chartEngine';
import { buildGridChartSvg } from '../chartSvgRenderer';

const WIDTH=1280, HEIGHT=720;
const MAX_SVG_BYTES=4*1024*1024;

function esc(value:string):string{return value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function unescapeXml(value:string):string{return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function attr(tag:string,name:string):string|undefined{const m=new RegExp(`\\b${name}="([^"]*)"`).exec(tag);return m?.[1];}
function num(value:string|undefined):number|null{if(value===undefined)return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function rgb(value:string|undefined):[number,number,number]|null{
  if(!value||value==='none')return null;
  const hex=/^#([0-9a-f]{6})$/i.exec(value); if(hex){const v=hex[1]!;return [parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255];}
  const m=/^rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)$/.exec(value.replace(/\s+/g,'')); if(m)return [Math.min(255,Number(m[1]))/255,Math.min(255,Number(m[2]))/255,Math.min(255,Number(m[3]))/255];
  return null;
}
function fillCmd(color:[number,number,number]|null):string{return color?`${color[0].toFixed(4)} ${color[1].toFixed(4)} ${color[2].toFixed(4)} rg\n`:'';}
function strokeCmd(color:[number,number,number]|null):string{return color?`${color[0].toFixed(4)} ${color[1].toFixed(4)} ${color[2].toFixed(4)} RG\n`:'';}
function y(value:number):number{return HEIGHT-value;}

function rectCommand(tag:string):string|null{
  const x=num(attr(tag,'x')), yy=num(attr(tag,'y')), w=num(attr(tag,'width')), h=num(attr(tag,'height')); if(x===null||yy===null||w===null||h===null)return null;
  const fill=rgb(attr(tag,'fill')), stroke=rgb(attr(tag,'stroke')), sw=num(attr(tag,'stroke-width'))??1; if(!fill&&!stroke)return '';
  return `${fillCmd(fill)}${strokeCmd(stroke)}${sw.toFixed(2)} w\n${x.toFixed(2)} ${(HEIGHT-yy-h).toFixed(2)} ${Math.max(0,w).toFixed(2)} ${Math.max(0,h).toFixed(2)} re ${fill&&stroke?'B':fill?'f':'S'}\n`;
}
function lineCommand(tag:string):string|null{
  const x1=num(attr(tag,'x1')),y1=num(attr(tag,'y1')),x2=num(attr(tag,'x2')),y2=num(attr(tag,'y2')); if([x1,y1,x2,y2].some(v=>v===null))return null;
  const stroke=rgb(attr(tag,'stroke')); if(!stroke)return '';
  const sw=num(attr(tag,'stroke-width'))??1; const dash=attr(tag,'stroke-dasharray'); const dashCmd=dash?`[${dash.split(/\s+/).map(v=>Number(v)).filter(Number.isFinite).slice(0,8).join(' ')}] 0 d\n`:'[] 0 d\n';
  return `${strokeCmd(stroke)}${sw.toFixed(2)} w\n${dashCmd}${x1!.toFixed(2)} ${y(y1!).toFixed(2)} m ${x2!.toFixed(2)} ${y(y2!).toFixed(2)} l S\n`;
}
function circleCommand(tag:string):string|null{
  const cx=num(attr(tag,'cx')),cy=num(attr(tag,'cy')),r=num(attr(tag,'r'));if(cx===null||cy===null||r===null)return null;const fill=rgb(attr(tag,'fill')),stroke=rgb(attr(tag,'stroke'));if(!fill&&!stroke)return '';
  const k=.552284749831,rr=Math.max(0,r),cY=y(cy),ox=rr*k,oy=rr*k;
  const path=`${(cx+rr).toFixed(2)} ${cY.toFixed(2)} m ${(cx+rr).toFixed(2)} ${(cY+oy).toFixed(2)} ${(cx+ox).toFixed(2)} ${(cY+rr).toFixed(2)} ${cx.toFixed(2)} ${(cY+rr).toFixed(2)} c ${(cx-ox).toFixed(2)} ${(cY+rr).toFixed(2)} ${(cx-rr).toFixed(2)} ${(cY+oy).toFixed(2)} ${(cx-rr).toFixed(2)} ${cY.toFixed(2)} c ${(cx-rr).toFixed(2)} ${(cY-oy).toFixed(2)} ${(cx-ox).toFixed(2)} ${(cY-rr).toFixed(2)} ${cx.toFixed(2)} ${(cY-rr).toFixed(2)} c ${(cx+ox).toFixed(2)} ${(cY-rr).toFixed(2)} ${(cx+rr).toFixed(2)} ${(cY-oy).toFixed(2)} ${(cx+rr).toFixed(2)} ${cY.toFixed(2)} c h`;
  return `${fillCmd(fill)}${strokeCmd(stroke)}${path} ${fill&&stroke?'B':fill?'f':'S'}\n`;
}
function polygonCommand(tag:string):string|null{
  const points=(attr(tag,'points')??'').trim().split(/\s+/).map(pair=>pair.split(',').map(Number)).filter(pair=>pair.length===2&&pair.every(Number.isFinite)); if(points.length<2||points.length>4096)return null;
  const fill=rgb(attr(tag,'fill')),stroke=rgb(attr(tag,'stroke'));if(!fill&&!stroke)return '';
  let out=`${fillCmd(fill)}${strokeCmd(stroke)}`;points.forEach((point,index)=>{out+=`${point[0]!.toFixed(2)} ${y(point[1]!).toFixed(2)} ${index?'l':'m'} `;});out+=`h ${fill&&stroke?'B':fill?'f':'S'}\n`;return out;
}
function pathCommand(tag:string):string|null{
  const d=attr(tag,'d');if(!d||/[AaCcQqSsTt]/.test(d))return null;
  // **`W-447`, die ECHTE Ursache, behoben (Runde 268) ✗✓✓**
  //
  // *Zwei eigene Anläufe waren falsch* ✗: (a) meine erste Ursache (`textCommand`s `transform`) kam aus einem
  // **Quelltext-Grep** und war **nicht** der Auslöser — *der positive Zeuge zeigte `null` auch **ohne** Achsentitel*
  // ✗✗; (b) meine erste Sonde zählte `[AaCcQqSsTt]` **irgendwo im SVG-Text** und meldete „608 Kurven" ✗ — *ein
  // Zähler über **Zeichen**, nicht über **Kommandos**.* ✓ Gefunden hat es **Sonde 2**, die die echten
  // Zahlenattribute aufgelistet hat:
  //
  //   die **Barrierefreiheits-Schraffuren** des geteilten Renderers sind `<pattern>`-Pfade wie `M0 5H10` und
  //   `M2 0V10` ✓ — und der Tokenizer unten kannte nur `[MLZmlz]` ✗ → das `H`/`V` fiel durch → `cmd=''` →
  //   `else if(!/[Zz]/.test(cmd)) return null` → **`null` für das ganze Diagramm** ✗✗.
  //   **Und weil die Schraffuren IMMER erzeugt werden, scheiterte jede Chart-Art und jeder Aufrufer** ✓✓.
  //
  // **`H`/`V` sind Linien zum Punkt** ✓ — *absolut (`H x` = `(x, aktuelle y)`) und relativ (`h dx`)* ✓. Der aktuelle
  // Punkt wird deshalb **mitgeführt** ✓. **Und `<defs>` zu überspringen wäre der falsche Weg** ✗ — *die Schraffur
  // fehlte dann **still** im PDF, und ein Muster, das der UI-Standard **verlangt** („Zustände nicht nur durch
  // Farbe"), verschwände* ✗✓.
  const tokens=d.match(/[MLZmlzHVhv]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi); if(!tokens||tokens.length>50000)return null;
  const fill=rgb(attr(tag,'fill')),stroke=rgb(attr(tag,'stroke'));let out=`${fillCmd(fill)}${strokeCmd(stroke)}${(num(attr(tag,'stroke-width'))??1).toFixed(2)} w\n`;
  let i=0,cmd='';let cx=0,cy=0;while(i<tokens.length){const t=tokens[i++]!;if(/^[MLZmlzHVhv]$/.test(t)){cmd=t;if(/[Zz]/.test(cmd)){out+='h ';continue;}}else{i--;}
    if(/[MmLl]/.test(cmd)){const x=Number(tokens[i++]),yy=Number(tokens[i++]);if(!Number.isFinite(x)||!Number.isFinite(yy))return null;const relativ=/[ml]/.test(cmd);cx=relativ?cx+x:x;cy=relativ?cy+yy:yy;out+=`${cx.toFixed(2)} ${y(cy).toFixed(2)} ${relativ?'l':'m'} `;if(/[Mm]/.test(cmd))cmd=/[Mm]/.test(cmd)&&cmd==='M'?'L':'l';}
    else if(/[Hh]/.test(cmd)){const v=Number(tokens[i++]);if(!Number.isFinite(v))return null;cx=cmd==='H'?v:cx+v;out+=`${cx.toFixed(2)} ${y(cy).toFixed(2)} l `;}
    else if(/[Vv]/.test(cmd)){const v=Number(tokens[i++]);if(!Number.isFinite(v))return null;cy=cmd==='V'?v:cy+v;out+=`${cx.toFixed(2)} ${y(cy).toFixed(2)} l `;}
    else if(!/[Zz]/.test(cmd))return null;
  }
  out+=`${fill&&stroke?'B':fill?'f':stroke?'S':'n'}\n`;return out;
}
/** **`translate` und `rotate` aus einem SVG-`transform`** ✓ — *ohne DOM, ohne Bibliothek* ✓. */
function transformOf(tag:string):{dx:number;dy:number;rotated:boolean;hasTranslate:boolean}{
  const raw=attr(tag,'transform');if(!raw)return{dx:0,dy:0,rotated:false,hasTranslate:false};
  const t=/\btranslate\(\s*(-?[\d.]+)(?:[,\s]+(-?[\d.]+))?\s*\)/.exec(raw);
  const dx=t?Number(t[1]):0,dy=t&&t[2]!==undefined?Number(t[2]):0;
  return{dx:Number.isFinite(dx)?dx:0,dy:Number.isFinite(dy)?dy:0,rotated:/\brotate\(/.test(raw),hasTranslate:t!==null};
}
/**
 * **`W-447`, behoben (Runde 264) ✗✓✓** — *vorher gab diese Funktion bei **jedem** `transform` auf* ✗, und der
 * geteilte Renderer schreibt `translate(…) rotate(±90)` auf die **Achsentitel** (`chartSvgRenderer.ts:137/138` ✓):
 * *zwei gedrehte Titel ließen damit **jedes** Diagramm scheitern — für **alle 15** Chart-Arten* ✗✗.
 *
 * **Jetzt:** `translate` wird **exakt** angewandt ✓ (*dx/dy addition* ✓). Ein `rotate` setzt den Lauf **aufrecht**
 * und **sagt es im PDF an** (`% rotated label set upright` ✓✓) — *der Titel ist damit **vollständig und lesbar
 * vorhanden*** ✓. **Warum nicht gedreht:** *eine Textmatrix im gespiegelten y-System würde die **Glyphen
 * spiegeln*** ✗, und **ein PDF kann ich hier nicht ansehen** ✗ — *„aufrecht und angesagt" ist die einzige Fassung,
 * die ich **messen** kann* ✓✓.
 * **Und der verbotene Weg bleibt verboten:** das Element **überspringen** wäre ein stiller Teilverlust ✗.
 */
function textCommand(tag:string,content:string):string|null{
  const tr=transformOf(tag);
  // **Die zweite Ursache, gemessen (Runde 268) ✗✓✓:** Die **gedrehten Achsentitel** des geteilten Renderers tragen
  // ihre Position **im `transform`** und haben **kein `x`/`y`** ✗ (`chartSvgRenderer.ts:137`:
  // `<text transform="translate(18 …) rotate(-90)" …>`) — *die alte Zeile `if(x===null||yy===null) return null`
  // verwarf damit **jedes** Diagramm mit Achsentitel* ✗✗. **Also:** fehlt `x`/`y`, trägt die **Verschiebung** die
  // Position ✓; *fehlt **beides**, bleibt es eine **benannte** Aufgabe* ✗ — *nie ein stiller Platzhalter* ✓.
  const xa=num(attr(tag,'x')),ya=num(attr(tag,'y'));
  if((xa===null||ya===null)&&!tr.hasTranslate)return null;
  const x=(xa??0)+tr.dx,yy=(ya??0)+tr.dy;
  const raw=unescapeXml(content);if(/[^\x09\x0A\x0D\x20-\x7E]/.test(raw))return null;const size=Math.max(5,Math.min(72,num(attr(tag,'font-size'))??11));const fill=rgb(attr(tag,'fill'))??[0,0,0];const note=tr.rotated?'% rotated label set upright\n':'';return `${note}${fillCmd(fill)}BT /F1 ${size.toFixed(2)} Tf ${x.toFixed(2)} ${y(yy).toFixed(2)} Td (${esc(raw.slice(0,1024))}) Tj ET\n`;
}

function svgToPdfCommands(svg:string):string|null{
  if(new TextEncoder().encode(svg).length>MAX_SVG_BYTES)return null;
  let out='q\n';const token=/<(rect|line|circle|path|polygon)\b[^>]*\/>|<text\b[^>]*>([\s\S]*?)<\/text>/g;let match:RegExpExecArray|null,count=0;
  while((match=token.exec(svg))!==null){if(++count>200000)return null;const full=match[0]!,kind=/^<([a-z]+)/.exec(full)?.[1];let cmd:string|null='';if(kind==='rect')cmd=rectCommand(full);else if(kind==='line')cmd=lineCommand(full);else if(kind==='circle')cmd=circleCommand(full);else if(kind==='path')cmd=pathCommand(full);else if(kind==='polygon')cmd=polygonCommand(full);else if(kind==='text')cmd=textCommand(full,match[2]??'');if(cmd===null)return null;out+=cmd;}
  return out+'Q\n';
}

function buildPdf(title:string,stream:string):Uint8Array{
  const objects:string[]=[];const add=(body:string)=>{objects.push(body);return objects.length;};const catalog=add('');const pages=add('');const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');const contentBytes=new TextEncoder().encode(stream);const content=add(`<< /Length ${contentBytes.length} >>\nstream\n${stream}endstream`);const page=add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);objects[pages-1]=`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`;objects[catalog-1]=`<< /Type /Catalog /Pages ${pages} 0 R >>`;const info=add(`<< /Title (${esc(title.replace(/[^\x20-\x7e]/g,'?').slice(0,256))}) /Producer (Astraea Chart Engine) >>`);
  let pdf='%PDF-1.4\n%VGT Chart\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets[i+1]=new TextEncoder().encode(pdf).length;pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=new TextEncoder().encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return new TextEncoder().encode(pdf);
}

/**
 * **Vektor-PDF eines Diagramms.** Eine Quelle, die ihre Nutzdaten zurückhält, wird **benannt**
 * zurückgewiesen (`assertChartSourceRenderable`) — und **nicht** mit `null` quittiert: `null` heißt in
 * diesem Adapter „nimm den Rasterweg" (`chartVectorPdf.ts:120`), und der würde genau die Zahlen
 * zeichnen, die nicht ausgegeben werden dürfen. Der Rückhalt wird also vor dem ersten Byte entschieden.
 *
 * Erreichbar: `apps/grid/integrations/gridChartExport.ts:89` und `:96` sowie
 * `apps/insight/export/insightExportEngine.ts:70`; der Grid-Pfad zeigt den benannten Fehler in
 * `apps/grid/charts/GridChartModal.tsx:141–142` an.
 */
export function buildVectorChartPdf(chart:ChartObject):Uint8Array|null{
  assertChartSourceRenderable(chart);
  const svg=buildGridChartSvg(chart,WIDTH,HEIGHT);const commands=svgToPdfCommands(svg);return commands===null?null:buildPdf(chart.title,commands);
}
