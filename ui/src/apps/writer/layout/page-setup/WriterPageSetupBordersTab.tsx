// STATUS: DIAMANT VGT SUPREME — Focused Writer page setup tab owner
import React from 'react';
import type { PageSetupConfig } from '../../types';
import type { WriterPageSetupTabsCopy } from './writerPageSetupTabsLocale';

interface WriterPageSetupBordersTabProps {
  config: PageSetupConfig;
  onUpdateConfig: (candidate: PageSetupConfig) => void;
  copy: WriterPageSetupTabsCopy['borders'];
}

export const WriterPageSetupBordersTab: React.FC<WriterPageSetupBordersTabProps> = ({ config, onUpdateConfig, copy }) => (
  <div className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-white/10 text-xs text-slate-300 cursor-pointer">
                <span>{copy.enable}</span>
                <input
                  type="checkbox"
                  checked={Boolean(config.pageBorders)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onUpdateConfig({
                        ...config,
                        pageBorders: {
                          style: 'solid',
                          widthPt: 1,
                          color: '#475569',
                          paddingMm: 5,
                        },
                      });
                    } else {
                      onUpdateConfig({ ...config, pageBorders: undefined });
                    }
                  }}
                  className="accent-blue-500"
                />
              </label>
  
              {config.pageBorders && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/40 rounded-xl border border-white/5 text-xs">
                  <div>
                    <label className="text-[0.625rem] text-slate-400 block mb-1">{copy.style}</label>
                    <select
                      aria-label={copy.style}
                      value={config.pageBorders.style}
                      onChange={(e) => onUpdateConfig({
                        ...config,
                          pageBorders: {
                            ...config.pageBorders!,
                            style: e.target.value as NonNullable<PageSetupConfig['pageBorders']>['style'],
                          },
                      })}
                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    >
                      {Object.entries(copy.styles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.625rem] text-slate-400 block mb-1">{copy.width}</label>
                    <input
                      type="number"
                      min={0.5}
                      max={12}
                      step={0.5}
                      aria-label={copy.width}
                      value={config.pageBorders.widthPt}
                      onChange={(e) => onUpdateConfig({
                        ...config,
                        pageBorders: { ...config.pageBorders!, widthPt: Number(e.target.value) },
                      })}
                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[0.625rem] text-slate-400 block mb-1">{copy.color}</label>
                    <input
                      type="color"
                      aria-label={copy.color}
                      value={config.pageBorders.color}
                      onChange={(e) => onUpdateConfig({
                        ...config,
                        pageBorders: { ...config.pageBorders!, color: e.target.value },
                      })}
                      className="w-full h-8 bg-slate-900 border border-white/10 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[0.625rem] text-slate-400 block mb-1">{copy.padding}</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      aria-label={copy.padding}
                      value={config.pageBorders.paddingMm}
                      onChange={(e) => onUpdateConfig({
                        ...config,
                        pageBorders: { ...config.pageBorders!, paddingMm: Number(e.target.value) },
                      })}
                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>
);
