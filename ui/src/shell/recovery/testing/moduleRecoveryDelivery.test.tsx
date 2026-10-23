// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Recovery payloads are written natively, with the textarea fallback kept.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRecoveryBoundary } from '../ModuleRecoveryBoundary';

const TOKEN = '11111111-2222-4333-8444-555555555555';

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'diagnostics.json' };
        }
        return { contract: 'VGT-IMPORT-SANDBOX-3' };
      },
    },
  };
  return calls;
}

const Boom: React.FC = () => {
  throw new Error('probe crash for recovery delivery');
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
});

async function mountAndExportDiagnostics(): Promise<HTMLButtonElement> {
  await act(async () => {
    root.render(React.createElement(ModuleRecoveryBoundary, {
      document: null,
      locale: 'en-US',
      children: React.createElement(Boom),
    }));
  });
  const button = container.querySelector<HTMLButtonElement>('[data-module-recovery-diagnostics="true"]');
  if (!button) throw new Error('diagnostics export button missing');
  await act(async () => { button.click(); });
  return button;
}

describe('Module recovery payload delivery', () => {
  it('writes the diagnostic scan through the native save dialog and keeps the textarea fallback', async () => {
    const calls = desktop();
    await mountAndExportDiagnostics();
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    const request = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(request.suggestedName).toMatch(/^astraea-module-diagnostics-.*\.json$/u);
    expect(request.extensions).toEqual(['json']);
    const panel = container.querySelector('[data-module-recovery-panel="diagnostics"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('[data-module-recovery-text="true"]')).not.toBeNull();
  });

  it('keeps the copyable panel when the write is only a browser download', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recovery-diagnostics');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await mountAndExportDiagnostics();
    const panel = container.querySelector('[data-module-recovery-panel="diagnostics"]');
    expect(panel).not.toBeNull();
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-module-recovery-text="true"]');
    expect(textarea?.value.length).toBeGreaterThan(0);
  });
});
