import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../app/WhiteboardCanvas.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../canvas/WhiteboardCanvas.css', import.meta.url), 'utf8');
const controlsStart = source.indexOf('{/* Viewport controls */}');
const controlsEnd = source.indexOf('{/* Floating Notification Toast */}', controlsStart);
const controls = source.slice(controlsStart, controlsEnd);

function getButtonMarkup(label) {
  const labelIndex = controls.indexOf(`>${label}</button>`);
  if (labelIndex < 0) throw new Error(`Viewport control button not found: ${label}`);
  const buttonStart = controls.lastIndexOf('<button', labelIndex);
  const buttonEnd = controls.indexOf('</button>', labelIndex) + '</button>'.length;
  return controls.slice(buttonStart, buttonEnd);
}

describe('Whiteboard viewport controls theme and interaction contract', () => {
  it('uses workspace surface, text, border, and accent tokens for the viewport toolbar', () => {
    expect(source).toContain('className="whiteboard-viewport-controls absolute');
    expect(styles).toContain('var(--vgt-control-surface');
    expect(styles).toContain('var(--vgt-control-border');
    expect(styles).toContain('var(--vgt-control-text');
    expect(styles).toContain('var(--vgt-control-muted');
    expect(styles).toContain('var(--vgt-control-hover');
    expect(styles).toContain('var(--vgt-accent-soft');
    expect(styles).toContain('var(--vgt-accent-strong');
    expect(styles).toContain('var(--vgt-focus');
    expect(styles).toContain('.whiteboard-viewport-controls__button[aria-pressed="true"]');
    expect(styles).toContain('.whiteboard-viewport-controls__button:focus-visible');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('forced-colors: active');
    expect(styles).not.toMatch(/\.whiteboard-(?:item|sticky|diagram)/);
  });

  it('exposes pressed state for panel and ruler toggles while retaining each action callback', () => {
    // Ergänzung 7 §4: the panel toggles no longer write a free boolean each. They toggle the panel in
    // its dock area, and the boolean they read is derived from that set (`state/whiteboardPanelDock.ts`).
    // The state expression and the dock id are still pinned per button.
    const toggles = [
      ['Rulers', 'view.showRulers', "setShowRulers(!view.showRulers)"],
      ['Navigate', 'showNavigator', "toggleDockPanel('navigator')"],
      ['Diagram', 'showDiagramPanel', "toggleDockPanel('diagram')"],
      ['Templates', 'showTemplatePanel', "toggleDockPanel('templates')"],
      ['Facilitate', 'showFacilitationPanel', "toggleDockPanel('facilitation')"],
      ['Search', 'showOrganizationPanel', "toggleDockPanel('organization')"],
      ['Live objects', 'showLiveObjectsPanel', "toggleDockPanel('live-objects')"],
    ];

    for (const [label, state, callback] of toggles) {
      const button = getButtonMarkup(label);
      expect(button, label).toContain(`aria-pressed={${state}}`);
      expect(button, label).toContain(`onClick={() => ${callback}}`);
    }

    const collaboration = controls.slice(controls.indexOf('<button type="button" aria-pressed={showCollaborationPanel}'));
    expect(collaboration.slice(0, collaboration.indexOf('</button>'))).toContain("toggleDockPanel('collaboration')");
    expect(getButtonMarkup('Live objects')).not.toContain("toggleDockPanel('object-list')");
    expect(controls).toContain('role="group" aria-label="Whiteboard viewport controls"');
  });

  it('preserves viewport actions and removes fixed dark-only colors from this toolbar', () => {
    for (const callback of [
      'setZoom((prev) => prev / 1.15)',
      'setZoom((prev) => prev * 1.15)',
      'onClick={fitAll}',
      'onClick={fitSelection}',
      'setZoom(1)',
      'setBackgroundStyle(event.target.value as',
      'setGridSize(Number(event.target.value))',
      "addGuide('x')",
      "addGuide('y')",
      'addBookmark()',
      'presentStep(1)',
      'exportWhiteboardToPNG(document.title, items)',
    ]) {
      expect(controls).toContain(callback);
    }

    expect(controls).not.toMatch(/(?:bg-slate-900|bg-slate-950|text-slate-|border-white\/|bg-white\/)/);
  });
});
