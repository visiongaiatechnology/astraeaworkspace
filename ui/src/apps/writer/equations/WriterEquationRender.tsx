// STATUS: DIAMANT VGT SUPREME — sink-free typed equation AST renderer
import React from 'react';
import { parseEquationLatex, type EquationNode } from '../../../shared/interoperability/equation';

function nodeView(node: EquationNode, key: string): React.ReactNode {
  switch (node.kind) {
    case 'row':
      return <React.Fragment key={key}>{node.children.map((child, index) => nodeView(child, `${key}.${index}`))}</React.Fragment>;
    case 'identifier':
      return <span key={key} className="italic font-serif">{node.value}</span>;
    case 'number':
      return <span key={key} className="font-serif">{node.value}</span>;
    case 'operator':
      return <span key={key} className="mx-1 font-serif">{node.value}</span>;
    case 'fraction':
      return (
        <span key={key} className="inline-flex flex-col items-center align-middle mx-1 text-center">
          <span className="border-b border-current px-1 text-[0.9em] leading-tight pb-0.5">{nodeView(node.numerator, `${key}.n`)}</span>
          <span className="px-1 text-[0.9em] leading-tight pt-0.5">{nodeView(node.denominator, `${key}.d`)}</span>
        </span>
      );
    case 'root':
      return (
        <span key={key} className="inline-flex items-start align-middle mx-1">
          {node.index ? <sup className="text-[0.6em] mr-[-0.15em] mt-[-0.15em]">{nodeView(node.index, `${key}.i`)}</sup> : null}
          <span className="text-xl leading-none">√</span>
          <span className="border-t border-current px-1">{nodeView(node.radicand, `${key}.r`)}</span>
        </span>
      );
    case 'script':
      return (
        <span key={key} className="inline-flex items-baseline">
          {nodeView(node.base, `${key}.b`)}
          {node.sub ? <sub className="text-[0.7em]">{nodeView(node.sub, `${key}.sub`)}</sub> : null}
          {node.sup ? <sup className="text-[0.7em]">{nodeView(node.sup, `${key}.sup`)}</sup> : null}
        </span>
      );
  }
}

export function renderEquationReact(latex: string): React.ReactNode {
  if (!latex.trim()) return <span className="italic text-slate-500 font-serif">Leere Gleichung</span>;
  const ast = parseEquationLatex(latex);
  return <span className="inline-block font-serif text-lg tracking-wide select-all text-slate-100">{nodeView(ast, 'root')}</span>;
}
