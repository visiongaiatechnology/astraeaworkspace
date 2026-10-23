// STATUS: DIAMANT VGT SUPREME — bounded local-only transition sound synthesis
import type { PresentTransitionSound } from '../../../../shared/contracts/workspace';

export async function playPresentTransitionSound(sound: PresentTransitionSound | undefined): Promise<void> {
  if (!sound || sound === 'none' || typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const ctx = new AudioContextCtor();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.connect(ctx.destination);
    if (sound === 'click') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      osc.connect(gain); osc.start(now); osc.stop(now + 0.06);
    } else if (sound === 'chime') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.025, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(gain); osc.start(now); osc.stop(now + 0.45);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.018, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain); osc.start(now); osc.stop(now + 0.3);
    }
  } catch {
    // Browser autoplay policies may reject audio; transition playback itself must remain deterministic.
  } finally {
    window.setTimeout(() => void ctx.close().catch(() => undefined), 700);
  }
}
