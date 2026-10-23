// STATUS: PLATIN — der Fehler steht, wo die Handlung war (V-003).
//
// **Der Befund:** Fehler aus „Open With" (und dem Export) landeten in `addError`, das **oben im
// Hinzufügen-Bereich** gerendert wird. Bei einer Liste mit zwanzig Einträgen stand die Meldung damit weit weg
// von der Dateizeile, an der geklickt wurde: der Nutzer sieht einen Fehler, ohne zu wissen, welcher Eintrag
// ihn ausgelöst hat, und muss die Zeile selbst suchen.
//
// **Die Trennung, die daraus folgt:** eine Meldung, die sich auf **eine Datei** bezieht, gehört in die
// Dateizeile; eine Meldung über den **Stapel** (Import, Verknüpfen) gehört in den Hinzufügen-Bereich. Beides
// in einen Topf zu werfen war der Fehler — nicht die Position allein.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VaultFile } from '../../../../shared/contracts/workspace';
import { VaultFileEntry } from '../../../../shared/vault/files/VaultFileEntry';

const NOW = 1_700_000_000_000;
const noop = () => {};

const file = (overrides: Partial<VaultFile> = {}): VaultFile => ({
  id: 'vf-1', name: 'gehalt.pdf', kind: 'Writer', sizeBytes: 100, encryptedHash: 'a'.repeat(64),
  lastModified: NOW, status: 'available', sourceType: 'attachment', mimeType: 'application/pdf',
  classification: 'Internal', folderId: null, ...overrides,
});

type EntryProps = React.ComponentProps<typeof VaultFileEntry>;

const props = (overrides: Partial<EntryProps> = {}): EntryProps => ({
  file: file(), viewMode: 'list', selected: false, isVerifying: false,
  onToggleSelected: noop, onRename: noop, onVerify: noop, onPreview: noop, onInspect: noop,
  onOpenTarget: noop, onDelete: noop, onToggleFavorite: noop, onTogglePinned: noop,
  onEditTags: noop, onEditProperties: noop, onSetAssociation: noop, onDragStart: noop,
  ...overrides,
});

describe('V-003: der Fehler erscheint IN der Dateizeile, nicht oben im Stapelbereich', () => {
  it('der Fehler steht im Markup der Zeile und nennt die Datei', () => {
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({
      fileError: 'Vault file association does not match imported document type.',
    })} />);
    expect(markup).toContain('Vault file association does not match imported document type.');
    // Der Dateiname steht **im** Meldungstext: die Zuordnung ist damit auch ohne Blick auf die Zeile klar.
    expect(markup).toContain('<b>gehalt.pdf</b>');
  });

  it('der Fehler ist für Screenreader sofort hörbar, nicht nur farbig', () => {
    // Farbe allein wäre kein Unterscheidungsmerkmal — `role="alert"` ist eines.
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({ fileError: 'Open With failed.' })} />);
    expect(markup).toContain('role="alert"');
  });

  it('ohne Fehler erscheint keine Meldung — kein dauerhaft sichtbarer Platzhalter', () => {
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({ fileError: null })} />);
    expect(markup).not.toContain('role="alert"');
    expect(renderToStaticMarkup(<VaultFileEntry {...props()} />)).not.toContain('role="alert"');
  });

  it('ein Verifikations-Feedback und ein Fehler schließen sich nicht aus', () => {
    // Beide betreffen dieselbe Datei und dürfen nebeneinander stehen.
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({
      feedback: { state: 'mismatch', message: 'Digest mismatch.' },
      fileError: 'Open With failed.',
    })} />);
    expect(markup).toContain('Digest mismatch.');
    expect(markup).toContain('Open With failed.');
  });
});
