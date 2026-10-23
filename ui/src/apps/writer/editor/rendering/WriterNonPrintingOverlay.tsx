// STATUS: DIAMANT VGT SUPREME — WYSIWYG Non-Printing Formatting Marks Overlay (¶, ·, →)
import React, { type CSSProperties } from 'react';

interface WriterNonPrintingOverlayProps {
  text: string;
  style?: CSSProperties;
  showNonPrinting: boolean;
}

export const WriterNonPrintingOverlay: React.FC<WriterNonPrintingOverlayProps> = ({
  text,
  style,
  showNonPrinting,
}) => {
  if (!showNonPrinting || !text) return null;

  // Transform non-printing characters into visible symbols
  const renderSymbols = (str: string) => {
    const parts: React.ReactNode[] = [];
    let currentWord = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === ' ') {
        if (currentWord) {
          parts.push(<span key={`w-${i}`} className="opacity-0">{currentWord}</span>);
          currentWord = '';
        }
        parts.push(
          <span key={`sp-${i}`} className="text-blue-400/50 font-sans select-none inline-block">
            ·
          </span>
        );
      } else if (char === '\t') {
        if (currentWord) {
          parts.push(<span key={`w-${i}`} className="opacity-0">{currentWord}</span>);
          currentWord = '';
        }
        parts.push(
          <span key={`tab-${i}`} className="text-blue-400/60 font-mono select-none inline-block px-1">
            →
          </span>
        );
      } else if (char === '\n') {
        if (currentWord) {
          parts.push(<span key={`w-${i}`} className="opacity-0">{currentWord}</span>);
          currentWord = '';
        }
        parts.push(
          <span key={`nl-${i}`} className="text-blue-400/40 font-mono select-none inline-block">
            ↵\n
          </span>
        );
      } else {
        currentWord += char;
      }
    }

    if (currentWord) {
      parts.push(<span key="w-end" className="opacity-0">{currentWord}</span>);
    }

    // Paragraph mark at the end
    parts.push(
      <span key="pilcrow" className="text-blue-400/60 font-serif select-none ml-0.5">
        ¶
      </span>
    );

    return parts;
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 py-1 whitespace-pre-wrap overflow-hidden select-none"
      style={style}
    >
      {renderSymbols(text)}
    </div>
  );
};
