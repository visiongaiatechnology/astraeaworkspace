// STATUS: DIAMANT VGT SUPREME — canonical plain-text boundary for externally supplied values.

export const MAX_UNTRUSTED_TEXT_CHARS = 131_072;

export function projectUntrustedPlainText(value: unknown, maxChars = MAX_UNTRUSTED_TEXT_CHARS): string {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > MAX_UNTRUSTED_TEXT_CHARS) {
    throw new Error('UNTRUSTED_TEXT_LIMIT_REJECTED');
  }
  const text = String(value ?? '').replace(/\0/g, '');
  if (text.length > maxChars) throw new Error('UNTRUSTED_TEXT_TOO_LONG');
  return text;
}

export function projectUntrustedStringArray(values: readonly unknown[], maxItems = 1024, maxChars = 512): string[] {
  if (!Number.isSafeInteger(maxItems) || maxItems < 0 || maxItems > 4096) throw new Error('UNTRUSTED_TEXT_ITEM_LIMIT_REJECTED');
  return values.slice(0, maxItems).map((value) => projectUntrustedPlainText(value, maxChars));
}
