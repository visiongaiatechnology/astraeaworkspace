// STATUS: DIAMANT VGT SUPREME — Sovereign Watermark Setup Tab
import React from 'react';
import { PageSetupConfig } from '../../types';
import type { WriterPageSetupTabsCopy } from './writerPageSetupTabsLocale';

interface WriterWatermarkTabProps {
  config: PageSetupConfig;
  onUpdateConfig: (cfg: PageSetupConfig) => void;
  copy: WriterPageSetupTabsCopy['watermark'];
}

export const WriterWatermarkTab: React.FC<WriterWatermarkTabProps> = ({
  config,
  onUpdateConfig,
  copy,
}) => {
  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-white/10 cursor-pointer">
        <div>
          <span className="text-xs font-semibold text-slate-200 block">{copy.enabled}</span>
          <span className="text-[0.625rem] text-slate-400">{copy.enabledHelp}</span>
        </div>
        <input
          type="checkbox"
          checked={config.watermark?.enabled ?? false}
          onChange={(e) =>
            onUpdateConfig({
              ...config,
              watermark: {
                enabled: e.target.checked,
                text: config.watermark?.text || 'CONFIDENTIAL',
                opacity: config.watermark?.opacity || 0.08,
                rotationDeg: config.watermark?.rotationDeg || -45,
                color: config.watermark?.color || '#94a3b8',
              },
            })
          }
          className="accent-blue-500"
        />
      </label>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300 block">{copy.text}</label>
        <div className="flex space-x-2">
          <input
            type="text"
            maxLength={120}
            aria-label={copy.textAccessibleName}
            value={config.watermark?.text ?? 'CONFIDENTIAL'}
            onChange={(e) =>
              onUpdateConfig({
                ...config,
                watermark: {
                  ...(config.watermark ?? { enabled: true, opacity: 0.08, rotationDeg: -45, color: '#94a3b8' }),
                  text: e.target.value,
                },
              })
            }
            className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          />
        </div>
        <div className="flex space-x-1.5 pt-1">
          {(['CONFIDENTIAL', 'DRAFT', 'SOVEREIGN', 'CLASSIFIED'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                onUpdateConfig({
                  ...config,
                  watermark: {
                    ...(config.watermark ?? { enabled: true, opacity: 0.08, rotationDeg: -45, color: '#94a3b8' }),
                    text: preset,
                    enabled: true,
                  },
                })
              }
              className="px-2 py-1 rounded bg-slate-800 text-[0.625rem] text-slate-300 hover:text-white"
            >
              {copy.presets[preset]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-300">
          <span>{copy.opacity}</span>
          <span>{Math.round((config.watermark?.opacity ?? 0.08) * 100)}%</span>
        </div>
        <input
          type="range"
          aria-label={copy.opacity}
          min="0.02"
          max="0.30"
          step="0.01"
          value={config.watermark?.opacity ?? 0.08}
          onChange={(e) =>
            onUpdateConfig({
              ...config,
              watermark: {
                ...(config.watermark ?? { enabled: true, text: 'CONFIDENTIAL', rotationDeg: -45, color: '#94a3b8' }),
                opacity: parseFloat(e.target.value),
              },
            })
          }
          className="w-full accent-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5 text-xs text-slate-300">
          <span className="block font-semibold">{copy.rotation}</span>
          <input
            type="number"
            min={-180}
            max={180}
            value={config.watermark?.rotationDeg ?? -45}
            onChange={(event) => onUpdateConfig({
              ...config,
              watermark: {
                ...(config.watermark ?? { enabled: true, text: 'CONFIDENTIAL', opacity: 0.08, color: '#94a3b8' }),
                rotationDeg: Number(event.currentTarget.value),
              },
            })}
            className="w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          />
        </label>
        <label className="space-y-1.5 text-xs text-slate-300">
          <span className="block font-semibold">{copy.color}</span>
          <input
            type="color"
            aria-label={copy.colorAccessibleName}
            value={config.watermark?.color ?? '#94a3b8'}
            onChange={(event) => onUpdateConfig({
              ...config,
              watermark: {
                ...(config.watermark ?? { enabled: true, text: 'CONFIDENTIAL', opacity: 0.08, rotationDeg: -45 }),
                color: event.currentTarget.value.toUpperCase(),
              },
            })}
            className="h-9 w-full cursor-pointer rounded border border-white/10 bg-slate-950"
          />
        </label>
      </div>
    </div>
  );
};
