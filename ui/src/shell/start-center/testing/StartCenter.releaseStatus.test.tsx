// STATUS: PLATIN — ehrliche Verfügbarkeits-/Alpha-Kennzeichnung in Start-Center und App-Launcher.
//
// **Was hier gemessen wird (Beta 0.1, Alpha-Runde):**
//   • Jede nutzbare App im Start-Tool-Grid trägt genau eine sichtbare Verfügbarkeitsstufe:
//     **ALPHA** („im Aufbau, Funktionen können sich ändern") oder **IM AUSBAU** („nicht alle Funktionen
//     verfügbar") — abgeleitet aus der zentralen Release-Registry, nicht aus einer zweiten Einstufung.
//   • Der Hinweis steht als Text da, nicht nur als Farbe. Die Release-Stufe bleibt als
//     `data-release-status` (Diagnose/Tooltip) erhalten.
//   • Das gesperrte Sicherheits-Gate Admin & Policy bleibt deaktiviert; Premium-Apps bleiben Teaser.
//   • Das wiederverwendbare `AppAvailabilityBadge` (für `StartAppOverview`) liefert dieselbe Kennzeichnung.
//
// Die Locale wird auf Deutsch festgelegt: Die Beta-Kennzeichnung muss für die deutschsprachige Beta
// sichtbar deutsch sein; die englische Ansicht wird in den App-Guide-Tests geprüft.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppAvailabilityBadge, StartToolGrid } from '../StartToolGrid';
import { createEditionRegistry } from '../../../edition/registry';
import { AppLauncherDrawer } from '../../app-launcher/AppLauncherDrawer';

const AVAILABILITY_COPY: Readonly<Record<string, string>> = {
  'edition.premiumRequired': 'Nur in Premium verfügbar',
  'edition.appUnavailable': 'Diese Anwendung ist ausschließlich in Astraea Workspace Premium verfügbar.',
  'availability.alpha': 'ALPHA',
  'availability.alphaHint': 'Alpha – im Aufbau, Funktionen können sich ändern.',
  'availability.inProgress': 'IM AUSBAU',
  'availability.inProgressHint': 'Im Ausbau – nicht alle Funktionen sind verfügbar.',
};

vi.mock('../../localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: 'de-DE' }),
  workspaceText: (key: string) => AVAILABILITY_COPY[key] ?? key,
}));

const renderGrid = (edition: 'open-core' | 'premium' = 'open-core') => renderToStaticMarkup(
  <StartToolGrid searchQuery="" activeCategory="all" onSelectModule={() => undefined} editionRegistry={createEditionRegistry(edition)} />,
);

const renderLauncher = (edition: 'open-core' | 'premium' = 'open-core') => renderToStaticMarkup(
  <AppLauncherDrawer isOpen onClose={() => undefined} onSelectApp={() => undefined} editionRegistry={createEditionRegistry(edition)} />,
);

/** Schneidet den Markup-Block einer einzelnen App-Karte heraus (der Kartenname identifiziert sie). */
function cardBlock(markup: string, name: string): string {
  const cards = markup.split('<article data-availability').slice(1);
  return cards.find((candidate) => candidate.includes(`<span>${name}</span>`)) ?? '';
}

describe('Start Center availability labelling (Beta 0.1)', () => {
  it('marks fully usable core modules and the approved Vault gate as ALPHA with the visible hint', () => {
    const markup = renderGrid();
    for (const name of ['Astraea Writer', 'Astraea Grid', 'Astraea Present', 'Astraea Notes', 'Astraea Tasks', 'Astraea Vault']) {
      const card = cardBlock(markup, name);
      expect(card, name).toContain('data-availability-badge="alpha"');
      expect(card, name).toContain('data-availability-class="alpha"');
      expect(card, name).toContain('>ALPHA<');
      expect(card, name).toContain(AVAILABILITY_COPY['availability.alphaHint']);
    }
  });

  it('marks preview and limited apps as IM AUSBAU with "not all features" hint', () => {
    const markup = renderGrid();
    for (const name of ['Astraea Whiteboard', 'Astraea Draw', 'Astraea PDF Studio', 'Astraea Publish', 'Astraea Insight', 'Astraea Connect', 'Astraea Automate', 'Astraea Admin &amp; Policy']) {
      const card = cardBlock(markup, name);
      expect(card, name).toContain('data-availability-badge="in-progress"');
      expect(card, name).toContain('data-availability-class="in-progress"');
      expect(card, name).toContain('IM AUSBAU');
      expect(card, name).toContain(AVAILABILITY_COPY['availability.inProgressHint']);
    }
  });

  it('keeps the release tier as machine-readable metadata and the Vault limits in the tooltip', () => {
    const markup = renderGrid();
    expect(cardBlock(markup, 'Astraea Writer')).toContain('data-release-status="core-beta"');
    expect(cardBlock(markup, 'Astraea Whiteboard')).toContain('data-release-status="base-preview"');
    expect(cardBlock(markup, 'Astraea Publish')).toContain('data-release-status="feature-preview"');
    expect(cardBlock(markup, 'Astraea Connect')).toContain('data-release-status="limited-preview"');
    const vault = cardBlock(markup, 'Astraea Vault');
    expect(vault).toContain('data-release-status="security-gate-approved"');
    // Die konkreten Grenzen des geprüften Gates stehen im Tooltip, nicht nur ein grünes Siegel.
    expect(vault).toContain('Gerätemodus');
    expect(vault).toContain('Wiederherstellungsschlüssel');
  });

  it('renders one availability legend for both classes', () => {
    const markup = renderGrid();
    expect(markup).toContain('data-availability-legend="true"');
    expect(markup).toContain(AVAILABILITY_COPY['availability.alpha']);
    expect(markup).toContain(AVAILABILITY_COPY['availability.inProgress']);
  });

  it('disables the blocked Admin & Policy security gate instead of offering a working start button', () => {
    const markup = renderGrid();
    const admin = cardBlock(markup, 'Astraea Admin &amp; Policy');
    expect(admin).toContain('data-release-status="security-gate-blocked"');
    expect(admin).toContain('aria-disabled="true"');
    expect(admin).toContain('Sicherheits-Gate gesperrt');
    // Der Start-Button darf nicht als normaler Startknopf erscheinen (kein aria-label „… · Starten").
    expect(admin).not.toContain('Astraea Admin &amp; Policy · Starten');
  });

  it('keeps Premium-only apps as Premium teasers without an availability badge', () => {
    const markup = renderGrid();
    const planner = cardBlock(markup, 'Astraea Planner');
    expect(planner).toContain('data-availability="premium-required"');
    expect(planner).not.toContain('data-availability-badge');
  });
});

describe('AppAvailabilityBadge reuse contract (StartAppOverview)', () => {
  it('renders the same localized badge for a given kind', () => {
    const alpha = renderToStaticMarkup(<AppAvailabilityBadge kind="Notes" />);
    expect(alpha).toContain('data-app-overview-availability="alpha"');
    expect(alpha).toContain('>ALPHA<');
    expect(alpha).toContain(AVAILABILITY_COPY['availability.alphaHint']);

    const inProgress = renderToStaticMarkup(<AppAvailabilityBadge kind="Connect" />);
    expect(inProgress).toContain('data-app-overview-availability="in-progress"');
    expect(inProgress).toContain('IM AUSBAU');
    expect(inProgress).toContain(AVAILABILITY_COPY['availability.inProgressHint']);
  });
});

describe('App Launcher release labelling (Beta 0.1)', () => {
  it('carries the honest release tier onto each launcher card', () => {
    const html = renderLauncher();
    expect(html).toContain('data-release-status="core-beta"');
    expect(html).toContain('ALPHA · Kernfunktion');
    expect(html).toContain('data-release-status="security-gate-approved"');
    expect(html).toContain('ALPHA · Sicherheits-Gate geprüft');
  });

  it('blocks Admin & Policy in the launcher with a named reason', () => {
    const html = renderLauncher();
    expect(html).toContain('data-release-status="security-gate-blocked"');
    expect(html).toContain('IM AUSBAU · Sicherheits-Gate gesperrt');
  });
});
