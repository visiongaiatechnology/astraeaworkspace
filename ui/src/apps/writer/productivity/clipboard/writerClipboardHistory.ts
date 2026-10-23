// STATUS: DIAMANT VGT SUPREME — Explicit Local-Only Clipboard History
export interface WriterClipboardEntry {
  id: string;
  text: string;
  capturedAt: number;
}

const MAX_ENTRIES = 32;
const MAX_ENTRY_CHARS = 16_384;

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\u0000/gu, '').slice(0, MAX_ENTRY_CHARS);
}

export function normalizeWriterClipboardHistory(entries: readonly WriterClipboardEntry[]): WriterClipboardEntry[] {
  const seen = new Set<string>();
  const result: WriterClipboardEntry[] = [];
  for (const entry of entries) {
    const text = normalizeText(entry.text);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push({ id: String(entry.id).slice(0, 128), text, capturedAt: Number.isFinite(entry.capturedAt) ? entry.capturedAt : 0 });
    if (result.length >= MAX_ENTRIES) break;
  }
  return result;
}

export function addWriterClipboardEntry(entries: readonly WriterClipboardEntry[], text: string, now = Date.now()): WriterClipboardEntry[] {
  const normalized = normalizeText(text);
  if (!normalized) return normalizeWriterClipboardHistory(entries);
  return normalizeWriterClipboardHistory([
    { id: crypto.randomUUID(), text: normalized, capturedAt: now },
    ...entries.filter((entry) => normalizeText(entry.text) !== normalized),
  ]);
}
