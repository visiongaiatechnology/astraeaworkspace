// STATUS: DIAMANT VGT SUPREME — Remote Presence Cursor Overlay
import React from 'react';
import type { WriterCollaborationPeer } from '../types/writerCollaborationTypes';

interface WriterRemoteCursorOverlayProps {
  text: string;
  fragmentStart: number;
  fragmentEnd: number;
  peers: readonly WriterCollaborationPeer[];
  textStyle: React.CSSProperties;
}

function hashHue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

function clampOffset(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(value)));
}

export const WriterRemoteCursorOverlay: React.FC<WriterRemoteCursorOverlayProps> = ({
  text,
  fragmentStart,
  fragmentEnd,
  peers,
  textStyle,
}) => {
  const visiblePeers = peers.filter((peer) => {
    const cursor = peer.cursor;
    if (!cursor) return false;
    const min = Math.min(cursor.anchor, cursor.focus);
    const max = Math.max(cursor.anchor, cursor.focus);
    return max >= fragmentStart && min <= fragmentEnd;
  });
  if (visiblePeers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {visiblePeers.map((peer, peerIndex) => {
        const cursor = peer.cursor;
        if (!cursor) return null;
        const localAnchor = clampOffset(cursor.anchor - fragmentStart, text.length);
        const localFocus = clampOffset(cursor.focus - fragmentStart, text.length);
        const selectionStart = Math.min(localAnchor, localFocus);
        const selectionEnd = Math.max(localAnchor, localFocus);
        const hasSelection = selectionEnd > selectionStart;
        const caretAtSelectionStart = hasSelection && localFocus === selectionStart;
        const hue = hashHue(peer.actorId);
        const cursorColor = `hsl(${hue} 78% 62%)`;
        const selectionColor = `hsl(${hue} 78% 62% / 0.22)`;
        const labelOffset = peerIndex * 15;

        return (
          <div
            key={peer.sessionId}
            className="absolute inset-0 whitespace-pre-wrap break-words py-1"
            style={{ ...textStyle, color: 'transparent', caretColor: 'transparent', background: 'transparent' }}
          >
            <span>{text.slice(0, hasSelection ? selectionStart : localFocus)}</span>
            {caretAtSelectionStart && (<span className="relative inline-block h-[1.15em] w-0 align-text-bottom" style={{ borderLeft: `2px solid ${cursorColor}` }}>
              <span
                className="absolute left-0 whitespace-nowrap rounded px-1 py-0.5 text-[0.5625rem] font-semibold leading-none text-slate-950 shadow-sm"
                style={{ backgroundColor: cursorColor, bottom: `calc(100% + ${2 + labelOffset}px)` }}
              >
                {peer.displayName}
              </span>
            </span>)}
            {hasSelection && (
              <span style={{ backgroundColor: selectionColor }}>{text.slice(selectionStart, selectionEnd)}</span>
            )}
            {!caretAtSelectionStart && (<span className="relative inline-block h-[1.15em] w-0 align-text-bottom" style={{ borderLeft: `2px solid ${cursorColor}` }}>
              <span
                className="absolute left-0 whitespace-nowrap rounded px-1 py-0.5 text-[0.5625rem] font-semibold leading-none text-slate-950 shadow-sm"
                style={{ backgroundColor: cursorColor, bottom: `calc(100% + ${2 + labelOffset}px)` }}
              >
                {peer.displayName}
              </span>
            </span>)}
            <span>{text.slice(hasSelection ? selectionEnd : localFocus)}</span>
          </div>
        );
      })}
    </div>
  );
};
