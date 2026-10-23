// STATUS: PLATIN — **`W-457`**: Provenienz wird **getragen oder benannt abgewiesen** — sie wird **nie erfunden**.
//
// ## 1. VORHER gemessen — eigener Lauf, **vor** jeder Änderung
//
// Sonde `_w456W457MeasuredBeforeFix.test.ts`, über dieselbe Grenze (Save → Close → Reopen):
//
// | Eingang | Messwert vorher |
// | --- | --- |
// | `{profile:'VGT_TOP_SECRET'}` **ohne** Provenienz | `ACCEPTED`; das wiedereröffnete Dokument behauptet `VGT-INFINITY-1` **true** und `55b05a697a189d0ec583cdcf340beeba1efc9130` **true** |
// | `{profile:'VGT_TOP_SECRET', infinity_suite:'EVIL', infinity_commit:'bad'}` | `REFUSED:WorkspaceMalformedInputError:Top Secret Infinity suite provenance mismatch` — **der Wächter lebt** |
// | vollständige, korrekte Provenienz | `ACCEPTED` |
//
// *Das ist die Asymmetrie, die den Befund ausmacht:* der Wächter sah den **falschen** Wert und nicht den
// **fehlenden** — weil die Normalisierung `:96-99` den fehlenden vorher durch den gepinnten ersetzt hatte.
//
// ## 2. NACHHER gemessen — derselbe Lauf
//
// `ohne` → `REFUSED:WorkspaceSecurityError:Request rejected by Workspace security policy.` (*kein* behaupteter
// Wert mehr), `falsch` → **unverändert** `Top Secret Infinity suite provenance mismatch`, `korrekt` → `ACCEPTED`.
//
// ## 3. Warum zwei Dispositionen für die zwei Fälle — und warum das keine Willkür ist
//
// * **② (falscher Wert)** ist eine **Prüfaussage über einen vorhandenen Wert**: sie ist heute schon
//   benutzer-sichtbar und bleibt es — *unverändert, nicht neu gebaut* (`WorkspaceValidationError`, Satz wörtlich).
// * **① (fehlender Wert)** ist die **Abwesenheit eines Nachweises**. `vgtcoder` §1.5.A: *ein Satz, der
//   „origin" nennt, ist IMMER `SecurityException`* — und genau das ist der Fall: eine ungeprüfte Herkunft.
//   Deshalb ist ① **opak nach aussen** (`publicMessage`/`toJSON`), der **volle Grund** steht in `reason` und
//   im lokalen Diagnosering (`writeDiagnosticLog`).
//
// **Die negative Zusicherung, die die Zusage selbst prüft:** `JSON.stringify(fehler)` — also *jede*
// Client-Antwort, die diesen Fehler serialisiert — enthält den Grund **nicht**. Und `message` ist bereits der
// opake Satz, damit auch ein Aufrufer, der blind `cause.message` druckt, den Grund nicht weiterreicht.
//
// Absichtlich kein `.mjs`: diese Datei liest keine Dateien aus dem Projekt.
import { describe, expect, it } from 'vitest';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
  validateWorkspaceDocumentInvariants,
  WorkspaceSecurityError,
  WorkspaceValidationError,
} from '../../../../platform/workspace/model/workspaceObjectModel';
import { refuseWorkspaceInput } from '../../../../platform/workspace/model/workspaceObjectModelPrimitives';
import { listDiagnosticLogs } from '../../../../platform/diagnostics/diagnosticLog';
import { opaqueSecurityMessage } from '../../../../platform/security/securityGatesPlatform';
import { applySecurityProfile, INFINITY_PINNED_COMMIT, INFINITY_SUITE, securityPolicyForDocument } from '../../../../platform/security/securityProfiles';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';

const OPAK = 'Request rejected by Workspace security policy.';
const PROVENIENZ = { infinity_suite: INFINITY_SUITE, infinity_commit: INFINITY_PINNED_COMMIT };

function umschlag(securityPolicy: unknown): Record<string, unknown> {
  return {
    schema_version: 2, id: 'w457', title: 'W-457', kind: 'Writer',
    created_at: 1, modified_at: 1, version: 1, theme_id: 'cosmic-obsidian',
    root_object_ids: [], objects: {},
    securityPolicy,
  };
}

const kanal = (document: unknown): WorkspaceDocument =>
  deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(document as WorkspaceDocument));

/** Der Wurf, benannt — oder `undefined`, wenn **nichts** geworfen wurde. */
function wurfVon(erzeuge: () => unknown): unknown {
  try {
    erzeuge();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('W-457 · fehlende Provenienz wird benannt abgewiesen, nicht erfunden', () => {
  it('① FEHLENDE PROVENIENZ ⇒ benannt abgewiesen, opak nach aussen, voller Grund im Log (vorher rot)', () => {
    const ohne = umschlag({ profile: 'VGT_TOP_SECRET' });
    const fehler = wurfVon(() => kanal(ohne));
    // *Vorher war hier `undefined` — und das wiedereröffnete Dokument behauptete die gepinnte Suite.*
    expect(fehler).toBeInstanceOf(WorkspaceSecurityError);
    const opak = fehler as WorkspaceSecurityError;
    expect(opak.name).toBe('WorkspaceSecurityError');
    expect(opak.diagnosticCode).toBe('SEC_TS_PROVENANCE_ABSENT');
    expect(opak.reason).toContain('carries no pinned Infinity suite provenance');
    expect(opak.reason).toContain('never filled in by the persistence boundary');
    expect(opak.publicMessage).toBe(opaqueSecurityMessage());
    expect(opak.message).toBe(OPAK);
    // **Die negative Zusicherung, die die Zusage selbst prüft:** keine Client-Antwort trägt den Grund.
    const alsAntwort = JSON.stringify(fehler) ?? '';
    expect(alsAntwort).toBe(`{"error":${JSON.stringify(OPAK)}}`);
    expect(alsAntwort).not.toContain('provenance');
    expect(alsAntwort).not.toContain('origin');
    // Und der **volle Grund** ist trotzdem da — im lokalen Diagnosering.
    const eintrag = listDiagnosticLogs().find((log) => log.event_id === 'SEC_TS_PROVENANCE_ABSENT');
    expect(eintrag, 'der volle Grund muss im Log stehen').toBeDefined();
    expect(eintrag?.level).toBe('error');
    expect(eintrag?.component).toBe('wom-security');
    expect(eintrag?.message).toContain('an absent origin is never accepted as a match');
    // **Und nichts wird behauptet:** der Aufrufer behält sein Dokument ohne Provenienz, unverändert.
    expect(ohne.securityPolicy).toEqual({ profile: 'VGT_TOP_SECRET' });
    expect(JSON.stringify(ohne)).not.toContain(INFINITY_SUITE);
    // Eine halbe Provenienz ist keine Provenienz: derselbe Fall, dieselbe Disposition.
    for (const halb of [{ infinity_suite: INFINITY_SUITE }, { infinity_commit: INFINITY_PINNED_COMMIT }, { infinity_suite: '', infinity_commit: '' }]) {
      expect(wurfVon(() => kanal(umschlag({ profile: 'VGT_TOP_SECRET', ...halb }))), JSON.stringify(halb))
        .toBeInstanceOf(WorkspaceSecurityError);
    }
  });

  it('② FALSCHE PROVENIENZ ⇒ ebenso benannt — der bestehende Wächter lebt (vorher und nachher grün)', () => {
    // *Diese Zusage existierte schon; sie wird hier **belegt**, nicht neu gebaut.*
    for (const falsch of [
      { infinity_suite: 'EVIL', infinity_commit: 'bad' },
      { infinity_suite: INFINITY_SUITE, infinity_commit: 'bad' },
      { infinity_suite: 'EVIL', infinity_commit: INFINITY_PINNED_COMMIT },
    ]) {
      const fehler = wurfVon(() => kanal(umschlag({ profile: 'VGT_TOP_SECRET', ...falsch })));
      expect(fehler, JSON.stringify(falsch)).toBeInstanceOf(WorkspaceValidationError);
      expect((fehler as Error).message).toBe('Top Secret Infinity suite provenance mismatch');
      // Der falsche Wert wird **benutzer-sichtbar** abgewiesen — die Meldung ist der ganze Satz, kein Code.
      expect((fehler as Error).message).not.toBe(OPAK);
    }
    expect(() => validateWorkspaceDocumentInvariants(umschlag({ profile: 'VGT_TOP_SECRET', infinity_suite: 'EVIL', infinity_commit: 'bad' }) as never))
      .toThrow(/Top Secret Infinity suite provenance mismatch/u);
  });

  it('③ POSITIVKONTROLLE — vollständige, korrekte Provenienz ⇒ zugelassen (vorher und nachher grün)', () => {
    // Ohne diesen Satz wäre „abgewiesen" auch von einem Wächter erfüllt, der **alles** ablehnt.
    const erster = kanal(umschlag({ profile: 'VGT_TOP_SECRET', ...PROVENIENZ }));
    expect(erster.securityPolicy?.infinity_suite).toBe(INFINITY_SUITE);
    expect(erster.securityPolicy?.infinity_commit).toBe(INFINITY_PINNED_COMMIT);
    // Fixpunkt: der zweite Zyklus liefert dieselben Bytes.
    const bytes = serializeWorkspaceDocumentCanonical(umschlag({ profile: 'VGT_TOP_SECRET', ...PROVENIENZ }) as unknown as WorkspaceDocument);
    expect(serializeWorkspaceDocumentCanonical(deserializeWorkspaceDocumentCanonical(bytes))).toBe(bytes);
    // Und der **produktive Erzeuger** derselben Provenienz bleibt gangbar: `applySecurityProfile`.
    const produktiv = applySecurityProfile(umschlag({ profile: 'STANDARD' }) as unknown as WorkspaceDocument, 'VGT_TOP_SECRET');
    expect(produktiv.securityPolicy?.infinity_suite).toBe(INFINITY_SUITE);
    expect(kanal(produktiv).securityPolicy?.profile).toBe('VGT_TOP_SECRET');
    // Und die Projektion liest die gepinnte Suite eines **belegten** Dokuments unverändert.
    expect(securityPolicyForDocument(kanal(umschlag({ profile: 'VGT_TOP_SECRET', ...PROVENIENZ }))).infinity_suite).toBe(INFINITY_SUITE);
  });

  it('④ DIE REGEL SELBST — ein Satz mit einem Sicherheits-Subjekt ist IMMER die opake Disposition', () => {
    // Ein Entscheidungspunkt, zwei Ausgänge: `refuseWorkspaceInput` (`workspaceObjectModelPrimitives.ts`).
    expect(refuseWorkspaceInput('SEC_PROBE', 'A sentence about the origin of a claim must not be shown verbatim.')).toBeInstanceOf(WorkspaceSecurityError);
    expect(refuseWorkspaceInput('WOM_PROBE', 'A plain validation sentence that names the case.')).toBeInstanceOf(WorkspaceValidationError);
    expect((refuseWorkspaceInput('WOM_PROBE', 'A plain validation sentence that names the case.') as Error).message)
      .toBe('A plain validation sentence that names the case.');
    // Und der produktive Aufruf dieses Entscheidungspunkts ist **①** — die Regel ist nicht Prosa, sie hat einen Aufrufer.
    expect(wurfVon(() => kanal(umschlag({ profile: 'VGT_TOP_SECRET' })))).toBeInstanceOf(WorkspaceSecurityError);
  });
});
