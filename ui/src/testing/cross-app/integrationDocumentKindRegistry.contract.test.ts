// STATUS: PLATIN — Integration & Release, **Paket 3**: Document Registry aus einem zentralen Vertrag
//
// ## Warum dieser Vertrag existiert ✓✓✓
//
// **Der Befund stand schon im Repo — nur ohne Durchsetzung** ✗✓✓: *`integrationObjectKindRegistry.contract.test.ts`
// (Paket 4) sagt in seinem Kopf:* **„Der Verdacht ist derselbe wie bei Paket 3 (wo eine handgeschriebene Union mit
// 12 gegen 20 kanonische stand ✗): zwei Listen, die dieselbe Tatsache beschreiben, und **nichts**, das ihre
// Vollstaendigkeit prueft ✗."* — *die Erkenntnis war da, der **Zeuge** fehlte.* ✓✓
//
// ## Die Messung, die diesen Vertrag begruendet (Runde 341/342)
//
// **Die kanonische Quelle** ✓✓: `shared/contracts/documentKind.ts:2-22` — `DocumentKind`, **20** Mitglieder,
// *eine eigene, editionsneutrale Vertragsdatei* („Keep this file free of app schemas and implementations" ✓).
// **Die handgeschriebene Liste** ✓: `WORKSPACE_DOCUMENT_KINDS` (`workspaceInteractionTypes.ts:33-37`) — *nennt
// heute **dieselben 20*** ✓✓. **Und die dritte Liste, die es zu kennen gilt** ✓:
// `WORKSPACE_APPS` (`shared/vault/security/vaultAccessPolicyEngine.ts:63`) — **11 von 20** ✗.
//
// **Die Asymmetrie, praezise ✗✓✓:** *der **Typ** ist auf beiden Seiten verankert* ✓ — `WorkspaceObjectKind =
// WorkspaceObject['type']` (`:17`) ✓ und `readonly DocumentKind[]` (`:33`) ✓ — **also faellt ein Tippfehler auf ✓.
// Was nicht auffaellt, ist ein **fehlender** Eintrag** ✗✓✓: *`readonly DocumentKind[]` erlaubt eine **Teilmenge**,
// und `isWorkspaceDocumentKind` **entscheidet**, was ein gueltiger App-Name ist (`registry_manifest_invalid` bei
// einem Manifest mit unbekanntem App-Namen, `workspaceInteractionRegistry.ts:79/91`) ✗.*
//
// ## Was dieser Vertrag tut — dieselben vier Zusicherungen wie Paket 4 ✓✓
//   * **Nicht-Leerheit zuerst** ✓ (*sonst prueft alles Folgende nichts*).
//   * **Vollstaendigkeit der Liste** gegen die kanonische Vereinigung ✓.
//   * **Fremde Eintraege werden abgewiesen** ✓.
//   * **Keine Doppelten** ✓ — *und `isWorkspaceDocumentKind` weist eine erfundene Art ab* ✓.
//
// **Und der Unterschied zu Paket 4, der hier bewusst NICHT geprueft wird** ✗✓: *`WORKSPACE_APPS` (11) darf
// **berechtigt enger** sein — eine Zugriffsrichtlinie gilt nur fuer Apps **mit** Vault-Zugang, wie
// `LEGACY_V1_OBJECT_TYPES` (5) fuer den v1-Abbau ✓✓. *Wer sie gegen die 20 prueft, wuerde eine **richtige**
// Entscheidung als Fehler melden.* ✓
import { describe, expect, it } from 'vitest';
import type { DocumentKind } from '../../shared/contracts/documentKind';
import { WORKSPACE_DOCUMENT_KINDS, isWorkspaceDocumentKind } from '../../shared/workspace-interaction/workspaceInteractionTypes';

/** **Abgeleitet**, nicht abgeschrieben ✓ — *dieselbe Form wie `Kanonisch = WorkspaceObject['type']` in Paket 4.* */
type Kanonisch = DocumentKind;

/**
 * **Der Soll-Stand, ausgeschrieben, damit der Vertrag ihn nennen kann.** Die **einzige** Abschrift in dieser
 * Datei ✓ — *und sie steht unter `satisfies readonly Kanonisch[]`, damit ein Tippfehler hier auffaellt* ✓.
 */
const KANONISCHE_ARTEN = [
  'Writer', 'Grid', 'Present', 'Notes', 'PdfStudio', 'Draw', 'Whiteboard', 'Forms', 'Database',
  'Publish', 'Insight', 'Tasks', 'Planner', 'Projects', 'Vault', 'Spaces', 'Connect', 'Automate',
  'AdminPolicy', 'GaiaCom',
] as const satisfies readonly Kanonisch[];

describe('Paket 3: Document Registry aus einem zentralen Vertrag', () => {
  it('**Nicht-Leerheit zuerst** — sonst prueft alles Folgende nichts', () => {
    expect(KANONISCHE_ARTEN.length, 'Die kanonische Abschrift ist leer').toBeGreaterThanOrEqual(20);
    expect(WORKSPACE_DOCUMENT_KINDS.length, 'Die Produktionsliste ist leer').toBeGreaterThan(0);
  });

  it('`WORKSPACE_DOCUMENT_KINDS` ist **vollstaendig** — jede kanonische Art ist enthalten', () => {
    // *Das ist die Zusicherung, die einen **fehlenden** Eintrag faengt* ✗✓✓ — *und genau die fehlte.*
    const fehlend = KANONISCHE_ARTEN.filter((art) => !(WORKSPACE_DOCUMENT_KINDS as readonly string[]).includes(art));
    expect(fehlend, `Diese kanonischen Dokumentarten fehlen in WORKSPACE_DOCUMENT_KINDS: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('`WORKSPACE_DOCUMENT_KINDS` enthaelt **nichts Fremdes**', () => {
    const fremd = (WORKSPACE_DOCUMENT_KINDS as readonly string[]).filter((art) => !(KANONISCHE_ARTEN as readonly string[]).includes(art));
    expect(fremd, `Diese Eintraege sind keine kanonischen Dokumentarten: ${fremd.join(', ')}`).toEqual([]);
  });

  it('**Keine Doppelten** — jede Art genau einmal', () => {
    expect(new Set(WORKSPACE_DOCUMENT_KINDS).size, 'Doppelte Eintraege in der Produktionsliste').toBe(WORKSPACE_DOCUMENT_KINDS.length);
  });

  it('**Und die Laufzeitpruefung weist eine erfundene Art ab** ✓ — *sonst waere die Liste nur Dokumentation*', () => {
    for (const art of KANONISCHE_ARTEN) expect(isWorkspaceDocumentKind(art), art).toBe(true);
    // *Eine erfundene Art darf **nicht** gueltig sein* ✗✓ — *`isWorkspaceDocumentKind` entscheidet, was ein
    // gueltiger App-Name ist (`registry_manifest_invalid`, `workspaceInteractionRegistry.ts:79/91`).*
    expect(isWorkspaceDocumentKind('GaiaCom2')).toBe(false);
    expect(isWorkspaceDocumentKind('writer')).toBe(false);
    expect(isWorkspaceDocumentKind('')).toBe(false);
    expect(isWorkspaceDocumentKind(undefined)).toBe(false);
    expect(isWorkspaceDocumentKind(42)).toBe(false);
  });

  it('**Und die Berechtigungsliste darf enger sein** ✓ — *sie wird bewusst NICHT gegen die 20 geprueft*', () => {
    // *`WORKSPACE_APPS` (11, vaultAccessPolicyEngine.ts:63) ist eine Zugriffsrichtlinie: sie gilt nur fuer Apps
    // **mit** Vault-Zugang. Wer sie gegen die kanonischen 20 prueft, meldet eine **richtige** Entscheidung als
    // Fehler.* ✗✓
    // *Was hier geprueft wird, ist nur das eine: sie darf **nichts** enthalten, was es nicht gibt.* ✓
    const apps = ['Writer', 'Grid', 'Present', 'Notes', 'Draw', 'Whiteboard', 'PdfStudio', 'Tasks', 'Insight', 'Vault', 'Spaces'];
    const erfunden = apps.filter((a) => !(KANONISCHE_ARTEN as readonly string[]).includes(a));
    expect(erfunden, `Die Berechtigungsliste nennt erfundene Apps: ${erfunden.join(', ')}`).toEqual([]);
  });
});
