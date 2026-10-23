// STATUS: DIAMANT VGT SUPREME
import React, { useEffect, useMemo, useState } from 'react';
import type { WhiteboardConnectorAnchor } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import type { WhiteboardAlignMode, WhiteboardDistributeMode } from '../model/whiteboardManipulationEngine';

interface Props {
  selection: WhiteboardItem[];
  frames: WhiteboardItem[];
  styleClipboardReady: boolean;
  snapToGrid: boolean;
  snapToGuides: boolean;
  onSnapToGrid: (value: boolean) => void;
  onSnapToGuides: (value: boolean) => void;
  rotate: (delta: number) => void;
  resize: (factor: number) => void;
  group: () => void;
  ungroup: () => void;
  setLocked: (locked: boolean) => void;
  hide: () => void;
  showAll: () => void;
  align: (mode: WhiteboardAlignMode) => void;
  distribute: (mode: WhiteboardDistributeMode) => void;
  layer: (direction: 'front' | 'back') => void;
  duplicate: () => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  setLink: (value: string | undefined) => void;
  setConstraints: (patch: Partial<NonNullable<WhiteboardItem['constraints']>>) => void;
  setConnectorAnchors: (patch: { fromAnchor?: WhiteboardConnectorAnchor; toAnchor?: WhiteboardConnectorAnchor }) => void;
  hiddenCount: number;
}

const button = 'rounded-md border border-white/10 bg-white/[.03] px-2 py-1.5 text-[0.6875rem] text-slate-300 hover:bg-white/[.08] disabled:cursor-not-allowed disabled:opacity-40';
const select = `${button} bg-slate-950`;
const ANCHORS: WhiteboardConnectorAnchor[] = ['auto', 'top', 'right', 'bottom', 'left'];

export const WhiteboardManipulationToolbar: React.FC<Props> = (props) => {
  const primary = props.selection[0];
  const [link, setLink] = useState(primary?.linkUri ?? '');
  useEffect(() => setLink(primary?.linkUri ?? ''), [primary?.id, primary?.linkUri]);
  const frameOptions = useMemo(() => props.frames.filter((frame) => !frame.hidden), [props.frames]);

  if (!primary) {
    return props.hiddenCount > 0 ? (
      <div className="whiteboard-toolbar__context whiteboard-toolbar__context--hint" data-vgt-whiteboard-context="hidden-items">
        <button className={button} onClick={props.showAll}>Show hidden ({props.hiddenCount})</button>
      </div>
    ) : null;
  }

  const locked = props.selection.every((item) => item.locked);
  const grouped = props.selection.some((item) => item.groupId);
  const axis = primary.constraints?.moveAxis ?? 'free';
  const connectorOnly = props.selection.every((item) => item.type === 'connector');
  const openLink = primary.linkUri;

  return (
    <div className="whiteboard-toolbar__context whiteboard-toolbar__context--manipulation" data-vgt-whiteboard-context="manipulation" role="toolbar" aria-label="Whiteboard object manipulation">
      <span className="px-1 text-[0.6875rem] font-semibold text-cyan-200">{props.selection.length} selected</span>

      {!connectorOnly && <>
        <button className={button} onClick={() => props.rotate(-15)}>↶15°</button>
        <button className={button} onClick={() => props.rotate(15)}>↷15°</button>
        <button className={button} onClick={() => props.resize(.9)}>Size−</button>
        <button className={button} onClick={() => props.resize(1.1)}>Size+</button>
        <button className={button} disabled={props.selection.length < 2} onClick={props.group}>Group</button>
        <button className={button} disabled={!grouped} onClick={props.ungroup}>Ungroup</button>
      </>}

      <button className={button} onClick={() => props.setLocked(!locked)}>{locked ? 'Unlock' : 'Lock'}</button>
      <button className={button} onClick={props.hide}>Hide</button>
      {props.hiddenCount > 0 && <button className={button} onClick={props.showAll}>Show all</button>}

      {!connectorOnly && <>
        <select className={select} defaultValue="" aria-label="Align selection" onChange={(event) => {
          if (event.target.value) props.align(event.target.value as WhiteboardAlignMode);
          event.currentTarget.value = '';
        }}>
          <option value="">Align…</option>
          {['left', 'center', 'right', 'top', 'middle', 'bottom'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button className={button} onClick={() => props.distribute('horizontal')}>Distribute H</button>
        <button className={button} onClick={() => props.distribute('vertical')}>Distribute V</button>
        <button className={button} onClick={() => props.layer('front')}>To front</button>
        <button className={button} onClick={() => props.layer('back')}>To back</button>
      </>}

      <button className={button} onClick={props.duplicate}>Duplicate</button>
      {!connectorOnly && <>
        <button className={button} onClick={props.copyStyle}>Copy style</button>
        <button className={button} disabled={!props.styleClipboardReady} onClick={props.pasteStyle}>Paste style</button>
      </>}

      <label className="flex items-center gap-1 px-1 text-[0.6875rem] text-slate-400">
        <input type="checkbox" checked={props.snapToGrid} onChange={(event) => props.onSnapToGrid(event.target.checked)} /> Grid snap
      </label>
      <label className="flex items-center gap-1 px-1 text-[0.6875rem] text-slate-400">
        <input type="checkbox" checked={props.snapToGuides} onChange={(event) => props.onSnapToGuides(event.target.checked)} /> Guide snap
      </label>

      {!connectorOnly && <>
        <select className={select} value={axis} aria-label="Movement constraint" onChange={(event) => props.setConstraints({ moveAxis: event.target.value as 'free' | 'horizontal' | 'vertical' })}>
          <option value="free">Free move</option>
          <option value="horizontal">Horizontal only</option>
          <option value="vertical">Vertical only</option>
        </select>
        <label className="flex items-center gap-1 px-1 text-[0.6875rem] text-slate-400">
          <input type="checkbox" checked={Boolean(primary.constraints?.lockAspectRatio)} onChange={(event) => props.setConstraints({ lockAspectRatio: event.target.checked })} /> Lock ratio
        </label>
        <select className={select} value={primary.constraints?.keepInsideFrameId ?? ''} aria-label="Contain object inside frame" onChange={(event) => props.setConstraints({ keepInsideFrameId: event.target.value || undefined })}>
          <option value="">No frame constraint</option>
          {frameOptions.filter((frame) => frame.id !== primary.id).map((frame) => <option key={frame.id} value={frame.id}>{frame.text || frame.name || frame.id}</option>)}
        </select>
      </>}

      {connectorOnly && <>
        <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400">From
          <select className={select} value={primary.fromAnchor ?? 'auto'} onChange={(event) => props.setConnectorAnchors({ fromAnchor: event.target.value as WhiteboardConnectorAnchor })}>
            {ANCHORS.map((anchor) => <option key={anchor} value={anchor}>{anchor}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400">To
          <select className={select} value={primary.toAnchor ?? 'auto'} onChange={(event) => props.setConnectorAnchors({ toAnchor: event.target.value as WhiteboardConnectorAnchor })}>
            {ANCHORS.map((anchor) => <option key={anchor} value={anchor}>{anchor}</option>)}
          </select>
        </label>
      </>}

      <input className="w-44 rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-[0.6875rem] text-slate-300 outline-none" value={link} onChange={(event) => setLink(event.target.value)} placeholder="vgt://workspace/... or https://" aria-label="Object link" />
      <button className={button} onClick={() => props.setLink(link || undefined)}>Apply link</button>
      <button className={button} onClick={() => { setLink(''); props.setLink(undefined); }}>Clear</button>
      {openLink && <a className={button} href={openLink} target={openLink.startsWith('https://') ? '_blank' : undefined} rel={openLink.startsWith('https://') ? 'noopener noreferrer' : undefined}>Open link</a>}
    </div>
  );
};
