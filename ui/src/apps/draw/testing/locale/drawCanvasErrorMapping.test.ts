// STATUS: GOLD — named, fail-closed refusal text for every engine path the Draw surface can hit.
//
// Paket 11 (AST-1289, Vorlagen), Paket 17 (AST-1319, PNG/PDF) und Paket 18 (AST-1324, Visio) verlangen
// denselben einen Befund: **jeder ungültige Pfad ist sichtbar und benannt** — kein stiller No-op, keine
// Sammelmeldung über verschiedene Ursachen.
//
// Der Test hält zugleich einen **eigenen Fehler** fest: die frühere Fassung meldete für **jeden**
// `visio-`-Code „überschreitet 24 MiB" und behauptete damit eine Größengrenze, die nicht erreicht war.
import { describe, expect, it } from 'vitest';
import {
  DRAW_CANVAS_ERROR_COPY,
  DRAW_CANVAS_ERROR_PREFIXES,
  DRAW_CANVAS_EXACT_ERROR_CODES,
  drawCanvasEngineError,
  drawCanvasErrorText,
} from '../../drawCanvasLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';

const codes = (list: readonly string[]) => list.map((code) => ({ code }));

// Die Codes, die die Draw-Engines tatsächlich werfen (aus `drawInterchangeCore/Engine` und `visioVdx`).
const VISIO_UNSUPPORTED = [
  'visio-item-kind-unsupported', 'visio-shape-type-unsupported', 'visio-page-content-unsupported',
  'visio-group-shape-unsupported', 'visio-connect-element-unsupported', 'visio-color-unsupported',
  'visio-unit-unsupported', 'visio-element-namespace-unsupported', 'visio-rotation-invalid',
  'visio-geometry-missing',
];
const TEMPLATE_CODES = [
  'template-missing', 'template-page-missing', 'template-layer-missing', 'template-object-limit',
  'template-object-id-conflict', 'template-target-invalid', 'template-container-invalid',
  'template-container-member-invalid',
];
const RASTER_CODES = [
  'svg-raster-timeout', 'svg-raster-load-failed', 'raster-size-boundary', 'canvas-unavailable',
  'browser-rasterizer-unavailable', 'webp-encoder-unavailable',
];
const PDF_CODES = [
  'pdf-jpeg-size-boundary', 'pdf-jpeg-invalid', 'pdf-jpeg-dimensions-missing', 'pdf-title-size-boundary',
  'pdf-export-too-large',
];

describe('Draw error text — named categories, one definition', () => {
  it('answers each engine family with its own sentence', () => {
    for (const locale of WORKSPACE_LOCALES) {
      for (const code of VISIO_UNSUPPORTED) {
        expect(drawCanvasEngineError({ code }, locale), code).toBe(drawCanvasErrorText('visioImportFailed', locale));
      }
      for (const code of TEMPLATE_CODES) {
        expect(drawCanvasEngineError({ code }, locale), code).toBe(drawCanvasErrorText('templateFailed', locale));
      }
      for (const code of RASTER_CODES) {
        expect(drawCanvasEngineError({ code }, locale), code).toBe(drawCanvasErrorText('rasterUnavailable', locale));
      }
      for (const code of PDF_CODES) {
        expect(drawCanvasEngineError({ code }, locale), code).toBe(drawCanvasErrorText('pdfExportFailed', locale));
      }
      for (const code of ['svg-active-content-rejected', 'svg-element-limit', 'svg-depth-limit', 'svg-size-boundary']) {
        expect(drawCanvasEngineError({ code }, locale), code).toBe(drawCanvasErrorText('svgImportFailed', locale));
      }
      for (const code of ['native-container-unencrypted', 'draw-workspace-payload-missing', 'native-size-boundary']) {
        expect(drawCanvasEngineError({ code }, locale), code).toBe(drawCanvasErrorText('nativeImportFailed', locale));
      }
    }
  });

  it('names the size and page limits exactly, because those sentences carry the number', () => {
    for (const locale of WORKSPACE_LOCALES) {
      expect(drawCanvasEngineError({ code: 'visio-import-too-large' }, locale)).toBe(drawCanvasErrorText('visioTooLarge', locale));
      expect(drawCanvasEngineError({ code: 'visio-export-too-large' }, locale)).toBe(drawCanvasErrorText('visioTooLarge', locale));
      expect(drawCanvasEngineError({ code: 'pdf-page-limit' }, locale)).toBe(drawCanvasErrorText('pdfPageLimit', locale));
      // **Export**, nicht Import (Befund dieser Runde): das Präfix `svg-` hätte aus dem Export-Überlauf den
      // Import-Satz gemacht — ein Satz über den falschen Vorgang.
      expect(drawCanvasEngineError({ code: 'svg-export-too-large' }, locale)).toBe(drawCanvasErrorText('svgTooLarge', locale));
      expect(drawCanvasEngineError({ code: 'svg-import-too-large' }, locale)).toBe(drawCanvasErrorText('svgImportFailed', locale));
    }
  });

  it('never claims a size overflow for an unsupported Visio part (regression of this batch)', () => {
    // Vor der Behebung lieferte jeder `visio-`-Code den Satz „überschreitet 24 MiB" — gemessen, nicht vermutet.
    const tooLarge = drawCanvasErrorText('visioTooLarge', 'en-US');
    for (const code of VISIO_UNSUPPORTED) {
      expect(drawCanvasEngineError({ code }, 'en-US'), code).not.toBe(tooLarge);
    }
    expect(drawCanvasEngineError({ code: 'visio-export-too-large' }, 'en-US')).toBe(tooLarge);
  });

  it('keeps the named code for an unknown failure instead of hiding it', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const text = drawCanvasEngineError({ code: 'draw-unheard-of-refusal' }, locale);
      expect(text).toContain(drawCanvasErrorText('operationFailed', locale));
      expect(text).toContain('draw-unheard-of-refusal');
    }
  });

  it('does not leak the message of a plain error without a code', () => {
    for (const locale of WORKSPACE_LOCALES) {
      expect(drawCanvasEngineError(new Error('private engine detail'), locale)).toBe(drawCanvasErrorText('operationFailed', locale));
      expect(drawCanvasEngineError('a bare string', locale)).toBe(drawCanvasErrorText('operationFailed', locale));
      expect(drawCanvasEngineError(null, locale)).toBe(drawCanvasErrorText('operationFailed', locale));
    }
  });

  it('passes an already localized sentence through unchanged', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const sentence = DRAW_CANVAS_ERROR_COPY[locale].operationFailed;
      expect(drawCanvasEngineError(new Error(sentence), locale)).toBe(sentence);
    }
  });

  it('orders the prefixes so no category shadows a more specific one', () => {
    const prefixes = DRAW_CANVAS_ERROR_PREFIXES.map(([prefix]) => prefix);
    for (let index = 0; index < prefixes.length; index += 1) {
      for (let other = index + 1; other < prefixes.length; other += 1) {
        // First match wins, so a prefix appearing **earlier** must never be a prefix of a later one —
        // otherwise the later (more specific) category would be unreachable.
        expect(prefixes[other]!.startsWith(prefixes[index]!), `${prefixes[index]} before ${prefixes[other]}`).toBe(false);
      }
    }
    expect(Object.keys(DRAW_CANVAS_EXACT_ERROR_CODES).length).toBeGreaterThan(0);
  });

  it('answers every documented code, in every locale, with a non-empty sentence', () => {
    const all = [...VISIO_UNSUPPORTED, ...TEMPLATE_CODES, ...RASTER_CODES, ...PDF_CODES];
    for (const locale of WORKSPACE_LOCALES) {
      for (const { code } of codes(all)) {
        const text = drawCanvasEngineError({ code }, locale);
        expect(text.trim(), `${locale}/${code}`).not.toBe('');
        expect(text, `${locale}/${code}`).not.toContain('undefined');
      }
    }
  });
});
