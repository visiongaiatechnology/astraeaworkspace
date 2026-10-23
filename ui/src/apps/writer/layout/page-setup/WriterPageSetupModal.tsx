// STATUS: DIAMANT VGT SUPREME — Sovereign Page Setup & Geometry Architecture Modal
import React, { useEffect, useRef, useState } from 'react';
import { PageSetupConfig, PaperSize, MarginPreset } from '../../types';
import type { WriterSectionBreakType } from '../../../../shared/contracts/workspace';
import { X, Layout, Plus, Trash2 } from 'lucide-react';
import { WriterWatermarkTab } from './WriterWatermarkTab';
import { WriterPageSetupGeometryTab } from './WriterPageSetupGeometryTab';
import { WriterPageSetupColumnsTab } from './WriterPageSetupColumnsTab';
import { WriterPageSetupHeadersTab } from './WriterPageSetupHeadersTab';
import { WriterPageSetupBordersTab } from './WriterPageSetupBordersTab';
import { validateWriterPageSetup } from './writerPageSetupValidation';
import { resolveWriterPaperDimensionsMm } from '../../../../platform/document-layout/writerPaperSizes';
import { resolveWriterMarginDefinitionMm } from '../../../../platform/document-layout/writerPageMargins';
import { equalWriterColumnWidthsMm, resolveWriterColumnLayoutMm } from '../../../../platform/document-layout/writerColumns';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WRITER_PAGE_SETUP_COPY } from './writerPageSetupLocale';
import { WRITER_PAGE_SETUP_TABS_COPY, writerPageSetupValidationFallback } from './writerPageSetupTabsLocale';

interface WriterPageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PageSetupConfig;
  onUpdateConfig: (
    cfg: PageSetupConfig,
    breakType?: WriterSectionBreakType,
    restartPageNumberAt?: number | null,
  ) => void;
  isSectionConfig: boolean;
  sectionBreakType?: WriterSectionBreakType;
  restartPageNumberAt?: number;
  canCreateSection: boolean;
  onCreateSection: () => void;
  onRemoveSection: () => void;
}

type ModalTab = 'geometry' | 'columns' | 'headers' | 'borders' | 'watermark';

export const WriterPageSetupModal: React.FC<WriterPageSetupModalProps> = ({
  isOpen,
  onClose,
  config: persistedConfig,
  onUpdateConfig: persistConfig,
  isSectionConfig,
  sectionBreakType: persistedSectionBreakType = 'next-page',
  restartPageNumberAt: persistedRestartPageNumberAt,
  canCreateSection,
  onCreateSection,
  onRemoveSection,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = WRITER_PAGE_SETUP_COPY[locale];
  const tabCopy = WRITER_PAGE_SETUP_TABS_COPY[locale];
  const [activeTab, setActiveTab] = useState<ModalTab>('geometry');
  const [config, setConfig] = useState<PageSetupConfig>(persistedConfig);
  const [sectionBreakType, setSectionBreakType] = useState<WriterSectionBreakType>(persistedSectionBreakType);
  const [restartPageNumberAt, setRestartPageNumberAt] = useState<number | undefined>(persistedRestartPageNumberAt);
  const [validationError, setValidationError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setConfig(persistedConfig);
      setSectionBreakType(persistedSectionBreakType);
      setRestartPageNumberAt(persistedRestartPageNumberAt);
      setValidationError(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, persistedConfig, persistedRestartPageNumberAt, persistedSectionBreakType]);

  const onUpdateConfig = (candidate: PageSetupConfig): void => {
    setConfig(candidate);
    const error = validateWriterPageSetup(candidate);
    setValidationError(error === null ? null : writerPageSetupValidationFallback(locale, error));
  };

  const handleSelectPaperSize = (paperSize: PaperSize): void => {
    onUpdateConfig({
      ...config,
      paperSize,
      ...(paperSize === 'Custom'
        ? {
            customWidthMm: config.customWidthMm ?? 210,
            customHeightMm: config.customHeightMm ?? 297,
          }
        : {}),
    });
  };

  const handleSelectMarginPreset = (margins: MarginPreset): void => {
    if (margins === 'mirrored') {
      onUpdateConfig({
        ...config,
        margins,
        mirroredMargins: true,
        customMargins: (
          config.margins === 'custom' || config.margins === 'mirrored'
            ? config.customMargins
            : undefined
        ) ?? {
              top: 25.4,
              bottom: 25.4,
              left: 31.75,
              right: 25.4,
              gutter: 0,
            },
      });
      return;
    }
    if (margins === 'custom') {
      onUpdateConfig({
        ...config,
        margins,
        mirroredMargins: false,
        customMargins: config.customMargins ?? {
          top: 25.4,
          bottom: 25.4,
          left: 25.4,
          right: 25.4,
          gutter: 0,
        },
      });
      return;
    }
    onUpdateConfig({
      ...config,
      margins,
      mirroredMargins: false,
      customMargins: undefined,
    });
  };

  const resolveBodyWidthMm = (candidate: PageSetupConfig): number => {
    const dimensions = resolveWriterPaperDimensionsMm(candidate);
    const pageWidth = candidate.orientation === 'landscape' ? dimensions.height : dimensions.width;
    const margins = resolveWriterMarginDefinitionMm(candidate);
    return pageWidth - margins.inside - margins.outside - margins.gutter;
  };

  const handleSelectColumnCount = (count: 1 | 2 | 3 | 4): void => {
    onUpdateConfig({ ...config, columns: count, columnWidthsMm: undefined });
  };

  const handleSetCustomColumnWidths = (enabled: boolean): void => {
    if (!enabled) {
      onUpdateConfig({ ...config, columnWidthsMm: undefined });
      return;
    }
    const count = config.columns ?? 1;
    const gap = config.columnGapMm ?? 10;
    onUpdateConfig({
      ...config,
      columnWidthsMm: equalWriterColumnWidthsMm(resolveBodyWidthMm(config), count, gap),
    });
  };

  const handleColumnWidthChange = (index: number, width: number): void => {
    const layout = resolveWriterColumnLayoutMm(config, resolveBodyWidthMm(config));
    const widths = [...layout.widths];
    widths[index] = width;
    onUpdateConfig({ ...config, columnWidthsMm: widths });
  };

  const handleEqualizeColumns = (): void => {
    const count = config.columns ?? 1;
    const gap = config.columnGapMm ?? 10;
    onUpdateConfig({
      ...config,
      columnWidthsMm: equalWriterColumnWidthsMm(resolveBodyWidthMm(config), count, gap),
    });
  };

  const handleApply = (): void => {
    const error = validateWriterPageSetup(config);
    setValidationError(error === null ? null : writerPageSetupValidationFallback(locale, error));
    if (error !== null) return;
    if (
      restartPageNumberAt !== undefined &&
      (!Number.isInteger(restartPageNumberAt) || restartPageNumberAt < 1 || restartPageNumberAt > 9_999)
    ) {
      setValidationError(copy.sectionRestartError);
      return;
    }
    persistConfig(
      config,
      isSectionConfig ? sectionBreakType : undefined,
      isSectionConfig ? restartPageNumberAt ?? null : undefined,
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Layout className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-100">{copy.title}</h3>
          </div>
          <button aria-label={copy.closeDialog}
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-950/80 border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('geometry')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'geometry' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {copy.tabs.geometry}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('columns')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'columns' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {copy.tabs.columns}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'headers' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {copy.tabs.headers}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('borders')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'borders' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {copy.tabs.borders}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('watermark')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'watermark' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {copy.tabs.watermark}
          </button>
        </div>

        {/* Section Scope Banner */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
          <div>
            <div className="font-semibold text-slate-200">
              {isSectionConfig ? copy.activeSection : copy.standardDocument}
            </div>
            <div className="mt-0.5 text-[0.625rem] text-slate-400">
              {isSectionConfig
                ? copy.sectionScope
                : copy.documentScope}
            </div>
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-2">
            {canCreateSection && (
              <button
                type="button"
                onClick={onCreateSection}
                className="flex items-center gap-1 rounded-lg border border-blue-400/30 px-2 py-1.5 text-[0.625rem] font-semibold text-blue-100 transition-colors hover:bg-blue-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {copy.createSection}
              </button>
            )}
            {isSectionConfig && (
              <>
                <label className="flex items-center gap-1 text-[0.625rem] text-slate-300">
                  {copy.sectionStart}
                  <select
                    value={sectionBreakType}
                    onChange={(event) => setSectionBreakType(event.target.value as WriterSectionBreakType)}
                    className="rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-[0.625rem] text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-400"
                  >
                    <option value="next-page">{copy.sectionBreaks['next-page']}</option>
                    <option value="continuous">{copy.sectionBreaks.continuous}</option>
                    <option value="even-page">{copy.sectionBreaks['even-page']}</option>
                    <option value="odd-page">{copy.sectionBreaks['odd-page']}</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onRemoveSection}
                  className="flex items-center gap-1 rounded-lg border border-red-400/30 px-2 py-1.5 text-[0.625rem] font-semibold text-red-200 transition-colors hover:bg-red-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  {copy.removeSection}
                </button>
              </>
            )}
          </div>
        </div>

        {validationError && (
          <div role="alert" className="rounded-lg border border-red-400/30 bg-red-950/60 px-3 py-2 text-xs text-red-200">
            {validationError}
          </div>
        )}

        {/* Tab 1: Geometry & Paper */}
        {activeTab === 'geometry' && (
          <WriterPageSetupGeometryTab
            config={config}
            onUpdateConfig={onUpdateConfig}
            onSelectPaperSize={handleSelectPaperSize}
            onSelectMarginPreset={handleSelectMarginPreset}
          />
        )}
        {/* Tab 2: Columns */}
        {activeTab === 'columns' && (
          <WriterPageSetupColumnsTab
            config={config}
            bodyWidthMm={resolveBodyWidthMm(config)}
            onUpdateConfig={onUpdateConfig}
            onSelectColumnCount={handleSelectColumnCount}
            onSetCustomColumnWidths={handleSetCustomColumnWidths}
            onColumnWidthChange={handleColumnWidthChange}
            onEqualizeColumns={handleEqualizeColumns}
            copy={tabCopy.columns}
          />
        )}
        {/* Tab 3: Header / Footer */}
        {activeTab === 'headers' && (
          <WriterPageSetupHeadersTab
            config={config}
            isSectionConfig={isSectionConfig}
            restartPageNumberAt={restartPageNumberAt}
            setRestartPageNumberAt={setRestartPageNumberAt}
            onUpdateConfig={onUpdateConfig}
            copy={tabCopy.headers}
          />
        )}
        {/* Tab 4: Page Borders */}
        {activeTab === 'borders' && (
          <WriterPageSetupBordersTab config={config} onUpdateConfig={onUpdateConfig} copy={tabCopy.borders} />
        )}
        {/* Tab 5: Watermark */}
        {activeTab === 'watermark' && (
          <WriterWatermarkTab config={config} onUpdateConfig={onUpdateConfig} copy={tabCopy.watermark} />
        )}

        {/* Footer actions */}
        <div className="pt-2 border-t border-white/10 flex justify-end space-x-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={validationError !== null}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.apply}
          </button>
        </div>
      </div>
    </div>
  );
};
