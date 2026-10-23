// STATUS: PLATIN — source contract for the visible foreign-PDF entry (AST-0761 / AST-0907).
//
// A rendered check would need a DOM this environment does not have, and the gap that existed was **wiring**,
// not rendering: the toolbar had no entry, the studio had no state for it, and `apps/pdf` never called the
// canonical import boundary. Those three facts are visible in the source, so they are pinned here.
//
// `fs` is unavailable to a `.ts` test in this project (no Node types), which is why this contract is `.mjs` —
// the same reason `testing/studio/PdfStudioReachability.contract.test.mjs` is.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const studio = read('../../studio/PdfStudio.tsx');
const toolbar = read('../../studio/PdfToolbar.tsx');
const panel = read('./PdfNativeOpenPanel.tsx');
const opener = read('./openNativePdfPayload.ts');
const studioState = read('../../studio/state/usePdfStudioState.ts');
const locale = read('../../locale/pdfWorkflowDialogsLocale.ts');

/** Comments are not code: the cross-app adoption contract already tripped over its own prose once. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

describe('the visible entry exists and is wired', () => {
  it('offers the action in the main toolbar, not behind the overflow menu', () => {
    expect(code(toolbar)).toContain('onOpenNativePdf');
    expect(code(toolbar)).toContain('data-pdf-action="open-native-pdf"');
    expect(code(toolbar)).toContain("pdfWorkflowText(locale, 'nativeOpen.title')");
    // In the brand/page-navigation group, i.e. before the tool band, so it is one Tab away from the document.
    const toolbarCode = code(toolbar);
    expect(toolbarCode.indexOf('data-pdf-action="open-native-pdf"')).toBeLessThan(toolbarCode.indexOf('data-pdf-tool-band'));
  });

  it('keeps the studio state and the panel connected', () => {
    expect(code(studio)).toContain('const [isNativeOpenOpen, setIsNativeOpenOpen] = useState(false)');
    expect(code(studio)).toContain('onOpenNativePdf={() => setIsNativeOpenOpen((open) => !open)}');
    expect(code(studio)).toContain('isNativeOpenPanelOpen={isNativeOpenOpen}');
    expect(code(studio)).toContain('<PdfNativeOpenPanel onOpened={handleNativePdfOpened}');
  });

  it('opens a foreign PDF as a derived document and falls back through the canonical save path', () => {
    const studioCode = code(studio);
    expect(studioCode).toContain('onCreateDerivedDocument(buildNativePdfDerivedDocument(');
    expect(studioCode).toContain('persistPdfData(result.payload)');
    expect(studioCode).toContain('notify(notice)');
  });

  it('calls the canonical import boundary and does not write a second header rule', () => {
    const openerCode = code(opener);
    expect(openerCode).toContain("from '../../../../platform/documents/pdf/nativeInspection'");
    expect(openerCode).toContain('await inspectNativePdfBytes(input.bytes)');
    expect(openerCode).not.toMatch(/%PDF-/u);
    expect(openerCode).not.toContain('assertPdfHeader');
    expect(openerCode).not.toMatch(/0x25,\s*0x50,\s*0x44,\s*0x46/u);
  });

  it('bounds every input it accepts', () => {
    const openerCode = code(opener);
    expect(openerCode).toContain('maxPersistableNativePdfBytes()');
    expect(openerCode).toContain('sanitizePdfFileName');
    expect(openerCode).toContain('MAX_FILE_NAME_CHARS');
  });

  it('never lets the demonstration model shadow an imported byte payload', () => {
    expect(code(studioState)).toContain('if (document.pdfData?.rawPdfDataUrl) return document.pdfData;');
  });
});

describe('the panel is operable and announces its state', () => {
  it('is reachable and operable with the keyboard', () => {
    const panelCode = code(panel);
    // A real button opens the picker …
    expect(panelCode).toContain('onClick={() => inputRef.current?.click()}');
    // … and the file input itself is labelled, so it is also usable without a pointer.
    expect(panelCode).toContain('type="file"');
    expect(panelCode).toContain('aria-label={pdfWorkflowText(locale, \'nativeOpen.choose\')}');
    expect(panelCode).toContain('accept="application/pdf,.pdf"');
  });

  it('offers a drop target and states the limit', () => {
    const panelCode = code(panel);
    expect(panelCode).toContain('onDrop={(event) =>');
    expect(panelCode).toContain("pdfWorkflowText(locale, 'nativeOpen.drop')");
    expect(panelCode).toContain("pdfWorkflowText(locale, 'nativeOpen.hintLimit'");
  });

  it('names every failure in the DOM and in the catalogue', () => {
    const panelCode = code(panel);
    expect(panelCode).toContain('role="alert"');
    expect(panelCode).toContain('data-pdf-native-open-failure={failure.code}');
    for (const code2 of ['empty-file', 'not-a-pdf', 'too-large-to-persist', 'truncated', 'inspection-budget-exceeded', 'file-name-invalid', 'read-failed']) {
      expect(panelCode, `panel: ${code2}`).toContain(`failureKey(failure.code)`);
      expect(locale, `catalogue: ${code2}`).toContain(`'nativeOpen.failed.${code2}':`);
    }
  });

  it('has every new string in all seven languages', () => {
    for (const key of ['nativeOpen.title', 'nativeOpen.hint', 'nativeOpen.choose', 'nativeOpen.drop', 'nativeOpen.hintLimit', 'nativeOpen.opened']) {
      const row = new RegExp(`'${key}': \\[([^\\]]+)\\]`, 'u').exec(locale);
      expect(row, key).not.toBeNull();
      // Seven entries, each a non-empty string — a short row would break the seven-locale contract.
      const entries = (row?.[1] ?? '').split("', '");
      expect(entries.length, key).toBe(7);
      for (const entry of entries) expect(entry.replace(/^'|'$/gu, '').trim().length, `${key}: ${entry}`).toBeGreaterThan(0);
    }
  });

  it('is not a colour-only state: the failure carries text and a code', () => {
    const panelCode = code(panel);
    expect(panelCode).toContain('{failure.code} · {failure.detail.slice(0, 200)}');
  });
});
