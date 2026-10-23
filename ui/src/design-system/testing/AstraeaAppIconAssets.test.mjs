import { existsSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_APP_KINDS, PREMIUM_ONLY_APP_KINDS } from '../../edition/contracts';
import { getAstraeaAppIconSrc, hasAstraeaAppIcon } from '../brand/AstraeaAppIcon';

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public');

function expectShippedIcon(kind) {
  const source = getAstraeaAppIconSrc(kind);
  expect(source, `${kind} must map to a local public icon`).toMatch(/^\/(?:astraea-icons|branding)\//);

  const assetPath = resolve(publicRoot, source.slice(1));
  const pathFromPublicRoot = relative(publicRoot, assetPath);
  expect(pathFromPublicRoot, `${kind} icon must stay under ui/public`).not.toMatch(/^\.\.(?:[\\/]|$)/);
  expect(pathFromPublicRoot, `${kind} icon path must not be absolute`).not.toMatch(/^[A-Za-z]:[\\/]/);
  expect(existsSync(assetPath), `${kind} icon asset must exist: ${source}`).toBe(true);
}

describe('Astraea app icon asset coverage', () => {
  it('resolves an existing local icon for every user-facing app kind', () => {
    for (const kind of ALL_APP_KINDS) {
      expect(hasAstraeaAppIcon(kind), `${kind} must have a visible app identity`).toBe(true);

      if (kind === 'AdminPolicy') {
        expect(getAstraeaAppIconSrc(kind)).toBeUndefined();
        continue;
      }

      expectShippedIcon(kind);
    }
  });

  it('keeps all six Premium catalog teaser kinds backed by their allowed local icons', () => {
    expect(PREMIUM_ONLY_APP_KINDS).toHaveLength(6);
    for (const kind of PREMIUM_ONLY_APP_KINDS) expectShippedIcon(kind);
  });
});
