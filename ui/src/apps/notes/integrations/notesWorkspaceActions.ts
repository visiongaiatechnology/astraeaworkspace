// STATUS: PLATIN — canonical cross-app Notes actions using stable Workspace IDs
//
// ## AST-0738 — warum die Quellenangabe jetzt ein **Link** ist und nicht mehr nur Text
//
// Der Akzeptanzwortlaut verlangt „Textausschnitt in Writer als Kopie **oder Link** übernehmen". Gemessen war die
// Referenz **träger Text**: der Absatz trug `Source: vgt://…/notes/page/<id>` als Zeichenkette, und `TextSpan`
// hat für genau diesen Fall ein Feld — `link?: WriterTextLink` (`shared/contracts/writer/workspaceWriterText.ts:24`)
// mit dem Fall `{ kind: 'external'; url }`. Writer wertet es im **PDF-Export** aus
// (`interchange/export/pdf/writerPdfAssembly.ts:393` → `sanitizeWriterPdfLink` → `/Subtype /Link`), und die
// Freigabe-Regel `evaluateRichTextLink` (`platform/security/richTextLinkSecurity.ts:26-28`) lässt `vgt:` **zu**.
// *Ohne `link` war die Zusage „als Link" eine Zusage ohne Deckung: der Nutzer sah eine Adresse, die niemand
// anklicken konnte.* Kein zweites URI-Schema, keine zweite Prüfung — dieselbe `noteWorkspaceUri` und die
// **vorhandene** Schreibweise `kind: 'external'`.
import { secureRandomId } from '../../../shared/crypto/secureRandom';
import type { NotePage, NoteWorkspaceLink, Paragraph, TaskItem, VaultFile, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { NOTE_ATTACHMENT_MAX_BYTES, NOTE_ATTACHMENT_TOTAL_MAX_BYTES, sanitizeNoteAttachmentName, verifyAndReadNoteAttachment } from '../media/noteAttachments';
import { createNewDocument } from '../../../edition/contracts/documentFactory';
// **Eine** Ableitung „Seite → Writer-Absätze" (`model/noteModel.ts`) — sie war hier privat und wird seit der
// Objekt-Reparatur (**AST-0737-Abhängigkeit (4)**) auch vom **Seitenobjekt** gelesen. *Nicht kopiert, importiert.*
import { notePageParagraphs } from '../model/noteModel';

const MAX_ATTACHMENTS = 256;
function entityId(prefix: string): string { return secureRandomId(prefix); }
export function noteWorkspaceUri(sourceDocumentId: string, pageId: string): string { return `vgt://workspace/document/${encodeURIComponent(sourceDocumentId)}/notes/page/${encodeURIComponent(pageId)}`; }

function link(relation: NoteWorkspaceLink['relation'], target: WorkspaceDocument, targetObjectId?: string): NoteWorkspaceLink {
  const uri = targetObjectId ? `vgt://workspace/document/${encodeURIComponent(target.id)}/object/${encodeURIComponent(targetObjectId)}` : `vgt://workspace/document/${encodeURIComponent(target.id)}`;
  return { id:entityId('note-link'),relation,targetDocumentId:target.id,targetKind:target.kind,targetObjectId,uri,createdAt:Date.now() };
}
export function appendWorkspaceLink(page: NotePage, record: NoteWorkspaceLink): NotePage {
  const existing=(page.workspaceLinks ?? []).filter((entry)=>!(entry.relation===record.relation&&entry.targetDocumentId===record.targetDocumentId&&entry.targetObjectId===record.targetObjectId));
  return {...page,workspaceLinks:[...existing,record].slice(-256),last_modified:Date.now()};
}

export function createWriterDraftFromNote(source: WorkspaceDocument, page: NotePage): { draft: WorkspaceDocument; page: NotePage } {
  const draft=createNewDocument('Writer'); const textId=draft.root_object_ids.find((id)=>draft.objects[id]?.type==='TextBlock');
  if(!textId || draft.objects[textId]?.type!=='TextBlock') throw new Error('Writer draft template does not contain a canonical TextBlock.');
  draft.id=entityId('writer-from-note'); draft.title=page.title; draft.created_at=Date.now();draft.modified_at=Date.now();draft.version=1;
  draft.objects[textId]={type:'TextBlock',data:{id:textId,paragraphs:[{id:`note-title-${page.id}`,style:{heading_level:1,alignment:'left',line_height:1.2,space_before:0,space_after:12},spans:[{text:page.title,bold:true,font_size_pt:24}]},...notePageParagraphs(page),{id:`note-source-${page.id}`,style:{alignment:'left',line_height:1.3,space_before:14,space_after:0},spans:[{text:`Source: ${noteWorkspaceUri(source.id,page.id)}`,link:{kind:'external',url:noteWorkspaceUri(source.id,page.id)}}]}]}};
  return {draft,page:appendWorkspaceLink(page,link('writer-draft',draft,textId))};
}

export const NOTE_SELECTION_MAX_CHARS = 100_000;

/**
 * AST-0736 acceptance: "Textausschnitt in Writer als Kopie **oder Link** übernehmen."
 * Only a whole-note draft existed. This sends just the selected passage and records exactly which passage
 * travelled, so the Writer side gets a copy plus a resolvable link back to the note.
 */
export function createWriterDraftFromSelection(
  source: WorkspaceDocument,
  page: NotePage,
  selection: string,
): { draft: WorkspaceDocument; page: NotePage } {
  const text = String(selection ?? '').normalize('NFKC').replace(/\u0000/g, '').trim().slice(0, NOTE_SELECTION_MAX_CHARS);
  if (!text) throw new Error('Select a passage in the note body first.');
  const draft = createNewDocument('Writer');
  const textId = draft.root_object_ids.find((id) => draft.objects[id]?.type === 'TextBlock');
  if (!textId || draft.objects[textId]?.type !== 'TextBlock') throw new Error('Writer draft template does not contain a canonical TextBlock.');
  const now = Date.now();
  draft.id = entityId('writer-from-selection');
  draft.title = `${page.title} · selection`.slice(0, 180);
  draft.created_at = now; draft.modified_at = now; draft.version = 1;
  const paragraphs: Paragraph[] = text.split('\n').slice(0, 2_000).map((line, index) => ({
    id: `note-selection-${page.id}-${index}`,
    style: { alignment: 'left', line_height: 1.5, space_before: index === 0 ? 0 : 2, space_after: 4 },
    spans: [{ text: line.slice(0, 4_000), font_size_pt: 11 }],
  }));
  draft.objects[textId] = {
    type: 'TextBlock',
    data: {
      id: textId,
      paragraphs: [
        { id: `note-selection-title-${page.id}`, style: { heading_level: 2, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 10 }, spans: [{ text: `Selection from “${page.title}”`, bold: true, font_size_pt: 16 }] },
        ...paragraphs,
        { id: `note-selection-source-${page.id}`, style: { alignment: 'left', line_height: 1.3, space_before: 14, space_after: 0 }, spans: [{ text: `Source: ${noteWorkspaceUri(source.id, page.id)}`, link: { kind: 'external', url: noteWorkspaceUri(source.id, page.id) } }] },
      ],
    },
  };
  return { draft, page: appendWorkspaceLink(page, link('writer-draft', draft, textId)) };
}

export function sendChecklistToTaskDocument(
  source: WorkspaceDocument,
  page: NotePage,
  lineIndices: readonly number[],
  target?: WorkspaceDocument,
): { target: WorkspaceDocument; page: NotePage; count: number } {
  const targetDoc = target ?? createNewDocument('Tasks');
  if (targetDoc.kind !== 'Tasks') throw new Error('Checklist conversion requires an Astraea Tasks target.');
  const wanted = new Set(lineIndices.slice(0, 256));
  const lines = page.content.split('\n');
  const work = targetDoc.workManagementData ?? { tasks: [], cards: [], milestones: [] };
  const tasks = [...work.tasks];
  let nextPage = page;
  let count = 0;
  const sourceUri = noteWorkspaceUri(source.id, page.id);
  for (const [index, lineText] of lines.entries()) {
    if (!wanted.has(index)) continue;
    const match = lineText.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
    if (!match) continue;
    const lineUri = `${sourceUri}#line-${index}`;
    if (tasks.some((task) => task.linkedWorkspaceUris?.includes(lineUri))) continue;
    const task: TaskItem = {
      id: entityId('task-from-note'),
      title: match[2].trim().slice(0, 500),
      completed: match[1].toLowerCase() === 'x',
      priority: 'medium',
      description: `Created from note “${page.title}”`,
      linkedWorkspaceUris: [lineUri],
    };
    tasks.unshift(task);
    nextPage = appendWorkspaceLink(nextPage, {
      id: entityId('note-link'), relation: 'task', targetDocumentId: targetDoc.id, targetKind: 'Tasks',
      targetObjectId: task.id, uri: `vgt://workspace/document/${encodeURIComponent(targetDoc.id)}/task/${encodeURIComponent(task.id)}`, createdAt: Date.now(),
    });
    count += 1;
  }
  if (!count) throw new Error('No new checklist tasks were selected.');
  return {
    target: {
      ...targetDoc,
      title: target ? targetDoc.title : `Tasks · ${page.title}`.slice(0, 180),
      version: targetDoc.version + 1,
      modified_at: Date.now(),
      workManagementData: { ...work, tasks: tasks.slice(0, 100_000) },
    },
    page: nextPage,
    count,
  };
}

export async function sendNoteAttachmentsToVault(page:NotePage,target:WorkspaceDocument):Promise<{target:WorkspaceDocument;page:NotePage;count:number}>{
  if(target.kind!=='Vault') throw new Error('Attachment transfer requires an Astraea Vault document.');
  const attachments = page.attachments ?? [];
  if (!Array.isArray(attachments) || attachments.length === 0) throw new Error('Current note has no attachments.');
  if (attachments.length > MAX_ATTACHMENTS) throw new Error('Attachment transfer exceeds the 256-file limit.');
  let totalBytes = 0;
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object' || !Number.isSafeInteger(attachment.sizeBytes)
      || attachment.sizeBytes <= 0 || attachment.sizeBytes > NOTE_ATTACHMENT_MAX_BYTES) {
      throw new Error('Attachment transfer contains a file outside the per-file size boundary.');
    }
    totalBytes += attachment.sizeBytes;
    if (totalBytes > NOTE_ATTACHMENT_TOTAL_MAX_BYTES) throw new Error('Attachment transfer exceeds the 32 MiB per-note byte limit.');
  }

  const files:VaultFile[]=[];
  for (const attachment of attachments) {
    const verified = await verifyAndReadNoteAttachment(attachment);
    files.push({
      id: entityId('vault-note-attachment'),
      name: sanitizeNoteAttachmentName(attachment.name),
      kind: 'Notes',
      sizeBytes: verified.bytes.byteLength,
      encryptedHash: verified.sha256,
      lastModified: attachment.createdAt,
      sourceType: 'attachment',
      mimeType: verified.mimeType,
      payloadDataUrl: attachment.dataUrl,
      contentDigest: verified.sha256,
      digestAlgorithm: 'SHA-256',
      integrityState: 'verified',
    });
  }
  const existing=target.vaultData?.files??[]; const vaultData={files:[...files,...existing].slice(0,10_000),shares:target.vaultData?.shares??[],spaces:target.vaultData?.spaces,trash:target.vaultData?.trash}; const targetDoc={...target,version:target.version+1,modified_at:Date.now(),vaultData};
  return {target:targetDoc,page:appendWorkspaceLink(page,link('vault',targetDoc,files[0]?.id)),count:files.length};
}

