// STATUS: DIAMANT VGT SUPREME — OOXML paragraph-direction interoperability verification
import { describe, expect, it } from 'vitest';
import type { TextBlockObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../platform/interop/zip';

const document: WorkspaceDocument = {
  schema_version: 1,
  id: 'rtl-doc',
  title: 'RTL Interop',
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
        paragraphs: [{
          id: 'rtl-paragraph',
          style: {
            alignment: 'right',
            line_height: 1.5,
            space_before: 0,
            space_after: 8,
            text_direction: 'rtl',
            line_break_mode: 'break-word',
            hyphenation_mode: 'none',
          },
          spans: [{ text: 'مرحبا Astraea' }],
        }],
      },
    },
  },
};

describe('DOCX text-flow interoperability', () => {
  it('emits paragraph/run BiDi and explicit wrapping properties', async () => {
    const bytes = exportDocx(document);
    const entries = await readZip(bytes);
    const xml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    expect(xml).toContain('<w:bidi/>');
    expect(xml).toContain('<w:rtl/>');
    expect(xml).toContain('<w:wordWrap/>');
    expect(xml).toContain('<w:suppressAutoHyphens/>');
  });

  it('imports exported direction and flow semantics back into the Writer model', async () => {
    const restored = await importDocx(exportDocx(document), 'rtl.docx');
    const textBlock = restored.objects[restored.root_object_ids[0]]?.data as TextBlockObject;
    expect(textBlock.paragraphs[0]?.style).toMatchObject({
      text_direction: 'rtl',
      line_break_mode: 'break-word',
      hyphenation_mode: 'none',
    });
  });
});
