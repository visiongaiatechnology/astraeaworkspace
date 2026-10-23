import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeNativeTaskValue } from '../../interchange/taskInterchangeEngine';
import {
  decodeTaskAttachmentForDownload,
  downloadTaskAttachment,
  parseTaskAttachmentDataUrl,
} from '../../collaboration/taskAttachments';

const validDataUrl = 'data:text/plain;base64,SGVsbG8=';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Task attachment import and download boundary', () => {
  it('accepts only bounded canonical base64 data URLs with measurable bytes', () => {
    expect(parseTaskAttachmentDataUrl(validDataUrl)).toEqual({
      mimeType: 'text/plain',
      encodedPayload: 'SGVsbG8=',
      byteLength: 5,
    });
    expect(parseTaskAttachmentDataUrl('javascript:alert(1)')).toBeUndefined();
    expect(parseTaskAttachmentDataUrl('https://example.invalid/file')).toBeUndefined();
    expect(parseTaskAttachmentDataUrl('data:text/plain;base64,SGVsbG8')).toBeUndefined();
  });

  it('drops executable, malformed, and size-mismatched imported attachment data', () => {
    const task = sanitizeNativeTaskValue({
      id: 'task-safe-import',
      title: 'Imported task',
      attachments: [
        { id: 'attachment-script', name: 'script.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: 'javascript:alert(1)' },
        { id: 'attachment-size', name: 'wrong-size.txt', mimeType: 'text/plain', sizeBytes: 6, dataUrl: validDataUrl },
        { id: 'attachment-valid', name: 'valid.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: validDataUrl },
      ],
    });

    expect(task?.attachments).toHaveLength(1);
    expect(task?.attachments?.[0]).toMatchObject({
      id: 'attachment-valid',
      name: 'valid.txt',
      sizeBytes: 5,
      dataUrl: validDataUrl,
    });
  });

  it('decodes only when the attachment byte count matches its canonical payload', () => {
    const decoded = decodeTaskAttachmentForDownload({
      id: 'attachment-valid', name: 'valid.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: validDataUrl,
    });
    expect(decoded && [...decoded]).toEqual([72, 101, 108, 108, 111]);
    expect(decodeTaskAttachmentForDownload({
      id: 'attachment-invalid', name: 'invalid.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: 'javascript:alert(1)',
    })).toBeUndefined();
  });

  it('delivers the attachment through the shared export boundary (octet-stream, no navigation)', async () => {
    const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    const documentStub = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } };
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:task-attachment-download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.useFakeTimers();

    await downloadTaskAttachment({
      id: 'attachment-valid', name: 'valid.txt', mimeType: 'text/html', sizeBytes: 5, dataUrl: validDataUrl,
    });

    const downloadedBlob = createObjectURL.mock.calls[0]?.[0] as Blob | undefined;
    expect(downloadedBlob).toBeInstanceOf(Blob);
    expect(downloadedBlob?.type).toBe('application/octet-stream');
    expect(anchor.href).toBe('blob:task-attachment-download');
    expect(anchor.download).toBe('valid.txt');
    expect(anchor.rel).toBe('noopener');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();

    await vi.runOnlyPendingTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:task-attachment-download');
  });

  it('refuses a javascript scheme by throwing instead of silently doing nothing', async () => {
    const createElement = vi.fn();
    const createObjectURL = vi.fn();
    vi.stubGlobal('document', { createElement, body: { appendChild: vi.fn() } });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });

    await expect(downloadTaskAttachment({
      id: 'attachment-script', name: 'script.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: 'javascript:alert(1)',
    })).rejects.toThrow(/could not be decoded/u);

    expect(createElement).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
