// STATUS: DIAMANT VGT SUPREME — Header and Footer Update Handlers for Writer Sections
import type { PageSetupConfig } from '../../types';
import type { WriterSectionDefinition } from '../../../../shared/contracts/workspace';

export function resolveHeaderPatch(
  target: 'default' | 'first' | 'even' | undefined,
  text: string
): Partial<PageSetupConfig> {
  if (target === 'first') return { firstPageHeaderText: text };
  if (target === 'even') return { evenPageHeaderText: text };
  return { headerText: text };
}

export function resolveFooterPatch(
  target: 'default' | 'first' | 'even' | undefined,
  text: string
): Partial<PageSetupConfig> {
  if (target === 'first') return { firstPageFooterText: text };
  if (target === 'even') return { evenPageFooterText: text };
  return { footerText: text };
}

export function updateSectionHeader(
  sectionId: string,
  text: string,
  target: 'default' | 'first' | 'even' | undefined,
  defaultSetup: PageSetupConfig,
  sections: readonly WriterSectionDefinition[],
  updateSetup: (sectionId: string, next: PageSetupConfig) => void
): void {
  const setup = sectionId === 'document-default'
    ? defaultSetup
    : sections.find((s) => s.id === sectionId)?.pageSetup;
  if (!setup) return;
  updateSetup(sectionId, {
    ...setup,
    ...resolveHeaderPatch(target, text),
    ...(sectionId === 'document-default' ? {} : { linkToPreviousHeader: false }),
  });
}

export function updateSectionFooter(
  sectionId: string,
  text: string,
  target: 'default' | 'first' | 'even' | undefined,
  defaultSetup: PageSetupConfig,
  sections: readonly WriterSectionDefinition[],
  updateSetup: (sectionId: string, next: PageSetupConfig) => void
): void {
  const setup = sectionId === 'document-default'
    ? defaultSetup
    : sections.find((s) => s.id === sectionId)?.pageSetup;
  if (!setup) return;
  updateSetup(sectionId, {
    ...setup,
    ...resolveFooterPatch(target, text),
    ...(sectionId === 'document-default' ? {} : { linkToPreviousFooter: false }),
  });
}

export function toggleSectionLinkToPrevious(
  sectionId: string,
  type: 'header' | 'footer',
  defaultSetup: PageSetupConfig,
  sections: readonly WriterSectionDefinition[],
  updateSetup: (sectionId: string, next: PageSetupConfig) => void
): void {
  const setup = sectionId === 'document-default'
    ? defaultSetup
    : sections.find((s) => s.id === sectionId)?.pageSetup;
  if (!setup) return;
  const patch = type === 'header'
    ? { linkToPreviousHeader: !setup.linkToPreviousHeader }
    : { linkToPreviousFooter: !setup.linkToPreviousFooter };
  updateSetup(sectionId, { ...setup, ...patch });
}
