import { PdfAnnotation } from '../../../shared/contracts/workspace';

export interface PdfAnnotatedSegment {
  text: string;
  annotation?: PdfAnnotation;
}

export function buildAnnotationSegments(
  text: string,
  annotations: PdfAnnotation[]
): PdfAnnotatedSegment[] {
  if (!text || annotations.length === 0) return [{ text }];

  const ranges: Array<{ start: number; end: number; annotation: PdfAnnotation }> = [];
  for (const annotation of annotations) {
    const needle = annotation.text.trim();
    if (!needle) continue;
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf(needle, cursor);
      if (start < 0) break;
      ranges.push({ start, end: start + needle.length, annotation });
      cursor = start + Math.max(1, needle.length);
    }
  }

  ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const accepted: typeof ranges = [];
  let coveredUntil = 0;
  for (const range of ranges) {
    if (range.start < coveredUntil) continue;
    accepted.push(range);
    coveredUntil = range.end;
  }
  if (accepted.length === 0) return [{ text }];

  const segments: PdfAnnotatedSegment[] = [];
  let cursor = 0;
  for (const range of accepted) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start) });
    segments.push({ text: text.slice(range.start, range.end), annotation: range.annotation });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
