//! GAP-0009, Runde 308: PDF UND NOTES VERDRAHTET.
//!
//! WAS VORHER GALT, GEMESSEN: `pdf_data` (`document.rs:201`) und `notebooks`
//! (`:195`) lagen als undurchsichtige `serde_json::Value` im Dokument, und
//! `PdfDocumentModel`, `PdfPageModel`, `PdfSectionModel`, `PdfAnnotation`,
//! `PdfRedaction`, `NoteNotebook`, `NoteSection` und `NotePage` waren
//! deklariert und wurden NIRGENDS ausserhalb ihrer eigenen Deklaration genannt.
//!
//! WAS DIESER TEST MISST, UND WAS ER NICHT MISST:
//!   Er misst Getter, Setter, Validierung, Versionserhoehung und die
//!   geschriebenen Schluesselnamen.
//!   Er misst NICHT, ob `is_redacted` wahr ist, wenn es wahr sein sollte — das
//!   kann das Modell nicht wissen, weil es die Seitenlast nicht kennt.
//!   UND ER MISST AUSDRUECKLICH, DASS EINE INVARIANTE **NICHT** GILT:
//!   `num_pages != pages.len()` ist erlaubt, weil die Anwendung es so benutzt.

use serde_json::json;
use vgt_object_model::{
    DocumentKind, NoteLibraryModel, NoteModelError, NoteNotebook, NotePage, NoteSection,
    PdfAnnotation, PdfDocumentModel, PdfModelError, PdfPageModel, PdfRedaction, PdfSectionModel,
    WorkspaceDocument,
};

fn sektion(id: &str, inhalt: &str, redigiert: bool, original: Option<&str>) -> PdfSectionModel {
    PdfSectionModel {
        id: id.to_string(),
        section_type: "paragraph".to_string(),
        content: inhalt.to_string(),
        is_redacted: redigiert,
        is_marked_for_redaction: false,
        original_content: original.map(str::to_string),
        redaction_reason: None,
    }
}

fn seite(nummer: usize, sektionen: Vec<PdfSectionModel>) -> PdfPageModel {
    PdfPageModel {
        page_number: nummer,
        title: format!("Seite {nummer}"),
        subtitle: None,
        sections: sektionen,
    }
}

fn pdf() -> PdfDocumentModel {
    PdfDocumentModel {
        num_pages: 2,
        pages: vec![
            seite(1, vec![sektion("s-1", "Erste", false, None)]),
            seite(2, vec![sektion("s-2", "Zweite", false, None)]),
        ],
        annotations: Vec::new(),
        redactions: Vec::new(),
    }
}

fn note(id: &str) -> NotePage {
    NotePage {
        id: id.to_string(),
        title: format!("Notiz {id}"),
        content: "Inhalt".to_string(),
        tags: vec!["tag".to_string()],
        backlinks: Vec::new(),
        last_modified: 1_700_000_000_000,
    }
}

fn bibliothek() -> NoteLibraryModel {
    NoteLibraryModel {
        notebooks: vec![NoteNotebook {
            id: "nb-1".to_string(),
            title: "Erstes Buch".to_string(),
            sections: vec![NoteSection {
                id: "sec-1".to_string(),
                title: "Erster Abschnitt".to_string(),
                pages: vec![note("p-1"), note("p-2")],
            }],
        }],
    }
}

// ---------------------------------------------------------------- PDF

#[test]
fn pdf_getter_liest_none_wenn_keine_daten_da_sind() {
    let doc = WorkspaceDocument::new("Leer", DocumentKind::PdfStudio);
    assert_eq!(doc.pdf_model().expect("kein Fehler"), None);
}

#[test]
fn pdf_setter_und_getter_sind_ein_roundtrip() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    doc.set_pdf_model(pdf()).expect("setzen");
    assert_eq!(doc.pdf_model().expect("lesen").expect("da"), pdf());
}

#[test]
fn pdf_setter_erhoeht_version_und_setzt_modified_at() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    let v = doc.version;
    let t = doc.modified_at;
    std::thread::sleep(std::time::Duration::from_millis(2));
    doc.set_pdf_model(pdf()).expect("setzen");
    assert_eq!(doc.version, v + 1);
    assert!(doc.modified_at >= t);
}

/// DIE SICHERHEITSINVARIANTE. Eine als redigiert markierte Sektion, die den
/// Originaltext noch traegt, ist ein Leck: die Anzeige sagt "entfernt", die
/// Datei sagt "hier ist es". Dieselbe Pruefung hat die Anwendung schon
/// (`pdfTrueRedaction.ts:308`).
#[test]
fn pdf_redigierte_sektion_mit_originaltext_wird_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    doc.set_pdf_model(pdf()).expect("erster Stand");
    let vorher = doc.clone();

    let leck = PdfDocumentModel {
        num_pages: 1,
        pages: vec![seite(
            1,
            vec![sektion("s-1", "[geschwaerzt]", true, Some("GEHEIM") )],
        )],
        annotations: Vec::new(),
        redactions: Vec::new(),
    };
    match doc.set_pdf_model(leck) {
        Err(PdfModelError::RedactedSectionRetainsContent(id)) => assert_eq!(id, "s-1"),
        andere => panic!("erwartet RedactedSectionRetainsContent, bekommen: {andere:?}"),
    }
    assert_eq!(doc, vorher, "das Dokument darf sich nicht geaendert haben");
}

/// Und die Kehrseite: eine redigierte Sektion OHNE Originaltext ist gueltig.
#[test]
fn pdf_redigierte_sektion_ohne_originaltext_ist_gueltig() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    let sauber = PdfDocumentModel {
        num_pages: 1,
        pages: vec![seite(1, vec![sektion("s-1", "[geschwaerzt]", true, None)])],
        annotations: Vec::new(),
        redactions: Vec::new(),
    };
    doc.set_pdf_model(sauber).expect("muss zulaessig sein");
}

/// DIE GEGENPROBE ZUR GEMESSENEN ENTSCHEIDUNG: `num_pages` DARF von
/// `pages.len()` abweichen. `apps/pdf/interchange/pdfArchiveTarget.test.ts:95`
/// uebergibt `numPages: 4` zu einem Modell mit EINER Seite und prueft genau
/// diesen Fall. Haette ich eine Gleichheitspruefung eingebaut, waere sie hier
/// rot — und sie haette echte Daten gebrochen.
#[test]
fn pdf_num_pages_darf_von_der_seitenzahl_abweichen() {
    let mut doc = WorkspaceDocument::new("Archiv", DocumentKind::PdfStudio);
    let archiv = PdfDocumentModel {
        num_pages: 4,
        pages: vec![seite(1, vec![sektion("s-1", "Nur eine", false, None)])],
        annotations: Vec::new(),
        redactions: Vec::new(),
    };
    doc.set_pdf_model(archiv).expect("muss zulaessig sein: numPages ist die Zahl im Dokument, pages die mit Inhalt");
    assert_eq!(doc.pdf_model().expect("lesen").expect("da").num_pages, 4);
}

#[test]
fn pdf_doppelte_seitennummer_wird_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    let doppelt = PdfDocumentModel {
        num_pages: 2,
        pages: vec![seite(1, vec![]), seite(1, vec![])],
        annotations: Vec::new(),
        redactions: Vec::new(),
    };
    match doc.set_pdf_model(doppelt) {
        Err(PdfModelError::DuplicatePageNumber(n)) => assert_eq!(n, 1),
        andere => panic!("erwartet DuplicatePageNumber, bekommen: {andere:?}"),
    }
}

#[test]
fn pdf_doppelte_sektionskennung_wird_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    let doppelt = PdfDocumentModel {
        num_pages: 2,
        pages: vec![
            seite(1, vec![sektion("gleich", "A", false, None)]),
            seite(2, vec![sektion("gleich", "B", false, None)]),
        ],
        annotations: Vec::new(),
        redactions: Vec::new(),
    };
    match doc.set_pdf_model(doppelt) {
        Err(PdfModelError::DuplicateSectionId(id)) => assert_eq!(id, "gleich"),
        andere => panic!("erwartet DuplicateSectionId, bekommen: {andere:?}"),
    }
}

#[test]
fn pdf_doppelte_anmerkungs_und_redaktionskennung_werden_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    let anm = |id: &str| PdfAnnotation {
        id: id.to_string(),
        page: 1,
        annotation_type: "note".to_string(),
        text: "Hinweis".to_string(),
        color: "#ff0000".to_string(),
        author: None,
        created_at: None,
    };
    let mit_doppelter_anmerkung = PdfDocumentModel {
        num_pages: 1,
        pages: vec![seite(1, vec![])],
        annotations: vec![anm("a"), anm("a")],
        redactions: Vec::new(),
    };
    match doc.set_pdf_model(mit_doppelter_anmerkung) {
        Err(PdfModelError::DuplicateAnnotationId(id)) => assert_eq!(id, "a"),
        andere => panic!("erwartet DuplicateAnnotationId, bekommen: {andere:?}"),
    }

    let red = |id: &str| PdfRedaction {
        id: id.to_string(),
        page: 1,
        x: 1.0,
        y: 2.0,
        width: 3.0,
        height: 4.0,
        reason: "Datenschutz".to_string(),
        is_applied: false,
        target_text: None,
        timestamp: None,
    };
    let mit_doppelter_redaktion = PdfDocumentModel {
        num_pages: 1,
        pages: vec![seite(1, vec![])],
        annotations: Vec::new(),
        redactions: vec![red("r"), red("r")],
    };
    match doc.set_pdf_model(mit_doppelter_redaktion) {
        Err(PdfModelError::DuplicateRedactionId(id)) => assert_eq!(id, "r"),
        andere => panic!("erwartet DuplicateRedactionId, bekommen: {andere:?}"),
    }
}

#[test]
fn pdf_die_geschriebenen_schluessel_sind_camel_case() {
    let mut doc = WorkspaceDocument::new("Bericht", DocumentKind::PdfStudio);
    doc.set_pdf_model(pdf()).expect("setzen");
    let text = serde_json::to_string(doc.pdf_data.as_ref().expect("pdf_data")).expect("serialisierbar");
    for erwartet in ["\"numPages\"", "\"pageNumber\"", "\"isRedacted\""] {
        assert!(text.contains(erwartet), "{erwartet} erwartet: {text}");
    }
    for verboten in ["num_pages", "page_number", "is_redacted"] {
        assert!(!text.contains(verboten), "{verboten} darf nicht nach aussen dringen");
    }
}

// ---------------------------------------------------------------- Notes

#[test]
fn notes_getter_liest_none_wenn_keine_daten_da_sind() {
    let doc = WorkspaceDocument::new("Leer", DocumentKind::Notes);
    assert_eq!(doc.note_library().expect("kein Fehler"), None);
}

#[test]
fn notes_setter_und_getter_sind_ein_roundtrip() {
    let mut doc = WorkspaceDocument::new("Notizen", DocumentKind::Notes);
    doc.set_note_library(bibliothek()).expect("setzen");
    let zurueck = doc.note_library().expect("lesen").expect("da");
    assert_eq!(zurueck, bibliothek());
    assert_eq!(zurueck.page_count(), 2);
    assert_eq!(zurueck.page_by_id("p-2").expect("p-2").title, "Notiz p-2");
    assert!(zurueck.page_by_id("gibt-es-nicht").is_none());
}

#[test]
fn notes_doppelte_kennungen_werden_in_jedem_rang_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Notizen", DocumentKind::Notes);

    let zwei_buecher = NoteLibraryModel {
        notebooks: vec![
            NoteNotebook { id: "nb".into(), title: "A".into(), sections: vec![] },
            NoteNotebook { id: "nb".into(), title: "B".into(), sections: vec![] },
        ],
    };
    match doc.set_note_library(zwei_buecher) {
        Err(NoteModelError::DuplicateNotebookId(id)) => assert_eq!(id, "nb"),
        andere => panic!("erwartet DuplicateNotebookId, bekommen: {andere:?}"),
    }

    let zwei_abschnitte = NoteLibraryModel {
        notebooks: vec![NoteNotebook {
            id: "nb".into(),
            title: "A".into(),
            sections: vec![
                NoteSection { id: "sec".into(), title: "1".into(), pages: vec![] },
                NoteSection { id: "sec".into(), title: "2".into(), pages: vec![] },
            ],
        }],
    };
    match doc.set_note_library(zwei_abschnitte) {
        Err(NoteModelError::DuplicateSectionId(id)) => assert_eq!(id, "sec"),
        andere => panic!("erwartet DuplicateSectionId, bekommen: {andere:?}"),
    }

    let zwei_seiten = NoteLibraryModel {
        notebooks: vec![NoteNotebook {
            id: "nb".into(),
            title: "A".into(),
            sections: vec![NoteSection {
                id: "sec".into(),
                title: "1".into(),
                pages: vec![note("p"), note("p")],
            }],
        }],
    };
    match doc.set_note_library(zwei_seiten) {
        Err(NoteModelError::DuplicatePageId(id)) => assert_eq!(id, "p"),
        andere => panic!("erwartet DuplicatePageId, bekommen: {andere:?}"),
    }
}

/// Und ein abgelehnter Setter laesst das Dokument unveraendert.
#[test]
fn notes_abgelehnter_setter_aendert_nichts() {
    let mut doc = WorkspaceDocument::new("Notizen", DocumentKind::Notes);
    doc.set_note_library(bibliothek()).expect("erster Stand");
    let vorher = doc.clone();
    let kaputt = NoteLibraryModel {
        notebooks: vec![
            NoteNotebook { id: "nb".into(), title: "A".into(), sections: vec![] },
            NoteNotebook { id: "nb".into(), title: "B".into(), sections: vec![] },
        ],
    };
    assert!(doc.set_note_library(kaputt).is_err());
    assert_eq!(doc, vorher);
}

/// `NoteLibraryModel` ist `#[serde(transparent)]`: im Dokumentfeld steht die
/// nackte Liste, kein Umschlagobjekt. Das ist keine Formsache — die
/// TypeScript-Seite liest `notebooks` als Array, und ein Umschlag haette sie
/// gebrochen.
#[test]
fn notes_das_feld_traegt_eine_nackte_liste() {
    let mut doc = WorkspaceDocument::new("Notizen", DocumentKind::Notes);
    doc.set_note_library(bibliothek()).expect("setzen");
    let roh = doc.notebooks.as_ref().expect("notebooks");
    assert!(roh.is_array(), "erwartet ein Array, bekommen: {roh}");
    assert_eq!(roh.as_array().map(Vec::len), Some(1));
    assert_eq!(roh[0]["id"], json!("nb-1"));
}
