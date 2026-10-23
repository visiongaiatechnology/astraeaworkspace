// STATUS: PLATIN — Paket 8: die Verweil-Maschine, kopflos geprüft — inklusive der Falle, die sie verhindert
import { describe, expect, it } from 'vitest';
import {
  TAB_HOVER_DWELL_MS,
  createTabHover,
  hasDwelled,
  hoverTab,
  hoverTick,
  isHovering,
  leaveTab,
} from '../tabHoverDwell';

describe('Paket 8: die Tab-Hover-Aktivierung', () => {
  it('**Nicht-Leerheit:** die Maschine durchläuft Verweilen, Aktivierung und Verlassen', () => {
    let s = createTabHover();
    expect(isHovering(s)).toBe(false);
    s = hoverTab(s, 'grid', 1000, true).state;
    expect(isHovering(s)).toBe(true);
    s = hoverTick(s, 1000 + TAB_HOVER_DWELL_MS).state;
    expect(s.activatedTabId).toBe('grid');
    s = leaveTab(s, 'grid', 2000).state;
    expect(isHovering(s)).toBe(false);
    expect(s.activatedTabId).toBeNull();
    // Und alle drei Zustandsformen waren wirklich da ✓.
    const formen = [createTabHover(), hoverTab(createTabHover(), 'x', 0, true).state,
      hoverTick(hoverTab(createTabHover(), 'x', 0, true).state, 999).state];
    expect(new Set(formen.map((f) => JSON.stringify(f))).size).toBeGreaterThanOrEqual(2);
  });

  it('**die Kernregel: ein vorbeiziehender Zeiger aktiviert nichts** — erst das Verweilen', () => {
    let s = hoverTab(createTabHover(), 'writer', 0, true).state;
    // Kurz darunter ✓: keine Aktivierung ✓.
    s = hoverTick(s, TAB_HOVER_DWELL_MS - 1).state;
    expect(s.activatedTabId).toBeNull();
    expect(hasDwelled(s, TAB_HOVER_DWELL_MS - 1)).toBe(false);
    // Genau **auf** der Verweildauer ✓: aktiviert ✓ (die Grenze gehört zur Aktivierung ✓).
    s = hoverTick(s, TAB_HOVER_DWELL_MS).state;
    expect(s.activatedTabId).toBe('writer');
    expect(hasDwelled(s, TAB_HOVER_DWELL_MS)).toBe(true);
  });

  it('**derselbe Tab startet die Zeit NICHT neu** — sonst erreichte ein zitternder Zeiger sie nie', () => {
    let s = hoverTab(createTabHover(), 'notes', 0, true).state;
    // Drei Bewegungen **innerhalb** desselben Tabs bei 100, 200, 300 ✓.
    for (const t of [100, 200, 300]) s = hoverTab(s, 'notes', t, true).state;
    // Die Zeit läuft **ab 0** weiter ✓ — nicht ab 300 ✗.
    expect(s.sinceMs).toBe(0);
    s = hoverTick(s, TAB_HOVER_DWELL_MS).state;
    expect(s.activatedTabId, 'die Zeit wurde durch Bewegung im Tab zurückgesetzt').toBe('notes');
  });

  it('**ein anderer Tab beginnt neu** — die Verweildauer gilt je Tab', () => {
    let s = hoverTab(createTabHover(), 'draw', 0, true).state;
    s = hoverTab(s, 'present', 350, true).state;
    expect(s.sinceMs).toBe(350);
    // Bei 400 wären es für `draw` 400 ms gewesen ✓ — für `present` sind es erst 50 ✓ → **keine** Aktivierung ✓.
    s = hoverTick(s, 400).state;
    expect(s.activatedTabId).toBeNull();
    s = hoverTick(s, 350 + TAB_HOVER_DWELL_MS).state;
    expect(s.activatedTabId).toBe('present');
  });

  it('**genau einmal:** nach der Aktivierung meldet dasselbe Verweilen nichts mehr', () => {
    let s = hoverTab(createTabHover(), 'vault', 0, true).state;
    s = hoverTick(s, TAB_HOVER_DWELL_MS).state;
    expect(s.activatedTabId).toBe('vault');
    // **Der zweite Tick für denselben Tab** ✓ — die Anwendung darf **nicht** erneut geöffnet werden ✗ ✓.
    const zweiter = hoverTick(s, TAB_HOVER_DWELL_MS * 2).state;
    expect(zweiter.activatedTabId).toBe('vault');
    // Und der **Aufrufer** sieht die Neuigkeit genau einmal ✓, weil der Wert **gleich** bleibt ✓:
    // wer auf Änderungen hört, öffnet einmal ✓. Genau dafür ist der Wert stabil ✓ statt `null` ✓.
    expect(zweiter).toEqual(s);
  });

  it('**Verlassen löscht vollständig** — nicht pausiert', () => {
    let s = hoverTab(createTabHover(), 'grid', 0, true).state;
    s = leaveTab(s, 'grid', 300).state;
    expect(s.hoveredTabId).toBeNull();
    expect(s.sinceMs).toBeNull();
    // Ein erneutes Betreten beginnt bei **jetzt** ✓ — die alten 300 ms sind **weg** ✓.
    s = hoverTab(s, 'grid', 350, true).state;
    expect(s.sinceMs).toBe(350);
    s = hoverTick(s, 350 + TAB_HOVER_DWELL_MS - 1).state;
    expect(s.activatedTabId, 'die alte Verweilzeit wurde angerechnet').toBeNull();
  });

  it('**ohne Zug passiert nichts** — die Maschine rät nicht, ob gezogen wird', () => {
    const leer = createTabHover();
    // `enabled: false` → **unverändert** ✓, und zwar **auch** bei einem gültigen Tab ✓.
    const aus = hoverTab(leer, 'writer', 500, false);
    expect(aus.ok).toBe(true);
    expect(aus.state).toEqual(leer);
    // Auch ein Tick ändert dann nichts ✓.
    expect(hoverTick(aus.state, 10_000).state).toEqual(leer);
  });

  it('**fail-closed:** unbrauchbare Zeiten, Verweildauern und Bezeichner ändern **nichts**', () => {
    const laufend = hoverTab(createTabHover(), 'grid', 100, true).state;
    for (const kaputt of [Number.NaN, Number.POSITIVE_INFINITY, -1, '100', null, undefined]) {
      const s1 = hoverTab(laufend, 'grid', kaputt, true);
      expect(s1.ok, String(kaputt)).toBe(false);
      expect(s1.state).toEqual(laufend); // **unverändert** ✓
      const s2 = hoverTick(laufend, kaputt);
      expect(s2.ok, String(kaputt)).toBe(false);
      expect(s2.state).toEqual(laufend);
    }
    // Unbrauchbare Verweildauer ✓ und leerer Bezeichner ✓.
    expect(hoverTick(laufend, 500, Number.NaN).reason).toBe('tab-hover-dwell-invalid');
    expect(hoverTick(laufend, 500, -1).reason).toBe('tab-hover-dwell-invalid');
    expect(hoverTab(laufend, '   ', 500, true).reason).toBe('tab-hover-id-invalid');
    expect(hoverTab(laufend, 42, 500, true).reason).toBe('tab-hover-id-invalid');
    // **Die Uhr läuft rückwärts** ✓ — eine Verweildauer mit negativem Vorzeichen ist keine ✓.
    expect(hoverTick(laufend, 50).reason).toBe('tab-hover-time-went-backwards');
    // Verlassen ohne Verweilen ✓ und Verlassen eines **anderen** Tabs ✓ — benannte No-ops ✓.
    expect(leaveTab(createTabHover(), 'grid', 0).reason).toBe('tab-hover-not-hovering');
    expect(leaveTab(laufend, 'notes', 0).reason).toBe('tab-hover-other-tab');
  });

  it('**zwei Aufrufe in EINER Instanz sammeln sich** (die W-397-Regel)', () => {
    // Betreten, warten, aktivieren, verlassen, neu betreten — alles in **einem** Zustandsfaden ✓.
    let s = createTabHover();
    s = hoverTab(s, 'a', 0, true).state;
    s = hoverTick(s, TAB_HOVER_DWELL_MS).state;
    expect(s.activatedTabId).toBe('a');
    s = leaveTab(s, 'a', TAB_HOVER_DWELL_MS + 1).state;
    s = hoverTab(s, 'b', TAB_HOVER_DWELL_MS + 2, true).state;
    s = hoverTick(s, TAB_HOVER_DWELL_MS * 2 + 2).state;
    expect(s.activatedTabId).toBe('b');
    // **Und der frühere Tab bleibt vergessen** ✓ — kein Nachwirken ✗.
    expect(s.hoveredTabId).toBe('b');
  });
});
