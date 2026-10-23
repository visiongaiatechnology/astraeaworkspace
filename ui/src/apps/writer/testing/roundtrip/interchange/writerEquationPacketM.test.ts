// STATUS: DIAMANT VGT SUPREME — Equation rendering/MathML/OMML/DOCX regression tests
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  equationLatexToMathMl,
  equationLatexToOmml,
  equationMarkupToLatex,
  renderEquationHtml,
} from '../../../../../shared/interoperability/equation';
import { exportDocx, importDocx } from '../../../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../../../platform/interop/zip';

function writerWithEquation(): WorkspaceDocument {
  return {
    schema_version: 1,
    id: 'writer-equation-test',
    title: 'Equation test',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: ['text'],
    objects: {
      text: {
        type: 'TextBlock',
        data: {
          id: 'text',
          paragraphs: [{
            id: 'p1',
            style: { style_name: 'normal', alignment: 'left', line_height: 1.45, space_before: 0, space_after: 4 },
            spans: [{ text: 'Equation follows' }],
          }],
        },
      },
    },
    writerData: {
      pageSetup: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: true, headerText: '', footerText: '',
      },
      tables: [],
      images: [],
      equations: [{
        id: 'eq-1',
        latex: String.raw`x_{i}^{2} = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
        caption: 'Quadratic formula',
        displayMode: true,
        anchorParagraphId: 'p1',
      }],
    },
  };
}

describe('Writer equation engine', () => {
  it('escapes hostile LaTeX instead of emitting active markup', () => {
    const rendered = renderEquationHtml(String.raw`x + <img src=x onerror=alert(1)> + \text{<script>alert(1)</script>}`);
    expect(rendered).not.toContain('<img src=');
    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('&lt;');
  });

  it('roundtrips core structures through MathML and OMML', () => {
    const latex = String.raw`x_{i}^{2}=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
    const mathml = equationLatexToMathMl(latex);
    const omml = equationLatexToOmml(latex);
    expect(equationMarkupToLatex(mathml)).toContain(String.raw`\frac`);
    expect(equationMarkupToLatex(mathml)).toContain(String.raw`x_{i}^{2}`);
    expect(equationMarkupToLatex(omml)).toContain(String.raw`\sqrt`);
    expect(equationMarkupToLatex(omml)).toContain(String.raw`x_{i}^{2}`);
  });

  it('rejects DTD/entity and structurally malformed equation XML', () => {
    expect(() => equationMarkupToLatex('<!DOCTYPE x><math/>')).toThrow();
    expect(() => equationMarkupToLatex('<math><mrow></math>')).toThrow();
    expect(() => equationMarkupToLatex('<math><mrow></mrow>')).toThrow();
  });

  it('exports actual OMML into DOCX and imports it back into Writer equations', async () => {
    const bytes = exportDocx(writerWithEquation());
    const entries = await readZip(bytes);
    const documentXmlBytes = entries.get('word/document.xml');
    expect(documentXmlBytes).toBeDefined();
    const documentXml = decodeUtf8(documentXmlBytes!);
    expect(documentXml).toContain('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"');
    expect(documentXml).toContain('<m:oMathPara>');
    expect(documentXml).toContain('<m:f>');
    expect(documentXml).toContain('vgt:latex=');

    const imported = await importDocx(bytes, 'equation.docx');
    const equation = imported.writerData?.equations?.[0];
    expect(equation?.id).toBe('eq-1');
    expect(equation?.caption).toBe('Quadratic formula');
    expect(equation?.anchorParagraphId).toBe('docx-p-1');
    expect(equation?.latex).toContain(String.raw`\frac`);
    expect(equation?.mathml).toContain('<math');
  });
});
