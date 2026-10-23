import React from 'react';
import { Presentation } from 'lucide-react';
import { WhiteboardItem } from '../types';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import { whiteboardDeepText } from '../whiteboardDeepLocale';

interface SlideExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  items: WhiteboardItem[];
  onConfirm: () => void;
}

export const SlideExportModal: React.FC<SlideExportModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  items,
  onConfirm,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message:string) => creativePersonalText(whiteboardDeepText(message, locale), locale);
  if (!isOpen) return null;
  const visibleItems = items.filter((item) => !item.hidden);
  const frames = visibleItems.filter((item) => item.type === 'frame').length;
  const visibleObjects = visibleItems.filter((item) => item.type !== 'frame' && item.type !== 'connector').length;
  const connectors = items.filter((item) => item.type === 'connector').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Export to Astraea Present')}>
      <div className="w-full max-w-lg rounded-2xl glass-dropdown border border-white/20 p-6 shadow-2xl flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-lg">
            <Presentation className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">{t('Export to Astraea Present')}</h3>
            <p className="text-xs text-slate-400">
              {t('Build a 16:9 Present deck from visible frames in the current presentation path order. Up to 256 frames and nine cards per frame are exported; hidden objects and connectors are omitted.')}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
          <div className="flex justify-between text-xs text-slate-300">
            <span>{t('Presentation title:')}</span>
            <span className="max-w-[65%] truncate font-semibold text-amber-400">{documentTitle}-Presentation</span>
          </div>
          <div className="flex justify-between text-xs text-slate-300">
            <span>{t('Visible frames:')}</span>
            <span className="font-mono text-slate-200">
              {frames}
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-300">
            <span>{t('Visible board objects:')}</span>
            <span className="font-mono text-slate-200">
              {visibleObjects}
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-300">
            <span>{t('Omitted connectors:')}</span>
            <span className="font-mono text-slate-200">
              {connectors}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/20 transition-all"
          >
            {t('Create Present Deck')}
          </button>
        </div>
      </div>
    </div>
  );
};
