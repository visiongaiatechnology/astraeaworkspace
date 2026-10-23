// STATUS: DIAMANT VGT SUPREME — Bounded Writer tab-stop domain engine
import type {
  WriterTabAlignment,
  WriterTabLeader,
  WriterTabStop,
} from '../../../../shared/contracts/workspace';

export const WRITER_MAX_TAB_STOPS = 32;
export const WRITER_DEFAULT_TAB_INTERVAL_MM = 12.7;
const WRITER_MAX_TAB_POSITION_MM = 500;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/iu;
const ALIGNMENTS = new Set<WriterTabAlignment>(['left', 'right', 'center', 'decimal']);
const LEADERS = new Set<WriterTabLeader>(['none', 'dots', 'dashes', 'underline']);

const clampFinite = (value: number, minimum: number, maximum: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;

export function normalizeWriterTabStops(stops: readonly WriterTabStop[] | undefined): WriterTabStop[] {
  const normalized = (stops ?? []).slice(0, WRITER_MAX_TAB_STOPS).map((stop, index) => {
    const positionMm = Math.round(clampFinite(
      stop.positionMm,
      1,
      WRITER_MAX_TAB_POSITION_MM,
      (index + 1) * WRITER_DEFAULT_TAB_INTERVAL_MM,
    ) * 100) / 100;
    const alignment = ALIGNMENTS.has(stop.alignment) ? stop.alignment : 'left';
    return {
      id: SAFE_ID.test(stop.id) ? stop.id : `tab-${index + 1}-${Math.round(positionMm * 100)}`,
      positionMm,
      alignment,
      leader: LEADERS.has(stop.leader) ? stop.leader : 'none',
      ...(alignment === 'decimal'
        ? { decimalCharacter: stop.decimalCharacter === ',' ? ',' as const : '.' as const }
        : {}),
    };
  });
  normalized.sort((left, right) => left.positionMm - right.positionMm || left.id.localeCompare(right.id));
  const unique = new Map<number, WriterTabStop>();
  for (const stop of normalized) unique.set(Math.round(stop.positionMm * 100), stop);
  return [...unique.values()];
}

export function createWriterTabStop(positionMm: number): WriterTabStop {
  const safePosition = Math.round(clampFinite(positionMm, 1, WRITER_MAX_TAB_POSITION_MM, 25) * 100) / 100;
  return {
    id: `tab-${crypto.randomUUID()}`,
    positionMm: safePosition,
    alignment: 'left',
    leader: 'none',
  };
}

export function insertWriterTabAtRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; caret: number } {
  const start = Math.min(text.length, Math.max(0, Math.trunc(Math.min(selectionStart, selectionEnd))));
  const end = Math.min(text.length, Math.max(start, Math.trunc(Math.max(selectionStart, selectionEnd))));
  return { text: `${text.slice(0, start)}\t${text.slice(end)}`, caret: start + 1 };
}

export interface WriterTabLayoutSegment {
  text: string;
  positionMm: number;
  alignment: WriterTabAlignment;
  leader: WriterTabLeader;
  decimalCharacter: '.' | ',';
}

export function layoutWriterTabbedLine(
  line: string,
  stops: readonly WriterTabStop[] | undefined,
): WriterTabLayoutSegment[] {
  const normalized = normalizeWriterTabStops(stops);
  return line.split('\t').map((text, index) => {
    if (index === 0) {
      return { text, positionMm: 0, alignment: 'left', leader: 'none', decimalCharacter: '.' };
    }
    const configured = normalized[index - 1];
    const fallbackBase = normalized.at(-1)?.positionMm ?? 0;
    const fallbackPosition = fallbackBase +
      Math.max(1, index - normalized.length) * WRITER_DEFAULT_TAB_INTERVAL_MM;
    return configured
      ? {
          text,
          positionMm: configured.positionMm,
          alignment: configured.alignment,
          leader: configured.leader,
          decimalCharacter: configured.decimalCharacter ?? '.',
        }
      : {
          text,
          positionMm: fallbackPosition,
          alignment: 'left',
          leader: 'none',
          decimalCharacter: '.',
        };
  });
}

export function writerTabLeaderCharacters(leader: WriterTabLeader, count: number): string {
  const character = leader === 'dots' ? '.' : leader === 'dashes' ? '-' : leader === 'underline' ? '_' : '';
  return character.repeat(Math.max(0, Math.min(256, Math.trunc(count))));
}
