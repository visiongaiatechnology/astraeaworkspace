// STATUS: DIAMANT VGT SUPREME — Sovereign Typographic Equation Engine & MathML Transformer

export interface EquationSymbolItem {
  label: string;
  latex: string;
  glyph: string;
  category: 'greek' | 'operator' | 'relation' | 'calculus' | 'structure';
}

export const EQUATION_SYMBOL_PALETTES: EquationSymbolItem[] = [
  // Structures
  { label: 'Bruch', latex: '\\frac{a}{b}', glyph: 'a/b', category: 'structure' },
  { label: 'Quadratwurzel', latex: '\\sqrt{x}', glyph: '√x', category: 'structure' },
  { label: 'n-te Wurzel', latex: '\\sqrt[n]{x}', glyph: 'ⁿ√x', category: 'structure' },
  { label: 'Exponent', latex: 'x^{2}', glyph: 'x²', category: 'structure' },
  { label: 'Index', latex: 'x_{i}', glyph: 'xᵢ', category: 'structure' },
  { label: 'Index & Exponent', latex: 'x_{i}^{2}', glyph: 'xᵢ²', category: 'structure' },

  // Calculus & Large Operators
  { label: 'Summe', latex: '\\sum_{i=0}^{n}', glyph: '∑', category: 'calculus' },
  { label: 'Integral', latex: '\\int_{a}^{b}', glyph: '∫', category: 'calculus' },
  { label: 'Doppelintegral', latex: '\\iint', glyph: '∬', category: 'calculus' },
  { label: 'Produkt', latex: '\\prod_{i=1}^{n}', glyph: '∏', category: 'calculus' },
  { label: 'Limes', latex: '\\lim_{x \\to 0}', glyph: 'lim', category: 'calculus' },
  { label: 'Partiell', latex: '\\partial', glyph: '∂', category: 'calculus' },
  { label: 'Nabla', latex: '\\nabla', glyph: '∇', category: 'calculus' },
  { label: 'Unendlich', latex: '\\infty', glyph: '∞', category: 'calculus' },

  // Greeks
  { label: 'Alpha', latex: '\\alpha', glyph: 'α', category: 'greek' },
  { label: 'Beta', latex: '\\beta', glyph: 'β', category: 'greek' },
  { label: 'Gamma', latex: '\\gamma', glyph: 'γ', category: 'greek' },
  { label: 'Delta', latex: '\\Delta', glyph: 'Δ', category: 'greek' },
  { label: 'Theta', latex: '\\theta', glyph: 'θ', category: 'greek' },
  { label: 'Lambda', latex: '\\lambda', glyph: 'λ', category: 'greek' },
  { label: 'Mu', latex: '\\mu', glyph: 'μ', category: 'greek' },
  { label: 'Pi', latex: '\\pi', glyph: 'π', category: 'greek' },
  { label: 'Sigma', latex: '\\sigma', glyph: 'σ', category: 'greek' },
  { label: 'Großes Sigma', latex: '\\Sigma', glyph: 'Σ', category: 'greek' },
  { label: 'Phi', latex: '\\phi', glyph: 'φ', category: 'greek' },
  { label: 'Omega', latex: '\\omega', glyph: 'ω', category: 'greek' },
  { label: 'Großes Omega', latex: '\\Omega', glyph: 'Ω', category: 'greek' },

  // Operators & Relations
  { label: 'Plusminus', latex: '\\pm', glyph: '±', category: 'operator' },
  { label: 'Malzeichen', latex: '\\cdot', glyph: '·', category: 'operator' },
  { label: 'Kreuz', latex: '\\times', glyph: '×', category: 'operator' },
  { label: 'Geteilt', latex: '\\div', glyph: '÷', category: 'operator' },
  { label: 'Kleiner gleich', latex: '\\leq', glyph: '≤', category: 'relation' },
  { label: 'Größer gleich', latex: '\\geq', glyph: '≥', category: 'relation' },
  { label: 'Ungleich', latex: '\\neq', glyph: '≠', category: 'relation' },
  { label: 'Ungefähr', latex: '\\approx', glyph: '≈', category: 'relation' },
  { label: 'Element von', latex: '\\in', glyph: '∈', category: 'relation' },
  { label: 'Teilmenge', latex: '\\subset', glyph: '⊂', category: 'relation' },
];

export {
  equationLatexToMathMl as latexToMathML,
  equationLatexToOmml as latexToOMML,
  equationMarkupToLatex,
  parseEquationLatex,
  renderEquationHtml as renderLatexTypographicHtml,
} from '../../../../../shared/interoperability/equation';
