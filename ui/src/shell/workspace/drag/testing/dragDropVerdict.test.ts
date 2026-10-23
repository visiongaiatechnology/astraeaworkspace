// STATUS: PLATIN — §12.3: Ablageurteil, Vorschau und Touch-Strategie, kopflos geprüft
import { describe, expect, it } from 'vitest';
import {
  DRAG_TOUCH_LONGPRESS_MS,
  commitDropTarget,
  createDropTarget,
  dragThresholdForInput,
  hoverDropTarget,
  isPointerFree,
  leaveDropTarget,
  requiresLongPress,
} from '../dragDropVerdict';

const ZIEL = { targetApp: 'Writer', objectKind: 'TextBlock', intent: 'COPY', label: 'Textblock · kopieren' };

describe('§12.3: erlaubte und unerlaubte Ziele, Vorschau, Touch', () => {
  it('Nicht-Leerheit: alle drei Urteile und mindestens vier Ablehnungsgruende sind erreichbar', () => {
    const urteile = new Set<string>();
    const gruende = new Set<string>();
    const faelle = [
      hoverDropTarget(createDropTarget(), ZIEL, () => true),
      { ok: true, state: createDropTarget() },
      hoverDropTarget(createDropTarget(), ZIEL, () => false),
      hoverDropTarget(createDropTarget(), ZIEL, null),
      hoverDropTarget(createDropTarget(), ZIEL, () => { throw new Error('kaputt'); }),
      hoverDropTarget(createDropTarget(), { ...ZIEL, objectKind: 'Nichts' }, () => false),
      hoverDropTarget(createDropTarget(), { ...ZIEL, objectKind: '   ' }, () => true),
      hoverDropTarget(createDropTarget(), { ...ZIEL, intent: '' }, () => true),
    ];
    for (const f of faelle) { urteile.add(f.state.verdict); if (f.state.reason) gruende.add(f.state.reason); }
    expect([...urteile].sort()).toEqual(['accept', 'none', 'reject']);
    expect(gruende.size).toBeGreaterThanOrEqual(4);
    expect(createDropTarget().verdict).toBe('none');
  });

  it('ein annehmendes Ziel: Urteil accept, Vorschau benannt, Ablegen gelingt', () => {
    const s = hoverDropTarget(createDropTarget(), ZIEL, () => true).state;
    expect(s.verdict).toBe('accept');
    expect(s.reason).toBeNull();
    expect(s.overTarget).toBe(true);
    expect(s.preview).toEqual({ objectKind: 'TextBlock', intent: 'COPY', label: 'Textblock · kopieren' });
    const ab = commitDropTarget(s);
    expect(ab.ok).toBe(true);
    expect(ab.state).toEqual(createDropTarget());
  });

  it('ein ablehnendes Ziel: das Ablegen ist ein BENANNTER Fehlschlag, kein stiller No-op', () => {
    const s = hoverDropTarget(createDropTarget(), ZIEL, () => false).state;
    expect(s.verdict).toBe('reject');
    expect(s.reason).toBe('route-not-capable');
    const ab = commitDropTarget(s);
    expect(ab.ok).toBe(false);
    if (!ab.ok) expect(ab.reason).toBe('drop-rejected:route-not-capable');
  });

  it('ein erfundener Objekttyp wird von der AUTORITAET entschieden -- nicht von einer zweiten Liste hier', () => {
    let gefragt = 0;
    const abgelehnt = hoverDropTarget(
      createDropTarget(),
      { ...ZIEL, objectKind: 'NichtsDergleichen' },
      () => { gefragt += 1; return false; },
    ).state;
    expect(gefragt, 'die Autoritaet MUSS gefragt werden -- sie ist die eine Wahrheit').toBe(1);
    expect(abgelehnt.verdict).toBe('reject');
    expect(abgelehnt.reason).toBe('route-not-capable');
    const angenommen = hoverDropTarget(
      createDropTarget(),
      { ...ZIEL, objectKind: 'NichtsDergleichen' },
      () => true,
    ).state;
    expect(angenommen.verdict, 'dieses Modul darf die Vokabel NICHT selbst pruefen').toBe('accept');
  });

  it('ein LEERER Objekttyp dagegen ist hier benannt -- kein Vokabelfall, sondern ein fehlender Wert', () => {
    let gefragt = 0;
    const s = hoverDropTarget(
      createDropTarget(),
      { ...ZIEL, objectKind: '   ' },
      () => { gefragt += 1; return true; },
    ).state;
    expect(s.verdict).toBe('reject');
    expect(s.reason).toBe('object-kind-unknown');
    expect(gefragt, 'ein leerer Wert ist kein Vokabelfall -- die Autoritaet wird nicht belastet').toBe(0);
  });

  it('fail-closed: keine oder eine werfende Faehigkeitsfrage ergibt reject, nie accept', () => {
    for (const frage of [null, undefined, 'keine Funktion', () => { throw new Error('kaputt'); }]) {
      const s = hoverDropTarget(createDropTarget(), ZIEL, frage as never).state;
      expect(s.verdict, String(frage)).toBe('reject');
      expect(s.reason, String(frage)).toBe('verdict-unavailable');
      expect(s.preview?.objectKind).toBe('TextBlock');
      expect(commitDropTarget(s).ok).toBe(false);
    }
  });

  it('kein veraltetes Urteil: Verlassen raeumt auf, Ablegen ohne Ziel ist benannt', () => {
    const s = hoverDropTarget(createDropTarget(), ZIEL, () => true).state;
    expect(leaveDropTarget(s)).toEqual(createDropTarget());
    expect(commitDropTarget(leaveDropTarget(s)).ok).toBe(false);
    expect(commitDropTarget(createDropTarget()).ok).toBe(false);
    const ohneZiel = commitDropTarget({ ...createDropTarget(), overTarget: true });
    expect(ohneZiel.ok).toBe(false);
    if (!ohneZiel.ok) expect(ohneZiel.reason).toBe('drop-no-target');
  });

  it('die Touch-Strategie als Entscheidung -- Langdruck nur bei Touch, groessere Schwelle', () => {
    expect(requiresLongPress('touch')).toBe(true);
    expect(dragThresholdForInput('touch', 4)).toBe(8);
    for (const art of ['mouse', 'pen'] as const) {
      expect(requiresLongPress(art), art).toBe(false);
      expect(dragThresholdForInput(art, 4), art).toBe(4);
    }
    expect(isPointerFree('keyboard')).toBe(true);
    expect(isPointerFree('touch')).toBe(false);
    for (const kaputt of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(dragThresholdForInput('mouse', kaputt)).toBe(4);
    }
    expect(DRAG_TOUCH_LONGPRESS_MS).toBeGreaterThan(0);
  });

  it('zwei Aufrufe in EINER Instanz: das Urteil folgt dem letzten Ziel (die W-397-Regel)', () => {
    let s = hoverDropTarget(createDropTarget(), ZIEL, () => true).state;
    expect(s.verdict).toBe('accept');
    s = hoverDropTarget(s, ZIEL, () => false).state;
    expect(s.verdict).toBe('reject');
    expect(commitDropTarget(s).ok).toBe(false);
    s = hoverDropTarget(s, { ...ZIEL, targetApp: 'Grid', objectKind: 'Table' }, () => true).state;
    expect(s.targetApp).toBe('Grid');
    expect(s.verdict).toBe('accept');
    expect(s.preview?.objectKind).toBe('Table');
  });
});