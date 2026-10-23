// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import type { WhiteboardBookmark } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';

interface WhiteboardNavigatorPanelProps {
  frames: WhiteboardItem[];
  bookmarks: WhiteboardBookmark[];
  presentationPath: string[];
  presentationIndex: number;
  onNavigateFrame: (id: string) => void;
  onNavigateBookmark: (id: string) => void;
  onRemoveBookmark: (id: string) => void;
  onUseAllFrames: () => void;
  onMovePathFrame: (id: string, direction: -1 | 1) => void;
  onRemovePathFrame: (id: string) => void;
  onPresentStep: (direction: -1 | 1) => void;
  onClose: () => void;
}

export const WhiteboardNavigatorPanel: React.FC<WhiteboardNavigatorPanelProps> = (props) => {
  const frameById = new Map(props.frames.map((frame) => [frame.id, frame]));
  return (
    <aside className="whiteboard-dock whiteboard-dock--right-top absolute right-6 top-20 z-30 flex max-h-[70%] w-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl" data-whiteboard-dock="navigator" aria-label="Whiteboard navigation">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div><div className="text-xs font-bold text-slate-100">Board navigation</div><div className="text-[0.625rem] text-slate-500">Frames · locations · presentation path</div></div>
        <button type="button" onClick={props.onClose} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white">Close</button>
      </header>
      <div className="overflow-y-auto p-3 space-y-4">
        <section>
          <div className="mb-2 flex items-center justify-between"><span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500">Frames</span><span className="text-[0.5625rem] font-mono text-slate-600">{props.frames.length}</span></div>
          <div className="space-y-1">
            {props.frames.length === 0 ? <div className="text-[0.625rem] text-slate-600">No frames yet.</div> : props.frames.map((frame) => <button key={frame.id} type="button" onClick={() => props.onNavigateFrame(frame.id)} className="w-full truncate rounded-lg border border-white/5 bg-white/[0.025] px-2 py-1.5 text-left text-[0.625rem] text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-400/[0.05]">{frame.text || frame.name || frame.id}</button>)}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between"><span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500">Locations</span><span className="text-[0.5625rem] font-mono text-slate-600">{props.bookmarks.length}</span></div>
          <div className="space-y-1">
            {props.bookmarks.length === 0 ? <div className="text-[0.625rem] text-slate-600">Save the current viewport as a named location.</div> : props.bookmarks.map((bookmark) => <div key={bookmark.id} className="flex gap-1"><button type="button" onClick={() => props.onNavigateBookmark(bookmark.id)} className="min-w-0 flex-1 truncate rounded-lg border border-white/5 bg-white/[0.025] px-2 py-1.5 text-left text-[0.625rem] text-slate-300 hover:bg-white/5">{bookmark.name}</button><button type="button" onClick={() => props.onRemoveBookmark(bookmark.id)} className="rounded-lg px-2 text-[0.625rem] text-slate-600 hover:bg-rose-500/10 hover:text-rose-300">×</button></div>)}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between"><span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500">Presentation path</span><button type="button" onClick={props.onUseAllFrames} className="rounded px-2 py-1 text-[0.5625rem] text-cyan-300 hover:bg-cyan-500/10">Use all frames</button></div>
          <div className="space-y-1">
            {props.presentationPath.length === 0 ? <div className="text-[0.625rem] text-slate-600">No path configured.</div> : props.presentationPath.map((id, index) => {
              const frame = frameById.get(id);
              if (!frame) return null;
              const active = index === props.presentationIndex;
              return <div key={id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${active ? 'border-amber-400/40 bg-amber-400/[0.06]' : 'border-white/5 bg-white/[0.02]'}`}><button type="button" onClick={() => props.onNavigateFrame(id)} className="min-w-0 flex-1 truncate text-left text-[0.625rem] text-slate-300">{index + 1}. {frame.text || frame.name || id}</button><button type="button" disabled={index === 0} onClick={() => props.onMovePathFrame(id, -1)} className="px-1 text-[0.5625rem] text-slate-500 disabled:opacity-20">↑</button><button type="button" disabled={index === props.presentationPath.length - 1} onClick={() => props.onMovePathFrame(id, 1)} className="px-1 text-[0.5625rem] text-slate-500 disabled:opacity-20">↓</button><button type="button" onClick={() => props.onRemovePathFrame(id)} className="px-1 text-[0.625rem] text-slate-600 hover:text-rose-300">×</button></div>;
            })}
          </div>
          {props.presentationPath.length > 0 && <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => props.onPresentStep(-1)} className="rounded-lg border border-white/10 px-2 py-1.5 text-[0.625rem] text-slate-300 hover:bg-white/5">Previous frame</button><button type="button" onClick={() => props.onPresentStep(1)} className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-2 py-1.5 text-[0.625rem] text-amber-200 hover:bg-amber-400/[0.08]">Next frame</button></div>}
        </section>
      </div>
    </aside>
  );
};
