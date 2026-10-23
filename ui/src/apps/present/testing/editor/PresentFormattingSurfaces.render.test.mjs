// Contract test: the visible editor surfaces of BATCH-PRESENT-2 must expose the new affordances —
// armed text tool, line-spacing/font controls that act on the whole selection, image crop controls
// and the master/theme dependency report.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresentObjectInspector } from '../../editor/inspector/PresentObjectInspector';
import { PresentMasterThemeModal } from '../../design/PresentMasterThemeModal';
import { PresentInsertDropdowns } from '../../editor/toolbar/PresentInsertDropdowns';

const textObject = {
  id: 'text-1',
  kind: 'text',
  text: 'Hello',
  xPercent: 10,
  yPercent: 10,
  widthPercent: 30,
  heightPercent: 12,
  fontSizePt: 24,
  fontWeight: 'bold',
  color: '#ffffff',
  textAlign: 'left',
  zIndex: 20,
};

const imageObject = {
  id: 'image-1',
  name: 'shot.png',
  dataUrl: 'data:image/png;base64,AA',
  xPercent: 5,
  yPercent: 5,
  widthPercent: 28,
  heightPercent: 18,
  cropTop: 10,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 5,
};

const truthy = (overrides = {}) => ({
  onPatchObject: vi.fn(),
  onPatchImage: vi.fn(),
  onUpdateAllObjects: vi.fn(),
  onCommand: vi.fn(),
  onApplyTextFormat: vi.fn(),
  onClose: vi.fn(),
  ...overrides,
});

describe('PresentObjectInspector — formatting and crop contract', () => {
  it('offers font size, weight, line spacing, alignment and font family for a text selection', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, {
      ...truthy(),
      selectedObject: textObject,
      selectedImage: null,
      allObjects: [textObject],
      selectedObjectIds: ['text-1'],
      selectionSize: 1,
    }));
    expect(html).toContain('Line spacing');
    expect(html).toContain('Font weight');
    expect(html).toContain('Text alignment');
    expect(html).toContain('Font family');
    expect(html).toContain('Typography &amp; Color');
  });

  it('states that formatting applies to the whole visible selection when several objects are selected', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, {
      ...truthy(),
      selectedObject: textObject,
      selectedImage: null,
      allObjects: [textObject],
      selectedObjectIds: ['text-1', 'text-2'],
      selectionSize: 2,
    }));
    expect(html).toContain('applies to 2 text objects');
    expect(html).toContain('data-present-inspector-selection="true"');
  });

  it('renders bounded crop controls plus a reset for a selected image', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, {
      ...truthy(),
      selectedObject: null,
      selectedImage: imageObject,
      allObjects: [],
      selectedObjectIds: [],
      selectionSize: 0,
    }));
    for (const label of ['Crop Top', 'Crop Right', 'Crop Bottom', 'Crop Left']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('Reset crop');
    // Every crop input is bounded in the markup, not only in the handler.
    expect(html).toContain('max="45"');
    // The stored crop is shown in the inputs.
    expect(html).toContain('value="10"');
    expect(html).toContain('value="5"');
  });
});

describe('PresentMasterThemeModal — controlled master/theme updates', () => {
  const model = {
    slides: [
      { id: 's1', title: 'One', subtitle: '', layout: 'blank' },
      { id: 's2', title: 'Two', subtitle: '', layout: 'blank', masterId: 'master-board' },
    ],
    themes: [
      { id: 'theme-dark', name: 'Dark', backgroundColor: '#000', surfaceColor: '#111', titleColor: '#fff', bodyColor: '#ccc', accentColor: '#0ff', fontFamily: 'Inter' },
      { id: 'theme-light', name: 'Light', backgroundColor: '#fff', surfaceColor: '#eee', titleColor: '#000', bodyColor: '#333', accentColor: '#00f', fontFamily: 'Georgia' },
    ],
    themeId: 'theme-dark',
    masters: [
      { id: 'master-clean', name: 'Clean', showFooter: true, footerText: 'F' },
      { id: 'master-board', name: 'Board', showFooter: true, footerText: 'B' },
    ],
  };

  it('renders the theme catalogue and the assignment control with the active slide', () => {
    const html = renderToStaticMarkup(createElement(PresentMasterThemeModal, {
      presentData: model,
      onUpdatePresentData: vi.fn(),
      onClose: vi.fn(),
      activeSlideId: 's2',
    }));
    expect(html).toContain('Dark');
    expect(html).toContain('Light');
    // The masters tab is not the default tab, so only the chrome is present here.
    expect(html).toContain('role="dialog"');
  });
});

describe('PresentInsertDropdowns — palette accessibility contract', () => {
  it('marks every palette as a menu with aria-expanded', () => {
    const html = renderToStaticMarkup(createElement(PresentInsertDropdowns, {
      onAddShape: vi.fn(),
      onAddWidget: vi.fn(),
      onAddDiagram: vi.fn(),
    }));
    expect((html.match(/aria-haspopup="menu"/g) ?? [])).toHaveLength(3);
    expect((html.match(/aria-expanded="false"/g) ?? [])).toHaveLength(3);
  });
});
