// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Present's browser fallback stays a download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import { downloadPresentSlideSvg } from '../../interchange/render/presentExport';
import { downloadCaptionSidecar } from '../../interchange/video/presentVideoExport';

const SLIDE: PresentSlide = {
  id: 'slide-1',
  title: 'Quartal',
  subtitle: 'Bericht',
  layout: 'blank',
  speakerNotes: '',
} as PresentSlide;

const MODEL: PresentDocumentModel = { slides: [SLIDE], theme: 'dark' } as PresentDocumentModel;

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Present export delivery — browser fallback', () => {
  it('delivers the slide SVG as a download and reports it as such', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:present-svg');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadPresentSlideSvg('Quartalsbericht', SLIDE, MODEL, 'de-DE');
    expect(result.mode).toBe('download');
    expect(result.fileName).toMatch(/\.svg$/u);
    expect(anchorClicks).toBe(1);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toContain('image/svg+xml');
  });

  it('delivers the caption sidecar as a download', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:present-vtt');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadCaptionSidecar({ webVttCaptions: 'WEBVTT' } as never, 'deck.vtt');
    expect(result).toEqual({ fileName: 'deck.vtt', mode: 'download' });
    expect(anchorClicks).toBe(1);
  });
});
