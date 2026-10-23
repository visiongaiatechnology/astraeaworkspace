// STATUS: PLATIN — Strukturwächter: eine Definition der IME-Komposition (W-279, vollständig)
//
// Die **Verknüpfung** `isComposing || …` in einer Komponente ist eine eigene Prüfung — und war in sechs Fällen
// **schwächer** als die gemeinsame Regel, weil sie `key === 'Process' | 'Dead'` verpasste. Bei einer laufenden
// Eingabekomposition (japanisch, chinesisch, koreanisch, Akzente) lief die Tastenkombination damit mitten im
// Tippen. Zwei weitere Stellen trugen eine **gleichwertige Kopie**, die auseinanderlaufen kann.
//
// Batch 1 (Runde 67) stellte drei Stellen um und begrenzte den Wächter bewusst auf sie, weil die übrigen bei
// fremden Bearbeitern lagen. Diese Bearbeiter sind inzwischen abgebrochen, die Bereiche sind frei — **jetzt
// gilt der Wächter für alle Stellen**. Er ist damit ein Beispiel für „eine Definition statt mehrerer".
//
// Als `.mjs`, weil hier mit `node:fs` gelesen wird und der UI-Typsichtbereich `node:fs` nicht kennt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const umgestellt = [
  // Batch 1
  'src/apps/admin-policy/panels/AdminPolicyView.tsx',
  'src/apps/publish/PublishView.tsx',
  'src/shell/global-search/components/SearchHubPanel.tsx',
  // Batch 2
  'src/apps/connect/components/ConnectView.tsx',
  'src/apps/insight/views/InsightView.tsx',
  'src/apps/draw/canvas/DrawCanvas.tsx',
  'src/apps/connect/integrations/search.ts',
  'src/apps/grid/editing/controllers/useGridKeyboardController.ts',
  'src/apps/automate/app/AutomateView.tsx',
];

/** Kommentare entfernen: eine Erwähnung im Kommentar ist **kein** Aufruf. */
const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('jede Stelle prüft die IME-Komposition mit der gemeinsamen Regel', () => {
  for (const file of umgestellt) {
    it(`${file}`, () => {
      const text = ohneKommentare(readFileSync(file, 'utf8'));
      expect(text, 'eigene keyCode-229-Prüfung gefunden').not.toMatch(/keyCode\s*===?\s*229/u);
      // Verboten ist die **Verknüpfung** (eine eigene Prüfung), nicht das Weiterreichen des Wertes: der
      // gemeinsame Aufruf übergibt `isComposing` ausdrücklich als Argument.
      expect(text, 'eigene isComposing-Verknüpfung gefunden').not.toMatch(/isComposing\s*\|\|/u);
      expect(text, 'Aufruf von isImeCompositionEvent fehlt').toContain('isImeCompositionEvent(');
      expect(text, 'Import der gemeinsamen Regel fehlt').toMatch(/import \{[^}]*isImeCompositionEvent[^}]*\} from/u);
    });
  }
});

describe('die gemeinsame Regel ist die einzige Definition', () => {
  // Genau die Dateien, in denen Kopien gefunden wurden. Eine Kopie ist das, was W-279 erzeugt hat — sie kann
  // von der gemeinsamen Regel abweichen, ohne dass es jemandem auffällt.
  const hatteKopie = [
    'src/apps/automate/nodes/automateAccessibilityEngine.ts',
    'src/apps/connect/integrations/search.ts',
  ];

  for (const file of hatteKopie) {
    it(`${file} definiert keine eigene IME-Regel mehr`, () => {
      const text = ohneKommentare(readFileSync(file, 'utf8'));
      expect(text, 'zweite Definition gefunden').not.toMatch(/function isImeComposition\s*\(/u);
      expect(text, 'eigene keyCode-229-Prüfung gefunden').not.toMatch(/keyCode\s*===?\s*229/u);
    });
  }
});
