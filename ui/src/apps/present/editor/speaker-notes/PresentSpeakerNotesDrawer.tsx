import React from 'react';
import { PresentSlide } from '../../../../shared/contracts/workspace';
import { MessageSquare, X, Clock } from 'lucide-react';

interface PresentSpeakerNotesDrawerProps {
  slide: PresentSlide;
  onUpdateSlide: (updated: PresentSlide) => void;
  onClose: () => void;
}

export const PresentSpeakerNotesDrawer: React.FC<PresentSpeakerNotesDrawerProps> = ({
  slide,
  onUpdateSlide,
  onClose,
}) => {
  const notes = slide.speakerNotes || '';
  const words = notes.trim().length ? notes.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((words / 130) * 60);

  return (
    <div className="h-36 bg-slate-950 border-t border-amber-500/20 p-3 flex flex-col space-y-2 shrink-0 select-none text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-amber-400 flex items-center space-x-1.5 text-xs">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Presenter Speaker Notes (Confidential)</span>
          </span>
          <span className="text-[0.625rem] text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>
              {words} words · ~{estimatedSeconds}s speaking time
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 p-1"
          aria-label="Close notes" title="Close notes"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <textarea
        value={notes}
        onChange={(e) => onUpdateSlide({ ...slide, speakerNotes: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="Type private presenter speaker notes and talking points for this slide..."
        className="flex-1 bg-slate-900/80 border border-white/10 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-amber-500/50 resize-none font-sans select-text leading-relaxed"
      />
    </div>
  );
};
