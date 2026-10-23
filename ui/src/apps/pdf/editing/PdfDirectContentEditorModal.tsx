// STATUS: DIAMANT VGT SUPREME
// Structured-PDF direct content editor. Native PDFs remain preserve-only until the standards adapter is active.

import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, Link2, Plus, Shapes, Trash2, Type, X } from 'lucide-react';
import type { PdfDocumentModel, PdfLinkObject, PdfVectorObject } from '../../../shared/contracts/workspace';
import {
  deletePdfLink,
  deletePdfTextBlock,
  deletePdfVector,
  insertPdfImage,
  inspectPdfEditFidelity,
  reflowPdfText,
  updatePdfImage,
  upsertPdfLink,
  upsertPdfTextBlock,
  upsertPdfVector,
} from './pdfDirectContentEditing';
import { normalizeLocalImageFiles } from '../media/import/pdfImageImport';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pdfData: PdfDocumentModel;
  onUpdate: (next: PdfDocumentModel) => void;
  currentPage: number;
}

const inputClass = 'w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50';
const buttonClass = 'rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40';

const number = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const PdfDirectContentEditorModal: React.FC<Props> = ({ isOpen, onClose, pdfData, onUpdate, currentPage }) => {
  const { locale } = useWorkspaceLocale();
  const page = pdfData.pages.find((candidate) => candidate.pageNumber === currentPage) ?? pdfData.pages[0];
  const [sectionId, setSectionId] = useState<string>('');
  const [imageId, setImageId] = useState<string>('');
  const [vectorId, setVectorId] = useState<string>('');
  const [linkId, setLinkId] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fidelity = useMemo(() => inspectPdfEditFidelity(pdfData), [pdfData]);
  const coordinateCopyKeys = { x: 'editor.coordinateX', y: 'editor.coordinateY', width: 'editor.width', height: 'editor.height' } as const;

  if (!isOpen || !page) return null;
  const section = page.sections.find((item) => item.id === sectionId) ?? page.sections[0];
  const image = (page.images ?? []).find((item) => item.id === imageId) ?? (page.images ?? [])[0];
  const vector = (page.vectors ?? []).find((item) => item.id === vectorId) ?? (page.vectors ?? [])[0];
  const link = (page.links ?? []).find((item) => item.id === linkId) ?? (page.links ?? [])[0];

  const saveSection = (patch: Partial<NonNullable<typeof section>>) => {
    if (!section) return;
    onUpdate(upsertPdfTextBlock(pdfData, page.pageNumber, {
      id: section.id,
      type: patch.type ?? section.type,
      content: patch.content ?? section.content,
      bounds: patch.bounds ?? section.bounds,
      style: patch.style ?? section.style,
      zIndex: patch.zIndex ?? section.zIndex,
    }));
  };

  const saveVector = (patch: Partial<PdfVectorObject>) => {
    if (!vector) return;
    onUpdate(upsertPdfVector(pdfData, page.pageNumber, { ...vector, ...patch }));
  };

  const saveLink = (patch: Partial<PdfLinkObject>) => {
    if (!link) return;
    onUpdate(upsertPdfLink(pdfData, page.pageNumber, { ...link, ...patch } as PdfLinkObject));
  };

  const addText = () => {
    const id = `text-${Date.now()}`;
    onUpdate(upsertPdfTextBlock(pdfData, page.pageNumber, {
      id,
      type: 'paragraph',
      content: 'New text block',
      bounds: { x: 54, y: 620, width: 300, height: 80 },
      style: { requestedFont: 'Helvetica', fontSize: 11, lineHeight: 1.35, color: '#111827' },
      zIndex: 0,
    }));
    setSectionId(id);
  };

  const addVector = () => {
    const id = `vector-${Date.now()}`;
    onUpdate(upsertPdfVector(pdfData, page.pageNumber, {
      id,
      type: 'rectangle',
      bounds: { x: 80, y: 500, width: 160, height: 80 },
      strokeColor: '#0f172a',
      fillColor: '#dbeafe',
      lineWidth: 1,
      zIndex: -1,
    }));
    setVectorId(id);
  };

  const addLink = () => {
    const id = `link-${Date.now()}`;
    onUpdate(upsertPdfLink(pdfData, page.pageNumber, {
      id,
      bounds: { x: 54, y: 54, width: 180, height: 24 },
      target: { kind: 'url', url: 'https://example.com/' },
    }));
    setLinkId(id);
  };

  const importImage = async (file: File, replace: boolean) => {
    const [normalized] = await normalizeLocalImageFiles([file]);
    if (!normalized) return;
    if (replace && image) {
      onUpdate(updatePdfImage(pdfData, page.pageNumber, image.id, {
        dataUrl: normalized.dataUrl,
        widthPx: normalized.widthPx,
        heightPx: normalized.heightPx,
        altText: normalized.altText,
      }));
      return;
    }
    const id = `image-${Date.now()}`;
    onUpdate(insertPdfImage(pdfData, page.pageNumber, {
      id,
      dataUrl: normalized.dataUrl,
      widthPx: normalized.widthPx,
      heightPx: normalized.heightPx,
      bounds: { x: 300, y: 500, width: 200, height: 160 },
      altText: normalized.altText,
      rotation: 0,
      zIndex: 0,
    }));
    setImageId(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5" role="dialog" aria-modal="true" aria-labelledby="pdf-direct-editor-title">
      <div className="vgt-dialog-scroll-surface flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div id="pdf-direct-editor-title" className="text-sm font-bold text-white">{pdfWorkflowText(locale, 'editor.pageTitle', { page: page.pageNumber })}</div>
            <div className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'editor.intro')}</div>
          </div>
          <button aria-label={pdfWorkflowText(locale, 'editor.close')} type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-2">
          <section className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold"><Type className="h-4 w-4 text-cyan-400"/>{pdfWorkflowText(locale, 'editor.textBlocks')}</div><button type="button" onClick={addText} className={buttonClass}><Plus className="mr-1 inline h-3 w-3"/>{pdfWorkflowText(locale, 'editor.addText')}</button></div>
            <select aria-label={pdfWorkflowText(locale, 'editor.sectionSelector')} className={inputClass} value={section?.id ?? ''} onChange={(event) => setSectionId(event.target.value)}>{page.sections.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.content.slice(0, 48)}</option>)}</select>
            {section && <>
              <textarea aria-label={pdfWorkflowText(locale, 'editor.textBlocks')} className={`${inputClass} min-h-24`} value={section.content} onChange={(event) => saveSection({ content: event.target.value })}/>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'editor.requestedFont')}<input aria-label={pdfWorkflowText(locale, 'editor.requestedFont')} className={inputClass} value={section.style?.requestedFont ?? 'Helvetica'} onChange={(event) => saveSection({ style: { ...section.style, requestedFont: event.target.value } })}/></label>
                <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'editor.fontSize')}<input aria-label={pdfWorkflowText(locale, 'editor.fontSize')} className={inputClass} type="number" min={4} max={144} value={section.style?.fontSize ?? 10} onChange={(event) => saveSection({ style: { ...section.style, fontSize: number(event.target.value, 10) } })}/></label>
                {(['x','y','width','height'] as const).map((key) => <label key={key} className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, coordinateCopyKeys[key])}<input aria-label={pdfWorkflowText(locale, coordinateCopyKeys[key])} className={inputClass} type="number" value={section.bounds?.[key] ?? ({x:54,y:500,width:300,height:80}[key])} onChange={(event) => saveSection({ bounds: { ...(section.bounds ?? { x:54,y:500,width:300,height:80 }), [key]: number(event.target.value, 0) } })}/></label>)}
              </div>
              <div className="rounded border border-white/10 bg-slate-950/80 p-2 text-[0.625rem] text-slate-400"><span>{pdfWorkflowText(locale, 'editor.metricPreview')}: </span>{reflowPdfText(section.content, section.bounds?.width ?? 300, section.style).slice(0, 3).join(' / ')}</div>
              <button type="button" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" onClick={() => onUpdate(deletePdfTextBlock(pdfData, page.pageNumber, section.id))}><Trash2 className="mr-1 inline h-3 w-3"/>{pdfWorkflowText(locale, 'editor.deleteBlock')}</button>
            </>}
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold"><ImagePlus className="h-4 w-4 text-cyan-400"/>{pdfWorkflowText(locale, 'editor.images')}</div><button type="button" onClick={() => fileRef.current?.click()} className={buttonClass}>{pdfWorkflowText(locale, 'editor.addImage')}</button></div>
            <input aria-label={pdfWorkflowText(locale, 'editor.addImage')} ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImage(file, false).catch(() => window.alert(pdfWorkflowText(locale, 'editor.error.imageImport'))); event.currentTarget.value=''; }}/>
            <select aria-label={pdfWorkflowText(locale, 'editor.imageSelector')} className={inputClass} value={image?.id ?? ''} onChange={(event) => setImageId(event.target.value)}>{(page.images ?? []).map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select>
            {image && <>
              <div className="grid grid-cols-2 gap-2">
                {(['x','y','width','height'] as const).map((key) => <label key={key} className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, coordinateCopyKeys[key])}<input aria-label={pdfWorkflowText(locale, coordinateCopyKeys[key])} className={inputClass} type="number" value={image.bounds[key]} onChange={(event) => onUpdate(updatePdfImage(pdfData, page.pageNumber, image.id, { bounds: { ...image.bounds, [key]: number(event.target.value, image.bounds[key]) } }))}/></label>)}
                <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'editor.rotation')}<select aria-label={pdfWorkflowText(locale, 'editor.rotation')} className={inputClass} value={image.rotation ?? 0} onChange={(event) => onUpdate(updatePdfImage(pdfData, page.pageNumber, image.id, { rotation: Number(event.target.value) as 0|90|180|270 }))}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
                <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'editor.zIndex')}<input aria-label={pdfWorkflowText(locale, 'editor.zIndex')} className={inputClass} type="number" value={image.zIndex ?? 0} onChange={(event) => onUpdate(updatePdfImage(pdfData, page.pageNumber, image.id, { zIndex: number(event.target.value, 0) }))}/></label>
              </div>
              <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'editor.altText')}<input aria-label={pdfWorkflowText(locale, 'editor.altText')} className={inputClass} value={image.altText ?? ''} onChange={(event) => onUpdate(updatePdfImage(pdfData, page.pageNumber, image.id, { altText: event.target.value }))}/></label>
              <div className="grid grid-cols-4 gap-2">{(['left','top','right','bottom'] as const).map((key) => <label key={key} className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, `editor.crop${key[0].toUpperCase()}${key.slice(1)}` as 'editor.cropLeft' | 'editor.cropTop' | 'editor.cropRight' | 'editor.cropBottom')}<input aria-label={pdfWorkflowText(locale, `editor.crop${key[0].toUpperCase()}${key.slice(1)}` as 'editor.cropLeft' | 'editor.cropTop' | 'editor.cropRight' | 'editor.cropBottom')} className={inputClass} type="number" min={0} max={0.99} step={0.01} value={image.crop?.[key] ?? 0} onChange={(event) => onUpdate(updatePdfImage(pdfData, page.pageNumber, image.id, { crop: { ...(image.crop ?? {left:0,top:0,right:0,bottom:0}), [key]: number(event.target.value, 0) } }))}/></label>)}</div>
              <button type="button" className={buttonClass} onClick={() => { const input=document.createElement('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp'; input.onchange=()=>{const file=input.files?.[0]; if(file) void importImage(file,true).catch(()=>window.alert(pdfWorkflowText(locale, 'editor.error.imageReplace')));}; input.click(); }}>{pdfWorkflowText(locale, 'editor.replaceImage')}</button>
            </>}
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold"><Shapes className="h-4 w-4 text-violet-400"/>{pdfWorkflowText(locale, 'editor.vectors')}</div><button type="button" onClick={addVector} className={buttonClass}><Plus className="mr-1 inline h-3 w-3"/>{pdfWorkflowText(locale, 'editor.addShape')}</button></div>
            <select aria-label={pdfWorkflowText(locale, 'editor.vectorSelector')} className={inputClass} value={vector?.id ?? ''} onChange={(event) => setVectorId(event.target.value)}>{(page.vectors ?? []).map((item) => <option key={item.id} value={item.id}>{item.id} · {pdfWorkflowText(locale, `editor.vector.${item.type}` as 'editor.vector.rectangle' | 'editor.vector.ellipse' | 'editor.vector.line')}</option>)}</select>
            {vector && <>
              <div className="grid grid-cols-2 gap-2"><select aria-label={pdfWorkflowText(locale, 'editor.vectorSelector')} className={inputClass} value={vector.type} onChange={(event) => saveVector({ type: event.target.value as PdfVectorObject['type'] })}><option value="rectangle">{pdfWorkflowText(locale, 'editor.vector.rectangle')}</option><option value="ellipse">{pdfWorkflowText(locale, 'editor.vector.ellipse')}</option><option value="line">{pdfWorkflowText(locale, 'editor.vector.line')}</option></select><input aria-label={pdfWorkflowText(locale, 'editor.zIndex')} className={inputClass} type="number" value={vector.zIndex ?? 0} onChange={(event) => saveVector({ zIndex: number(event.target.value,0) })}/>{(['x','y','width','height'] as const).map((key)=><input key={key} aria-label={pdfWorkflowText(locale, coordinateCopyKeys[key])} className={inputClass} type="number" value={vector.bounds[key]} onChange={(event)=>saveVector({bounds:{...vector.bounds,[key]:number(event.target.value,vector.bounds[key])}})}/>)}</div>
              <div className="grid grid-cols-3 gap-2"><input aria-label={pdfWorkflowText(locale, 'editor.strokeColor')} className={inputClass} type="color" value={vector.strokeColor} onChange={(event)=>saveVector({strokeColor:event.target.value})}/><input aria-label={pdfWorkflowText(locale, 'editor.fillColor')} className={inputClass} type="color" value={vector.fillColor ?? '#ffffff'} onChange={(event)=>saveVector({fillColor:event.target.value})}/><input aria-label={pdfWorkflowText(locale, 'editor.lineWidth')} className={inputClass} type="number" min={0.1} max={50} step={0.1} value={vector.lineWidth ?? 1} onChange={(event)=>saveVector({lineWidth:number(event.target.value,1)})}/></div>
              <button type="button" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" onClick={() => onUpdate(deletePdfVector(pdfData,page.pageNumber,vector.id))}><Trash2 className="mr-1 inline h-3 w-3"/>{pdfWorkflowText(locale, 'editor.deleteShape')}</button>
            </>}
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold"><Link2 className="h-4 w-4 text-emerald-400"/>{pdfWorkflowText(locale, 'editor.links')}</div><button type="button" onClick={addLink} className={buttonClass}><Plus className="mr-1 inline h-3 w-3"/>{pdfWorkflowText(locale, 'editor.addLink')}</button></div>
            <select aria-label={pdfWorkflowText(locale, 'editor.linkSelector')} className={inputClass} value={link?.id ?? ''} onChange={(event) => setLinkId(event.target.value)}>{(page.links ?? []).map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select>
            {link && <>
              <select aria-label={pdfWorkflowText(locale, 'editor.linkSelector')} className={inputClass} value={link.target.kind} onChange={(event) => saveLink({ target: event.target.value === 'page' ? {kind:'page',pageNumber:1} : {kind:'url',url:'https://example.com/'} })}><option value="url">{pdfWorkflowText(locale, 'editor.link.http')}</option><option value="page">{pdfWorkflowText(locale, 'editor.link.page')}</option></select>
              {link.target.kind === 'url' ? <input aria-label={pdfWorkflowText(locale, 'editor.link.http')} className={inputClass} value={link.target.url} onChange={(event)=>saveLink({target:{kind:'url',url:event.target.value}})}/> : <input aria-label={pdfWorkflowText(locale, 'editor.link.page')} className={inputClass} type="number" min={1} max={pdfData.pages.length} value={link.target.pageNumber} onChange={(event)=>saveLink({target:{kind:'page',pageNumber:number(event.target.value,1)}})}/>}
              <div className="grid grid-cols-4 gap-2">{(['x','y','width','height'] as const).map((key)=><input key={key} aria-label={pdfWorkflowText(locale, coordinateCopyKeys[key])} className={inputClass} type="number" value={link.bounds[key]} onChange={(event)=>saveLink({bounds:{...link.bounds,[key]:number(event.target.value,link.bounds[key])}})}/>)}</div>
              <button type="button" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" onClick={() => onUpdate(deletePdfLink(pdfData,page.pageNumber,link.id))}><Trash2 className="mr-1 inline h-3 w-3"/>{pdfWorkflowText(locale, 'editor.deleteLink')}</button>
            </>}
          </section>
        </div>

        <div className="border-t border-white/10 px-5 py-3 text-[0.6875rem] text-slate-400">
          {fidelity.exactStructuredEditing
            ? <div className="text-emerald-300">{pdfWorkflowText(locale, 'editor.fidelity.exact')}{fidelity.fontSubstitutions.length > 0 ? ` ${pdfWorkflowText(locale, 'editor.fidelity.fontSubstitutions', { count: fidelity.fontSubstitutions.length })}` : ''}</div>
            : <div className="text-amber-300" role="status">{pdfWorkflowText(locale, 'editor.fidelity.warning')}</div>}
        </div>
      </div>
    </div>
  );
};
