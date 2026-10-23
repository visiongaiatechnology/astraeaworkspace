// STATUS: PLATIN — Real DOCX first/default/even header and footer package roundtrip
import { describe, expect, it } from 'vitest';
import type { Paragraph, TextBlockObject, WorkspaceDocument, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../platform/interop/zip';

const paragraph: Paragraph = {
  id: 'body-1',
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
  spans: [{ text: 'Header and footer interoperability' }],
};

const setup: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: 'ODD HEADER',
  footerText: 'ODD FOOTER',
  firstPageDifferent: true,
  firstPageHeaderText: 'FIRST HEADER',
  firstPageFooterText: 'FIRST FOOTER',
  oddEvenDifferent: true,
  evenPageHeaderText: 'EVEN HEADER',
  evenPageFooterText: 'EVEN FOOTER',
};

function documentWithSetup(): WorkspaceDocument {
  const textBlock: TextBlockObject = { id: 'text-root', paragraphs: [paragraph] };
  return {
    schema_version: 1,
    id: 'header-footer-docx',
    title: 'Header Footer DOCX',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlock.id],
    objects: { [textBlock.id]: { type: 'TextBlock', data: textBlock } },
    writerData: { pageSetup: setup, tables: [], sections: [] },
  };
}

describe('DOCX Writer header/footer variants', () => {
  it('writes standard OOXML references and restores all six independent texts', async () => {
    const bytes = exportDocx(documentWithSetup());
    const entries = await readZip(bytes);
    const documentXml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const settingsXml = decodeUtf8(entries.get('word/settings.xml') ?? new Uint8Array());
    const relationshipsXml = decodeUtf8(entries.get('word/_rels/document.xml.rels') ?? new Uint8Array());
    const partTexts = [...entries.entries()]
      .filter(([name]) => /^word\/(?:header|footer)\d+\.xml$/u.test(name))
      .map(([, value]) => decodeUtf8(value))
      .join('\n');
    const restored = await importDocx(bytes, 'header-footer.docx');

    expect(documentXml).toContain('<w:titlePg/>');
    expect(documentXml).toContain('w:type="default"');
    expect(documentXml).toContain('w:type="first"');
    expect(documentXml).toContain('w:type="even"');
    expect(settingsXml).toContain('<w:evenAndOddHeaders/>');
    expect(relationshipsXml.match(/relationships\/header"/gu)).toHaveLength(3);
    expect(relationshipsXml.match(/relationships\/footer"/gu)).toHaveLength(3);
    for (const text of ['ODD HEADER', 'ODD FOOTER', 'FIRST HEADER', 'FIRST FOOTER', 'EVEN HEADER', 'EVEN FOOTER']) {
      expect(partTexts).toContain(text);
    }
    expect(restored.writerData?.pageSetup).toMatchObject(setup);
  });

  it('round-trips independent section linking and emits an empty part to break inheritance', async () => {
    const secondParagraph: Paragraph = {
      ...paragraph,
      id: 'body-2',
      spans: [{ text: 'Independent section' }],
    };
    const sectionSetup: WriterPageSetupConfig = {
      ...setup,
      firstPageDifferent: false,
      oddEvenDifferent: false,
      headerText: 'IGNORED LINKED HEADER',
      footerText: '',
      linkToPreviousHeader: true,
      linkToPreviousFooter: false,
    };
    const source = documentWithSetup();
    const textBlock = source.objects['text-root'];
    if (textBlock?.type !== 'TextBlock') throw new Error('Writer fixture text block missing');
    const writerData = source.writerData;
    if (!writerData) throw new Error('Writer fixture model missing');
    textBlock.data.paragraphs.push(secondParagraph);
    source.writerData = {
      ...writerData,
      sections: [{
        id: 'section-2',
        startParagraphId: secondParagraph.id,
        pageSetup: sectionSetup,
        breakType: 'next-page',
      }],
    };

    const bytes = exportDocx(source);
    const entries = await readZip(bytes);
    const documentXml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const sectionXml = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/gu) ?? [];
    const restored = await importDocx(bytes, 'section-links.docx');
    const restoredSection = restored.writerData?.sections?.[0];

    expect(sectionXml).toHaveLength(2);
    expect(sectionXml[1]).not.toContain('<w:headerReference');
    expect(sectionXml[1]).toContain('<w:footerReference w:type="default"');
    expect(restoredSection?.pageSetup).toMatchObject({
      linkToPreviousHeader: true,
      linkToPreviousFooter: false,
      footerText: '',
    });
  });

  it('round-trips PAGE fields, format, placement, document start, chapter mode and section restart', async () => {
    const source = documentWithSetup();
    const textBlock = source.objects['text-root'];
    if (textBlock?.type !== 'TextBlock' || !source.writerData) throw new Error('Writer fixture missing');
    const second = { ...paragraph, id: 'numbered-section', spans: [{ text: 'Numbered section' }] };
    textBlock.data.paragraphs.push(second);
    source.writerData.pageSetup = {
      ...setup,
      headerText: 'DOCUMENT HEADER',
      footerText: '',
      firstPageDifferent: false,
      oddEvenDifferent: false,
      pageNumberFormat: 'roman-lower',
      pageNumberPosition: 'header-center',
      pageNumberStart: 4,
      chapterNumbering: true,
    };
    source.writerData.sections = [{
      id: 'numbering-section',
      startParagraphId: second.id,
      breakType: 'next-page',
      restartPageNumberAt: 7,
      pageSetup: {
        ...source.writerData.pageSetup,
        pageNumberFormat: 'alpha-upper',
        pageNumberPosition: 'footer-left',
        linkToPreviousHeader: false,
        linkToPreviousFooter: false,
      },
    }];

    const bytes = exportDocx(source);
    const entries = await readZip(bytes);
    const documentXml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const headerFooterXml = [...entries.entries()]
      .filter(([name]) => /^word\/(?:header|footer)\d+\.xml$/u.test(name))
      .map(([, value]) => decodeUtf8(value))
      .join('\n');
    const restored = await importDocx(bytes, 'page-numbering.docx');

    expect(documentXml).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="4" w:chapStyle="1" w:chapSep="hyphen"/>');
    expect(documentXml).toContain('<w:pgNumType w:fmt="upperLetter" w:start="7" w:chapStyle="1" w:chapSep="hyphen"/>');
    expect(headerFooterXml).toContain('w:instr=" PAGE "');
    expect(headerFooterXml).toContain('<w:jc w:val="center"/>');
    expect(headerFooterXml).toContain('<w:jc w:val="left"/>');
    expect(restored.writerData?.pageSetup).toMatchObject({
      showPageNumbers: true,
      pageNumberFormat: 'roman-lower',
      pageNumberPosition: 'header-center',
      pageNumberStart: 4,
      chapterNumbering: true,
      headerText: 'DOCUMENT HEADER',
    });
    expect(restored.writerData?.sections?.[0]).toMatchObject({
      restartPageNumberAt: 7,
      pageSetup: {
        showPageNumbers: true,
        pageNumberFormat: 'alpha-upper',
        pageNumberPosition: 'footer-left',
      },
    });
  });
});
