// STATUS: DIAMANT VGT SUPREME — explicit Notes export fidelity reporting
import type { NotePage } from '../../../shared/contracts/workspace';
import type { NotesExportFormat, NotesExportScope } from './notesImportExport';

function pagesForScope(scope: NotesExportScope): NotePage[] {
  if (scope.kind === 'page') return [scope.page];
  if (scope.kind === 'section') return scope.section.pages.filter((page) => !page.trashedAt);
  return scope.notebook.sections.filter((section) => !section.trashedAt).flatMap((section) => section.pages.filter((page) => !page.trashedAt));
}

export function notesExportFidelityWarnings(scope: NotesExportScope, format: NotesExportFormat): string[] {
  if (format === 'json') return [];
  const pages = pagesForScope(scope);
  const warnings: string[] = [];
  const hasCanvas = pages.some((page) => page.editorMode === 'freeform' || Boolean(page.canvas?.blocks?.length));
  const hasAttachments = pages.some((page) => Boolean(page.attachments?.length));
  const hasComments = pages.some((page) => Boolean(page.comments?.length));
  const hasWorkspaceLinks = pages.some((page) => Boolean(page.workspaceLinks?.length));
  const hasProtection = pages.some((page) => page.protection?.mode && page.protection.mode !== 'none');
  const hasSensitive = pages.some((page) => page.sensitiveMode);

  const hasExactFreeformPagePdf = format === 'pdf' && scope.kind === 'page' && scope.page.editorMode === 'freeform' && Boolean(scope.page.canvas);
  if (hasCanvas && !hasExactFreeformPagePdf) warnings.push('Freeform canvas geometry/blocks are not represented by this text-oriented or multi-page aggregate format. Export the individual freeform page as PDF, or use Structured JSON/encrypted .vnote for full-fidelity preservation.');
  if (hasComments) warnings.push('Comments, replies and author attribution are not represented by this format. Use Structured JSON or encrypted .vnote for full fidelity.');
  if (hasWorkspaceLinks) warnings.push('Canonical cross-app link metadata is not represented by this format, although visible note text remains exportable.');
  if (hasProtection || hasSensitive) warnings.push('Notes protection/sensitive-mode policies are not carried by this non-native format. Exported content is plaintext unless the destination format itself is protected externally.');
  if (hasAttachments && !['markdown-folder'].includes(format)) warnings.push('Attachments are not embedded by this format. Markdown-folder ZIP retains attachment payloads; Structured JSON/.vnote retain the full Notes model.');
  return warnings;
}
