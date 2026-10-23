// STATUS: PLATIN — theme-aware Markdown reading surface with authored colors preserved.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const notesDirectory = new URL('./', import.meta.url);
const css = readFileSync(new URL('../../editor/markdown/NotesMarkdownPreview.css', notesDirectory), 'utf8');
const renderer = readFileSync(new URL('../../editor/markdown/markdownRenderer.tsx', notesDirectory), 'utf8');
const editor = readFileSync(new URL('../../editor/NotesEditor.tsx', notesDirectory), 'utf8');
const body = readFileSync(new URL('../../editor/NotesEditorBody.tsx', notesDirectory), 'utf8');
const rules = [];
postcss.parse(css).walkRules((rule) => rules.push(rule));

function findRule(predicate) {
  return rules.find(predicate);
}

function declarations(rule) {
  const values = new Map();
  rule?.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
  return values;
}

describe('Notes Markdown preview theme contract', () => {
  it('uses the selected Workspace reading surface and readable text tokens', () => {
    expect(() => postcss.parse(css)).not.toThrow();
    const surfaceRule = findRule((rule) => rule.selector === '[data-notes-live-wysiwyg-preview="true"]');
    expect(declarations(surfaceRule).get('background-color')).toContain('--vgt-module-panel-surface');
    expect(declarations(surfaceRule).get('color')).toContain('--vgt-control-text');

    const textRule = findRule((rule) => rule.selector.includes('[data-notes-live-wysiwyg-preview="true"]') && rule.selector.includes('p, li, td'));
    expect(textRule?.selector).toContain(':not([style*="color"])');
    expect(declarations(textRule).get('color')).toContain('--vgt-control-muted');
  });

  it('scopes presentation to the rendered preview and preserves authored inline Markdown colors', () => {
    expect(editor).toContain("import './markdown/NotesMarkdownPreview.css';");
    expect(body).toContain('data-notes-live-wysiwyg-preview="true"');
    const previewStart = body.indexOf('data-notes-live-wysiwyg-preview="true"');
    expect(body.slice(previewStart, previewStart + 600)).not.toContain('data-vgt-app-toolbar-band');
    expect(renderer).toContain('style={{ color: color[1] }}');
    expect(css).not.toMatch(/(?:^|,)\s*:root\b/m);
    expect(css).not.toContain('data-vgt-grid-root');
    expect(css).not.toContain('data-vgt-present-root');
  });
});
