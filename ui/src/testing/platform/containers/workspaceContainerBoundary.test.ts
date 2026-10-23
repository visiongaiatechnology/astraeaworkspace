import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from '../../../edition/catalog';
import { OPEN_CORE_APP_KINDS } from '../../../edition/contracts';
import type { DocumentKind } from '../../../shared/contracts/workspace';
import { extensionForDocumentKind, WORKSPACE_DOCUMENT_EXTENSIONS } from '../../../platform/containers/vwcStorage';
import {
  assertWorkspaceContainerMagic,
  WORKSPACE_CONTAINER_EXTENSIONS,
  WORKSPACE_FILE_PICKER_ACCEPT,
} from '../../../platform/containers/workspaceContainerBoundary';

const acceptedContainerMagics = [
  'VGT0', 'VGT1', 'VGT2', 'VGT3', 'VGT4', 'VGT5', 'VWC1', 'VGATS001', 'VGTINF02',
] as const;

describe('Workspace container extension contract', () => {
  it('admits each canonical native save extension through the ingress allowlist and picker', () => {
    const pickerExtensions = new Set(WORKSPACE_FILE_PICKER_ACCEPT.split(','));

    const supportedApps = APP_CATALOG.filter((app) => (OPEN_CORE_APP_KINDS as readonly string[]).includes(app.kind));
    const premiumApps = APP_CATALOG.filter((app) => !(OPEN_CORE_APP_KINDS as readonly string[]).includes(app.kind));
    expect(APP_CATALOG).toHaveLength(20);
    expect(supportedApps).toHaveLength(14);
    expect(new Set(WORKSPACE_DOCUMENT_EXTENSIONS).size).toBe(supportedApps.length);
    expect(new Set(WORKSPACE_CONTAINER_EXTENSIONS).size).toBe(supportedApps.length + 1);
    expect(premiumApps.every((app) => app.extension === undefined)).toBe(true);
    expect(WORKSPACE_CONTAINER_EXTENSIONS).toContain('vwc');

    for (const app of supportedApps) {
      if (!app.extension) throw new Error(`Open-Core extension is missing for ${app.kind}.`);
      const extension = extensionForDocumentKind(app.kind as DocumentKind);
      expect(extension).toBe(app.extension.slice(1));
      expect(WORKSPACE_CONTAINER_EXTENSIONS).toContain(extension);
      expect(pickerExtensions).toContain(`.${extension}`);

      const filename = `document.${extension}`;
      for (const magic of acceptedContainerMagics) {
        assertWorkspaceContainerMagic(filename, new TextEncoder().encode(magic));
      }
    }
  });

  it('accepts the generic .vwc alias and rejects non-container foreign extensions', () => {
    const vwc = new TextEncoder().encode('VWC1');
    assertWorkspaceContainerMagic('backup.vwc', vwc);

    for (const filename of ['record.vcf', 'archive.zip', 'document.pdf', 'document.vconn', 'document.vadmin', 'document.vautomate']) {
      expect(() => assertWorkspaceContainerMagic(filename, vwc)).toThrow('Workspace container extension is not supported');
    }
    expect(WORKSPACE_FILE_PICKER_ACCEPT.split(',')).not.toContain('.vconn');
    expect(WORKSPACE_FILE_PICKER_ACCEPT.split(',')).not.toContain('.vadmin');
  });

  it('rejects unrecognized magic even when the extension is canonical', () => {
    expect(() => assertWorkspaceContainerMagic('document.vdoc', new TextEncoder().encode('NOPE')))
      .toThrow('Workspace container magic mismatch');
  });
});
