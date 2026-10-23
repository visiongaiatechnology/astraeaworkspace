import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../../toolbar/WhiteboardToolbar.css', import.meta.url), 'utf8');

describe('Whiteboard toolbar stacked-region styles', () => {
  it('lays the toolbar region out in normal flow, so the canvas and rulers begin below it', () => {
    expect(styles, 'in-flow region').toContain('.whiteboard-toolbar-region {');
    expect(styles).toMatch(/\.whiteboard-toolbar-region\s*\{[^}]*flex-direction:\s*column;/s);
    expect(styles).toMatch(/\.whiteboard-toolbar-region\s*\{[^}]*z-index:\s*20;/s);
    expect(styles, 'no absolute overlay layer').not.toContain('whiteboard-toolbar__layer');
    expect(styles, 'no absolute surface').not.toMatch(/\.whiteboard-toolbar__surface\s*\{[^}]*position:\s*absolute;/s);
  });

  it('wraps and scrolls on narrow windows instead of clipping', () => {
    expect(styles).toMatch(/\.whiteboard-toolbar__bar\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(styles).toMatch(/\.whiteboard-toolbar__more\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(styles).toMatch(/\.whiteboard-toolbar__context\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(styles).toMatch(/\.whiteboard-toolbar__context\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(styles, 'compact host hides labels but keeps controls').toContain('@container whiteboard-toolbar');
    expect(styles, 'compact mode keeps accessible names').toContain('.whiteboard-toolbar__label');
  });

  it('collapses the More row with the aria-expanded state', () => {
    expect(styles).toContain('.whiteboard-toolbar__more[data-open="false"]');
    expect(styles).toMatch(/\.whiteboard-toolbar__more\[data-open="false"\]\s*\{\s*display:\s*none;/);
    expect(styles).toContain('.whiteboard-toolbar__chevron');
    expect(styles).toContain('rotate(180deg)');
    expect(styles).toContain('var(--vgt-focus');
    expect(styles).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps the Astraea glass vocabulary and avoids decorative grids', () => {
    expect(styles).toContain('--vgt-surface-z2');
    expect(styles).toContain('backdrop-filter: blur');
    expect(styles).not.toContain('repeating-linear-gradient');
  });
});
