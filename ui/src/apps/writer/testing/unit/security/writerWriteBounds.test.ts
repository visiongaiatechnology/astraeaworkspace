// STATUS: PLATIN — WR-045: write-time bounds for paragraphs, image sources and clipboard depth
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { writerCanAddParagraphs, WRITER_MAX_PARAGRAPHS } from '../../../editing/paragraphs/writerParagraphLimits';
import {
  isWriterImageDataUrl,
  refuseWriterImageForWrite,
} from '../../../media/images/operations/writerImageBoundary';
import {
  parseWriterClipboardHtml,
  WRITER_CLIPBOARD_MAX_NESTING,
} from '../../../editing/clipboard/writerClipboardPayload';

const here = path.dirname(fileURLToPath(import.meta.url));

const VALID_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('WR-045 — paragraph growth is bounded at write time', () => {
  it('allows growth below the ceiling and refuses at it', () => {
    expect(writerCanAddParagraphs(0)).toBe(true);
    expect(writerCanAddParagraphs(WRITER_MAX_PARAGRAPHS - 1)).toBe(true);
    expect(writerCanAddParagraphs(WRITER_MAX_PARAGRAPHS)).toBe(false);
    expect(writerCanAddParagraphs(WRITER_MAX_PARAGRAPHS - 2, 3)).toBe(false);
  });

  it('fails closed for hostile counts instead of producing NaN decisions', () => {
    expect(writerCanAddParagraphs(Number.NaN)).toBe(false);
    expect(writerCanAddParagraphs(Number.POSITIVE_INFINITY)).toBe(false);
    expect(writerCanAddParagraphs(-5)).toBe(false);
  });
});

describe('WR-045 — only real inline image sources may be stored', () => {
  it('accepts a base64 raster data URL', () => {
    expect(isWriterImageDataUrl(VALID_PNG)).toBe(true);
    expect(refuseWriterImageForWrite({ dataUrl: VALID_PNG, name: 'bild.png' })).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/bild.png',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4=',
    '',
  ])('refuses %s', (source) => {
    expect(isWriterImageDataUrl(source)).toBe(false);
    expect(refuseWriterImageForWrite({ dataUrl: source, name: 'x' })).not.toBeNull();
  });
});

describe('WR-045 — clipboard HTML nesting is bounded', () => {
  it('keeps the text but stops collecting formatting past the depth bound', () => {
    const open = `<span style="font-weight:700">`.repeat(WRITER_CLIPBOARD_MAX_NESTING * 4);
    const close = '</span>'.repeat(WRITER_CLIPBOARD_MAX_NESTING * 4);
    const payload = parseWriterClipboardHtml(`<p>${open}Text${close}</p>`);
    expect(payload).toHaveLength(1);
    expect(payload[0]!.spans.map((span) => span.text).join('')).toBe('Text');
    expect(payload[0]!.spans.some((span) => span.bold)).toBe(true);
  });
});

describe('WR-041 / Release 0.1 — no save success without a confirmed file', () => {
  it('announces a confirmed file, names browser storage as browser storage, and never claims a save otherwise', () => {
    const app = readFileSync(path.resolve(here, '../../../../../app/App.tsx'), 'utf8');
    const handleSaveStart = app.indexOf('const handleSaveVwc = useCallback');
    const handleSaveAsStart = app.indexOf('const handleSaveVwcAs = useCallback');
    const shellStart = app.indexOf('const shell = useWorkspaceShellLifecycle');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveAsStart).toBeGreaterThan(handleSaveStart);
    expect(shellStart).toBeGreaterThan(handleSaveAsStart);
    const handleSave = app.slice(handleSaveStart, handleSaveAsStart);
    const handleSaveAs = app.slice(handleSaveAsStart, shellStart);

    // 1. "Gespeichert" only for a confirmed native file proof.
    expect(handleSave).toContain("if (proof?.kind === 'file')");
    expect(handleSave).toContain('copy.savedFileToast(proof.fileName, proof.sizeBytes)');
    // 2. The cache-only path names itself as browser storage, never as a file.
    expect(handleSave).toContain("if (proof?.kind === 'browser-cache')");
    expect(handleSave).toContain('copy.savedBrowserToast');
    // 3. A failure/absent store still produces a message, not a silent success.
    expect(handleSave).toContain('getSaveFailure()');
    expect(handleSave).toContain('copy.storeUnavailableToast');
    // 4. "Speichern unter…" reports file mode as confirmed and download mode as unconfirmed.
    expect(handleSaveAs).toContain('executeSaveVwc(');
    expect(handleSaveAs).toContain("showToast(mode === 'file' ? copy.saveAsSucceeded(fileName) : copy.saveAsBrowserStarted)");

    // 5. The sentences live in one locale catalogue and exist in every language.
    const copySource = readFileSync(path.resolve(here, '../../../../../shell/persistence/workspaceSaveProof.ts'), 'utf8');
    expect(copySource).toContain('savedFileToast:');
    expect(copySource).toContain('savedBrowserToast:');
    expect(copySource).toContain('saveAsSucceeded:');
    expect(copySource).toContain('saveAsBrowserStarted:');
    expect(copySource).toMatch(/saveAsBrowserStarted: 'Download/);

    // 6. The old claims are gone: a download is not a save, and no "saved locally" without proof.
    expect(app).not.toContain('Download gestartet. Speicherstatus siehe Statusleiste.');
    expect(app).not.toContain('saved locally by Rust Workspace Core');
  });
});
