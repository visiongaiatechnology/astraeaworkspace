// STATUS: DIAMANT VGT SUPREME — the state of an embedded object is stated, not implied (W-245, W-251, W-254)
//
// The old behaviour: a live embed and a frozen one were rendered identically, and an embed whose source had
// been deleted kept its last content with no warning at all. A user could not tell "I froze this on purpose"
// from "this link is dead".
import { describe, expect, it } from 'vitest';
import { resolveWriterWorkspaceEmbedState } from '../../../integrations/workspace/writerEmbedPresence';

describe('the four states are distinguishable without colour', () => {
  it('names a healthy live object and explains nothing', () => {
    const state = resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'available' });
    expect(state.code).toBe('live');
    expect(state.badge).toBe('Live');
    expect(state.detail).toBeNull();
    expect(state.tone).toBe('ok');
    expect(state.canOpenSource).toBe(true);
  });

  it('says that a frozen object is frozen — by the user’s own decision', () => {
    const state = resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'available' });
    expect(state.code).toBe('frozen');
    expect(state.badge).toBe('Eingefroren');
    // The difference matters: this one does not change because the user froze it.
    expect(state.detail).toContain('eingefroren');
    expect(state.tone).toBe('frozen');
    expect(state.canOpenSource).toBe(true);
  });

  it('warns about a dead link instead of leaving stale content looking current', () => {
    const state = resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'missing' });
    expect(state.code).toBe('live-source-missing');
    expect(state.tone).toBe('warning');
    expect(state.detail).toContain('nicht mehr im Arbeitsbereich');
    expect(state.detail).toContain('nicht mehr aktualisiert');
  });

  it('marks the orphaned snapshot as both frozen and orphaned', () => {
    const state = resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'missing' });
    expect(state.code).toBe('frozen-orphaned');
    expect(state.badge).toContain('Quelle fehlt');
    expect(state.badge).toContain('Eingefroren');
    expect(state.detail).toContain('letzte');
    expect(state.tone).toBe('warning');
  });

  it('never lets the two "does not change" reasons look the same', () => {
    const frozen = resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'available' });
    const orphaned = resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'missing' });
    expect(frozen.badge).not.toBe(orphaned.badge);
    expect(frozen.detail).not.toBe(orphaned.detail);
    expect(frozen.tone).not.toBe(orphaned.tone);
  });
});

describe('an action that cannot work is not offered', () => {
  it('withdraws "open source" when the source is gone', () => {
    expect(resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'missing' }).canOpenSource).toBe(false);
    expect(resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'missing' }).canOpenSource).toBe(false);
  });

  it('keeps it when the source exists or is merely unknown', () => {
    expect(resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'available' }).canOpenSource).toBe(true);
    // `unknown` means nobody told the panel — it must not be turned into a claim that the source is gone.
    expect(resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'unknown' }).canOpenSource).toBe(true);
    expect(resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'unknown' }).detail).toBeNull();
  });
});

describe('every state carries words, not just a colour', () => {
  it('has a non-empty badge and a distinct code in all four cases', () => {
    const states = [
      resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'available' }),
      resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'available' }),
      resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'missing' }),
      resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'missing' }),
    ];
    for (const state of states) {
      expect(state.badge.trim().length).toBeGreaterThan(2);
    }
    expect(new Set(states.map((state) => state.code)).size).toBe(4);
  });

  it('explains every state except the healthy one', () => {
    // Silence is allowed only where there is nothing to say.
    expect(resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'available' }).detail).toBeNull();
    for (const mode of ['Live', 'Snapshot'] as const) {
      for (const presence of ['available', 'missing'] as const) {
        if (mode === 'Live' && presence === 'available') continue;
        expect(resolveWriterWorkspaceEmbedState({ mode, presence }).detail?.length ?? 0).toBeGreaterThan(30);
      }
    }
  });
});
