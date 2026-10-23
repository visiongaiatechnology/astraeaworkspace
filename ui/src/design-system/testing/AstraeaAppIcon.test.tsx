import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AstraeaAppIcon, getAstraeaAppIconSrc, hasAstraeaAppIcon } from '../brand/AstraeaAppIcon';

describe('Astraea Workspace logo asset contract', () => {
  it('uses the unchanged transparent official mark instead of an opaque square derivative', () => {
    expect(getAstraeaAppIconSrc('Workspace')).toBe('/branding/astraea-workspace-official.png');

    const html = renderToStaticMarkup(createElement(AstraeaAppIcon, {
      kind: 'Workspace',
      alt: 'Official Astraea Workspace logo',
    }));

    expect(html).toContain('src="/branding/astraea-workspace-official.png"');
    expect(html).toContain('class="select-none object-contain astraea-workspace-mark');
    expect(html).toContain('alt="Official Astraea Workspace logo"');
    expect(html).not.toContain('srcset=');
  });

  it('maps the four official transparent app marks into the canonical icon registry', () => {
    const assets = {
      Automate: '/branding/astraea-automate-official.png',
      Insight: '/branding/astraea-insight-official.png',
      Connect: '/branding/astraea-connect-official.png',
      Publish: '/branding/astraea-publisher-official.png',
    } as const;

    for (const [kind, src] of Object.entries(assets)) {
      expect(getAstraeaAppIconSrc(kind as keyof typeof assets)).toBe(src);
      expect(hasAstraeaAppIcon(kind as keyof typeof assets)).toBe(true);
      const html = renderToStaticMarkup(createElement(AstraeaAppIcon, { kind: kind as keyof typeof assets }));
      expect(html).toContain(`src="${src}"`);
      expect(html).toContain('object-contain');
    }
  });
});
