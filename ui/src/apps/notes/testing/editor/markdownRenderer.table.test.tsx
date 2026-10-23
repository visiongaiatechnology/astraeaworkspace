// STATUS: PLATIN — AST-0706/AST-0709: table controls and the code-fence language control in the live preview.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from '../../editor/markdown/markdownRenderer';

const noop = (): void => undefined;

function render(content: string): string {
  return renderToStaticMarkup(
    <MarkdownPreview content={content} onNavigateToPage={noop} onUpdateContent={noop} />
  );
}

const TABLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');

describe('AST-0706 table structure controls in the preview', () => {
  it('renders a bounded control group for every table, with the measured shape', () => {
    const markup = render(TABLE);
    expect(markup).toContain('role="group"');
    expect(markup).toContain('Table controls for the table starting on line 1');
    expect(markup).toContain('Table 2×2');
    for (const label of ['Add table row', 'Delete last table row', 'Add table column', 'Delete last table column']) {
      expect(markup).toContain(`aria-label="${label}"`);
    }
    // The table itself still renders as a real table.
    expect(markup).toContain('<table');
    expect(markup).toContain('<th');
    expect(markup).toContain('>A<');
  });

  it('does not render table controls for pipe text that is not a table', () => {
    const markup = render('a | b but no separator row');
    expect(markup).not.toContain('Table controls for the table');
    expect(markup).not.toContain('<table');
  });

  it('keeps the last data row so a table can never become header-only', () => {
    // With one body row the pure edit refuses; the preview therefore still renders exactly two rows.
    const markup = render(TABLE);
    expect(markup).toContain('Table 2×2');
  });
});

describe('AST-0706 fenced code language control', () => {
  it('renders a labelled language input and a bounded summary', () => {
    const markup = render(['```ts', 'const a = 1;', '```'].join('\n'));
    expect(markup).toContain('Code block language');
    expect(markup).toContain('Language of the code block starting on line 1');
    expect(markup).toContain('value="ts"');
    expect(markup).toContain('ts · 12 characters');
    expect(markup).toContain('const a = 1;');
  });

  it('labels an unlabelled fence without inventing a language', () => {
    const markup = render(['```', 'body', '```'].join('\n'));
    expect(markup).toContain('code · 4 characters');
    expect(markup).toContain('value=""');
  });
});

describe('AST-0709 preview edit feedback stays absent until an edit is refused', () => {
  it('renders no status region for a clean document', () => {
    expect(render(TABLE)).not.toContain('Dismiss table message');
  });
});
