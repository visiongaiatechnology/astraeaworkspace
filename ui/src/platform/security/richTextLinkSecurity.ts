// STATUS: DIAMANT VGT SUPREME — shared rich-text URI policy

export const RICH_TEXT_SECURITY_WARNING_EVENT = 'astraea:rich-text-security-warning' as const;

export type RichTextLinkDecision =
  | { allowed: false; code: 'link-empty' | 'link-control-char' | 'link-too-long' | 'link-invalid' | 'link-credentials-blocked' | 'link-scheme-blocked' }
  | { allowed: true; kind: 'external'; code: 'external-link-warning'; normalizedUrl: string }
  | { allowed: true; kind: 'vgt'; code: 'vgt-deep-link'; normalizedUrl: string };

export function evaluateRichTextLink(raw: string): RichTextLinkDecision {
  const value = raw.trim();
  if (!value) return { allowed: false, code: 'link-empty' };
  if (value.length > 2_048) return { allowed: false, code: 'link-too-long' };
  if (/[\u0000-\u001f\u007f]/u.test(value)) return { allowed: false, code: 'link-control-char' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { allowed: false, code: 'link-invalid' };
  }
  if (parsed.username || parsed.password) return { allowed: false, code: 'link-credentials-blocked' };
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return { allowed: true, kind: 'external', code: 'external-link-warning', normalizedUrl: parsed.toString() };
  }
  if (parsed.protocol === 'vgt:') {
    return { allowed: true, kind: 'vgt', code: 'vgt-deep-link', normalizedUrl: parsed.toString() };
  }
  return { allowed: false, code: 'link-scheme-blocked' };
}

export function sanitizeRichTextHref(raw: string): string | null {
  const decision = evaluateRichTextLink(raw);
  return decision.allowed ? decision.normalizedUrl : null;
}

export function reportRichTextSecurityWarning(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(RICH_TEXT_SECURITY_WARNING_EVENT, { detail: message }));
}

export function warnBeforeExternalRichTextOpen(raw: string): boolean {
  const decision = evaluateRichTextLink(raw);
  if (!decision.allowed) {
    reportRichTextSecurityWarning('Security warning: unsafe or unsupported link was blocked.');
    return false;
  }
  if (decision.kind === 'external') {
    reportRichTextSecurityWarning(`External link: ${new URL(decision.normalizedUrl).hostname}`);
  }
  return true;
}
