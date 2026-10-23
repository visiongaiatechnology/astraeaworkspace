// STATUS: DIAMANT VGT SUPREME — Sovereign Table of Figures (Abbildungsverzeichnis) Modal & Generator
import React from 'react';
import { X, Image as ImageIcon, BookOpen, Check } from 'lucide-react';
import type { WriterImageBlockData, Paragraph } from '../../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import { generateTableOfFigures } from '../../media/images/operations/writerMediaOperations';

interface WriterTableOfFiguresModalProps {
  isOpen: boolean;
  images: readonly WriterImageBlockData[];
  pages?: readonly WriterPaginationPage[];
  onClose: () => void;
  onInsertTableOfFigures: (paragraphs: Paragraph[]) => void;
}

export const WriterTableOfFiguresModal: React.FC<WriterTableOfFiguresModalProps> = ({
  isOpen,
  images,
  pages,
  onClose,
  onInsertTableOfFigures,
}) => {
  if (!isOpen) return null;

  const figureItems = generateTableOfFigures(images, pages);

  const handleInsert = () => {
    const newParagraphs: Paragraph[] = [
      {
        id: `tof_heading_${Date.now()}`,
        style: {
          style_name: 'heading1',
          heading_level: 1,
          alignment: 'left',
          line_height: 1.25,
          space_before: 12,
          space_after: 6,
        },
        spans: [
          {
            text: 'Abbildungsverzeichnis',
            bold: true,
            font_size_pt: 16,
          },
        ],
      },
    ];

    if (figureItems.length === 0) {
      newParagraphs.push({
        id: `tof_empty_${Date.now()}`,
        style: {
          style_name: 'normal',
          alignment: 'left',
          line_height: 1.15,
          space_before: 0,
          space_after: 4,
        },
        spans: [
          {
            text: 'Keine Abbildungen mit Beschriftung im Dokument vorhanden.',
            italic: true,
            font_size_pt: 10.5,
          },
        ],
      });
    } else {
      figureItems.forEach((item, index) => {
        const dots = '.'.repeat(Math.max(10, 60 - item.label.length - item.caption.length));
        newParagraphs.push({
          id: `tof_item_${index}_${Date.now()}`,
          style: {
            style_name: 'normal',
            alignment: 'left',
            line_height: 1.2,
            space_before: 2,
            space_after: 2,
          },
          spans: [
            {
              text: `${item.label}: `,
              bold: true,
              font_size_pt: 10.5,
            },
            {
              text: `${item.caption} `,
              font_size_pt: 10.5,
            },
            {
              text: ` ${dots} `,
              font_size_pt: 9,
              text_color: '#64748b',
            },
            {
              text: `S. ${item.pageNumber}`,
              bold: true,
              font_size_pt: 10.5,
              text_color: '#3b82f6',
            },
          ],
        });
      });
    }

    onInsertTableOfFigures(newParagraphs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Abbildungsverzeichnis einfügen</h2>
          </div>
          <button aria-label="Close Abbildungsverzeichnis einfügen dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 text-xs">
          <p className="text-slate-400 leading-relaxed">
            Erzeugt ein formatiertes, druckfähiges Abbildungsverzeichnis aller im Dokument enthaltenen Grafiken mit automatischer Nummerierung und Seitenangabe.
          </p>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
            <div className="text-[0.6875rem] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
              <span>Gefundene Abbildungen ({figureItems.length})</span>
            </div>

            {figureItems.length === 0 ? (
              <p className="text-slate-500 italic py-2">
                Es wurden noch keine Abbildungen mit Beschriftung im Dokument gefunden.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {figureItems.map((fig) => (
                  <div
                    key={fig.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-slate-300"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-bold text-blue-400 shrink-0">{fig.label}:</span>
                      <span className="truncate">{fig.caption}</span>
                    </div>
                    <span className="font-mono text-slate-500 shrink-0 ml-3">S. {fig.pageNumber}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-blue-500/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Verzeichnis einfügen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
