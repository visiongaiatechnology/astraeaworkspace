// STATUS: PLATIN — Writer first/default/even header and footer contract
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterPageSetupConfig } from '../../../../../../shared/contracts/workspace';
import {
  resolveLinkedWriterHeaderFooterSetup,
  resolveWriterHeaderFooter,
  validateWriterHeaderFooter,
} from '../../../../../../shared/writer/layout/headerFooter';
import { updateSectionFooter, updateSectionHeader } from '../../../../layout/header-footer/writerHeaderFooterHelpers';
import { paginateWriterSections } from '../../../../layout/pagination/writerPagination';

const SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: 'ODD HEADER',
  footerText: 'ODD FOOTER',
  firstPageDifferent: true,
  firstPageHeaderText: 'FIRST HEADER',
  firstPageFooterText: 'FIRST FOOTER',
  oddEvenDifferent: true,
  evenPageHeaderText: 'EVEN HEADER',
  evenPageFooterText: 'EVEN FOOTER',
};

describe('Writer header/footer resolver', () => {
  it('gives a section first page precedence over physical even-page parity', () => {
    expect(resolveWriterHeaderFooter(SETUP, 2, 1)).toMatchObject({
      variant: 'first',
      headerText: 'FIRST HEADER',
      footerText: 'FIRST FOOTER',
    });
  });

  it('resolves later even and odd physical pages independently', () => {
    expect(resolveWriterHeaderFooter(SETUP, 2, 2).variant).toBe('even');
    expect(resolveWriterHeaderFooter(SETUP, 3, 3)).toMatchObject({
      variant: 'default',
      headerText: 'ODD HEADER',
      footerText: 'ODD FOOTER',
    });
  });

  it('preserves an intentionally empty first or even variant without default fallback', () => {
    expect(resolveWriterHeaderFooter({
      ...SETUP,
      firstPageHeaderText: undefined,
      evenPageFooterText: undefined,
    }, 1, 1).headerText).toBe('');
    expect(resolveWriterHeaderFooter({
      ...SETUP,
      firstPageDifferent: false,
      evenPageFooterText: undefined,
    }, 2, 2).footerText).toBe('');
  });

  it('rejects oversized persisted header/footer payloads', () => {
    expect(validateWriterHeaderFooter({ ...SETUP, evenPageHeaderText: 'x'.repeat(4_097) }))
      .toMatch(/4\.096/u);
  });

  it('inherits header and footer families independently across section chains', () => {
    const resolved = resolveLinkedWriterHeaderFooterSetup({
      ...SETUP,
      headerText: 'STALE HEADER',
      footerText: 'SECTION FOOTER',
      firstPageFooterText: 'SECTION FIRST FOOTER',
      evenPageFooterText: 'SECTION EVEN FOOTER',
      linkToPreviousHeader: true,
      linkToPreviousFooter: false,
    }, SETUP);
    expect(resolved).toMatchObject({
      headerText: 'ODD HEADER',
      firstPageHeaderText: 'FIRST HEADER',
      evenPageHeaderText: 'EVEN HEADER',
      footerText: 'SECTION FOOTER',
      firstPageFooterText: 'SECTION FIRST FOOTER',
      evenPageFooterText: 'SECTION EVEN FOOTER',
    });
    expect(resolveLinkedWriterHeaderFooterSetup({
      ...SETUP,
      linkToPreviousHeader: true,
      linkToPreviousFooter: true,
    }, resolved)).toMatchObject({
      headerText: 'ODD HEADER',
      footerText: 'SECTION FOOTER',
    });
  });

  it('detaches only the edited family when an inline section header or footer changes', () => {
    const section = {
      id: 'section-2',
      startParagraphId: 'p-2',
      pageSetup: {
        ...SETUP,
        linkToPreviousHeader: true,
        linkToPreviousFooter: true,
      },
    };
    const updates: WriterPageSetupConfig[] = [];
    const capture = (_sectionId: string, next: WriterPageSetupConfig) => updates.push(next);

    updateSectionHeader(section.id, 'OWN HEADER', 'default', SETUP, [section], capture);
    updateSectionFooter(section.id, 'OWN FOOTER', 'default', SETUP, [section], capture);

    expect(updates[0]).toMatchObject({
      headerText: 'OWN HEADER',
      linkToPreviousHeader: false,
      linkToPreviousFooter: true,
    });
    expect(updates[1]).toMatchObject({
      footerText: 'OWN FOOTER',
      linkToPreviousHeader: true,
      linkToPreviousFooter: false,
    });
  });

  it('feeds resolved section links into the paginated WYSIWYG page model', () => {
    const paragraphs: Paragraph[] = [
      { id: 'p-1', style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 }, spans: [{ text: 'One' }] },
      { id: 'p-2', style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 }, spans: [{ text: 'Two' }] },
    ];
    const pages = paginateWriterSections(paragraphs, SETUP, [], [{
      id: 'section-2',
      startParagraphId: 'p-2',
      breakType: 'next-page',
      pageSetup: {
        ...SETUP,
        headerText: 'STALE HEADER',
        footerText: 'OWN FOOTER',
        linkToPreviousHeader: true,
        linkToPreviousFooter: false,
      },
    }]);

    expect(pages).toHaveLength(2);
    expect(pages[1]?.pageSetup).toMatchObject({
      headerText: 'ODD HEADER',
      footerText: 'OWN FOOTER',
    });
  });
});
