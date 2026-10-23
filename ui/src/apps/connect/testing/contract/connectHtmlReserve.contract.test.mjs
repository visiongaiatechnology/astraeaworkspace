// STATUS: PLATIN — W-415: Der **Vorrat** für die HTML-Mail-Ansicht wird bewacht, nicht vergessen
//
// ## Die Lage, gemessen in Runde 120
//
// Der Connect-Agent hat die alte **Schwarzlisten**-Sanitisierung durch einen **tokenisierenden Allowlist**-Filter
// ersetzt und **18 gemessene Umgehungen** als Regressionstests festgehalten ✓. Gemessen ist aber: **kein**
// Produktionscode ruft ihn auf ✗, und der Mailkörper wird als **Text** gerendert ✓ (`ConnectMailViewer`:
// `body:` als Zeichenkette, **kein** `dangerouslySetInnerHTML`). **Der Code ist korrekt und unwirksam.**
//
// ## Warum dieser Vertrag die richtige Antwort ist
//
// **Text-Rendering ist das sicherste Verhalten** — es gibt heute nichts zu sandboxen ✓. HTML jetzt zu rendern,
// nur damit die Korrektur „benutzt" wird, würde eine **Angriffsfläche schaffen, um einen Vorrat zu
// legitimieren** ✗. Also wird der Vorrat **bewahrt und bewacht**:
//
//   * Solange niemand HTML rendert, ist dieser Vertrag **grün** — und ist selbst der **Nachweis**, dass die
//     beiden Module ein **Vorrat** sind und kein toter Code. (Der Vorratsvermerk steht hier, weil er hier
//     **geprüft** wird — ein Kommentar im Modul wäre eine Zusage ohne Wächter.)
//   * In dem Moment, in dem jemand HTML-Mail rendert, wird er **rot** und nennt die zwei Dinge, die dann
//     zusammen greifen müssen: **den Allowlist-Filter vor dem Rendern** und die **Sandbox-/CSP-Politik am
//     Rendering**.
//
// Die Regel dahinter: *eine Fähigkeit ohne Aufrufer ist nicht geliefert* — aber eine Fähigkeit, deren Aufrufer
// **absichtlich** fehlt, ist eine **Entscheidung**, und die muss sichtbar und geprüft sein.
//
// ## Eigener Fehler, der hier verzeichnet bleibt
//
// Ich hatte den Export `sanitizeConnectHtml` **geraten** ✗ — real heißt er **`sanitizeMailHtmlDetailed`** ✓.
// Das war der **fünfte** Fall von „raten statt lesen" in dieser Sitzung; der sechste war ein PowerShell-Parser-
// fehler an Anführungszeichen, der den ganzen Befehl **vor** jeder Wirkung abbrach ✓. Beides ist der Grund, warum
// diese Datei **ohne Shell** geschrieben wurde und die Namen **gemessen** sind.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONNECT = 'src/apps/connect';
const OHNE_KOMMENTARE = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

function alleDateien(dir, out = []) {
  for (const eintrag of readdirSync(dir)) {
    const p = join(dir, eintrag);
    if (statSync(p).isDirectory()) {
      if (!['testing', '__tests__'].includes(eintrag)) alleDateien(p, out);
    } else if (/\.(ts|tsx)$/u.test(eintrag) && !/\.test\./u.test(eintrag)) {
      out.push(p.replace(/\\/gu, '/'));
    }
  }
  return out;
}

const PRODUKTION = alleDateien(CONNECT);

describe('W-415: der HTML-Vorrat ist bewacht', () => {
  it('**niemand** rendert HTML-Mail — das ist die heutige, sichere Entscheidung', () => {
    const renderer = PRODUKTION.filter((p) => /dangerouslySetInnerHTML|srcdoc/iu.test(OHNE_KOMMENTARE(readFileSync(p, 'utf8'))));
    // Wird das rot, rendert jemand HTML: dann müssen Allowlist-Filter UND Sandbox-Politik greifen (nächster Test).
    expect(renderer, 'HTML-Rendering eingeführt — jetzt die beiden Vorratsmodule verdrahten!').toEqual([]);
  });

  it('der Mailkörper wird als Text gerendert — die Eigenschaft, die W-415 sicher macht', () => {
    const viewer = readFileSync(`${CONNECT}/components/ConnectMailViewer.tsx`, 'utf8');
    expect(OHNE_KOMMENTARE(viewer)).not.toMatch(/dangerouslySetInnerHTML/u);
    expect(viewer).toMatch(/body:/u);
  });

  it('der Allowlist-Filter ist vollständig und trägt seinen gemessenen Namen', () => {
    const filter = readFileSync(`${CONNECT}/domain/connectHtmlSanitizer.ts`, 'utf8');
    // Der **gemessene** Name. Der geratene war `sanitizeConnectHtml` ✗.
    expect(filter).toMatch(/export function sanitizeMailHtmlDetailed/u);
    // Die Allowlist-Merkmale, die die 18 Umgehungen der alten Schwarzliste schließen.
    expect(filter).toMatch(/RAW_TEXT_TAGS/u);
    expect(filter).toMatch(/export function classifyMailUrl/u);
    expect(filter).toMatch(/export function decodeHtmlEntities/u);
  });

  it('die Sandbox-/CSP-Politik steht bereit — alle drei Teile, nicht nur einer', () => {
    const politik = readFileSync(`${CONNECT}/security/connectSecurityCore.ts`, 'utf8');
    expect(politik).toMatch(/export function renderHtmlSandboxPolicy/u);
    expect(politik).toMatch(/sandbox:/u);
    expect(politik).toMatch(/csp:/u);
    expect(politik).toMatch(/remoteDefault/u);
  });

  it('der Vorrat hat **keinen** Produktionsaufrufer — der Zustand, den dieser Vertrag bewacht', () => {
    // **Ehrlich, unbequem und in Runde 121 korrigiert:** Der Filter wird **innerhalb** der App benutzt —
    // `domain/connectMailCore.ts` exportiert `sanitizeHtmlMail`, das ihn aufruft ✓. Was **niemanden** hat, ist
    // diese **äußere** Eintrittsstelle ✗. Die Kette lautet also: Filter ✓ ← `sanitizeHtmlMail` ✓ ← **niemand** ✗.
    // Genau die äußere Stelle wird hier bewacht: Dieser Test wird rot, sobald jemand die Mail-HTML-Anzeige baut
    // — und dann muss er die Sandbox-Politik **mit** verdrahten (siehe die beiden Tests darüber).
    const aufrufer = PRODUKTION.filter((p) => !p.endsWith('domain/connectMailCore.ts')
      && /sanitizeHtmlMail/u.test(OHNE_KOMMENTARE(readFileSync(p, 'utf8'))));
    expect(aufrufer).toEqual([]);
  });
});
