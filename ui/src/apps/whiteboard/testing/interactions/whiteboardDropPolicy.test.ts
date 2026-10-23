import { describe, expect, it } from 'vitest';
import {
  WHITEBOARD_DROP_MAX_FILES,
  classifyWhiteboardDropFile,
  isWhiteboardFileDrag,
  planWhiteboardDrop,
} from '../../interactions/whiteboardDropPolicy';

const file = (name: string, type: string, size: number) => ({ name, type, size });

describe('Whiteboard drop classification', () => {
  it('classifies by declared MIME and by extension', () => {
    expect(classifyWhiteboardDropFile(file('a.png', 'image/png', 10))).toBe('image');
    expect(classifyWhiteboardDropFile(file('a.PNG', '', 10))).toBe('image');
    expect(classifyWhiteboardDropFile(file('diagram.svg', 'image/svg+xml', 10))).toBe('svg');
    expect(classifyWhiteboardDropFile(file('diagram.svg', '', 10))).toBe('svg');
    expect(classifyWhiteboardDropFile(file('board.pdf', 'application/pdf', 10))).toBe('pdf');
    expect(classifyWhiteboardDropFile(file('clip.mp4', 'video/mp4', 10))).toBe('media');
    expect(classifyWhiteboardDropFile(file('notes.txt', 'text/plain', 10))).toBe('unsupported');
    expect(classifyWhiteboardDropFile(file('payload', '', 10))).toBe('unsupported');
  });

  it('recognizes a file drag payload for the hover preview', () => {
    expect(isWhiteboardFileDrag(['Files'])).toBe(true);
    expect(isWhiteboardFileDrag(['text/plain'])).toBe(false);
    expect(isWhiteboardFileDrag(undefined)).toBe(false);
  });
});

describe('Whiteboard drop planning', () => {
  it('accepts a bounded mixed drop in order', () => {
    const plan = planWhiteboardDrop([
      file('a.png', 'image/png', 1_000),
      file('board.pdf', 'application/pdf', 2_000),
      file('clip.mp3', 'audio/mpeg', 3_000),
    ]);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.entries.map((entry) => entry.classification)).toEqual(['image', 'pdf', 'media']);
      expect(plan.entries.map((entry) => entry.index)).toEqual([0, 1, 2]);
    }
  });

  it('rejects an empty drop', () => {
    const plan = planWhiteboardDrop([]);
    expect(plan).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('rejects too many files instead of silently inserting only the first', () => {
    const files = Array.from({ length: WHITEBOARD_DROP_MAX_FILES + 1 }, (_value, index) => file(`n-${index}.png`, 'image/png', 10));
    expect(planWhiteboardDrop(files)).toMatchObject({ ok: false, reason: 'too-many-files' });
  });

  it('rejects the whole drop when one file is unsupported, naming it', () => {
    const plan = planWhiteboardDrop([file('ok.png', 'image/png', 10), file('script.exe', 'application/octet-stream', 10)]);
    expect(plan).toMatchObject({ ok: false, reason: 'unsupported-file', detail: 'script.exe' });
  });

  it('rejects empty files and files above their per-format budget', () => {
    expect(planWhiteboardDrop([file('zero.png', 'image/png', 0)])).toMatchObject({ ok: false, reason: 'empty-file' });
    expect(planWhiteboardDrop([file('huge.svg', 'image/svg+xml', 3 * 1024 * 1024)])).toMatchObject({ ok: false, reason: 'file-too-large' });
    expect(planWhiteboardDrop([file('huge.png', 'image/png', 16 * 1024 * 1024)])).toMatchObject({ ok: false, reason: 'file-too-large' });
  });

  it('rejects a drop above the aggregate byte budget', () => {
    const plan = planWhiteboardDrop([file('a.wav', 'audio/wav', 1_000), file('b.wav', 'audio/wav', 1_000)], { maxTotalBytes: 1_500 });
    expect(plan).toMatchObject({ ok: false, reason: 'total-too-large' });
  });

  it('rejects malformed input instead of throwing', () => {
    expect(planWhiteboardDrop(undefined)).toMatchObject({ ok: false, reason: 'empty' });
    expect(planWhiteboardDrop([{ name: 'x.png', type: 'image/png', size: Number.NaN }])).toMatchObject({ ok: false, reason: 'empty-file' });
  });
});
