// STATUS: PLATIN
// Keyboard-reachable list of every visible board object with screen-reader descriptions.
// This is the documented keyboard route to objects; it never depends on pointer hit-testing.

import React, { useCallback, useMemo, useRef } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardObjectsText } from '../whiteboardObjectsLocale';
import {
  describeWhiteboardItem,
  whiteboardItemDisplayText,
  whiteboardItemTypeLabel,
  whiteboardKeyboardOrder,
} from './whiteboardAccessibilityEngine';
import type { WhiteboardItem } from '../types';

interface WhiteboardObjectListProps {
  items: WhiteboardItem[];
  selectedIds: readonly string[];
  onSelect: (id: string) => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
}

export const WhiteboardObjectList: React.FC<WhiteboardObjectListProps> = ({
  items,
  selectedIds,
  onSelect,
  onNavigate,
  onClose,
}) => {
  const { locale } = useWorkspaceLocale();
  const listRef = useRef<HTMLDivElement>(null);
  const order = useMemo(() => whiteboardKeyboardOrder(items), [items]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeId = order.find((item) => selected.has(item.id))?.id ?? order[0]?.id ?? null;

  const focusOptionAt = useCallback((index: number) => {
    const nodes = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    nodes?.[index]?.focus();
  }, []);

  const step = useCallback((fromId: string | null, direction: 1 | -1) => {
    if (order.length === 0) return;
    const index = order.findIndex((item) => item.id === fromId);
    const nextIndex = index < 0 ? 0 : Math.min(order.length - 1, Math.max(0, index + direction));
    const next = order[nextIndex];
    if (!next) return;
    onSelect(next.id);
    focusOptionAt(nextIndex);
  }, [focusOptionAt, onSelect, order]);

  return (
    <div
      className="whiteboard-dock whiteboard-dock--bottom-right whiteboard-object-list absolute bottom-6 right-6 z-40 flex max-h-[min(60vh,520px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-xl"
      data-whiteboard-dock="object-list"
      data-vgt-whiteboard-object-list="true"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider">{whiteboardObjectsText('toggleObjectList', locale)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={whiteboardObjectsText('closePalette', locale)}
          className="whiteboard-object-list__close px-2 py-0.5 text-[0.6875rem]"
        >
          ✕
        </button>
      </div>
      <p className="px-3 py-1 text-[0.625rem] opacity-70">{whiteboardObjectsText('objectListHint', locale)}</p>
      <div
        ref={listRef}
        role="listbox"
        aria-label={whiteboardObjectsText('objectList', locale)}
        className="flex-1 overflow-y-auto px-2 pb-2"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            step(activeId, event.key === 'ArrowDown' ? 1 : -1);
            return;
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const target = event.key === 'Home' ? order[0] : order[order.length - 1];
            if (target) { onSelect(target.id); focusOptionAt(event.key === 'Home' ? 0 : order.length - 1); }
            return;
          }
          if (event.key === 'Enter' && activeId) {
            event.preventDefault();
            onNavigate(activeId);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        {order.length === 0 && <p className="px-2 py-3 text-xs opacity-70">{whiteboardObjectsText('objects', locale)}: 0</p>}
        {order.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-whiteboard-object={item.id}
              tabIndex={item.id === activeId ? 0 : -1}
              title={describeWhiteboardItem(item, locale, { selected: isSelected })}
              aria-label={describeWhiteboardItem(item, locale, { selected: isSelected })}
              onClick={() => { onSelect(item.id); }}
              onDoubleClick={() => onNavigate(item.id)}
              className="whiteboard-object-list__row flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
            >
              <span aria-hidden="true" className="whiteboard-object-list__badge px-1.5 py-0.5 text-[0.5625rem] font-mono uppercase">
                {whiteboardItemTypeLabel(item, locale)}
              </span>
              <span className="min-w-0 flex-1 truncate">{whiteboardItemDisplayText(item) || whiteboardItemTypeLabel(item, locale)}</span>
              {item.locked && <span aria-hidden="true" className="text-[0.5625rem] opacity-70">🔒</span>}
              {item.hidden && <span aria-hidden="true" className="text-[0.5625rem] opacity-70">◌</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
