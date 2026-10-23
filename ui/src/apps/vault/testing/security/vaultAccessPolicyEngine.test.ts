// STATUS: PLATIN — Zugriffsautorität für Workspace-Verweise (V-016).
//
// Der Befund, den diese Datei absichert: `VaultFreeRuntime.handleOpenVaultFile` prüfte nur „gesperrt?" und
// „Dokumentart passt?". `shareGrants` wurde **nie** gelesen, die Klassifikation wurde angezeigt, aber nie
// durchgesetzt — jede Anwendung durfte jedes Asset öffnen. Das ist ein **Autoritäts**defekt: die vom Nutzer
// gesetzten Einschränkungen waren eine Anzeige, keine Regel.
//
// Diese Tests prüfen die neue Autorität in beide Richtungen: eine Freigabe muss **wirken** (sonst wäre sie
// wieder nur Anzeige), und eine fehlende/abgelaufene/widerrufene Freigabe muss **blockieren** (sonst wäre
// die Prüfung Zierde).
import { describe, expect, it } from 'vitest';
import type { VaultClassification, VaultShareGrant } from '../../../../shared/contracts/workspace';
import {
  evaluateVaultAccess,
  VAULT_CLASSIFICATION_ORDER,
  vaultClassificationAllowsApp,
  type VaultAccessRequest,
} from '../../../../shared/vault/security/vaultAccessPolicyEngine';

const NOW = 1_700_000_000_000;

/**
 * Fixture mit **typisierten** Overrides. Mein erster Entwurf nahm `Record<string, unknown>` — dadurch hat
 * TypeScript ein `id`-Override stillschweigend durchgelassen, der Helfer hat es aber gar nicht angewendet.
 * Alle Fixtures trugen deshalb `vf-1`, während die Grants auf andere IDs zeigten, und sechs Tests waren aus
 * dem falschen Grund rot. Mit einem präzisen Override-Typ fällt so etwas beim Typecheck auf.
 */
type VaultAccessFile = VaultAccessRequest['file'];

const file = (classification?: VaultClassification, overrides: Partial<VaultAccessFile> = {}): VaultAccessFile => ({
  id: 'vf-1', name: 'gehalt.pdf', classification, status: 'available', ...overrides,
});

const grant = (overrides: Partial<VaultShareGrant> = {}): VaultShareGrant => ({
  id: 'grant-1', fileId: 'vf-1', delivery: 'encrypted_export', permissions: ['view'],
  createdAt: NOW - 1000, status: 'active', copyControl: 'controlled_future_access', ...overrides,
});

const request = (overrides: Partial<VaultAccessRequest> = {}): VaultAccessRequest => ({
  file: file('Internal'), action: 'open', app: 'Writer', grants: [], now: NOW, ...overrides,
});

describe('Public und Internal: die Stufe entscheidet, nicht die Anwendung', () => {
  it('Public ist für jede Anwendung offen — das ist die Bedeutung dieser Stufe', () => {
    for (const app of ['Writer', 'Publish', 'Connect', 'GaiaCom', 'AdminPolicy'] as const) {
      expect(evaluateVaultAccess(request({ file: file('Public'), app })), app).toMatchObject({ allowed: true, reason: 'policy_allow' });
    }
    // Auch ohne App-Bezug.
    expect(evaluateVaultAccess(request({ file: file('Public'), app: null }))).toMatchObject({ allowed: true });
  });

  it('Internal ist auf Arbeitsbereichs-Anwendungen begrenzt — nach außen tragende brauchen einen Grant', () => {
    for (const app of ['Writer', 'Grid', 'Present', 'Notes', 'PdfStudio', 'Vault', 'Tasks'] as const) {
      expect(evaluateVaultAccess(request({ file: file('Internal'), app })), app).toMatchObject({ allowed: true });
    }
    // Kanäle, die Inhalte nach außen tragen oder fremdgesteuert laufen: ohne Grant abgelehnt.
    for (const app of ['Publish', 'Connect', 'Automate', 'GaiaCom', 'AdminPolicy'] as const) {
      expect(evaluateVaultAccess(request({ file: file('Internal'), app })), app)
        .toMatchObject({ allowed: false, reason: 'policy_deny_no_grant' });
    }
  });

  it('mit einem gültigen Grant ist auch eine nach außen tragende Anwendung erlaubt', () => {
    const decision = evaluateVaultAccess(request({ file: file('Internal'), app: 'Publish', grants: [grant()] }));
    expect(decision).toMatchObject({ allowed: true, grantId: 'grant-1' });
  });
});

describe('Confidential und Restricted: ohne Grant keine Öffnung', () => {
  it('ohne Grant wird abgelehnt — für jede Anwendung', () => {
    for (const classification of ['Confidential', 'Restricted'] as const) {
      for (const app of ['Writer', 'Vault', 'Publish'] as const) {
        expect(evaluateVaultAccess(request({ file: file(classification), app })), `${classification}/${app}`)
          .toMatchObject({ allowed: false, reason: 'policy_deny_no_grant' });
      }
    }
  });

  it('mit einem gültigen Grant ist genau dieses Asset erlaubt', () => {
    expect(evaluateVaultAccess(request({ file: file('Restricted'), app: 'Writer', grants: [grant()] })))
      .toMatchObject({ allowed: true, grantId: 'grant-1' });
  });

  it('ein Grant für eine **andere** Datei autorisiert nicht', () => {
    expect(evaluateVaultAccess(request({ file: file('Confidential'), grants: [grant({ fileId: 'anderes' })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_wrong_file' });
  });

  it('ein abgelaufener Grant wird als **abgelaufen** gemeldet, nicht als „kein Grant"', () => {
    const decision = evaluateVaultAccess(request({ file: file('Restricted'), grants: [grant({ expiresAt: NOW - 1 })] }));
    expect(decision).toMatchObject({ allowed: false, reason: 'policy_deny_grant_expired' });
    // Genau an der Grenze gilt er noch als gültig (exklusive Grenze).
    expect(evaluateVaultAccess(request({ file: file('Restricted'), grants: [grant({ expiresAt: NOW + 1 })] })).allowed).toBe(true);
  });

  it('ein widerrufener Grant wird als **widerrufen** gemeldet', () => {
    expect(evaluateVaultAccess(request({ file: file('Restricted'), grants: [grant({ status: 'revoked' })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_revoked' });
    expect(evaluateVaultAccess(request({ file: file('Restricted'), grants: [grant({ revokedAt: NOW - 5 })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_revoked' });
  });

  it('ein Grant mit `view` genügt zum Öffnen und Anzeigen — das ist die Bedeutung von `view`', () => {
    // **Befund + Fix (V-042):** meine erste Fassung gab `open` die Stufe 2, sodass `view` ein Asset nicht
    // öffnen konnte. Das war keine strenge, sondern eine falsche Regel.
    expect(evaluateVaultAccess(request({ file: file('Restricted'), action: 'open', grants: [grant({ permissions: ['view'] })] })).allowed).toBe(true);
    expect(evaluateVaultAccess(request({ file: file('Restricted'), action: 'preview', grants: [grant({ permissions: ['view'] })] })).allowed).toBe(true);
    // `download` und `export` verlangen mehr.
    expect(evaluateVaultAccess(request({ file: file('Restricted'), action: 'download', grants: [grant({ permissions: ['view'] })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_permission' });
    expect(evaluateVaultAccess(request({ file: file('Restricted'), action: 'export', grants: [grant({ permissions: ['view'] })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_permission' });
  });

  it('ein Grant mit `edit` deckt alles ab, einer mit `download` alles außer Export', () => {
    for (const action of ['open', 'preview', 'download', 'export'] as const) {
      expect(evaluateVaultAccess(request({ file: file('Restricted'), action, grants: [grant({ permissions: ['edit'] })] })), `edit/${action}`)
        .toMatchObject({ allowed: true });
    }
    for (const action of ['open', 'preview', 'download'] as const) {
      expect(evaluateVaultAccess(request({ file: file('Restricted'), action, grants: [grant({ permissions: ['download'] })] })), `download/${action}`)
        .toMatchObject({ allowed: true });
    }
    expect(evaluateVaultAccess(request({ file: file('Restricted'), action: 'export', grants: [grant({ permissions: ['download'] })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_permission' });
  });

  it('ein Grant ohne Berechtigungsliste wird abgelehnt, statt als „alles erlaubt" zu gelten', () => {
    expect(evaluateVaultAccess(request({ file: file('Restricted'), grants: [grant({ permissions: [] })] })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_grant_permission' });
  });

  it('eine exportierte, nicht widerrufbare Kopie blockiert weitere Exporte', () => {
    const decision = evaluateVaultAccess(request({
      file: file('Restricted'), action: 'export',
      grants: [grant({ permissions: ['edit'], copyControl: 'exported_copy_unrevocable' })],
    }));
    expect(decision).toMatchObject({ allowed: false, reason: 'policy_deny_export_copy_unrevocable' });
    // Für `open` ist derselbe Grant weiterhin gültig — die Sperre betrifft den Export.
    expect(evaluateVaultAccess(request({
      file: file('Restricted'), action: 'open',
      grants: [grant({ permissions: ['edit'], copyControl: 'exported_copy_unrevocable' })],
    })).allowed).toBe(true);
  });
});

describe('Fail-closed: jede unbrauchbare Eingabe wird abgelehnt', () => {
  it('ein fehlender oder unbekannter Klassifikationswert ist NICHT „Public"', () => {
    expect(evaluateVaultAccess(request({ file: file(undefined) })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_unknown_classification' });
    expect(evaluateVaultAccess(request({ file: file('Geheim' as never) })))
      .toMatchObject({ allowed: false, reason: 'policy_deny_unknown_classification' });
  });

  it('ein ungesundes Asset wird nie geöffnet — auch nicht mit gültigem Grant', () => {
    for (const status of ['quarantined', 'corrupt', 'missing'] as const) {
      expect(evaluateVaultAccess(request({ file: file('Public', { status }), grants: [grant({ permissions: ['edit'] })] })), status)
        .toMatchObject({ allowed: false, reason: 'policy_deny_classification' });
    }
  });

  it('eine unbrauchbare Anfrage wird abgelehnt, nicht stillschweigend erlaubt', () => {
    expect(evaluateVaultAccess({ file: { id: '', name: 'x' }, action: 'open' } as never))
      .toMatchObject({ allowed: false, reason: 'policy_deny_invalid_request' });
    expect(evaluateVaultAccess({ file: file('Internal'), action: 'loeschen' } as never))
      .toMatchObject({ allowed: false, reason: 'policy_deny_invalid_request' });
    /*
     * **Befund + Fix (V-042):** mein erster Entwurf warf hier `TypeError: Cannot read properties of null` —
     * der Wächter stand da, aber die Meldungsfunktion las `request.app` und stürzte ab. Für eine
     * Autoritätsfunktion ist ein Absturz die falsche Reaktion: eine unbrauchbare Anfrage muss **ablehnen**.
     * (In derselben Runde fand ich den zweiten Teil von V-042: `open` verlangte Stufe 2 und damit mehr als
     * `view` — siehe den Test „ein Grant mit view genügt zum Öffnen".)
     */
    expect(evaluateVaultAccess(null as never)).toMatchObject({ allowed: false, reason: 'policy_deny_invalid_request' });
    expect(evaluateVaultAccess(undefined as never)).toMatchObject({ allowed: false, reason: 'policy_deny_invalid_request' });
  });

  it('ein Grant ohne ID wird abgelehnt', () => {
    expect(evaluateVaultAccess(request({ file: file('Restricted'), grants: [grant({ id: '' })] })).allowed).toBe(false);
  });

  it('mehrere Grants: der beste gültige gewinnt, und ein abgelaufener verdeckt ihn nicht', () => {
    const decision = evaluateVaultAccess(request({
      file: file('Restricted'), action: 'export',
      grants: [grant({ id: 'alt', permissions: ['view'], expiresAt: NOW - 1 }), grant({ id: 'neu', permissions: ['edit'] })],
    }));
    expect(decision).toMatchObject({ allowed: true, grantId: 'neu' });
  });

  it('ein fehlendes `now` fällt auf die aktuelle Zeit zurück, ohne zu werfen', () => {
    const decision = evaluateVaultAccess({ file: file('Restricted'), action: 'open', app: 'Writer', grants: [grant()] });
    expect(decision.allowed).toBe(true);
  });
});

describe('Anzeigehilfen: die Oberfläche darf nicht mehr versprechen als die Autorität hält', () => {
  it('die Ordnung der Stufen ist aufsteigend und vollständig', () => {
    expect(VAULT_CLASSIFICATION_ORDER).toEqual(['Public', 'Internal', 'Confidential', 'Restricted']);
  });

  it('`vaultClassificationAllowsApp` sagt genau das, was `evaluateVaultAccess` entscheidet', () => {
    // Zwei Regeln für eine Frage wären der Fehler, den dieses Projekt mehrfach getroffen hat. Hier wird
    // gemessen, dass die Anzeigehilfe und die Autorität übereinstimmen.
    const apps = ['Writer', 'Publish', 'GaiaCom', null] as const;
    const classifications = ['Public', 'Internal', 'Confidential', 'Restricted'] as const;
    for (const classification of classifications) {
      for (const app of apps) {
        const display = vaultClassificationAllowsApp(classification, app);
        const decision = evaluateVaultAccess({ file: file(classification), action: 'open', app, grants: [], now: NOW });
        expect(display, `${classification}/${app}`).toBe(decision.allowed);
      }
    }
  });

  it('eine unbekannte Stufe gilt in der Anzeige als nicht erlaubt', () => {
    expect(vaultClassificationAllowsApp('Geheim' as never, 'Writer')).toBe(false);
  });
});
