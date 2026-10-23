// STATUS: PLATIN — Writer protected-character tests
import { describe, expect, it } from 'vitest';
import { writerSpecialCharacter } from '../../../../editing/special-characters/writerSpecialCharacters';

describe('Writer special characters', () => {
  it.each([
    ['no-break-space', '\u00A0', 'U+00A0'],
    ['narrow-no-break-space', '\u202F', 'U+202F'],
    ['non-breaking-hyphen', '\u2011', 'U+2011'],
    ['soft-hyphen', '\u00AD', 'U+00AD'],
    ['word-joiner', '\u2060', 'U+2060'],
  ])('maps %s to its exact Unicode scalar', (id, value, codePoint) => {
    expect(writerSpecialCharacter(id)).toMatchObject({ value, codePoint });
  });
});
