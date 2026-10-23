import React, { useState } from 'react';
import { PresentSlide, PresentSlideCard } from '../../../shared/contracts/workspace';
import { CARD_COLORS } from '../contracts/types';
import type { ResolvedPresentDesign } from '../design/presentDesign';
import { presentCardStyleCss, readPresentCardStyle, withPresentCardStyle, type PresentCardStyle } from '../contracts/presentStyle';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface PresentCardsLayoutProps {
  slide: PresentSlide;
  onUpdateSlide: (updated: PresentSlide) => void;
  animationStyleForTarget?: (id: string) => React.CSSProperties;
  /** Resolved slide theme: cards must follow a white/light sheet instead of forcing dark blue. */
  design?: ResolvedPresentDesign;
}

function themeIsLight(color: string | undefined): boolean {
  if (typeof color !== 'string') return true;
  const hex = color.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/u.test(hex)) return false;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 160;
}

export const PresentCardsLayout: React.FC<PresentCardsLayoutProps> = ({ slide, onUpdateSlide, animationStyleForTarget, design }) => {
  const [draggedCardIdx, setDraggedCardIdx] = useState<number | null>(null);
  const [dragOverCardIdx, setDragOverCardIdx] = useState<number | null>(null);
  /**
   * Round 14 (malformed document): `cards` may be a non-array value or contain null entries. The
   * view normalises once and works on that array everywhere (add/update/delete/drag/render), so the
   * stage cannot crash inside `cards.map` / `cards.filter` on a hostile document.
   */
  const lightSheet = themeIsLight(design?.backgroundColor);
  const cardSurface = lightSheet ? (design?.surfaceColor ?? '#ffffff') : '#0f172a';
  const cardText = lightSheet ? (design?.bodyColor ?? '#1e293b') : '#e2e8f0';
  const cardHeading = lightSheet ? (design?.titleColor ?? '#0f172a') : '#f8fafc';
  const cardBorder = lightSheet ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.12)';
  const cards: PresentSlideCard[] = Array.isArray(slide.cards)
    ? slide.cards.filter((card): card is PresentSlideCard => Boolean(card) && typeof card === 'object')
    : [];

  const handleAddCard = () => {
    const newCard: PresentSlideCard = {
      id: `card-${Date.now()}`,
      title: `0${cards.length + 1}. Card Title`,
      description: 'Click to edit description for this sovereign presentation card.',
      colorTheme: 'blue',
    };
    onUpdateSlide({ ...slide, cards: [...cards, newCard] });
  };

  const handleUpdateCard = (idx: number, partial: Partial<PresentSlideCard>) => {
    const nextCards = [...cards];
    nextCards[idx] = { ...nextCards[idx], ...partial };
    onUpdateSlide({ ...slide, cards: nextCards });
  };

  const handleDeleteCard = (idx: number) => {
    onUpdateSlide({ ...slide, cards: cards.filter((_, i) => i !== idx) });
  };

  return (
    <div className="w-full space-y-2" data-present-layout="cards" data-present-cards-layout="true">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {cards.map((card, cIdx) => {
          const colorDef = CARD_COLORS.find((c) => c.key === card.colorTheme) || CARD_COLORS[0];
          const cardStyle = readPresentCardStyle(card);
          const patchCardStyle = (patch: Partial<PresentCardStyle>) => {
            handleUpdateCard(cIdx, { presentStyle: readPresentCardStyle(withPresentCardStyle(card, patch)) } as unknown as Partial<PresentSlideCard>);
          };
          return (
            <div
              key={card.id}
              draggable
              onDragStart={() => setDraggedCardIdx(cIdx)}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedCardIdx !== null && draggedCardIdx !== cIdx) setDragOverCardIdx(cIdx);
              }}
              onDrop={() => {
                if (draggedCardIdx === null || draggedCardIdx === cIdx) return;
                const next = [...cards];
                const [moved] = next.splice(draggedCardIdx, 1);
                next.splice(cIdx, 0, moved);
                onUpdateSlide({ ...slide, cards: next });
                setDraggedCardIdx(null);
                setDragOverCardIdx(null);
              }}
              data-present-card-id={card.id}
              data-present-card-style={Object.keys(cardStyle).length ? 'styled' : undefined}
              style={{
                ...animationStyleForTarget?.(card.id),
                ...presentCardStyleCss(card),
                backgroundColor: cardStyle.backgroundColor ?? cardSurface,
                borderColor: card.customColor ? cardBorder : undefined,
              }}
              className={`p-3.5 rounded-xl border ${
                card.customColor ? '' : colorDef.border
              } flex flex-col justify-between relative group/card shadow-lg ${
                draggedCardIdx === cIdx ? 'opacity-30 border-dashed border-blue-400' : ''
              } ${dragOverCardIdx === cIdx ? 'ring-2 ring-blue-400' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1">
                  <GripVertical className="w-3 h-3 text-slate-500 cursor-grab" />
                  <input
                    type="text"
                    value={card.title ?? ''}
                    onChange={(e) => handleUpdateCard(cIdx, { title: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-xs font-bold ${colorDef.text} bg-transparent outline-none w-28 select-text`}
                    style={{ color: cardStyle.textColor ?? (lightSheet ? cardHeading : undefined) }}
                  />
                </div>
                <button aria-label="Delete card"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCard(cIdx);
                  }}
                  className="opacity-0 group-hover/card:opacity-100 p-0.5" style={{ color: cardText }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <textarea
                rows={2}
                value={card.description ?? ''}
                onChange={(e) => handleUpdateCard(cIdx, { description: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-[0.6875rem] bg-transparent outline-none resize-none select-text mt-1"
                style={{ color: cardStyle.textColor ?? cardText }}
              />
              <div className="opacity-0 group-hover/card:opacity-100 flex items-center space-x-1 pt-1 mt-1" style={{ borderTop: `1px solid ${cardBorder}` }}>
                {CARD_COLORS.map((col) => (
                  <button aria-label={`Set card color theme to ${col.key}`}
                    key={col.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateCard(cIdx, { colorTheme: col.key });
                    }}
                    className={`w-2.5 h-2.5 rounded-full ${card.colorTheme === col.key ? 'ring-1 ring-white' : ''}`}
                    style={{
                      backgroundColor:
                        col.key === 'blue'
                          ? '#3b82f6'
                          : col.key === 'emerald'
                          ? '#10b981'
                          : col.key === 'purple'
                          ? '#a855f7'
                          : col.key === 'amber'
                          ? '#f59e0b'
                          : '#ec4899',
                    }}
                  />
                ))}
                {/* Round 41 (style system): per-card background/text colour + reset to the theme. */}
                <label className="ml-auto flex items-center gap-1 text-[0.5rem] text-slate-400" title="Card background colour">
                  BG
                  <input
                    aria-label={`Card ${cIdx + 1} background colour`}
                    type="color"
                    value={cardStyle.backgroundColor ?? cardSurface}
                    onChange={(e) => patchCardStyle({ backgroundColor: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.5rem] text-slate-400" title="Card text colour">
                  TXT
                  <input
                    aria-label={`Card ${cIdx + 1} text colour`}
                    type="color"
                    value={cardStyle.textColor ?? cardText}
                    onChange={(e) => patchCardStyle({ textColor: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Reset card ${cIdx + 1} style`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpdateCard(cIdx, { presentStyle: undefined } as unknown as Partial<PresentSlideCard>);
                  }}
                  className="text-[0.5rem] text-slate-400 hover:text-slate-200"
                >
                  Reset
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {cards.length < 4 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddCard();
            }}
            className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-blue-300 border border-white/10"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Card</span>
          </button>
        </div>
      )}
    </div>
  );
};
