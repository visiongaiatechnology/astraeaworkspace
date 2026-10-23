import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(here, '../../../../crates/vgt-desktop/tauri.conf.json');
const expectedExtensions = ["vauto", "vboard", "vconnect", "vdoc", "vdraw", "vgrid", "vinsight", "vnote", "vpdf", "vpolicy", "vpresent", "vpub", "vtask", "vvault", "vwc"];

describe('single-edition Tauri file associations', () => {
  it("registers exactly this tree's supported document formats", () => {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const actual = [...new Set((config.bundle.fileAssociations ?? []).flatMap((entry) => entry.ext ?? []))]
      .map((extension) => extension.toLowerCase().replace(/^\./u, ''))
      .sort();
    expect(actual).toEqual(expectedExtensions);
    expect(config.bundle.resources).toEqual([]);
  });
});
