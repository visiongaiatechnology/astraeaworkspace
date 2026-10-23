// STATUS: PLATIN — focused token contracts preserve workbook and Markdown content colors.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const gridDirectory = new URL('./', import.meta.url);
const gridCss = readFileSync(new URL('../../apps/grid/theme/GridThemeChrome.css', gridDirectory), 'utf8');
const gridSheet = readFileSync(new URL('../../apps/grid/GridSheet.tsx', gridDirectory), 'utf8');
const gridCanvas = readFileSync(new URL('../../apps/grid/canvas/GridTableCanvas.tsx', gridDirectory), 'utf8');
const gridBottomBar = readFileSync(new URL('../../apps/grid/toolbar/GridBottomBar.tsx', gridDirectory), 'utf8');
const notesCss = readFileSync(new URL('../../apps/notes/theme/NotesThemeChrome.css', import.meta.url), 'utf8');
const notesEditor = readFileSync(new URL('../../apps/notes/editor/NotesEditor.tsx', import.meta.url), 'utf8');
const notesEditorBody = readFileSync(new URL('../../apps/notes/editor/NotesEditorBody.tsx', import.meta.url), 'utf8');
const shellAppearance = readFileSync(new URL('../../shell/lifecycle/workspaceShellAppearanceLifecycle.ts', gridDirectory), 'utf8');
const markdownRenderer = readFileSync(new URL('../../apps/notes/editor/markdown/markdownRenderer.tsx', import.meta.url), 'utf8');

function parsedRules(css) {
  const rules = [];
  postcss.parse(css).walkRules((rule) => rules.push(rule));
  return rules;
}

function declarations(rule) {
  const values = new Map();
  rule?.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
  return values;
}

describe('Grid and Notes theme chrome contracts', () => {
  it('themes Grid active cell, range, sheet tab, and sheet controls through the Workspace accent', () => {
    const rules = parsedRules(gridCss);
    const ruleFor = (fragment) => rules.find((rule) => rule.selector.includes(fragment));

    expect(declarations(ruleFor('[data-vgt-grid-selection="active-cell"]')).get('background-color')).toContain('--vgt-accent-soft');
    expect(declarations(ruleFor('[data-vgt-grid-selection="active-cell"]')).get('box-shadow')).toContain('--vgt-accent-strong');
    expect(declarations(ruleFor('[data-vgt-grid-selection="range"]')).get('background-color')).toContain('--vgt-accent-soft');
    expect(declarations(ruleFor('[data-vgt-grid-active-tab="true"]')).get('border-bottom-color')).toContain('--vgt-accent-strong');
    expect(declarations(ruleFor('[data-vgt-grid-active-control="true"]')).get('background-color')).toContain('--vgt-accent-soft');
    expect(rules.every((rule) => rule.selector.startsWith('[data-vgt-grid-root="true"]'))).toBe(true);
    expect(gridSheet).toContain("import './theme/GridThemeChrome.css';");
    expect(gridCanvas).toContain('data-vgt-grid-canvas="true"');
    expect(gridCanvas).toContain('data-vgt-grid-view-mode={sheet.viewMode}');
    expect(gridCanvas).toContain('data-vgt-grid-page-plane={sheet.viewMode === \'page-layout\' ? \'true\' : undefined}');
    expect(rules.some((rule) => rule.selector.includes('[data-vgt-grid-canvas="true"]'))).toBe(true);
    expect(gridCanvas).toContain('data-vgt-grid-selection={isSelected ? \'active-cell\' : isInSelection ? \'range\' : undefined}');
    expect(gridBottomBar).toContain('data-vgt-grid-active-tab={isActive ? \'true\' : undefined}');
    expect(gridBottomBar).toContain('data-vgt-grid-active-control={isFrozen ? \'true\' : undefined}');
  });

  it('preserves authored cell and worksheet-tab colors over theme selection chrome', () => {
    expect(gridCanvas).toContain('backgroundColor: conditionalStyle.background ?? cell?.background ?? tableVisual.background');
    // Verhalten statt Zeichenkette: Der Ausdruck lebt in einer Variablen und wird als `color:` gesetzt.
    expect(gridCanvas).toContain('const borderColour = conditionalStyle.textColor');
    expect(gridCanvas).toMatch(/color:\s*borderColour/u);
    expect(gridCanvas).not.toContain("'text-slate-300 hover:bg-white/[0.03]'");
    expect(gridBottomBar).toContain('borderBottomColor: s.tabColor || undefined');
    expect(gridCanvas).not.toContain('bg-blue-600/20 ring-2 ring-blue-500');
    expect(gridBottomBar).not.toContain('bg-blue-600/20');
    expect(gridBottomBar).not.toContain('bg-emerald-600/20');
    expect(gridBottomBar).not.toContain("isActive ? '#10b981'");
  });

  it('themes only the Notes editor pane surface and leaves authored Markdown styling inline', () => {
    const rules = parsedRules(notesCss);
    const editorSurface = rules.find((rule) => rule.selector === '[data-vgt-notes-root="true"] [data-vgt-notes-chrome="editor-surface"]');
    const sidebar = rules.find((rule) => rule.selector === '[data-vgt-notes-root="true"] [data-vgt-notes-chrome="sidebar"]');
    expect(editorSurface).toBeDefined();
    expect(declarations(editorSurface).get('background-color')).toContain('--vgt-module-panel-surface');
    expect(declarations(editorSurface).has('color')).toBe(false);
    expect(sidebar).toBeDefined();
    expect(declarations(sidebar).get('background-color')).toContain('--vgt-surface-z1');
    expect(rules.filter((rule) => rule.selector.includes('[data-vgt-notes-chrome="sidebar"]')).every((rule) => rule.selector.includes('[data-vgt-notes-root="true"]'))).toBe(true);
    expect(notesEditor).toContain("import '../theme/NotesThemeChrome.css';");
    expect(notesEditorBody).toContain('data-vgt-notes-chrome="editor-surface"');
    expect(readFileSync(new URL('../../apps/notes/navigation/NotesSidebar.tsx', import.meta.url), 'utf8')).toContain('data-vgt-notes-chrome="sidebar"');
    expect(readFileSync(new URL('../../apps/notes/navigation/NotesPagesList.tsx', import.meta.url), 'utf8')).toContain('data-vgt-notes-chrome="page-list"');
    expect(notesCss).toContain(':root[data-astraea-scale-band="maximum"] [data-vgt-notes-root="true"] [data-vgt-notes-chrome="page-list"]');
    expect(notesCss).toContain('width: min(22vw, 18rem)');
    expect(notesCss).toContain('flex-basis: 0');
    expect(notesCss).toContain('@media (max-width: 800px)');
    expect(notesCss).toContain('flex-direction: column');
    expect(notesCss).toContain('[data-astraea-scale-percent="300"]');
    expect(notesCss).toContain('max-height: min(30vh, 9rem)');
    expect(shellAppearance).toContain('root.dataset.astraeaScalePercent = String(projection.scalePercent);');
    expect(markdownRenderer).toContain('style={{ color: color[1] }}');
  });
});
