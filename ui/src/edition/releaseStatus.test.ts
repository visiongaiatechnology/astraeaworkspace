import { describe, expect, it } from 'vitest';
import { ALL_APP_KINDS, OPEN_CORE_APP_KINDS, PREMIUM_ONLY_APP_KINDS, type AppKind } from './contracts';
import {
  RELEASE_STATUS_BY_APP,
  RELEASE_STATUS_DEFINITIONS,
  availabilityClassOf,
  availabilityReason,
  isCreatableInBeta,
  releaseStatusDefinition,
  releaseStatusDetail,
  releaseStatusLabel,
  releaseStatusOf,
  securityGateDecisionOf,
} from './releaseStatus';
import { createEditionRegistry } from './registry';
import { APP_CATALOG } from './catalog';

describe('Beta release tiers — honest labelling per app kind', () => {
  it('assigns a release status to every known app kind (no unmapped app)', () => {
    expect(Object.keys(RELEASE_STATUS_BY_APP).sort()).toEqual([...ALL_APP_KINDS].sort());
    for (const kind of ALL_APP_KINDS) {
      const status = releaseStatusOf(kind);
      expect(RELEASE_STATUS_DEFINITIONS[status]).toBeDefined();
      expect(releaseStatusDefinition(kind).label.de.trim()).not.toBe('');
      expect(releaseStatusDefinition(kind).label.en.trim()).not.toBe('');
      expect(releaseStatusDefinition(kind).detail.de.trim()).not.toBe('');
      expect(releaseStatusDefinition(kind).detail.en.trim()).not.toBe('');
    }
  });

  it('mirrors the user-prioritised tiers exactly', () => {
    const expected: Partial<Record<AppKind, string>> = {
      Writer: 'core-beta', Grid: 'core-beta', Present: 'core-beta', Notes: 'core-beta', Tasks: 'core-beta',
      Whiteboard: 'base-preview', Draw: 'base-preview', PdfStudio: 'base-preview',
      Publish: 'feature-preview', Insight: 'feature-preview',
      Connect: 'limited-preview', Automate: 'limited-preview',
      Vault: 'security-gate-approved', AdminPolicy: 'security-gate-blocked',
    };
    for (const [kind, status] of Object.entries(expected)) {
      expect(releaseStatusOf(kind as AppKind)).toBe(status);
    }
    // Premium-only apps are not silently re-labelled as released Open Core modules.
    for (const kind of PREMIUM_ONLY_APP_KINDS) expect(releaseStatusOf(kind)).toBe('premium-only');
  });

  it('keeps the security gate decisions explicit and conservative', () => {
    expect(securityGateDecisionOf('Vault')).toBe('approved');
    expect(securityGateDecisionOf('AdminPolicy')).toBe('blocked');
    expect(securityGateDecisionOf('Writer')).toBeNull();
    // The blocked gate must never be creatable in the Beta; the approved gate may be.
    expect(isCreatableInBeta('AdminPolicy')).toBe(false);
    expect(isCreatableInBeta('Vault')).toBe(true);
    for (const kind of OPEN_CORE_APP_KINDS) {
      if (kind !== 'AdminPolicy') expect(isCreatableInBeta(kind)).toBe(true);
    }
  });

  it('states the concrete limitations of both security gates instead of a vague promise', () => {
    const vault = releaseStatusDetail('Vault', 'de-DE');
    expect(vault).toContain('Gerätemodus');
    expect(vault).toContain('Wiederherstellungsschlüssel');
    expect(releaseStatusDetail('Vault', 'en-US')).toContain('device mode');

    const admin = releaseStatusDetail('AdminPolicy', 'de-DE');
    expect(admin).toContain('nicht durchgesetzt');
    expect(admin).toContain('nicht freigegeben');
  });

  it('labels in German for German locales and English otherwise', () => {
    expect(releaseStatusLabel('Notes', 'de-DE')).toBe('ALPHA · Kernfunktion');
    expect(releaseStatusLabel('Notes', 'de')).toBe('ALPHA · Kernfunktion');
    expect(releaseStatusLabel('Notes', 'en-US')).toBe('ALPHA · core feature');
    expect(releaseStatusLabel('Vault', 'de-DE')).toContain('Sicherheits-Gate geprüft');
    expect(releaseStatusLabel('AdminPolicy', 'de-DE')).toContain('gesperrt');
  });

  it('exposes the same decision through the edition registry (UI and registry cannot disagree)', () => {
    for (const edition of ['open-core', 'premium'] as const) {
      const registry = createEditionRegistry(edition);
      expect(registry.releaseStatuses).toEqual(RELEASE_STATUS_BY_APP);
      for (const kind of ALL_APP_KINDS) {
        expect(registry.getReleaseStatus(kind)).toBe(releaseStatusOf(kind));
      }
      expect(registry.isCreationAvailable('Grid')).toBe(true);
      expect(registry.isCreationAvailable('AdminPolicy')).toBe(false);
      // Creation availability never widens what the edition implements.
      expect(registry.isCreationAvailable('Planner')).toBe(edition === 'premium');
    }
    const openCore = createEditionRegistry('open-core');
    expect(openCore.isCreationAvailable('Planner')).toBe(false);
    expect(openCore.isCreationAvailable('not-an-app')).toBe(false);
    expect(openCore.isCreationAvailable(null)).toBe(false);
  });

  it('exposes only beta-creatable apps to creation paths (blocked gate is not a start button)', () => {
    const openCore = createEditionRegistry('open-core');
    expect(openCore.creatableApps.map((app) => app.kind)).not.toContain('AdminPolicy');
    expect(openCore.creatableApps.map((app) => app.kind)).toContain('Vault');
    expect(openCore.creatableApps.map((app) => app.kind)).toContain('Notes');
    expect(openCore.creatableApps.map((app) => app.kind)).toContain('Tasks');
    // The creation list is a strict subset of the implemented apps, and never grows the edition.
    for (const app of openCore.creatableApps) expect(openCore.isImplementedApp(app.kind)).toBe(true);
    expect(openCore.creatableApps.length).toBe(openCore.implementedApps.length - 1);

    const premium = createEditionRegistry('premium');
    expect(premium.creatableApps.map((app) => app.kind)).toContain('Planner');
    expect(premium.creatableApps.map((app) => app.kind)).not.toContain('AdminPolicy');
  });

  it('never labels a catalog-only app as a released Open Core module', () => {
    const openCore = createEditionRegistry('open-core');
    for (const app of openCore.catalogApps) {
      expect(openCore.isImplementedApp(app.kind)).toBe(false);
      expect(openCore.isCreationAvailable(app.kind)).toBe(false);
    }
    // Every catalog entry has a definition, including apps the open-core source does not contain.
    for (const app of APP_CATALOG) {
      expect(RELEASE_STATUS_BY_APP[app.kind]).toBeDefined();
    }
  });

  it('derives the two visible availability classes from the release tiers (no upgrade)', () => {
    // ALPHA = im beworbenen Umfang nutzbar: Kernmodule plus das geprüfte Sicherheits-Gate Vault.
    for (const kind of ['Writer', 'Grid', 'Present', 'Notes', 'Tasks', 'Vault'] as const) {
      expect(availabilityClassOf(kind), kind).toBe('alpha');
    }
    // IM AUSBAU = Preview-Stufen und gesperrte Gates — ehrlich als unvollständig gekennzeichnet.
    for (const kind of ['Whiteboard', 'Draw', 'PdfStudio', 'Publish', 'Insight', 'Connect', 'Automate', 'AdminPolicy'] as const) {
      expect(availabilityClassOf(kind), kind).toBe('in-progress');
    }
    // Die Klasse ist eine reine Ableitung, keine zweite Wahrheit: jede Stufe hat genau eine Klasse.
    const classesByStatus = new Set(Object.values(RELEASE_STATUS_BY_APP).map((status) => availabilityClassOf(Object.keys(RELEASE_STATUS_BY_APP).find((kind) => RELEASE_STATUS_BY_APP[kind as AppKind] === status) as AppKind)));
    expect([...classesByStatus].sort()).toEqual(['alpha', 'in-progress']);
    for (const kind of ALL_APP_KINDS) {
      expect(['alpha', 'in-progress'], kind).toContain(availabilityClassOf(kind));
    }
  });

  it('explains each availability class without promising completion', () => {
    const alphaText = availabilityReason('Notes', 'de-DE');
    expect(alphaText).toContain('Kernfunktion');
    const blockedText = availabilityReason('AdminPolicy', 'de-DE');
    expect(blockedText).toContain('gesperrt');
    expect(blockedText).toContain('durchgesetzt');
    const previewText = availabilityReason('Publish', 'en-US');
    expect(previewText).toContain('preview');
    for (const kind of ALL_APP_KINDS) {
      expect(availabilityReason(kind, 'de-DE').trim()).not.toBe('');
      expect(availabilityReason(kind, 'en-US').trim()).not.toBe('');
    }
  });
});
