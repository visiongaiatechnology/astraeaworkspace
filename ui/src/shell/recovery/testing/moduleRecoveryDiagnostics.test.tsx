// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: a contained module crash must leave a diagnosable trace
//
// Measured before this file existed: `componentDidCatch` logged `error.name` and discarded the
// message, the stack and React's component path. The native Grid startup showed
// "Modul wurde sicher angehalten" and left nothing to diagnose — ADR D-GR-001 records exactly
// that gap ("kein Beleg in der ZIP; Runtime-Trace vor Patch").
//
// The trace is bounded and local, and it is content-free **by construction**: the recorder only
// accepts the exception and the component stack, never the document. The tests below pin both
// halves of that sentence.
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { ModuleRecoveryBoundary } from '../ModuleRecoveryBoundary';
import {
  MODULE_RECOVERY_MAX_DIAGNOSTICS,
  MODULE_RECOVERY_MAX_FRAMES,
  MODULE_RECOVERY_MAX_MESSAGE,
  moduleRecoveryDiagnosticFromError,
  readModuleRecoveryDiagnostics,
  recordModuleRecoveryDiagnostic,
  resetModuleRecoveryDiagnostics,
  serializeModuleRecoveryDiagnostics,
} from '../moduleRecoveryCore';

const SECRET_CELL = 'Streng-Geheim-Zelle-9xq';

const document_: WorkspaceDocument = {
  id: 'grid-crash-doc',
  title: 'Crash-Beleg',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function Boom({ message = 'grid exploded' }: { message?: string }): React.ReactElement {
  throw new Error(message);
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  resetModuleRecoveryDiagnostics();
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

async function mountBoundary(children: React.ReactNode): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      React.createElement(ModuleRecoveryBoundary, { document: document_, locale: 'de-DE', children }),
    );
  });
  return container;
}

describe('GR-001 — the containment records the throw site', () => {
  it('records name, message, stack and component path of a render exception', async () => {
    const host = await mountBoundary(React.createElement(Boom));
    expect(host.querySelector('[data-module-recovery="active"]'), 'die Recoveryschicht erscheint').not.toBeNull();

    const [record] = readModuleRecoveryDiagnostics();
    expect(record, 'ein Containment muss genau einen Datensatz erzeugen').toBeDefined();
    expect(record!.schema).toBe('vgt.module-recovery/1');
    expect(record!.name).toBe('Error');
    expect(record!.message).toBe('grid exploded');
    expect(record!.stack.length, 'der Stack darf nicht verworfen werden').toBeGreaterThan(0);
    // V8 may hand a message-only stack to the boundary; either way the throw text must survive.
    expect(record!.stack.join('\n')).toContain('grid exploded');
    // React's component path names the offending component.
    expect(record!.componentStack.join('\n')).toContain('Boom');
    // The incident id shown on the surface is the id of the record.
    expect(host.textContent).toContain(record!.incidentId);
  });

  it('keeps document content out of the trace and out of the export', async () => {
    const payload = JSON.stringify(document_);
    expect(payload).not.toContain(SECRET_CELL);
    await mountBoundary(
      React.createElement('div', null, [React.createElement(Boom, { key: 'boom' })]),
    );
    const exported = serializeModuleRecoveryDiagnostics();
    expect(exported).toContain('grid exploded');
    expect(exported, 'kein Dokumentinhalt im Diagnoseprotokoll').not.toContain(SECRET_CELL);
    expect(exported).not.toContain('Crash-Beleg');
  });

  it('offers the diagnostic export on the recovery surface', async () => {
    const host = await mountBoundary(React.createElement(Boom));
    expect(host.querySelector('[data-module-recovery-diagnostics="true"]')).not.toBeNull();
  });
});

describe('GR-001 — the trace is bounded', () => {
  it('truncates a hostile message and strips control characters', () => {
    const huge = `a\u0000b\u0007c${'x'.repeat(5000)}`;
    const diagnostic = moduleRecoveryDiagnosticFromError(new Error(huge), null, 1_700_000_000_000);
    expect(diagnostic.message.length).toBeLessThanOrEqual(MODULE_RECOVERY_MAX_MESSAGE);
    expect(diagnostic.message).not.toMatch(/[\u0000-\u001f]/u);
    expect(diagnostic.message.endsWith('…')).toBe(true);
  });

  it('caps the frame count and tolerates a missing component stack', () => {
    const error = new Error('deep');
    error.stack = Array.from({ length: 40 }, (_, index) => `at frame${index}`).join('\n');
    const diagnostic = moduleRecoveryDiagnosticFromError(error, undefined);
    expect(diagnostic.stack).toHaveLength(MODULE_RECOVERY_MAX_FRAMES);
    expect(diagnostic.componentStack).toEqual([]);
  });

  it('keeps only the last incidents in the ring buffer', () => {
    for (let index = 0; index < MODULE_RECOVERY_MAX_DIAGNOSTICS + 4; index += 1) {
      const diagnostic = moduleRecoveryDiagnosticFromError(new Error(`e${index}`), null, 1000 + index);
      recordModuleRecoveryDiagnostic({ ...diagnostic, incidentId: `ui-test-${index}` });
    }
    const records = readModuleRecoveryDiagnostics();
    expect(records).toHaveLength(MODULE_RECOVERY_MAX_DIAGNOSTICS);
    expect(records[records.length - 1]!.incidentId).toBe(`ui-test-${MODULE_RECOVERY_MAX_DIAGNOSTICS + 3}`);
  });
});
