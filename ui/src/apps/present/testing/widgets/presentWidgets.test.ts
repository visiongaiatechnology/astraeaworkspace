// STATUS: DIAMANT VGT SUPREME — Present Section 8 widget regression tests
import { describe, expect, it, vi } from 'vitest';
import type { PresentWidgetSceneObject } from '../../../../shared/contracts/workspace';
vi.mock('../../../../platform/import-sandbox/importExportSandbox', () => ({
  preflightIsolatedImageDecode: async () => ({
    contract: 'VGT-IMPORT-SANDBOX-3', format: 'png', file_name_hint: 'ok.png', size_bytes: 24,
    entry_count: 0, expanded_bytes: 24, max_observed_ratio_milli: 1000, active_content: 'none',
    integrity_verified: true, parser_boundary: 'isolated-image-decode-test', image_width: 1, image_height: 1,
    untrusted_resources: { embedded_fonts: 0, icc_profiles: 0, external_references: 0 },
    fidelity: {
      source_format: 'png', supported_features: [], unsupported_features: [], preserved_foreign_parts: [],
      dropped_active_parts: [], warnings: [], destructive_roundtrip_requires_confirmation: false,
    },
  }),
}));
import {
  PRESENT_WIDGET_DEFINITIONS,
  createPresentWidgetDefaults,
  normalizePresentWidget,
  validatePresentWidgetGalleryFile,
} from '../../canvas/widgets/presentWidgets';
import { renderPresentWidgetSvg } from '../../interchange/rendering/presentWidgetSvg';

describe('Present widget engine', () => {
  it('covers every Section 8 widget family with unique deterministic defaults', () => {
    expect(PRESENT_WIDGET_DEFINITIONS).toHaveLength(14);
    expect(new Set(PRESENT_WIDGET_DEFINITIONS.map((item) => item.key)).size).toBe(14);
    for (const definition of PRESENT_WIDGET_DEFINITIONS) {
      const defaults = createPresentWidgetDefaults(definition.key);
      expect(defaults.widgetType).toBe(definition.key);
      expect(defaults.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('normalizes hostile imported widget values into bounded document state', () => {
    const raw: PresentWidgetSceneObject = {
      id: 'w', kind: 'widget', widgetType: 'rating', label: 'A\u0000B', value: 'value', accentColor: '#22d3ee',
      progress: 900, ratingValue: 99, ratingMax: 99, calendarYear: 100000, calendarMonth: 44,
      highlightedDays: [0, 1, 1, 5, 32], xPercent: 0, yPercent: 0, widthPercent: 20, heightPercent: 20,
    };
    const normalized = normalizePresentWidget(raw);
    expect(normalized.label).toBe('A B');
    expect(normalized.progress).toBe(100);
    expect(normalized.ratingValue).toBe(10);
    expect(normalized.ratingMax).toBe(10);
    expect(normalized.calendarYear).toBe(9999);
    expect(normalized.calendarMonth).toBe(11);
    expect(normalized.highlightedDays).toEqual([1, 5]);
  });

  it('renders every widget family through the static export path without active content', () => {
    for (const definition of PRESENT_WIDGET_DEFINITIONS) {
      const widget: PresentWidgetSceneObject = {
        id: `w-${definition.key}`, kind: 'widget', xPercent: 0, yPercent: 0, widthPercent: 40, heightPercent: 24,
        ...createPresentWidgetDefaults(definition.key),
      };
      const svg = renderPresentWidgetSvg(widget, { x: 10, y: 10, w: 420, h: 180 });
      expect(svg).toMatch(/<(?:rect|circle|path)/);
      expect(svg.toLowerCase()).not.toContain('<script');
      expect(svg.toLowerCase()).not.toContain('<foreignobject');
    }
  });

  it('cross-checks gallery MIME declarations against independent magic bytes', async () => {
    const pngBytes = new Uint8Array(24);
    pngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    pngBytes.set([0x49, 0x48, 0x44, 0x52], 12);
    pngBytes.set([0, 0, 0, 1, 0, 0, 0, 1], 16);
    const png = new File([pngBytes], 'ok.png', { type: 'image/png' });
    await expect(validatePresentWidgetGalleryFile(png)).resolves.toBeUndefined();
    const mismatch = new File([pngBytes], 'bad.jpg', { type: 'image/jpeg' });
    await expect(validatePresentWidgetGalleryFile(mismatch)).rejects.toMatchObject({
      name: 'MediaBoundaryError', code: 'mime-mismatch',
    });
  });
});
