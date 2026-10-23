// @vitest-environment node
// STATUS: DIAMANT VGT SUPREME — Verhaltensnachweis fuer den Design-System-Teil von M06-Z1274.
//
// Die Zusage lautet: "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und
// skalierbare UI gehoeren zum Definition-of-Done."
//
// HIGH-CONTRAST UND FOKUSFUEHRUNG liegen fuer Astraea Tasks NICHT in `src/apps/tasks/**`, sondern
// ausschliesslich im Design-System: `grep -E "forced-colors|prefers-contrast|prefers-reduced-motion"
// src/apps/tasks` liefert im Modul NULL Treffer. Der Wurzelknoten
// `data-vgt-tasks-root="true"` wird in `apps/tasks/app/TasksOnlyManagement.tsx:292` gesetzt, die
// zugehoerigen Regeln stehen in `design-system/styles/module-accessibility.css:48-69`, geladen wird
// die Datei global in `src/main.tsx:9`.
//
// WARUM HIER KEIN DOM
// `@media (forced-colors: active)` laesst sich in happy-dom nicht aktivieren, und unter happy-dom
// scheitert `readFileSync(new URL(..., import.meta.url))` an "The URL must be of scheme file"
// (gemessen: genau so ist der erste Anlauf dieser Datei gescheitert). Deshalb laeuft sie in der
// node-Umgebung und prueft den Stylesheet-TEXT — aber nicht als `toContain` ueber die ganze Datei:
// ein Treffer in einem FREMDEN Modulblock oder in einem falschen Medienkontext zaehlt hier nicht.
// Geparst wird in Regelbloecke; geprueft wird der Block, der den Selektor wirklich traegt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STYLE_PATH = '../../../../design-system/styles/module-accessibility.css';
const STYLE_SOURCE = readFileSync(new URL(STYLE_PATH, import.meta.url), 'utf8');
const TASKS_ROOT = '[data-vgt-tasks-root="true"]';

/**
 * Ein CSS-Block im Stylesheet: `header { body }`. Fuer `@media`-Bloecke ist `header` die
 * Bedingung und `body` der Inhalt (rekursiv, weil der At-Block selbst kein Selektor ist).
 */
interface CssBlock {
  header: string;
  body: string;
}

/**
 * Zerlegt CSS-Text in seine Bloecke — klammerbewusst, damit ein innerer Block nicht als Ende des
 * aeusseren gilt. Ein frueherer Anlauf dieser Datei hat genau das falsch gemacht (jedes `}` beendete
 * den Block) und lieferte deshalb 1 Block statt 58; das ist hier korrigiert.
 */
function cssBlocks(source: string): CssBlock[] {
  // Ein Auffuellzeichen am Anfang gibt jedem Index einen Vorgaenger; damit funktioniert die
  // Rueckwaertssuche nach dem Blockanfang auch bei Index 0.
  const padded = `   ${source}`;
  const rawIndex = (paddedIndex: number): number => paddedIndex - 3;
  const blocks: CssBlock[] = [];
  const length = padded.length;
  let index = 3;

  while (index < length) {
    if (padded.startsWith('/*', index)) {
      const close = padded.indexOf('*/', index + 2);
      index = close === -1 ? length : close + 2;
      continue;
    }
    const character = padded[index];
    if (character === ';' || /\s/.test(character) || character === '}') {
      index += 1;
      continue;
    }

    const open = padded.indexOf('{', index);
    if (open === -1) break;
    const header = padded.slice(index, open).trim();

    let cursor = open + 1;
    let depth = 1;
    let quote = '';
    while (cursor < length && depth > 0) {
      const current = padded[cursor];
      if (quote) {
        if (current === '\\') { cursor += 2; continue; }
        if (current === quote) quote = '';
      } else if (current === '"' || current === "'") {
        quote = current;
      } else if (padded.startsWith('/*', cursor)) {
        const close = padded.indexOf('*/', cursor + 2);
        cursor = close === -1 ? length : close + 2;
        continue;
      } else if (current === '{') {
        depth += 1;
      } else if (current === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    if (depth !== 0) break;

    blocks.push({ header, body: source.slice(rawIndex(open + 1), rawIndex(cursor)) });
    index = cursor + 1;
  }
  return blocks;
}

/** Alle Deklarationen eines Blockinhalts, ohne die Deklarationen verschachtelter Bloecke. */
function declarations(body: string): Map<string, string> {
  const flat = body.replace(/\{[^{}]*\}/g, '');
  const found = new Map<string, string>();
  for (const piece of flat.split(';')) {
    const separator = piece.indexOf(':');
    if (separator <= 0) continue;
    found.set(piece.slice(0, separator).trim().toLowerCase(), piece.slice(separator + 1).trim());
  }
  return found;
}

/** Die Selektoren eines Blocks, normalisiert auf einfache Leerzeichen. */
function selectorsOf(block: CssBlock): string[] {
  return block.header.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim());
}

/** Alle Selektoren des Stylesheets, auch die in `@media`-Bloecken. */
function allSelectors(blocks: CssBlock[]): string[] {
  const selectors: string[] = [];
  for (const block of blocks) {
    const nested = cssBlocks(block.body);
    if (nested.length) {
      selectors.push(...allSelectors(nested));
      continue;
    }
    if (block.header.startsWith('@')) continue;
    selectors.push(...selectorsOf(block));
  }
  return selectors;
}

// Die Datei ist der Beleg, also wird zuerst geprueft, dass ueberhaupt etwas eingelesen wurde.
if (!STYLE_SOURCE.includes('forced-colors: active')) {
  throw new Error(`${STYLE_PATH} nennt keinen forced-colors-Kontext`);
}

/**
 * NUR der Tasks-Abschnitt der Datei. Ohne diese Eingrenzung wuerde ein Selektor wie
 * `[data-vgt-tasks-root="true"] button` auch in einem fremden Modulblock gefunden - die Datei
 * traegt denselben Regeltext fuer Notes, PDF Studio, Whiteboard, Forms und Vault. Die Grenze ist
 * der Aufgabenkommentar, den die Schwestermodelle jeweils selbst mitbringen; er wird GANZ
 * eingelesen, sonst bliebe ein Kommentarende im ersten Selektor stehen (gemessen: genau das war
 * ein Fehler in dieser Datei).
 */
const TASKS_MARKER = STYLE_SOURCE.indexOf('Astraea Tasks / Work Management accessibility');
if (TASKS_MARKER === -1) throw new Error(`der Tasks-Abschnitt fehlt in ${STYLE_PATH}`);
const TASKS_SECTION_START = STYLE_SOURCE.lastIndexOf('/*', TASKS_MARKER);
const NEXT_SECTION_START = STYLE_SOURCE.indexOf('Astraea Planner accessibility', TASKS_MARKER);
const TASKS_SECTION = STYLE_SOURCE.slice(
  TASKS_SECTION_START === -1 ? TASKS_MARKER : TASKS_SECTION_START,
  NEXT_SECTION_START === -1 ? STYLE_SOURCE.length : STYLE_SOURCE.lastIndexOf('/*', NEXT_SECTION_START),
);
const TASKS_BLOCKS = cssBlocks(TASKS_SECTION);
const TASKS_FORCED_COLORS_RULES = TASKS_BLOCKS
  .filter((block) => block.header.startsWith('@media') && block.header.includes('forced-colors: active'))
  .flatMap((block) => cssBlocks(block.body));

describe('M06-Z1274 — der Fokusring gehoert der Tasks-Wurzel, nicht dem Dokument', () => {
  it('traegt eine sichtbare :focus-visible-Regel am Tasks-Wurzelknoten', () => {
    const rule = TASKS_BLOCKS.find((block) => !block.header.startsWith('@') && selectorsOf(block).includes(`${TASKS_ROOT} :focus-visible`));
    expect(rule, `keine Regel "${TASKS_ROOT} :focus-visible" im Tasks-Abschnitt von ${STYLE_PATH}`).toBeDefined();
    const style = declarations(rule!.body);
    expect(style.get('outline'), 'der Fokusring muss ein sichtbarer Umriss sein, nicht "none"').toContain('2px solid');
    expect(style.get('outline-offset')).toBe('2px');
  });

  it('verlangt fuer den Fokusring keinen Zustand, den nur eine Maus herstellt', () => {
    // `:focus` statt `:focus-visible` waere auch bei einem Mausklick sichtbar; die Zusage ist die
    // Tastaturfuehrung, deshalb muss der Selektor `:focus-visible` heissen.
    const selectors = allSelectors(TASKS_BLOCKS);
    expect(selectors, `keine :focus-visible-Regel an ${TASKS_ROOT}`).toContain(`${TASKS_ROOT} :focus-visible`);
    expect(selectors, `eine reine :focus-Regel an ${TASKS_ROOT} waere kein Tastaturnachweis`).not.toContain(`${TASKS_ROOT} :focus`);
  });
});

describe('M06-Z1274 — High-Contrast: der forced-colors-Block deckt die Tasks-Flaeche wirklich', () => {
  it('stellt die Tasks-Flaeche und alle Nachfahren auf automatische Systemfarben um', () => {
    expect(TASKS_FORCED_COLORS_RULES.length, `kein "@media (forced-colors: active)"-Block im Tasks-Abschnitt`).toBeGreaterThan(0);
    const adjust = TASKS_FORCED_COLORS_RULES.find((block) => selectorsOf(block).includes(TASKS_ROOT)
      && declarations(block.body).get('forced-color-adjust') === 'auto');
    expect(adjust, `im forced-colors-Block fehlt ${TASKS_ROOT} { forced-color-adjust: auto }`).toBeDefined();
    // Und die Nachfahren erben die Umstellung nur, wenn sie im Selektor stehen.
    expect(selectorsOf(adjust!), 'der Selektor muss auch die Kinder erfassen').toContain(`${TASKS_ROOT} *`);
  });

  it('gibt jedem Bedienelement im erzwungenen Kontrastmodus eine Systemrandfarbe', () => {
    for (const control of ['button', 'input', 'select', 'textarea', '[role="button"]']) {
      const expected = `${TASKS_ROOT} ${control}`;
      const rule = TASKS_FORCED_COLORS_RULES.find((block) => selectorsOf(block).includes(expected));
      expect(rule, `im forced-colors-Block des Tasks-Abschnitts fehlt der Selektor "${expected}"`).toBeDefined();
      expect(declarations(rule!.body).get('border'), `${expected} braucht eine ButtonText-Randfarbe`).toContain('ButtonText');
    }
  });

  it('ersetzt im Kontrastmodus den Marken-Fokusring durch die Systemfarbe Highlight', () => {
    const rule = TASKS_FORCED_COLORS_RULES.find((block) => selectorsOf(block).includes(`${TASKS_ROOT} :focus-visible`));
    expect(rule, `im forced-colors-Block fehlt ${TASKS_ROOT} :focus-visible`).toBeDefined();
    const style = declarations(rule!.body);
    expect(style.get('outline')).toContain('Highlight');
    expect(style.get('outline'), 'im Kontrastmodus darf nicht die Markenfarbe stehen').not.toContain('var(--vgt-focus');
    expect(style.get('outline-offset')).toBe('2px');
  });

  it('haelt den Tasks-Abschnitt von den Schwesternmodulen getrennt', () => {
    // Die Schwestermodelle tragen denselben Regeltext. Wuerde nur EIN Modul die Regeln tragen,
    // faellt das hier auf: der Tasks-Abschnitt muss sie selbst enthalten.
    const sectionSelectors = allSelectors(TASKS_BLOCKS);
    expect(sectionSelectors, 'der Tasks-Abschnitt nennt keine Tasks-Wurzel').toContain(TASKS_ROOT);
    expect(
      sectionSelectors.some((selector) => selector.includes('data-vgt-whiteboard-root')),
      'der Whiteboard-Abschnitt darf nicht im Tasks-Abschnitt liegen',
    ).toBe(false);
  });
});

