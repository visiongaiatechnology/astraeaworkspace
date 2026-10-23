// STATUS: PLATIN — recursively validate every shared shell locale catalog.

import { describe, expect, it } from 'vitest';
import type { WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { SHELL_SURFACE_COPY } from '../shellSurfaceLocale';

const SUPPORTED_LOCALES: readonly WorkspaceLocale[] = [
  'en-US', 'de-DE', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN',
];

type CatalogNode =
  | { kind: 'object' }
  | { kind: 'string'; value: string };

type CatalogIndex = Map<string, CatalogNode>;

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function indexCatalog(
  value: unknown,
  locale: WorkspaceLocale,
  path: readonly string[] = [],
  index: CatalogIndex = new Map<string, CatalogNode>(),
): CatalogIndex {
  const key = pathKey(path);

  if (typeof value === 'string') {
    index.set(key, { kind: 'string', value });
    expect(value.trim(), `${locale} catalog string at ${key}`).not.toBe('');
    return index;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${locale} catalog node at ${key} must be an object or a non-empty string`);
  }

  if (path.length > 0) index.set(key, { kind: 'object' });

  const entries = Object.entries(value);
  if (path.length > 0) {
    expect(entries.length, `${locale} catalog object at ${key}`).toBeGreaterThan(0);
  }

  for (const [childKey, childValue] of entries) {
    indexCatalog(childValue, locale, [...path, childKey], index);
  }

  return index;
}

function buildCatalogIndexes(): Map<WorkspaceLocale, CatalogIndex> {
  expect(Object.keys(SHELL_SURFACE_COPY).sort()).toEqual([...SUPPORTED_LOCALES].sort());

  const indexes = new Map<WorkspaceLocale, CatalogIndex>();
  for (const locale of SUPPORTED_LOCALES) {
    indexes.set(locale, indexCatalog(SHELL_SURFACE_COPY[locale], locale));
  }
  return indexes;
}

function placeholderSet(value: string): string[] {
  const matches = value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g);
  return [...new Set([...matches].map((match) => match[1] ?? ''))].sort();
}

describe('seven-locale shell surface catalog parity', () => {
  it('keeps every recursive key path and node kind identical with non-empty string leaves', () => {
    const indexes = buildCatalogIndexes();
    const baseline = indexes.get('en-US');
    if (!baseline) throw new Error('The en-US shell surface catalog is missing.');

    const expectedPaths = [...baseline.keys()].sort();
    for (const locale of SUPPORTED_LOCALES) {
      const current = indexes.get(locale);
      if (!current) throw new Error(`The ${locale} shell surface catalog is missing.`);

      expect([...current.keys()].sort(), `${locale} recursive key paths`).toEqual(expectedPaths);
      for (const [path, baselineNode] of baseline) {
        expect(current.get(path)?.kind, `${locale} node kind at ${path}`).toBe(baselineNode.kind);
      }
    }
  });

  it('keeps the exact named placeholder set at every localized string path', () => {
    const indexes = buildCatalogIndexes();
    const baseline = indexes.get('en-US');
    if (!baseline) throw new Error('The en-US shell surface catalog is missing.');

    for (const locale of SUPPORTED_LOCALES) {
      const current = indexes.get(locale);
      if (!current) throw new Error(`The ${locale} shell surface catalog is missing.`);

      for (const [path, baselineNode] of baseline) {
        if (baselineNode.kind !== 'string') continue;

        const currentNode = current.get(path);
        expect(currentNode?.kind, `${locale} string at ${path}`).toBe('string');
        if (currentNode?.kind !== 'string') continue;

        expect(placeholderSet(currentNode.value), `${locale} placeholders at ${path}`).toEqual(
          placeholderSet(baselineNode.value),
        );
      }
    }
  });
});
