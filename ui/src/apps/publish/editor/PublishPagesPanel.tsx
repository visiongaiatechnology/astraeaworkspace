// STATUS: PLATIN — Astraea Publish: Seitenminiaturen, Reihenfolge, Duplizieren
//
// Befund vor dieser Datei (gemessen, Runde Publish-8): Die Toolbar konnte Seiten **anhaengen** und
// durchblaettern. Es gab keine Uebersicht, kein Duplizieren, kein Loeschen und vor allem **keine Umordnung** —
// „Seiten anlegen, duplizieren und sortieren, Story-Anker bleiben erhalten" war damit nicht ausfuehrbar.
// `removePublishPage` hat es vorher gar nicht gegeben.
//
// Diese Leiste ist der sichtbare Einstieg fuer alle Seitenbefehle. Jeder Befehl geht durch die kanonischen
// Funktionen im Dokumentmodell (Eigentum `page.frameIds`, Reihenfolge, Verkettungsreparatur).
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { publishWorkspaceFormat, publishWorkspaceText } from '../publishWorkspaceLocale';
import type { PublishDocumentModel } from '../contracts/types';
import {
  addPublishPage, duplicatePublishPage, movePublishPage, pageLabel, removePublishPage, setActivePublishPage,
} from '../model/publishDocumentEngine';

export interface PublishPagesPanelProps {
  model: PublishDocumentModel;
  onUpdateModel: (updater: (prev: PublishDocumentModel) => PublishDocumentModel) => void;
  /** Der Seitenbefehl wird als Absicht gemeldet, damit ein Test ihn ohne DOM pruefen kann. */
  onCommand?: (command: PublishPageCommand) => void;
}

export type PublishPageCommand =
  | { kind: 'select'; index: number }
  | { kind: 'add'; index: number }
  | { kind: 'duplicate'; index: number }
  | { kind: 'remove'; index: number }
  | { kind: 'move'; from: number; to: number };

export const PublishPagesPanel: React.FC<PublishPagesPanelProps> = ({ model, onUpdateModel, onCommand }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof publishWorkspaceText>[0]) => publishWorkspaceText(message, locale);
  const format = (message: Parameters<typeof publishWorkspaceFormat>[0], values: Record<string, string | number>) => publishWorkspaceFormat(message, locale, values);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const emit = (command: PublishPageCommand, run: () => void): void => { onCommand?.(command); run(); };

  return (
    <aside aria-label={t('pagesPanel')} data-publish-pages-panel="true" className="w-40 shrink-0 border-r border-purple-500/20 bg-[#0a0713] overflow-y-auto">
      <div className="h-10 px-3 flex items-center justify-between border-b border-purple-500/20 text-[0.6875rem] font-semibold uppercase tracking-wider text-purple-300">
        <span>{t('pagesPanel')}</span>
        <span className="font-mono text-slate-500">{model.pagesCount}</span>
      </div>
      <ol className="p-2 space-y-2" data-publish-page-count={model.pagesCount}>
        {model.pages.map((page, index) => {
          const isActive = index === model.activePageIndex;
          const frameCount = model.frames.filter(frame => frame.pageId === page.id).length;
          const label = pageLabel(model, page.id);
          const aspect = page.geometry.heightMm / page.geometry.widthMm;
          const thumbnailWidth = 112;
          return (
            <li
              key={page.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => { event.preventDefault(); setDropIndex(index); }}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragIndex;
                setDragIndex(null); setDropIndex(null);
                if (from === null || from === index) return;
                emit({ kind: 'move', from, to: index }, () => onUpdateModel(prev => movePageIntent(prev, from, index)));
              }}
              onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
              className={`rounded-lg border transition-colors ${isActive ? 'border-purple-400/70 bg-purple-900/30' : 'border-purple-500/20 bg-[#0c0817]'} ${dropIndex === index && dragIndex !== null && dragIndex !== index ? 'ring-1 ring-purple-400' : ''}`}
            >
              <button
                type="button"
                onClick={() => emit({ kind: 'select', index }, () => onUpdateModel(prev => selectPageIntent(prev, index)))}
                aria-current={isActive ? 'page' : undefined}
                aria-label={format('pageThumbnail', { number: index + 1 })}
                className="w-full text-left p-2 space-y-1.5"
              >
                <span
                  aria-hidden="true"
                  data-publish-page-thumbnail={page.id}
                  className="block rounded-sm border border-slate-300/60 bg-white"
                  style={{ width: `${thumbnailWidth}px`, height: `${Math.round(thumbnailWidth * aspect)}px` }}
                />
                <span className="flex items-center justify-between text-[0.625rem]">
                  <span className={isActive ? 'text-purple-200 font-semibold' : 'text-slate-300'}>{label}</span>
                  <span className="font-mono text-slate-500">{frameCount === 0 ? t('emptyPage') : format('frameCount', { count: frameCount })}</span>
                </span>
                {isActive && <span className="sr-only">{t('currentPage')}</span>}
              </button>
              <div className="flex items-center justify-between px-1 pb-1">
                <button type="button" aria-label={t('addPage')} title={t('addPage')} onClick={() => emit({ kind: 'add', index }, () => onUpdateModel(prev => addPageIntent(prev, index)))}
                  className="p-1 rounded text-slate-400 hover:text-purple-200 hover:bg-purple-900/40"><Plus className="w-3 h-3" /></button>
                <button type="button" aria-label={t('duplicatePage')} title={t('duplicatePage')} onClick={() => emit({ kind: 'duplicate', index }, () => onUpdateModel(prev => duplicatePageIntent(prev, index)))}
                  className="p-1 rounded text-slate-400 hover:text-purple-200 hover:bg-purple-900/40"><Copy className="w-3 h-3" /></button>
                <button type="button" aria-label={t('movePageUp')} title={t('movePageUp')} disabled={index === 0}
                  onClick={() => emit({ kind: 'move', from: index, to: index - 1 }, () => onUpdateModel(prev => movePageIntent(prev, index, index - 1)))}
                  className="p-1 rounded text-slate-400 hover:text-purple-200 hover:bg-purple-900/40 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                <button type="button" aria-label={t('movePageDown')} title={t('movePageDown')} disabled={index === model.pagesCount - 1}
                  onClick={() => emit({ kind: 'move', from: index, to: index + 1 }, () => onUpdateModel(prev => movePageIntent(prev, index, index + 1)))}
                  className="p-1 rounded text-slate-400 hover:text-purple-200 hover:bg-purple-900/40 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                <button type="button" aria-label={t('removePage')} title={t('removePage')} disabled={model.pagesCount <= 1}
                  onClick={() => emit({ kind: 'remove', index }, () => onUpdateModel(prev => removePageIntent(prev, index)))}
                  className="p-1 rounded text-rose-400 hover:text-rose-200 hover:bg-rose-900/30 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
};

/**
 * Die Seitenbefehle als reine Funktionen.
 *
 * Sie sind duenne Weiterleitungen auf das Dokumentmodell — **keine** eigene Logik. Die Regeln
 * (Eigentum `page.frameIds`, Reihenfolge, Verkettungsreparatur) stehen ausschliesslich dort.
 */
function selectPageIntent(model: PublishDocumentModel, index: number): PublishDocumentModel {
  return setActivePublishPage(model, index);
}
function addPageIntent(model: PublishDocumentModel, index: number): PublishDocumentModel {
  return addPublishPage(model, model.pages[index]?.geometry ?? model.geometry, index);
}
function duplicatePageIntent(model: PublishDocumentModel, index: number): PublishDocumentModel {
  return duplicatePublishPage(model, index);
}
function removePageIntent(model: PublishDocumentModel, index: number): PublishDocumentModel {
  return removePublishPage(model, index);
}
function movePageIntent(model: PublishDocumentModel, from: number, to: number): PublishDocumentModel {
  return movePublishPage(model, from, to);
}
