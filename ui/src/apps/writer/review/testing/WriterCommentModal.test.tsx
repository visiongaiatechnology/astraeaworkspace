// @vitest-environment happy-dom
// STATUS: PLATIN — WR-038: the comment button opens a real composer, not canned text
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WriterCommentModal } from '../WriterCommentModal';
import { WRITER_COMMENT_MODAL_COPY } from '../writerCommentModalLocale';

const COPY = WRITER_COMMENT_MODAL_COPY['en-US'];

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

async function mount(onSave: (text: string, author: string) => boolean, onClose = vi.fn()): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <WriterCommentModal
        isOpen
        selectionPreview="Astraea"
        onClose={onClose}
        onSave={onSave}
      />,
    );
  });
  return container;
}

describe('WR-038 — comment composer', () => {
  it('refuses an empty comment with a visible message', async () => {
    const onSave = vi.fn(() => true);
    const host = await mount(onSave);
    const save = host.querySelector<HTMLElement>('[data-writer-comment-action="save"]')!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(host.querySelector('[data-writer-comment-error="true"]')?.textContent).toBe(COPY.empty);
  });

  it('saves the typed text and the author, then closes', async () => {
    const onSave = vi.fn(() => true);
    const onClose = vi.fn();
    const host = await mount(onSave, onClose);
    const input = host.querySelector<HTMLTextAreaElement>('[data-writer-comment-input="true"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, 'Bitte Zahl prüfen');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = host.querySelector<HTMLElement>('[data-writer-comment-action="save"]')!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledWith('Bitte Zahl prüfen', 'Reviewer');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and reports a refused save', async () => {
    const onSave = vi.fn(() => false);
    const onClose = vi.fn();
    const host = await mount(onSave, onClose);
    const input = host.querySelector<HTMLTextAreaElement>('[data-writer-comment-input="true"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, 'Kommentar');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = host.querySelector<HTMLElement>('[data-writer-comment-action="save"]')!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('[data-writer-comment-error="true"]')?.textContent).toBe(COPY.blocked);

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
