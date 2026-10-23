// STATUS: PLATIN — Alpha 0.1 structural contract: first-start overview + overview return path.
//
// Behaviour is covered by StartAppOverview.test.tsx and Header.overview.test.tsx. This contract pins the
// **integration**, which render tests of a single component cannot see:
//   * the overview is mounted on the start page directly after the hero and before the library branch,
//   * it is driven by the existing Start Center handlers (open recent document / create document),
//   * the header button is wired to the existing start-center state and hidden while the start surface is open,
//   * every one of the seven locale catalogs carries the new copy (typed, so a missing key breaks tsc too).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const START_CENTER = readFileSync('src/shell/start-center/StartCenter.tsx', 'utf8');
const FRAME = readFileSync('src/app/WorkspaceApplicationFrame.tsx', 'utf8');
const HEADER = readFileSync('src/shell/header/Header.tsx', 'utf8');
const TYPES = readFileSync('src/shell/localization/workspaceLocaleTypes.ts', 'utf8');
const LOCALES = ['de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN'];

describe('start page app overview wiring', () => {
  it('mounts the overview on the default start page, after the hero and before the library branch', () => {
    expect(START_CENTER).toContain("import { StartAppOverview } from './StartAppOverview';");
    const overviewIndex = START_CENTER.indexOf('<StartAppOverview');
    const conditionalIndex = START_CENTER.indexOf('{/* Conditional Content by Category */}');
    expect(overviewIndex).toBeGreaterThan(-1);
    expect(conditionalIndex).toBeGreaterThan(-1);
    expect(overviewIndex).toBeLessThan(conditionalIndex);
    expect(START_CENTER).toContain("activeCategory === 'all' && !searchQuery.trim()");
  });

  it('uses the existing Start Center handlers instead of introducing a second navigation path', () => {
    const block = START_CENTER.slice(START_CENTER.indexOf('<StartAppOverview'), START_CENTER.indexOf('/>', START_CENTER.indexOf('<StartAppOverview')) + 2);
    expect(block).toContain('onOpenRecentDocument(documentId)');
    expect(block).toContain('onCreateDocument(kind)');
    expect(block).toContain('onClose()');
    // No new callback plumbing in the shared props contract for the overview itself.
    expect(START_CENTER).not.toContain('onOpenOverview');
  });

  it('reuses the release-modules availability badge instead of inventing a second classification', () => {
    expect(START_CENTER).toContain("import { StartToolGrid, AppAvailabilityBadge } from './StartToolGrid';");
    expect(START_CENTER).toContain('renderBadge={(kind) => <AppAvailabilityBadge kind={kind} />}');
  });

  it('wires the header button to the existing start-center state and hides it on the start surface', () => {
    expect(FRAME).toContain('onOpenStartCenter={isStartCenterOpen || isSetupWizardOpen ? undefined : () => setIsStartCenterOpen(true)}');
    expect(HEADER).toContain('onOpenStartCenter?: () => void;');
    expect(HEADER).toContain('data-workspace-action="overview"');
    expect(HEADER).toContain("workspaceText('header.overview', locale)");
  });

  it('ships complete copy in all seven locales', () => {
    const keys = ['header.overview', 'start.overview.title', 'start.overview.description', 'start.overview.open', 'start.overview.create', 'start.overview.empty'];
    for (const key of keys) expect(TYPES, key).toContain(`'${key}'`);
    for (const locale of LOCALES) {
      const catalog = readFileSync(`src/shell/localization/workspaceLocaleCatalog/${locale}.ts`, 'utf8');
      for (const key of keys) expect(catalog, `${locale} misses ${key}`).toContain(`'${key}':`);
    }
    // English must not silently reuse German labels on the first-start surface.
    const english = readFileSync('src/shell/localization/workspaceLocaleCatalog/en-US.ts', 'utf8');
    expect(english).not.toContain("'start.overview.open': 'Öffnen'");
    expect(english).not.toContain("'header.overview': 'Übersicht'");
  });
});
