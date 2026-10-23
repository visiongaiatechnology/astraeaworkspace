// STATUS: PLATIN — rendered seven-locale coverage for Present's primary toolbar.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { resolvePresentSlideDesign } from '../../design/presentDesign';
import { DEFAULT_PRESENT_SLIDES, DIAGRAM_DEFINITIONS, SHAPE_DEFINITIONS, SLIDE_SIZES, TRANSITION_EFFECTS, WIDGET_DEFINITIONS } from '../../contracts/types';
import { PresentTopToolbar } from '../../editor/toolbar/PresentTopToolbar';
import { PRESENT_TOOLBAR_COPY } from '../presentToolbarLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const slide = DEFAULT_PRESENT_SLIDES[0];
const presentData = { slides: DEFAULT_PRESENT_SLIDES, aspectRatio: '16:9', themeId: 'midnight' };
const props = {
  slide,
  design: resolvePresentSlideDesign(slide, presentData),
  presentData,
  onUpdateSlide: noop,
  onUpdatePresentData: noop,
  onInsertImageFile: noop,
  onAddText: noop,
  onAddShape: noop,
  onAddWidget: noop,
  onAddDiagram: noop,
  onAddCode: noop,
  onAddChart: noop,
  onAddTable: noop,
  showLayers: false,
  onToggleLayers: noop,
  showAnimations: false,
  onToggleAnimations: noop,
  showNotes: false,
  onToggleNotes: noop,
  showInspector: false,
  onToggleInspector: noop,
  onOpenThemeManager: noop,
  onOpenSections: noop,
  onOpenRehearsal: noop,
  onOpenComments: noop,
  onOpenMediaEmbed: noop,
  onOpenVideoExport: noop,
  onOpenSpeakerCoach: noop,
  onOpenWorkspaceIntegration: noop,
  onUndo: noop,
  onRedo: noop,
  canUndo: true,
  canRedo: true,
  onPreviewTransition: noop,
  onApplyTransitionToAll: noop,
} satisfies ComponentProps<typeof PresentTopToolbar>;

describe('Present toolbar localization', () => {
  it('keeps all seven catalogs aligned with the option definitions and interpolates comment counts', () => {
    const base = PRESENT_TOOLBAR_COPY['en-US'];
    const expectedTextKeys = Object.keys(base.text).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PRESENT_TOOLBAR_COPY[locale];
      expect(Object.keys(copy.text).sort(), `${locale}.text`).toEqual(expectedTextKeys);
      expect(Object.keys(copy.slideSizes).sort(), `${locale}.slideSizes`).toEqual(SLIDE_SIZES.map(({ key }) => key).sort());
      expect(Object.keys(copy.transitions).sort(), `${locale}.transitions`).toEqual(TRANSITION_EFFECTS.map(({ key }) => key).sort());
      expect(Object.keys(copy.shapes).sort(), `${locale}.shapes`).toEqual(SHAPE_DEFINITIONS.map(({ key }) => key).sort());
      expect(Object.keys(copy.widgets).sort(), `${locale}.widgets`).toEqual(WIDGET_DEFINITIONS.map(({ key }) => key).sort());
      expect(Object.keys(copy.diagrams).sort(), `${locale}.diagrams`).toEqual(DIAGRAM_DEFINITIONS.map(({ key }) => key).sort());
      expect(copy.openSlideComments(3), `${locale}.openSlideComments`).toContain('3');
    }
  });

  it('renders localized labels and accessible names for every supported locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_TOOLBAR_COPY[locale];
      const markup = renderToStaticMarkup(<PresentTopToolbar {...props} />);

      // Round 40: the closed toolbar carries the primary zone only; rare commands live in the
      // "More" popover (a portal, so they are not part of the server-rendered markup).
      expect(markup).toContain(`aria-label="${copy.text.historyControls}"`);
      expect(markup).toContain(`aria-label="${copy.text.undo}"`);
      expect(markup).toContain(copy.text.cards);
      expect(markup).toContain(`aria-label="${copy.text.insertImage}"`);
      expect(markup).toContain(copy.text.objectInspector);
      expect(markup).toContain(copy.text.speakerNotes);
      expect(markup).toContain('aria-label="More Present commands"');
      expect(markup).toContain('data-present-toolbar-scroll="none"');
      // No horizontal-scroll toolbar anymore, and the popover content is not painted into the band.
      expect(markup).not.toContain('overflow-x-auto');
      expect(markup).not.toContain(`aria-label="${copy.text.slideAspectRatio}"`);
      expect(markup).not.toContain(`aria-label="${copy.text.slideTransition}"`);
      expect(markup).not.toContain('Midnight Sovereign');
    }
  });
});
