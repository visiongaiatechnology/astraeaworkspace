use std::collections::HashMap;
use vgt_object_model::{CellValue, DocumentKind, Paragraph, SecurityProfile, TableObject, TextBlockObject, TextSpan, WorkspaceDocument, WorkspaceObject};
use vgt_search::{parse_query, DerivedFieldKind, DerivedSearchField, DocumentIndexOptions, SearchError, SearchField, SearchIndex, SearchPermissionContext};

fn text_doc(title: &str, text: &str, kind: DocumentKind) -> WorkspaceDocument {
    let mut doc = WorkspaceDocument::new(title, kind);
    let block = TextBlockObject { id: "tb-1".into(), paragraphs: vec![Paragraph { id: "p-1".into(), style: Default::default(), spans: vec![TextSpan { text: text.into(), ..Default::default() }] }] };
    doc.add_root_object(WorkspaceObject::TextBlock(block));
    doc
}

#[test]
fn cross_app_full_text_ranking_and_filters() {
    let mut index = SearchIndex::new();
    let writer = text_doc("Quarterly Strategy", "Sovereign local first encryption strategy", DocumentKind::Writer);
    let mut grid = WorkspaceDocument::new("Financial Forecast", DocumentKind::Grid);
    let mut table = TableObject { id: "table-1".into(), rows: 2, cols: 2, cells: HashMap::new() };
    table.cells.insert("A1".into(), vgt_object_model::GridCell { value: CellValue::String("Sovereign capital investment".into()), formula: None, format: None, bold: false, background: None, text_color: None });
    grid.add_root_object(WorkspaceObject::Table(table));
    index.index_document(&writer).unwrap();
    index.index_document(&grid).unwrap();
    let hits = index.search("sovereign").unwrap();
    assert_eq!(hits.len(), 2);
    let writer_hits = index.search("strategy type:writer field:title").unwrap();
    assert_eq!(writer_hits.len(), 1);
    assert_eq!(writer_hits[0].document_id, writer.id);
    assert_eq!(writer_hits[0].field, SearchField::Title);
}

#[test]
fn permission_locked_snippet_and_revocation_are_fail_closed() {
    let mut index = SearchIndex::new();
    let doc = text_doc("Restricted Plan", "classified aurora payload", DocumentKind::Writer);
    let options = DocumentIndexOptions { acl_partition_refs: vec!["team:red".into()], ..Default::default() };
    index.index_document_with_options(&doc, &options).unwrap();
    let denied = SearchPermissionContext { allowed_partitions: vec!["team:blue".into()], unlocked_document_ids: vec![doc.id.clone()] };
    assert!(index.search_with_context("aurora", &denied, 20).unwrap().is_empty());
    let locked = SearchPermissionContext { allowed_partitions: vec!["team:red".into()], unlocked_document_ids: vec![] };
    let hits = index.search_with_context("aurora", &locked, 20).unwrap();
    assert_eq!(hits.len(), 1);
    assert!(hits[0].metadata_protected);
    assert!(!hits[0].snippet.contains("aurora"));
    assert!(!hits[0].document_title.contains("Restricted"));
    index.revoke_document_permissions(&doc.id).unwrap();
    assert!(index.search_with_context("aurora", &locked, 20).unwrap().is_empty());
}

#[test]
fn encrypted_persistence_tamper_and_rebuild() {
    let mut index = SearchIndex::new();
    let doc = text_doc("Alpha", "ExtremelySensitiveIntelDataPayload", DocumentKind::Writer);
    index.index_document(&doc).unwrap();
    let key = [0x42u8; 32];
    let encrypted = index.export_encrypted(&key).unwrap();
    assert!(!String::from_utf8_lossy(&encrypted).contains("ExtremelySensitiveIntelDataPayload"));
    let restored = SearchIndex::import_encrypted(&encrypted, &key).unwrap();
    assert_eq!(restored.search("ExtremelySensitiveIntelDataPayload").unwrap().len(), 1);
    let mut tampered = encrypted.clone();
    let index_to_flip = tampered.len() / 2;
    tampered[index_to_flip] ^= 0x01;
    assert!(matches!(SearchIndex::import_encrypted(&tampered, &key), Err(SearchError::CorruptIndex)));
    let corpus = vec![(doc.clone(), DocumentIndexOptions::default())];
    let (rebuilt, report) = SearchIndex::load_or_rebuild(Some(&tampered), &key, &corpus).unwrap();
    assert!(report.rebuilt);
    assert_eq!(rebuilt.search("SensitiveIntel").unwrap().len(), 0);
    assert_eq!(rebuilt.search("ExtremelySensitiveIntelDataPayload").unwrap().len(), 1);
}

#[test]
fn incremental_versions_ocr_transcript_tags_and_query_syntax() {
    let mut index = SearchIndex::new();
    let mut doc = text_doc("Meeting Capture", "ordinary body", DocumentKind::Notes);
    let options = DocumentIndexOptions {
        tags: vec!["research".into(), "security".into()],
        metadata: HashMap::from([("owner".into(), "Alice".into())]),
        derived_fields: vec![
            DerivedSearchField { kind: DerivedFieldKind::Ocr, source_id: "scan-1".into(), text: "quantum microscope result".into(), provenance: "pdf-ocr:tesseract-compatible".into() },
            DerivedSearchField { kind: DerivedFieldKind::Transcript, source_id: "audio-1".into(), text: "spoken lattice migration".into(), provenance: "local-transcriber:v1".into() },
        ],
        ..Default::default()
    };
    index.index_document_with_options(&doc, &options).unwrap();
    assert_eq!(index.search("quantum field:ocr tag:research").unwrap().len(), 1);
    assert_eq!(index.search("\"spoken lattice\" field:transcript").unwrap().len(), 1);
    assert_eq!(index.search("alice field:metadata").unwrap().len(), 1);
    let old = doc.clone();
    doc.version += 1;
    doc.title = "Meeting Capture Updated".into();
    index.index_document_with_options(&doc, &options).unwrap();
    assert_eq!(index.search("updated field:title").unwrap().len(), 1);
    assert_eq!(index.index_document_with_options(&old, &options), Err(SearchError::StaleVersion));
    assert!(parse_query("type:notes tag:research \"spoken lattice\"").is_ok());
}

#[test]
fn top_secret_and_explicit_privacy_exclusions_are_not_searchable() {
    let mut index = SearchIndex::new();
    let mut top_secret = text_doc("Hidden TS", "neptune codename", DocumentKind::Writer);
    top_secret.security_policy.profile = SecurityProfile::VgtTopSecret;
    index.index_document(&top_secret).unwrap();
    assert!(index.search("neptune").unwrap().is_empty());
    let excluded = text_doc("Excluded", "orion privacy", DocumentKind::Writer);
    index.index_document_with_options(&excluded, &DocumentIndexOptions { privacy_excluded: true, ..Default::default() }).unwrap();
    assert!(index.search("orion").unwrap().is_empty());
}

#[test]
fn checkpoint_detects_version_drift() {
    let mut index = SearchIndex::new();
    let doc = text_doc("Checkpoint", "resilient index", DocumentKind::Writer);
    index.index_document(&doc).unwrap();
    let checkpoint = index.checkpoint().unwrap();
    index.validate_checkpoint(&checkpoint).unwrap();
    index.remove_document(&doc.id).unwrap();
    assert_eq!(index.validate_checkpoint(&checkpoint), Err(SearchError::CorruptIndex));
}

/// AST-2104: the six Open-Core kinds whose canonical app payload reaches Rust through serde's
/// flattened `extensions` bucket must still contribute typed search fields. Before the
/// `extensions` walk existed, these documents produced only a title and no payload field.
#[test]
fn flattened_open_core_app_payloads_are_indexed_for_every_kind() {
    let cases: [(&str, &str, DocumentKind); 6] = [
        ("Draw payload", "drawData", DocumentKind::Draw),
        ("Publish payload", "publishData", DocumentKind::Publish),
        ("Insight payload", "insightData", DocumentKind::Insight),
        ("Connect payload", "connectData", DocumentKind::Connect),
        ("Automate payload", "automateData", DocumentKind::Automate),
        ("Admin policy payload", "adminPolicyData", DocumentKind::AdminPolicy),
    ];
    let mut index = SearchIndex::new();
    for (title, field, kind) in cases {
        let marker = format!("payloadmarker{}", field.to_ascii_lowercase());
        let mut doc = WorkspaceDocument::new(title, kind);
        doc.extensions.insert(field.into(), serde_json::json!({ "payloadMarker": marker }));
        index.index_document(&doc).unwrap();
        let hits = index.search(&marker).unwrap();
        assert_eq!(hits.len(), 1, "kind {kind:?} through field {field} produced no indexed payload field");
        assert_eq!(hits[0].field, SearchField::Metadata);
        assert_eq!(hits[0].document_id, doc.id);
    }
}

/// Negative counter-check for the same rule: an empty payload document still yields the typed
/// title field and nothing is invented for it.
#[test]
fn empty_flattened_payload_does_not_invent_fields() {
    let mut index = SearchIndex::new();
    let mut doc = WorkspaceDocument::new("Empty Draw", DocumentKind::Draw);
    doc.extensions.insert("drawData".into(), serde_json::json!({ "objects": {}, "pages": [] }));
    index.index_document(&doc).unwrap();
    assert_eq!(index.search("empty field:title").unwrap().len(), 1);
    assert!(index.search("payloadmarkerdrawdata").unwrap().is_empty());
}

#[test]
fn server_side_permission_is_derived_and_never_the_caller_supplied_one() {
    // Gemessen am 2026-10-16: `crates/vgt-ipc/src/server.rs` las die
    // Berechtigung an ZWEI Endpunkten aus dem REQUEST-BODY
    // (`/api/v1/search/query` und `/api/v1/search/facets`, beide mit
    // `#[serde(default)] permission: SearchPermissionContext`) und reichte sie
    // unveraendert an `search_with_context` beziehungsweise
    // `facet_counts_with_context` weiter. Damit bestimmte der AUFRUFER seine
    // eigenen Partitionen und die Menge der sichtbaren Dokumente.
    //
    // Der Server leitet sie jetzt ueber `local_owner_permission()` ab. Dieser
    // Test pinnt die Wirkung: eine vom Aufrufer gelieferte FREMDE Partition
    // findet nichts, die abgeleitete findet das Dokument.
    let mut index = SearchIndex::new();
    let doc = text_doc("Derived Permission", "derivedpermissionmarker", DocumentKind::Writer);
    index.index_document(&doc).unwrap();

    let abgeleitet = index.local_owner_permission();
    assert_eq!(
        abgeleitet.allowed_partitions,
        vec!["local:owner".to_string()],
        "die abgeleitete Berechtigung muss die Partition des lokalen Eigentuemers tragen"
    );
    assert_eq!(
        abgeleitet.unlocked_document_ids.len(),
        1,
        "die abgeleitete Berechtigung muss die Dokumente des Index tragen"
    );
    assert!(abgeleitet.unlocked_document_ids.contains(&doc.id));

    // DIE WIRKUNG: der Aufrufer kann seine Partition nicht mehr bestimmen.
    let fremd = SearchPermissionContext {
        allowed_partitions: vec!["team:fremd".to_string()],
        unlocked_document_ids: vec![doc.id.clone()],
    };
    let aus_fremder_sicht = index.search_with_context("derivedpermissionmarker", &fremd, 10);
    assert!(
        matches!(&aus_fremder_sicht, Ok(hits) if hits.is_empty()),
        "eine fremde Partition darf das Dokument nicht finden, auch wenn der Aufrufer seine ID kennt"
    );
    let aus_abgeleiteter_sicht = index
        .search_with_context("derivedpermissionmarker", &abgeleitet, 10)
        .unwrap();
    assert_eq!(
        aus_abgeleiteter_sicht.len(),
        1,
        "die abgeleitete Berechtigung findet das Dokument"
    );

    // UND DER GEGENSATZ, der die Absicht festhaelt: der abgeleitete `Default`
    // ist LEER, weil `serde(default = "default_acl")` nur fuer serde gilt und
    // nicht fuer `Default`. Eine leere Partitionenmenge lehnt
    // `search_with_context` als ungueltig ab — die beiden duerfen deshalb
    // nicht verwechselt werden.
    let aus_derive = SearchPermissionContext::default();
    assert!(
        aus_derive.allowed_partitions.is_empty(),
        "der abgeleitete Default ist leer; wer ihn einsetzt, sperrt die Suche ganz"
    );
    assert_ne!(
        abgeleitet, aus_derive,
        "die abgeleitete Berechtigung darf nicht der abgeleitete Default sein"
    );
}
