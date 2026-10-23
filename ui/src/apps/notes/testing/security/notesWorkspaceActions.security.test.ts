// STATUS: PLATIN — hostile persisted Notes attachments are bounded and verified before Vault transfer.
import { describe, expect, it, vi } from 'vitest';
import type { NoteAttachment, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { NOTE_ATTACHMENT_MAX_BYTES } from '../../media/noteAttachments';
import { sendNoteAttachmentsToVault } from '../../integrations/notesWorkspaceActions';

async function attachmentForBytes(values: readonly number[], mimeType = 'application/octet-stream', name = 'record.bin'): Promise<NoteAttachment> {
  const bytes = Uint8Array.from(values);
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  return {
    id: 'note-attachment-fixture',
    name,
    mimeType,
    sizeBytes: bytes.byteLength,
    dataUrl: `data:${mimeType};base64,${btoa(binary)}`,
    createdAt: 1,
    sha256,
  };
}

function pageWithAttachments(attachments: NoteAttachment[]): NotePage {
  return {
    id: 'page-transfer',
    title: 'Transfer test',
    content: '',
    tags: [],
    backlinks: [],
    last_modified: 1,
    attachments,
  };
}

function emptyVault(): WorkspaceDocument {
  return {
    id: 'vault-transfer',
    title: 'Vault',
    kind: 'Vault',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'astraea-default',
    root_object_ids: [],
    objects: {},
    vaultData: { files: [], shares: [] },
  };
}

describe('Notes to Vault attachment trust boundary', () => {
  it('transfers only canonical, bounded attachments with a verified content digest', async () => {
    const attachment = await attachmentForBytes([1, 2, 3, 4]);
    const result = await sendNoteAttachmentsToVault(pageWithAttachments([attachment]), emptyVault());
    const [file] = result.target.vaultData?.files ?? [];

    expect(result.count).toBe(1);
    expect(file).toMatchObject({
      name: 'record.bin',
      sizeBytes: 4,
      sourceType: 'attachment',
      mimeType: 'application/octet-stream',
      contentDigest: attachment.sha256,
      integrityState: 'verified',
    });
    expect(result.page.workspaceLinks).toHaveLength(1);
  });

  it('rejects an oversized encoded payload before base64 decoding', async () => {
    const attachment = await attachmentForBytes([1]);
    const oversizedEncoding = { ...attachment, dataUrl: `${attachment.dataUrl}${'A'.repeat(32_768)}` };
    const decoder = vi.spyOn(globalThis, 'atob');

    try {
      await expect(sendNoteAttachmentsToVault(pageWithAttachments([oversizedEncoding]), emptyVault())).rejects.toThrow(/payload length/u);
      expect(decoder).not.toHaveBeenCalled();
    } finally {
      decoder.mockRestore();
    }
  });

  it('rejects per-file and aggregate byte-limit violations before decoding', async () => {
    const attachment = await attachmentForBytes([1]);
    const decoder = vi.spyOn(globalThis, 'atob');
    const oversizedFile = { ...attachment, sizeBytes: NOTE_ATTACHMENT_MAX_BYTES + 1 };
    const aggregateOverflow = Array.from({ length: 5 }, (_, index) => ({
      ...attachment,
      id: `attachment-${index}`,
      sizeBytes: NOTE_ATTACHMENT_MAX_BYTES,
    }));

    try {
      await expect(sendNoteAttachmentsToVault(pageWithAttachments([oversizedFile]), emptyVault())).rejects.toThrow(/per-file size boundary/u);
      await expect(sendNoteAttachmentsToVault(pageWithAttachments(aggregateOverflow), emptyVault())).rejects.toThrow(/32 MiB/u);
      expect(decoder).not.toHaveBeenCalled();
    } finally {
      decoder.mockRestore();
    }
  });

  it('rejects missing, forged, and active-content attachment records', async () => {
    const attachment = await attachmentForBytes([1, 2, 3]);
    const missingDigest = { ...attachment, sha256: undefined };
    const forgedDigest = { ...attachment, dataUrl: `data:application/octet-stream;base64,${btoa('xyz')}` };
    const activeHtml = await attachmentForBytes(Array.from(new TextEncoder().encode('<script>x</script>')), 'text/html', 'payload.html');

    await expect(sendNoteAttachmentsToVault(pageWithAttachments([missingDigest]), emptyVault())).rejects.toThrow(/integrity metadata/u);
    await expect(sendNoteAttachmentsToVault(pageWithAttachments([forgedDigest]), emptyVault())).rejects.toThrow(/integrity verification/u);
    await expect(sendNoteAttachmentsToVault(pageWithAttachments([activeHtml]), emptyVault())).rejects.toThrow(/active or executable/u);
  });
});
