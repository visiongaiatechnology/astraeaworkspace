// STATUS: PLATIN
// Compare-pane scroll position projection.

export function computeSynchronizedScrollTop(sourceScrollTop: number, sourceScrollHeight: number, sourceClientHeight: number, targetScrollHeight: number, targetClientHeight: number): number {
  const sourceRange = Math.max(1, sourceScrollHeight - sourceClientHeight);
  const targetRange = Math.max(0, targetScrollHeight - targetClientHeight);
  const ratio = Math.min(1, Math.max(0, sourceScrollTop / sourceRange));
  return ratio * targetRange;
}
