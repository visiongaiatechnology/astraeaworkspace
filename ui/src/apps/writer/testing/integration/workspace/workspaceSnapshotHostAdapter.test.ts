// STATUS: PLATIN — Writer snapshot provider is installed only through the neutral platform port.
import { afterEach, expect, it } from 'vitest';
import { extractWorkspaceEmbedSnapshot } from '../../../../../platform/workspace/integrations/workspaceSnapshot';
import { initialDocs } from '../../../../../app/bootstrap/seedData';
import { installWriterWorkspaceSnapshotHost } from '../../../interchange/workspace/workspaceSnapshotHostAdapter';

const writerDocument = Object.values(initialDocs).find((document) => document.kind === 'Writer');
if (!writerDocument) throw new Error('Writer snapshot adapter test requires a canonical Writer document.');

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('routes a bounded Writer snapshot through the shared port', () => {
  release = installWriterWorkspaceSnapshotHost();

  const result = extractWorkspaceEmbedSnapshot(writerDocument, { kind: 'writer-live-link' });

  expect(result.type).toBe('summary');
  if (result.type !== 'summary') throw new Error('Writer live-link should produce a summary snapshot.');
  expect(result.metrics.some((metric) => metric.label === 'Version')).toBe(true);
});
