import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// DEF-RE-005 · Ergänzung 7: „Whiteboard hat keine überlappenden oder unzugänglichen Werkzeugleisten."
//
// ## Was gemessen wurde (Runde 165)
//
// Die Manipulationsleiste hat 19 Knöpfe. Aus den Literalen gerechnet:
//
//   Knopfbreite  px-2 (16 px) + Label bei text-[9px] + Rand   ≈ 40–90 px
//   19 Knöpfe + 18 Lücken à gap-1 (4 px)                      ≈ 900–1700 px
//   Budget       max-w-[min(94vw,1180px)]                     ≤ 1180 px
//
// ⟹ **Der Umbruch war gewiss.** Zwei Zeilen à 19–24 px + 4 px Lücke = **42–52 px** gegen ein Budget von
// **48 px** (Manipulation bei `top-16` = 64 px, Textleiste bei `top-28` = 112 px). **Das Ergebnis hing an der
// geerbten `line-height` — 1.0 → kein Überlappen, 1.5 → Überlappen.**
//
// ## Und der verbindliche Standard entschied es unabhängig davon
//
//   §10.5 Touch   „Touch Targets müssen ausreichend groß sein."
//   §21.1 Pflicht „ausreichend große Touch Targets"
//   §6.4          „Design wird niemals absichtlich unleserlich gemacht"
//
// **Die Messung fand die Verstösse in DREI von vier Toolbars:**
//
//   WhiteboardManipulationToolbar.tsx   8 × text-[9px]    (Runde 167 behoben)
//   WhiteboardInkToolbar.tsx            7 × text-[10px]   (Runde 168 behoben)
//   WhiteboardTextToolbar.tsx           5 × text-[9px]    (Runde 168 behoben)
//
// `text-[9px]` mit `py-1` ergibt **19–24 px** — unter dem WCAG-2.2-AA-Minimum von 24 px und weit unter den
// empfohlenen 44 px. **Ein Befund, auch wenn die Leiste nie überlappt.**
//
// ## Die Reparatur
//
//   1. Schriftgrösse auf **`text-[11px]`**, `py-1` → **`py-1.5`**  → Zielhöhe ≈ 26 px, AA erfüllt
//   2. `max-h-[44px] overflow-y-auto` auf der Manipulationswurzel → **der Umbruch erreicht die 48 px nicht**
//
// **Punkt 2 ist der Kern:** er beantwortet die `line-height`-Frage nicht, sondern macht sie gegenstandslos.
//
// ## Warum diese Zusicherungen statisch sind
//
// Es gibt kein jsdom in dieser Umgebung; gerenderte Höhen sind nicht messbar. Diese Klasse von Defekt ist
// aber **vollständig aus den Klassennamen entscheidbar** — und genau das war die Messung.
//
// **Mutationsgeprüft (Runde 167):** das Entfernen von `max-h-[44px]` macht die Höhenzusicherung rot.

const TOOLBAR_DIR = path.resolve(__dirname, '../../toolbar');
const toolbarCss = fs.readFileSync(path.join(TOOLBAR_DIR, 'WhiteboardToolbar.css'), 'utf8');

/** Every whiteboard toolbar that renders interactive controls. */
const TOOLBARS = [
  'WhiteboardManipulationToolbar.tsx',
  'WhiteboardInkToolbar.tsx',
  'WhiteboardTextToolbar.tsx',
];

const sources = new Map(
  TOOLBARS.map((name) => [name, fs.readFileSync(path.join(TOOLBAR_DIR, name), 'utf8')]),
);
const manipulation = sources.get('WhiteboardManipulationToolbar.tsx')!;

describe('Whiteboard toolbars — DEF-RE-005 repaired, not just measured', () => {
  it('bounds the contextual row height, so a wrap can never overlap the neighbour rows', () => {
    // Round 43: the context toolbars are no longer absolute overlays; they are in-flow rows inside
    // `whiteboard-toolbar-region`. The overlap class of defect is answered structurally (rows stack),
    // and the row still bounds itself and scrolls instead of clipping.
    expect(toolbarCss, 'context rows are bounded').toMatch(/\.whiteboard-toolbar__context\s*\{[^}]*max-height:/s);
    expect(toolbarCss, 'and the overflowing controls stay reachable').toMatch(/\.whiteboard-toolbar__context\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(manipulation, 'manipulation toolbar joined the in-flow region').toContain('data-vgt-whiteboard-context="manipulation"');
  });

  it.each(TOOLBARS)('gives %s a legible label size and touch-target padding', (name) => {
    const source = sources.get(name)!;
    // §6.4: 9 px and 10 px text are not legible. §10.5 / §21.1: at least 24 px of target.
    expect(source, `${name} must not use 9 px labels`).not.toContain('text-[9px]');
    expect(source, `${name} must not use 10 px labels`).not.toContain('text-[10px]');
    expect(source, `${name} must raise its vertical padding`).toContain('py-1.5');
  });

  it('no longer stacks the context rows on hard-coded absolute offsets', () => {
    // The old defect: manipulation at `top-16`, text at `top-28`, ink at `top-[62px]` — three absolute
    // overlays over the same strip. They are now rows in the same flex column.
    expect(manipulation, 'no absolute overlay anchor').not.toContain('absolute left-4 top-16 z-30');
    expect(sources.get('WhiteboardTextToolbar.tsx')!, 'no absolute overlay anchor').not.toContain('absolute left-4 top-28 z-30');
    expect(sources.get('WhiteboardInkToolbar.tsx')!, 'no absolute overlay anchor').not.toContain('absolute left-1/2 top-[62px] z-30');
    for (const [name, source] of sources) {
      expect(source, `${name} uses the shared context row class`).toContain('whiteboard-toolbar__context');
    }
  });
});
