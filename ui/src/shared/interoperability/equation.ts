// STATUS: DIAMANT VGT SUPREME — Bounded structured equation AST with safe HTML, MathML & OMML interop

const MAX_LATEX_CHARS = 16_384;
const MAX_XML_CHARS = 262_144;
const MAX_AST_NODES = 4_096;
const MAX_DEPTH = 32;

export type EquationNode =
  | { kind: 'row'; children: EquationNode[] }
  | { kind: 'identifier'; value: string }
  | { kind: 'number'; value: string }
  | { kind: 'operator'; value: string }
  | { kind: 'fraction'; numerator: EquationNode; denominator: EquationNode }
  | { kind: 'root'; radicand: EquationNode; index?: EquationNode }
  | { kind: 'script'; base: EquationNode; sub?: EquationNode; sup?: EquationNode };

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Delta: 'Δ', Gamma: 'Γ', Theta: 'Θ',
  Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const SYMBOLS: Record<string, string> = {
  pm: '±', mp: '∓', cdot: '·', times: '×', div: '÷', leq: '≤', geq: '≥', neq: '≠', approx: '≈',
  equiv: '≡', infty: '∞', partial: '∂', nabla: '∇', to: '→', leftarrow: '←', rightarrow: '→',
  Leftarrow: '⇐', Rightarrow: '⇒', iff: '⟺', in: '∈', notin: '∉', subset: '⊂', supset: '⊃',
  cup: '∪', cap: '∩', sum: '∑', prod: '∏', int: '∫', iint: '∬', lim: 'lim',
};
const REVERSE_SYMBOLS = new Map<string, string>([
  ...Object.entries(GREEK).map(([command, glyph]) => [glyph, `\\${command}`] as const),
  ...Object.entries(SYMBOLS).map(([command, glyph]) => [glyph, `\\${command}`] as const),
]);

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

class LatexParser {
  private index = 0;
  private nodes = 0;
  constructor(private readonly input: string) {}

  parse(): EquationNode { return this.parseRow(undefined, 0); }

  private count<T extends EquationNode>(node: T): T {
    this.nodes += 1;
    if (this.nodes > MAX_AST_NODES) throw new Error('Gleichung überschreitet das Struktur-Limit.');
    return node;
  }

  private parseRow(stop: string | undefined, depth: number): EquationNode {
    if (depth > MAX_DEPTH) throw new Error('Gleichung ist zu tief verschachtelt.');
    const children: EquationNode[] = [];
    let closed = stop === undefined;
    while (this.index < this.input.length) {
      if (stop && this.input[this.index] === stop) { this.index += 1; closed = true; break; }
      if (/\s/u.test(this.input[this.index]!)) { this.index += 1; continue; }
      let base = this.parseAtom(depth + 1);
      let sub: EquationNode | undefined;
      let sup: EquationNode | undefined;
      while (this.input[this.index] === '_' || this.input[this.index] === '^') {
        const marker = this.input[this.index++];
        const value = this.parseScriptArgument(depth + 1);
        if (marker === '_') sub = value; else sup = value;
      }
      if (sub || sup) base = this.count({ kind: 'script', base, sub, sup });
      children.push(base);
    }
    if (!closed) throw new Error(`Formelstruktur erwartet ein schließendes ${stop}.`);
    return this.count({ kind: 'row', children });
  }

  private parseScriptArgument(depth: number): EquationNode {
    if (this.input[this.index] === '{') { this.index += 1; return this.parseRow('}', depth); }
    return this.parseAtom(depth);
  }

  private requiredGroup(depth: number): EquationNode {
    if (this.input[this.index] !== '{') throw new Error('Formelstruktur erwartet eine geschweifte Gruppe.');
    this.index += 1;
    return this.parseRow('}', depth);
  }

  private optionalIndex(depth: number): EquationNode | undefined {
    if (this.input[this.index] !== '[') return undefined;
    this.index += 1;
    return this.parseRow(']', depth);
  }

  private parseAtom(depth: number): EquationNode {
    if (depth > MAX_DEPTH) throw new Error('Gleichung ist zu tief verschachtelt.');
    const current = this.input[this.index];
    if (current === '{') { this.index += 1; return this.parseRow('}', depth); }
    if (current === '\\') {
      this.index += 1;
      const commandMatch = /^[A-Za-z]+/u.exec(this.input.slice(this.index));
      const command = commandMatch?.[0] ?? this.input[this.index] ?? '';
      this.index += command.length;
      if (command === 'frac') return this.count({ kind: 'fraction', numerator: this.requiredGroup(depth + 1), denominator: this.requiredGroup(depth + 1) });
      if (command === 'sqrt') return this.count({ kind: 'root', index: this.optionalIndex(depth + 1), radicand: this.requiredGroup(depth + 1) });
      if (command === 'text') return this.requiredGroup(depth + 1);
      if (GREEK[command]) return this.count({ kind: 'identifier', value: GREEK[command] });
      if (SYMBOLS[command]) return this.count({ kind: 'operator', value: SYMBOLS[command] });
      return this.count({ kind: 'identifier', value: command ? `\\${command}` : '\\' });
    }
    if (current && /[0-9]/u.test(current)) {
      const match = /^[0-9]+(?:[.,][0-9]+)?/u.exec(this.input.slice(this.index))?.[0] ?? current;
      this.index += match.length;
      return this.count({ kind: 'number', value: match });
    }
    if (current && /[\p{L}]/u.test(current)) {
      const match = /^[\p{L}]+/u.exec(this.input.slice(this.index))?.[0] ?? current;
      this.index += match.length;
      return this.count({ kind: 'identifier', value: match });
    }
    this.index += 1;
    return this.count({ kind: 'operator', value: current ?? '' });
  }
}

export function parseEquationLatex(latex: string): EquationNode {
  const normalized = latex.normalize('NFKC').slice(0, MAX_LATEX_CHARS);
  return new LatexParser(normalized).parse();
}

function htmlNode(node: EquationNode): string {
  switch (node.kind) {
    case 'row': return node.children.map(htmlNode).join('');
    case 'identifier': return `<span class="italic font-serif">${escapeHtml(node.value)}</span>`;
    case 'number': return `<span class="font-serif">${escapeHtml(node.value)}</span>`;
    case 'operator': return `<span class="mx-1 font-serif">${escapeHtml(node.value)}</span>`;
    case 'fraction': return `<span class="inline-flex flex-col items-center align-middle mx-1 text-center"><span class="border-b border-current px-1 text-[0.9em] leading-tight pb-0.5">${htmlNode(node.numerator)}</span><span class="px-1 text-[0.9em] leading-tight pt-0.5">${htmlNode(node.denominator)}</span></span>`;
    case 'root': return `<span class="inline-flex items-start align-middle mx-1">${node.index ? `<sup class="text-[0.6em] mr-[-0.15em] mt-[-0.15em]">${htmlNode(node.index)}</sup>` : ''}<span class="text-xl leading-none">√</span><span class="border-t border-current px-1">${htmlNode(node.radicand)}</span></span>`;
    case 'script': return `<span class="inline-flex items-baseline">${htmlNode(node.base)}${node.sub ? `<sub class="text-[0.7em]">${htmlNode(node.sub)}</sub>` : ''}${node.sup ? `<sup class="text-[0.7em]">${htmlNode(node.sup)}</sup>` : ''}</span>`;
  }
}

export function renderEquationHtml(latex: string): string {
  if (!latex.trim()) return '<span class="italic text-slate-500 font-serif">Leere Gleichung</span>';
  return `<div class="inline-block font-serif text-lg tracking-wide select-all text-slate-100">${htmlNode(parseEquationLatex(latex))}</div>`;
}

function mathMlNode(node: EquationNode): string {
  switch (node.kind) {
    case 'row': return `<mrow>${node.children.map(mathMlNode).join('')}</mrow>`;
    case 'identifier': return `<mi>${escapeXml(node.value)}</mi>`;
    case 'number': return `<mn>${escapeXml(node.value)}</mn>`;
    case 'operator': return `<mo>${escapeXml(node.value)}</mo>`;
    case 'fraction': return `<mfrac>${mathMlNode(node.numerator)}${mathMlNode(node.denominator)}</mfrac>`;
    case 'root': return node.index ? `<mroot>${mathMlNode(node.radicand)}${mathMlNode(node.index)}</mroot>` : `<msqrt>${mathMlNode(node.radicand)}</msqrt>`;
    case 'script':
      if (node.sub && node.sup) return `<msubsup>${mathMlNode(node.base)}${mathMlNode(node.sub)}${mathMlNode(node.sup)}</msubsup>`;
      if (node.sub) return `<msub>${mathMlNode(node.base)}${mathMlNode(node.sub)}</msub>`;
      return `<msup>${mathMlNode(node.base)}${mathMlNode(node.sup ?? { kind: 'row', children: [] })}</msup>`;
  }
}

export function equationLatexToMathMl(latex: string, displayMode = true): string {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${displayMode ? 'block' : 'inline'}">${mathMlNode(parseEquationLatex(latex))}</math>`;
}

function ommlNode(node: EquationNode): string {
  switch (node.kind) {
    case 'row': return node.children.map(ommlNode).join('');
    case 'identifier': case 'number': case 'operator': return `<m:r><m:t>${escapeXml(node.value)}</m:t></m:r>`;
    case 'fraction': return `<m:f><m:num>${ommlNode(node.numerator)}</m:num><m:den>${ommlNode(node.denominator)}</m:den></m:f>`;
    case 'root': return `<m:rad><m:radPr>${node.index ? '' : '<m:degHide m:val="1"/>'}</m:radPr>${node.index ? `<m:deg>${ommlNode(node.index)}</m:deg>` : ''}<m:e>${ommlNode(node.radicand)}</m:e></m:rad>`;
    case 'script':
      if (node.sub && node.sup) return `<m:sSubSup><m:e>${ommlNode(node.base)}</m:e><m:sub>${ommlNode(node.sub)}</m:sub><m:sup>${ommlNode(node.sup)}</m:sup></m:sSubSup>`;
      if (node.sub) return `<m:sSub><m:e>${ommlNode(node.base)}</m:e><m:sub>${ommlNode(node.sub)}</m:sub></m:sSub>`;
      return `<m:sSup><m:e>${ommlNode(node.base)}</m:e><m:sup>${ommlNode(node.sup ?? { kind: 'row', children: [] })}</m:sup></m:sSup>`;
  }
}

export function equationLatexToOmml(latex: string): string {
  return `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlNode(parseEquationLatex(latex))}</m:oMath>`;
}

interface XmlNode { name: string; children: XmlNode[]; text: string; }
function localName(name: string): string { return name.split(':').at(-1) ?? name; }
const INVALID_XML_CHARACTER_REFERENCE = 'Formel-XML enthält eine ungültige Zeichenreferenz.';

function decodeXmlCodePoint(value: string, radix: 10 | 16): string {
  const codePoint = Number.parseInt(value, radix);
  const isXmlCharacter = Number.isInteger(codePoint) && (
    codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
  if (!isXmlCharacter) throw new Error(INVALID_XML_CHARACTER_REFERENCE);
  return String.fromCodePoint(codePoint);
}

function decodeXmlText(text: string): string {
  return text.replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => decodeXmlCodePoint(hex, 16))
    .replace(/&#([0-9]+);/gu, (_, dec: string) => decodeXmlCodePoint(dec, 10))
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&amp;/gu, '&');
}
function parseEquationXml(xml: string): XmlNode {
  if (xml.length > MAX_XML_CHARS) throw new Error('Formel-XML überschreitet das Größenlimit.');
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error('DTD/Entities sind in Formel-XML nicht erlaubt.');
  const root: XmlNode = { name: '#root', children: [], text: '' };
  const stack: XmlNode[] = [root];
  let nodes = 0;
  const tokens = xml.match(/<[^>]+>|[^<]+/gu) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      if (stack.length <= 1) throw new Error('Formel-XML enthält ein unerwartetes schließendes Element.');
      const closingName = /^<\/\s*([^\s>]+)/u.exec(token)?.[1];
      const current = stack.at(-1);
      if (!closingName || !current || closingName !== current.name) throw new Error('Formel-XML enthält nicht passende Elementgrenzen.');
      stack.pop();
      continue;
    }
    if (token.startsWith('<!')) throw new Error('Deklarationen sind in Formel-XML nicht erlaubt.');
    if (token.startsWith('<')) {
      const name = /^<\s*([^\s/>]+)/u.exec(token)?.[1];
      if (!name) continue;
      const node: XmlNode = { name, children: [], text: '' };
      stack.at(-1)!.children.push(node);
      nodes += 1;
      if (nodes > MAX_AST_NODES) throw new Error('Formel-XML überschreitet das Struktur-Limit.');
      if (!/\/\s*>$/u.test(token)) {
        if (stack.length >= MAX_DEPTH) throw new Error('Formel-XML ist zu tief verschachtelt.');
        stack.push(node);
      }
      continue;
    }
    stack.at(-1)!.text += decodeXmlText(token);
  }
  if (stack.length !== 1) throw new Error('Formel-XML enthält nicht geschlossene Elemente.');
  if (root.children.length !== 1) throw new Error('Formel-XML muss genau ein Wurzelelement enthalten.');
  const result = root.children[0];
  if (!result) throw new Error('Formel-XML enthält kein Wurzelelement.');
  return result;
}
function xmlChild(node: XmlNode, name: string): XmlNode | undefined { return node.children.find((child) => localName(child.name) === name); }
function xmlText(node: XmlNode): string { return `${node.text}${node.children.map(xmlText).join('')}`.trim(); }
function joinedLatex(node: XmlNode): string { return node.children.map(xmlNodeToLatex).join(''); }
function braced(value: string): string { return `{${value}}`; }
function glyphToLatex(value: string): string { return [...value].map((character) => REVERSE_SYMBOLS.get(character) ?? character).join(''); }

function xmlNodeToLatex(node: XmlNode): string {
  const name = localName(node.name);
  if (['math', 'mrow', 'semantics', 'oMath', 'oMathPara', 'e', 'num', 'den', 'sub', 'sup', 'deg'].includes(name)) return joinedLatex(node) || glyphToLatex(xmlText(node));
  if (['mi', 'mn', 'mo', 'mtext', 't'].includes(name)) return glyphToLatex(xmlText(node));
  if (name === 'mfrac' || name === 'f') {
    const numerator = name === 'f' ? xmlChild(node, 'num') : node.children[0];
    const denominator = name === 'f' ? xmlChild(node, 'den') : node.children[1];
    return `\\frac${braced(numerator ? xmlNodeToLatex(numerator) : '')}${braced(denominator ? xmlNodeToLatex(denominator) : '')}`;
  }
  if (name === 'msqrt') return `\\sqrt${braced(joinedLatex(node))}`;
  if (name === 'mroot') return `\\sqrt[${node.children[1] ? xmlNodeToLatex(node.children[1]) : ''}]${braced(node.children[0] ? xmlNodeToLatex(node.children[0]) : '')}`;
  if (name === 'rad') {
    const expression = xmlChild(node, 'e');
    const degree = xmlChild(node, 'deg');
    return degree ? `\\sqrt[${xmlNodeToLatex(degree)}]${braced(expression ? xmlNodeToLatex(expression) : '')}` : `\\sqrt${braced(expression ? xmlNodeToLatex(expression) : '')}`;
  }
  if (name === 'msup' || name === 'sSup') {
    const base = name === 'sSup' ? xmlChild(node, 'e') : node.children[0];
    const sup = name === 'sSup' ? xmlChild(node, 'sup') : node.children[1];
    return `${base ? xmlNodeToLatex(base) : ''}^${braced(sup ? xmlNodeToLatex(sup) : '')}`;
  }
  if (name === 'msub' || name === 'sSub') {
    const base = name === 'sSub' ? xmlChild(node, 'e') : node.children[0];
    const sub = name === 'sSub' ? xmlChild(node, 'sub') : node.children[1];
    return `${base ? xmlNodeToLatex(base) : ''}_${braced(sub ? xmlNodeToLatex(sub) : '')}`;
  }
  if (name === 'msubsup' || name === 'sSubSup') {
    const base = name === 'sSubSup' ? xmlChild(node, 'e') : node.children[0];
    const sub = name === 'sSubSup' ? xmlChild(node, 'sub') : node.children[1];
    const sup = name === 'sSubSup' ? xmlChild(node, 'sup') : node.children[2];
    return `${base ? xmlNodeToLatex(base) : ''}_${braced(sub ? xmlNodeToLatex(sub) : '')}^${braced(sup ? xmlNodeToLatex(sup) : '')}`;
  }
  if (name === 'r') return joinedLatex(node) || glyphToLatex(xmlText(node));
  return joinedLatex(node) || glyphToLatex(xmlText(node));
}

export function equationMarkupToLatex(xml: string): string {
  return xmlNodeToLatex(parseEquationXml(xml)).normalize('NFKC').slice(0, MAX_LATEX_CHARS);
}
