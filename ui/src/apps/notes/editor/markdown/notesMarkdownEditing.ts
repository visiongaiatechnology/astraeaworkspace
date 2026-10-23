// STATUS: DIAMANT VGT SUPREME — deterministic Markdown editing helpers

import { sanitizeRichTextHref } from '../../../../platform/security/richTextLinkSecurity';

export interface MarkdownEditResult { content: string; cursor: number; }

export function continueMarkdownStructure(content: string, cursor: number): MarkdownEditResult | null {
  const safeCursor = Math.max(0, Math.min(content.length, cursor));
  const before = content.slice(0, safeCursor);
  const after = content.slice(safeCursor);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = before.slice(lineStart);
  let prefix = '';
  const checklist = line.match(/^(\s*)- \[([ xX])\] /);
  const bullet = line.match(/^(\s*)[-*+] /);
  const numbered = line.match(/^(\s*)(\d+)\. /);
  const quote = line.match(/^(\s*)> /);
  if (checklist) prefix = `${checklist[1]}- [ ] `;
  else if (numbered) prefix = `${numbered[1]}${Number(numbered[2]) + 1}. `;
  else if (bullet) prefix = `${bullet[1]}- `;
  else if (quote) prefix = `${quote[1]}> `;
  if (!prefix) return null;
  const markerOnly = line.trim() === prefix.trim() || /^- \[[ xX]\] $/.test(line.trimStart()) || /^\d+\. $/.test(line.trimStart()) || /^[-*+] $/.test(line.trimStart()) || /^> $/.test(line.trimStart());
  if (markerOnly) {
    const contentWithoutMarker = content.slice(0, lineStart) + after;
    return { content: contentWithoutMarker, cursor: lineStart };
  }
  const inserted = `\n${prefix}`;
  return { content: before + inserted + after, cursor: safeCursor + inserted.length };
}

export function insertMarkdownTable(rows = 3, columns = 3): string {
  const safeRows = Math.max(2, Math.min(16, Math.round(rows)));
  const safeColumns = Math.max(2, Math.min(12, Math.round(columns)));
  const header = `| ${Array.from({ length: safeColumns }, (_, index) => `Column ${index + 1}`).join(' | ')} |`;
  const separator = `| ${Array.from({ length: safeColumns }, () => '---').join(' | ')} |`;
  const body = Array.from({ length: safeRows - 1 }, () => `| ${Array.from({ length: safeColumns }, () => '').join(' | ')} |`).join('\n');
  return `${header}\n${separator}\n${body}`;
}

export function sanitizeMarkdownHref(raw: string): string | null {
  return sanitizeRichTextHref(raw);
}

export function extractMarkdownFootnotes(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of content.split('\n')) {
    const match = line.match(/^\[\^([^\]]{1,64})\]:\s*(.{0,8192})$/);
    if (match && !out.has(match[1])) out.set(match[1], match[2]);
  }
  return out;
}

export function isMarkdownTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function splitMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).slice(0, 32);
}
