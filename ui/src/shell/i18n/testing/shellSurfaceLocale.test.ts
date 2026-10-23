import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocale';
import { SHELL_SURFACE_COPY, formatShellNumber, shellAccessibilityIssueCopy, shellPlatformUpdateDetail, shellSurfaceCopy } from '../shellSurfaceLocale';

describe('seven-locale shell surface catalog', () => {
  it('provides the same typed shell surface shape for every supported locale', () => {
    expect(Object.keys(SHELL_SURFACE_COPY).sort()).toEqual([...WORKSPACE_LOCALES].sort());

    for (const locale of WORKSPACE_LOCALES) {
      const copy = shellSurfaceCopy(locale);
      expect(copy.center.title.trim()).not.toBe('');
      expect(copy.categoryLabels.all.trim()).not.toBe('');
      expect(copy.modules.Writer.description.trim()).not.toBe('');
      expect(copy.templates.entries['writer-report'].name.trim()).not.toBe('');
      expect(copy.launcher.searchPlaceholder.trim()).not.toBe('');
      expect(copy.shortcuts.labels.save.trim()).not.toBe('');
      expect(copy.platform.channelNames.beta.trim()).not.toBe('');
      expect(copy.platform.channelNames.stable.trim()).not.toBe('');
      expect(copy.platform.issueSeverities.error.trim()).not.toBe('');
      expect(copy.platform.issueSeverities.warning.trim()).not.toBe('');
      expect(copy.platform.issueSeverities.info.trim()).not.toBe('');
      expect(formatShellNumber(locale, 1234)).not.toBe('');
    }
  });

  it('keeps the stable application identity and Premium boundary across locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = shellSurfaceCopy(locale);
      expect(copy.modules.Writer.shortName).not.toBe('');
      expect(copy.modules.Projects.shortName).not.toBe('');
      expect(copy.tools.premium).not.toBe('');
      expect(copy.templates.entries['project-plan'].name).not.toBe('');
      expect(copy.launcher.shellApps.explorer.name).not.toBe('');
    }
  });

  it('localizes every known platform accessibility issue and update detail', () => {
    const issueCodes = [
      'document.title', 'writer.model.missing', 'writer.image.alt', 'writer.media.transcript', 'writer.video.caption',
      'writer.heading.jump', 'present.model.missing', 'present.slide.title', 'present.image.alt',
      'present.media.alternative', 'pdf.model.missing', 'pdf.image.alt', 'pdf.form.name', 'pdf.tags.missing',
    ];

    for (const locale of WORKSPACE_LOCALES) {
      for (const code of issueCodes) expect(shellAccessibilityIssueCopy(locale, code).trim()).not.toBe('');
      expect(shellAccessibilityIssueCopy(locale, 'future.unknown.issue').trim()).not.toBe('');
      expect(shellAccessibilityIssueCopy(locale, 'present.slide.title', 3).trim()).not.toBe('');
      for (const status of ['manual_offline', 'current', 'available', 'failed'] as const) {
        expect(shellPlatformUpdateDetail(locale, status).trim()).not.toBe('');
      }
    }
  });
});
