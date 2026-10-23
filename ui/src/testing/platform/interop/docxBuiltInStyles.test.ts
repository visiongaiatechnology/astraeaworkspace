// STATUS: DIAMANT VGT SUPREME — OOXML built-in paragraph-style verification
import { describe, expect, it } from 'vitest';
import type { TextBlockObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../platform/interop/zip';

const document: WorkspaceDocument = {
  schema_version: 1,
  id: 'built-in-styles',
  title: 'Built-ins',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'default',
  root_object_ids: ['text'],
  objects: {
    text: {
      type: 'TextBlock',
      data: {
        id: 'text',
        paragraphs: [
          { id: 'h9', style: { style_name: 'heading9', heading_level: 9, alignment: 'left', line_height: 1.4, space_before: 4, space_after: 2 }, spans: [{ text: 'Deep heading' }] },
          { id: 'caption', style: { style_name: 'caption', alignment: 'center', line_height: 1.35, space_before: 4, space_after: 8 }, spans: [{ text: 'Figure 1' }] },
          { id: 'toc7', style: { style_name: 'toc7', alignment: 'left', line_height: 1.35, space_before: 1, space_after: 1 }, spans: [{ text: 'Deep heading\t9' }] },
        ],
      },
    },
  },
};

describe('DOCX Writer built-in styles', () => {
  it('exports Heading 9, Caption and TOC levels as semantic OOXML styles', async () => {
    const entries = await readZip(exportDocx(document));
    const xml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    expect(xml).toContain('<w:pStyle w:val="Heading9"/>');
    expect(xml).toContain('<w:pStyle w:val="Caption"/>');
    expect(xml).toContain('<w:pStyle w:val="TOC7"/>');

    const stylesXml = decodeUtf8(entries.get('word/styles.xml') ?? new Uint8Array());
    expect(stylesXml).toContain('<w:style w:type="paragraph" w:styleId="Heading9">');
    expect(stylesXml).toContain('<w:style w:type="paragraph" w:styleId="Caption">');
    expect(stylesXml).toContain('<w:style w:type="paragraph" w:styleId="TOC7">');
  });

  it('imports those semantic style identities without visual heuristics', async () => {
    const restored = await importDocx(exportDocx(document), 'built-ins.docx');
    const text = restored.objects[restored.root_object_ids[0]]?.data as TextBlockObject;
    expect(text.paragraphs.map((paragraph) => [paragraph.style.style_name, paragraph.style.heading_level])).toEqual([
      ['heading9', 9],
      ['caption', undefined],
      ['toc7', undefined],
    ]);
  });

  it('round-trips based-on, next-style and automatic-update semantics through styles.xml', async () => {
    const styledDocument: WorkspaceDocument = {
      ...document,
      writerData: {
        pageSetup: {
          paperSize: 'A4',
          orientation: 'portrait',
          margins: 'normal',
          paperColor: 'white',
          showPageNumbers: true,
          headerText: '',
          footerText: '',
        },
        tables: [],
        styles: [{
          name: 'title',
          label: 'Document Title',
          fontSizePt: 28,
          bold: true,
          lineHeight: 1.2,
          spaceBefore: 0,
          spaceAfter: 14,
          basedOn: 'normal',
          nextStyle: 'subtitle',
          autoUpdate: true,
          fontFamily: 'Merriweather, serif',
          textColor: '#991b1b',
          textEffect: 'strong-shadow',
        }],
      },
    };
    const entries = await readZip(exportDocx(styledDocument));
    const stylesXml = decodeUtf8(entries.get('word/styles.xml') ?? new Uint8Array());
    expect(stylesXml).toContain('<w:style w:type="paragraph" w:styleId="Title">');
    expect(stylesXml).toContain('<w:basedOn w:val="Normal"/>');
    expect(stylesXml).toContain('<w:next w:val="Subtitle"/>');
    expect(stylesXml).toContain('<w:autoRedefine/>');
    expect(stylesXml).toContain('<w:rFonts w:ascii="Merriweather" w:hAnsi="Merriweather"/>');
    expect(stylesXml).toContain('<w:color w:val="991b1b"/>');
    expect(stylesXml).toContain('<w:shadow/>');

    const restored = await importDocx(exportDocx(styledDocument), 'style-links.docx');
    expect(restored.writerData?.styles?.find((style) => style.name === 'title')).toMatchObject({
      basedOn: 'normal',
      nextStyle: 'subtitle',
      autoUpdate: true,
      fontFamily: 'Merriweather',
      textColor: '#991B1B',
      textEffect: 'subtle-shadow',
    });
  });
});
