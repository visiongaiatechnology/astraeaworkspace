// @vitest-environment happy-dom
// STATUS: PLATIN — native Present display bridge (Runde 42): optional, validated, fallback-safe.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closePresentDisplay,
  createPresentSessionId,
  listPresentMonitors,
  openPresentDisplay,
  presentDisplayAvailable,
} from '../presentWindowBridge';

function desktop(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe('Present display bridge', () => {
  it('is optional outside the desktop application', async () => {
    expect(presentDisplayAvailable()).toBe(false);
    await expect(listPresentMonitors()).resolves.toEqual([]);
    await expect(openPresentDisplay('audience', 0, createPresentSessionId())).resolves.toBeNull();
    await expect(closePresentDisplay('audience')).resolves.toBeUndefined();
  });

  it('sanitizes the native monitor list and drops unusable entries', async () => {
    desktop(async (command) => {
      expect(command).toBe('vgt_present_monitors');
      return [
        { index: 0, name: 'Primary', width: 2560, height: 1440, x: 0, y: 0, scale_factor: 1.25, primary: true },
        { index: 1, name: '', width: 1920, height: 1080, x: -1920, y: 0, scale_factor: 1, primary: false },
        { index: 2, name: 'Broken', width: 0, height: 0, x: 0, y: 0, scale_factor: 1, primary: false },
        'not-a-monitor',
      ];
    });
    const monitors = await listPresentMonitors();
    expect(monitors).toHaveLength(2);
    expect(monitors[0]).toMatchObject({ name: 'Primary', primary: true, scaleFactor: 1.25 });
    expect(monitors[1]).toMatchObject({ name: 'Display 2', width: 1920, height: 1080, primary: false });
    expect(monitors.map((monitor) => monitor.index)).toEqual([0, 1]);
  });

  it('opens a display with one validated session and the monitor index in snake_case', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    desktop(async (command, args) => {
      calls.push({ command, args });
      return 'present-audience';
    });
    const session = createPresentSessionId();
    const handle = await openPresentDisplay('audience', 1, session);
    expect(handle).toEqual({ role: 'audience', label: 'present-audience', session });
    expect(calls[0]!.args!.request).toEqual({ role: 'audience', monitor_index: 1, session });
    expect(session).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
  });

  it('rejects invalid roles, monitors, sessions and labels before a native window is opened', async () => {
    const invoke = vi.fn(async () => 'present-audience');
    desktop(invoke);
    const session = createPresentSessionId();
    await expect(openPresentDisplay('editor' as never, 0, session)).rejects.toThrow(/role is invalid/u);
    await expect(openPresentDisplay('audience', -1, session)).rejects.toThrow(/monitor is invalid/u);
    await expect(openPresentDisplay('audience', 99, session)).rejects.toThrow(/monitor is invalid/u);
    await expect(openPresentDisplay('audience', 0, 'bad session&x=1')).rejects.toThrow(/session is invalid/u);
    expect(invoke).not.toHaveBeenCalled();

    desktop(async () => '../evil');
    await expect(openPresentDisplay('audience', 0, session)).rejects.toThrow(/invalid label/u);
    await expect(closePresentDisplay('editor' as never)).rejects.toThrow(/role is invalid/u);
  });

  it('closes a display and never fails when the window is already gone', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('window not found');
    });
    desktop(invoke);
    await expect(closePresentDisplay('presenter')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('vgt_present_close_display', { request: { role: 'presenter' } });
  });
});
