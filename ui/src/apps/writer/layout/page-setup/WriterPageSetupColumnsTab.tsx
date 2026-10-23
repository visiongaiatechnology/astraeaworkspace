// STATUS: DIAMANT VGT SUPREME — Focused Writer page setup tab owner
import React from 'react';
import { Columns } from 'lucide-react';
import type { PageSetupConfig } from '../../types';
import { resolveWriterColumnLayoutMm } from '../../../../platform/document-layout/writerColumns';
import type { WriterPageSetupTabsCopy } from './writerPageSetupTabsLocale';

interface WriterPageSetupColumnsTabProps {
  config: PageSetupConfig;
  bodyWidthMm: number;
  onUpdateConfig: (candidate: PageSetupConfig) => void;
  onSelectColumnCount: (count: 1 | 2 | 3 | 4) => void;
  onSetCustomColumnWidths: (enabled: boolean) => void;
  onColumnWidthChange: (index: number, width: number) => void;
  onEqualizeColumns: () => void;
  copy: WriterPageSetupTabsCopy['columns'];
}

export const WriterPageSetupColumnsTab: React.FC<WriterPageSetupColumnsTabProps> = ({ config, bodyWidthMm, onUpdateConfig, onSelectColumnCount, onSetCustomColumnWidths, onColumnWidthChange, onEqualizeColumns, copy }) => (
  <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">{copy.layout}</label>
                <div className="grid grid-cols-4 gap-2">
                  {([1, 2, 3, 4] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onSelectColumnCount(count)}
                      aria-label={copy.count[String(count) as keyof typeof copy.count]}
                      aria-pressed={(config.columns ?? 1) === count}
                      className={`p-3 rounded-xl border text-xs text-center transition-all flex flex-col items-center justify-center space-y-1 focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                        (config.columns ?? 1) === count
                          ? 'border-blue-500 bg-blue-500/15 text-white font-semibold'
                          : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Columns className="w-5 h-5 text-blue-400" />
                      <span>{copy.count[String(count) as keyof typeof copy.count]}</span>
                    </button>
                  ))}
                </div>
              </div>
  
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.gap}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  aria-label={copy.gap}
                  value={config.columnGapMm ?? 10}
                  onChange={(e) => onUpdateConfig({ ...config, columnGapMm: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                />
              </div>
  
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{copy.widths}</div>
                    <div className="text-[0.625rem] text-slate-500">{copy.widthHelp}</div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={config.columnWidthsMm !== undefined}
                    onClick={() => onSetCustomColumnWidths(config.columnWidthsMm === undefined)}
                    className={`rounded-lg border px-3 py-1.5 text-[0.6875rem] transition-colors focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                      config.columnWidthsMm
                        ? 'border-blue-500 bg-blue-500/15 text-blue-200'
                        : 'border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {copy.custom}
                  </button>
                </div>
  
                {config.columnWidthsMm && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {config.columnWidthsMm.map((width, index) => (
                        <label key={index} className="space-y-1 text-[0.625rem] font-semibold text-slate-400">
                          <span>{copy.columnWidth(index + 1)}</span>
                          <input
                            type="number"
                            min="5"
                            max="1000"
                            step="0.1"
                            aria-label={copy.columnWidth(index + 1)}
                            value={Number(width.toFixed(2))}
                            onChange={(event) => onColumnWidthChange(index, Number(event.target.value))}
                            className="w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[0.625rem] text-slate-500">
                        {copy.remaining(resolveWriterColumnLayoutMm(config, bodyWidthMm).remainingWidth.toFixed(2))}
                      </span>
                      <button
                        type="button"
                        onClick={onEqualizeColumns}
                        className="focus-visible:ring-2 focus-visible:ring-blue-400/70 rounded-lg border border-white/10 px-3 py-1.5 text-[0.6875rem] text-slate-300 hover:border-blue-500/60 hover:text-white"
                      >
                        {copy.distribute}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
);
