// STATUS: PLATIN
// Screen-reader descriptions and keyboard ordering for the canonical Whiteboard object model.
// Pure: no DOM, no React. `WhiteboardObjectList` only renders what this module resolves.

import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { WhiteboardItem } from '../types';
import { whiteboardObjectsTemplate, whiteboardObjectsText } from '../whiteboardObjectsLocale';
import { whiteboardToolbarText } from '../whiteboardToolbarLocale';

export const WHITEBOARD_A11Y_MAX_DESCRIBED_OBJECTS = 5_000;
export const WHITEBOARD_A11Y_DESCRIPTION_MAX_LENGTH = 400;

/** Type names come from the two existing Whiteboard copy tables; nothing is re-typed here. */
export function whiteboardItemTypeLabel(item: WhiteboardItem, locale: WorkspaceLocale): string {
  switch (item.type) {
    case 'sticky': return whiteboardToolbarText('sticky', locale);
    case 'process': return whiteboardToolbarText('process', locale);
    case 'decision': return whiteboardToolbarText('decision', locale);
    case 'terminal': return whiteboardToolbarText('terminal', locale);
    case 'text': return whiteboardToolbarText('text', locale);
    case 'frame': return whiteboardToolbarText('frame', locale);
    case 'image': return whiteboardToolbarText('image', locale);
    case 'ink': return whiteboardToolbarText('ink', locale);
    case 'connector': return whiteboardObjectsText('objectConnector', locale);
    case 'shape': return whiteboardObjectsText('shape', locale);
    case 'icon': return whiteboardObjectsText('icon', locale);
    case 'table': return whiteboardObjectsText('table', locale);
    case 'card': return whiteboardObjectsText('taskCard', locale);
    case 'document': return whiteboardObjectsText('document', locale);
    case 'chart': return whiteboardObjectsText('chartData', locale);
    case 'code': return whiteboardObjectsText('code', locale);
    case 'media': return whiteboardObjectsText('localMedia', locale);
    case 'reaction': return whiteboardObjectsText('reactionVote', locale);
    case 'live': return whiteboardObjectsText('objectLive', locale);
    default: return String(item.type);
  }
}

/** The user-visible label of an object: its text, then its rich payload, then its type name. */
export function whiteboardItemDisplayText(item: WhiteboardItem): string {
  const candidate = item.text || item.name || item.diagram?.title || item.card?.title || item.document?.title
    || item.chart?.title || item.code?.language || item.media?.name || item.icon?.label
    || item.liveObject?.sourceTitle || item.lineLabel || '';
  return candidate.replace(/\s+/gu, ' ').trim().slice(0, 160);
}

function withControls(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

/**
 * One complete, deterministic screen-reader description per object. States are spelled out in words
 * (locked / hidden / grouped / selected) so they never depend on colour alone.
 */
export function describeWhiteboardItem(
  item: WhiteboardItem,
  locale: WorkspaceLocale,
  options: { readonly selected?: boolean } = {},
): string {
  if (!item || typeof item.type !== 'string') return '';
  const flags: string[] = [];
  if (options.selected) flags.push(whiteboardObjectsText('describeSelected', locale));
  if (item.locked) flags.push(whiteboardObjectsText('describeLocked', locale));
  if (item.hidden) flags.push(whiteboardObjectsText('describeHidden', locale));
  if (item.groupId) flags.push(whiteboardObjectsText('describeGrouped', locale));
  const primary = whiteboardObjectsTemplate('describePosition', locale, {
    type: whiteboardItemTypeLabel(item, locale),
    x: Math.round(Number.isFinite(item.x) ? item.x : 0),
    y: Math.round(Number.isFinite(item.y) ? item.y : 0),
    width: Math.round(Number.isFinite(item.width) ? item.width : 0),
    height: Math.round(Number.isFinite(item.height) ? item.height : 0),
    flags: flags.length > 0 ? `, ${flags.join(', ')}` : '',
  });
  const parts = [primary];
  const text = whiteboardItemDisplayText(item);
  if (text) parts.push(text);
  if (item.type === 'connector' && item.fromId && item.toId) parts.push(`${item.fromId} → ${item.toId}`);
  return withControls(parts.join('. ')).slice(0, WHITEBOARD_A11Y_DESCRIPTION_MAX_LENGTH);
}

/**
 * Canonical keyboard order for the object list: topmost object first, then down the paint stack. The
 * list is the documented keyboard route to objects a pointer user would reach by clicking.
 */
export function whiteboardKeyboardOrder(items: readonly WhiteboardItem[]): WhiteboardItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is WhiteboardItem => Boolean(item) && typeof item.id === 'string' && item.id.length > 0 && !item.hidden)
    .slice(0, WHITEBOARD_A11Y_MAX_DESCRIBED_OBJECTS)
    .sort((left, right) => (right.zIndex ?? 0) - (left.zIndex ?? 0) || left.id.localeCompare(right.id));
}

/** Moves the list/selection cursor without wrapping past the ends; returns null when out of range. */
export function stepWhiteboardKeyboardOrder(
  order: readonly WhiteboardItem[],
  currentId: string | null,
  direction: 1 | -1,
): WhiteboardItem | null {
  if (order.length === 0) return null;
  if (!currentId) return direction === 1 ? order[0] : order[order.length - 1];
  const index = order.findIndex((item) => item.id === currentId);
  if (index < 0) return order[0];
  const next = index + direction;
  if (next < 0 || next >= order.length) return null;
  return order[next];
}

export function summarizeWhiteboardSelection(
  items: readonly WhiteboardItem[],
  selectedIds: readonly string[],
  locale: WorkspaceLocale,
): string {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return '';
  const selected = new Set(selectedIds);
  return items
    .filter((item) => selected.has(item.id))
    .slice(0, 32)
    .map((item) => describeWhiteboardItem(item, locale, { selected: true }))
    .join(' | ');
}
