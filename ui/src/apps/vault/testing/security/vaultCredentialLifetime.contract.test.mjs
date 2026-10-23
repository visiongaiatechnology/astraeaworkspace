// STATUS: PLATIN — Quellvertrag: der Sperrpfad **ruft** den Ausweis-Lebenszyklus auf.
//
// **Warum diese Datei zusätzlich zum Laufzeitzeugen existiert.** Der P0 war ein **fehlender Aufruf**: der
// Sperrpfad persistierte den Sperrzustand (`VaultFreeRuntime.tsx:375`) und ließ den PIN in `documentPins`
// stehen. Ein reiner Laufzeittest führt die Zustandsmaschine aus und kann deshalb grün sein, während im
// Rahmen die Zeile fehlt, die sie aufruft — genau die Fehlerklasse, die dieses Projekt als „vorhanden, aber
// unerreichbar" schon mehrfach gemessen hat. Umgekehrt sieht ein Quellvertrag die Zeile, aber nicht die
// Richtung. Deshalb steht die Zusage **zweimal**: ausgeführt in `vaultCredentialLifetime.test.ts`, verdrahtet
// hier.
//
// Absichtlich als `.mjs`: TypeScript-Testdateien haben in diesem Projekt keine Node-Typdeklarationen
// (`node:fs` → TS2307) — dieselbe Begründung wie in `vaultRuntimeLockWiring.contract.test.mjs`.
//
// **Eigener Fehler, hier vermieden:** Die erste Fassung dieser Datei benutzte `expect(quelltext).toMatch(…)`.
// Bei einem Fehlschlag schreibt Vitest dann die **gesamte** Quelldatei in den Fehlerbericht — der erste
// Rot-Lauf erzeugte 891 Zeilen Ausgabe, in denen die eigentliche Zusicherung kaum zu finden war. Eine
// 890-zeilige Ausgabe sieht wie ein Ergebnis aus und ist keines. Jede Zusicherung unten prüft deshalb einen
// **Booleschen** und nennt die gesuchte Zeile im Klartext.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

/** Zeilenenden auf `\n` normalisieren — ein CRLF-Anker gegen eine LF-Datei trifft nie (Lehre aus Runde 262). */
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8').replace(/\r\n/gu, '\n');

/** Kommentare entfernen, damit ein entferntes Verhalten nicht über einen Kommentar „besteht". */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');

const FRAME = 'src/app/WorkspaceApplicationFrame.tsx';
const APP = 'src/app/App.tsx';
const ACTIONS = 'src/shell/workspace/useWorkspaceActions.ts';
const RUNTIME = 'src/edition/open-core/apps/vault/VaultFreeRuntime.tsx';
const HELPER = 'src/shared/vault/security/vaultCredentialLifecycle.ts';
const PERSISTENCE = 'src/shared/vault/persistence/vaultPersistenceEngine.ts';

/** Prüft ein Muster und nennt bei Fehlschlag die **gesuchte** Zeile — nicht die ganze Datei. */
function expectMatch(source, pattern, message) {
  expect(pattern.test(source), `${message} (gesucht: ${String(pattern)})`).toBe(true);
}

function expectNoMatch(source, pattern, message) {
  const found = source.match(pattern);
  const evidence = found === null ? '' : `<${found[0].slice(0, 120)}>`;
  expect(found === null, `${message} (gefunden: ${evidence})`).toBe(true);
}

/**
 * Schneidet den Ausweis-Effekt über **Klammerbilanz** aus, nicht über ein Zeichenfenster.
 *
 * **Zwei eigene Fehler sind hier bereits korrigiert:**
 *   1. In `vaultRuntimeLockWiring.contract.test.mjs` stand zuerst ein Fenster `slice(start, start + 400)`; es
 *      lief in den nächsten Handler hinein und meldete dort ein Muster, das im eigentlichen Handler nur als
 *      Erklärung stand. *Ein Fenster ist keine Struktur.*
 *   2. Diese Funktion nahm zuerst den Anker `const transition = vaultLockTransitionOf(` und suchte die erste
 *      `{` **danach** — das ist die Destrukturierung `{ next: … }` in der Zuweisung, nicht der Rumpf. Der
 *      Ausschnitt war 52 Zeichen lang und die Zusicherung meldete „leer". Der Anker ist jetzt
 *      `useEffect(() => {` und die Bilanz endet bei `}, [`.
 */
function effectBodyOf(source, anchor) {
  const start = source.indexOf(anchor);
  expect(start, `Effekt nicht gefunden: ${anchor}`).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  const FIRST_BODY_LENGTH = 100;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') continue;
    if (source[index] !== '}') continue;
    // Das Ende ist die schließende Klammer, hinter der `, [` (die Abhängigkeitsliste) folgt.
    if (/^\},\s*\[/u.test(source.slice(index, index + 8)) && index - open > FIRST_BODY_LENGTH) {
      return source.slice(open, index + 1);
    }
  }
  throw new Error(`Effekt nicht abgeschlossen: ${anchor}`);
}

/** Die Zeilennummern, auf denen ein Muster trifft — für eine kurze, belegte Meldung. */
function linesMatching(source, pattern) {
  return source.split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((entry) => pattern.test(entry.line))
    .map((entry) => `${entry.number}: ${entry.line}`);
}

describe('Quellvertrag: der Sperrpfad nimmt den Ausweis mit', () => {
  it('der Rahmen (Eigentümer der beiden Karten) benutzt den Lebenszyklus-Helfer', () => {
    const frame = stripComments(read(FRAME));
    expectMatch(frame, /from '\.\.\/shared\/vault\/security\/vaultCredentialLifecycle'/u,
      'Der Rahmen muss den Ausweis-Lebenszyklus importieren');
    expectMatch(frame, /\bapplyVaultCredentialRevocation\b/u,
      'Die Rücknahme des Ausweises muss als benannte Funktion vorhanden sein');
    expectMatch(frame, /\bvaultCredentialStateFor\b/u,
      'Der gehaltene Ausweis muss aus den beiden Karten abgeleitet werden');
    // Der Sperrvermerk wird aus **demselben** Träger gelesen, den der Sperrpfad schreibt.
    expectMatch(frame, /from '\.\.\/shared\/vault\/persistence\/vaultPersistenceEngine'/u,
      'Der Rahmen muss den Sperrvermerk-Träger importieren');
    expectMatch(frame, /\breadVaultLockRecord\(/u,
      'Der Rahmen muss den Sperrvermerk lesen');
    // Und die Rücknahme wird wirklich **aufgerufen** — beide Achsen.
    expectMatch(frame, /\bsetDocumentPins\(/u, 'Der PIN-Setzer muss aufgerufen werden');
    expectMatch(frame, /\bsetDocumentPasswords\(/u, 'Der Kennwort-Setzer muss aufgerufen werden');
    expectMatch(frame, /applyVaultCredentialRevocation\(\s*\{[^}]*\}\s*,\s*activeDocId\s*\)/u,
      'Die Rücknahme muss mit den beiden Karten und der aktiven Dokumentkennung aufgerufen werden');
  });

  it('die Richtung ist im Rahmen aus dem Vermerk abgeleitet, nicht aus einem zweiten Sperrzustand', () => {
    const frame = stripComments(read(FRAME));
    expectMatch(frame, /\bvaultLockTransitionOf\(/u,
      'Der Übergang des Sperrvermerks muss verglichen werden');
    expectMatch(frame, /\bnoVaultLockTransition\(/u,
      'Der Ausgangswert des Vergleichs muss der vermerktreue Nicht-Übergang sein');
    expectNoMatch(frame, /runtimeLocked/u,
      'Der Rahmen darf keinen zweiten Sperrzustand führen (das war die Fehlerklasse des P0)');
    // Der Rahmen liest den Vermerk des **aktiven** Dokuments.
    expectMatch(frame, /readVaultLockRecord\(activeDoc\)/u,
      'Der Vermerk muss vom aktiven Dokument gelesen werden');
  });

  /**
   * **Der eigentliche Quellvertrag — der Effektblock, verdichtet auf Leerraum.**
   *
   * *Warum das nötig war (eigener Fehler):* die erste Fassung dieses Vertrags prüfte nur, dass **irgendwo**
   * `applyVaultCredentialRevocation(`, `vaultLockTransitionOf(` und die beiden Setzer vorkommen. Zwei
   * Mutationen — „die Rücknahme abgeschaltet (`if (false) return;`)" und „die Richtung umgedreht" — blieben
   * damit **grün**: die Namen waren alle noch da, nur die Bedingung war es nicht mehr. Ein Vertrag, der nur
   * Namen sieht, sieht keine Richtung.
   *
   * Die verdichtete Form ist der Text ohne Zeilenumbrüche und mit einfachen Leerzeichen. Eine Invertierung
   * ändert diesen Text, und **nur** die invertierte Form ist hier zulässig — deshalb fällt sie auf.
   */
  it('der Effektblock selbst ist auf den Leerraum verdichtet festgehalten (Richtung als Text)', () => {
    const source = stripComments(read(FRAME));
    // Der Anker ist der Ref des Effekts, nicht die erste `useEffect(() => {` der Datei: der Rahmen hat
    // mehrere Effekte, und der erste gehört nicht hierher.
    const anchor = source.indexOf('const appliedVaultLock');
    expect(anchor, 'Der Ref des Ausweis-Effekts fehlt').toBeGreaterThan(-1);
    const effect = effectBodyOf(source.slice(anchor), 'useEffect(() => {');
    const compact = effect.replace(/\s+/gu, ' ').trim();
    // Gegenprobe: es wurde wirklich ein Rumpf ausgeschnitten und kein leeres Fenster.
    expect(compact.length, `Der Effektausschnitt ist zu kurz: ${compact}`).toBeGreaterThan(80);
    const required = [
      // Der Übergang wird aus dem **vorigen** Vermerk und dem aktuellen Dokument gebildet.
      'vaultLockTransitionOf(appliedVaultLock.current.next, readVaultLockRecord(activeDoc))',
      // Der gehaltene Ausweis wird aus beiden Karten projiziert.
      'vaultCredentialStateFor(documentPins, documentPasswords, activeDocId)',
      // Die Entscheidung ist das **Ereignis** der Zustandsmaschine — nicht eine Bedingung daneben.
      "transition.locked || transition.next.lockedAt !== null ? { type: 'vault.locked', documentId: activeDocId } : { type: 'vault.unlocked', documentId: activeDocId }",
      'vaultCredentialLifecycleTransition(held, event)',
      // Die Rücknahme wird wirklich aufgerufen — mit beiden Karten und der aktiven Dokumentkennung.
      'applyVaultCredentialRevocation({ pins: documentPins, passwords: documentPasswords }, activeDocId)',
      // Und beide Achsen werden geschrieben.
      'setDocumentPins(withoutCredential.pins)',
      'setDocumentPasswords(withoutCredential.passwords)',
    ];
    for (const line of required) {
      expect(compact.includes(line), `Im Effektblock fehlt: ${line}\nIst: ${compact}`).toBe(true);
    }
    // Genau **eine** Rücknahme im Effekt: zwei wären zwei Regeln für dieselbe Sache.
    const revocations = (effect.match(/applyVaultCredentialRevocation\(/gu) ?? []).length;
    expect(revocations, `Es darf genau einen Rücknahme-Aufruf geben, gefunden: ${revocations}`).toBe(1);
  });

  it('die abgeleiteten Werte folgen den Karten — `hasPin` kann nicht stehen bleiben', () => {
    const app = stripComments(read(APP));
    expectMatch(app, /const activeDocumentPin = documentPins\[activeDocId\] \?\? null;/u,
      '`activeDocumentPin` muss aus der Karte gelesen werden');
    expectMatch(app, /const activeDocumentPassword = documentPasswords\[activeDocId\] \?\? null;/u,
      '`activeDocumentPassword` muss aus der Karte gelesen werden');
    expectMatch(app, /hasPin: Boolean\(activeDocumentPin\)/u,
      '`hasPin` muss aus dem abgeleiteten Wert folgen');
    // Kein zweiter Ausweis-Speicher: genau zwei Karten, keine dritte.
    const maps = (app.match(/useState<Record<string, string>>\(\{\}\)/gu) ?? []).length;
    expect(maps, `Es darf genau zwei Ausweis-Karten geben, gefunden: ${maps}`).toBe(2);
  });

  it('der Öffnungspfad füllt weiterhin genau eine Achse (der Setzvertrag bleibt der Setzvertrag)', () => {
    const actions = stripComments(read(ACTIONS));
    expectMatch(actions, /if \(opened\.pinUsed\) setDocumentPins\(/u,
      'Der Öffnungspfad muss den benutzten PIN eintragen');
    expectMatch(actions, /if \(opened\.passwordUsed\) setDocumentPasswords\(/u,
      'Der Öffnungspfad muss das benutzte Kennwort eintragen');
  });

  it('der Sperrpfad schreibt den Vermerk **vor** dem Umschalten (V-010 bleibt intakt)', () => {
    const runtime = stripComments(read(RUNTIME));
    const normalise = (text) => text.replace(/\s+/gu, ' ');
    const write = normalise(runtime).indexOf(normalise('persistVaultLockRecord(document, vaultLockRecord(locked, Date.now()))'));
    const set = normalise(runtime).indexOf(normalise('setRuntimeLocked(locked)'));
    expect(write, 'Der Schreibvorgang des Sperrvermerks fehlt').toBeGreaterThan(-1);
    expect(set, 'Das Umschalten des Sperrzustands fehlt').toBeGreaterThan(-1);
    expect(write, 'Erst schreiben, dann umschalten').toBeLessThan(set);
  });

  it('kein Ausweis in einer Log-Ausgabe, einem Fehlertext, einer URL oder `localStorage`', () => {
    // Die Muster sind eng gefasst: sie treffen den **Ausweis** als Argument/Interpolation, nicht jede
    // Zeichenkette. Quelltext wird zeilenweise geprüft, damit eine Meldung die Fundstelle nennen kann.
    const checks = [
      { pattern: /console\.\w+\([^;]*\b(pin|password|credential)\b/iu, what: 'Log-Ausgabe' },
      { pattern: /localStorage[^;]*\b(pin|password|credential)\b/iu, what: 'localStorage' },
      { pattern: /(?:location\.(?:href|search|hash)|URLSearchParams)[^;]*\b(pin|password|credential)\b/iu, what: 'URL' },
      { pattern: /throw new Error\([^;]*\$\{[^}]*\b(pin|password|credential)\b/iu, what: 'Fehlertext' },
    ];
    for (const [name, relative] of [['frame', FRAME], ['helper', HELPER]]) {
      const source = stripComments(read(relative)).replace(/\n\s+/gu, ' ');
      for (const check of checks) {
        const hits = linesMatching(source, check.pattern);
        expect(hits.length, `${name}: Ausweis in einer ${check.what} — ${hits.join(' | ')}`).toBe(0);
      }
    }
  });

  it('der Helfer hält keinen zweiten Speicher und kennt React nicht', () => {
    const helper = stripComments(read(HELPER));
    expectNoMatch(helper, /from 'react'/u, 'Der Helfer darf React nicht kennen');
    expectNoMatch(helper, /\buseState\b|\buseEffect\b|\buseRef\b/u, 'Der Helfer darf keine Hooks benutzen');
    expectNoMatch(helper, /localStorage|sessionStorage|indexedDB/iu, 'Der Helfer darf nichts persistieren');
    expectNoMatch(helper, /\bwindow\b|\bdocument\./u, 'Der Helfer darf kein DOM anfassen');
    expectNoMatch(helper, /\bDate\.now\(\)/u, 'Der Helfer darf keine Uhr lesen (Ereignis statt Zeit)');
  });

  /**
   * **Der Vergleich eines Ausweises.** Der Lebenszyklus selbst vergleicht **keine** Ausweiswerte: er hält und
   * verwirft. Genau deshalb steht hier die Zusicherung, die zählt — es entsteht **keine** dritte
   * Konstant-Zeit-Funktion, und die vorhandene bleibt die eine Quelle.
   *
   * **Offengelegt (nicht Teil dieses Reparaturumfangs):** `shared/vault/security/vaultKeyPolicyEngine.ts:274`
   * vergleicht einen Ausweis weiterhin mit `supplied !== expected` — also nicht konstantzeitig. Die Behebung
   * gehört in jene Datei, die **nicht** in meinem Schreiberbereich liegt; ich habe sie deshalb **nicht**
   * angefasst und melde sie als Befund, statt sie stillschweigend zu übergehen.
   */
  it('es entsteht keine zweite Konstant-Zeit-Funktion — und die vorhandene bleibt', () => {
    const helper = stripComments(read(HELPER));
    expectNoMatch(helper, /function constantTime|constantTimeEqualBrowserBytes|timingSafeEqual/u,
      'Der Helfer darf keine Zeitkonstantheits-Funktion definieren oder nachbauen');
    const cryptoCore = stripComments(read('src/platform/crypto/cryptoCore.ts'));
    expectMatch(cryptoCore, /export function constantTimeEqualBrowserBytes\(left: Uint8Array, right: Uint8Array\): boolean/u,
      'Die vorhandene Konstant-Zeit-Funktion muss in `platform/crypto/cryptoCore.ts` bleiben');
    // Kein zweiter Klon derselben Funktion in diesem Umfang: die vorhandenen Vorkommen bleiben unverändert.
    const clones = (helper.match(/constantTime/gu) ?? []).length;
    expect(clones, `Der Helfer darf \`constantTime\` nicht erwähnen, gefunden: ${clones}`).toBe(0);
  });

  it('der Träger des Sperrvermerks bleibt der kanonische Objektvertrag', () => {
    const persistence = stripComments(read(PERSISTENCE));
    expectMatch(persistence, /export const VAULT_LOCK_RECORD_KEY/u, 'Der Trägerschlüssel muss exportiert sein');
    expectMatch(persistence, /export function readVaultLockRecord/u, 'Der Leser muss exportiert sein');
    expectMatch(persistence, /export function persistVaultLockRecord/u, 'Der Schreiber muss exportiert sein');
  });
});

/**
 * Der Rahmen ist **nicht** der Eigentümer des Sperrzustands: `runtimeLocked` lebt in `VaultFreeRuntime` und
 * wird dort aus dem Dokument abgeleitet. Dieser Rahmen liest nur den Träger. Diese Zusicherung hält fest,
 * dass hier kein zweiter Sperrzustand entsteht — die Fehlerklasse, die der P0 selbst war.
 */
describe('Quellvertrag: eine Sperre, eine Quelle', () => {
  it('kein `useState` für einen Sperrzustand im Rahmen', () => {
    const frame = stripComments(read(FRAME));
    expectNoMatch(frame, /\buseState\s*\([^)]*[Ll]ocked/u,
      'Der Rahmen darf keinen Sperrzustand halten (das war die Fehlerklasse des P0)');
  });
});
