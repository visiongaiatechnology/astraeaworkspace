// STATUS: PLATIN — W-399: Der Speicher-Lease-Manager braucht einen Test mit **zwei Aufrufen in EINER Instanz**
//
// ## Warum diese Datei existiert
//
// Beim Anwenden von W-397 („Zustandskopien in Aktionsschichten") auf **meine eigenen** Bereiche fand ich:
// `DocumentSaveLeaseManager` ist ein **zustandstragendes** Objekt im echten Speicherpfad
// (`useWorkspaceAutosave.ts:85/149`, `versionRecoveryEngine.ts:285/312`) — und hatte **nur Produktionsverweise,
// null Testverweise** ✗. Sein Verhalten bei **mehreren** Aufrufen in **einer** Instanz war ungemessen.
//
// **Genau diese Klasse Fehler hat der Vault-Agent zweimal gefunden** (W-393, W-396): Zustand, der nur beim
// Erzeugen gelesen wird, lässt jeden zweiten Aufruf gegen die falsche Basis rechnen. *„Kein Typecheck und keine
// statische Prüfung hätte das gezeigt — nur ein Test, der zwei Aufrufe in einer Instanz macht."*
//
// **Jeder Test hier macht mindestens zwei Aufrufe an dieselbe Instanz** — und der Konstruktor nimmt eine
// `idFactory`, also sind die Tokens deterministisch und die Zusicherungen scharf.
import { describe, expect, it } from 'vitest';
import { DocumentSaveLeaseManager } from '../versionRecoveryEngine';

/** Zählende Fabrik: jede Lease bekommt einen vorhersagbaren Token. */
function managerMitZaehler() {
  let n = 0;
  return new DocumentSaveLeaseManager(() => `token-${(n += 1)}`);
}

describe('DocumentSaveLeaseManager — zwei Aufrufe in einer Instanz', () => {
  it('erwerben → freigeben → **erneut erwerben** gelingt (die Freigabe wirkt wirklich)', () => {
    const m = managerMitZaehler();
    const erste = m.acquire('doc-1', 1_000);
    m.release(erste);
    // **Der entscheidende zweite Aufruf:** Bliebe die Freigabe wirkungslos, würfe dieser Aufruf.
    const zweite = m.acquire('doc-1', 1_100);
    expect(zweite.documentId).toBe('doc-1');
    expect(zweite.token).not.toBe(erste.token);
  });

  it('zwei lebende Leases für dasselbe Dokument: die zweite wird abgelehnt', () => {
    const m = managerMitZaehler();
    m.acquire('doc-2', 1_000);
    expect(() => m.acquire('doc-2', 1_000)).toThrow(/SAVE_ALREADY_IN_PROGRESS/u);
  });

  it('eine **fremde** Freigabe löscht die Lease nicht — der Halter behält sie', () => {
    const m = managerMitZaehler();
    const echt = m.acquire('doc-3', 1_000);
    // Fremder Token, gleiche Dokument-ID: darf nichts löschen.
    m.release({ ...echt, token: 'token-fremd' });
    // Zweiter Aufruf: die Lease muss **noch** leben.
    expect(() => m.acquire('doc-3', 1_000)).toThrow(/SAVE_ALREADY_IN_PROGRESS/u);
    // Und die echte Freigabe wirkt danach immer noch.
    m.release(echt);
    expect(m.acquire('doc-3', 1_000).documentId).toBe('doc-3');
  });

  it('eine **abgelaufene** Lease blockiert nicht mehr', () => {
    const m = managerMitZaehler();
    m.acquire('doc-4', 1_000, 1_000); // läuft bei 2_000 ab
    expect(() => m.acquire('doc-4', 1_999)).toThrow(/SAVE_ALREADY_IN_PROGRESS/u);
    // Zweiter Aufruf **nach** dem Ablauf: muss gelingen.
    expect(m.acquire('doc-4', 2_001).documentId).toBe('doc-4');
  });

  it('verschiedene Dokumente behindern sich nicht', () => {
    const m = managerMitZaehler();
    const a = m.acquire('doc-a', 1_000);
    const b = m.acquire('doc-b', 1_000);
    expect([a.documentId, b.documentId]).toEqual(['doc-a', 'doc-b']);
    m.release(a);
    m.release(b);
    expect(m.acquire('doc-a', 1_100).token).toBe('token-3');
  });

  it('die TTL wird begrenzt, nicht durchgereicht', () => {
    const m = managerMitZaehler();
    const zuKurz = m.acquire('doc-5', 1_000, 1);
    const zuLang = m.acquire('doc-6', 1_000, 10_000_000);
    expect(zuKurz.expiresAt - zuKurz.acquiredAt).toBe(1_000);
    expect(zuLang.expiresAt - zuLang.acquiredAt).toBe(120_000);
  });
});
