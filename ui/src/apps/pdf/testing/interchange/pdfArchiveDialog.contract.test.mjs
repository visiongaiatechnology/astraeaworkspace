// STATUS: PLATIN — Source and catalogue contract for the archive dialog (W-299)
//
// W-299 had three parts, and only one of them was in the engine. The dialog:
//   • matched warnings **by array position** (`ARCHIVE_WARNING_COPY[index]`) and threw the engine's own text
//     away (`_warning`), so a warning added later would show the wrong sentence;
//   • never displayed `textSemanticsPreserved: false` — the consequence that the archive has no text layer;
//   • printed "Fonts: none" in **success green**, directly above a warning describing the same fact as a
//     limitation.
//
// A rendered check needs a DOM this environment does not have, so the wiring is pinned at the source, and
// the catalogue is checked for real by asking it for every key in every language.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pdfWorkflowMessageKeys, pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');
const dialog = read('../roundtrip/PdfRoundtripModal.tsx');

/**
 * The dialog with comments removed.
 *
 * The first version of this file asserted on the raw source and failed on **its own explanatory comment**,
 * which quotes the former `ARCHIVE_WARNING_COPY[index]` lookup — the same mistake as a contract test that
 * once tripped over `window.print()` inside a comment. Prose is not code.
 */
const dialogCode = dialog.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

/**
 * The real locale identifiers.
 *
 * My first probe used `de`, `en`, … and reported 4438 broken catalogue entries. That was an artefact of my
 * own input: `LOCALE_INDEX` is keyed by `WorkspaceLocale` (`de-DE`, `en-US`, …), so a short identifier
 * yields `undefined` and the lookup throws. A cast kept the typechecker quiet — the lesson is to ask the
 * type instead of silencing it, and the catalogue itself was never broken.
 */
const LOCALES = ['de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN'];

describe('the dialog translates a warning by its identity, not by its position', () => {
  it('maps codes to copy', () => {
    expect(dialogCode).toContain('const ARCHIVE_WARNING_COPY: Readonly<Record<PdfA2bArchiveWarningCode, PdfWorkflowCopyKey>> = {');
    expect(dialogCode).toContain("'rasterized-pages': 'roundtrip.archive.warning.raster',");
    expect(dialogCode).toContain("'flattened-semantics': 'roundtrip.archive.warning.flatten',");
    expect(dialogCode).toContain("'certification-absent': 'roundtrip.archive.warning.certification',");
  });

  it('no longer indexes the copy by array position', () => {
    expect(dialogCode).not.toContain('ARCHIVE_WARNING_COPY[index]');
    expect(dialogCode).not.toContain('_warning');
    expect(dialogCode).not.toContain('roundtrip.archive.warning.generic');
  });

  it('shows the engine sentence for a code it does not know', () => {
    // Fail-visible: an unknown code renders the detail instead of a shrug.
    expect(dialogCode).toContain('ARCHIVE_WARNING_COPY[warning.code] ? pdfWorkflowText(locale, ARCHIVE_WARNING_COPY[warning.code]) : warning.detail');
  });
});

describe('the dialog states the consequence', () => {
  it('shows that the archive has no text layer', () => {
    expect(dialogCode).toContain('archiveReport.textSemanticsPreserved === false');
    expect(dialogCode).toContain("pdfWorkflowText(locale, 'roundtrip.archive.notSearchable')");
    expect(dialogCode).toContain('role="alert"');
  });

  it('does not present the missing fonts as a success', () => {
    // The tile used to be emerald, which contradicted the warning below it. It now carries the cause.
    expect(dialogCode).not.toContain("text-emerald-300 font-mono\">{pdfWorkflowText(locale, 'roundtrip.report.none')}");
    expect(dialogCode).toContain("text-amber-200 font-mono\">{pdfWorkflowText(locale, 'roundtrip.report.none')}");
    expect(dialogCode).toContain("pdfWorkflowText(locale, 'roundtrip.report.fontsNoneHint')");
  });
});

describe('every catalogue row is present in all seven languages', () => {
  it('has the two new archive keys', () => {
    const keys = pdfWorkflowMessageKeys();
    expect(keys).toContain('roundtrip.archive.notSearchable');
    expect(keys).toContain('roundtrip.report.fontsNoneHint');
  });

  it('returns non-empty copy for every key in every language', () => {
    // The catalogue is asked for real: every key in all seven languages. A short row cannot happen (the
    // catalogue is `satisfies Record<string, SevenLocaleRow>`, so the compiler enforces seven entries), but
    // the type permits an **empty** string — that is what this checks.
    const missing = [];
    for (const key of pdfWorkflowMessageKeys()) {
      for (const locale of LOCALES) {
        let text = '';
        try {
          text = pdfWorkflowText(locale, key);
        } catch (error) {
          missing.push(`${key}@${locale}:${error instanceof Error ? error.name : '?'}`);
          continue;
        }
        if (typeof text !== 'string' || text.trim().length === 0) missing.push(`${key}@${locale}:leer`);
      }
    }
    expect(missing).toEqual([]);
    expect(pdfWorkflowMessageKeys().length).toBeGreaterThan(600);
  });

  it('translates the consequence rather than repeating the German sentence', () => {
    const rendered = LOCALES.map((locale) => pdfWorkflowText(locale, 'roundtrip.archive.notSearchable'));
    expect(new Set(rendered).size).toBeGreaterThan(3);
    expect(rendered[0]).toContain('Textebene');
    expect(rendered[1]).toContain('text layer');
  });
});
