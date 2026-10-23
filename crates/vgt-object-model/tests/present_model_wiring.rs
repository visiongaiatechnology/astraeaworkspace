//! GAP-0009, Runde 305: DER NACHWEIS, DASS `PresentDocumentModel` VERDRAHTET IST.
//!
//! WAS VORHER GALT, GEMESSEN: `WorkspaceDocument` trug `present_data` als Feld
//! (`document.rs:205`), aber der einzige typisierte Zugriff im ganzen Crate war
//! `writer_model` / `set_writer_model`. `PresentDocumentModel` war deklariert
//! und wurde NIRGENDS ausserhalb seiner eigenen Deklaration genannt —
//! `crates/vgt-ipc/src/server.rs` importiert bis heute kein einziges
//! App-Modell. Die Felder waren also da und die Modelle auch; es fehlte die
//! Verbindung.
//!
//! WAS DIESER TEST MISST, UND WAS ER NICHT MISST:
//!   Er misst, dass der Getter liest, der Setter schreibt, beide validieren,
//!   der Setter `version` erhoeht und `modified_at` setzt, und dass ein
//!   abgelehnter Setter das Dokument UNVERAENDERT laesst.
//!   Er misst NICHT, dass irgendeine Oberflaeche diese Funktionen aufruft —
//!   das ist die naechste Stufe und gehoert nicht in diesen Test. Ein Test,
//!   dessen Name mehr behauptet als er prueft, ist eine Erfolgsmeldung in
//!   Kleinformat.

use vgt_object_model::{
    DocumentKind, PresentDocumentModel, PresentModelError, PresentSlide, PresentSlideLayout,
    WorkspaceDocument,
};

/// `PresentSlide` hat KEIN `Default` — die Struktur traegt ein Pflichtfeld
/// `layout`, und ein Vorgabe-Layout waere eine stillschweigende Annahme ueber
/// die Absicht des Nutzers. Der Helfer schreibt darum jedes Pflichtfeld hin.
fn slide(id: &str, title: &str) -> PresentSlide {
    PresentSlide {
        id: id.to_string(),
        title: title.to_string(),
        subtitle: String::new(),
        category: None,
        category_tag: None,
        layout: PresentSlideLayout::Blank,
        cards: None,
        bullet_points: None,
        chart_reference_id: None,
        speaker_notes: None,
    }
}

fn modell() -> PresentDocumentModel {
    PresentDocumentModel {
        slides: vec![slide("s-1", "Titel"), slide("s-2", "Agenda")],
        theme: Some("astraea-dark".to_string()),
        aspect_ratio: Some("16:9".to_string()),
    }
}

/// Ein Dokument ohne Praesentationsdaten liefert `None` und keinen Fehler.
/// Das ist die Unterscheidung, die ein `Option` traegt und ein Fehler nicht:
/// "es gibt keine Praesentation" ist kein Defekt.
#[test]
fn getter_liest_none_wenn_keine_daten_da_sind() {
    let doc = WorkspaceDocument::new("Leer", DocumentKind::Present);
    assert_eq!(doc.present_model().expect("kein Fehler erwartet"), None);
}

/// Der Kern der Verdrahtung: was der Setter schreibt, liest der Getter zurueck.
#[test]
fn setter_und_getter_sind_ein_roundtrip() {
    let mut doc = WorkspaceDocument::new("Deck", DocumentKind::Present);
    doc.set_present_model(modell()).expect("setzen");

    let zurueck = doc
        .present_model()
        .expect("lesen")
        .expect("es liegen Daten vor");
    assert_eq!(zurueck, modell(), "das Modell muss unveraendert zurueckkommen");
    assert_eq!(zurueck.slides.len(), 2);
    assert_eq!(zurueck.slides[1].title, "Agenda");
}

/// Der Setter muss die Version erhoehen. Ein Setter, der das nicht tut,
/// betruegt die Synchronisation um eine Aenderung — und das waere genau die
/// Klasse Fehler, die dieser Gap beschreibt.
#[test]
fn setter_erhoeht_version_und_setzt_modified_at() {
    let mut doc = WorkspaceDocument::new("Deck", DocumentKind::Present);
    let version_vorher = doc.version;
    let zeit_vorher = doc.modified_at;

    std::thread::sleep(std::time::Duration::from_millis(2));
    doc.set_present_model(modell()).expect("setzen");

    assert_eq!(doc.version, version_vorher + 1, "version muss steigen");
    assert!(
        doc.modified_at >= zeit_vorher,
        "modified_at darf nicht zuruecklaufen"
    );
}

/// Die Validierung greift VOR dem Schreiben: eine leere Folien-ID wird
/// abgelehnt, und das Dokument bleibt, wie es war.
///
/// DASS DAS DOKUMENT UNVERAENDERT BLEIBT, ist die eigentliche Zusicherung.
/// Eine Ablehnung, die vorher schon halb geschrieben hat, waere schlimmer als
/// keine Ablehnung.
#[test]
fn leere_folien_id_wird_abgelehnt_und_aendert_nichts() {
    let mut doc = WorkspaceDocument::new("Deck", DocumentKind::Present);
    doc.set_present_model(modell()).expect("erster Stand");
    let stand_vorher = doc.clone();

    let kaputt = PresentDocumentModel {
        slides: vec![slide("s-1", "Ok"), slide("", "Ohne Id")],
        ..Default::default()
    };
    let fehler = doc.set_present_model(kaputt).expect_err("muss abgelehnt werden");
    assert!(
        matches!(fehler, PresentModelError::EmptySlideId),
        "erwartet EmptySlideId, bekommen: {fehler:?}"
    );
    assert_eq!(doc, stand_vorher, "das Dokument darf sich nicht geaendert haben");
}

/// Zwei Folien mit derselben ID sind ein Datenverlust im Warten: die zweite
/// ist ueber die ID nicht mehr adressierbar. Der Fehler nennt die ID.
#[test]
fn doppelte_folien_id_wird_abgelehnt_und_aendert_nichts() {
    let mut doc = WorkspaceDocument::new("Deck", DocumentKind::Present);
    let stand_vorher = doc.clone();

    let doppelt = PresentDocumentModel {
        slides: vec![slide("gleich", "A"), slide("gleich", "B")],
        ..Default::default()
    };
    let fehler = doc.set_present_model(doppelt).expect_err("muss abgelehnt werden");
    match fehler {
        PresentModelError::DuplicateSlideId(id) => assert_eq!(id, "gleich"),
        andere => panic!("erwartet DuplicateSlideId, bekommen: {andere:?}"),
    }
    assert_eq!(doc, stand_vorher, "das Dokument darf sich nicht geaendert haben");
}

/// Eine Praesentation OHNE Folien ist gueltig. Der Test haelt das fest, weil
/// eine Pruefung, die hier ablehnt, jede neue Datei unbrauchbar machen wuerde.
#[test]
fn leere_praesentation_ist_gueltig() {
    let mut doc = WorkspaceDocument::new("Neu", DocumentKind::Present);
    doc.set_present_model(PresentDocumentModel::default())
        .expect("eine leere Praesentation muss zulaessig sein");
    assert_eq!(
        doc.present_model().expect("lesen").expect("da").slides.len(),
        0
    );
}

/// `slide_at` liefert einen benannten Fehler statt eines `panic`.
#[test]
fn slide_at_benennt_den_index_statt_zu_panicken() {
    let m = modell();
    assert_eq!(m.slide_at(0).expect("Index 0").id, "s-1");
    match m.slide_at(7) {
        Err(PresentModelError::UnknownSlide { index }) => assert_eq!(index, 7),
        andere => panic!("erwartet UnknownSlide, bekommen: {andere:?}"),
    }
}

/// DIE SERIALISIERUNG IST TEIL DER VERDRAHTUNG, NICHT EIN NEBENPRODUKT: wenn
/// `present_data` nicht `camelCase` traegt, liest die TypeScript-Seite etwas
/// anderes als Rust geschrieben hat. Der Test prueft die Schluessel IM FELD,
/// nicht nur das Modell im Speicher.
#[test]
fn die_geschriebenen_schluessel_sind_camel_case() {
    let mut doc = WorkspaceDocument::new("Deck", DocumentKind::Present);
    doc.set_present_model(modell()).expect("setzen");

    let roh = doc.present_data.as_ref().expect("present_data muss gesetzt sein");
    let als_text = serde_json::to_string(roh).expect("serialisierbar");

    assert!(
        als_text.contains("\"aspectRatio\""),
        "aspectRatio erwartet, bekommen: {als_text}"
    );
    assert!(
        !als_text.contains("aspect_ratio"),
        "snake_case darf nicht nach aussen dringen: {als_text}"
    );
    assert!(
        als_text.contains("\"slides\""),
        "slides erwartet, bekommen: {als_text}"
    );
}
