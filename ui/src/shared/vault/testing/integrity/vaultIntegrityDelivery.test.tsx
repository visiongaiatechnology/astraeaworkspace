// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Vault integrity audits are written natively, browser = download.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { VaultIntegrityAuditReport } from '../../../contracts/workspace';
import { VaultIntegrityPanel } from '../../integrity/VaultIntegrityPanel';

const TOKEN = '11111111-2222-4333-8444-555555555555';

const REPORT: VaultIntegrityAuditReport = {
  id: 'audit-1',
  createdAt: 1_700_000_000_000,
  totalFiles: 2,
  verified: 2,
  mismatch: 0,
  unavailable: 0,
  entries: [],
};

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'audit.json' };
        }
        return { contract: 'VGT-IMPORT-SANDBOX-3' };
      },
    },
  };
  return calls;
}

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

function mount(showToast: (message: string) => void) {
  act(() => root.render(React.createElement(VaultIntegrityPanel, {
    files: [],
    audits: [REPORT],
    onVerifyVault: async () => REPORT,
    onRepairFromBackup: async () => { throw new Error('unused'); },
    showToast,
  })));
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Audit report'));
  if (!button) throw new Error('Audit report button missing');
  return button;
}

describe('Vault integrity audit delivery', () => {
  it('writes the audit JSON through the native save dialog', async () => {
    const calls = desktop();
    const showToast = vi.fn();
    const button = mount(showToast);
    await act(async () => { button.click(); });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(calls[0]!.args!.request).toMatchObject({
      suggestedName: `Astraea_Vault_Integrity_${REPORT.createdAt}.json`,
      extensions: ['json'],
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('saved.'));
  });

  it('reports a browser download as a download, not as a save', async () => {
    const showToast = vi.fn();
    const button = mount(showToast);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vault-audit');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await act(async () => { button.click(); });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Download started'));
  });
});
