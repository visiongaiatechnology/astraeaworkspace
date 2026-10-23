import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppLauncherDrawer } from '../AppLauncherDrawer';
import { ALL_APPS } from '../appLauncherCatalog';
import { createEditionRegistry } from '../../../edition/registry';

describe('AppLauncherDrawer accessibility contract', () => {
  it('keeps the extracted app catalog bounded, uniquely keyed, and fully classified', () => {
    expect(ALL_APPS).toHaveLength(23);
    expect(new Set(ALL_APPS.map((app) => app.id)).size).toBe(ALL_APPS.length);
    for (const app of ALL_APPS) {
      expect(app.id.trim()).not.toBe('');
      expect(app.name.trim()).not.toBe('');
      if (app.kind && !['Planner', 'Projects', 'Forms', 'Database', 'Spaces', 'GaiaCom'].includes(app.kind)) expect(app.ext?.trim()).not.toBe('');
      expect(app.description.trim()).not.toBe('');
      expect(['Office', 'Collaboration', 'Core Engine', 'Security', 'Admin']).toContain(app.category);
      expect(Boolean(app.kind) !== Boolean(app.action)).toBe(true);
    }
  });

  it('exposes the 23-module launcher as a labelled modal dialog', () => {
    const html = renderToStaticMarkup(createElement(AppLauncherDrawer, {
      isOpen: true,
      onClose: vi.fn(),
      onSelectApp: vi.fn(),
      editionRegistry: createEditionRegistry('premium'),
      onOpenStartCenter: vi.fn(),
      onOpenSearch: vi.fn(),
    }));

    const dialog = html.match(/<div[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="([^"]+)"/);
    expect(dialog).not.toBeNull();
    expect(dialog?.[1]).toBeTruthy();
    expect(html).toContain(`<h2 id="${dialog?.[1]}"`);
    expect(html).toContain('23 modules');
    expect(html).toContain('placeholder="Search apps by name, extension (.vdoc), or description…"');
    expect(html).toContain('data-vgt-initial-focus="true"');
    expect(html).toContain('aria-label="Astraea Writer · .vdoc"');
    // Admin & Policy trägt sein ehrliches Beta-Gate-Label im zugänglichen Namen — der Launcher darf das
    // gesperrte Sicherheits-Gate nicht wie eine normale, verfügbare Anwendung anbieten.
    expect(html).toContain('aria-label="Astraea Admin &amp; Policy · .vpolicy · IN PROGRESS · security gate locked"');
  });

  it('labels Premium-only launchers and keeps their controls inert in Open Core', () => {
    const html = renderToStaticMarkup(createElement(AppLauncherDrawer, {
      isOpen: true,
      onClose: vi.fn(),
      onSelectApp: vi.fn(),
      editionRegistry: createEditionRegistry('open-core'),
    }));

    expect(html.match(/<button[^>]*data-availability="premium-required"/gu)).toHaveLength(6);
    expect(html).toContain('Only available in Premium');
    expect(html).toContain('aria-label="Astraea Projects · Only available in Premium"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('lucide-lock-keyhole');
    expect(html).toContain('data-availability="premium-required"');
  });
});
