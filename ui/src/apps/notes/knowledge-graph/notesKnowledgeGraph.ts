// STATUS: DIAMANT VGT SUPREME — stable-ID local knowledge graph core
import type { NoteBlockAnchor, NoteLinkBinding, NoteNotebook, NotePage } from '../../../shared/contracts/workspace';

export const NOTE_MAX_LINKS_PER_PAGE = 512;
export const NOTE_MAX_ALIASES = 64;
export const NOTE_MAX_ALIAS_LENGTH = 160;
export const NOTE_MAX_RELATED = 12;
export const NOTE_MAX_INDEX_TOKENS_PER_PAGE = 4096;

export interface ParsedWikiReference {
  key: string;
  raw: string;
  targetLabel: string;
  anchor: string | null;
  displayLabel: string | null;
  transclusion: boolean;
}

export interface NoteKnowledgePage {
  page: NotePage;
  notebookId: string;
  notebookTitle: string;
  sectionId: string;
  sectionTitle: string;
}

export interface NoteKnowledgeEdge {
  sourcePageId: string;
  targetPageId: string;
  anchor?: string;
  transclusion: boolean;
}

export interface BrokenNoteLink {
  sourcePageId: string;
  rawTarget: string;
  anchor?: string;
}

export interface UnlinkedMention {
  sourcePageId: string;
  targetPageId: string;
  matchedLabel: string;
}

export interface RelatedNoteScore {
  pageId: string;
  score: number;
  sharedTerms: string[];
}

export interface ResolvedKnowledgeReference {
  pageId: string;
  title: string;
  anchor: string | null;
  preview: string;
  transclusion: boolean;
}

export interface NoteKnowledgeIndex {
  pages: NoteKnowledgePage[];
  edges: NoteKnowledgeEdge[];
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
  broken: BrokenNoteLink[];
  orphans: string[];
  unlinkedMentions: UnlinkedMention[];
  referenceCounts: Map<string, { incoming: number; outgoing: number; mentions: number }>;
}

const STOP_WORDS = new Set([
  'the','and','for','with','that','this','from','into','your','you','are','was','were','will','have','has','had','not','but','can','all','any','our','out','use','using','und','der','die','das','ein','eine','einer','eines','mit','von','ist','sind','wird','werden','für','auf','aus','bei','den','dem','des','oder','auch','als','nicht','wir','sie','ich','du','es','im','in','zu','zum','zur',
]);

export function normalizeKnowledgeLabel(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function safeAlias(value: string): string | null {
  const alias = value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, NOTE_MAX_ALIAS_LENGTH);
  return alias ? alias : null;
}

export function sanitizeNoteAliases(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.slice(0, NOTE_MAX_ALIASES * 2)) {
    const alias = safeAlias(value);
    if (!alias) continue;
    const key = normalizeKnowledgeLabel(alias);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
    if (out.length >= NOTE_MAX_ALIASES) break;
  }
  return out;
}

function splitReferenceBody(body: string): { targetLabel: string; anchor: string | null; displayLabel: string | null } {
  const [targetPart, ...displayParts] = body.split('|');
  const displayLabel = displayParts.length ? displayParts.join('|').trim().slice(0, 256) || null : null;
  const hashIndex = targetPart.indexOf('#');
  const targetLabel = (hashIndex >= 0 ? targetPart.slice(0, hashIndex) : targetPart).trim().slice(0, 256);
  const anchorRaw = hashIndex >= 0 ? targetPart.slice(hashIndex + 1).trim() : '';
  const anchor = anchorRaw ? anchorRaw.slice(0, 128) : null;
  return { targetLabel, anchor, displayLabel };
}

export function parseWikiReferences(content: string): ParsedWikiReference[] {
  const refs: ParsedWikiReference[] = [];
  const regex = /(!)?\[\[([^\]\n]{1,768})\]\]/g;
  let match: RegExpExecArray | null;
  let ordinal = 0;
  while ((match = regex.exec(content)) !== null && refs.length < NOTE_MAX_LINKS_PER_PAGE) {
    const body = splitReferenceBody(match[2]);
    if (!body.targetLabel && !body.anchor) continue;
    refs.push({
      key: `${normalizeKnowledgeLabel(body.targetLabel)}#${normalizeKnowledgeLabel(body.anchor ?? '')}:${ordinal++}`,
      raw: match[0],
      targetLabel: body.targetLabel,
      anchor: body.anchor,
      displayLabel: body.displayLabel,
      transclusion: Boolean(match[1]),
    });
  }
  return refs;
}

export function collectKnowledgePages(notebooks: readonly NoteNotebook[]): NoteKnowledgePage[] {
  const out: NoteKnowledgePage[] = [];
  for (const notebook of notebooks) {
    if (notebook.trashedAt) continue;
    for (const section of notebook.sections) {
      if (section.trashedAt) continue;
      for (const page of section.pages) {
        if (page.trashedAt) continue;
        out.push({ page, notebookId: notebook.id, notebookTitle: notebook.title, sectionId: section.id, sectionTitle: section.title });
      }
    }
  }
  return out;
}

function pageLabels(page: NotePage): string[] {
  return [page.title, ...(page.aliases ?? [])].map(normalizeKnowledgeLabel).filter(Boolean);
}

export function findPageByKnowledgeLabel(pages: readonly NoteKnowledgePage[], label: string): NoteKnowledgePage | null {
  const key = normalizeKnowledgeLabel(label);
  if (!key) return null;
  const exactId = pages.find((item) => item.page.id === label);
  if (exactId) return exactId;
  const matches = pages.filter((item) => pageLabels(item.page).includes(key));
  return matches.length === 1 ? matches[0] : null;
}

function bindingSignature(ref: ParsedWikiReference): string {
  return `${normalizeKnowledgeLabel(ref.targetLabel)}#${normalizeKnowledgeLabel(ref.anchor ?? '')}|${ref.transclusion ? 't' : 'l'}`;
}

function bindingSignatureFromBinding(binding: NoteLinkBinding): string {
  return `${normalizeKnowledgeLabel(binding.rawTarget)}#${normalizeKnowledgeLabel(binding.targetAnchor ?? '')}|${binding.transclusion ? 't' : 'l'}`;
}

export function reconcilePageLinkBindings(page: NotePage, pages: readonly NoteKnowledgePage[], now = Date.now()): NoteLinkBinding[] {
  const existing = new Map<string, NoteLinkBinding[]>();
  for (const binding of page.linkBindings ?? []) {
    const key = bindingSignatureFromBinding(binding);
    const list = existing.get(key) ?? [];
    list.push(binding);
    existing.set(key, list);
  }
  const refs = parseWikiReferences(page.content);
  const next: NoteLinkBinding[] = [];
  for (const ref of refs) {
    const signature = bindingSignature(ref);
    const candidates = existing.get(signature) ?? [];
    const previous = candidates.shift();
    const previousTarget = previous?.targetPageId ? pages.find((item) => item.page.id === previous.targetPageId) : null;
    const resolved = previousTarget ?? (ref.targetLabel ? findPageByKnowledgeLabel(pages, ref.targetLabel) : pages.find((item) => item.page.id === page.id) ?? null);
    next.push({
      key: ref.key,
      rawTarget: ref.targetLabel,
      targetPageId: resolved?.page.id,
      targetAnchor: ref.anchor ?? undefined,
      transclusion: ref.transclusion,
      updatedAt: now,
    });
  }
  return next.slice(0, NOTE_MAX_LINKS_PER_PAGE);
}

export function resolvedOutgoingPageIds(page: NotePage): string[] {
  return Array.from(new Set((page.linkBindings ?? []).map((binding) => binding.targetPageId).filter((value): value is string => Boolean(value) && value !== page.id)));
}

export function extractBlockAnchors(page: NotePage): NoteBlockAnchor[] {
  const anchors: NoteBlockAnchor[] = [];
  const seen = new Set<string>();
  const lines = page.content.split('\n').slice(0, 20_000);
  const push = (anchor: NoteBlockAnchor) => {
    const key = normalizeKnowledgeLabel(anchor.id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    anchors.push(anchor);
  };
  lines.forEach((line, index) => {
    const explicit = line.match(/(?:^|\s)\^([A-Za-z0-9_-]{1,64})\s*$/);
    if (explicit) push({ id: explicit[1], label: explicit[1], source: 'explicit', line: index });
    const heading = line.match(/^#{1,6}\s+(.{1,256})$/);
    if (heading) {
      const slug = heading[1].normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/[\s_]+/g, '-').slice(0, 96);
      if (slug) push({ id: slug, label: heading[1].trim(), source: 'heading', line: index });
    }
  });
  for (const block of page.canvas?.blocks ?? []) push({ id: `block-${block.id}`, label: block.kind, source: 'canvas', blockId: block.id });
  return anchors.slice(0, 1024);
}

export function resolveBlockAnchor(page: NotePage, anchor: string): NoteBlockAnchor | null {
  const key = normalizeKnowledgeLabel(anchor.replace(/^#/, ''));
  return extractBlockAnchors(page).find((candidate) => normalizeKnowledgeLabel(candidate.id) === key) ?? null;
}

export function previewPageAnchor(page: NotePage, anchor?: string | null, maxLength = 280): string {
  if (anchor) {
    const resolved = resolveBlockAnchor(page, anchor);
    if (resolved?.source === 'canvas' && resolved.blockId) {
      const block = page.canvas?.blocks.find((candidate) => candidate.id === resolved.blockId);
      if (block) {
        if (block.kind === 'text') return block.text.slice(0, maxLength);
        if (block.kind === 'list') return block.items.join(' · ').slice(0, maxLength);
        if (block.kind === 'toggle') return `${block.title}: ${block.text}`.slice(0, maxLength);
        return `[${block.kind} block]`;
      }
    }
    if (typeof resolved?.line === 'number') {
      const lines = page.content.split('\n');
      return lines.slice(resolved.line, resolved.line + 4).join('\n').replace(/\s+\^[-\w]+\s*$/, '').slice(0, maxLength);
    }
  }
  return page.content.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function uniquePush(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

export function buildKnowledgeIndex(notebooks: readonly NoteNotebook[]): NoteKnowledgeIndex {
  const pages = collectKnowledgePages(notebooks);
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const edges: NoteKnowledgeEdge[] = [];
  const broken: BrokenNoteLink[] = [];

  for (const source of pages) {
    const bindings = reconcilePageLinkBindings(source.page, pages, source.page.last_modified || Date.now());
    for (const binding of bindings) {
      if (!binding.targetPageId) {
        broken.push({ sourcePageId: source.page.id, rawTarget: binding.rawTarget, anchor: binding.targetAnchor });
        continue;
      }
      if (binding.targetAnchor) {
        const target = pages.find((item) => item.page.id === binding.targetPageId);
        if (!target || !resolveBlockAnchor(target.page, binding.targetAnchor)) {
          broken.push({ sourcePageId: source.page.id, rawTarget: binding.rawTarget, anchor: binding.targetAnchor });
          continue;
        }
      }
      edges.push({ sourcePageId: source.page.id, targetPageId: binding.targetPageId, anchor: binding.targetAnchor, transclusion: Boolean(binding.transclusion) });
      uniquePush(outgoing, source.page.id, binding.targetPageId);
      uniquePush(incoming, binding.targetPageId, source.page.id);
    }
  }

  const unlinkedMentions: UnlinkedMention[] = [];
  for (const source of pages) {
    const text = normalizeKnowledgeLabel(source.page.content.replace(/!?\[\[[^\]]+\]\]/g, ' '));
    if (!text) continue;
    const linked = new Set(outgoing.get(source.page.id) ?? []);
    for (const target of pages) {
      if (source.page.id === target.page.id || linked.has(target.page.id)) continue;
      const labels = [target.page.title, ...(target.page.aliases ?? [])].map((label) => label.trim()).filter((label) => label.length >= 3);
      const match = labels.find((label) => text.includes(normalizeKnowledgeLabel(label)));
      if (match) unlinkedMentions.push({ sourcePageId: source.page.id, targetPageId: target.page.id, matchedLabel: match });
      if (unlinkedMentions.length >= 4096) break;
    }
    if (unlinkedMentions.length >= 4096) break;
  }

  const orphans = pages.filter((item) => !(incoming.get(item.page.id)?.length) && !(outgoing.get(item.page.id)?.length)).map((item) => item.page.id);
  const referenceCounts = new Map<string, { incoming: number; outgoing: number; mentions: number }>();
  for (const item of pages) {
    referenceCounts.set(item.page.id, {
      incoming: incoming.get(item.page.id)?.length ?? 0,
      outgoing: outgoing.get(item.page.id)?.length ?? 0,
      mentions: unlinkedMentions.filter((mention) => mention.targetPageId === item.page.id).length,
    });
  }
  return { pages, edges, incoming, outgoing, broken, orphans, unlinkedMentions, referenceCounts };
}

function tokenizeForRelated(page: NotePage): Map<string, number> {
  const raw = `${page.title} ${(page.aliases ?? []).join(' ')} ${page.tags.join(' ')} ${page.content}`.normalize('NFKC').toLocaleLowerCase();
  const counts = new Map<string, number>();
  const tokens = raw.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,48}/gu) ?? [];
  for (const token of tokens.slice(0, NOTE_MAX_INDEX_TOKENS_PER_PAGE)) {
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, Math.min(16, (counts.get(token) ?? 0) + 1));
  }
  return counts;
}

export function suggestRelatedNotes(pageId: string, notebooks: readonly NoteNotebook[], maxResults = NOTE_MAX_RELATED): RelatedNoteScore[] {
  const pages = collectKnowledgePages(notebooks);
  const source = pages.find((item) => item.page.id === pageId);
  if (!source) return [];
  const sourceTerms = tokenizeForRelated(source.page);
  if (!sourceTerms.size) return [];
  const scored: RelatedNoteScore[] = [];
  for (const candidate of pages) {
    if (candidate.page.id === pageId) continue;
    const terms = tokenizeForRelated(candidate.page);
    const shared: Array<[string, number]> = [];
    let dot = 0;
    let sourceNorm = 0;
    let targetNorm = 0;
    for (const value of sourceTerms.values()) sourceNorm += value * value;
    for (const value of terms.values()) targetNorm += value * value;
    for (const [term, sourceCount] of sourceTerms) {
      const candidateCount = terms.get(term) ?? 0;
      if (candidateCount) {
        dot += sourceCount * candidateCount;
        shared.push([term, sourceCount * candidateCount]);
      }
    }
    const score = sourceNorm && targetNorm ? dot / Math.sqrt(sourceNorm * targetNorm) : 0;
    if (score > 0.02) scored.push({ pageId: candidate.page.id, score, sharedTerms: shared.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([term]) => term) });
  }
  return scored.sort((a, b) => b.score - a.score || a.pageId.localeCompare(b.pageId)).slice(0, Math.max(1, Math.min(NOTE_MAX_RELATED, maxResults)));
}

export function resolveKnowledgeTarget(
  sourcePage: NotePage,
  rawTarget: string,
  notebooks: readonly NoteNotebook[],
  anchor?: string | null,
): { page: NotePage; anchor: NoteBlockAnchor | null } | null {
  const pages = collectKnowledgePages(notebooks);
  const normalized = normalizeKnowledgeLabel(rawTarget);
  const existing = (sourcePage.linkBindings ?? []).find((binding) => normalizeKnowledgeLabel(binding.rawTarget) === normalized && normalizeKnowledgeLabel(binding.targetAnchor ?? '') === normalizeKnowledgeLabel(anchor ?? ''));
  const target = existing?.targetPageId ? pages.find((item) => item.page.id === existing.targetPageId) : findPageByKnowledgeLabel(pages, rawTarget);
  if (!target) return null;
  return { page: target.page, anchor: anchor ? resolveBlockAnchor(target.page, anchor) : null };
}


export function reconcileKnowledgeNotebooks(notebooks: readonly NoteNotebook[], now = Date.now()): NoteNotebook[] {
  const pages = collectKnowledgePages(notebooks);
  return notebooks.map((notebook) => ({
    ...notebook,
    sections: notebook.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => {
        if (page.trashedAt) return page;
        const aliases = sanitizeNoteAliases(page.aliases ?? []);
        const normalizedPage = { ...page, aliases };
        const linkBindings = reconcilePageLinkBindings(normalizedPage, pages, now);
        const backlinks = Array.from(new Set(linkBindings
          .map((binding) => binding.targetPageId)
          .filter((value): value is string => Boolean(value) && value !== page.id)));
        return { ...normalizedPage, linkBindings, backlinks };
      }),
    })),
  }));
}

export function resolveParsedKnowledgeReference(
  sourcePage: NotePage,
  reference: Pick<ParsedWikiReference, 'targetLabel' | 'anchor' | 'transclusion'>,
  notebooks: readonly NoteNotebook[],
): ResolvedKnowledgeReference | null {
  const pages = collectKnowledgePages(notebooks);
  const normalized = normalizeKnowledgeLabel(reference.targetLabel);
  const existing = (sourcePage.linkBindings ?? []).find((binding) =>
    normalizeKnowledgeLabel(binding.rawTarget) === normalized
    && normalizeKnowledgeLabel(binding.targetAnchor ?? '') === normalizeKnowledgeLabel(reference.anchor ?? '')
    && Boolean(binding.transclusion) === Boolean(reference.transclusion));
  const target = reference.targetLabel.trim() === ''
    ? pages.find((item) => item.page.id === sourcePage.id)
    : existing?.targetPageId
      ? pages.find((item) => item.page.id === existing.targetPageId)
      : findPageByKnowledgeLabel(pages, reference.targetLabel);
  if (!target) return null;
  if (reference.anchor && !resolveBlockAnchor(target.page, reference.anchor)) return null;
  return {
    pageId: target.page.id,
    title: target.page.title,
    anchor: reference.anchor,
    preview: previewPageAnchor(target.page, reference.anchor, reference.transclusion ? 1200 : 280),
    transclusion: Boolean(reference.transclusion),
  };
}
