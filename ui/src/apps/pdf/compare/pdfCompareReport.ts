// STATUS: PLATIN
// Escaped HTML and JSON serialization for PDF comparison results.

import type { PdfCompareResult } from './pdfCompareTypes';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

export function serializePdfCompareReport(result: PdfCompareResult, format: 'json' | 'html'): string {
  if (format === 'json') return JSON.stringify(result, null, 2);
  const rows = result.differences.map((difference) => {
    const location = `${difference.pageBefore ?? '—'} → ${difference.pageAfter ?? '—'}`;
    const details = difference.textDelta
      ? `${difference.textDelta.before.slice(0, 1_000)} → ${difference.textDelta.after.slice(0, 1_000)}`
      : '';
    return `<tr><td>${escapeHtml(difference.kind)}</td><td>${escapeHtml(difference.category)}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(difference.summary)}</td><td>${escapeHtml(details)}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PDF comparison report</title><style>body{font-family:system-ui,sans-serif;margin:2rem;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.45rem;text-align:left;vertical-align:top}th{background:#eee}.summary{display:flex;gap:1rem;flex-wrap:wrap}.summary span{padding:.4rem .7rem;background:#f3f4f6;border-radius:.5rem}</style></head><body><h1>PDF comparison report</h1><p>${escapeHtml(result.sourceTitle)} ↔ ${escapeHtml(result.targetTitle)}</p><div class="summary"><span>Total ${result.summary.total}</span><span>Inserted ${result.summary.inserted}</span><span>Deleted ${result.summary.deleted}</span><span>Changed ${result.summary.changed}</span><span>Moved ${result.summary.moved}</span><span>Pages ${result.summary.pagesTouched}</span></div><h2>Differences</h2><table><thead><tr><th>Kind</th><th>Category</th><th>Page</th><th>Summary</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
