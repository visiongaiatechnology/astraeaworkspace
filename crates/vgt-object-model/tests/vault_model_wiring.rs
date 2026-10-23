//! GAP-0009, Runde 307: DER NACHWEIS, DASS `VaultManifestModel` VERDRAHTET IST.
//!
//! WAS VORHER GALT, GEMESSEN: `vault_data` lag im Dokument
//! (`document.rs:227`, `rename = "vaultData"`), und der einzige typisierte
//! Zugriff im Crate war Writer — Present kam in Runde 305 dazu. `VaultManifestModel`
//! wurde NIRGENDS ausserhalb seiner eigenen Deklaration genannt.
//!
//! WAS DIESER TEST MISST, UND WAS ER NICHT MISST:
//!   Er misst den Getter, den Setter, die Validierung, die Versionserhoehung und
//!   die geschriebenen Schluesselnamen.
//!   Er misst NICHT, dass irgendeine Oberflaeche diese Funktionen aufruft, und
//!   er prueft NICHT die `encrypted_hash`-Werte gegen eine Nutzlast — das Modell
//!   traegt die Nutzlast nicht, und eine Pruefung hier wuerde eine Integritaet
//!   behaupten, die sie nicht messen kann.

use vgt_object_model::{
    DocumentKind, VaultFile, VaultManifestModel, VaultModelError, VaultTrashEntry, WorkspaceDocument,
};

/// `VaultFile` hat kein `Default` — die Struktur traegt Pflichtfelder, und
/// Vorgabewerte fuer Kennung und Hash waeren eine stillschweigende Behauptung.
fn datei(id: &str, name: &str) -> VaultFile {
    VaultFile {
        id: id.to_string(),
        name: name.to_string(),
        kind: DocumentKind::Vault,
        size_bytes: 2048,
        encrypted_hash: "a".repeat(64),
        last_modified: 1_700_000_000_000,
        source_type: Some("attachment".to_string()),
        document_id: None,
        mime_type: Some("application/pdf".to_string()),
        payload_data_url: Some("data:application/pdf;base64,AAAA".to_string()),
        content_digest: Some("b".repeat(64)),
        digest_algorithm: Some("SHA-256".to_string()),
        integrity_state: Some("verified".to_string()),
        document_version: Some(1),
    }
}

fn bestand() -> VaultManifestModel {
    VaultManifestModel {
        files: vec![datei("vf-1", "Bericht.pdf"), datei("vf-2", "Notizen.txt")],
        spaces: Vec::new(),
        shares: Vec::new(),
        trash: Vec::new(),
    }
}

#[test]
fn getter_liest_none_wenn_keine_daten_da_sind() {
    let doc = WorkspaceDocument::new("Leer", DocumentKind::Vault);
    assert_eq!(doc.vault_model().expect("kein Fehler erwartet"), None);
}

#[test]
fn setter_und_getter_sind_ein_roundtrip() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    doc.set_vault_model(bestand()).expect("setzen");

    let zurueck = doc.vault_model().expect("lesen").expect("da");
    assert_eq!(zurueck, bestand());
    assert_eq!(zurueck.files.len(), 2);
    assert_eq!(zurueck.files[1].name, "Notizen.txt");
}

#[test]
fn setter_erhoeht_version_und_setzt_modified_at() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    let version_vorher = doc.version;
    let zeit_vorher = doc.modified_at;

    std::thread::sleep(std::time::Duration::from_millis(2));
    doc.set_vault_model(bestand()).expect("setzen");

    assert_eq!(doc.version, version_vorher + 1, "version muss steigen");
    assert!(doc.modified_at >= zeit_vorher, "modified_at darf nicht zuruecklaufen");
}

#[test]
fn leere_dateikennung_wird_abgelehnt_und_aendert_nichts() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    doc.set_vault_model(bestand()).expect("erster Stand");
    let stand_vorher = doc.clone();

    let kaputt = VaultManifestModel {
        files: vec![datei("vf-1", "Ok"), datei("", "Ohne Kennung")],
        ..Default::default()
    };
    match doc.set_vault_model(kaputt) {
        Err(VaultModelError::EmptyFileId) => {}
        andere => panic!("erwartet EmptyFileId, bekommen: {andere:?}"),
    }
    assert_eq!(doc, stand_vorher, "das Dokument darf sich nicht geaendert haben");
}

#[test]
fn doppelte_dateikennung_wird_abgelehnt_und_aendert_nichts() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    let stand_vorher = doc.clone();

    let doppelt = VaultManifestModel {
        files: vec![datei("gleich", "A"), datei("gleich", "B")],
        ..Default::default()
    };
    match doc.set_vault_model(doppelt) {
        Err(VaultModelError::DuplicateFileId(id)) => assert_eq!(id, "gleich"),
        andere => panic!("erwartet DuplicateFileId, bekommen: {andere:?}"),
    }
    assert_eq!(doc, stand_vorher, "das Dokument darf sich nicht geaendert haben");
}

/// DIE ZUSTANDSINVARIANTE, UND SIE IST DER KERN DIESES MODELLS.
///
/// Eine Datei kann nicht gleichzeitig im Bestand und im Papierkorb stehen: der
/// Bestand sagt "verfuegbar", der Papierkorb sagt "geloescht". Wer beides
/// zulaesst, entscheidet an einer anderen Stelle stillschweigend, welche der
/// beiden Aussagen gewinnt — und genau das ist der Fall, den ein Vault nicht
/// haben darf.
#[test]
fn eine_datei_kann_nicht_zugleich_verfuegbar_und_geloescht_sein() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    doc.set_vault_model(bestand()).expect("erster Stand");
    let stand_vorher = doc.clone();

    let widerspruch = VaultManifestModel {
        files: vec![datei("vf-1", "Bericht.pdf")],
        spaces: Vec::new(),
        shares: Vec::new(),
        trash: vec![VaultTrashEntry {
            id: "tr-1".to_string(),
            deleted_at: 1_700_000_100_000,
            file: datei("vf-1", "Bericht.pdf"),
        }],
    };
    match doc.set_vault_model(widerspruch) {
        Err(VaultModelError::FileBothAvailableAndDeleted(id)) => assert_eq!(id, "vf-1"),
        andere => panic!("erwartet FileBothAvailableAndDeleted, bekommen: {andere:?}"),
    }
    assert_eq!(doc, stand_vorher, "das Dokument darf sich nicht geaendert haben");
}

/// Eine geloeschte Datei ist GUELTIG, solange sie nicht mehr im Bestand steht.
/// Der Test haelt das fest, damit die Invariante oben nicht zu weit greift.
#[test]
fn eine_nur_geloeschte_datei_ist_gueltig() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    let nur_papierkorb = VaultManifestModel {
        files: Vec::new(),
        spaces: Vec::new(),
        shares: Vec::new(),
        trash: vec![VaultTrashEntry {
            id: "tr-1".to_string(),
            deleted_at: 1_700_000_100_000,
            file: datei("vf-1", "Weg.pdf"),
        }],
    };
    doc.set_vault_model(nur_papierkorb).expect("muss zulaessig sein");
    assert_eq!(doc.vault_model().expect("lesen").expect("da").trash.len(), 1);
}

#[test]
fn doppelte_papierkorb_kennung_wird_abgelehnt() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    let doppelt = VaultManifestModel {
        files: Vec::new(),
        spaces: Vec::new(),
        shares: Vec::new(),
        trash: vec![
            VaultTrashEntry { id: "tr-gleich".to_string(), deleted_at: 1, file: datei("a", "A") },
            VaultTrashEntry { id: "tr-gleich".to_string(), deleted_at: 2, file: datei("b", "B") },
        ],
    };
    match doc.set_vault_model(doppelt) {
        Err(VaultModelError::DuplicateTrashId(id)) => assert_eq!(id, "tr-gleich"),
        andere => panic!("erwartet DuplicateTrashId, bekommen: {andere:?}"),
    }
}

#[test]
fn file_by_id_findet_und_gibt_none() {
    let m = bestand();
    assert_eq!(m.file_by_id("vf-2").expect("vf-2").name, "Notizen.txt");
    assert!(m.file_by_id("gibt-es-nicht").is_none());
}

/// Die geschriebenen Schluessel IM FELD sind camelCase. Wenn `vault_data` nicht
/// `sizeBytes` und `encryptedHash` traegt, liest die TypeScript-Seite etwas
/// anderes, als Rust geschrieben hat.
#[test]
fn die_geschriebenen_schluessel_sind_camel_case() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    doc.set_vault_model(bestand()).expect("setzen");

    let roh = doc.vault_data.as_ref().expect("vault_data muss gesetzt sein");
    let als_text = serde_json::to_string(roh).expect("serialisierbar");

    for erwartet in ["\"sizeBytes\"", "\"encryptedHash\"", "\"lastModified\"", "\"files\""] {
        assert!(als_text.contains(erwartet), "{erwartet} erwartet, bekommen: {als_text}");
    }
    for verboten in ["size_bytes", "encrypted_hash", "last_modified"] {
        assert!(!als_text.contains(verboten), "{verboten} darf nicht nach aussen dringen");
    }
}

/// Und das Dokument selbst schreibt das Feld als `vaultData`.
#[test]
fn das_dokumentfeld_heisst_vault_data_in_camel_case() {
    let mut doc = WorkspaceDocument::new("Tresor", DocumentKind::Vault);
    doc.set_vault_model(bestand()).expect("setzen");

    let als_text = serde_json::to_string(&doc).expect("serialisierbar");
    assert!(als_text.contains("\"vaultData\""), "vaultData erwartet: {als_text}");
    assert!(!als_text.contains("\"vault_data\""), "snake_case darf nicht nach aussen dringen");
}
