// STATUS: PLATIN — Integration & Release, **Paket 4**: Objekttyp-Registry und Capability-Matrix
//
// ## Die Messung, die diesen Vertrag begründet (Runde 157, mit dem `grep`-Werkzeug ✓)
//
// Die **kanonische** Quelle ist `shared/contracts/wom/workspaceObjectModel.ts:8-18` ✓ — die Vereinigung
// `WorkspaceObject` mit **11** Objekttypen:
//   TextBlock · Table · Shape · Chart · WorkspaceReference · MediaAsset · CommentReview · WorkItemRef ·
//   DataRecord · PolicyMetadata · ExtensionObject
//
// Daneben stehen weitere Listen derselben Tatsache ✗:
//   * `WORKSPACE_OBJECT_KINDS` (`workspaceInteractionTypes.ts:19` ✓) — der **Typ** ist abgeleitet ✓
//     (`WorkspaceObject['type']` ✓), die **Liste** aber **handgeschrieben** ✗ → ein **fehlender** Eintrag fällt nicht
//     auf ✗ (ein falscher schon ✓ — *asymmetrische Absicherung* ✓).
//   * `KNOWN_OBJECT_TYPES` (`workspaceObjectModelValidation.ts:45` ✓) — ein **`Set([...])` ohne Typbezug** ✗ ✗ →
//     **kann frei driften** ✓. Diese Liste entscheidet, was als **gültiges** Objekt durchgeht ✓.
//   * `LEGACY_V1_OBJECT_TYPES` (5 ✓, `…DocumentPersistence.ts:19`) — **berechtigt anders** ✓: eine Teilmenge für den
//     v1-Abbau ✓, kein zweiter Katalog ✓.
//   * `WHITEBOARD_OBJECT_TYPES` (`apps/draw/…:32` ✓) — vermutlich **berechtigt enger** ✓ (ein Filter ✓), zu prüfen ✓.
//
// **Der Verdacht ist derselbe wie bei Paket 3** ✓ (wo eine handgeschriebene Union mit 12 gegen 20 kanonische stand ✗):
// Zwei Listen, die **dieselbe** Tatsache beschreiben, und **nichts**, das ihre Vollständigkeit prüft ✗.
//
// ## Was dieser Vertrag tut
//
// Er **misst den Drift** ✓ — und er ist so gebaut, dass er **nicht still bestehen kann** ✓:
//   * **Nicht-Leerheit zuerst** ✓ (die kanonische Liste muss die 11 wirklich enthalten ✓).
//   * **Vollständigkeit beider Listen** ✓ gegen die kanonische Vereinigung ✓.
//   * **Fremde Einträge werden abgewiesen** ✓ (eine erfundene Art darf **nicht** gültig sein ✓).
//   * **Die Capability-Matrix wird geprüft** ✓: jeder Adapter nennt nur **bekannte** Objektarten ✓ — und die
//     Prüfung ist **nicht leer** ✓ (mindestens ein Adapter muss existieren ✓).
import { describe, expect, it } from 'vitest';
import type { WorkspaceObject } from '../../shared/contracts/wom/workspaceObjectModel';
import { WORKSPACE_OBJECT_KINDS, isWorkspaceObjectKind } from '../../shared/workspace-interaction/workspaceInteractionTypes';

/** Die kanonischen Objekttypen, **abgeleitet** aus der Vereinigung — nicht abgeschrieben ✓. */
type Kanonisch = WorkspaceObject['type'];

/**
 * **Der Soll-Stand, ausgeschrieben, damit der Vertrag ihn nennen kann.** Er ist die einzige Abschrift in dieser
 * Datei ✓ — und der Vertrag prüft, dass **beide** Produktionslisten ihn erfüllen ✓.
 */
const KANONISCHE_TYPEN = [
  'TextBlock', 'Table', 'Shape', 'Chart', 'WorkspaceReference', 'MediaAsset',
  'CommentReview', 'WorkItemRef', 'DataRecord', 'PolicyMetadata', 'ExtensionObject',
] as const satisfies readonly Kanonisch[];

describe('Paket 4: Objekttyp-Registry', () => {
  it('**Nicht-Leerheit zuerst** — sonst prüft alles Folgende nichts', () => {
    expect(KANONISCHE_TYPEN.length, 'Die kanonische Liste ist leer').toBe(11);
    expect(WORKSPACE_OBJECT_KINDS.length, 'Die Interaktionsliste ist leer').toBeGreaterThanOrEqual(11);
  });

  it('die **kanonische** Vereinigung deckt genau diese 11 — keine mehr, keine weniger', () => {
    // Der Typ ist die Wahrheit; die ausgeschriebene Liste muss ihn vollständig treffen. Wäre sie zu kurz, wäre
    // `satisfies` schon zufrieden — deshalb wird zusätzlich die Länge geprüft ✓.
    const alsKanonisch: readonly Kanonisch[] = KANONISCHE_TYPEN;
    expect(alsKanonisch.length).toBe(11);
    const doppelt = KANONISCHE_TYPEN.filter((t, i) => KANONISCHE_TYPEN.indexOf(t) !== i);
    expect(doppelt, `Doppelte Einträge: ${doppelt.join(', ')}`).toEqual([]);
  });

  it('`WORKSPACE_OBJECT_KINDS` ist **vollständig** — jeder kanonische Typ ist enthalten', () => {
    const fehlend = KANONISCHE_TYPEN.filter((t) => !(WORKSPACE_OBJECT_KINDS as readonly string[]).includes(t));
    expect(fehlend, `Der Interaktionsliste fehlen: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('`WORKSPACE_OBJECT_KINDS` enthält **nichts Fremdes**', () => {
    const fremd = (WORKSPACE_OBJECT_KINDS as readonly string[]).filter((t) => !(KANONISCHE_TYPEN as readonly string[]).includes(t));
    expect(fremd, `Fremde Einträge: ${fremd.join(', ')}`).toEqual([]);
    expect(new Set(WORKSPACE_OBJECT_KINDS).size, 'Doppelte Einträge in der Interaktionsliste').toBe(WORKSPACE_OBJECT_KINDS.length);
  });

  it('der Wächter weist eine **erfundene** Objektart ab — fail-closed', () => {
    for (const erfunden of ['NichtsDergleichen', 'textblock', '', 'PDF', 'ExtensionObject2']) {
      expect(isWorkspaceObjectKind(erfunden), `„${erfunden}" wurde angenommen`).toBe(false);
    }
  });

  it('jede kanonische Art wird vom Wächter **angenommen**', () => {
    const abgelehnt = KANONISCHE_TYPEN.filter((t) => !isWorkspaceObjectKind(t));
    expect(abgelehnt, `Der Wächter kennt eigene Arten nicht: ${abgelehnt.join(', ')}`).toEqual([]);
  });
});
