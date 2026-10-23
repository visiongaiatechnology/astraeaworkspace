// STATUS: PLATIN — **Der `Frozen`-Weg durch den EINFÜGER** ✓✓ — der Pfad, den nie ein Test berührte ✗✓✓
//
// ## Warum diese Datei existiert ✓✓✓
//
// Der **Draw-Agent** hat einen echten Bruch **gemeldet statt umgangen** ✓✓: *`insertFromWorkspace` baute den Verweis
// **ohne** `common`, und für `mode: 'Frozen'` scheiterte der Aufruf mit `WorkspaceReference ownership/mode
// mismatch`* ✗✗. **Die Regel stand einseitig** ✗✓: `setReference` kannte sie (`fabricState.ts:94-96` ✓), **der
// Einfüger nicht** ✗ — *und `insertFromWorkspace` ruft `setReference` erst **später** (Z. 219), also ging der
// **erste** Verweis **nie** durch die Regel* ✓✓.
//
// **Und die eigentliche Ursache, warum das leben konnte ✗✓✓:** `insertFromWorkspace` hat **zwei
// Produktionsaufrufer** (`fabricTransferOperations.ts:47` ✓, `drawSendEngine.ts:105` ✓) und hatte **null Zeugen**
// ✗. *Der Aktualisierer war geprüft, der Einfüger nicht.* ✓
//
// **Also misst diese Datei den Pfad, nicht den Fix** ✓✓ — *sie prüft die **Regel** (eine Ableitung, zwei Ausgänge)
// und **dass der Verweis die Prüfung besteht**, die vorher warf.* ✓
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { insertFromWorkspace } from '../../../shared/workspace-interaction/fabricReferenceOperations';
import { validateTypedObject } from '../../../platform/workspace/model/workspaceObjectModelValidation';

const quelle: WorkspaceDocument = {
  schema_version: 2, id: 'draw-quelle', title: 'Zeichnung', kind: 'Draw',
  created_at: 1, modified_at: 1, version: 5, theme_id: 'cosmic-obsidian',
  root_object_ids: ['anker-1'],
  objects: {
    'anker-1': {
      type: 'Shape',
      data: {
        id: 'anker-1', shape_type: 'rectangle',
        x: 0, y: 0, width: 320, height: 240, rotation: 0,
        fill: 'transparent', stroke: 'transparent', stroke_width: 0,
      },
    },
  },
};

const ziel = (): WorkspaceDocument => ({
  schema_version: 2, id: 'writer-ziel', title: 'Bericht', kind: 'Writer',
  created_at: 1, modified_at: 1, version: 4, theme_id: 'cosmic-obsidian',
  root_object_ids: [], objects: {},
});

const frisch = () => ({ [quelle.id]: structuredClone(quelle), 'writer-ziel': ziel() });

describe('Der EINFÜGER: `Frozen` und `Live` durch denselben Weg', () => {
  it('**`Frozen` erzeugt einen Verweis, der die Prüfung besteht** ✓✓ — vorher warf er', () => {
    const documents = frisch();
    const ergebnis = insertFromWorkspace(documents, 'writer-ziel', 'draw-quelle', 'anker-1', {
      referenceId: 'verweis-frozen', mode: 'Frozen', now: 7,
    });
    expect(ergebnis.referenceId).toBe('verweis-frozen');
    // **Eigener Fehler, korrigiert (Runde 299) ✗✓✓** — *zweimal:* (a) `insertFromWorkspace` **verändert mein
    // `documents` nicht** ✗ — *es gibt `updatedDocs` **zurück*** ✓ (`FabricTransactionResult`,
    // `fabricTypes.ts:93-97` ✓, **gelesen, nicht geschlossen** ✓); (b) `validateTypedObject` nimmt **die Kennung
    // zuerst** ✓ (`workspaceObjectModelValidation.ts:348-351`: `(objectId, raw, options?)` ✓).
    const verweis = ergebnis.updatedDocs['writer-ziel']?.objects['verweis-frozen'];
    expect(verweis, 'der Verweis muss im ZIELDOKUMENT stehen — in `updatedDocs`').toBeDefined();
    expect(verweis?.type).toBe('WorkspaceReference');
    // **Die Regel, die der Aktualisierer schon kannte** ✗✓ — *und der Einfüger jetzt auch* ✓✓:
    const daten = verweis?.data as { common?: { ownership?: string }; mode?: string } | undefined;
    expect(daten?.mode).toBe('Frozen');
    expect(daten?.common?.ownership, 'ohne ExternalFrozen wirft die Prüfung').toBe('ExternalFrozen');
    // **Und die Prüfung, die vorher warf, besteht jetzt** ✗✓✓:
    expect(() => validateTypedObject('verweis-frozen', verweis)).not.toThrow();
  });

  it('**`Live` ist der zweite Ausgang derselben Ableitung** ✓✓ — `ExternalLive`', () => {
    const documents = frisch();
    const ergebnis = insertFromWorkspace(documents, 'writer-ziel', 'draw-quelle', 'anker-1', {
      referenceId: 'verweis-live', mode: 'Live', now: 8,
    });
    const daten = ergebnis.updatedDocs['writer-ziel']?.objects['verweis-live']?.data as { common?: { ownership?: string } } | undefined;
    // *Eine Ableitung (`mode`), zwei Ausgänge* ✓ — **kein zweiter Begriff von „frozen"** ✗✓.
    expect(daten?.common?.ownership).toBe('ExternalLive');
  });

  it('**Ohne `mode` gilt `Live`** ✓ — *die Vorgabe ist benannt, nicht heimlich* ✓', () => {
    const documents = frisch();
    const ergebnis = insertFromWorkspace(documents, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-ohne', now: 9 });
    const daten = ergebnis.updatedDocs['writer-ziel']?.objects['verweis-ohne']?.data as { mode?: string; common?: { ownership?: string } } | undefined;
    // *`options.mode ?? 'Live'` (Z. 151 ✓) — und die Eigentümerschaft folgt **derselben** Quelle* ✓✓.
    expect(daten?.mode).toBe('Live');
    expect(daten?.common?.ownership).toBe('ExternalLive');
  });

  it('**Eine belegte Kennung wird benannt abgelehnt** ✓ — kein stiller Überschreiber', () => {
    const documents = frisch();
    const erste = insertFromWorkspace(documents, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'doppelt', now: 10 });
    // **Eigener Fehler, korrigiert (Runde 299) ✗✓✓** — *auch hier hatte ich das Modell **geschlossen** statt
    // gelesen* ✗: der zweite Aufruf mit denselben **Eingabe**-Dokumenten warf **nicht**, *weil die Doppelprüfung
    // (Z. 149 ✓) die **Eingabe** liest und `insertFromWorkspace` sie **nicht verändert*** ✓✓.
    // **Und das ist das Modell, nicht ein Defekt** ✓: *der Aufrufer führt **`updatedDocs`** weiter* ✓
    // (`fabricTypes.ts:93-97` ✓, **gelesen** ✓). *Mit den **aktualisierten** Dokumenten greift die Regel* ✓✓.
    expect(() => insertFromWorkspace(erste.updatedDocs, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'doppelt', now: 11 }))
      .toThrow();
    // *Und die Gegenprobe zur Herkunft* ✓: **dieselbe** Kennung in **frischen** Dokumenten ist **erlaubt** ✓ —
    // *der Verweis ist je Dokument einmalig, nicht global* ✓✓.
    expect(() => insertFromWorkspace(frisch(), 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'doppelt', now: 12 }))
      .not.toThrow();
  });
});
