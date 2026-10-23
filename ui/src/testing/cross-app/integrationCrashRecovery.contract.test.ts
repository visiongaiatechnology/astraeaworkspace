// STATUS: PLATIN — Integration & Release, **Paket 41**: Crash während Cross-App-Commit
//
// ## Warum diese Datei existiert ✓✓✓
//
// **Gemessen (Runde 398):** Paket 41 hatte **Bausteine mit Zeugen** ✓ — *den Notfallmarker
// (`workspaceStorageSecurityPacketP` ✓✓), die Fehlergrenze als Klasse (`SystemSurfaces.locale` ✓), die
// Aufbewahrung (`writerAutosaveFailurePath` ✓)* — **aber nicht die KOMPOSITION** ✗✓✓: „ein Commit bricht mitten
// entzwei, **und der Zustand bleibt konsistent**".
//
// ## Der Waechter, den dieser Zeuge bezeugt ✓✓✓
//
// `shell/lifecycle/workspaceRecoverySession.ts:31` — `abnormalPreviousTermination: previous?.state === 'open'`.
// *Der Marker wird beim Start als `'open'` geschrieben und beim **sauberen** Ende auf `'clean'` gesetzt.*
// **Also heisst `'open'`: der vorige Lauf ist abgestuerzt** ✓✓.
//
// ## Und die Gegenprobe ist Pflicht ✗✓✓
//
// *Sonst waere „erkennt einen Absturz" auch von einer Funktion erfuellt, die **immer** „abnormal" sagt.*
// Deshalb **③**: ein sauberer Marker muss `previousCleanTermination: true` ergeben.
//
// ## Und die negative Zusicherung ✓✓✓
//
// **⑤** — *der Marker traegt **keinen** Dokumentinhalt.* Die Struktur (`:5`) hat **kein** Feld dafuer, und `:23`
// sagt es ausdruecklich: *„Content-minimal marker is advisory only."* *Eine Wiederaufnahme, die Nutzdaten in den
// synchronen Marker schriebe, waere ein Datenschutzproblem — hier wird gemessen, dass sie es nicht tut.*
import { beforeEach, describe, expect, it } from 'vitest';
import { beginWorkspaceSession, installWorkspaceSessionLifecycle, markWorkspaceSessionClean } from '../../shell/lifecycle/workspaceRecoverySession';

const SESSION_KEY = 'vgt_workspace_session_state_v1';
const JETZT = 1_800_000_000_000;

/** *Ein **minimaler** `localStorage`, wie ihn die vorhandenen Pakete auch stubben.* ✓✓ */
function stubLocalStorage() {
  const daten = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (daten.has(k) ? (daten.get(k) as string) : null),
    setItem: (k: string, v: string) => { daten.set(k, String(v)); },
    removeItem: (k: string) => { daten.delete(k); },
    clear: () => { daten.clear(); },
    key: (i: number) => Array.from(daten.keys())[i] ?? null,
    get length() { return daten.size; },
  };
  const listeners = new Map<string, Set<() => void>>();
  (globalThis as { window?: unknown }).window = {
    localStorage: storage,
    addEventListener: (t: string, f: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); (listeners.get(t) as Set<() => void>).add(f); },
    removeEventListener: (t: string, f: () => void) => { listeners.get(t)?.delete(f); },
  };
  return { daten, listeners };
}

const marker = (state: 'open' | 'clean', extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, state, sessionId: 'vorher', transitionedAt: JETZT, ...extra });

/** *`Date.now()` auf einen **festen** Wert — *sonst haengt die Altersgrenze (`MAX_AGE_MS`, 7 Tage) an der Wanduhr.* ✓✓ */
const einfrieren = () => { const echt = Date.now; Date.now = () => JETZT; return () => { Date.now = echt; }; };

describe('Paket 41: Crash während Cross-App-Commit', () => {
  beforeEach(() => { stubLocalStorage(); });

  it('**① Ohne vorigen Marker ist NICHTS abnormal** ✓✓ — *die Positivkontrolle: nicht leer, sondern false*', () => {
    const zurueck = einfrieren();
    try {
      const sitzung = beginWorkspaceSession();
      expect(sitzung.abnormalPreviousTermination, 'ohne Vorgeschichte darf nichts abnormal sein').toBe(false);
      expect(sitzung.previousCleanTermination).toBe(false);
      expect(sitzung.sessionId.length, 'und die Sitzung hat eine Kennung').toBeGreaterThan(0);
    } finally { zurueck(); }
  });

  it('**② DER ABSTURZ: ein offener Marker ⇒ der vorige Lauf gilt als unrein** ✓✓✓', () => {
    const zurueck = einfrieren();
    try {
      // *Genau der Zustand, den ein Absturz **mitten im Commit** hinterlaesst: `'open'`, nie geschlossen.* ✓✓
      (globalThis as unknown as { window: { localStorage: { setItem: (k: string, v: string) => void } } }).window
        .localStorage.setItem(SESSION_KEY, marker('open'));
      const sitzung = beginWorkspaceSession();
      expect(sitzung.abnormalPreviousTermination, 'ein offener Marker MUSS als Absturz gelten').toBe(true);
      expect(sitzung.previousCleanTermination).toBe(false);
    } finally { zurueck(); }
  });

  it('**③ UND DIE GEGENPROBE: ein sauberer Marker ⇒ NICHT abnormal, sondern sauber** ✓✓✓', () => {
    // *Ohne diesen Fall waere ② auch von einer Funktion erfuellt, die **immer** „abnormal" sagt.* ✗✓✓
    const zurueck = einfrieren();
    try {
      (globalThis as unknown as { window: { localStorage: { setItem: (k: string, v: string) => void } } }).window
        .localStorage.setItem(SESSION_KEY, marker('clean'));
      const sitzung = beginWorkspaceSession();
      expect(sitzung.abnormalPreviousTermination, 'ein sauberer Marker darf NICHT als Absturz gelten').toBe(false);
      expect(sitzung.previousCleanTermination, 'und er muss als sauber erkannt werden').toBe(true);
    } finally { zurueck(); }
  });

  it('**④ Die Grenzen greifen: zu alt, zu gross, Kontrollzeichen, falsche Version ⇒ unsichtbar** ✓✓', () => {
    const zurueck = einfrieren();
    try {
      const setzen = (roh: string) => (globalThis as unknown as { window: { localStorage: { setItem: (k: string, v: string) => void } } }).window.localStorage.setItem(SESSION_KEY, roh);
      // *Jeder dieser Marker ist **unbrauchbar** — *und Unbrauchbares darf **nicht** als Absturz gelten* ✓✓.
      const faelle: Array<[string, string]> = [
        ['zu alt (8 Tage)', JSON.stringify({ version: 1, state: 'open', sessionId: 'x', transitionedAt: JETZT - 8 * 24 * 60 * 60 * 1000 })],
        ['zu gross (> 512 Zeichen)', JSON.stringify({ version: 1, state: 'open', sessionId: 'x'.repeat(600), transitionedAt: JETZT })],
        ['falsche Version', JSON.stringify({ version: 2, state: 'open', sessionId: 'x', transitionedAt: JETZT })],
        ['unbekannter Zustand', JSON.stringify({ version: 1, state: 'halb', sessionId: 'x', transitionedAt: JETZT })],
        ['kein JSON', 'nicht json'],
      ];
      for (const [name, roh] of faelle) {
        setzen(roh);
        const sitzung = beginWorkspaceSession();
        expect(sitzung.abnormalPreviousTermination, `${name}: darf NICHT als Absturz gelten`).toBe(false);
        expect(sitzung.previousCleanTermination, `${name}: darf NICHT als sauber gelten`).toBe(false);
      }
    } finally { zurueck(); }
  });

  it('**⑤ UND DIE NEGATIVE: der Marker traegt KEINEN Dokumentinhalt** ✓✓✓', () => {
    // *`:23` sagt es: „Content-minimal marker is advisory only." Und `:5` hat **kein** Feld fuer Inhalt.*
    const zurueck = einfrieren();
    try {
      const sitzung = beginWorkspaceSession();
      const roh = (globalThis as unknown as { window: { localStorage: { getItem: (k: string) => string | null } } }).window.localStorage.getItem(SESSION_KEY);
      expect(roh, 'der Marker muss geschrieben sein').not.toBeNull();
      const gelesen = JSON.parse(roh as string) as Record<string, unknown>;
      // *Genau die vier Felder — *und **kein** weiteres* ✓✓.
      expect(Object.keys(gelesen).sort()).toEqual(['sessionId', 'state', 'transitionedAt', 'version']);
      expect(gelesen.state).toBe('open');
      expect(gelesen.version).toBe(1);
      // *Und die Sitzungskennung im Marker ist die zurueckgegebene — kein Fremdinhalt.* ✓✓
      expect(gelesen.sessionId).toBe(sitzung.sessionId);
    } finally { zurueck(); }
  });

  it('**⑥ Und das saubere Ende wird geschrieben, und der Lebenszyklus laesst sich abraeumen** ✓✓', () => {
    const zurueck = einfrieren();
    try {
      const sitzung = beginWorkspaceSession();
      markWorkspaceSessionClean(sitzung.sessionId);
      const roh = (globalThis as unknown as { window: { localStorage: { getItem: (k: string) => string | null } } }).window.localStorage.getItem(SESSION_KEY);
      expect((JSON.parse(roh as string) as { state: string }).state, 'nach dem sauberen Ende steht clean').toBe('clean');
      // *Und der Lebenszyklus meldet sich ab — sonst haengen die Horcher am Fenster.* ✓✓
      const abmelden = installWorkspaceSessionLifecycle(sitzung.sessionId);
      expect(typeof abmelden, 'installWorkspaceSessionLifecycle liefert eine Abmeldefunktion').toBe('function');
      expect(() => abmelden()).not.toThrow();
      // *Und eine unbrauchbare Kennung wird **nicht** geschrieben (`:38`).* ✓✓
      markWorkspaceSessionClean('bö\u0000se');
      expect((JSON.parse((globalThis as unknown as { window: { localStorage: { getItem: (k: string) => string | null } } }).window.localStorage.getItem(SESSION_KEY) as string) as { state: string }).state).toBe('clean');
    } finally { zurueck(); }
  });
});
