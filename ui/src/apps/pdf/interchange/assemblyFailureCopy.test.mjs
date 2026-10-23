// STATUS: PLATIN — every assembly refusal has a name and a localized sentence (AST-0814).
//
// Before this pass the assembler showed `cause.message` verbatim: an English domain sentence inside a
// seven-language application, naming no next step. This suite pins the classification, the fallback, the
// seven-language rows, and the wiring at the source. It is `.mjs` because the wiring half reads files, and a
// `.ts` test in this project has no Node types (TS2307) — the same reason the other source contracts are `.mjs`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyPdfAssemblyFailure } from './assemblyFailureCopy';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';
import { WORKSPACE_LOCALES } from '../../../shell/localization/workspaceLocaleTypes';

const LOCALES = [...WORKSPACE_LOCALES];
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

describe('assembly refusals are classified by identity, not by position', () => {
  it('names the four real refusals with the sentence a user can act on', () => {
    expect(classifyPdfAssemblyFailure(new Error('Quelle is a native/raw PDF; structured page transfer requires the standards parser.')).code).toBe('native-source');
    expect(classifyPdfAssemblyFailure(new Error('Ziel would leave form calculation betrag with an unavailable dependency.')).code).toBe('dependency');
    expect(classifyPdfAssemblyFailure(new Error('Merged PDF would exceed the 10,000-page policy.')).code).toBe('page-budget');
    expect(classifyPdfAssemblyFailure(new Error('Merge requires at least two structured PDF documents.')).code).toBe('too-few-sources');
  });

  it('prefers the most specific cause when two patterns could match', () => {
    const both = new Error('Merge requires at least two structured PDF documents; page count is outside the structured page-operation policy.');
    expect(classifyPdfAssemblyFailure(both).code).toBe('too-few-sources');
  });

  it('falls back to a generic, honest sentence and keeps the detail', () => {
    const failure = classifyPdfAssemblyFailure(new Error('some unexpected internal sentence'));
    expect(failure.code).toBe('generic');
    expect(failure.detail).toBe('some unexpected internal sentence');
    expect(failure.copyKey).toBe('merge.failed.generic');
    expect(classifyPdfAssemblyFailure('a bare string').detail).toBe('a bare string');
    expect(classifyPdfAssemblyFailure(undefined).detail).toBe('unknown assembly failure');
  });

  it('does not show the English detail as the primary message', () => {
    for (const sentence of ['Merge requires at least two structured PDF documents.', 'Merged PDF would exceed the 10,000-page policy.']) {
      const failure = classifyPdfAssemblyFailure(new Error(sentence));
      const primary = pdfWorkflowText('de-DE', failure.copyKey);
      expect(primary).not.toContain(sentence);
      expect(primary.length).toBeGreaterThan(20);
    }
  });

  it('has every new string in all seven languages', () => {
    for (const key of ['merge.failed.native-source', 'merge.failed.dependency', 'merge.failed.page-budget', 'merge.failed.too-few-sources', 'merge.failed.generic', 'copy.title', 'copy.none']) {
      const rendered = LOCALES.map((locale) => pdfWorkflowText(locale, key));
      for (const [index, text] of rendered.entries()) {
        // Four characters is the floor for a meaningful sentence in a compact script (CJK); Latin locales are
        // longer, and the "genuinely translated" check below covers the rest.
        expect(text.trim().length, `${key}@${LOCALES[index]}`).toBeGreaterThanOrEqual(4);
      }
      expect(new Set(rendered).size, key).toBeGreaterThan(3);
    }
  });
});

describe('the assembler and the toolbar are wired to the new copy', () => {
  it('shows the classified failure in a role=alert and keeps the domain sentence as detail', () => {
    const assembler = read('./PdfDocumentAssemblerModal.tsx');
    expect(assembler).toContain('classifyPdfAssemblyFailure(cause)');
    expect(assembler).toContain('pdfWorkflowText(locale, failure.copyKey)');
    expect(assembler).toContain('failure.code');
    expect(assembler).toContain('role="alert"');
    // The bare generic sentence must no longer be presented on its own.
    expect(assembler).not.toMatch(/setError\(pdfWorkflowText\(locale, 'assembler\.error'\)\)/u);
    // … and the merge path itself routes through the classifier.
    expect(assembler).toContain('catch (cause) { showFailure(cause); }');
  });

  it('offers the copy action as a disabled-until-selected control with a key hint', () => {
    const toolbar = read('../studio/PdfToolbar.tsx');
    const studio = read('../studio/PdfStudio.tsx');
    expect(toolbar).toContain('data-pdf-action="copy-selection"');
    expect(toolbar).toContain('disabled={hasTextSelection !== true}');
    expect(toolbar).toContain('aria-keyshortcuts="Control+C"');
    expect(toolbar).toContain("pdfWorkflowText(locale, 'copy.none')");
    expect(studio).toContain("window.document.addEventListener('selectionchange'");
    expect(studio).toContain('onCopySelection={() => void handleCopySelection()}');
    expect(studio).toContain('hasTextSelection={hasTextSelection}');
  });
});
