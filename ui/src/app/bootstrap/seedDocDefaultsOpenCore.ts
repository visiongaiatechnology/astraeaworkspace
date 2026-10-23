// STATUS: PLATIN — Open Core document factory with Premium kinds rejected before construction.
import { OPEN_CORE_APP_KINDS } from '../../edition/contracts';
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import { WOM_SCHEMA_VERSION } from '../../shared/contracts/workspace';
import { DEFAULT_INSIGHT_MODEL } from '../../apps/insight/domain/types';
import { DEFAULT_CONNECT_MODEL } from '../../apps/connect/domain/types';
import { DEFAULT_AUTOMATE_MODEL } from '../../apps/automate/model/types';
import { DEFAULT_ADMIN_POLICY_MODEL } from '../../apps/admin-policy/model/types';
import { createEmptyDrawDocument } from '../../apps/draw/model/drawDocumentEngine';
import { DEFAULT_VAULT_FILES } from '../../shared/contracts/vaultSpaces';
import { createPublishProject } from '../../apps/publish/model/publishDocumentFactory';
import { createPublishFrame } from '../../apps/publish/model/publishDocumentEngine';

/** Ein neutrales Startgerüst, keine erfundenen Nutzerdaten und keine Demo-Inhalte. */
function isoDate(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
}

export function createNewDocument(kind: DocumentKind): WorkspaceDocument {
  if (!(OPEN_CORE_APP_KINDS as readonly string[]).includes(kind)) {
    throw new Error('edition.appUnavailable');
  }

  const now = Date.now();
  const id = `doc-${now}`;
  const document: WorkspaceDocument = {
    schema_version: WOM_SCHEMA_VERSION,
    id,
    title: `Untitled-${kind}`,
    kind,
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: 'default',
    protection: { version: 1, classification: 'standard', locked: false, readOnly: false },
    wom_extensions: {},
    root_object_ids: [],
    objects: {},
  };

  switch (kind) {
    case 'Writer': {
      const textId = `tb-${now}`;
      document.root_object_ids = [textId];
      document.objects[textId] = {
        type: 'TextBlock',
        data: {
          id: textId,
          paragraphs: [
            {
              id: `p-${now}-1`,
              style: { style_name: 'normal', alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
              spans: [{ text: '' }],
            },
          ],
        },
      };
      document.writerData = { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: true, headerText: '', footerText: '' }, tables: [] };
      break;
    }
    case 'Grid': {
      const firstTableId = `tbl-${now}-1`;
      const secondTableId = `tbl-${now}-2`;
      document.root_object_ids = [firstTableId, secondTableId];
      document.objects[firstTableId] = { type: 'Table', data: { id: firstTableId, rows: 30, cols: 20, cells: {} } };
      document.objects[secondTableId] = { type: 'Table', data: { id: secondTableId, rows: 30, cols: 20, cells: {} } };
      document.gridData = {
        sheets: [{ id: `sheet-${now}-1`, name: 'Sheet 1', tableObjectId: firstTableId }, { id: `sheet-${now}-2`, name: 'Sheet 2', tableObjectId: secondTableId }],
        activeSheetId: `sheet-${now}-1`,
      };
      break;
    }
    case 'Present':
      /**
       * PR-002 (M1) — a new deck opens as **one blank slide**, not as a demo card deck.
       *
       * The previous seed wrote a `cards` layout with two sample cards, a demo title and demo
       * speaker notes into every new document — the "Kartenansicht" the masterplan names as the
       * defect. Demo content is now only reachable through an explicit template; a fresh deck
       * carries exactly one empty 16:9 slide.
       */
      document.presentData = { slides: [{
        id: `slide-${now}-1`, title: '', subtitle: '', category: '', layout: 'blank',
        cards: [],
        speakerNotes: '',
      }], theme: 'paper', themeId: 'paper', aspectRatio: '16:9' };
      break;
    case 'Notes':
      // Startgerüst statt englischer Platzhalter: ein leeres Notizbuch mit einer leeren
      // Seite. Kein Demo-Text, keine erfundene Nutzerhistorie — aber eine Struktur, die
      // sofort verständlich ist.
      document.noteData = { id: `nb-${now}`, title: 'Neues Notizbuch', sections: [{ id: `sec-${now}`, title: 'Allgemein', pages: [{ id: `page-${now}`, title: 'Neue Notiz', content: '', tags: [], backlinks: [], last_modified: now }] }] };
      break;
    case 'PdfStudio':
      // Ein neutrales Startdokument: eine Seite mit Titel und einem Satz, der den
      // nächsten Schritt erklärt. Früher startete jedes neue PDF mit der Demo-Broschüre
      // ("Sample Review Document") — das war eine Attrappe, kein leerer Anfang.
      document.pdfData = {
        numPages: 1,
        pages: [{
          pageNumber: 1,
          title: 'Unbenanntes Dokument',
          subtitle: 'PDF Studio · neues Dokument',
          sections: [
            { id: `pdf-${now}-1`, type: 'header', content: 'Unbenanntes Dokument' },
            { id: `pdf-${now}-2`, type: 'paragraph', content: 'Dieses Dokument ist neu. Über die Werkzeugleiste Text einfügen, Seiten anlegen und das Ergebnis als PDF exportieren.' },
          ],
        }],
        annotations: [],
        redactions: [],
      };
      break;
    case 'Tasks':
      {
        const taskId = `t-${now}-1`;
        document.workManagementData = {
          tasks: [{ id: taskId, title: 'Erste Aufgabe: Ziel für diese Woche festlegen', completed: false, priority: 'high', dueDate: isoDate(7 * 86_400_000) }],
          cards: [{ id: `c-${now}-1`, title: 'Erste Aufgabe: Ziel für diese Woche festlegen', column: 'todo', tags: ['planung'], linkedTaskId: taskId }],
          milestones: [{ id: `m-${now}-1`, name: 'Projektstart', startDate: isoDate(0), endDate: isoDate(14 * 86_400_000), progress: 0 }],
        };
      }
      break;
    case 'Whiteboard':
      // Ein sichtbarer Rahmen mit kurzer Bedienhilfe; kein vorgezeichnetes Beispiel,
      // aber auch keine leere Fläche ohne Orientierung.
      document.whiteboardData = {
        items: [
          { id: `wb-frame-${now}-1`, type: 'frame', x: 40, y: 40, width: 820, height: 480, text: 'Neues Whiteboard' },
          { id: `wb-hint-${now}-1`, type: 'text', x: 80, y: 90, width: 540, height: 40, text: 'Bausteine aus der Werkzeugleiste einfügen · Doppelklick zum Bearbeiten' },
        ],
        view: {
          backgroundStyle: 'dots',
          gridSize: 20,
          showRulers: true,
          guides: [],
          bookmarks: [],
          presentationPath: [],
          snapToGrid: true,
          snapToGuides: true,
        },
      };
      break;
    case 'Draw':
      document.drawData = createEmptyDrawDocument();
      break;
    case 'Vault':
      document.vaultData = { files: DEFAULT_VAULT_FILES };
      break;
    case 'AdminPolicy':
      document.adminPolicyData = structuredClone(DEFAULT_ADMIN_POLICY_MODEL);
      break;
    case 'Publish': {
      /**
       * Ein leeres Layoutdokument mit **einem** bearbeitbaren Titelframe.
       *
       * `DEFAULT_PUBLISH_MODEL` war die hartkodierte Beispielbroschüre mit fremdem
       * Beispieltext — für ein neues Dokument die falsche Erwartung. Der echte
       * Erzeuger (`createPublishProject`) liefert die leere, gültige Geometrie; der
       * Titelframe macht daraus ein „hier kann ich anfangen“ statt einer leeren Fläche.
       */
      const layout = createPublishProject({ title: `Unbenanntes Layout`, pages: 1, marginMm: 15 });
      const firstPage = layout.pages[0]!;
      const titleFrame = createPublishFrame('text', firstPage.id, 0, {
        id: `pub-frame-${now}-1`,
        name: 'Titel',
        xMm: 20,
        yMm: 30,
        widthMm: 170,
        heightMm: 24,
        content: 'Unbenanntes Layout',
        fontSizePt: 28,
        fontFamily: 'Georgia, serif',
        semanticRole: 'H1',
      });
      document.publishData = {
        ...layout,
        frames: [titleFrame],
        pages: [{ ...firstPage, frameIds: [titleFrame.id] }],
      };
      break;
    }
    case 'Insight':
      document.insightData = structuredClone(DEFAULT_INSIGHT_MODEL);
      break;
    case 'Connect':
      document.connectData = structuredClone(DEFAULT_CONNECT_MODEL);
      break;
    case 'Automate':
      document.automateData = structuredClone(DEFAULT_AUTOMATE_MODEL);
      break;
    default:
      throw new Error('edition.appUnavailable');
  }

  return document;
}
