// STATUS: DIAMANT VGT SUPREME — Deterministic Present widget renderer shared by editor/presenter
import React, { createContext, useContext } from 'react';
import {
  Activity,
  Clock3,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { PresentWidgetSceneObject, PresentWidgetStatus } from '../../../../shared/contracts/workspace';
import { normalizePresentWidget } from '../widgets/presentWidgets';
import './presentWidgetTextColor.css';

interface Props {
  widget: PresentWidgetSceneObject;
  /**
   * Round 41 (style system): optional authored chrome (background/gradient/border/radius/shadow/
   * text colour) from the additive `presentStyle` extension. The frame applies it to the widget
   * surface; without it the historical glass frame is unchanged.
   */
  chromeStyle?: React.CSSProperties;
}

/** Stable empty chrome so widgets without a style are not invalidated by a fresh `{}`. */
const EMPTY_WIDGET_CHROME: React.CSSProperties = {};
const PresentWidgetChromeContext = createContext<React.CSSProperties>(EMPTY_WIDGET_CHROME);

const statusColor = (status: PresentWidgetStatus | undefined): string =>
  status === 'good' ? '#10b981' : status === 'warning' ? '#f59e0b' : status === 'critical' ? '#ef4444' : '#64748b';

const WidgetFrame: React.FC<React.PropsWithChildren<{ widget: PresentWidgetSceneObject; className?: string }>> = ({ widget, className = '', children }) => {
  const chrome = useContext(PresentWidgetChromeContext);
  // Round 42: an authored text colour reaches EVERY text node (label/value/subtitle/badges/avatar
  // initials) through one explicit token — Tailwind text classes can no longer hide it.
  const textColor = typeof chrome.color === 'string' ? chrome.color : undefined;
  return (
    <div
      className={`w-full h-full rounded-2xl border bg-slate-950/92 shadow-xl overflow-hidden ${textColor ? 'present-widget-text-themed' : ''} ${className}`}
      style={{
        borderColor: `${widget.accentColor}70`,
        ...chrome,
        ...(textColor ? ({ '--present-widget-text': textColor } as React.CSSProperties) : {}),
      }}
      data-present-widget-chrome={Object.keys(chrome).length ? 'styled' : undefined}
      data-present-widget-text-color={textColor}
    >
      {children}
    </div>
  );
};

const ProgressRing: React.FC<Props> = ({ widget }) => {
  const progress = Math.max(0, Math.min(100, widget.progress ?? 0));
  const circumference = 2 * Math.PI * 30;
  return (
    <WidgetFrame widget={widget} className="flex items-center justify-center p-2 relative">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="30" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" />
        <circle cx="40" cy="40" r="30" stroke={widget.accentColor} strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress / 100)} strokeLinecap="round" fill="transparent" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <strong className="text-sm text-slate-100">{widget.value || `${Math.round(progress)}%`}</strong>
        <span className="text-[0.5rem] uppercase tracking-wider text-slate-400 max-w-[70%] truncate">{widget.label}</span>
      </div>
    </WidgetFrame>
  );
};

const Gauge: React.FC<Props> = ({ widget }) => {
  const progress = Math.max(0, Math.min(100, widget.progress ?? 0));
  const angle = -90 + progress * 1.8;
  return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col justify-between">
      <div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div>
      <div className="relative mx-auto w-28 h-16 overflow-hidden">
        <div className="absolute left-1/2 top-2 w-24 h-24 -translate-x-1/2 rounded-full border-[9px] border-slate-800" />
        <div className="absolute left-1/2 top-[47px] w-10 h-[2px] origin-left" style={{ transform: `rotate(${angle}deg)`, backgroundColor: widget.accentColor }} />
        <div className="absolute left-1/2 top-[43px] w-2.5 h-2.5 -translate-x-1/2 rounded-full" style={{ backgroundColor: widget.accentColor }} />
      </div>
      <div className="text-center text-lg font-black" style={{ color: widget.accentColor }}>{widget.value || `${Math.round(progress)}%`}</div>
    </WidgetFrame>
  );
};

const iconFor = (key: PresentWidgetSceneObject['iconKey']) => {
  const common = { className: 'w-6 h-6', 'aria-hidden': true as const };
  if (key === 'shield') return <ShieldCheck {...common} />;
  if (key === 'users') return <Users {...common} />;
  if (key === 'trend') return <TrendingUp {...common} />;
  if (key === 'clock') return <Clock3 {...common} />;
  if (key === 'target') return <Target {...common} />;
  return <Activity {...common} />;
};

const CalendarWidget: React.FC<Props> = ({ widget }) => {
  const year = widget.calendarYear || 2026;
  const month = widget.calendarMonth ?? 0;
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, index) => index - first + 1);
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));
  return (
    <WidgetFrame widget={widget} className="p-2.5 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[0.625rem] font-bold text-slate-100 truncate">{widget.label}</span>
        <span className="text-[0.5625rem] text-slate-400">{monthName} {year}</span>
      </div>
      <div className="grid grid-cols-7 text-[0.4375rem] text-slate-500 text-center mb-1">{['S','M','T','W','T','F','S'].map((d,i)=><span key={`${d}-${i}`}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-0.5 flex-1 text-[0.5rem]">
        {cells.map((day, index) => {
          const active = day >= 1 && day <= days;
          const highlighted = active && (widget.highlightedDays || []).includes(day);
          return <div key={index} className="rounded flex items-center justify-center" style={{ color: active ? '#cbd5e1' : 'transparent', backgroundColor: highlighted ? `${widget.accentColor}35` : 'transparent', border: highlighted ? `1px solid ${widget.accentColor}80` : '1px solid transparent' }}>{active ? day : '·'}</div>;
        })}
      </div>
    </WidgetFrame>
  );
};

const PresentWidgetRendererInner: React.FC<Props> = ({ widget: raw }) => {
  const widget = normalizePresentWidget(raw);
  const items = widget.items || [];

  if (widget.widgetType === 'progress-ring') return <ProgressRing widget={widget} />;
  if (widget.widgetType === 'gauge') return <Gauge widget={widget} />;
  if (widget.widgetType === 'calendar') return <CalendarWidget widget={widget} />;

  if (widget.widgetType === 'progress') return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col justify-between">
      <div><div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div><div className="mt-1 text-xl font-black truncate" style={{ color: widget.accentColor }}>{widget.value}</div></div>
      <div className="space-y-1"><div className="flex justify-between text-[0.5rem] text-slate-500"><span>0%</span><span>{Math.round(widget.progress || 0)}%</span><span>100%</span></div><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${widget.progress}%`, backgroundColor: widget.accentColor }} /></div></div>
    </WidgetFrame>
  );

  if (widget.widgetType === 'milestone') return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col justify-between">
      <div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div>
      <div className="relative flex items-start justify-between gap-1 py-2"><div className="absolute left-3 right-3 top-[17px] h-px bg-slate-700" />{items.map((it)=><div key={it.id} className="relative z-10 flex-1 min-w-0 text-center"><span className="mx-auto flex w-4 h-4 rounded-full border-2 bg-slate-950" style={{ borderColor: it.color || widget.accentColor }} /><div className="mt-1 text-[0.5rem] font-bold text-slate-200 truncate">{it.label}</div><div className="text-[0.4375rem] text-slate-500 truncate">{it.subtitle || it.value}</div></div>)}</div>
    </WidgetFrame>
  );

  if (widget.widgetType === 'roadmap') return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col gap-2">
      <div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div>
      <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, items.length))}, minmax(0,1fr))` }}>{items.slice(0,4).map((it, idx)=><div key={it.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 min-w-0"><div className="text-[0.5rem] font-mono" style={{ color: it.color || widget.accentColor }}>0{idx+1}</div><div className="text-[0.5625rem] font-bold text-slate-100 truncate">{it.label}</div><div className="text-[0.4375rem] text-slate-500 truncate">{it.subtitle || it.value}</div></div>)}</div>
    </WidgetFrame>
  );

  if (widget.widgetType === 'comparison') return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col gap-2">
      <div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div>
      <div className="grid grid-cols-2 gap-2 flex-1">{items.slice(0,2).map((it)=><div key={it.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2 flex flex-col justify-between"><div className="text-[0.5625rem] font-bold" style={{ color: it.color || widget.accentColor }}>{it.label}</div><div className="text-sm font-black text-slate-100 truncate">{it.value}</div><div className="text-[0.4375rem] text-slate-500 line-clamp-2">{it.subtitle}</div></div>)}</div>
    </WidgetFrame>
  );

  if (widget.widgetType === 'quote') return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col justify-between">
      <blockquote className="text-xs md:text-sm font-semibold text-slate-100 leading-snug line-clamp-4">{widget.value}</blockquote>
      <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[0.5625rem] font-black" style={{ color: widget.accentColor, backgroundColor: `${widget.accentColor}22` }}>{(widget.profileName || 'A').split(/\s+/).map((p)=>p[0]).join('').slice(0,2).toUpperCase()}</div><div className="min-w-0"><div className="text-[0.5625rem] font-bold text-slate-200 truncate">{widget.profileName}</div><div className="text-[0.4375rem] text-slate-500 truncate">{widget.profileRole}</div></div></div>
    </WidgetFrame>
  );

  if (widget.widgetType === 'status') return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col gap-2"><div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div><div className="grid grid-cols-2 gap-1.5 flex-1">{items.slice(0,8).map((it)=><div key={it.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 flex items-center justify-between gap-1"><span className="text-[0.5rem] text-slate-300 truncate">{it.label}</span><span className="text-[0.4375rem] font-bold truncate" style={{ color: statusColor(it.status) }}>● {it.value}</span></div>)}</div></WidgetFrame>
  );

  if (widget.widgetType === 'icon-stat') return (
    <WidgetFrame widget={widget} className="p-3 flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ color: widget.accentColor, backgroundColor: `${widget.accentColor}20` }}>{iconFor(widget.iconKey)}</div><div className="min-w-0"><div className="text-[0.5625rem] uppercase tracking-wider text-slate-400 truncate">{widget.label}</div><div className="text-xl font-black text-slate-100 truncate">{widget.value}</div><div className="text-[0.5rem] truncate" style={{ color: widget.accentColor }}>{widget.secondaryValue}</div></div></WidgetFrame>
  );

  if (widget.widgetType === 'device') {
    const phone = widget.deviceKind === 'phone';
    const tablet = widget.deviceKind === 'tablet';
    return <WidgetFrame widget={widget} className="p-3 flex items-center justify-center"><div className={`border border-slate-600 bg-slate-900 overflow-hidden shadow-2xl ${phone ? 'h-full aspect-[9/18] rounded-[18px]' : tablet ? 'w-[75%] h-full rounded-[14px]' : 'w-full h-full rounded-xl'}`}><div className="h-5 bg-slate-800 border-b border-white/10 flex items-center gap-1 px-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400"/><span className="w-1.5 h-1.5 rounded-full bg-amber-400"/><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/><span className="ml-2 text-[0.375rem] text-slate-500 truncate">{widget.deviceUrlLabel}</span></div><div className="h-[calc(100%-20px)] p-3 flex flex-col justify-center items-center text-center bg-gradient-to-br from-slate-950 to-slate-900"><div className="text-[0.5625rem] uppercase text-slate-500">{widget.label}</div><div className="text-sm font-black mt-1" style={{ color: widget.accentColor }}>{widget.value}</div></div></div></WidgetFrame>;
  }

  if (widget.widgetType === 'gallery') return (
    <WidgetFrame widget={widget} className="p-2 flex flex-col gap-1.5"><div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div><div className="grid grid-cols-3 gap-1 flex-1 min-h-0">{(widget.galleryItems || []).length ? widget.galleryItems!.slice(0,6).map((img)=><figure key={img.id} className="rounded-md overflow-hidden bg-slate-900 relative min-h-0"><img src={img.dataUrl} alt={img.caption || img.name} className="w-full h-full object-cover"/>{img.caption && <figcaption className="absolute bottom-0 inset-x-0 bg-black/60 text-[0.375rem] text-white px-1 py-0.5 truncate">{img.caption}</figcaption>}</figure>) : Array.from({length:6},(_,i)=><div key={i} className="rounded-md border border-dashed border-white/10 bg-white/[0.02] flex items-center justify-center text-[0.4375rem] text-slate-600">Image {i+1}</div>)}</div></WidgetFrame>
  );

  if (widget.widgetType === 'rating') {
    const max = Math.max(1, Math.min(10, widget.ratingMax || 5));
    const value = Math.max(0, Math.min(max, widget.ratingValue || 0));
    return <WidgetFrame widget={widget} className="p-3 flex flex-col items-center justify-center text-center"><div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold">{widget.label}</div><div className="flex gap-1 my-1.5">{Array.from({length:max},(_,i)=><Star key={i} className="w-4 h-4" fill={i + 1 <= Math.round(value) ? widget.accentColor : 'transparent'} color={i + 1 <= Math.round(value) ? widget.accentColor : '#475569'} />)}</div><div className="text-xs font-bold text-slate-200">{widget.value || `${value} / ${max}`}</div></WidgetFrame>;
  }

  return (
    <WidgetFrame widget={widget} className="p-3 flex flex-col justify-between"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[0.5625rem] uppercase tracking-widest text-slate-400 font-semibold truncate">{widget.label}</div><div className="mt-1 text-xl md:text-2xl font-black truncate" style={{ color: widget.accentColor }}>{widget.value}</div></div><div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ color: widget.accentColor, backgroundColor: `${widget.accentColor}20` }}>{iconFor(widget.iconKey)}</div></div>{widget.secondaryValue && <div className="text-[0.5rem] font-semibold" style={{ color: widget.accentColor }}>{widget.secondaryValue}</div>}</WidgetFrame>
  );
};

/**
 * Round 41 (style system): the chrome style is provided through context so every widget layout
 * (all render through `WidgetFrame`) gets the same authored background/gradient/border/radius/shadow.
 */
export const PresentWidgetRenderer: React.FC<Props> = ({ widget, chromeStyle }) => (
  <PresentWidgetChromeContext.Provider value={chromeStyle ?? EMPTY_WIDGET_CHROME}>
    <PresentWidgetRendererInner widget={widget} />
  </PresentWidgetChromeContext.Provider>
);
