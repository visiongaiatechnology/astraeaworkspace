// BATCH-PRESENT — presentation-mode keyboard contract (Paket 19, 20).
import { describe, expect, it } from 'vitest';
import {
  PRESENTER_BINDINGS,
  PRESENTER_BINDING_INPUTS,
  PRESENTER_MAX_DIGIT_BUFFER,
  appendPresenterDigit,
  isPresenterDigit,
  resolvePresentationStartKey,
  resolvePresenterKey,
} from '../../presenter/presenterKeyboard';

describe('Presenter keyboard', () => {
  it('resolves the representative keystroke of every declared presenter binding', () => {
    for (const binding of PRESENTER_BINDINGS) {
      const input = PRESENTER_BINDING_INPUTS[binding.fn];
      expect(input, `missing representative input for ${binding.fn}`).toBeTruthy();
      const command = resolvePresenterKey(input, { digitBuffer: '3' });
      expect(command, `${binding.fn} is pointer-only`).not.toBeNull();
      expect(command?.type, `${binding.fn} resolves to the wrong command`).toBe(binding.commandType);
    }
  });

  it('advances and rewinds for every documented key', () => {
    for (const key of ['ArrowRight', ' ', 'PageDown', 'ArrowDown']) {
      expect(resolvePresenterKey({ key })?.type, key).toBe('next');
    }
    for (const key of ['ArrowLeft', 'PageUp', 'ArrowUp']) {
      expect(resolvePresenterKey({ key })?.type, key).toBe('previous');
    }
  });

  it('jumps to the first, last and a typed slide number', () => {
    expect(resolvePresenterKey({ key: 'Home' })).toEqual({ type: 'first-slide' });
    expect(resolvePresenterKey({ key: 'End' })).toEqual({ type: 'last-slide' });
    expect(resolvePresenterKey({ key: 'Enter' }, { digitBuffer: '12' })).toEqual({ type: 'goto-slide', slideNumber: 12 });
    // Enter without a typed number must not be swallowed as a jump.
    expect(resolvePresenterKey({ key: 'Enter' }, { digitBuffer: '' })).toBeNull();
  });

  it('builds a bounded digit buffer and refuses leading zeros', () => {
    expect(isPresenterDigit('7')).toBe(true);
    expect(isPresenterDigit('a')).toBe(false);
    expect(appendPresenterDigit('', '1')).toBe('1');
    expect(appendPresenterDigit('1', '2')).toBe('12');
    expect(appendPresenterDigit('', '0')).toBe('0');
    expect(appendPresenterDigit('0', '5')).toBe('5');
    const long = '123456'.split('').reduce((buffer, digit) => appendPresenterDigit(buffer, digit) ?? buffer, '');
    expect(long).toBe('3456');
    expect(long.length).toBe(PRESENTER_MAX_DIGIT_BUFFER);
  });

  it('maps black/white screen, laser and the ink tools', () => {
    expect(resolvePresenterKey({ key: 'b' })).toEqual({ type: 'black' });
    expect(resolvePresenterKey({ key: 'B' })).toEqual({ type: 'black' });
    expect(resolvePresenterKey({ key: 'w' })).toEqual({ type: 'white' });
    expect(resolvePresenterKey({ key: 'l' })).toEqual({ type: 'laser' });
    expect(resolvePresenterKey({ key: 'p' })).toEqual({ type: 'pen' });
    expect(resolvePresenterKey({ key: 'e' })).toEqual({ type: 'eraser' });
    expect(resolvePresenterKey({ key: 'c' })).toEqual({ type: 'clear-ink' });
    expect(resolvePresenterKey({ key: 'h', ctrlKey: true })).toEqual({ type: 'highlighter' });
    expect(resolvePresenterKey({ key: 'a', ctrlKey: true })).toEqual({ type: 'no-tool' });
  });

  it('does not treat a Ctrl combination as a plain letter shortcut', () => {
    // Ctrl+B must not toggle the black screen; only the bare key may.
    expect(resolvePresenterKey({ key: 'b', ctrlKey: true })).toBeNull();
    expect(resolvePresenterKey({ key: 'w', metaKey: true })).toBeNull();
  });

  it('exits on Escape regardless of screen state and returns null for unknown keys', () => {
    expect(resolvePresenterKey({ key: 'Escape' }, { blackScreen: true })).toEqual({ type: 'exit' });
    expect(resolvePresenterKey({ key: 'F13' })).toBeNull();
  });

  it('starts from the first slide with F5 and from the active slide with Shift+F5', () => {
    expect(resolvePresentationStartKey({ key: 'F5' })).toEqual({ fromCurrent: false });
    expect(resolvePresentationStartKey({ key: 'F5', shiftKey: true })).toEqual({ fromCurrent: true });
    expect(resolvePresentationStartKey({ key: 'F6' })).toBeNull();
    expect(resolvePresentationStartKey({ key: 'Escape' })).toBeNull();
  });
});
