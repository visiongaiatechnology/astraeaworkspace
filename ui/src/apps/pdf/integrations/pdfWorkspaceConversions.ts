// STATUS: DIAMANT VGT SUPREME — canonical PDF ↔ Workspace conversion adapters.
import type { NotePage, PdfPageModel, PresentSlide, PresentWorkspaceSceneObject, TaskItem, WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import { createNewDocument } from '../../../edition/contracts/documentFactory';
import { MAX_ANNOTATION_TASKS, MAX_EXPORT_TEXT, MAX_GRID_CELLS, MAX_SELECTED_PAGES, cleanText, entityId, pageSnapshot, pdfAnnotationUri, pdfDocumentUri, pdfModel, pdfPageUri, sourceReference } from './pdfWorkspaceAdapterSupport';

function paragraphsFromWriter(source: WorkspaceDocument): string[] {
  const result: string[] = [];
  let bytes = 0;
  for (const objectId of source.root_object_ids) {
    const object = source.objects[objectId];
    if (object?.type !== 'TextBlock') continue;
    for (const paragraph of object.data.paragraphs) {
      const text = paragraph.spans.map((span) => span.text).join('');
      bytes += new TextEncoder().encode(text).byteLength;
      if (bytes > MAX_EXPORT_TEXT) throw new Error('Writer source exceeds the bounded PDF Studio export text budget.');
      result.push(text);
    }
  }
  return result;
}

function pagesFromWriter(source: WorkspaceDocument): PdfPageModel[] {
  const paragraphs = paragraphsFromWriter(source);
  const pages: PdfPageModel[] = [];
  for (let offset = 0; offset < Math.max(1, paragraphs.length); offset += 28) {
    const slice = paragraphs.slice(offset, offset + 28);
    const pageNumber = pages.length + 1;
    pages.push({
      pageNumber,
      title: pageNumber === 1 ? cleanText(source.title, 500) : `${cleanText(source.title, 450)} · ${pageNumber}`,
      sections: (slice.length ? slice : ['']).map((content, index) => ({
        id: `writer-pdf-${source.id}-${offset + index}`,
        type: index === 0 && pageNumber === 1 ? 'header' : 'paragraph',
        content,
      })),
    });
  }
  return pages;
}

function pagesFromPresent(source: WorkspaceDocument): PdfPageModel[] {
  const slides = source.presentData?.slides ?? [];
  if (!slides.length) throw new Error('Presentation source has no slides.');
  return slides.slice(0, MAX_SELECTED_PAGES).map((slide, index) => {
    const lines = [
      ...(slide.bulletPoints ?? []),
      ...(slide.cards ?? []).flatMap((card) => [card.title, card.description]),
      ...(slide.sceneObjects ?? []).flatMap((object) => object.kind === 'text' ? [object.text] : []),
    ].map((line) => cleanText(line, 10_000)).filter(Boolean);
    return {
      pageNumber: index + 1,
      title: cleanText(slide.title || `Slide ${index + 1}`, 500),
      subtitle: cleanText(slide.subtitle, 1_000) || undefined,
      pageLabel: `Slide ${index + 1}`,
      sections: lines.slice(0, 200).map((content, lineIndex) => ({ id: `present-pdf-${slide.id}-${lineIndex}`, type: 'paragraph' as const, content })),
    };
  });
}

function pagesFromGrid(source: WorkspaceDocument): PdfPageModel[] {
  const sheets = source.gridData?.sheets ?? [];
  if (!sheets.length) throw new Error('Grid source has no sheets.');
  return sheets.slice(0, MAX_SELECTED_PAGES).map((sheet, index) => {
    const object = source.objects[sheet.tableObjectId];
    if (!object || object.type !== 'Table') throw new Error(`Grid sheet ${sheet.name} is missing its canonical table object.`);
    const entries = Object.entries(object.data.cells).slice(0, MAX_GRID_CELLS);
    const content = entries.map(([address, cell]) => `${address}: ${String(cell.value)}`).join('\n');
    if (new TextEncoder().encode(content).byteLength > MAX_EXPORT_TEXT) throw new Error(`Grid sheet ${sheet.name} exceeds the PDF Studio export budget.`);
    return {
      pageNumber: index + 1,
      title: cleanText(sheet.name, 500) || `Sheet ${index + 1}`,
      pageLabel: cleanText(sheet.name, 200) || `Sheet ${index + 1}`,
      sections: [{ id: `grid-pdf-${sheet.id}`, type: 'table' as const, content: content || '(empty sheet)' }],
    };
  });
}

function noteCanvasText(pageId: string, block: NonNullable<NonNullable<WorkspaceDocument['noteData']>['sections'][number]['pages'][number]['canvas']>['blocks'][number], blockIndex: number): PdfPageModel['sections'][number] | null {
  let content = '';
  if (block.kind === 'text') content = block.text;
  else if (block.kind === 'list') content = block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : block.checklist ? '[ ]' : '•'} ${item}`).join('\n');
  else if (block.kind === 'table') content = block.rows.map((row) => row.join(' | ')).join('\n');
  else if (block.kind === 'toggle') content = `${block.title}\n${block.text}`;
  else if (block.kind === 'image') content = block.altText || block.ocr?.fullText || '[Image]';
  else if (block.kind === 'ink') content = block.recognizedText || block.ink?.recognition?.text || '[Ink]';
  else if (block.kind === 'file') content = `[Attachment: ${block.name}]`;
  else if (block.kind === 'embed') content = `${block.title} · ${block.reference}`;
  else if (block.kind === 'media') content = `${block.memo.title}\n${block.memo.transcript.map((segment) => segment.text).join(' ')}`;
  if (!content.trim()) return null;
  return { id: `notes-pdf-${pageId}-canvas-${block.id || blockIndex}`, type: block.kind === 'table' ? 'table' : 'paragraph', content: cleanText(content, 20_000) };
}

function pagesFromNotes(source: WorkspaceDocument): PdfPageModel[] {
  const noteData = source.noteData;
  if (!noteData?.sections?.length) throw new Error('Notes source has no canonical sections.');
  const pages: PdfPageModel[] = [];
  for (const section of noteData.sections) {
    for (const notePage of section.pages) {
      if (pages.length >= MAX_SELECTED_PAGES) throw new Error('Notes source exceeds the PDF Studio page budget.');
      const sections: PdfPageModel['sections'] = [];
      const documentText = cleanText(notePage.content, 200_000);
      if (documentText) {
        const paragraphs = documentText.split(/\n{2,}/u).map((value) => value.trim()).filter(Boolean).slice(0, 2_000);
        paragraphs.forEach((content, index) => sections.push({ id: `notes-pdf-${notePage.id}-text-${index}`, type: /^#{1,6}\s/u.test(content) ? 'header' : 'paragraph', content: content.replace(/^#{1,6}\s+/u, '') }));
      }
      for (const [blockIndex, block] of (notePage.canvas?.blocks ?? []).slice(0, 2_000).entries()) {
        const mapped = noteCanvasText(notePage.id, block, blockIndex);
        if (mapped) sections.push(mapped);
      }
      const totalBytes = sections.reduce((sum, item) => sum + new TextEncoder().encode(item.content).byteLength, 0);
      if (totalBytes > MAX_EXPORT_TEXT) throw new Error(`Notes page ${notePage.title} exceeds the PDF Studio export budget.`);
      pages.push({ pageNumber: pages.length + 1, title: cleanText(notePage.title, 500) || `Note ${pages.length + 1}`, subtitle: cleanText(section.title, 500) || undefined, pageLabel: cleanText(notePage.title, 200) || undefined, sections: sections.length ? sections : [{ id: `notes-pdf-${notePage.id}-empty`, type: 'paragraph', content: '(empty note)' }] });
    }
  }
  if (!pages.length) throw new Error('Notes source contains no pages.');
  return pages;
}

function pagesFromWhiteboard(source: WorkspaceDocument): PdfPageModel[] {
  const items = source.whiteboardData?.items ?? [];
  if (!items.length) throw new Error('Whiteboard source has no canonical items.');
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const chunks: typeof sorted[] = [];
  for (let offset = 0; offset < sorted.length; offset += 80) chunks.push(sorted.slice(offset, offset + 80));
  return chunks.slice(0, MAX_SELECTED_PAGES).map((chunk, pageIndex) => ({
    pageNumber: pageIndex + 1,
    title: pageIndex === 0 ? cleanText(source.title, 500) : `${cleanText(source.title, 440)} · ${pageIndex + 1}`,
    pageLabel: `Board ${pageIndex + 1}`,
    sections: chunk.map((item, itemIndex) => ({
      id: `whiteboard-pdf-${item.id}-${itemIndex}`,
      type: item.type === 'frame' || item.type === 'decision' ? 'header' as const : 'paragraph' as const,
      content: cleanText(`${item.type.toUpperCase()} @ ${Math.round(item.x)},${Math.round(item.y)}${item.name ? ` · ${item.name}` : ''}${item.text ? `\n${item.text}` : ''}`, 20_000),
    })),
  }));
}

export function workspaceSourceToPdfPages(source: WorkspaceDocument): PdfPageModel[] {
  if (source.kind === 'Writer') return pagesFromWriter(source);
  if (source.kind === 'Grid') return pagesFromGrid(source);
  if (source.kind === 'Present') return pagesFromPresent(source);
  if (source.kind === 'Notes') return pagesFromNotes(source);
  if (source.kind === 'Whiteboard') return pagesFromWhiteboard(source);
  throw new Error('PDF Studio source conversion accepts Writer, Grid, Present, Notes or Whiteboard documents.');
}

/** Creates a real PdfStudio document from canonical Writer/Grid/Present/Notes/Whiteboard content. */
export function createPdfStudioFromWorkspaceSource(source: WorkspaceDocument): WorkspaceDocument {
  const pages = workspaceSourceToPdfPages(source);

  const output = createNewDocument('PdfStudio');
  output.id = entityId('pdf-from-workspace');
  output.title = `${cleanText(source.title, 180) || source.kind}.pdf`;
  output.created_at = Date.now();
  output.modified_at = output.created_at;
  output.version = 1;
  output.pdfData = { numPages: pages.length, pages, annotations: [], redactions: [] };
  const uri = pdfDocumentUri(source.id);
  const reference = sourceReference(uri);
  if (reference.type === 'WorkspaceReference') {
    output.objects[reference.data.id] = reference;
    output.root_object_ids.push(reference.data.id);
  }
  return output;
}

export function convertPdfAnnotationsToTasks(
  source: WorkspaceDocument,
  target: WorkspaceDocument | undefined,
  annotationIds?: readonly string[],
): { target: WorkspaceDocument; count: number } {
  const model = pdfModel(source);
  const targetDocument = target ?? createNewDocument('Tasks');
  if (targetDocument.kind !== 'Tasks') throw new Error('PDF annotation conversion requires an Astraea Tasks target.');
  const selected = annotationIds?.length ? new Set(annotationIds.slice(0, MAX_ANNOTATION_TASKS)) : null;
  const annotations = model.annotations
    .filter((annotation) => !selected || selected.has(annotation.id))
    .slice(0, MAX_ANNOTATION_TASKS);
  const work = targetDocument.workManagementData ?? targetDocument.workData ?? { tasks: [], cards: [], milestones: [] };
  const tasks = [...work.tasks];
  let count = 0;
  for (const annotation of annotations) {
    const uri = pdfAnnotationUri(source.id, annotation.id);
    if (tasks.some((task) => task.linkedWorkspaceUris?.includes(uri))) continue;
    const title = cleanText(annotation.text || annotation.targetText || `${annotation.type} annotation`, 500);
    const task: TaskItem = {
      id: entityId('task-from-pdf'),
      title: title || `${annotation.type} annotation on page ${annotation.page}`,
      completed: annotation.status === 'accepted' || annotation.status === 'completed',
      priority: annotation.status === 'rejected' ? 'low' : 'medium',
      description: `PDF review annotation from “${source.title}”, page ${annotation.page}.`,
      tags: ['pdf-review', annotation.type],
      comments: annotation.replies?.slice(0, 512).map((reply) => ({ id: reply.id, author: reply.author, text: reply.text, createdAt: reply.createdAt })),
      linkedWorkspaceUris: [uri, pdfPageUri(source.id, annotation.page)],
    };
    tasks.unshift(task);
    count += 1;
  }
  if (!count) throw new Error('No new PDF annotation tasks were created.');
  const nextWork = { ...work, tasks: tasks.slice(0, 100_000) };
  return {
    target: {
      ...targetDocument,
      title: target ? targetDocument.title : `Tasks · ${source.title}`.slice(0, 180),
      modified_at: Date.now(),
      version: targetDocument.version + 1,
      workManagementData: nextWork,
      ...(targetDocument.workData ? { workData: nextWork } : {}),
    },
    count,
  };
}

function selectedPdfPages(source: WorkspaceDocument, pageNumbers: readonly number[]): PdfPageModel[] {
  const model = pdfModel(source);
  const unique = [...new Set(pageNumbers.filter((page) => Number.isInteger(page) && page >= 1))].slice(0, MAX_SELECTED_PAGES);
  if (!unique.length) throw new Error('Select at least one PDF page.');
  const pages = unique.map((pageNumber) => model.pages.find((page) => page.pageNumber === pageNumber));
  if (pages.some((page) => !page)) throw new Error('One or more selected PDF pages no longer exist.');
  return pages as PdfPageModel[];
}

function presentFromPdfPages(source: WorkspaceDocument, pages: PdfPageModel[]): WorkspaceDocument {
  const target = createNewDocument('Present');
  target.id = entityId('present-from-pdf');
  target.title = `Pages · ${source.title}`.slice(0, 180);
  const slides: PresentSlide[] = pages.map((page) => {
    const uri = pdfPageUri(source.id, page.pageNumber);
    const snapshot = pageSnapshot(page);
    const workspaceObject: PresentWorkspaceSceneObject = {
      id: entityId('present-pdf-page'), kind: 'workspace', integrationKind: 'pdf-page', mode: 'Live',
      sourceDocumentId: source.id, sourceSelector: `page:${page.pageNumber}`, sourceVersion: source.version, uri,
      title: page.title, snapshot,
      xPercent: 6, yPercent: 18, widthPercent: 88, heightPercent: 70, zIndex: 1,
    };
    return {
      id: entityId('slide-from-pdf'), title: page.title, subtitle: page.subtitle ?? `Source page ${page.pageNumber}`,
      category: 'PDF page', layout: 'blank', sceneObjects: [workspaceObject], speakerNotes: `Canonical source: ${uri}`,
    };
  });
  target.presentData = { ...(target.presentData ?? { slides: [] }), slides };
  target.modified_at = Date.now();
  return target;
}

function notesFromPdfPages(source: WorkspaceDocument, pages: PdfPageModel[]): WorkspaceDocument {
  const target = createNewDocument('Notes');
  target.id = entityId('notes-from-pdf');
  target.title = `Pages · ${source.title}`.slice(0, 180);
  const notePages: NotePage[] = pages.map((page) => {
    const uri = pdfPageUri(source.id, page.pageNumber);
    const snapshot = pageSnapshot(page);
    return {
      id: entityId('note-pdf-page'), title: page.title, content: `# ${page.title}\n\nCanonical PDF page: ${uri}`,
      editorMode: 'freeform', tags: ['pdf-page'], backlinks: [], last_modified: Date.now(),
      canvas: {
        pageMode: 'fixed', pageSize: 'A4', background: 'plain', blocks: [{
          id: entityId('note-pdf-embed'), kind: 'embed', title: page.title, reference: uri, frozen: false,
          x: 32, y: 32, width: 720, height: 960, zIndex: 1,
          workspace: { kind: 'pdf-page', mode: 'Live', sourceDocumentId: source.id, sourceSelector: `page:${page.pageNumber}`, sourceVersion: source.version, uri, title: page.title, snapshot },
        }],
      },
    };
  });
  target.noteData = { id: entityId('pdf-note-book'), title: target.title, sections: [{ id: entityId('pdf-note-section'), title: 'Selected PDF pages', pages: notePages }] };
  target.modified_at = Date.now();
  return target;
}

function whiteboardFromPdfPages(source: WorkspaceDocument, pages: PdfPageModel[]): WorkspaceDocument {
  const target = createNewDocument('Whiteboard');
  target.id = entityId('whiteboard-from-pdf');
  target.title = `Pages · ${source.title}`.slice(0, 180);
  const objects: Record<string, WorkspaceObject> = { ...target.objects };
  const rootIds = [...target.root_object_ids];
  const items = pages.map((page, index) => {
    const uri = pdfPageUri(source.id, page.pageNumber);
    const reference = sourceReference(uri, { type: 'TextBlock', data: { id: entityId('pdf-page-snapshot'), paragraphs: [{ id: entityId('p'), style: { alignment: 'left', line_height: 1.4, space_before: 0, space_after: 0 }, spans: [{ text: `${page.title}\n${page.sections.map((section) => section.content).join('\n').slice(0, 20_000)}` }] }] } });
    if (reference.type === 'WorkspaceReference') { objects[reference.data.id] = reference; rootIds.push(reference.data.id); }
    return {
      id: entityId('whiteboard-pdf-page'), type: 'frame' as const,
      x: 80 + (index % 3) * 420, y: 80 + Math.floor(index / 3) * 560, width: 360, height: 500,
      text: `${page.title}\n${uri}`,
    };
  });
  target.whiteboardData = { items };
  target.objects = objects;
  target.root_object_ids = [...new Set(rootIds)];
  target.modified_at = Date.now();
  return target;
}

export function createWorkspaceDocumentFromPdfPages(
  source: WorkspaceDocument,
  pageNumbers: readonly number[],
  kind: 'Present' | 'Notes' | 'Whiteboard',
): WorkspaceDocument {
  const pages = selectedPdfPages(source, pageNumbers);
  if (kind === 'Present') return presentFromPdfPages(source, pages);
  if (kind === 'Notes') return notesFromPdfPages(source, pages);
  return whiteboardFromPdfPages(source, pages);
}

