// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimatedAccordion } from '../components/AnimatedAccordion';

describe('AnimatedAccordion', () => {
  it('starts collapsed with a semantic heading, controlled region, and inert content', () => {
    const markup = renderToStaticMarkup(
      <AnimatedAccordion title="Cross-tab analysis" headingLevel={4}>
        <button type="button">Nested action</button>
      </AnimatedAccordion>,
    );

    expect(markup).toContain('<h4');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="vgt-accordion-');
    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain('Nested action');
  });

  it('keeps an initially open panel exposed and expanded', () => {
    const markup = renderToStaticMarkup(
      <AnimatedAccordion title="Charts & statistics" defaultOpen>
        <p>Summary content</p>
      </AnimatedAccordion>,
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-hidden="false"');
    expect(markup).not.toContain('inert=""');
  });
});
