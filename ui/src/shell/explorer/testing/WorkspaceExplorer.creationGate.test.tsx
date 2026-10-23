// STATUS: PLATIN — Erstellungs-Gate im Workspace Explorer.
//
// **Der Befund:** Der Explorer baute seine Auswahl „Neues Dokument" aus `implementedApps`. Damit war das
// in der Beta gesperrte Sicherheits-Gate Admin & Policy an einem zweiten Erstellungsweg erreichbar,
// obwohl Start-Center und App-Launcher es korrekt ausgrauen. Erstellen läuft jetzt über
// `registry.creatableApps` — eine Quelle für alle Erstellungswege.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEditionRegistry } from '../../../edition/registry';
import { WorkspaceExplorer } from '../components/WorkspaceExplorer';

function renderExplorer(edition: 'open-core' | 'premium' = 'open-core'): string {
  return renderToStaticMarkup(<WorkspaceExplorer
    documents={{}}
    storedDocumentIds={new Set()}
    openDocumentIds={new Set()}
    recentEntries={[]}
    metadataLocked={false}
    editionRegistry={createEditionRegistry(edition)}
    onClose={vi.fn()}
    onOpenDocument={vi.fn()}
    onCreateDocument={vi.fn()}
  />);
}

describe('Workspace Explorer creation gate', () => {
  it('does not offer the blocked Admin & Policy security gate as a new-document kind', () => {
    const markup = renderExplorer();
    const select = markup.match(/<select[^>]*aria-label="Create"[^>]*>([\s\S]*?)<\/select>/u)?.[1] ?? '';
    expect(select).toContain('Astraea Writer');
    expect(select).toContain('Astraea Vault');
    expect(select).not.toContain('Astraea Admin');
    expect(select).not.toContain('AdminPolicy');
  });

  it('keeps the approved Vault gate and the core modules creatable', () => {
    const markup = renderExplorer();
    for (const name of ['Astraea Writer', 'Astraea Grid', 'Astraea Present', 'Astraea Notes', 'Astraea Tasks', 'Astraea Vault']) {
      expect(markup, name).toContain(name);
    }
  });

  it('still exposes Premium apps as catalog entries in Premium edition', () => {
    const markup = renderExplorer('premium');
    const select = markup.match(/<select[^>]*aria-label="Create"[^>]*>([\s\S]*?)<\/select>/u)?.[1] ?? '';
    expect(select).toContain('Astraea Planner');
    expect(select).not.toContain('Astraea Admin');
    // Der Filter „Nach App" darf Admin & Policy weiterhin zeigen, damit bestehende Dokumente auffindbar
    // bleiben — die Sperre gilt dem Erstellen, nicht der Sichtbarkeit vorhandener Daten.
    expect(markup).toContain('Astraea Admin');
  });
});
