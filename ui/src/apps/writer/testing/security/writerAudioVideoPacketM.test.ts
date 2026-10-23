// STATUS: DIAMANT VGT SUPREME — Writer Audio/Video Security & Persistence Regression
import { describe, expect, it, vi } from 'vitest';
import type { WriterMediaObjectData } from '../../../../shared/contracts/workspace';
import {
  createWriterLinkedMedia,
  detectWriterMediaSignature,
  importWriterEmbeddedMedia,
  isSafeWriterEmbeddedMediaSource,
  normalizeWriterMediaLink,
  normalizeWriterMediaObjects,
  validateWriterEmbeddedMediaBytes,
  WriterMediaObjectError,
} from '../../media/audio-video/writerAudioVideoMedia';
import { estimateAnchoredMediaHeightPx } from '../../layout/pagination/measurement/writerPaginationMeasurement';

function dataUrl(mime: string, bytes: readonly number[]): string {
  const binary = String.fromCharCode(...bytes);
  return `data:${mime};base64,${btoa(binary)}`;
}

const MP3 = [0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00];
const MP4 = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00];

function embedded(kind: 'audio' | 'video', mimeType: string, bytes: readonly number[]): WriterMediaObjectData {
  return {
    id: `${kind}-1`, kind, storage: 'embedded', name: `${kind} test`, mimeType,
    embeddedDataUrl: dataUrl(mimeType, bytes), anchorParagraphId: 'p-1', createdAt: 1,
  };
}

describe('Writer audio/video objects', () => {
  it('rejects an oversized File before reading or allocating its contents', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const slice = vi.fn(() => ({ arrayBuffer }) as unknown as Blob);
    const file = {
      size: 75 * 1024 * 1024 + 1,
      type: 'video/mp4',
      name: 'oversized.mp4',
      slice,
    } as unknown as File;

    await expect(importWriterEmbeddedMedia(file, 'video')).rejects.toThrow(WriterMediaObjectError);
    expect(slice).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('cross-checks MIME and local media signatures', () => {
    expect(detectWriterMediaSignature(Uint8Array.from(MP3))).toBe('mp3');
    expect(detectWriterMediaSignature(Uint8Array.from(MP4))).toBe('mp4');
    expect(() => validateWriterEmbeddedMediaBytes('audio', 'audio/mpeg', Uint8Array.from(MP3))).not.toThrow();
    expect(() => validateWriterEmbeddedMediaBytes('video', 'video/mp4', Uint8Array.from(MP4))).not.toThrow();
    expect(() => validateWriterEmbeddedMediaBytes('audio', 'audio/mpeg', Uint8Array.from(MP4))).toThrow(WriterMediaObjectError);
  });

  it('rejects image ISO-BMFF brands masquerading as MP4 video', () => {
    const avif = Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    expect(detectWriterMediaSignature(avif)).toBeNull();
    expect(() => validateWriterEmbeddedMediaBytes('video', 'video/mp4', avif)).toThrow();
  });

  it('allows only explicit credential-free HTTPS links and strips fragments', () => {
    expect(normalizeWriterMediaLink('https://media.example.test/demo.mp4#frag')).toBe('https://media.example.test/demo.mp4');
    expect(() => normalizeWriterMediaLink('http://media.example.test/demo.mp4')).toThrow();
    expect(() => normalizeWriterMediaLink('https://user:secret@media.example.test/demo.mp4')).toThrow();
    const linked = createWriterLinkedMedia('video', 'https://media.example.test/demo.mp4', ' Demo ', 'p-1');
    expect(linked.storage).toBe('linked');
    expect(linked.embeddedDataUrl).toBeUndefined();
  });

  it('validates persisted embedded data URLs by MIME, decoded size, and signature', () => {
    const valid = embedded('audio', 'audio/mpeg', MP3);
    expect(isSafeWriterEmbeddedMediaSource(valid)).toBe(true);
    expect(isSafeWriterEmbeddedMediaSource({ ...valid, mimeType: 'audio/ogg' })).toBe(false);
    expect(isSafeWriterEmbeddedMediaSource({ ...valid, embeddedDataUrl: 'data:audio/mpeg;base64,PGh0bWw+' })).toBe(false);
  });

  it('normalizes bounded document media and drops unsafe or duplicate entries', () => {
    const valid = embedded('video', 'video/mp4', MP4);
    const unsafe = { ...valid, id: 'bad', embeddedDataUrl: 'data:video/mp4;base64,PGh0bWw+' };
    const duplicate = { ...valid, name: 'duplicate' };
    const normalized = normalizeWriterMediaObjects([valid, unsafe, duplicate]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.name).toBe('video test');
  });

  it('reserves bounded page flow height only for media anchored to the paragraph', () => {
    const geometry = {
      widthPx: 800, heightPx: 1100, bodyWidthPx: 600, bodyHeightPx: 900,
      columnWidthPx: 600, columnCount: 1, columnGapPx: 0, columnWidthsPx: [600],
      marginsPx: { top: 80, bottom: 120, left: 100, right: 100 },
    };
    const audio = embedded('audio', 'audio/mpeg', MP3);
    const video = embedded('video', 'video/mp4', MP4);
    expect(estimateAnchoredMediaHeightPx('p-1', geometry, { tables: [], images: [], mediaObjects: [audio, video], equations: [], footnotes: [], workspaceEmbeds: [] })).toBe(332);
    expect(estimateAnchoredMediaHeightPx('p-2', geometry, { tables: [], images: [], mediaObjects: [audio, video], equations: [], footnotes: [], workspaceEmbeds: [] })).toBe(0);
  });
});
