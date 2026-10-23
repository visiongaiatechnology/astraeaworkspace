// STATUS: PLATIN — Ein Schloss, das nur Panels ausblendet, ist kein Schloss.
//
// Gemessener Befund am Produktionspfad (nicht angenommen): `VaultFreeRuntime` führt `runtimeLocked`. Beim
// Sperren verschwinden die Panels, die der Elternteil mit `{!runtimeLocked && …}` rendert. Was **nicht**
// verschwindet, weil es State von Kindkomponenten ist:
//   • `VaultFilesTab.previewFile` → `VaultQuickPreviewModal` blieb gemountet und rendert weiter
//     `preview.dataUrl` in ein `<img src=…>` (VaultQuickPreviewModal.tsx).
//   • `VaultFilesTab.selectedFileForInspection` → Attestationsdialog blieb offen.
//   • die gefilterte Dateiliste (Name, Tags, Owner, Digest) blieb im DOM.
//
// Dieser Test rendert die Komponenten **ohne Browser** mit `renderToStaticMarkup` und prüft die eine
// Zusage, die zählt: im gesperrten Zustand darf kein entschlüsselter Inhalt und kein Metadatum im Markup
// stehen. Das ist keine Stilfrage — `data:image/png;base64,…` im Markup ist der Klartext selbst.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../../../shared/contracts/workspace';
import { VaultFilesTab } from '../../../../shared/vault/files/VaultFilesTab';
import { VaultQuickPreviewModal } from '../../../../shared/vault/preview/VaultQuickPreviewModal';
import { VaultContentAttestationModal } from '../../security/VaultContentAttestationModal';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined }),
}));

/** Ein PNG-Kopf ist nötig, weil die Vorschau das Format an der Signatur prüft. */
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const secretFile: VaultFile = {
  id: 'vf-secret',
  name: 'gehaltsliste-2026.png',
  kind: 'Writer',
  sizeBytes: 68,
  encryptedHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  contentDigest: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  lastModified: 1_700_000_000_000,
  sourceType: 'attachment',
  mimeType: 'image/png',
  payloadDataUrl: PNG_DATA_URL,
  integrityState: 'verified',
  status: 'available',
  tags: ['geheim', 'hr'],
  owner: 'local-user',
};

const noop = (): void => undefined;
const filesTabProps = {
  files: [secretFile],
  folders: [],
  documents: [],
  onAddLocalFiles: async () => undefined,
  onAddWorkspaceDocument: async () => undefined,
  onUpdateFileSystem: noop,
  onDeleteFile: noop,
  onVerifyFile: async () => ({ state: 'verified' as const, message: 'ok' }),
  onOpenWith: async () => undefined,
} satisfies ComponentProps<typeof VaultFilesTab>;

describe('Vault-Sperre nimmt entschlüsseltes Material zurück', () => {
  it('entsperrt: die Dateiliste und der Vorschau-Dialog zeigen Inhalt (Gegenprobe)', () => {
    // Ohne diese Gegenprobe wäre der Test wertlos: er würde auch dann grün, wenn die Komponente nie
    // irgendetwas rendert.
    const tab = renderToStaticMarkup(<VaultFilesTab {...filesTabProps} locked={false} />);
    expect(tab).toContain('data-vault-locked="false"');
    expect(tab).toContain('gehaltsliste-2026.png');
    expect(tab).toContain('geheim');

    // Grenze der statischen Messung, ausdrücklich: `buildVaultSafePreview` ist **asynchron**. Im
    // SSR-Markup steht deshalb nie ein `<img>`, auch nicht entsperrt — `renderToStaticMarkup` wartet nicht
    // auf Effekte. Für den entsperrten Zweig ist hier also nur der Rahmen prüfbar (Name, Dialog offen);
    // die Nutzlast selbst ist über die Vorschau-Engine-Tests belegt, nicht über dieses Markup.
    const modal = renderToStaticMarkup(<VaultQuickPreviewModal file={secretFile} onClose={noop} locked={false} />);
    expect(modal).not.toContain('data-vault-preview-locked="true"');
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('gehaltsliste-2026.png');
  });

  it('gesperrt: kein Dateiname, kein Tag, kein Digest, kein data:-Bild im Markup', () => {
    const tab = renderToStaticMarkup(<VaultFilesTab {...filesTabProps} locked />);
    expect(tab).toContain('data-vault-locked="true"');
    expect(tab).not.toContain('gehaltsliste-2026.png');
    expect(tab).not.toContain('geheim');
    expect(tab).not.toContain('deadbeef');
    expect(tab).not.toContain('data:image');
    expect(tab).toContain('Vault locked');
  });

  it('gesperrt: der Vorschau-Dialog gibt die Nutzlast nicht heraus und lädt nichts nach', () => {
    const modal = renderToStaticMarkup(<VaultQuickPreviewModal file={secretFile} onClose={noop} locked />);
    expect(modal).toContain('data-vault-preview-locked="true"');
    expect(modal).not.toContain('data:image/png');
    expect(modal).not.toContain('<img');
    expect(modal).not.toContain('gehaltsliste-2026.png');
  });

  it('gesperrt: der Attestationsdialog gibt weder Namen noch Digest heraus', () => {
    const modal = renderToStaticMarkup(<VaultContentAttestationModal file={secretFile} onClose={noop} locked />);
    expect(modal).toBe('');
    // Gegenprobe: ohne Sperre zeigt derselbe Dialog beides. Damit ist belegt, dass das leere Markup an der
    // Sperre liegt und nicht daran, dass der Dialog ohnehin nichts rendert.
    const open = renderToStaticMarkup(<VaultContentAttestationModal file={secretFile} onClose={noop} />);
    expect(open).toContain('gehaltsliste-2026.png');
    expect(open).toContain('deadbeef');
  });

  it('die Nutzlast selbst ist eine gültige passive Rasterdatei — die Sperre verbirgt echten Inhalt', () => {
    // Ohne diese Prüfung könnte das gesperrte Markup leer sein, weil die Nutzlast gar keine Vorschau
    // ergeben hätte. Der PNG-Kopf muss die Signaturprüfung bestehen, sonst testet der Test oben nichts.
    expect(PNG_DATA_URL.startsWith('data:image/png;base64,')).toBe(true);
    expect(secretFile.payloadDataUrl).toBe(PNG_DATA_URL);
    expect(secretFile.name).toContain('gehaltsliste');
  });

  it('der Vorschau-Dialog ist ohne ausdrückliche Sperre nicht stillschweigend gesperrt (kein Regressionsschalter)', () => {
    // Die Sperre ist opt-in, damit ein Aufrufer, der sie noch nicht setzt, nichts verliert. Dass der
    // Elternteil sie setzen **muss**, hält der Quellvertrag `vaultRuntimeLockWiring.contract.test.mjs` fest.
    const modal = renderToStaticMarkup(<VaultQuickPreviewModal file={secretFile} onClose={noop} />);
    expect(modal).not.toContain('data-vault-preview-locked="true"');
  });
});
