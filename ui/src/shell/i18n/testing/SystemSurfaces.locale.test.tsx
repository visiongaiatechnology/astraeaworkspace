// STATUS: PLATIN — rendered localization coverage for system dialogs, enum labels, and accessibility names.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { FabricLink } from '../../../shared/workspace-interaction/fabric';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { FabricGraphModal } from '../../fabric/FabricGraphModal';
import { ModuleRecoveryBoundary } from '../../recovery/ModuleRecoveryBoundary';
import { WorkspacePlatformAdvancedModal } from '../../platform/WorkspacePlatformAdvancedModal';
import { fabricGraphCopy } from '../fabricGraphLocale';
import { moduleRecoveryCopy } from '../moduleRecoveryLocale';
import { platformAdvancedCopy } from '../platformAdvancedLocale';
import { workspaceFrameCopy } from '../workspaceFrameLocale';
import { shellSurfaceCopy } from '../shellSurfaceLocale';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const activeDocument = { id: 'target-1', title: 'Quarterly plan', kind: 'Writer', objects: {} } as unknown as WorkspaceDocument;
const sourceDocument = { id: 'source-1', title: 'Customer records', kind: 'Grid', objects: {} } as unknown as WorkspaceDocument;
const statuses: FabricLink['status'][] = ['current', 'changed', 'broken', 'unavailable', 'permission-lost', 'frozen'];
const links = statuses.map((status, index): FabricLink => ({
  targetDocId: activeDocument.id,
  targetRefId: `reference-${index}`,
  sourceDocId: sourceDocument.id,
  sourceObjId: `object-${index}`,
  mode: index % 2 === 0 ? 'Live' : 'Frozen',
  status,
}));

describe('shared system surface localization', () => {
  it.each(WORKSPACE_LOCALES)('provides localized frame accessibility and error copy in %s', (locale) => {
    const copy = workspaceFrameCopy(locale);
    expect(copy.skipToContent).toBeTruthy();
    expect(copy.explorerMain).toBeTruthy();
    expect(copy.activeWorkspace).toBeTruthy();
    expect(copy.explorerPreferencesError).toBeTruthy();
    expect(copy.zenShortcut).toContain('F11');
    expect(copy.activeDocument('Astraea Writer', 'Quarterly plan')).toContain('Quarterly plan');
    expect(copy.activeDocument('Astraea Writer', 'Quarterly plan')).toContain('Astraea Writer');
    expect(shellSurfaceCopy(locale).sidebar.sovereigntyTagline).toBeTruthy();
  });

  it.each(WORKSPACE_LOCALES)('renders Fabric controls and typed link states in %s', (locale) => {
    localeState.current = locale;
    const copy = fabricGraphCopy(locale);
    const markup = renderToStaticMarkup(<FabricGraphModal
      isOpen
      onClose={vi.fn()}
      links={links}
      documents={{ [activeDocument.id]: activeDocument, [sourceDocument.id]: sourceDocument }}
      activeDocumentId={activeDocument.id}
      onOpenSource={vi.fn()}
      onRefresh={vi.fn()}
      onFreeze={vi.fn()}
      onBreakLink={vi.fn()}
      onRelink={vi.fn()}
      onInsertFromWorkspace={vi.fn()}
    />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(`aria-label="${copy.closeDialog}"`);
    expect(markup).toContain(copy.description);
    expect(markup).toContain(copy.insertTitle);
    expect(markup).toContain(`aria-label="${copy.chooseSourceDocument}"`);
    expect(markup).toContain(`aria-label="${copy.chooseSourceObject}"`);
    expect(markup).toContain(copy.transfer.LiveLink);
    expect(markup).toContain(copy.transfer.PasteCopy);
    expect(markup).toContain(copy.activeLinks(links.length));
    expect(markup).toContain(copy.mode.Live);
    expect(markup).toContain(copy.mode.Frozen);
    expect(markup).toContain('Quarterly plan');
    expect(markup).toContain('Customer records');
    for (const status of statuses) expect(markup).toContain(copy.status[status]);
    expect(markup).not.toContain('permission-lost');
  });

  it.each(WORKSPACE_LOCALES)('renders the Fabric empty state in %s', (locale) => {
    localeState.current = locale;
    const copy = fabricGraphCopy(locale);
    const markup = renderToStaticMarkup(<FabricGraphModal
      isOpen
      onClose={vi.fn()}
      links={[]}
      documents={{ [activeDocument.id]: activeDocument }}
      activeDocumentId={activeDocument.id}
      onOpenSource={vi.fn()}
      onRefresh={vi.fn()}
      onFreeze={vi.fn()}
      onBreakLink={vi.fn()}
      onRelink={vi.fn()}
      onInsertFromWorkspace={vi.fn()}
    />);
    expect(markup).toContain(copy.noLinks);
    expect(markup).toContain(copy.noNetworkRetrieval);
  });

  it.each(WORKSPACE_LOCALES)('renders the module recovery state in %s without exposing exception text', (locale) => {
    const copy = moduleRecoveryCopy(locale);
    const boundary = new ModuleRecoveryBoundary({ document: activeDocument, locale, children: null });
    boundary.state = { error: new Error('private stack detail'), incidentId: 'ui-test-incident', panel: 'none', panelText: '', copyStatus: 'idle' };
    const markup = renderToStaticMarkup(boundary.render());

    expect(markup).toContain(copy.stopped);
    expect(markup).toContain(copy.workspaceContinues);
    expect(markup).toContain(copy.explanation);
    expect(markup).toContain(copy.exportState);
    expect(markup).toContain(copy.restartModule);
    expect(markup).toContain(`${copy.incident}: ui-test-incident`);
    expect(markup).not.toContain('private stack detail');
  });

  it.each(WORKSPACE_LOCALES)('renders platform diagnostics navigation and attestation copy in %s', (locale) => {
    localeState.current = locale;
    const copy = platformAdvancedCopy(locale);
    const markup = renderToStaticMarkup(<WorkspacePlatformAdvancedModal isOpen onClose={vi.fn()} showToast={vi.fn()} />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(`aria-label="${copy.header.close}"`);
    expect(markup).toContain(copy.header.description);
    expect(markup).toContain(copy.tabs.keyvault);
    expect(markup).toContain(copy.tabs.wasm);
    expect(markup).toContain(copy.tabs.fabric);
    expect(markup).toContain(copy.tabs.suite);
    expect(markup).toContain(copy.attestation.heading);
    expect(markup).toContain(copy.attestation.attest);
    expect(markup).toContain(copy.attestation.testClaim);
    for (const [code, label] of Object.entries(copy.wasm.status)) {
      expect(label).toBeTruthy();
      expect(label).not.toBe(code);
    }
    for (const [code, label] of Object.entries(copy.attestation.tierName)) {
      expect(label).toBeTruthy();
      expect(label).not.toBe(code);
    }
    for (const [code, label] of Object.entries(copy.attestation.verdictName)) {
      expect(label).toBeTruthy();
      expect(label).not.toBe(code);
    }
    for (const test of Object.values(copy.suite.test)) {
      expect(test.name).toBeTruthy();
      expect(test.passed).toBeTruthy();
      expect(test.failed).toBeTruthy();
    }
  });
});
