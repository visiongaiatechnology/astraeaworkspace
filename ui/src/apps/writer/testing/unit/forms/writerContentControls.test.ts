// STATUS: DIAMANT VGT SUPREME — Writer Content-Control / Form-Filling Regression Packet
import { describe, expect, it } from 'vitest';
import {
  addWriterRepeatingItem,
  createWriterContentControl,
  normalizeWriterContentControls,
  updateWriterContentControlValue,
  updateWriterRepeatingItem,
  WriterContentControlError,
} from '../../../forms/content-controls/writerContentControls';

describe('Writer content controls', () => {
  it('normalizes bounded controls and rejects orphaned paragraph bindings', () => {
    const controls = normalizeWriterContentControls([
      { id: 'field-1', type: 'text', title: ' Name ', paragraphId: 'p1', value: 'René\u0000 Körner' },
      { id: 'field-2', type: 'dropdown', title: 'Status', paragraphId: 'missing', options: ['A', 'B'], value: 'A' },
      { id: 'field-1', type: 'checkbox', title: 'Duplicate', paragraphId: 'p1', checked: true },
    ], new Set(['p1']));
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ id: 'field-1', title: 'Name', paragraphId: 'p1', type: 'text', value: 'René Körner' });
  });

  it('enforces dropdown/date/picture constraints during form filling', () => {
    const dropdown = normalizeWriterContentControls([
      { id: 'd1', type: 'dropdown', title: 'Role', paragraphId: 'p1', options: ['A', 'B'], value: 'A' },
    ])[0];
    expect(dropdown?.type).toBe('dropdown');
    if (!dropdown) throw new Error('fixture broken');
    expect(() => updateWriterContentControlValue(dropdown, 'C')).toThrow(WriterContentControlError);

    const date = normalizeWriterContentControls([
      { id: 'date', type: 'date', title: 'Date', paragraphId: 'p1', min: '2026-01-01', max: '2026-12-31' },
    ])[0];
    if (!date) throw new Error('fixture broken');
    expect(() => updateWriterContentControlValue(date, '2027-01-01')).toThrow(/erlaubten Bereich/);

    const picture = normalizeWriterContentControls([
      { id: 'pic', type: 'picture', title: 'Portrait', paragraphId: 'p1' },
    ])[0];
    if (!picture) throw new Error('fixture broken');
    expect(() => updateWriterContentControlValue(picture, 'unknown-image', new Set(['image-1']))).toThrow(/nicht Teil/);
  });

  it('gives repeating-section items fresh stable identities and bounded updates', () => {
    const control = createWriterContentControl('repeating_section', 'p1', 'Participants');
    const withItem = addWriterRepeatingItem(control, 'Alice');
    expect(withItem.type).toBe('repeating_section');
    if (withItem.type !== 'repeating_section') throw new Error('fixture broken');
    expect(withItem.items).toHaveLength(1);
    expect(withItem.items[0].id).toBeTruthy();
    const updated = updateWriterRepeatingItem(withItem, withItem.items[0].id, 'Bob');
    if (updated.type !== 'repeating_section') throw new Error('fixture broken');
    expect(updated.items[0].value).toBe('Bob');
  });

  it('refuses to mutate locked controls', () => {
    const control = { ...createWriterContentControl('text', 'p1', 'Locked'), locked: true };
    expect(() => updateWriterContentControlValue(control, 'new value')).toThrow(/gesperrt/);
  });
});
