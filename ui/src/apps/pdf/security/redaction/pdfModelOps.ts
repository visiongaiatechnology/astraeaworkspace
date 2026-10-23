import { PdfDocumentModel, PdfRedaction } from '../../../../shared/contracts/workspace';

export interface PhraseRedactionResult {
  model: PdfDocumentModel;
  redactedCharacters: number;
  occurrences: number;
}

export function redactPhraseInSection(
  model: PdfDocumentModel,
  pageNumber: number,
  sectionId: string,
  selectedText: string,
  reason: string,
  now: number = Date.now()
): PhraseRedactionResult {
  const target = selectedText.trim();
  if (!target) return { model, redactedCharacters: 0, occurrences: 0 };

  let occurrences = 0;
  const pages = model.pages.map((page) => {
    if (page.pageNumber !== pageNumber) return page;
    return {
      ...page,
      sections: page.sections.map((section) => {
        if (section.id !== sectionId || section.isRedacted || !section.content.includes(target)) return section;
        const pieces = section.content.split(target);
        occurrences = Math.max(0, pieces.length - 1);
        if (occurrences === 0) return section;
        return {
          ...section,
          content: pieces.join('[REDACTED]'),
          redactionReason: reason,
        };
      }),
    };
  });

  if (occurrences === 0) return { model, redactedCharacters: 0, occurrences: 0 };

  const redaction: PdfRedaction = {
    id: `redact-${now}`,
    page: pageNumber,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    reason,
    isApplied: true,
    targetText: `[${target.length * occurrences} CHARACTERS REDACTED]`,
    timestamp: now,
  };

  return {
    model: { ...model, pages, redactions: [...model.redactions, redaction] },
    redactedCharacters: target.length * occurrences,
    occurrences,
  };
}
