// STATUS: PLATIN — localized Present speaker-coach controls and generated feedback.
import React, { useMemo, useState } from 'react';
import { Mic, X, Award, Clock, AlertCircle, CheckCircle2, TrendingUp, RefreshCw } from 'lucide-react';
import type { PresentSlide } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { recordingActiveTake } from '../../recording/presentRecording';
import { PRESENT_OFFICE_COPY, presentSpeakerCoachFailureCopy } from '../../locale/presentOfficeLocale';
import { evaluateRehearsalSession, type SlideRehearsalMetrics, type SpeakerCoachReport } from './presentSpeakerCoach';

interface PresentSpeakerCoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  slides: PresentSlide[];
  timings?: Record<string, number>;
}

export const PresentSpeakerCoachModal: React.FC<PresentSpeakerCoachModalProps> = ({
  isOpen, onClose, slides, timings = {},
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_OFFICE_COPY[locale].speakerCoach;
  const [selectedSlideId, setSelectedSlideId] = useState<string>(slides[0]?.id || '');
  const [refreshSeed, setRefreshSeed] = useState(0);

  const evaluation = useMemo((): { report: SpeakerCoachReport | null; error: string | null } => {
    try {
      const transcripts: Record<string, string> = {};
      const resolvedTimings: Record<string, number> = { ...timings };
      slides.forEach((slide) => {
        const take = recordingActiveTake(slide.recording);
        transcripts[slide.id] = take?.transcript || slide.speakerNotes || slide.title || '';
        if (resolvedTimings[slide.id] === undefined) {
          resolvedTimings[slide.id] = take?.durationMs ? take.durationMs / 1000 : slide.timingSeconds || 0;
        }
      });
      return { report: evaluateRehearsalSession(slides, resolvedTimings, transcripts), error: null };
    } catch (cause) {
      return { report: null, error: presentSpeakerCoachFailureCopy(locale, cause) };
    }
  }, [slides, timings, refreshSeed, locale]);

  if (!isOpen) return null;

  const report = evaluation.report;
  const currentSlideMetric = report?.slidesMetrics.find((metric) => metric.slideId === selectedSlideId) || report?.slidesMetrics[0];
  const selectedIndex = currentSlideMetric ? slides.findIndex((slide) => slide.id === currentSlideMetric.slideId) : -1;
  const selectedSlide = selectedIndex >= 0 ? slides[selectedIndex] : undefined;
  const selectedTitle = selectedSlide?.title?.trim() || (selectedIndex >= 0 ? copy.slide(selectedIndex + 1) : '');

  const localizedSlideTips = (metric: SlideRehearsalMetrics): string[] => {
    const tips: string[] = [];
    if (metric.pacingRating === 'too_fast') tips.push(copy.tipFast);
    else if (metric.pacingRating === 'too_slow' && metric.wordCount > 10) tips.push(copy.tipSlow);
    if (metric.actualSeconds > metric.targetSeconds * 1.3) tips.push(copy.tipTimeExceeded(metric.actualSeconds, metric.targetSeconds));
    else if (metric.actualSeconds < metric.targetSeconds * 0.5 && metric.wordCount < 10) tips.push(copy.tipBrief);
    if (metric.fillerCount > 3) tips.push(copy.tipFillers(metric.fillerCount));
    return tips.length ? tips : [copy.tipBalanced];
  };

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (report?.overallPacing === 'optimal') strengths.push(copy.strengthPace(report.averageWpm));
  else if (report?.overallPacing === 'too_fast') improvements.push(copy.improveFast(report.averageWpm));
  else if (report?.overallPacing === 'too_slow') improvements.push(copy.improveSlow(report.averageWpm));
  if (report?.totalFillers === 0) strengths.push(copy.strengthNoFillers);
  else if (report && report.totalFillers <= 3) strengths.push(copy.strengthFewFillers);
  else if (report && report.totalFillers > 3) {
    const examples = report.fillerWords.slice(0, 3).map((filler) => filler.word).join(', ');
    improvements.push(copy.improveFillers(report.totalFillers, examples));
  }
  const onTimeSlides = report?.slidesMetrics.filter((metric) => metric.actualSeconds <= metric.targetSeconds * 1.15).length ?? 0;
  if (report && onTimeSlides === slides.length && slides.length > 0) strengths.push(copy.strengthTiming);
  else if (report && onTimeSlides < slides.length) improvements.push(copy.improveTiming(slides.length - onTimeSlides));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="present-speaker-coach-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4">
      <div className="max-h-[94vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-3 text-slate-200 shadow-2xl sm:space-y-5 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex min-w-0 items-start gap-2 text-cyan-400"><Mic aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><h2 id="present-speaker-coach-title" className="break-words text-sm font-bold text-slate-100">{copy.title}</h2></div>
          <button aria-label={copy.close} title={copy.close} type="button" onClick={onClose} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"><X aria-hidden="true" className="h-4 w-4" /></button>
        </header>

        {evaluation.error ? <div role="alert" aria-live="assertive" aria-atomic="true" className="break-words rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">{evaluation.error}</div> : report && <>
          <section aria-label={copy.summaryHeading} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-800/60 p-3"><div className="shrink-0 rounded-lg bg-cyan-500/20 p-2 text-cyan-400"><Award aria-hidden="true" className="h-5 w-5" /></div><div className="min-w-0"><div className="break-words text-[0.6875rem] text-slate-400">{copy.score}</div><div className="font-mono text-lg font-bold text-cyan-300">{report.overallScore} / 100</div></div></div>
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-800/60 p-3"><div className="shrink-0 rounded-lg bg-emerald-500/20 p-2 text-emerald-400"><TrendingUp aria-hidden="true" className="h-5 w-5" /></div><div className="min-w-0"><div className="break-words text-[0.6875rem] text-slate-400">{copy.speakingRate}</div><div className="font-mono text-lg font-bold text-emerald-300">{report.averageWpm}</div><span className="break-words text-[0.625rem] text-slate-400">{copy.pacing[report.overallPacing]}</span></div></div>
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-800/60 p-3"><div className="shrink-0 rounded-lg bg-amber-500/20 p-2 text-amber-400"><AlertCircle aria-hidden="true" className="h-5 w-5" /></div><div className="min-w-0"><div className="break-words text-[0.6875rem] text-slate-400">{copy.fillersDetected}</div><div className="font-mono text-lg font-bold text-amber-300">{report.totalFillers}</div></div></div>
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-800/60 p-3"><div className="shrink-0 rounded-lg bg-indigo-500/20 p-2 text-indigo-400"><Clock aria-hidden="true" className="h-5 w-5" /></div><div className="min-w-0"><div className="break-words text-[0.6875rem] text-slate-400">{copy.totalDuration}</div><div className="font-mono text-lg font-bold text-indigo-300">{copy.seconds(report.totalDurationSeconds)}</div></div></div>
          </section>

          <section className="space-y-2 rounded-xl border border-white/5 bg-slate-800/40 p-3.5 text-xs">
            <div className="break-words font-semibold text-slate-200">{copy.summaryHeading}: {copy.summaryForScore(report.overallScore)}</div>
            <div className="grid grid-cols-1 gap-3 pt-1 text-[0.6875rem] sm:grid-cols-2">
              <div className="min-w-0"><h3 className="break-words font-semibold text-emerald-400">{copy.strengths}</h3><ul className="mt-1 list-inside list-disc space-y-0.5 break-words text-slate-300">{strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul></div>
              <div className="min-w-0"><h3 className="break-words font-semibold text-amber-400">{copy.improvements}</h3><ul className="mt-1 list-inside list-disc space-y-0.5 break-words text-slate-300">{improvements.map((improvement, index) => <li key={index}>{improvement}</li>)}</ul></div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="break-words text-xs font-semibold text-slate-300">{copy.slideAnalysis}</h3>
            <div className="flex space-x-1.5 overflow-x-auto pb-1" role="group" aria-label={copy.slideAnalysis}>
              {report.slidesMetrics.map((metric, index) => {
                const authoredTitle = slides.find((slide) => slide.id === metric.slideId)?.title?.trim();
                const title = authoredTitle || copy.slide(index + 1);
                return <button key={metric.slideId} type="button" aria-label={copy.selectSlide(index + 1, title)} aria-pressed={selectedSlideId === metric.slideId} onClick={() => setSelectedSlideId(metric.slideId)} className={`max-w-[12rem] whitespace-nowrap break-words rounded-lg px-3 py-1.5 text-xs transition-colors ${selectedSlideId === metric.slideId ? 'border border-cyan-500/40 bg-cyan-500/20 font-semibold text-cyan-300' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{copy.slide(index + 1)}</button>;
              })}
            </div>

            {currentSlideMetric && <div className="space-y-2 rounded-xl border border-white/5 bg-slate-800/50 p-3 text-xs">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words font-semibold text-slate-200">{selectedTitle}</span><div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.6875rem]"><span>{copy.actual}: <span className="text-cyan-300">{copy.seconds(currentSlideMetric.actualSeconds)}</span></span><span>{copy.target}: <span className="text-slate-400">{copy.seconds(currentSlideMetric.targetSeconds)}</span></span><span>{copy.pace}: <span className="text-emerald-300">{currentSlideMetric.wpm} WPM</span></span></div></div>
              <ul className="space-y-1">{localizedSlideTips(currentSlideMetric).map((tip, index) => <li key={index} className="flex min-w-0 items-start gap-1.5 break-words text-[0.6875rem] text-slate-300"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{tip}</span></li>)}</ul>
            </div>}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
            <button type="button" onClick={() => setRefreshSeed((seed) => seed + 1)} className="flex items-center gap-1.5 whitespace-normal break-words rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span>{copy.refresh}</span></button>
            <button type="button" onClick={onClose} className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">{copy.done}</button>
          </footer>
        </>}
      </div>
    </div>
  );
};
