import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DestructiveConfirmationDialog } from '../components/DestructiveConfirmationDialog';

describe('DestructiveConfirmationDialog', () => {
  it('starts with a focused safe cancel action and announces the consequence', () => {
    const html = renderToStaticMarkup(createElement(DestructiveConfirmationDialog, {
      title: 'Revoke device key?',
      description: 'This device will lose access to new shared secrets.',
      confirmLabel: 'Revoke device',
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="alert"');
    expect(html.indexOf('data-initial-focus="cancel"')).toBeLessThan(html.indexOf('>Revoke device</button>'));
    expect(html).toContain('data-initial-focus="cancel"');
  });

  it('keeps a destructive action disabled until the exact phrase is supplied', () => {
    const html = renderToStaticMarkup(createElement(DestructiveConfirmationDialog, {
      title: 'Empty Trash?',
      description: 'All items in Trash will be permanently removed.',
      confirmLabel: 'Empty Trash',
      requiredText: 'EMPTY TRASH',
      requiredTextLabel: 'Type EMPTY TRASH to continue',
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }));

    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Type EMPTY TRASH to continue');
    expect(html).toContain('disabled=""');
    expect(html.indexOf('data-initial-focus="cancel"')).toBeLessThan(html.indexOf('>Empty Trash</button>'));
  });
});
