// STATUS: PLATIN — the mode switch exposes its state to assistive technology (W-247)
//
// W-247: the Live/Snapshot switch signalled its state through colour and background only. Sighted users saw
// which one was active; a screen reader announced two buttons with no state at all.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const modalPath = path.resolve(here, '../../../integrations/grid/WriterGridEmbedModal.tsx');
const modal = readFileSync(modalPath, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

describe('the Live/Snapshot choice is programmatically determinable', () => {
  it('marks both buttons as pressed or not pressed', () => {
    expect(modal).toContain("aria-pressed={mode === 'Live'}");
    expect(modal).toContain("aria-pressed={mode === 'Snapshot'}");
  });

  it('names the group it belongs to', () => {
    expect(modal).toContain('role="group"');
    expect(modal).toContain('aria-label="Darstellung des eingebetteten Objekts"');
  });

  it('keeps the visible labels, so the state is not colour alone', () => {
    expect(modal).toContain('Live verknüpft');
    expect(modal).toContain('Snapshot');
  });

  it('still switches the mode', () => {
    expect(modal).toContain("onClick={() => setMode('Live')}");
    expect(modal).toContain("onClick={() => setMode('Snapshot')}");
  });
});
