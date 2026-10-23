//! GAP-0009, Runde 309: DER NACHWEIS, DASS DAS WORK-MANAGEMENT-MODELL VERDRAHTET IST.
//!
//! WAS VORHER GALT, GEMESSEN: `work_management_data` (`document.rs:226`) und
//! `work_data` (`:220`) lagen als undurchsichtige `serde_json::Value` im
//! Dokument, und `WorkManagementModel`, `TaskItem`, `PlannerCard`,
//! `ProjectMilestone` waren deklariert und wurden NIRGENDS ausserhalb ihrer
//! eigenen Deklaration genannt.
//!
//! WAS DIESER TEST MISST, UND WAS ER NICHT MISST:
//!   Er misst die Kennungs-Eindeutigkeit, den Getter, den Setter, den
//!   Migrations-Fallback und die Versionserhoehung.
//!   Er prueft AUSDRUECKLICH NICHT den Wertebereich von `progress` und NICHT
//!   die Reihenfolge der Daten — die Begruendung steht am Fehlertyp in
//!   `app_models.rs`, und die Messungen dazu sind:
//!   `notesTaskBindingReopen.test.tsx:179` mit `progress: 100`,
//!   `presentWidgets.ts:94` mit `progress: 76`, und
//!   `ConnectCalendarView.tsx:37` mit `startDate: ''`.

use vgt_object_model::{
    DocumentKind, PlannerCard, ProjectMilestone, TaskItem, WorkManagementModel, WorkModelError,
    WorkspaceDocument,
};

fn aufgabe(id: &str, erledigt: bool) -> TaskItem {
    TaskItem {
        id: id.to_string(),
        title: format!("Aufgabe {id}"),
        completed: erledigt,
        priority: "normal".to_string(),
        // GESETZT, NICHT `None`: `due_date` traegt `skip_serializing_if =
        // "Option::is_none"`, und mein erster Anlauf liess es leer — dann fehlt
        // `dueDate` im JSON, und die Zusicherung unten schlug fehl, obwohl die
        // Serialisierung richtig war. Der Test war falsch, nicht der Code.
        due_date: Some("2026-09-30".to_string()),
    }
}

fn karte(id: &str, spalte: &str) -> PlannerCard {
    PlannerCard {
        id: id.to_string(),
        title: format!("Karte {id}"),
        column: spalte.to_string(),
        assignee: None,
        tags: Vec::new(),
    }
}

fn meilenstein(id: &str, fortschritt: f32) -> ProjectMilestone {
    ProjectMilestone {
        id: id.to_string(),
        name: format!("Meilenstein {id}"),
        start_date: "2026-09-01".to_string(),
        end_date: "2026-09-30".to_string(),
        progress: fortschritt,
    }
}

fn arbeit() -> WorkManagementModel {
    WorkManagementModel {
        tasks: vec![aufgabe("t-1", false), aufgabe("t-2", true)],
        cards: vec![karte("c-1", "todo"), karte("c-2", "done")],
        milestones: vec![meilenstein("m-1", 76.0)],
    }
}

#[test]
fn getter_liest_none_wenn_keine_daten_da_sind() {
    let doc = WorkspaceDocument::new("Leer", DocumentKind::Tasks);
    assert_eq!(doc.work_management_model().expect("kein Fehler"), None);
}

#[test]
fn setter_und_getter_sind_ein_roundtrip() {
    let mut doc = WorkspaceDocument::new("Arbeit", DocumentKind::Tasks);
    doc.set_work_management_model(arbeit()).expect("setzen");
    let zurueck = doc.work_management_model().expect("lesen").expect("da");
    assert_eq!(zurueck, arbeit());
    assert_eq!(zurueck.open_task_count(), 1);
    assert!(zurueck.task_by_id("t-2").expect("t-2").completed);
    assert_eq!(zurueck.card_by_id("c-1").expect("c-1").column, "todo");
    assert!(zurueck.task_by_id("gibt-es-nicht").is_none());
}

#[test]
fn setter_erhoeht_version_und_setzt_modified_at() {
    let mut doc = WorkspaceDocument::new("Arbeit", DocumentKind::Tasks);
    let v = doc.version;
    let t = doc.modified_at;
    std::thread::sleep(std::time::Duration::from_millis(2));
    doc.set_work_management_model(arbeit()).expect("setzen");
    assert_eq!(doc.version, v + 1);
    assert!(doc.modified_at >= t);
}

/// DIE MIGRATIONSREGEL, UND SIE IST DIE EIGENTLICHE ARBEIT DIESER RUNDE.
///
/// Es gibt zwei Felder fuer dieselbe Form, und die Anwendung liest
/// `workManagementData ?? workData` (`useNotesManager.ts:130`). Der Getter muss
/// dasselbe tun — sonst saehe Rust ein leeres Dokument, wo die Oberflaeche
/// Aufgaben zeigt.
#[test]
fn der_getter_liest_das_aeltere_work_data_feld_wenn_das_neue_leer_ist() {
    let mut doc = WorkspaceDocument::new("Alt", DocumentKind::Tasks);
    // Nur das aeltere Feld setzen, so wie eine migrierte Datei es traegt.
    doc.work_data = Some(serde_json::to_value(arbeit()).expect("serialisierbar"));

    let gelesen = doc
        .work_management_model()
        .expect("lesen")
        .expect("der Fallback muss greifen");
    assert_eq!(gelesen, arbeit(), "der aeltere Name muss gelesen werden");
}

/// Und der kanonische Name gewinnt, wenn beide gesetzt sind.
#[test]
fn der_kanonische_name_gewinnt_gegen_den_aelteren() {
    let mut doc = WorkspaceDocument::new("Beide", DocumentKind::Tasks);
    let alt = WorkManagementModel {
        tasks: vec![aufgabe("alt", false)],
        cards: Vec::new(),
        milestones: Vec::new(),
    };
    let neu = WorkManagementModel {
        tasks: vec![aufgabe("neu", false)],
        cards: Vec::new(),
        milestones: Vec::new(),
    };
    doc.work_data = Some(serde_json::to_value(&alt).expect("serialisierbar"));
    doc.work_management_data = Some(serde_json::to_value(&neu).expect("serialisierbar"));

    let gelesen = doc.work_management_model().expect("lesen").expect("da");
    assert_eq!(gelesen.tasks[0].id, "neu", "der kanonische Name muss gewinnen");
}

/// DER SETTER SCHREIBT NUR DEN KANONISCHEN NAMEN. Den Migrationszustand
/// fortzuschreiben waere keine Verdrahtung, sondern eine Verfestigung.
#[test]
fn der_setter_schreibt_nur_den_kanonischen_namen() {
    let mut doc = WorkspaceDocument::new("Neu", DocumentKind::Tasks);
    doc.set_work_management_model(arbeit()).expect("setzen");

    assert!(doc.work_management_data.is_some(), "der kanonische Name muss gesetzt sein");
    assert!(
        doc.work_data.is_none(),
        "der aeltere Name darf NICHT mitgeschrieben werden"
    );
}

#[test]
fn doppelte_kennungen_werden_in_jeder_der_drei_listen_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Arbeit", DocumentKind::Tasks);

    let doppelte_aufgabe = WorkManagementModel {
        tasks: vec![aufgabe("gleich", false), aufgabe("gleich", true)],
        ..Default::default()
    };
    match doc.set_work_management_model(doppelte_aufgabe) {
        Err(WorkModelError::DuplicateTaskId(id)) => assert_eq!(id, "gleich"),
        andere => panic!("erwartet DuplicateTaskId, bekommen: {andere:?}"),
    }

    let doppelte_karte = WorkManagementModel {
        tasks: Vec::new(),
        cards: vec![karte("gleich", "a"), karte("gleich", "b")],
        milestones: Vec::new(),
    };
    match doc.set_work_management_model(doppelte_karte) {
        Err(WorkModelError::DuplicateCardId(id)) => assert_eq!(id, "gleich"),
        andere => panic!("erwartet DuplicateCardId, bekommen: {andere:?}"),
    }

    let doppelter_meilenstein = WorkManagementModel {
        tasks: Vec::new(),
        cards: Vec::new(),
        milestones: vec![meilenstein("gleich", 10.0), meilenstein("gleich", 20.0)],
    };
    match doc.set_work_management_model(doppelter_meilenstein) {
        Err(WorkModelError::DuplicateMilestoneId(id)) => assert_eq!(id, "gleich"),
        andere => panic!("erwartet DuplicateMilestoneId, bekommen: {andere:?}"),
    }
}

/// Und ein abgelehnter Setter laesst das Dokument unveraendert.
#[test]
fn abgelehnter_setter_aendert_nichts() {
    let mut doc = WorkspaceDocument::new("Arbeit", DocumentKind::Tasks);
    doc.set_work_management_model(arbeit()).expect("erster Stand");
    let vorher = doc.clone();

    let kaputt = WorkManagementModel {
        tasks: vec![aufgabe("gleich", false), aufgabe("gleich", true)],
        ..Default::default()
    };
    assert!(doc.set_work_management_model(kaputt).is_err());
    assert_eq!(doc, vorher);
}

/// DIE GEGENPROBE ZU DEN ZWEI GEMESSENEN NICHT-INVARIANTEN: `progress: 100`
/// und ein LEERER Datumsstring sind gueltig. Haette ich `0..=1` oder einen
/// Datumsvergleich eingebaut, waere dieser Test rot.
#[test]
fn progress_100_und_leere_daten_sind_gueltig() {
    let mut doc = WorkspaceDocument::new("Arbeit", DocumentKind::Tasks);
    let mit_grenzwerten = WorkManagementModel {
        tasks: Vec::new(),
        cards: Vec::new(),
        milestones: vec![
            ProjectMilestone {
                id: "m-100".to_string(),
                name: "Fertig".to_string(),
                start_date: "2026-09-01".to_string(),
                end_date: "2026-09-02".to_string(),
                progress: 100.0,
            },
            ProjectMilestone {
                id: "m-leer".to_string(),
                name: "Ohne Datum".to_string(),
                start_date: String::new(),
                end_date: String::new(),
                progress: 0.0,
            },
        ],
    };
    doc.set_work_management_model(mit_grenzwerten)
        .expect("progress 100 und leere Daten muessen zulaessig sein");
    assert_eq!(doc.work_management_model().expect("lesen").expect("da").milestones.len(), 2);
}

#[test]
fn die_geschriebenen_schluessel_sind_camel_case() {
    let mut doc = WorkspaceDocument::new("Arbeit", DocumentKind::Tasks);
    doc.set_work_management_model(arbeit()).expect("setzen");
    let roh = doc.work_management_data.as_ref().expect("workManagementData");
    let text = serde_json::to_string(roh).expect("serialisierbar");
    assert!(text.contains("\"dueDate\""), "dueDate erwartet: {text}");
    assert!(text.contains("\"startDate\""), "startDate erwartet: {text}");
    assert!(!text.contains("due_date"), "snake_case darf nicht nach aussen dringen");
    assert!(!text.contains("start_date"), "snake_case darf nicht nach aussen dringen");

    let alles = serde_json::to_string(&doc).expect("serialisierbar");
    assert!(alles.contains("\"workManagementData\""), "workManagementData erwartet");
}
