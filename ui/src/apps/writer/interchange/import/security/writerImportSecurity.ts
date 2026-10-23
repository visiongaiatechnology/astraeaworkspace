// STATUS: DIAMANT VGT SUPREME — bounded hostile-input budgets for Writer import paths.

export interface WriterImportBudgetOptions {
  maxChars?: number;
  maxOperations?: number;
  maxElapsedMs?: number;
  maxMarkupDepth?: number;
  maxMarkupTokens?: number;
  maxRtfDepth?: number;
  now?: () => number;
}

interface ResolvedWriterImportBudget {
  maxChars: number;
  maxOperations: number;
  maxElapsedMs: number;
  maxMarkupDepth: number;
  maxMarkupTokens: number;
  maxRtfDepth: number;
}

const DEFAULT_IMPORT_BUDGET: ResolvedWriterImportBudget = {
  maxChars: 4_000_000,
  maxOperations: 8_000_000,
  maxElapsedMs: 2_000,
  maxMarkupDepth: 128,
  maxMarkupTokens: 100_000,
  maxRtfDepth: 128,
} as const;

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class WriterImportBudget {
  private readonly now: () => number;
  private readonly startedAt: number;
  private readonly limits: ResolvedWriterImportBudget;
  private operations = 0;

  constructor(options: WriterImportBudgetOptions = {}) {
    this.now = options.now ?? monotonicNow;
    this.startedAt = this.now();
    const { now: _now, ...limitOptions } = options;
    this.limits = { ...DEFAULT_IMPORT_BUDGET, ...limitOptions };
    if (
      this.limits.maxChars <= 0 ||
      this.limits.maxOperations <= 0 ||
      this.limits.maxElapsedMs <= 0 ||
      this.limits.maxMarkupDepth <= 0 ||
      this.limits.maxMarkupTokens <= 0 ||
      this.limits.maxRtfDepth <= 0
    ) {
      throw new Error('Writer import budget must be positive');
    }
  }

  assertSource(content: string, label: string): void {
    if (content.length > this.limits.maxChars) throw new Error(`${label} exceeds Writer text import limit`);
    if (content.includes('\u0000')) throw new Error(`${label} contains NUL bytes`);
    this.checkTime(label);
  }

  tick(label: string, cost = 1): void {
    this.operations += cost;
    if (this.operations > this.limits.maxOperations) throw new Error(`${label} exceeds Writer import operation budget`);
    if ((this.operations & 0xff) === 0) this.checkTime(label);
  }

  assertMarkupStructure(content: string, label: string): void {
    this.assertSource(content, label);
    const htmlWithoutSafeDoctype = content.replace(/^\s*<!doctype\s+html\s*>/iu, '');
    if (/<!DOCTYPE|<!ENTITY/iu.test(htmlWithoutSafeDoctype)) throw new Error(`${label} DTD/entity declarations are rejected`);

    const voidHtmlTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const stack: string[] = [];
    const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?([A-Za-z_][\w.:-]*)(?:\s[^<>]*?)?\s*\/?>/gu;
    let tokens = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(content)) !== null) {
      tokens++;
      if (tokens > this.limits.maxMarkupTokens) throw new Error(`${label} exceeds markup token limit`);
      this.tick(label);
      const raw = match[0];
      const name = match[1]?.toLowerCase();
      if (!name || raw.startsWith('<!--') || raw.startsWith('<?') || raw.startsWith('<!')) continue;
      if (raw.startsWith('</')) {
        const index = stack.lastIndexOf(name);
        if (index >= 0) stack.length = index;
        continue;
      }
      if (raw.endsWith('/>') || voidHtmlTags.has(name)) continue;
      stack.push(name);
      if (stack.length > this.limits.maxMarkupDepth) throw new Error(`${label} exceeds markup nesting limit`);
    }
    this.checkTime(label);
  }

  assertRtfStructure(content: string, label: string): void {
    this.assertSource(content, label);
    let depth = 0;
    let escaped = false;
    for (let index = 0; index < content.length; index++) {
      const char = content[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '{') {
        depth++;
        if (depth > this.limits.maxRtfDepth) throw new Error(`${label} exceeds RTF nesting limit`);
      } else if (char === '}') {
        depth = Math.max(0, depth - 1);
      }
      if ((index & 0x3fff) === 0) this.tick(label, 16_384);
    }
    this.checkTime(label);
  }

  finish(label: string): void {
    this.checkTime(label);
  }

  private checkTime(label: string): void {
    if (this.now() - this.startedAt > this.limits.maxElapsedMs) {
      throw new Error(`${label} exceeds Writer import time budget`);
    }
  }
}

export function createWriterImportBudget(options: WriterImportBudgetOptions = {}): WriterImportBudget {
  return new WriterImportBudget(options);
}
