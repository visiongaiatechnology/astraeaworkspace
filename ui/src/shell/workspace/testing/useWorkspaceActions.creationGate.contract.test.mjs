// STATUS: PLATIN — Release-Blocker: the Beta creation gate must be a chokepoint, not a surface filter.
//
// The admin-&-policy Beta gate can only hold if every ingress (command palette, launcher, start center,
// templates, imported/derived documents) passes through `useWorkspaceActions`' creation check. The
// command palette calls `actions.handleCreateDocument(kind)` directly, so the check must live there —
// checking only `isImplementedApp` (edition availability) is not enough.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ACTIONS = readFileSync('src/shell/workspace/useWorkspaceActions.ts', 'utf8');
const CATALOG_DIR = 'src/shell/localization/workspaceLocaleCatalog';

function handlerBlock(name) {
  const start = ACTIONS.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`handler ${name} not found`);
  const next = ACTIONS.indexOf('const handle', start + 1);
  return ACTIONS.slice(start, next < 0 ? undefined : next);
}

describe('Beta creation gate in useWorkspaceActions', () => {
  it('defines the creation gate on the edition registry Beta release status', () => {
    expect(ACTIONS).toContain('const requireCreatableKind = useCallback');
    expect(ACTIONS).toContain('editionRegistry.isCreationAvailable(kind)');
    expect(ACTIONS).toContain("workspaceText('edition.creationUnavailable', locale)");
  });

  it.each([
    ['handleCreateDocument', 1],
    ['handleCreateTemplate', 2],
    ['handleCreateDerivedDocument', 1],
  ])('%s passes through the creation gate (%i checks)', (handler, expectedChecks) => {
    const block = handlerBlock(handler);
    expect(block, `${handler} must not use the weaker implemented-check`).not.toContain('requireImplementedKind(');
    expect(block.match(/requireCreatableKind\(/gu)?.length ?? 0).toBe(expectedChecks);
  });

  it('every supported locale carries the gate message', () => {
    const locales = ['de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN'];
    for (const locale of locales) {
      const source = readFileSync(`${CATALOG_DIR}/${locale}.ts`, 'utf8');
      expect(source, `${locale} misses edition.creationUnavailable`).toContain("'edition.creationUnavailable'");
    }
  });
});
