import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: PLATIN
// Local-only object/media insertion with bounded formats and document-scoped async commits.

import { useCallback, useLayoutEffect, useRef } from 'react';
import type { DragEvent, RefObject } from 'react';
import type { WhiteboardInteractionTool, WhiteboardItem } from '../types';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardObjectsTemplate, whiteboardObjectsText } from '../whiteboardObjectsLocale';
import { whiteboardDeepText } from '../whiteboardDeepLocale';
import { importPdfPagesAsWhiteboardItems } from '../interchange/whiteboardExportImportEngine';
import {
  planWhiteboardDrop,
  type WhiteboardDropEntry,
  type WhiteboardDropPlan,
} from './whiteboardDropPolicy';
import {
  createDefaultWhiteboardRichObject,
  sanitizeWhiteboardSvgSource,
  validateEmbeddedMediaSignature,
  validateRasterImageSignature,
  isWhiteboardRasterImageWithinDecodeBudget,
  readWhiteboardRasterImageDimensions,
  WHITEBOARD_IMAGE_HEADER_SCAN_MAX_BYTES,
  WHITEBOARD_IMAGE_MAX_BYTES,
  WHITEBOARD_SVG_MAX_BYTES,
  WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES,
  type WhiteboardRichObjectType,
} from '../model/whiteboardObjectEngine';
import {
  activateWhiteboardObjectInsertionSession,
  captureWhiteboardObjectInsertionToken,
  commitWhiteboardObjectInsertionIfCurrent,
  createWhiteboardObjectInsertionSession,
  invalidateWhiteboardObjectInsertionSession,
  isCurrentWhiteboardObjectInsertionToken,
  type WhiteboardObjectInsertionSession,
  type WhiteboardObjectInsertionToken,
} from './whiteboardObjectInsertionScope';

interface Options {
  documentId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  screenToCanvasCoords: (x: number, y: number) => { x: number; y: number };
  updateItems: (next: WhiteboardItem[] | ((previous: WhiteboardItem[]) => WhiteboardItem[])) => boolean;
  setSelectedItemId: (id: string | null) => void;
  setActiveTool: (tool: WhiteboardInteractionTool) => void;
  showToast: (message: string) => void;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('decode_failed'));
    image.src = url;
  });
}

function isCurrentInsertion(
  session: WhiteboardObjectInsertionSession,
  token: WhiteboardObjectInsertionToken,
): boolean {
  return isCurrentWhiteboardObjectInsertionToken(session, token);
}

/** Human-readable reason for a rejected drop, localized through the shared object copy table. */
function whiteboardDropReasonText(
  plan: Extract<WhiteboardDropPlan, { ok: false }>,
  locale: Parameters<typeof whiteboardObjectsTemplate>[1],
): string {
  switch (plan.reason) {
    case 'too-many-files':
      return whiteboardObjectsTemplate('dropTooManyFiles', locale, { count: plan.detail });
    case 'unsupported-file':
      return whiteboardObjectsTemplate('dropUnsupportedFile', locale, { name: plan.detail });
    case 'empty-file':
      return whiteboardObjectsTemplate('dropEmptyFile', locale, { name: plan.detail });
    case 'file-too-large':
      return whiteboardObjectsTemplate('dropFileTooLarge', locale, { name: plan.detail });
    case 'total-too-large':
      return whiteboardObjectsText('dropTotalBytes', locale);
    default:
      return whiteboardObjectsText('dropTarget', locale);
  }
}

export function useWhiteboardObjectInsertion(options: Options) {
  const { locale } = useWorkspaceLocale();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<WhiteboardObjectInsertionSession | null>(null);
  if (!sessionRef.current) sessionRef.current = createWhiteboardObjectInsertionSession(options.documentId);
  const session = sessionRef.current;

  useLayoutEffect(() => {
    activateWhiteboardObjectInsertionSession(session, options.documentId);
    return () => invalidateWhiteboardObjectInsertionSession(session);
  }, [options.documentId, session]);

  const center = useCallback(() => {
    const rect = options.containerRef.current?.getBoundingClientRect();
    return rect
      ? options.screenToCanvasCoords(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: 0, y: 0 };
  }, [options.containerRef, options.screenToCanvasCoords]);

  const insertRichObject = useCallback((type: WhiteboardRichObjectType): string | null => {
    const token = captureWhiteboardObjectInsertionToken(session, options.documentId);
    if (!token) return null;
    const point = center();
    const item = createDefaultWhiteboardRichObject(type, point.x - 130, point.y - 75);
    const committed = commitWhiteboardObjectInsertionIfCurrent(session, token, () =>
      options.updateItems((previous) => [...previous, item]),
    );
    if (!committed) return null;
    options.setSelectedItemId(item.id);
    options.setActiveTool('select');
    options.showToast(`Inserted ${type} object.`);
    return item.id;
  }, [center, options.documentId, options.setActiveTool, options.setSelectedItemId, options.showToast, options.updateItems, session]);

  const importImageFile = useCallback(async (file: File, clientX?: number, clientY?: number): Promise<boolean> => {
    const token = captureWhiteboardObjectInsertionToken(session, options.documentId);
    if (!token) return false;
    const isCurrent = () => isCurrentInsertion(session, token);
    try {
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      if ((!isSvg && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) || file.size <= 0 || file.size > (isSvg ? WHITEBOARD_SVG_MAX_BYTES : WHITEBOARD_IMAGE_MAX_BYTES)) {
        throw new Error('unsupported');
      }

      let imageSource: Blob;
      if (isSvg) {
        const source = await file.text();
        if (!isCurrent()) return false;
        const safeSource = sanitizeWhiteboardSvgSource(source);
        if (!safeSource) throw new Error('unsafe_svg');
        imageSource = new Blob([safeSource], { type: 'image/svg+xml' });
      } else {
        const [headerBuffer, trailerBuffer] = await Promise.all([
          file.slice(0, file.type === 'image/jpeg' ? Math.min(file.size, WHITEBOARD_IMAGE_HEADER_SCAN_MAX_BYTES) : file.type === 'image/png' ? 24 : 30).arrayBuffer(),
          file.type === 'image/jpeg' ? file.slice(-2).arrayBuffer() : Promise.resolve(new ArrayBuffer(0)),
        ]);
        if (!isCurrent()) return false;
        const header = new Uint8Array(headerBuffer);
        if (!validateRasterImageSignature(header, file.type, file.size, new Uint8Array(trailerBuffer))) throw new Error('signature');
        const dimensions = readWhiteboardRasterImageDimensions(header, file.type);
        if (!dimensions || !isWhiteboardRasterImageWithinDecodeBudget(dimensions)) throw new Error('dimensions');
        imageSource = file;
      }

      const url = URL.createObjectURL(imageSource);
      let image: HTMLImageElement;
      try {
        image = await loadImage(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (!isCurrent()) return false;
      if (!isWhiteboardRasterImageWithinDecodeBudget({ width: image.naturalWidth, height: image.naturalHeight })) {
        throw new Error('dimensions');
      }

      const displayScale = Math.min(420 / image.naturalWidth, 320 / image.naturalHeight, 1);
      const width = Math.max(80, Math.round(image.naturalWidth * displayScale));
      const height = Math.max(60, Math.round(image.naturalHeight * displayScale));
      const rasterScale = Math.min(1, 4096 / image.naturalWidth, 4096 / image.naturalHeight);
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * rasterScale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * rasterScale));
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('canvas');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const coords = clientX !== undefined && clientY !== undefined
        ? options.screenToCanvasCoords(clientX, clientY)
        : center();
      const item: WhiteboardItem = {
        id: secureRandomId('image'),
        type: 'image',
        x: Math.round(coords.x - width / 2),
        y: Math.round(coords.y - height / 2),
        width,
        height,
        text: '',
        name: file.name,
        dataUrl,
      };
      const committed = commitWhiteboardObjectInsertionIfCurrent(session, token, () =>
        options.updateItems((previous) => [...previous, item]),
      );
      if (!committed) return false;
      options.setSelectedItemId(item.id);
      options.setActiveTool('select');
      options.showToast(`Inserted ${isSvg ? 'sanitized SVG as local PNG' : 'validated image'}: ${file.name}`);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const code = error instanceof Error ? error.message : 'invalid';
      options.showToast(code === 'unsafe_svg'
        ? 'SVG rejected by the local active-content policy.'
        : 'Image rejected: unsupported, invalid signature, unsafe, or too large.');
      return false;
    }
  }, [center, options.documentId, options.screenToCanvasCoords, options.setActiveTool, options.setSelectedItemId, options.showToast, options.updateItems, session]);

  const importMediaFile = useCallback(async (file: File): Promise<boolean> => {
    const token = captureWhiteboardObjectInsertionToken(session, options.documentId);
    if (!token) return false;
    const isCurrent = () => isCurrentInsertion(session, token);
    try {
      const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm'];
      if (!allowed.includes(file.type) || file.size <= 0 || file.size > WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES) throw new Error('mime');
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!isCurrent()) return false;
      if (!validateEmbeddedMediaSignature(bytes, file.type, file.size)) throw new Error('signature');
      const dataUrl = await fileToDataUrl(file);
      if (!isCurrent()) return false;
      const point = center();
      const item = createDefaultWhiteboardRichObject('media', point.x - 180, point.y - 110);
      const mediaKind = file.type.startsWith('video/') ? 'video' : 'audio';
      item.media = { mediaKind, mime: file.type, name: file.name, dataUrl };
      item.text = file.name;
      const committed = commitWhiteboardObjectInsertionIfCurrent(session, token, () =>
        options.updateItems((previous) => [...previous, item]),
      );
      if (!committed) return false;
      options.setSelectedItemId(item.id);
      options.setActiveTool('select');
      options.showToast(`Inserted validated local ${mediaKind}: ${file.name}`);
      return true;
    } catch {
      if (!isCurrent()) return false;
      options.showToast('Media rejected: use valid local MP3/WAV/OGG/MP4/WebM within the size limit.');
      return false;
    }
  }, [center, options.documentId, options.setActiveTool, options.setSelectedItemId, options.showToast, options.updateItems, session]);

  const insertDroppedEntry = useCallback(async (
    entry: WhiteboardDropEntry,
    file: File,
    point: { x: number; y: number },
    clientX?: number,
    clientY?: number,
  ): Promise<boolean> => {
    if (entry.classification === 'media') return importMediaFile(file);
    if (entry.classification === 'pdf') {
      const token = captureWhiteboardObjectInsertionToken(session, options.documentId);
      if (!token) return false;
      try {
        const pages = await importPdfPagesAsWhiteboardItems(file, Math.round(point.x), Math.round(point.y));
        if (!isCurrentInsertion(session, token)) return false;
        // Reuse the single PDF flattening path; Whiteboard never rasterises PDF pages itself.
        const committed = commitWhiteboardObjectInsertionIfCurrent(session, token, () =>
          options.updateItems((previous) => [...previous, ...pages]),
        );
        if (!committed) return false;
        options.showToast(whiteboardDeepText(`Imported ${pages.length} local PDF page(s) as images: ${entry.name}`, locale));
        return true;
      } catch {
        if (isCurrentInsertion(session, token)) {
          options.showToast(whiteboardObjectsTemplate('dropPdfFailed', locale, { name: entry.name }));
        }
        return false;
      }
    }
    return clientX !== undefined && clientY !== undefined
      ? importImageFile(file, clientX, clientY)
      : importImageFile(file);
  }, [importImageFile, importMediaFile, locale, options, session]);

  /**
   * Accepts or rejects an entire drop. Every file is validated before a single object is inserted, so
   * a rejected drop can never leave a half-imported board behind.
   */
  const importDroppedFiles = useCallback(async (
    files: FileList | readonly File[],
    clientX?: number,
    clientY?: number,
  ): Promise<{ ok: boolean; plan: WhiteboardDropPlan; inserted: number }> => {
    const list = Array.from(files ?? []);
    const plan = planWhiteboardDrop(list.map((file) => ({ name: file.name, type: file.type, size: file.size })));
    if (!plan.ok) {
      options.showToast(whiteboardObjectsTemplate('dropRejected', locale, { reason: whiteboardDropReasonText(plan, locale) }));
      return { ok: false, plan, inserted: 0 };
    }
    const point = clientX !== undefined && clientY !== undefined
      ? options.screenToCanvasCoords(clientX, clientY)
      : center();
    let inserted = 0;
    for (const entry of plan.entries) {
      const file = list[entry.index];
      if (!file) continue;
      const accepted = await insertDroppedEntry(entry, file, point, clientX, clientY);
      if (accepted) inserted += 1;
    }
    if (inserted > 0) {
      options.setSelectedItemId(null);
      options.setActiveTool('select');
      options.showToast(whiteboardDeepText(`Inserted ${inserted} of ${plan.entries.length} dropped file(s).`, locale));
    }
    return { ok: inserted > 0, plan, inserted };
  }, [center, insertDroppedEntry, locale, options]);

  const handleCanvasDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void importDroppedFiles(event.dataTransfer.files, event.clientX, event.clientY);
  }, [importDroppedFiles]);

  return { imageInputRef, mediaInputRef, insertRichObject, importImageFile, importMediaFile, handleCanvasDrop, importDroppedFiles };
}
