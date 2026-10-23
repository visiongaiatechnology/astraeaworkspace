// STATUS: DIAMANT VGT SUPREME — Focused Writer page setup tab owner
import React from 'react';
import { Check } from 'lucide-react';
import type { MarginPreset, PageOrientation, PageSetupConfig, PaperSize } from '../../types';
import { resolveWriterPageBackgroundColor } from '../../../../shared/writer/layout/pageDecorations';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WRITER_PAGE_SETUP_COPY } from './writerPageSetupLocale';

interface WriterPageSetupGeometryTabProps {
  config: PageSetupConfig;
  onUpdateConfig: (candidate: PageSetupConfig) => void;
  onSelectPaperSize: (paperSize: PaperSize) => void;
  onSelectMarginPreset: (margins: MarginPreset) => void;
}

export const WriterPageSetupGeometryTab: React.FC<WriterPageSetupGeometryTabProps> = ({ config, onUpdateConfig, onSelectPaperSize, onSelectMarginPreset }) => {
  const { locale } = useWorkspaceLocale();
  const copy = WRITER_PAGE_SETUP_COPY[locale].geometry;
  return (
  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
              {/* Paper Size */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.paperSize}</label>
                <div className="grid grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-white/5">
                  {[
                    { id: 'A4', label: 'A4 (210×297)' },
                    { id: 'Letter', label: 'Letter (8.5×11)' },
                    { id: 'A3', label: 'A3 (297×420)' },
                    { id: 'A5', label: 'A5 (148×210)' },
                    { id: 'Legal', label: 'Legal (8.5×14)' },
                    { id: 'A6', label: 'A6 (105×148)' },
                    { id: 'B4', label: 'B4 (250×353)' },
                    { id: 'B5', label: 'B5 (176×250)' },
                    { id: 'Executive', label: 'Executive' },
                    { id: 'A2', label: 'A2 (420×594)' },
                    { id: 'A1', label: 'A1 (594×841)' },
                    { id: 'A0', label: 'A0 (841×1189)' },
                    { id: 'Custom', label: 'Custom mm' },
                  ].map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => onSelectPaperSize(size.id as PaperSize)}
                      aria-pressed={config.paperSize === size.id}
                      className={`p-1.5 rounded-lg border text-[0.6875rem] text-left transition-all flex items-center justify-between focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                        config.paperSize === size.id
                          ? 'border-blue-500 bg-blue-500/20 text-white font-semibold'
                          : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate">{copy.paperNames[size.id as keyof typeof copy.paperNames] ?? size.label}</span>
                      {config.paperSize === size.id && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
                    </button>
                  ))}
                </div>
  
                {config.paperSize === 'Custom' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.width}</label>
                      <input
                        type="number"
                        min={25}
                        max={2000}
                        value={config.customWidthMm ?? 210}
                        onChange={(e) => onUpdateConfig({ ...config, customWidthMm: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.height}</label>
                      <input
                        type="number"
                        min={25}
                        max={2000}
                        value={config.customHeightMm ?? 297}
                        onChange={(e) => onUpdateConfig({ ...config, customHeightMm: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
  
              {/* Orientation */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.orientation}</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'portrait', label: copy.portrait },
                    { id: 'landscape', label: copy.landscape },
                  ].map((ori) => (
                    <button
                      key={ori.id}
                      type="button"
                      onClick={() => onUpdateConfig({ ...config, orientation: ori.id as PageOrientation })}
                      className={`p-2.5 rounded-xl border text-xs text-center transition-all focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                        config.orientation === ori.id
                          ? 'border-blue-500 bg-blue-500/15 text-white font-semibold'
                          : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ori.label}
                    </button>
                  ))}
                </div>
              </div>
  
              {/* Margins & Gutter (Bundsteg) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.marginsAndGutter}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'normal', label: copy.presets.normal },
                    { id: 'narrow', label: copy.presets.narrow },
                    { id: 'wide', label: copy.presets.wide },
                    { id: 'mirrored', label: copy.presets.mirrored },
                    { id: 'custom', label: copy.presets.custom },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectMarginPreset(m.id as MarginPreset)}
                      aria-pressed={config.margins === m.id}
                      className={`p-1.5 rounded-lg border text-[0.6875rem] text-center transition-all focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                        config.margins === m.id
                          ? 'border-blue-500 bg-blue-500/15 text-white font-semibold'
                          : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
  
                {(config.margins === 'custom' || config.margins === 'mirrored') && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 p-2 bg-slate-950/40 rounded-xl border border-white/5">
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block">{copy.top}</label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.1}
                        value={config.customMargins?.top ?? 25}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          customMargins: {
                            top: Number(e.target.value),
                            bottom: config.customMargins?.bottom ?? 25,
                            left: config.customMargins?.left ?? 25,
                            right: config.customMargins?.right ?? 25,
                            gutter: config.customMargins?.gutter ?? 0,
                          },
                        })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block">{copy.bottom}</label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.1}
                        value={config.customMargins?.bottom ?? 25}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          customMargins: {
                            top: config.customMargins?.top ?? 25,
                            bottom: Number(e.target.value),
                            left: config.customMargins?.left ?? 25,
                            right: config.customMargins?.right ?? 25,
                            gutter: config.customMargins?.gutter ?? 0,
                          },
                        })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block">
                        {config.margins === 'mirrored' ? copy.inside : copy.left}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.1}
                        value={config.customMargins?.left ?? (config.margins === 'mirrored' ? 31.8 : 25)}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          customMargins: {
                            top: config.customMargins?.top ?? 25,
                            bottom: config.customMargins?.bottom ?? 25,
                            left: Number(e.target.value),
                            right: config.customMargins?.right ?? 25,
                            gutter: config.customMargins?.gutter ?? 0,
                          },
                        })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block">
                        {config.margins === 'mirrored' ? copy.outside : copy.right}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.1}
                        value={config.customMargins?.right ?? 25}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          customMargins: {
                            top: config.customMargins?.top ?? 25,
                            bottom: config.customMargins?.bottom ?? 25,
                            left: config.customMargins?.left ?? 25,
                            right: Number(e.target.value),
                            gutter: config.customMargins?.gutter ?? 0,
                          },
                        })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block">{copy.gutter}</label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.1}
                        value={config.customMargins?.gutter ?? 0}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          customMargins: {
                            top: config.customMargins?.top ?? 25,
                            bottom: config.customMargins?.bottom ?? 25,
                            left: config.customMargins?.left ?? 25,
                            right: config.customMargins?.right ?? 25,
                            gutter: Number(e.target.value),
                          },
                        })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
  
              {/* Paper Color */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.pageBackground}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'white' as const, label: copy.paperColors.white, bgClass: 'bg-white text-slate-900' },
                    { id: 'cream' as const, label: copy.paperColors.cream, bgClass: 'bg-[#fcf8f2] text-slate-900' },
                    { id: 'dark' as const, label: copy.paperColors.dark, bgClass: 'bg-slate-950 text-slate-100' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onUpdateConfig({ ...config, paperColor: c.id, backgroundColor: undefined })}
                      className={`p-2 rounded-xl border text-xs text-center font-medium transition-all focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                        config.backgroundColor === undefined && config.paperColor === c.id ? 'ring-2 ring-blue-500 border-transparent font-bold' : 'border-white/10 opacity-70 hover:opacity-100'
                      } ${c.bgClass}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-2 text-xs text-slate-300">
                  <span>
                    {copy.customBackground}
                    <span className="mt-0.5 block text-[0.625rem] text-slate-500">{copy.sectionBackgroundHelp}</span>
                  </span>
                  <input
                    type="color"
                    aria-label={copy.customBackground}
                    value={config.backgroundColor ?? resolveWriterPageBackgroundColor(config)}
                    onChange={(event) => onUpdateConfig({ ...config, backgroundColor: event.currentTarget.value.toUpperCase() })}
                    className={`h-8 w-14 cursor-pointer rounded border bg-slate-900 ${config.backgroundColor ? 'border-blue-500' : 'border-white/10'}`}
                  />
                </label>
              </div>
            </div>
  );
};
