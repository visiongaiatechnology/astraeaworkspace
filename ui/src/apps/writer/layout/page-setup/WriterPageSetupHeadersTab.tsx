// STATUS: DIAMANT VGT SUPREME — Focused Writer page setup tab owner
import React from 'react';
import type { PageSetupConfig, WriterPageNumberFormat } from '../../types';
import type { WriterPageSetupTabsCopy } from './writerPageSetupTabsLocale';

interface WriterPageSetupHeadersTabProps {
  config: PageSetupConfig;
  isSectionConfig: boolean;
  restartPageNumberAt: number | undefined;
  setRestartPageNumberAt: React.Dispatch<React.SetStateAction<number | undefined>>;
  onUpdateConfig: (candidate: PageSetupConfig) => void;
  copy: WriterPageSetupTabsCopy['headers'];
}

export const WriterPageSetupHeadersTab: React.FC<WriterPageSetupHeadersTabProps> = ({ config, isSectionConfig, restartPageNumberAt, setRestartPageNumberAt, onUpdateConfig, copy }) => (
  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.header} <span className="font-normal">({copy.standardOdd})</span></label>
                <input
                  type="text"
                  aria-label={copy.header}
                  value={config.headerText}
                  onChange={(e) => onUpdateConfig({ ...config, headerText: e.target.value })}
                  placeholder={copy.headerPlaceholder}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                />
              </div>
  
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">{copy.footer} <span className="font-normal">({copy.standardOdd})</span></label>
                <input
                  type="text"
                  aria-label={copy.footer}
                  value={config.footerText}
                  onChange={(e) => onUpdateConfig({ ...config, footerText: e.target.value })}
                  placeholder={copy.footerPlaceholder}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                />
              </div>
  
              {/* Special Header / Footer Separation Options */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/10 space-y-3">
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span>{copy.firstPageDifferent}</span>
                  <input
                    type="checkbox"
                    checked={config.firstPageDifferent ?? false}
                    onChange={(e) => onUpdateConfig({ ...config, firstPageDifferent: e.target.checked })}
                    className="accent-blue-500"
                  />
                </label>
  
                {config.firstPageDifferent && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.firstHeader}</label>
                      <input
                        type="text"
                        aria-label={copy.firstHeader}
                        value={config.firstPageHeaderText ?? ''}
                        onChange={(e) => onUpdateConfig({ ...config, firstPageHeaderText: e.target.value })}
                        placeholder={copy.firstHeaderPlaceholder}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.firstFooter}</label>
                      <input
                        type="text"
                        aria-label={copy.firstFooter}
                        value={config.firstPageFooterText ?? ''}
                        onChange={(e) => onUpdateConfig({ ...config, firstPageFooterText: e.target.value })}
                        placeholder={copy.firstFooterPlaceholder}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                  </div>
                )}
  
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-2 border-t border-white/5">
                  <span>{copy.oddEvenDifferent}</span>
                  <input
                    type="checkbox"
                    checked={config.oddEvenDifferent ?? false}
                    onChange={(e) => onUpdateConfig({ ...config, oddEvenDifferent: e.target.checked })}
                    className="accent-blue-500"
                  />
                </label>
  
                {config.oddEvenDifferent && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.evenHeader}</label>
                      <input
                        type="text"
                        aria-label={copy.evenHeader}
                        value={config.evenPageHeaderText ?? ''}
                        onChange={(e) => onUpdateConfig({ ...config, evenPageHeaderText: e.target.value })}
                        placeholder={copy.evenHeaderPlaceholder}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.evenFooter}</label>
                      <input
                        type="text"
                        aria-label={copy.evenFooter}
                        value={config.evenPageFooterText ?? ''}
                        onChange={(e) => onUpdateConfig({ ...config, evenPageFooterText: e.target.value })}
                        placeholder={copy.evenFooterPlaceholder}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                  </div>
                )}
  
                {isSectionConfig && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                      <span>{copy.linkHeader}</span>
                      <input
                        type="checkbox"
                        checked={config.linkToPreviousHeader ?? true}
                        onChange={(e) => onUpdateConfig({ ...config, linkToPreviousHeader: e.target.checked })}
                        className="accent-blue-500"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                      <span>{copy.linkFooter}</span>
                      <input
                        type="checkbox"
                        checked={config.linkToPreviousFooter ?? true}
                        onChange={(e) => onUpdateConfig({ ...config, linkToPreviousFooter: e.target.checked })}
                        className="accent-blue-500"
                      />
                    </label>
                  </div>
                )}
              </div>
  
              {/* Page Numbering Options */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/10 space-y-3">
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span>{copy.showPageNumbers}</span>
                  <input
                    type="checkbox"
                    checked={config.showPageNumbers}
                    onChange={(e) => onUpdateConfig({ ...config, showPageNumbers: e.target.checked })}
                    className="accent-blue-500"
                  />
                </label>
  
                {config.showPageNumbers && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.numberFormat}</label>
                      <select
                        aria-label={copy.numberFormat}
                        value={config.pageNumberFormat ?? 'arabic'}
                        onChange={(e) => onUpdateConfig({ ...config, pageNumberFormat: e.target.value as WriterPageNumberFormat })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        {Object.entries(copy.numberFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.position}</label>
                      <select
                        aria-label={copy.position}
                        value={config.pageNumberPosition ?? 'footer-right'}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          pageNumberPosition: e.target.value as NonNullable<PageSetupConfig['pageNumberPosition']>,
                        })}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        {Object.entries(copy.positions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      {isSectionConfig ? (
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 text-[0.625rem] text-slate-400">
                            <input
                              type="checkbox"
                              checked={restartPageNumberAt !== undefined}
                              onChange={(event) => setRestartPageNumberAt(event.target.checked ? 1 : undefined)}
                              className="accent-blue-500"
                            />
                            <span>{copy.restartInSection}</span>
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            disabled={restartPageNumberAt === undefined}
                            value={restartPageNumberAt ?? 1}
                            onChange={(event) => setRestartPageNumberAt(Number(event.target.value))}
                            aria-label={copy.startInSection}
                            className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
                          />
                        </div>
                      ) : (
                        <>
                          <label className="text-[0.625rem] text-slate-400 block mb-0.5">{copy.startInDocument}</label>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={config.pageNumberStart ?? 1}
                            onChange={(event) => onUpdateConfig({ ...config, pageNumberStart: Number(event.target.value) })}
                            aria-label={copy.startInDocument}
                            className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
                          />
                        </>
                      )}
                    </div>
                    <div className="flex items-center pt-3">
                      <label className="flex items-center gap-2 text-[0.6875rem] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.chapterNumbering ?? false}
                          onChange={(e) => onUpdateConfig({ ...config, chapterNumbering: e.target.checked })}
                          className="accent-blue-500"
                        />
                        <span>{copy.chapterNumbering}</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
);
