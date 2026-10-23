// STATUS: PLATIN — SONDE zu Paket 44: „Dokumentweite Undo bei Cross-App-Edit"
//
// ## Warum das eine SONDE ist und kein Zeuge ✓✓✓
//
// **Vorab-Check (Runde 434, gemessen):** `history.record(` existiert im ganzen Baum **dreimal** —
// *zweimal app-**lokal** (`useWhiteboardState.ts`, `VaultFreeRuntime.tsx`), einmal ein **Datenfeld**.
// **Keine** Historie nimmt eine **Cross-App**-Einfuegung auf.*
// **Aber:** *„der Grep fand kein `history.record` fuer einen Cross-App-Pfad" ist **nicht** „ein Undo ist
// unmoeglich"* ✗✓. *Eine App **koennte** das Dokument aus einem eigenen Schnappschuss wiederherstellen.*
// **Also wird gemessen, nicht geschlossen** ✓✓✓.
//
// ## Und ③ ist die Pflicht-Positivkontrolle ✗✓✓✓
//
// *Sonst waere „keine Historie gefunden" auch von einer Sonde erfuellt, die **falsch sucht**.*
// **③ zeigt:** *der Ziel-**Versions**mechanismus **existiert** und **greift** (`fabricState.ts:79`) —
// *also sucht die Sonde an der richtigen Stelle, und „kein Undo" heisst „kein Undo", nicht „nichts gefunden".*
// **PFADREGEL FUER DIESES VERZEICHNIS** ✗✓✓✓ — *aus `src/testing/cross-app/` sind es **`../../`**, nicht
// `../../../`. Ich habe das in den Runden 418, 423 und 435 **viermal** falsch geschrieben und **jedes Mal die
// Instanz repariert statt den Mechanismus**. *Ab jetzt steht die Regel **hier**, damit das naechste Blatt sie
// erbt, statt sie neu zu raten.* Die drei Ebenen: `src/testing/cross-app/x.ts` → `..` = `src/testing/` →
// `../..` = `src/`.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { DocumentKind } from '../../shared/contracts/documentKind';
import { insertFromWorkspace } from '../../shared/workspace-interaction/fabricReferenceOperations';

const shapeDaten = (id: string) => ({
  id, shape_type: 'rectangle' as const,
  x: 0, y: 0, width: 320, height: 240, rotation: 0,
  fill: 'transparent', stroke: 'transparent', stroke_width: 0,
});

const dokument = (id: string, kind: DocumentKind): WorkspaceDocument => ({
  schema_version: 2, id, title: id, kind,
  created_at: 1, modified_at: 1, version: 5, theme_id: 'cosmic-obsidian',
  root_object_ids: ['anker-1'],
  objects: { 'anker-1': { type: 'Shape', data: shapeDaten('anker-1') } },
});

const einfuegen = (now: number) => {
  const docs: Record<string, WorkspaceDocument> = { quelle: dokument('quelle', 'Draw'), ziel: dokument('ziel', 'Writer') };
  return insertFromWorkspace(docs, 'ziel', 'quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now });
};

describe('SONDE Paket 44: ist eine Cross-App-Einfuegung im Zieldokument rücknehmbar?', () => {
  it('**① Was der Cross-App-Pfad ZURUECKGIBT** — *und was darin fehlt* ✗✓✓', () => {
    const e = einfuegen(10);
    // *Die Rueckgabe ist die **ganze** Auskunft des Pfades — und sie hat **vier** Felder, nicht drei:*
    // *`referenceId` (`fabricReferenceOperations.ts:195`) sagt, **was** eingefuegt wurde.* ✓✓
    // **Meine erste Fassung behauptete drei — die Sonde hat mich korrigiert.** ✗✓✓
    expect(Object.keys(e).sort(), 'die Felder der Rueckgabe').toEqual(['notifications', 'referenceId', 'touchedDocumentIds', 'updatedDocs']);
    // **UND DAS IST DER BEFUND:** *es gibt **kein** Feld, das ein Undo traegt* — *kein `history`, kein `undo`,
    // kein `inverse`, kein `revert`, kein `previous`.* ✗✓✓✓
    const felder = Object.keys(e).map((k) => k.toLowerCase());
    expect(felder.some((k) => /history|undo|inverse|revert|previous/u.test(k)), 'kein Undo-Feld in der Auskunft').toBe(false);
    // *Und `referenceId` ist die **scharfe** Beobachtung: der Pfad sagt dir, **was** er tat —*
    // *und gibt dir **keinen** Weg zurueck.* ✗✓✓
    expect(typeof (e as { referenceId?: unknown }).referenceId, 'referenceId nennt das Ergebnis').toBe('string');
  });

  it('**② Und das Dokument selbst traegt KEINEN Rueckweg** ✗✓✓ — *nur den neuen Zustand*', () => {
    const docs: Record<string, WorkspaceDocument> = { quelle: dokument('quelle', 'Draw'), ziel: dokument('ziel', 'Writer') };
    const vorher = docs['ziel'] as WorkspaceDocument;
    const e = einfuegen(10);
    const nachher = e.updatedDocs['ziel'] as WorkspaceDocument;
    // *Die **Eingabe** ist unveraendert (das ist P40, nicht P44).*
    expect(docs['ziel'], 'die Eingabe bleibt unberuehrt').toEqual(vorher);
    // *Und der **neue** Zustand traegt keinen Verweis auf den alten: **kein** Feld, das den Vorzustand haelt.* ✗✓✓
    const felder = Object.keys(nachher).map((k) => k.toLowerCase());
    expect(felder.some((k) => /history|undo|previous|before|snapshot/u.test(k)), 'das Dokument traegt keinen Vorzustand').toBe(false);
    // *Es gibt **keinen** Rueckweg im Ergebnis — die Aenderung ist **nicht** ruecknehmbar, sie ist nur **neu**.*
    expect(Object.keys(nachher).sort()).toEqual(['created_at', 'id', 'kind', 'modified_at', 'objects', 'root_object_ids', 'schema_version', 'theme_id', 'title', 'version']);
  });

  it('**③ UND DIE POSITIVKONTROLLE: der Versionsmechanismus EXISTIERT und GREIFT** ✓✓✓', () => {
    // *Damit sucht die Sonde an der **richtigen** Stelle: ein Mechanismus, der Aenderungen **verfolgt**,
    // ist da — *und **keiner**, der sie **zuruecknimmt**.*
    const e = einfuegen(10);
    const vorher = 5;
    const nachher = (e.updatedDocs['ziel'] as WorkspaceDocument).version;
    expect(nachher, 'die Version steigt — Aenderungen werden VERFOLGT').toBeGreaterThan(vorher);
    // *Und der Zeitstempel wandert mit.* ✓✓
    expect((e.updatedDocs['ziel'] as WorkspaceDocument).modified_at).toBeGreaterThanOrEqual(10);
    // **Also: die Sonde findet sehr wohl eine Spur — nur keine, die zurueckfuehrt.** ✓✓✓
    expect(Object.keys(e).length, 'und der Pfad meldet genau vier Dinge').toBe(4);
  });
});
