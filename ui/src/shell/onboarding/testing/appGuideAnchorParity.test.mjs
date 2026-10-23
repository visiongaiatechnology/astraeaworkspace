// STATUS: PLATIN — all fourteen guide steps resolve to rendered Open Core controls.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPEN_CORE_APP_KINDS } from '../../../edition/contracts.ts';
import { appGuideAnchorStep, appGuideAnchorSelector } from '../appGuideAnchors.ts';

const sourceRoot = new URL('../../../', import.meta.url);
const markerSources = [
  ['Writer:first', 'apps/writer/editor/paragraphs/WriterParagraphItem.tsx'],
  ['Writer:second', 'apps/writer/formatting/toolbar/WriterFormattingToolbarCharacterRow.tsx'],
  ['Writer:embed', 'apps/writer/formatting/toolbar/WriterFormattingToolbar.tsx'],
  ['Writer:embed-mode', 'apps/writer/integrations/grid/WriterGridEmbedModal.tsx'],
  ['Writer:live-refresh', 'apps/writer/integrations/workspace/WriterWorkspaceEmbedBlock.tsx'],
  ['Grid:first', 'apps/grid/canvas/GridTableCanvas.tsx'],
  ['Grid:second', 'apps/grid/canvas/GridTableCanvas.tsx'],
  ['Present:first', 'apps/present/editor/navigation/PresentSidebar.tsx'],
  ['Present:second', 'apps/present/editor/toolbar/PresentTopToolbar.tsx'],
  ['Notes:first', 'apps/notes/editor/toolbar/NotesEditorToolbar.tsx'],
  ['Notes:second', 'apps/notes/editor/NotesEditorBody.tsx'],
  ['PdfStudio:first', 'apps/pdf/viewer/thumbnails/PdfThumbnailsSidebar.tsx'],
  ['PdfStudio:second', 'apps/pdf/studio/PdfToolbar.tsx'],
  ['Tasks:first', 'apps/tasks/views/TasksView.tsx'],
  ['Tasks:second', 'apps/tasks/views/TasksView.tsx'],
  ['Whiteboard:first', 'apps/whiteboard/toolbar/WhiteboardToolbar.tsx'],
  ['Whiteboard:second', 'apps/whiteboard/app/WhiteboardCanvas.tsx'],
  ['Draw:first', 'apps/draw/canvas/DrawCanvas.tsx'],
  ['Draw:second', 'apps/draw/canvas/DrawCanvas.tsx'],
  ['Vault:first', 'shared/vault/security/VaultKeyPolicyPanel.tsx'],
  ['Vault:second', 'shared/vault/integrity/VaultIntegrityPanel.tsx'],
  ['AdminPolicy:first', 'apps/admin-policy/panels/AdminPolicyView.tsx'],
  ['AdminPolicy:second', 'apps/admin-policy/panels/AdminPolicyView.tsx'],
  ['Publish:first', 'apps/publish/editor/PublishToolbar.tsx'],
  ['Publish:second', 'apps/publish/editor/PublishToolbar.tsx'],
  ['Insight:first', 'apps/insight/views/InsightView.tsx'],
  ['Insight:second', 'apps/insight/views/InsightView.tsx'],
  ['Connect:first', 'apps/connect/components/ConnectSidebar.tsx'],
  ['Connect:second', 'apps/connect/components/ConnectMailViewer.tsx'],
  ['Automate:first', 'apps/automate/toolbar/AutomatePalette.tsx'],
  ['Automate:second', 'apps/automate/app/AutomateView.tsx'],
];

const connectedSteps = [
  ['Grid', 'Grid:first'],
  ['Writer', 'Writer:embed'],
  ['Writer', 'Writer:embed-mode'],
  ['Grid', 'Grid:second'],
  ['Writer', 'Writer:live-refresh'],
  ['Present', 'Present:second'],
];

describe('interactive app-guide anchors', () => {
  it('maps the first two guide steps for every Open Core app to actual controls', () => {
    for (const kind of OPEN_CORE_APP_KINDS) {
      for (const [index, suffix] of ['first', 'second'].entries()) {
        expect(appGuideAnchorStep({ type: 'app', kind }, index)).toEqual({ app: kind, id: `${kind}:${suffix}` });
      }
    }

    for (const [id, relativePath] of markerSources) {
      const source = readFileSync(new URL(relativePath, sourceRoot), 'utf8');
      expect(source, id).toContain(id);
      expect(source, id).toContain('data-vgt-app-guide-anchor');
    }
  });

  it('gives the explaining steps 3–7 no fake anchor instead of pointing at an unrelated control', () => {
    // Der App-Rundgang erklärt sieben Punkte; die Apps stellen weiterhin genau zwei geprüfte
    // Ankersteuerelemente bereit. Schritte 2–6 sind erklärende Schritte ohne Einzelsteuerungs-Anker.
    for (const kind of OPEN_CORE_APP_KINDS) {
      for (let index = 2; index < 7; index += 1) {
        expect(appGuideAnchorStep({ type: 'app', kind }, index), `${kind} step ${index}`).toBeNull();
      }
      // Nur die ersten beiden Schritte sind Coachmark-Schritte; sie bleiben unverändert.
      expect(appGuideAnchorStep({ type: 'app', kind }, 0)).not.toBeNull();
      expect(appGuideAnchorStep({ type: 'app', kind }, 1)).not.toBeNull();
    }
    // Auch unsinnige Indizes erfinden keinen Anker.
    expect(appGuideAnchorStep({ type: 'app', kind: 'Writer' }, -1)).toBeNull();
    expect(appGuideAnchorStep({ type: 'app', kind: 'Writer' }, 99)).toBeNull();
  });

  it('keeps the six-step Grid-to-Writer sequence anchored to its source and destination controls', () => {
    for (const [index, [app, id]] of connectedSteps.entries()) {
      expect(appGuideAnchorStep({ type: 'connected-workspace' }, index)).toEqual({ app, id });
    }
    expect(appGuideAnchorSelector('Writer:embed-mode')).toBe('[data-vgt-app-guide-anchor="Writer:embed-mode"]');
  });
});
