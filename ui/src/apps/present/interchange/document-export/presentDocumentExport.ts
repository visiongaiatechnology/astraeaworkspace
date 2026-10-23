// STATUS: DIAMANT VGT SUPREME — bounded notes/handout PDF composition over canonical Present renderer
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { ensurePresentDesign } from '../../design/presentDesign';
import {
  buildPresentPdfFromJpegs,
  downloadPresentBlob,
  renderPresentSlideToJpeg,
  resolvePresentSlideSelection,
  safePresentFileName,
  type PresentSlidePixelSize,
} from '../render/presentExport';
import type { ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';

const PAGE: PresentSlidePixelSize = { width: 1240, height: 1754 };
const MAX_NOTES_CHARS = 32_768;
const MAX_SLIDES = 512;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to compose presentation document page.'));
    image.src = dataUrl;
  });
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 40): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      if (lines.length >= maxLines) break;
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length >= maxLines) break;
    if (line) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

async function notesPageJpeg(slide: PresentSlide, model: PresentDocumentModel, pageNumber: number, locale: WorkspaceLocale): Promise<string> {
  const normalized = ensurePresentDesign(model);
  const master = normalized.notesMaster!;
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.width;
  canvas.height = PAGE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable for notes export.');
  ctx.fillStyle = master.backgroundColor;
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);
  ctx.textBaseline = 'alphabetic';
  if (master.showHeader) {
    ctx.font = `600 24px ${master.fontFamily}`;
    ctx.fillStyle = master.titleColor;
    ctx.fillText(master.headerText.slice(0, 240), 72, 64);
  }
  ctx.font = `700 34px ${master.fontFamily}`;
  ctx.fillStyle = master.titleColor;
  ctx.fillText(slide.title.slice(0, 240), 72, 124);

  let notesY = 178;
  if (master.showSlideThumbnail) {
    const slideJpeg = await renderPresentSlideToJpeg(slide, model, 0.9, 1024, locale);
    const slideImage = await loadImage(slideJpeg);
    const targetW = PAGE.width - 144;
    const targetH = Math.min(620, targetW * (slideImage.height / Math.max(1, slideImage.width)));
    ctx.drawImage(slideImage, 72, 160, targetW, targetH);
    notesY = 160 + targetH + 72;
  }

  ctx.font = `${Math.max(10, Math.min(30, master.notesFontSizePt)) * 1.6}px ${master.fontFamily}`;
  ctx.fillStyle = master.bodyColor;
  const lineHeight = Math.max(28, master.notesFontSizePt * 2.2);
  const lines = wrapCanvasText(ctx, (slide.speakerNotes || '').slice(0, MAX_NOTES_CHARS), PAGE.width - 144, 36);
  for (let index = 0; index < lines.length && notesY < PAGE.height - 96; index += 1) {
    ctx.fillText(lines[index], 72, notesY);
    notesY += lineHeight;
  }
  if (master.showFooter) {
    ctx.font = `18px ${master.fontFamily}`;
    ctx.fillStyle = master.bodyColor;
    ctx.fillText(master.footerText.slice(0, 240), 72, PAGE.height - 48);
  }
  if (master.showPageNumber) {
    ctx.font = `18px ${master.fontFamily}`;
    ctx.fillStyle = master.bodyColor;
    const label = String(pageNumber);
    ctx.fillText(label, PAGE.width - 72 - ctx.measureText(label).width, PAGE.height - 48);
  }
  return canvas.toDataURL('image/jpeg', 0.94);
}

async function handoutPageJpeg(slides: readonly PresentSlide[], model: PresentDocumentModel, pageNumber: number, locale: WorkspaceLocale): Promise<string> {
  const normalized = ensurePresentDesign(model);
  const master = normalized.handoutMaster!;
  const canvas = document.createElement('canvas');
  canvas.width = master.orientation === 'portrait' ? PAGE.width : PAGE.height;
  canvas.height = master.orientation === 'portrait' ? PAGE.height : PAGE.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable for handout export.');
  ctx.fillStyle = master.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = master.textColor;
  ctx.textBaseline = 'alphabetic';
  if (master.showHeader) {
    ctx.font = `600 22px ${master.fontFamily}`;
    ctx.fillText(master.headerText.slice(0, 240), 64, 56);
  }

  const usableTop = 92;
  const usableBottom = canvas.height - 86;
  const usableHeight = usableBottom - usableTop;
  const count = Math.max(1, slides.length);
  const cols = master.slidesPerPage >= 4 ? 2 : 1;
  const rows = Math.ceil(count / cols);
  const cellW = (canvas.width - 128 - (cols - 1) * 36) / cols;
  const cellH = (usableHeight - (rows - 1) * 34) / rows;

  for (let index = 0; index < slides.length; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = 64 + col * (cellW + 36);
    const y = usableTop + row * (cellH + 34);
    const jpeg = await renderPresentSlideToJpeg(slides[index], model, 0.86, 960, locale);
    const image = await loadImage(jpeg);
    const notesAllowance = master.includeNotesLines ? Math.min(80, cellH * 0.24) : 0;
    const maxImageH = Math.max(80, cellH - notesAllowance - 32);
    const scale = Math.min(cellW / image.width, maxImageH / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    ctx.drawImage(image, x, y + 20, drawW, drawH);
    ctx.font = `600 16px ${master.fontFamily}`;
    ctx.fillStyle = master.textColor;
    ctx.fillText(`${index + 1}. ${slides[index].title}`.slice(0, 100), x, y + 14);
    if (master.includeNotesLines) {
      ctx.strokeStyle = 'rgba(100,116,139,0.45)';
      const startY = y + cellH - notesAllowance + 10;
      for (let line = 0; line < 3; line += 1) {
        const lineY = startY + line * 20;
        ctx.beginPath();
        ctx.moveTo(x, lineY);
        ctx.lineTo(x + cellW, lineY);
        ctx.stroke();
      }
    }
  }

  if (master.showFooter) {
    ctx.font = `18px ${master.fontFamily}`;
    ctx.fillStyle = master.textColor;
    ctx.fillText(master.footerText.slice(0, 240), 64, canvas.height - 38);
  }
  if (master.showPageNumber) {
    ctx.font = `18px ${master.fontFamily}`;
    ctx.fillStyle = master.textColor;
    const label = String(pageNumber);
    ctx.fillText(label, canvas.width - 64 - ctx.measureText(label).width, canvas.height - 38);
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function downloadPresentNotesPdf(title: string, model: PresentDocumentModel, slideIds?: readonly string[], locale: WorkspaceLocale = 'en-US'): Promise<ExportDeliveryResult> {
  const selected = resolvePresentSlideSelection(model, slideIds).slice(0, MAX_SLIDES);
  if (!selected.length) throw new Error('No slides selected for notes export.');
  const pages: string[] = [];
  for (let index = 0; index < selected.length; index += 1) pages.push(await notesPageJpeg(selected[index], model, index + 1, locale));
  return downloadPresentBlob(new Blob([buildPresentPdfFromJpegs(`${title} — Speaker Notes`, pages, PAGE) as unknown as BlobPart], { type: 'application/pdf' }), `${safePresentFileName(title)}_notes.pdf`);
}

export async function downloadPresentHandoutPdf(title: string, model: PresentDocumentModel, slideIds?: readonly string[], locale: WorkspaceLocale = 'en-US'): Promise<ExportDeliveryResult> {
  const normalized = ensurePresentDesign(model);
  const selected = resolvePresentSlideSelection(normalized, slideIds).slice(0, MAX_SLIDES);
  if (!selected.length) throw new Error('No slides selected for handout export.');
  const perPage = normalized.handoutMaster!.slidesPerPage;
  const pages: string[] = [];
  for (let index = 0; index < selected.length; index += perPage) pages.push(await handoutPageJpeg(selected.slice(index, index + perPage), normalized, pages.length + 1, locale));
  const size = normalized.handoutMaster!.orientation === 'portrait' ? PAGE : { width: PAGE.height, height: PAGE.width };
  return downloadPresentBlob(new Blob([buildPresentPdfFromJpegs(`${title} — Handout`, pages, size) as unknown as BlobPart], { type: 'application/pdf' }), `${safePresentFileName(title)}_handout.pdf`);
}
