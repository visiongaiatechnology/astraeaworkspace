// STATUS: DIAMANT VGT SUPREME — Static SVG parity renderer for Present widgets
import type { PresentWidgetSceneObject, PresentWidgetStatus } from '../../../../shared/contracts/workspace';
import { normalizePresentWidget } from '../../canvas/widgets/presentWidgets';

export interface PresentWidgetSvgGeometry { x: number; y: number; w: number; h: number; }

const esc = (value: string): string => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const color = (value: string | undefined, fallback: string): string => /^#[0-9a-f]{6}$/i.test(value || '') ? String(value) : fallback;
const txt = (value: string, x: number, y: number, size: number, fill: string, weight = 400, anchor: 'start'|'middle'|'end'='start') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color(fill,'#e2e8f0')}" text-anchor="${anchor}">${esc(value.slice(0,180))}</text>`;
const statusColor = (status: PresentWidgetStatus | undefined): string => status === 'good' ? '#10b981' : status === 'warning' ? '#f59e0b' : status === 'critical' ? '#ef4444' : '#64748b';
const frame = (x:number,y:number,w:number,h:number,accent:string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#0f172a" stroke="${color(accent,'#22d3ee')}" stroke-opacity=".55"/>`;

function calendarSvg(widget: PresentWidgetSceneObject, g: PresentWidgetSvgGeometry): string {
  const { x,y,w,h } = g;
  const year = widget.calendarYear || 2026;
  const month = widget.calendarMonth ?? 0;
  const first = new Date(Date.UTC(year,month,1)).getUTCDay();
  const days = new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const monthName = new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
  const top = y + 42;
  const cellW = (w - 24) / 7;
  const cellH = Math.max(10,(h - 56) / 6);
  let out = frame(x,y,w,h,widget.accentColor) + txt(widget.label,x+14,y+24,11,'#e2e8f0',700) + txt(`${monthName} ${year}`,x+w-14,y+24,9,'#94a3b8',400,'end');
  for (let i=0;i<42;i+=1) {
    const day=i-first+1;
    if (day<1 || day>days) continue;
    const cx=x+12+(i%7)*cellW;
    const cy=top+Math.floor(i/7)*cellH;
    const highlighted=(widget.highlightedDays||[]).includes(day);
    if (highlighted) out += `<rect x="${cx+2}" y="${cy+1}" width="${cellW-4}" height="${cellH-2}" rx="4" fill="${color(widget.accentColor,'#22d3ee')}" fill-opacity=".18" stroke="${color(widget.accentColor,'#22d3ee')}" stroke-opacity=".55"/>`;
    out += txt(String(day),cx+cellW/2,cy+cellH*.67,8,'#cbd5e1',400,'middle');
  }
  return out;
}

export function renderPresentWidgetSvg(raw: PresentWidgetSceneObject, g: PresentWidgetSvgGeometry): string {
  const widget = normalizePresentWidget(raw);
  const { x,y,w,h } = g;
  const accent = color(widget.accentColor,'#22d3ee');
  const items = widget.items || [];
  let out = frame(x,y,w,h,accent);

  if (widget.widgetType === 'calendar') return calendarSvg(widget,g);

  if (widget.widgetType === 'progress-ring') {
    const p=Math.max(0,Math.min(100,widget.progress||0));
    const r=Math.max(18,Math.min(w,h)*.25); const c=2*Math.PI*r; const cx=x+w/2, cy=y+h/2;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#334155" stroke-width="8"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p/100)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    out += txt(widget.value || `${Math.round(p)}%`,cx,cy+4,18,'#f8fafc',700,'middle') + txt(widget.label,cx,cy+r+20,9,'#94a3b8',600,'middle');
    return out;
  }

  if (widget.widgetType === 'gauge') {
    const p=Math.max(0,Math.min(100,widget.progress||0));
    const cx=x+w/2, cy=y+h*.68, r=Math.min(w*.3,h*.5);
    const angle=(-180+p*1.8)*Math.PI/180; const nx=cx+Math.cos(angle)*r*.78, ny=cy+Math.sin(angle)*r*.78;
    out += `<path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}" fill="none" stroke="#334155" stroke-width="10" stroke-linecap="round"/><line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="${accent}"/>`;
    out += txt(widget.label,x+14,y+24,10,'#94a3b8',600)+txt(widget.value || `${Math.round(p)}%`,cx,y+h-14,17,accent,700,'middle');
    return out;
  }

  if (widget.widgetType === 'progress') {
    const p=Math.max(0,Math.min(100,widget.progress||0));
    out += txt(widget.label,x+14,y+25,10,'#94a3b8',600)+txt(widget.value,x+14,y+54,22,accent,700);
    out += `<rect x="${x+14}" y="${y+h-28}" width="${Math.max(10,w-28)}" height="8" rx="4" fill="#334155"/><rect x="${x+14}" y="${y+h-28}" width="${Math.max(0,(w-28)*p/100)}" height="8" rx="4" fill="${accent}"/>`;
    return out;
  }

  if (widget.widgetType === 'milestone') {
    out += txt(widget.label,x+14,y+22,10,'#94a3b8',600);
    const n=Math.max(1,items.length); const yLine=y+h*.55;
    out += `<line x1="${x+24}" y1="${yLine}" x2="${x+w-24}" y2="${yLine}" stroke="#475569"/>`;
    items.forEach((it,i)=>{ const cx=x+24+(n===1?0:i*(w-48)/(n-1)); const c=color(it.color,accent); out += `<circle cx="${cx}" cy="${yLine}" r="7" fill="#0f172a" stroke="${c}" stroke-width="3"/>${txt(it.label,cx,yLine+24,8,'#e2e8f0',700,'middle')}${txt(it.subtitle||it.value||'',cx,yLine+37,7,'#64748b',400,'middle')}`; });
    return out;
  }

  if (widget.widgetType === 'roadmap') {
    out += txt(widget.label,x+14,y+22,10,'#94a3b8',600); const n=Math.max(1,Math.min(4,items.length)); const gap=8; const iw=(w-28-gap*(n-1))/n;
    items.slice(0,4).forEach((it,i)=>{ const ix=x+14+i*(iw+gap), c=color(it.color,accent); out += `<rect x="${ix}" y="${y+34}" width="${iw}" height="${h-48}" rx="8" fill="#111827" stroke="#334155"/>${txt(`0${i+1}`,ix+8,y+50,8,c,700)}${txt(it.label,ix+8,y+69,9,'#f8fafc',700)}${txt(it.subtitle||it.value||'',ix+8,y+84,7,'#64748b',400)}`; });
    return out;
  }

  if (widget.widgetType === 'comparison') {
    out += txt(widget.label,x+14,y+22,10,'#94a3b8',600); const list=items.slice(0,2); const gap=10; const cw=(w-28-gap)/2;
    list.forEach((it,i)=>{ const ix=x+14+i*(cw+gap), c=color(it.color,accent); out += `<rect x="${ix}" y="${y+34}" width="${cw}" height="${h-48}" rx="10" fill="#111827" stroke="#334155"/>${txt(it.label,ix+10,y+54,9,c,700)}${txt(it.value||'',ix+10,y+80,15,'#f8fafc',700)}${txt(it.subtitle||'',ix+10,y+98,7,'#64748b',400)}`; });
    return out;
  }

  if (widget.widgetType === 'quote') {
    out += txt('“',x+14,y+38,32,accent,700)+txt(widget.value,x+36,y+38,13,'#f8fafc',600)+txt(widget.profileName||'',x+16,y+h-30,9,'#e2e8f0',700)+txt(widget.profileRole||'',x+16,y+h-16,7,'#64748b',400);
    return out;
  }

  if (widget.widgetType === 'status') {
    out += txt(widget.label,x+14,y+22,10,'#94a3b8',600); const cols=2; const rows=Math.ceil(Math.min(8,items.length)/cols); const gap=6; const iw=(w-28-gap)/2; const ih=Math.max(20,(h-42-gap*Math.max(0,rows-1))/Math.max(1,rows));
    items.slice(0,8).forEach((it,i)=>{ const col=i%2,row=Math.floor(i/2),ix=x+14+col*(iw+gap),iy=y+32+row*(ih+gap),sc=statusColor(it.status); out += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="7" fill="#111827" stroke="#334155"/>${txt(it.label,ix+8,iy+ih*.62,8,'#cbd5e1',600)}${txt(`● ${it.value||''}`,ix+iw-8,iy+ih*.62,7,sc,700,'end')}`; });
    return out;
  }

  if (widget.widgetType === 'icon-stat' || widget.widgetType === 'kpi') {
    out += `<rect x="${x+w-48}" y="${y+14}" width="34" height="34" rx="9" fill="${accent}" fill-opacity=".14"/>${txt(widget.label,x+14,y+25,10,'#94a3b8',600)}${txt(widget.value,x+14,y+58,23,accent,700)}${txt(widget.secondaryValue||'',x+14,y+h-16,8,accent,600)}`;
    return out;
  }

  if (widget.widgetType === 'device') {
    const phone=widget.deviceKind==='phone'; const tablet=widget.deviceKind==='tablet'; const dw=phone?Math.min(w*.42,h*.48):tablet?w*.74:w-28; const dh=h-28; const dx=x+(w-dw)/2,dy=y+14;
    out += `<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="${phone?18:12}" fill="#111827" stroke="#64748b"/><rect x="${dx}" y="${dy}" width="${dw}" height="22" rx="${phone?18:12}" fill="#1f2937"/>${txt(widget.deviceUrlLabel||'',dx+12,dy+15,7,'#64748b',400)}${txt(widget.label,dx+dw/2,dy+dh*.5,9,'#94a3b8',600,'middle')}${txt(widget.value,dx+dw/2,dy+dh*.5+24,16,accent,700,'middle')}`;
    return out;
  }

  if (widget.widgetType === 'gallery') {
    out += txt(widget.label,x+10,y+18,9,'#94a3b8',600); const gallery=widget.galleryItems||[]; const gap=4; const cellW=(w-20-gap*2)/3; const cellH=(h-34-gap)/2;
    for (let i=0;i<6;i+=1) { const col=i%3,row=Math.floor(i/3),ix=x+10+col*(cellW+gap),iy=y+24+row*(cellH+gap),img=gallery[i]; out += `<rect x="${ix}" y="${iy}" width="${cellW}" height="${cellH}" rx="5" fill="#111827" stroke="#334155"/>`; if (img?.dataUrl) out += `<image href="${esc(img.dataUrl)}" x="${ix}" y="${iy}" width="${cellW}" height="${cellH}" preserveAspectRatio="xMidYMid slice"/>`; }
    return out;
  }

  if (widget.widgetType === 'rating') {
    const max=Math.max(1,Math.min(10,widget.ratingMax||5)), value=Math.max(0,Math.min(max,widget.ratingValue||0)); out += txt(widget.label,x+w/2,y+28,10,'#94a3b8',600,'middle'); const start=x+w/2-(max-1)*11;
    for(let i=0;i<max;i+=1) out += txt(i<Math.round(value)?'★':'☆',start+i*22,y+h*.58,20,i<Math.round(value)?accent:'#475569',700,'middle'); out += txt(widget.value||`${value} / ${max}`,x+w/2,y+h-18,10,'#e2e8f0',700,'middle'); return out;
  }

  return out;
}
