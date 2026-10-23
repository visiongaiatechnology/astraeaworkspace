// STATUS: DIAMANT VGT SUPREME — Local-First Speaker Coach & Rehearsal Intelligence Engine
import { PresentSlide } from '../../../../shared/contracts/workspace';

export interface FillerWordOccurrence {
  word: string;
  count: number;
  timestampsSeconds: number[];
}

export interface SlideRehearsalMetrics {
  slideId: string;
  slideTitle: string;
  targetSeconds: number;
  actualSeconds: number;
  wordCount: number;
  wpm: number;
  pacingRating: 'too_slow' | 'optimal' | 'too_fast';
  fillerCount: number;
  tips: string[];
}

export interface SpeakerCoachReport {
  overallScore: number; // 0 - 100
  totalDurationSeconds: number;
  averageWpm: number;
  totalWords: number;
  overallPacing: 'too_slow' | 'optimal' | 'too_fast';
  fillerWords: FillerWordOccurrence[];
  totalFillers: number;
  slidesMetrics: SlideRehearsalMetrics[];
  summaryFeedback: string;
  topStrengths: string[];
  keyImprovements: string[];
}

const FILLER_DICTIONARY = [
  'ähm',
  'äh',
  'halt',
  'sozusagen',
  'quasi',
  'eigentlich',
  'irgendwie',
  'um',
  'uh',
  'like',
  'you know',
  'basically',
  'literally',
];

/**
 * Clean and tokenize transcript text into words
 */
export function tokenizeSpeechText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Scan text for filler word occurrences
 */
export function analyzeFillerWords(text: string): FillerWordOccurrence[] {
  const words = tokenizeSpeechText(text);
  const counts: Record<string, number> = {};

  for (const w of words) {
    if (FILLER_DICTIONARY.includes(w)) {
      counts[w] = (counts[w] || 0) + 1;
    }
  }

  return Object.entries(counts).map(([word, count]) => ({
    word,
    count,
    timestampsSeconds: [],
  }));
}

/**
 * Calculate WPM and rating
 */
export function calculatePacing(wordCount: number, seconds: number): { wpm: number; rating: 'too_slow' | 'optimal' | 'too_fast' } {
  if (seconds <= 0) return { wpm: 0, rating: 'optimal' };
  const minutes = seconds / 60;
  const wpm = Math.round(wordCount / minutes);

  let rating: 'too_slow' | 'optimal' | 'too_fast' = 'optimal';
  if (wpm < 110) rating = 'too_slow';
  else if (wpm > 165) rating = 'too_fast';

  return { wpm, rating };
}

/**
 * Evaluates rehearsal transcript and recorded timing for a complete presentation
 */
export function evaluateRehearsalSession(
  slides: PresentSlide[],
  recordedTimings: Record<string, number>,
  slideTranscripts: Record<string, string>
): SpeakerCoachReport {
  let totalWords = 0;
  let totalDuration = 0;
  let totalFillers = 0;
  const allFillersMap: Record<string, number> = {};
  const slidesMetrics: SlideRehearsalMetrics[] = [];

  slides.forEach((slide, idx) => {
    const target = slide.timingSeconds && slide.timingSeconds > 0 ? slide.timingSeconds : 60;
    const actual = recordedTimings[slide.id] || target;
    const transcript = slideTranscripts[slide.id] || slide.speakerNotes || '';
    const words = tokenizeSpeechText(transcript);
    const wordCount = words.length;

    totalWords += wordCount;
    totalDuration += actual;

    const { wpm, rating } = calculatePacing(wordCount, actual);
    const fillers = analyzeFillerWords(transcript);
    const slideFillerTotal = fillers.reduce((acc, cur) => acc + cur.count, 0);
    totalFillers += slideFillerTotal;

    fillers.forEach((f) => {
      allFillersMap[f.word] = (allFillersMap[f.word] || 0) + f.count;
    });

    const tips: string[] = [];
    if (rating === 'too_fast') {
      tips.push('Redetempo zu schnell (>165 WPM). Machen Sie gezielte Sprechpausen.');
    } else if (rating === 'too_slow' && wordCount > 10) {
      tips.push('Redetempo etwas schleppend (<110 WPM). Sprechen Sie dynamischer.');
    }

    if (actual > target * 1.3) {
      tips.push(`Folie hat Zeitlimit überschritten (${actual}s statt geplanten ${target}s).`);
    } else if (actual < target * 0.5 && wordCount < 10) {
      tips.push('Sehr knappe Darstellung. Vertiefen Sie Kernpunkte.');
    }

    if (slideFillerTotal > 3) {
      tips.push(`Erhöhte Anzahl Füllwörter (${slideFillerTotal}). Formulieren Sie prägnanter.`);
    }

    if (tips.length === 0) {
      tips.push('Ausgezeichnete Balance aus Tempo und Zeitmanagement.');
    }

    slidesMetrics.push({
      slideId: slide.id,
      slideTitle: slide.title || `Folie ${idx + 1}`,
      targetSeconds: target,
      actualSeconds: actual,
      wordCount,
      wpm,
      pacingRating: rating,
      fillerCount: slideFillerTotal,
      tips,
    });
  });

  const { wpm: avgWpm, rating: overallPacing } = calculatePacing(totalWords, totalDuration);

  // Score calculation: 100 base
  let score = 100;
  if (overallPacing !== 'optimal') score -= 15;
  if (totalFillers > 5) score -= Math.min(25, (totalFillers - 5) * 3);
  const timeDev = slidesMetrics.filter((m) => m.actualSeconds > m.targetSeconds * 1.3).length;
  score -= timeDev * 8;
  score = Math.max(30, Math.min(100, score));

  const topStrengths: string[] = [];
  const keyImprovements: string[] = [];

  if (overallPacing === 'optimal') {
    topStrengths.push(`Souveränes, professionelles Redetempo (${avgWpm} Wörter pro Minute).`);
  } else if (overallPacing === 'too_fast') {
    keyImprovements.push(`Gesamttempo mit ${avgWpm} WPM zu hoch; senken Sie das Tempo bei Kernbotschaften.`);
  } else {
    keyImprovements.push(`Gesamttempo mit ${avgWpm} WPM eher verhalten; steigern Sie die Dynamik.`);
  }

  if (totalFillers === 0) {
    topStrengths.push('Hervorragende Artikulation ohne jegliche Füllwörter.');
  } else if (totalFillers <= 3) {
    topStrengths.push('Sehr kontrollierte Wortwahl mit minimalen Füllwörtern.');
  } else {
    keyImprovements.push(`Füllwörter reduzieren: Insgesamt ${totalFillers} erkannt (z. B. ${Object.keys(allFillersMap).slice(0, 3).join(', ')}).`);
  }

  const onTimeSlides = slidesMetrics.filter((m) => m.actualSeconds <= m.targetSeconds * 1.15).length;
  if (onTimeSlides === slides.length && slides.length > 0) {
    topStrengths.push('Perfekte Einhaltung aller Folienzeitvorgaben.');
  } else {
    keyImprovements.push(`Präziseres Folientiming: ${slides.length - onTimeSlides} Folien wichen vom Plan ab.`);
  }

  const fillerList: FillerWordOccurrence[] = Object.entries(allFillersMap).map(([word, count]) => ({
    word,
    count,
    timestampsSeconds: [],
  }));

  const summary =
    score >= 85
      ? 'Exzellente Probe. Die Präsentation ist bereit für einen professionellen Auftritt vor Führungskräften oder Kunden.'
      : score >= 70
      ? 'Solide Probe mit gutem Gesamteindruck. Das Timing und die Füllwörter können noch feinjustiert werden.'
      : 'Ausbaufähige Probe. Achten Sie insbesondere auf das Sprechtempo und halten Sie die Folienzeitvorgaben ein.';

  return {
    overallScore: score,
    totalDurationSeconds: totalDuration,
    averageWpm: avgWpm,
    totalWords,
    overallPacing,
    fillerWords: fillerList,
    totalFillers,
    slidesMetrics,
    summaryFeedback: summary,
    topStrengths,
    keyImprovements,
  };
}
