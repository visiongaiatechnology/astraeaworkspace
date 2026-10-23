// STATUS: PLATIN — **`W-456`**: der v1-Alias `workData` wird **migriert oder benannt abgewiesen** — nie still verworfen.
//
// ## 1. VORHER gemessen — eigener Lauf, **vor** jeder Änderung
//
// Sonde `src/testing/platform/workspace/model/_w456W457MeasuredBeforeFix.test.ts` (9/9 grün als Messinstrument),
// über die **ausgelieferte** Grenze `serializeWorkspaceDocumentCanonical` → Bytes → `deserializeWorkspaceDocumentCanonical`
// (`platform/workspace/model/workspaceObjectModelDocumentPersistence.ts`, Save/Close/Reopen):
//
// | Eingang | Messwert vorher |
// | --- | --- |
// | v1, `workData.tasks=[legacy-1]` **und** `workManagementData.tasks=[canon-1]` | `ACCEPTED`, `legacy-1` überlebt **false**, `canon-1` true, `workData` im Ausgang false — **stiller Verlust** |
// | v1, `workData:'kein-record'` | `ACCEPTED` — Feld gelöscht, **kein Ersatz, kein Fehler** |
// | v2, `workData:null` | `ACCEPTED` **und** `"workData"` steht in den gespeicherten Bytes — der Wächter prüfte den **Wahrheitswert** statt der **Anwesenheit** |
// | Positivkontrolle: v1, **nur** `workData` | `ACCEPTED`, migriert — *diese Richtung funktionierte immer* |
//
// ## 2. NACHHER gemessen — derselbe Lauf, dieselben sechs Zeilen
//
// Die drei Verlustfälle sind **benannte** Ablehnungen (`WorkspaceValidationError`, ganzer Satz), die
// Positivkontrolle ist unverändert grün. **Der Preis ist ausgesprochen, nicht verschwiegen:** ein Dokument mit
// *auseinanderlaufenden* Feldern wird jetzt **abgewiesen** statt halb gespeichert — *es gibt keine definierte
// Zusammenführungsregel für Aufgaben-IDs und Karten, und eine zu erfinden wäre eine zweite Semantik.*
//
// ## 3. Erreichbarkeit — gelesen, nicht geschlossen
//
// Die beiden **echten** Aufrufer schreiben **dieselbe** Nutzlast in beide Felder:
// `apps/notes/notebooks/useNotesManager.ts:145` (`workManagementData: workPayload, ...(document.workData ? { workData: workPayload } : {})`
// — dieselbe Objektreferenz) und `apps/pdf/integrations/pdfWorkspaceConversions.ts:206-207`
// (`workManagementData: nextWork, ...(targetDocument.workData ? { workData: nextWork } : {})`).
// Genau diese Form ist hier als **③** ausgeführt: gleiche Nutzlast ⇒ zugelassen, nichts verloren.
// *Die Aufrufer sind **nicht** ausgeführt (`useNotesManager` ist ein React-Hook, `convertPdfAnnotationsToTasks`
// braucht ein PDF-Modell) — das ist eine **Lesung** und als solche benannt.*
//
// Absichtlich kein `.mjs`: diese Datei liest keine Dateien aus dem Projekt.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
  validateWorkspaceDocumentInvariants,
  WorkspaceValidationError,
} from '../../../../platform/workspace/model/workspaceObjectModel';

/** Nutzdaten-Projektion: reines JSON, damit der Vergleich die **Nutzdaten** trifft, nicht die Objektidentität. */
const nutzdaten = (wert: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(wert)) as Record<string, unknown>;
const strukturKopie = <T>(wert: T): T => JSON.parse(JSON.stringify(wert)) as T;
const aufgabe = (id: string, titel: string) => ({ id, title: titel, status: 'todo' });

/** Der Umschlag in der Form, die die Grenze selbst erzeugt — gemessen, nicht aus dem Kopf zusammengesetzt. */
function umschlag(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1, id: 'w456', title: 'W-456', kind: 'Tasks',
    created_at: 1, modified_at: 1, version: 1, theme_id: 'cosmic-obsidian',
    root_object_ids: [], objects: {},
    ...extra,
  };
}

/** **Der eine Weg über die Grenze.** Save → Close → Reopen; nur `bytes` überquert die Linie. */
function kanal(document: unknown): { bytes: string; reopened: WorkspaceDocument } {
  const bytes = serializeWorkspaceDocumentCanonical(document as WorkspaceDocument);
  return { bytes, reopened: deserializeWorkspaceDocumentCanonical(bytes) };
}

/** Was kommt **heraus**? Entweder der benannte Wurf — oder die Zeichenkette mit den Nutzdaten. */
function ausgangVon(erzeuge: () => unknown): string {
  try {
    return `ACCEPTED:${JSON.stringify(nutzdaten(erzeuge()))}`;
  } catch (error) {
    return `REFUSED:${error instanceof Error ? `${error.name}:${error.message}` : String(error)}`;
  }
}

describe('W-456 · der v1-Alias wird migriert, nicht verworfen', () => {
  it('① BEIDE FELDER, VERSCHIEDENER INHALT ⇒ benannt abgewiesen, nichts still verloren (vorher rot)', () => {
    const alt = umschlag({
      workData: { tasks: [aufgabe('legacy-1', 'Nur in workData')], cards: [] },
      workManagementData: { tasks: [aufgabe('canon-1', 'Schon kanonisch')], cards: [] },
    });
    const ausgang = ausgangVon(() => kanal(strukturKopie(alt)).reopened);
    // *Vorher stand hier `ACCEPTED` mit verlorenem `legacy-1`; jetzt steht hier der benannte Grund.*
    expect(ausgang.startsWith('REFUSED:WorkspaceValidationError:')).toBe(true);
    expect(ausgang).not.toContain('legacy-1');
    expect(ausgang).toContain('Legacy workData and canonical workManagementData carry different work-management payloads');
    // **§25 Microcopy:** der Satz nennt **beide** Felder und den Grund — kein nackter Code, kein „invalid".
    expect(ausgang).toContain('workData');
    expect(ausgang).toContain('workManagementData');
    expect(ausgang).toContain('no defined merge rule');
    // Und die Klasse ist die **benutzer-sichtbare** Disposition (der Satz wird wörtlich gezeigt), nicht die opake.
    expect(() => kanal(strukturKopie(alt))).toThrow(WorkspaceValidationError);
    // Der Aufrufer wird **nicht** verändert: die Ablehnung fällt vor jeder Mutation.
    expect(nutzdaten(alt.workData)).toEqual({ tasks: [aufgabe('legacy-1', 'Nur in workData')], cards: [] });
    expect(nutzdaten(alt.workManagementData)).toEqual({ tasks: [aufgabe('canon-1', 'Schon kanonisch')], cards: [] });
  });

  it('② GEGENPROBE — fehlt das kanonische Feld, migriert dieselbe Funktion verlustfrei', () => {
    const nurLegacy = umschlag({ workData: { tasks: [aufgabe('legacy-1', 'Nur in workData')], cards: [] } });
    const { reopened } = kanal(nurLegacy);
    expect(reopened.workManagementData).toEqual({ tasks: [aufgabe('legacy-1', 'Nur in workData')], cards: [] });
    expect('workData' in reopened).toBe(false);
    expect(JSON.stringify(reopened)).toContain('Nur in workData');
  });

  it('③ BEIDE FELDER, GLEICHE NUTZLAST ⇒ zugelassen und verlustfrei (die Form beider echter Aufrufer)', () => {
    // `useNotesManager.ts:145` und `pdfWorkspaceConversions.ts:207` schreiben **dieselbe** Nutzlast in beide Felder.
    const nutzlast = { tasks: [aufgabe('task-1', 'Parallel gehalten')], cards: [{ id: 'card-1', linkedTaskId: 'task-1' }] };
    const beide = umschlag({ workData: nutzlast, workManagementData: nutzlast });
    const erster = kanal(strukturKopie(beide));
    expect(erster.reopened.workManagementData).toEqual(nutzlast);
    expect('workData' in erster.reopened).toBe(false);
    // Zweiter Zyklus: die gespeicherte Form ist ein **Fixpunkt** — die Zusage der Grenze selbst.
    const zweiter = kanal(strukturKopie(erster.reopened));
    expect(zweiter.bytes).toBe(erster.bytes);
  });

  it('④ UNBRAUCHBARES workData ⇒ benannt abgewiesen, nicht gelöscht (vorher rot)', () => {
    // *Vorher: `ACCEPTED`, Feld weg, kein Ersatz, kein Fehler.* Jetzt: ein Satz, der den Fall nennt.
    for (const unbrauchbar of ['kein-record', 4711, true, [], null] as const) {
      const ohneKanonisch = umschlag({ workData: unbrauchbar });
      const mitKanonisch = umschlag({ workData: unbrauchbar, workManagementData: { tasks: [], cards: [] } });
      for (const eingang of [ohneKanonisch, mitKanonisch]) {
        const ausgang = ausgangVon(() => kanal(strukturKopie(eingang)).reopened);
        expect(ausgang, JSON.stringify(unbrauchbar)).toBe(
          'REFUSED:WorkspaceValidationError:Legacy workData is present but is not a work-management record; a present legacy payload is never discarded, so migrate it explicitly to workManagementData before persistence.',
        );
      }
    }
  });

  it('⑤ DIE NEGATIVE, DIE DIE ZUSAGE SELBST PRÜFT — der Wächter prüft ANWESENHEIT, nicht Wahrheitswert (vorher rot)', () => {
    // *Die Zusage der Datei lautet „Legacy workData **must be migrated** … before persistence".*
    // Vorher passierte `workData: null` diesen Wächter (`if (document.workData)`) **und stand danach in den Bytes**
    // (gemessen: `W456_v2_workData_null=ACCEPTED:workData_im_ausgang=true`) — der Wächter sah den **Wahrheitswert**.
    // Der Wächter wird an einem **aktuellen** (v2) Dokument befragt: dort läuft keine Migration mehr, die das
    // Feld vorher entfernen könnte.
    const gespeichertNull = { ...umschlag(), schema_version: 2, workData: null };
    expect(() => validateWorkspaceDocumentInvariants(gespeichertNull as unknown as WorkspaceDocument))
      .toThrow(/Legacy workData must be migrated to canonical workManagementData before persistence/u);
    expect(ausgangVon(() => kanal(strukturKopie(gespeichertNull)).reopened))
      .toBe('REFUSED:WorkspaceValidationError:Legacy workData must be migrated to canonical workManagementData before persistence');
    // **Gegenrichtung im selben Instrument:** ohne das Feld ist dasselbe Dokument gültig — der Wächter ist
    // also nicht einfach „irgendein Schlüssel", sondern genau das **vorhandene** Altfeld.
    expect(() => validateWorkspaceDocumentInvariants(umschlag() as unknown as WorkspaceDocument)).not.toThrow();
    expect(ausgangVon(() => kanal(umschlag()).reopened).startsWith('ACCEPTED:')).toBe(true);
    // Und ein Schlüssel **ohne Wert** ist keine Altlast: `undefined` wird von der kanonischen Form verworfen.
    const ohneWert: Record<string, unknown> = umschlag();
    ohneWert.workData = undefined;
    expect(ausgangVon(() => kanal(ohneWert).reopened).startsWith('ACCEPTED:')).toBe(true);
    // Dieselbe Anwesenheit in **v1** ist die Migrationsstufe, nicht der Wächter — *und beide sind benannt.*
    expect(ausgangVon(() => kanal(strukturKopie(umschlag({ workData: null }))).reopened))
      .toBe('REFUSED:WorkspaceValidationError:Legacy workData is present but is not a work-management record; a present legacy payload is never discarded, so migrate it explicitly to workManagementData before persistence.');
  });
});
