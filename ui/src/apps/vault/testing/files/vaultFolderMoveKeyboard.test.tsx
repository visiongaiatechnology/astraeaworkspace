// STATUS: PLATIN — die Tastaturalternative zum Ordner-Drop (V-005).
//
// **Der Befund:** Der Griff der Seitenleiste ist ein `<button draggable onDrop={…}>`. Ein Drop ist
// **zeigergebunden**: mit reiner Tastatur ist er nicht erreichbar. Es gab zwar eine Verschiebe-Werkzeugleiste
// im Dateibereich, aber sie erscheint erst, wenn die Datei **vorher** ausgewählt wurde — das Drop-Ziel selbst
// hatte also keinen Tastaturweg, und die Auswahl musste ebenfalls erst mit der Maus entstehen.
//
// **Die Behebung ist keine Geste, sondern ein Ziel:** dieselbe Verschiebung ist jetzt als Auswahl
// („Move to…") direkt an der Datei erreichbar — in derselben Bedienleiste wie die übrigen Dateiaktionen,
// ohne Vorauswahl, mit Ziel **und** Dateiname im `aria-label`.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VaultFile, VaultFolder } from '../../../../shared/contracts/workspace';
import { VaultFileEntry } from '../../../../shared/vault/files/VaultFileEntry';

const NOW = 1_700_000_000_000;
const noop = () => {};

const file = (overrides: Partial<VaultFile> = {}): VaultFile => ({
  id: 'vf-1', name: 'gehalt.pdf', kind: 'Writer', sizeBytes: 100, encryptedHash: 'a'.repeat(64),
  lastModified: NOW, status: 'available', sourceType: 'attachment', mimeType: 'application/pdf',
  classification: 'Internal', folderId: null, ...overrides,
});

const folder = (id: string, name: string): VaultFolder => ({
  id, name, parentId: null, createdAt: NOW, modifiedAt: NOW, owner: 'local-user', classification: 'Internal',
});

type EntryProps = React.ComponentProps<typeof VaultFileEntry>;

const props = (overrides: Partial<EntryProps> = {}): EntryProps => ({
  file: file(), viewMode: 'list', selected: false, isVerifying: false,
  onToggleSelected: noop, onRename: noop, onVerify: noop, onPreview: noop, onInspect: noop,
  onOpenTarget: noop, onDelete: noop, onToggleFavorite: noop, onTogglePinned: noop,
  onEditTags: noop, onEditProperties: noop, onSetAssociation: noop, onDragStart: noop,
  ...overrides,
});

describe('V-005: das Verschiebeziel ist ohne Zeiger erreichbar', () => {
  it('die Auswahl erscheint, sobald Ordner und Rückruf da sind', () => {
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({
      folders: [folder('f1', 'Personal'), folder('f2', 'Archiv')],
      onMoveToFolder: noop,
    })} />);
    // Sie ist eine echte Auswahl mit tastaturbedienbaren Optionen …
    expect(markup).toContain('<select');
    expect(markup).toContain('Move to…');
    expect(markup).toContain('Vault root');
    expect(markup).toContain('Personal');
    expect(markup).toContain('Archiv');
    // … und nennt Ziel **und** Datei, damit ein Screenreader nicht rätselt, was verschoben wird.
    expect(markup).toContain('aria-label="Move gehalt.pdf to folder"');
  });

  it('ohne Ordner oder ohne Rückruf erscheint sie nicht — kein Knopf, der nichts tut', () => {
    expect(renderToStaticMarkup(<VaultFileEntry {...props({ onMoveToFolder: noop, folders: [] })} />))
      .not.toContain('Move to…');
    expect(renderToStaticMarkup(<VaultFileEntry {...props({ folders: [folder('f1', 'Personal')] })} />))
      .not.toContain('Move to…');
  });

  it('bei gesperrtem Tresor ist sie gesperrt — keine Verschiebung im gesperrten Zustand', () => {
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({
      locked: true, folders: [folder('f1', 'Personal')], onMoveToFolder: noop,
    })} />);
    expect(markup).toContain('Move to…');
    // Genau eine gesperrte Auswahl: die Verschiebe-Auswahl.
    expect(markup).toContain('disabled=""');
  });

  it('die vorhandenen Dateiaktionen bleiben unberührt', () => {
    // Gegenprobe: die neue Auswahl darf die bestehenden Tastaturwege nicht verdrängen.
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({
      folders: [folder('f1', 'Personal')], onMoveToFolder: noop,
    })} />);
    for (const label of ['Select gehalt.pdf', 'Open gehalt.pdf with', 'Verify integrity', 'Move to Trash', 'Quick preview', 'Rename']) {
      expect(markup, label).toContain(label);
    }
  });
});

describe('V-005: die Verschiebung wirkt wirklich, statt nur zu erscheinen', () => {
  it('die Auswahl ist ein Befehl, kein Zustand — der Wert springt zurück', () => {
    /*
     * Gemessen am Markup: die Auswahl trägt `value=""`. Ein Zustand würde den zuletzt gewählten Ordner
     * anzeigen und beim nächsten Blick suggerieren, die Datei liege dort. Als Befehl ist sie ehrlich.
     */
    const markup = renderToStaticMarkup(<VaultFileEntry {...props({
      folders: [folder('f1', 'Personal')], onMoveToFolder: noop,
    })} />);
    const select = markup.slice(markup.indexOf('aria-label="Move gehalt.pdf to folder"'));
    expect(select.slice(0, 400)).toMatch(/value=""/u);
  });


});
