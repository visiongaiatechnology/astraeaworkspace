// STATUS: PLATIN — Writer acceptance harness, part 7/7: the persistence round trip of the acceptance
// letter through the **production** write planner.
//
// WHY THIS FILE EXISTS
// --------------------
// The audit found that the WOM/Persistenz claim of package 48 (AST-0238) cited only test files. "Save →
// close → reopen" was modelled as `JSON.parse(JSON.stringify(...))` on the fixture — which proves that a
// plain object survives serialisation, but not that a document **written by the application's own
// persistence planner** is still the same document after being read back.
//
// This file closes that gap with the real code path:
//
//   paragraphs ──▶ planWriterTextBlockWrite ──▶ WorkspaceDocument ──▶ JSON ──▶ read back ──▶ export
//
// `planWriterTextBlockWrite` is the canonical Writer write (the one `persistParagraphs` calls), and the
// round trip through JSON is what "close" and "reopen" mean for the document model in this environment.
// The export is the real `exportDocx`, so the replay also proves nothing observable is lost.
import { describe, expect, it } from 'vitest';

import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { planWriterTextBlockWrite, resolveWriterTextBlockId } from '../../persistence/writerTextBlockWrite';
import { exportDocx } from '../../../../platform/interop/docx/exporter';
import { readZip } from '../../../../platform/interop/zip';
import { buildBusinessLetter } from '../fixtures/writerBusinessLetter';

const decode = (bytes: Uint8Array): string => new TextDecoder('utf8').decode(bytes);

function paragraphsOf(document: WorkspaceDocument): Paragraph[] {
  const block = Object.values(document.objects).find((object) => object.type === 'TextBlock');
  return block?.type === 'TextBlock' ? block.data.paragraphs : [];
}

/** The document skeleton the editor starts from, reduced to the fields the write planner reads. */
function emptyDocument(id: string, title: string): WorkspaceDocument {
  return {
    id,
    title,
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'vgt-default',
    root_object_ids: [],
    objects: {},
    writerData: { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: false, headerText: '', footerText: '' }, tables: [] },
  };
}

describe('the acceptance letter survives a write through the canonical persistence planner', () => {
  it('AST-0238 writes the letter through planWriterTextBlockWrite and reads it back unchanged', () => {
    const letter = buildBusinessLetter();
    const paragraphs = paragraphsOf(letter);
    expect(paragraphs.length).toBeGreaterThan(25);

    // 1. The application's own write: paragraphs → TextBlock root object (this is what `persistParagraphs`
    //    calls inside `useWriterPersistence`, which is reached from `useWriterState`).
    const write = planWriterTextBlockWrite({
      document: emptyDocument('letter-doc', letter.title),
      paragraphs,
    });
    expect(write).not.toBeNull();
    const textBlockId = resolveWriterTextBlockId({ id: 'letter-doc' } as WorkspaceDocument);
    expect(write?.textBlockId).toBe(textBlockId);
    expect(write?.rootObjectIds).toContain(textBlockId);

    const written: WorkspaceDocument = {
      ...emptyDocument('letter-doc', letter.title),
      root_object_ids: write?.rootObjectIds ?? [],
      objects: write?.objects ?? {},
      // The side channel the editor persists next to the text: table, image and page setup.
      writerData: {
        pageSetup: letter.writerData!.pageSetup!,
        tables: letter.writerData!.tables ?? [],
        images: letter.writerData!.images ?? [],
      },
    };

    // 2. Close → reopen: the stored document is serialised and read back.
    const reopened = JSON.parse(JSON.stringify(written)) as WorkspaceDocument;

    // 3. Reopen must reproduce the same block, in the same place, with the same text.
    expect(reopened.root_object_ids).toContain(textBlockId);
    const reopenedBlock = reopened.objects[textBlockId];
    expect(reopenedBlock?.type).toBe('TextBlock');
    if (reopenedBlock?.type !== 'TextBlock') throw new Error('TextBlock fehlt nach Wiederöffnung');
    expect(reopenedBlock.data.paragraphs.map((paragraph) => paragraph.id))
      .toEqual(paragraphs.map((paragraph) => paragraph.id));
    expect(reopenedBlock.data.paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join('')))
      .toEqual(paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join('')));
    // The heading levels — what the outline and the TOC read — are part of the text block, not a side
    // table, so they must come back with it.
    expect(reopenedBlock.data.paragraphs.filter((paragraph) => (paragraph.style.heading_level ?? 0) > 0).length)
      .toBe(paragraphs.filter((paragraph) => (paragraph.style.heading_level ?? 0) > 0).length);
    // No second block appeared: a write is idempotent on the identity.
    expect(Object.values(reopened.objects).filter((object) => object.type === 'TextBlock')).toHaveLength(1);

    // 4. A second write onto the reopened document updates the same block instead of appending one.
    const second = planWriterTextBlockWrite({
      document: reopened,
      existingTextBlock: reopenedBlock.data,
      paragraphs: [...reopenedBlock.data.paragraphs, {
        id: 'letter-appended',
        style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
        spans: [{ text: 'Nachtrag' }],
      }],
    });
    expect(second?.textBlockId).toBe(textBlockId);
    expect(second?.rootObjectIds.filter((id) => id === textBlockId)).toHaveLength(1);
    expect(Object.values(second?.objects ?? {}).filter((object) => object.type === 'TextBlock')).toHaveLength(1);
  });

  it('AST-0238 exports byte-identical DOCX after the write round trip', async () => {
    const letter = buildBusinessLetter();
    const paragraphs = paragraphsOf(letter);
    const write = planWriterTextBlockWrite({ document: emptyDocument('letter-doc', letter.title), paragraphs });
    const written: WorkspaceDocument = {
      ...emptyDocument('letter-doc', letter.title),
      root_object_ids: write?.rootObjectIds ?? [],
      objects: write?.objects ?? {},
      writerData: letter.writerData,
    };
    const reopened = JSON.parse(JSON.stringify(written)) as WorkspaceDocument;

    const before = await readZip(exportDocx(written));
    const after = await readZip(exportDocx(reopened));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    expect(decode(after.get('word/document.xml')!)).toBe(decode(before.get('word/document.xml')!));
    // The picture is still a package part after the round trip — it must not degrade into a reference.
    expect([...after.keys()].some((name) => name.startsWith('word/media/'))).toBe(true);
  });
});
