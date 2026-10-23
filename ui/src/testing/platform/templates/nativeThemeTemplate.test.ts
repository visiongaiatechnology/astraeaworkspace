import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { createBetaTemplate } from '../../../platform/templates/betaTemplates';
import { instantiateNativeBetaTemplate } from '../../../platform/templates/nativeThemeTemplate';

describe('instantiateNativeBetaTemplate', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    Reflect.deleteProperty(globalThis, 'window');
    invokeMock.mockReset();
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
      return;
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });

  it('uses the built-in seed in browser runtimes without native template IPC', async () => {
    const document = await instantiateNativeBetaTemplate('grid-budget');

    expect(document.kind).toBe('Grid');
    expect(document.title).toBe('Budget & Forecast');
    expect(document.gridData).toBeDefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('keeps native Tauri template instantiation authoritative when available', async () => {
    const nativeDocument = createBetaTemplate('grid-budget');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __TAURI_INTERNALS__: {} },
    });
    invokeMock.mockResolvedValue(nativeDocument);

    await expect(instantiateNativeBetaTemplate('grid-budget')).resolves.toBe(nativeDocument);
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('vgt_template_instantiate', expect.objectContaining({
      request: expect.objectContaining({ new_title: 'Budget & Forecast' }),
    }));
  });
});
