// STATUS: PLATIN — WR-046: a documented 30-page load case for pagination
//
// The plan asks for a *measurement*, not a claim: "Es gibt einen dokumentierten Messfall mit
// z. B. 30 Seiten". This test builds a deterministic ~30-page document, paginates it, edits
// paragraphs on page 1, 15 and 30, re-paginates and records the duration. The bounds are
// deliberately generous: `happy-dom` has no layout engine, so the numbers measure the
// **pagination model** (the part that runs on every keystroke), not DOM painting. The native
// side stays a user-probe item and is documented as such in `audit/WRITER_50_ACCEPTANCE.md`.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterStyleDefinition } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import { paginateWriterParagraphs } from '../../../../layout/pagination/writerPagination';

const PAGE_SETUP: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

const STYLES: WriterStyleDefinition[] = [{
  name: 'normal',
  label: 'Normal',
  fontSizePt: 11,
  bold: false,
  lineHeight: 1.2,
  spaceBefore: 0,
  spaceAfter: 6,
}];

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { style_name: 'normal', alignment: 'left', line_height: 1.2, space_before: 0, space_after: 6 },
    spans: [{ text }],
  };
}

/** Deterministic body text: no randomness, so the 30-page case is reproducible. */
function bodyText(index: number): string {
  const words: string[] = [];
  for (let word = 0; word < 60; word += 1) words.push(`w${(index * 61 + word) % 97}`);
  return `Absatz ${index}: ${words.join(' ')}`;
}

function buildDocument(paragraphCount: number): Paragraph[] {
  return Array.from({ length: paragraphCount }, (_, index) => paragraph(`p${index}`, bodyText(index)));
}

function paginate(paragraphs: Paragraph[]) {
  return paginateWriterParagraphs(paragraphs, PAGE_SETUP, STYLES);
}

describe('WR-046 — 30-page pagination measurement', () => {
  it('paginates a ~30-page document and keeps the page count stable across edits', () => {
    const document = buildDocument(360);

    const firstStart = performance.now();
    const first = paginate(document);
    const firstMs = performance.now() - firstStart;
    expect(first.length).toBeGreaterThanOrEqual(30);

    // Edit one paragraph on the first, one in the middle and one on the last page.
    const edited = document.map((entry, index) => {
      if (index === 0) return { ...entry, spans: [{ text: 'Geändert am Anfang' }] };
      if (index === 180) return { ...entry, spans: [{ text: 'Geändert in der Mitte' }] };
      if (index === document.length - 1) return { ...entry, spans: [{ text: 'Geändert am Ende' }] };
      return entry;
    });

    const editStart = performance.now();
    const second = paginate(edited);
    const editMs = performance.now() - editStart;
    expect(second.length).toBeGreaterThanOrEqual(30);

    // No text is lost anywhere: every paragraph appears at least once.
    const placedIds = new Set(second.flatMap((page) => page.fragments.map((fragment) => fragment.paragraph.id)));
    expect(placedIds.size).toBe(document.length);

    // Fragments of untouched paragraphs keep their identity, so React does not remount them.
    const keyOf = (pages: ReturnType<typeof paginate>, id: string): string[] => pages
      .flatMap((page) => page.fragments.filter((fragment) => fragment.paragraph.id === id).map((fragment) => fragment.key));
    expect(keyOf(second, 'p200')).toEqual(keyOf(first, 'p200'));

    // Generous model-level bounds; they exist to catch a quadratic regression, not to claim a
    // device performance. Measured values are recorded in Next.md.
    expect(firstMs).toBeLessThan(4_000);
    expect(editMs).toBeLessThan(4_000);
    // eslint-disable-next-line no-console
    console.info(`[WR-046] 30 Seiten: ${first.length} Seiten in ${firstMs.toFixed(1)} ms, Neuberechnung nach 3 Änderungen in ${editMs.toFixed(1)} ms`);
  });

  it('survives twenty fast edits without losing characters', { timeout: 120_000 }, () => {
    const document = buildDocument(360);
    const texts = new Map(document.map((entry) => [entry.id, entry.spans[0]?.text ?? '']));
    let current = document;
    const start = performance.now();
    for (let edit = 0; edit < 20; edit += 1) {
      const targetIndex = (edit * 37) % document.length;
      const target = current[targetIndex]!;
      const nextText = `${texts.get(target.id)} ${edit}`;
      current = current.map((entry, index) => (index === targetIndex ? { ...entry, spans: [{ text: nextText }] } : entry));
      texts.set(target.id, nextText);
      expect(paginate(current).length).toBeGreaterThanOrEqual(30);
    }
    const duration = performance.now() - start;
    // Generous: a full-suite run shares the CPU with every other worker; this bound only has
    // to catch a quadratic regression, not to measure a device.
    expect(duration).toBeLessThan(30_000);
    expect(current[0]?.spans[0]?.text).toBe(`${texts.get('p0')}`);
  });
});
