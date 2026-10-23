// STATUS: PLATIN — scoped module-toolbar theme and content-boundary contract.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const commonDirectory = new URL('./', import.meta.url);
const toolbarCss = readFileSync(new URL('../../design-system/styles/AppToolbarBand.css', commonDirectory), 'utf8');
const parsedToolbarCss = postcss.parse(toolbarCss);
const toolbarRules = [];
parsedToolbarCss.walkRules((rule) => toolbarRules.push(rule));

function findToolbarRule(predicate) {
  return toolbarRules.find(predicate);
}

function ruleDeclarations(rule) {
  const values = new Map();
  rule?.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
  return values;
}

describe('module toolbar theme surfaces', () => {
  it('binds toolbar bands and neutral controls to active Workspace surface tokens', () => {
    expect(() => postcss.parse(toolbarCss)).not.toThrow();
    const bandRule = findToolbarRule((rule) => rule.selector === '.vgt-app-toolbar-band[data-vgt-app-toolbar-band]');
    expect(ruleDeclarations(bandRule).get('background-color')).toContain('--vgt-module-panel-surface');
    expect(ruleDeclarations(bandRule).get('border-color')).toContain('--vgt-control-border');
    expect(ruleDeclarations(bandRule).get('color')).toContain('--vgt-control-text');

    const neutralControlRule = findToolbarRule((rule) =>
      rule.selector.includes('.vgt-app-toolbar-band[data-vgt-app-toolbar-band]')
      && rule.selector.includes('[class~="bg-slate-900"]'),
    );
    expect(ruleDeclarations(neutralControlRule).get('background-color')).toContain('--vgt-module-control-surface');

    const primaryActionRule = findToolbarRule((rule) =>
      rule.selector.includes('.vgt-app-toolbar-band[data-vgt-app-toolbar-band]')
      && rule.selector.includes('[class~="bg-blue-600"]'),
    );
    expect(ruleDeclarations(primaryActionRule).get('background-color')).toContain('--vgt-control-primary-bg');
    expect(ruleDeclarations(primaryActionRule).get('color')).toContain('--vgt-on-accent');
  });

  it('marks only Grid, Present, and Notes toolbar bands, preserving workspace canvases', () => {
    const sources = new Map([
      ['Grid', readFileSync(new URL('../../apps/grid/toolbar/GridFormulaBar.tsx', commonDirectory), 'utf8')],
      ['Present', readFileSync(new URL('../../apps/present/editor/toolbar/PresentTopToolbar.tsx', commonDirectory), 'utf8')],
      ['Notes', readFileSync(new URL('../../apps/notes/editor/toolbar/NotesEditorToolbar.tsx', commonDirectory), 'utf8')],
    ]);
    expect(sources.get('Grid')).toContain('data-vgt-app-toolbar-band="grid"');
    expect(sources.get('Present')).toContain('data-vgt-app-toolbar-band="present"');
    expect(sources.get('Notes')).toContain('data-vgt-app-toolbar-band="notes-metadata"');
    expect(sources.get('Notes')).toContain('data-vgt-app-toolbar-band="notes-formatting"');
    const notesEditor = readFileSync(new URL('../../apps/notes/editor/NotesEditor.tsx', commonDirectory), 'utf8');
    const notesEditorBody = readFileSync(new URL('../../apps/notes/editor/NotesEditorBody.tsx', commonDirectory), 'utf8');
    expect(notesEditorBody).toContain('data-vgt-app-toolbar-band="notes-editor"');
    expect(notesEditor).toContain("import '../../../design-system/styles/AppToolbarBand.css';");

    for (const sourcePath of [
      '../../apps/grid/canvas/GridSheetViewport.tsx',
      '../../apps/present/canvas/PresentStageCanvas.tsx',
      '../../apps/notes/canvas/NotesFreeCanvas.tsx',
    ]) {
      const source = readFileSync(new URL(sourcePath, commonDirectory), 'utf8');
      expect(source, sourcePath).not.toContain('data-vgt-app-toolbar-band');
    }
  });
});
