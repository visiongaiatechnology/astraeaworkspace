// STATUS: PLATIN — Vertragstest der Verwaltungs-Kopie über alle sieben Sprachen.
//
// Geprüft wird, was ein Nutzer sieht: jede Beschriftung existiert, keine enthält einen Platzhalter, und
// die Begründungsfunktion zeigt **nie** den Maschinencode. Zusätzlich wird für jede Sprache gerendert,
// dass die vier neuen Bereiche wirklich beschriftet erscheinen.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import {
  ADMIN_POLICY_GOVERNANCE_TABS,
  adminPolicyGovernanceCopy,
  type AdminPolicyGovernanceCopy,
} from '../locale/adminPolicyGovernanceLocale';
import { ADMIN_ENFORCEMENT_REASON_CODES, ADMIN_ENFORCEMENT_MATRIX } from '../enforcement/adminEnforcementCore';
import { DEFAULT_ADMIN_POLICY_MODEL } from '../model/types';
import { AdminPolicyView } from '../panels/AdminPolicyView';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const document = {
  id: 'admin-policy-governance-locale',
  kind: 'AdminPolicy',
  modified_at: 0,
  version: 1,
  adminPolicyData: structuredClone(DEFAULT_ADMIN_POLICY_MODEL),
} as unknown as WorkspaceDocument;

const escapeMarkup = (value: string) => value.replaceAll('&', '&amp;');

/** Alle Textfelder der Kopie, ohne die Funktionen und ohne die verschachtelten Tabellen. */
function flatStrings(copy: AdminPolicyGovernanceCopy): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(copy)) {
    if (key === 'reason') continue;
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) out.push(...value.filter((entry): entry is string => typeof entry === 'string'));
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value as Record<string, string>)) if (typeof nested === 'string') out.push(nested);
    }
  }
  return out;
}

describe('admin governance locale catalogue', () => {
  it.each(WORKSPACE_LOCALES)('provides every governance string in %s', (locale) => {
    const copy = adminPolicyGovernanceCopy(locale);
    const strings = flatStrings(copy);
    expect(strings.length).toBeGreaterThan(80);
    for (const value of strings) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(/\{[a-z]+\}/u);
    }
    for (const tab of ADMIN_POLICY_GOVERNANCE_TABS) {
      expect(copy.tabs[tab].trim().length).toBeGreaterThan(0);
      expect(copy.descriptions[tab].trim().length).toBeGreaterThan(0);
    }
    // Die vier Registerkarten sind unterscheidbar — nicht vier Mal dasselbe Wort.
    expect(new Set(ADMIN_POLICY_GOVERNANCE_TABS.map((tab) => copy.tabs[tab])).size).toBe(ADMIN_POLICY_GOVERNANCE_TABS.length);
  });

  it.each(WORKSPACE_LOCALES)('explains every enforcement reason in %s without leaking the code', (locale) => {
    const copy = adminPolicyGovernanceCopy(locale);
    for (const code of ADMIN_ENFORCEMENT_REASON_CODES) {
      const text = copy.reason(code);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toContain(code);
    }
    // Unbekanntes fällt auf die allgemeine Ablehnung zurück und nennt den Code ebenfalls nicht.
    const unknown = copy.reason('admin-future-code-not-in-catalogue');
    expect(unknown.trim().length).toBeGreaterThan(0);
    expect(unknown).not.toContain('admin-future-code-not-in-catalogue');
    expect(copy.reason('')).toBe(unknown);
  });

  it.each(WORKSPACE_LOCALES)('renders all four governance sections with their labels in %s', (locale) => {
    localeState.current = locale;
    const copy = adminPolicyGovernanceCopy(locale);
    // Jeder Bereich hat seinen eigenen, sichtbaren Marker — damit ist „erreichbar" messbar.
    const marker: Record<(typeof ADMIN_POLICY_GOVERNANCE_TABS)[number], string> = {
      Catalog: 'data-admin-governance="catalog"',
      Author: 'data-admin-authoring="true"',
      Enforce: 'data-admin-governance="enforce"',
      Interchange: 'data-admin-interchange="true"',
    };
    for (const tab of ADMIN_POLICY_GOVERNANCE_TABS) {
      const markup = renderToStaticMarkup(<AdminPolicyView document={document} initialTab={tab} releaseGate="approved" onUpdateDocument={vi.fn()} />);
      expect(markup).toContain(escapeMarkup(copy.tabs[tab]));
      expect(markup).toContain(copy.descriptions[tab]);
      expect(markup, tab).toContain(marker[tab]);
    }
  });

  it('carries every enforcement matrix row into the rendered enforcement surface', () => {
    localeState.current = 'en-US';
    const markup = renderToStaticMarkup(<AdminPolicyView document={document} initialTab="Enforce" releaseGate="approved" onUpdateDocument={vi.fn()} />);
    for (const row of ADMIN_ENFORCEMENT_MATRIX) {
      expect(markup).toContain(`data-admin-matrix-operation="${row.operation}"`);
      expect(markup).toContain(`data-admin-matrix-policy="${row.policyId}"`);
    }
  });
});
