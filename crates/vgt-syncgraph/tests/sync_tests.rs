use std::collections::HashMap;
use vgt_object_model::{
    CellValue, DocumentKind, GridCell, TableObject, TextBlockObject, TextSpan, WorkspaceDocument,
    WorkspaceObject,
};
use vgt_operations::WorkspaceOperation;
use vgt_syncgraph::{SyncError, SyncGraphEngine, SyncNode, MAX_LOGICAL_TIME};

fn create_test_grid_doc() -> (WorkspaceDocument, String) {
    let mut doc = WorkspaceDocument::new("Test Convergence Sheet", DocumentKind::Grid);
    let table_id = "table-main".to_string();
    let mut cells = HashMap::new();
    cells.insert(
        "A1".to_string(),
        GridCell {
            value: CellValue::Empty,
            formula: None,
            format: None,
            bold: false,
            background: None,
            text_color: None,
        },
    );
    cells.insert(
        "B1".to_string(),
        GridCell {
            value: CellValue::Empty,
            formula: None,
            format: None,
            bold: false,
            background: None,
            text_color: None,
        },
    );
    cells.insert(
        "C1".to_string(),
        GridCell {
            value: CellValue::Empty,
            formula: None,
            format: None,
            bold: false,
            background: None,
            text_color: None,
        },
    );

    doc.add_root_object(WorkspaceObject::Table(TableObject {
        id: table_id.clone(),
        rows: 5,
        cols: 5,
        cells,
    }));
    (doc, table_id)
}

fn create_test_grid_edit_node(base: &WorkspaceDocument, table_id: &str) -> SyncNode {
    let mut source_doc = base.clone();
    let mut source_engine = SyncGraphEngine::new_with_base("remote-device", base.clone());
    source_engine
        .record_local_operation(
            &mut source_doc,
            WorkspaceOperation::SetCell {
                table_id: table_id.to_string(),
                coord: "A1".to_string(),
                old_value: CellValue::Empty,
                new_value: CellValue::Number(7.0),
                old_formula: None,
                new_formula: None,
            },
        )
        .unwrap()
}

#[test]
fn legacy_merge_rejects_protected_profile_without_native_peer_authority() {
    use vgt_object_model::SecurityProfile;

    let (base, table_id) = create_test_grid_doc();
    let node = create_test_grid_edit_node(&base, &table_id);
    let mut protected_document = base;
    protected_document.security_policy.profile = SecurityProfile::Pqc;
    let mut engine = SyncGraphEngine::new_with_base("local-device", protected_document.clone());

    assert_eq!(
        engine
            .merge_remote_node_with_report(&mut protected_document, node)
            .unwrap_err(),
        SyncError::ProtectedPeerRejected,
    );
}

#[test]
fn legacy_merge_rejects_standard_profile_after_membership_is_established() {
    use vgt_syncgraph::MemberRole;

    let (base, table_id) = create_test_grid_doc();
    let node = create_test_grid_edit_node(&base, &table_id);
    let mut target_document = base;
    let mut engine = SyncGraphEngine::new_with_base("local-device", target_document.clone());
    engine
        .membership
        .add_member("owner", MemberRole::Owner)
        .unwrap();

    assert_eq!(
        engine
            .merge_remote_node_with_report(&mut target_document, node)
            .unwrap_err(),
        SyncError::ProtectedPeerRejected,
    );
}

#[test]
fn test_same_cell_concurrent_conflict_convergence() {
    let (initial_doc, tbl_id) = create_test_grid_doc();

    let mut doc_alice = initial_doc.clone();
    let mut doc_bob = initial_doc.clone();

    let mut alice_engine = SyncGraphEngine::new_with_base("alice", initial_doc.clone());
    let mut bob_engine = SyncGraphEngine::new_with_base("bob", initial_doc.clone());

    // Alice sets A1 = 100
    let op_alice = WorkspaceOperation::SetCell {
        table_id: tbl_id.clone(),
        coord: "A1".to_string(),
        old_value: CellValue::Empty,
        new_value: CellValue::Number(100.0),
        old_formula: None,
        new_formula: None,
    };
    let node_alice = alice_engine
        .record_local_operation(&mut doc_alice, op_alice)
        .unwrap();

    // Bob sets A1 = 200 concurrently (same parent context: initial doc)
    let op_bob = WorkspaceOperation::SetCell {
        table_id: tbl_id.clone(),
        coord: "A1".to_string(),
        old_value: CellValue::Empty,
        new_value: CellValue::Number(200.0),
        old_formula: None,
        new_formula: None,
    };
    let node_bob = bob_engine
        .record_local_operation(&mut doc_bob, op_bob)
        .unwrap();

    // Alice receives Bob's op
    alice_engine
        .merge_remote_node(&mut doc_alice, node_bob.clone())
        .unwrap();

    // Bob receives Alice's op
    bob_engine
        .merge_remote_node(&mut doc_bob, node_alice.clone())
        .unwrap();

    // Both documents MUST converge to the exact same cell value and object state
    let alice_tbl = match doc_alice.get_object(&tbl_id).unwrap() {
        WorkspaceObject::Table(t) => t,
        _ => panic!("Expected table"),
    };
    let bob_tbl = match doc_bob.get_object(&tbl_id).unwrap() {
        WorkspaceObject::Table(t) => t,
        _ => panic!("Expected table"),
    };

    assert_eq!(
        alice_tbl.cells.get("A1").unwrap().value,
        bob_tbl.cells.get("A1").unwrap().value
    );
    assert_eq!(doc_alice.objects, doc_bob.objects);
}

#[test]
fn test_all_delivery_permutations_converge() {
    let (initial_doc, tbl_id) = create_test_grid_doc();

    // Three concurrent operations from 3 distinct peers
    let node_a = SyncNode {
        op_id: "op-alice-1".to_string(),
        actor_id: "peer-alice".to_string(),
        device_id: "peer-alice".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![
            (tbl_id.clone()).clone(),
            format!("{}#cell:{}", tbl_id.clone(), "A1".to_string()),
        ],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1000,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id: tbl_id.clone(),
            coord: "A1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(10.0),
            old_formula: None,
            new_formula: None,
        },
    };

    let node_b = SyncNode {
        op_id: "op-bob-1".to_string(),
        actor_id: "peer-bob".to_string(),
        device_id: "peer-bob".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![
            (tbl_id.clone()).clone(),
            format!("{}#cell:{}", tbl_id.clone(), "B1".to_string()),
        ],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1001,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id: tbl_id.clone(),
            coord: "B1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(20.0),
            old_formula: None,
            new_formula: None,
        },
    };

    let node_c = SyncNode {
        op_id: "op-charlie-1".to_string(),
        actor_id: "peer-charlie".to_string(),
        device_id: "peer-charlie".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![
            (tbl_id.clone()).clone(),
            format!("{}#cell:{}", tbl_id.clone(), "A1".to_string()),
        ],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1002,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id: tbl_id.clone(),
            coord: "A1".to_string(), // Conflicts with Alice on A1
            old_value: CellValue::Empty,
            new_value: CellValue::Number(99.0),
            old_formula: None,
            new_formula: None,
        },
    };

    // All 3! = 6 permutations
    let permutations = vec![
        vec![&node_a, &node_b, &node_c],
        vec![&node_a, &node_c, &node_b],
        vec![&node_b, &node_a, &node_c],
        vec![&node_b, &node_c, &node_a],
        vec![&node_c, &node_a, &node_b],
        vec![&node_c, &node_b, &node_a],
    ];

    let mut converged_docs = Vec::new();

    for (idx, perm) in permutations.into_iter().enumerate() {
        let mut doc = initial_doc.clone();
        let mut engine =
            SyncGraphEngine::new_with_base(&format!("observer-{}", idx), initial_doc.clone());

        for node in perm {
            engine.merge_remote_node(&mut doc, (*node).clone()).unwrap();
        }

        converged_docs.push(doc);
    }

    // Every single permutation must produce the exact same document
    let first_doc = &converged_docs[0];
    for (idx, doc) in converged_docs.iter().enumerate().skip(1) {
        assert_eq!(
            first_doc.objects, doc.objects,
            "Permutation {} diverged from permutation 0!",
            idx
        );
    }
}

#[test]
fn test_causal_buffering_out_of_order_arrival() {
    let (initial_doc, tbl_id) = create_test_grid_doc();

    let mut doc_target = initial_doc.clone();
    let mut engine = SyncGraphEngine::new_with_base("target-engine", initial_doc.clone());

    // Parent op: sets A1 = 100
    let parent_node = SyncNode {
        op_id: "parent-op-001".to_string(),
        actor_id: "alice".to_string(),
        device_id: "alice".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![
            (tbl_id.clone()).clone(),
            format!("{}#cell:{}", tbl_id.clone(), "A1".to_string()),
        ],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1000,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id: tbl_id.clone(),
            coord: "A1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(100.0),
            old_formula: None,
            new_formula: None,
        },
    };

    // Child op: sets B1 = 200, causally dependent on parent-op-001
    let child_node = SyncNode {
        op_id: "child-op-002".to_string(),
        actor_id: "alice".to_string(),
        device_id: "alice".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![
            (tbl_id.clone()).clone(),
            format!("{}#cell:{}", tbl_id.clone(), "B1".to_string()),
        ],
        lamport_time: 2,
        parent_ids: vec!["parent-op-001".to_string()],
        timestamp_utc: 2000,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id: tbl_id.clone(),
            coord: "B1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(200.0),
            old_formula: None,
            new_formula: None,
        },
    };

    // Deliver CHILD first (out of order!)
    engine
        .merge_remote_node(&mut doc_target, child_node.clone())
        .unwrap();

    // Child should be buffered because its parent is missing
    assert_eq!(engine.pending_buffer_count(), 1);

    // Now deliver PARENT
    engine
        .merge_remote_node(&mut doc_target, parent_node.clone())
        .unwrap();

    // Causal buffer should have drained completely
    assert_eq!(engine.pending_buffer_count(), 0);

    // Both A1 and B1 must be applied
    let tbl = match doc_target.get_object(&tbl_id).unwrap() {
        WorkspaceObject::Table(t) => t,
        _ => panic!("Expected table"),
    };
    assert_eq!(tbl.cells.get("A1").unwrap().value, CellValue::Number(100.0));
    assert_eq!(tbl.cells.get("B1").unwrap().value, CellValue::Number(200.0));
}

#[test]
fn test_idempotent_replay_protection() {
    let (initial_doc, tbl_id) = create_test_grid_doc();
    let mut doc = initial_doc.clone();
    let mut engine = SyncGraphEngine::new_with_base("test-engine", initial_doc.clone());

    let node = SyncNode {
        op_id: "unique-op-99".to_string(),
        actor_id: "alice".to_string(),
        device_id: "alice".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![
            (tbl_id.clone()).clone(),
            format!("{}#cell:{}", tbl_id.clone(), "C1".to_string()),
        ],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1000,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id: tbl_id.clone(),
            coord: "C1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(42.0),
            old_formula: None,
            new_formula: None,
        },
    };

    // Deliver 3 times
    engine.merge_remote_node(&mut doc, node.clone()).unwrap();
    engine.merge_remote_node(&mut doc, node.clone()).unwrap();
    engine.merge_remote_node(&mut doc, node.clone()).unwrap();

    assert_eq!(engine.nodes.len(), 1);
    let tbl = match doc.get_object(&tbl_id).unwrap() {
        WorkspaceObject::Table(t) => t,
        _ => panic!("Expected table"),
    };
    assert_eq!(tbl.cells.get("C1").unwrap().value, CellValue::Number(42.0));
}

#[test]
fn test_concurrent_delete_vs_update_race() {
    let (initial_doc, tbl_id) = create_test_grid_doc();

    let mut doc_alice = initial_doc.clone();
    let mut doc_bob = initial_doc.clone();
    let mut alice_engine = SyncGraphEngine::new_with_base("alice", initial_doc.clone());
    let mut bob_engine = SyncGraphEngine::new_with_base("bob", initial_doc.clone());

    // Alice deletes the entire table
    let op_del = WorkspaceOperation::RemoveObject {
        object_id: tbl_id.clone(),
        cached_object: initial_doc.get_object(&tbl_id).unwrap().clone(),
        was_root: true,
    };
    let node_alice = alice_engine
        .record_local_operation(&mut doc_alice, op_del)
        .unwrap();

    // Bob concurrently updates cell A1 on that table
    let op_edit = WorkspaceOperation::SetCell {
        table_id: tbl_id.clone(),
        coord: "A1".to_string(),
        old_value: CellValue::Empty,
        new_value: CellValue::Number(777.0),
        old_formula: None,
        new_formula: None,
    };
    let node_bob = bob_engine
        .record_local_operation(&mut doc_bob, op_edit)
        .unwrap();

    // Cross-merge
    alice_engine
        .merge_remote_node(&mut doc_alice, node_bob)
        .unwrap();
    bob_engine
        .merge_remote_node(&mut doc_bob, node_alice)
        .unwrap();

    // Both converge: the table is deleted on both, no panic or corruption
    assert_eq!(doc_alice.objects.get(&tbl_id), None);
    assert_eq!(doc_bob.objects.get(&tbl_id), None);
    assert_eq!(doc_alice.objects, doc_bob.objects);
}

#[test]
fn test_text_concurrent_convergence() {
    let mut initial_doc = WorkspaceDocument::new("Doc", DocumentKind::Writer);
    let block_id = "text-1".to_string();
    initial_doc.add_root_object(WorkspaceObject::TextBlock(TextBlockObject {
        id: block_id.clone(),
        paragraphs: vec![vgt_object_model::Paragraph {
            id: "p-1".to_string(),
            style: Default::default(),
            spans: vec![TextSpan {
                text: "Hello".to_string(),
                ..Default::default()
            }],
        }],
    }));

    let mut doc_1 = initial_doc.clone();
    let mut doc_2 = initial_doc.clone();
    let mut engine_1 = SyncGraphEngine::new_with_base("peer-1", initial_doc.clone());
    let mut engine_2 = SyncGraphEngine::new_with_base("peer-2", initial_doc.clone());

    let op_1 = WorkspaceOperation::InsertText {
        block_id: block_id.clone(),
        paragraph_idx: 0,
        text: " World".to_string(),
    };
    let node_1 = engine_1.record_local_operation(&mut doc_1, op_1).unwrap();

    let op_2 = WorkspaceOperation::InsertText {
        block_id: block_id.clone(),
        paragraph_idx: 0,
        text: " Alice".to_string(),
    };
    let node_2 = engine_2.record_local_operation(&mut doc_2, op_2).unwrap();

    engine_1.merge_remote_node(&mut doc_1, node_2).unwrap();
    engine_2.merge_remote_node(&mut doc_2, node_1).unwrap();

    assert_eq!(doc_1.objects, doc_2.objects);
}

fn create_writer_doc() -> (WorkspaceDocument, String) {
    let mut doc = WorkspaceDocument::new("Collaborative Writer", DocumentKind::Writer);
    doc.version = 7;
    doc.modified_at = 500;
    let block_id = "writer-main".to_string();
    doc.add_root_object(WorkspaceObject::TextBlock(TextBlockObject {
        id: block_id.clone(),
        paragraphs: vec![vgt_object_model::Paragraph {
            id: "p-1".to_string(),
            style: Default::default(),
            spans: vec![TextSpan {
                text: "Base".to_string(),
                ..Default::default()
            }],
        }],
    }));
    (doc, block_id)
}

#[test]
fn writer_paragraph_operations_converge_with_deterministic_metadata() {
    let (initial_doc, block_id) = create_writer_doc();
    let base_version = initial_doc.version;
    let mut doc_a = initial_doc.clone();
    let mut doc_b = initial_doc.clone();
    let mut engine_a = SyncGraphEngine::new_with_base("alice", initial_doc.clone());
    let mut engine_b = SyncGraphEngine::new_with_base("bob", initial_doc.clone());

    let before = match initial_doc.get_object(&block_id).unwrap() {
        WorkspaceObject::TextBlock(block) => block.paragraphs[0].clone(),
        _ => panic!("Expected Writer TextBlock"),
    };
    let mut after = before.clone();
    after.spans[0].text = "Base edited by Alice".to_string();
    let node_a = engine_a
        .record_local_operation(
            &mut doc_a,
            WorkspaceOperation::ReplaceParagraph {
                block_id: block_id.clone(),
                paragraph_id: before.id.clone(),
                before: before.clone(),
                after: Box::new(after),
            },
        )
        .unwrap();

    let inserted = vgt_object_model::Paragraph {
        id: "p-2".to_string(),
        style: Default::default(),
        spans: vec![TextSpan {
            text: "Bob paragraph".to_string(),
            ..Default::default()
        }],
    };
    let node_b = engine_b
        .record_local_operation(
            &mut doc_b,
            WorkspaceOperation::InsertParagraph {
                block_id: block_id.clone(),
                index: 1,
                paragraph: inserted,
            },
        )
        .unwrap();

    engine_a.merge_remote_node(&mut doc_a, node_b).unwrap();
    engine_b.merge_remote_node(&mut doc_b, node_a).unwrap();

    assert_eq!(doc_a.objects, doc_b.objects);
    assert_eq!(doc_a.version, doc_b.version);
    assert_eq!(doc_a.modified_at, doc_b.modified_at);
    assert_eq!(doc_a.version, base_version + 2);
}

#[test]
fn concurrent_writer_replace_conflict_is_audited_and_converges() {
    let (mut initial_doc, block_id) = create_writer_doc();
    initial_doc.modified_at = 500;
    let before = match initial_doc.get_object(&block_id).unwrap() {
        WorkspaceObject::TextBlock(block) => block.paragraphs[0].clone(),
        _ => panic!("Expected Writer TextBlock"),
    };

    let mut alice_after = before.clone();
    alice_after.spans[0].text = "Alice".to_string();
    let node_alice = SyncNode {
        op_id: "writer-alice-1".into(),
        actor_id: "alice".into(),
        device_id: "alice".into(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![(block_id.clone()).clone()],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1_000,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::ReplaceParagraph {
            block_id: block_id.clone(),
            paragraph_id: before.id.clone(),
            before: before.clone(),
            after: Box::new(alice_after),
        },
    };
    let mut bob_after = before.clone();
    bob_after.spans[0].text = "Bob".to_string();
    let node_bob = SyncNode {
        op_id: "writer-bob-1".into(),
        actor_id: "bob".into(),
        device_id: "bob".into(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![(block_id.clone()).clone()],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1_001,
        document_id: initial_doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::ReplaceParagraph {
            block_id: block_id.clone(),
            paragraph_id: before.id.clone(),
            before: before.clone(),
            after: Box::new(bob_after),
        },
    };

    let mut first = initial_doc.clone();
    let mut first_engine = SyncGraphEngine::new_with_base("observer-a", initial_doc.clone());
    first_engine
        .merge_remote_node(&mut first, node_bob.clone())
        .unwrap();
    let first_report = first_engine
        .merge_remote_node_with_report(&mut first, node_alice.clone())
        .unwrap();

    let mut second = initial_doc.clone();
    let mut second_engine = SyncGraphEngine::new_with_base("observer-b", initial_doc.clone());
    second_engine
        .merge_remote_node(&mut second, node_alice)
        .unwrap();
    let second_report = second_engine
        .merge_remote_node_with_report(&mut second, node_bob)
        .unwrap();

    assert_eq!(first, second);
    assert_eq!(first_report.conflicts.len(), 1);
    assert_eq!(second_report.conflicts.len(), 1);
    assert_eq!(first.version, initial_doc.version + 1);
    assert_eq!(first.modified_at, 1_000);
}

#[test]
fn logical_clock_boundary_rejects_local_overflow() {
    let (mut doc, table_id) = create_test_grid_doc();
    let mut engine = SyncGraphEngine::new_with_base("boundary-local", doc.clone());
    engine.local_lamport_time = MAX_LOGICAL_TIME;
    engine
        .vector_clock
        .clock
        .insert("boundary-local".to_string(), MAX_LOGICAL_TIME);

    let result = engine.record_local_operation(
        &mut doc,
        WorkspaceOperation::SetCell {
            table_id,
            coord: "A1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(1.0),
            old_formula: None,
            new_formula: None,
        },
    );

    assert_eq!(result.unwrap_err(), SyncError::LogicalClockBoundary);
}

#[test]
fn logical_clock_boundary_rejects_unsafe_remote_timestamp() {
    let (mut doc, table_id) = create_test_grid_doc();
    let mut engine = SyncGraphEngine::new_with_base("boundary-remote", doc.clone());
    let node = SyncNode {
        op_id: "unsafe-clock-op".to_string(),
        actor_id: "remote".to_string(),
        device_id: "remote".to_string(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![table_id.clone(), format!("{}#cell:A1", table_id)],
        lamport_time: MAX_LOGICAL_TIME + 1,
        parent_ids: vec![],
        timestamp_utc: 1_000,
        document_id: doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id,
            coord: "A1".to_string(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(2.0),
            old_formula: None,
            new_formula: None,
        },
    };

    assert_eq!(
        engine.merge_remote_node(&mut doc, node).unwrap_err(),
        SyncError::LogicalClockBoundary,
    );
}

#[test]
fn section13_merge_semantics_are_explicit_per_object_family() {
    use vgt_syncgraph::{merge_semantics_for_operation, MergeSemantics};
    let (_, table_id) = create_test_grid_doc();
    let cell = WorkspaceOperation::SetCell {
        table_id,
        coord: "A1".to_string(),
        old_value: CellValue::Empty,
        new_value: CellValue::Number(7.0),
        old_formula: None,
        new_formula: None,
    };
    assert_eq!(
        merge_semantics_for_operation(&cell),
        MergeSemantics::TableCellRegister
    );
    let text = WorkspaceOperation::InsertText {
        block_id: "b".into(),
        paragraph_idx: 0,
        text: "x".into(),
    };
    assert_eq!(
        merge_semantics_for_operation(&text),
        MergeSemantics::TextSequence
    );
}

#[test]
fn section13_presence_is_ephemeral_and_ttl_bounded() {
    use vgt_syncgraph::{PresenceRecord, PresenceRegistry};
    let mut presence = PresenceRegistry::default();
    presence
        .upsert(
            PresenceRecord {
                actor_id: "alice".into(),
                session_id: "s1".into(),
                document_id: "doc".into(),
                display_name: "Alice".into(),
                selection_anchor: Some("p1:3".into()),
                updated_at_ms: 0,
                expires_at_ms: 0,
            },
            1_000,
        )
        .unwrap();
    assert_eq!(presence.active_for_document("doc", 2_000).len(), 1);
    assert!(presence.active_for_document("doc", 100_000).is_empty());
}

#[test]
fn section13_offline_queue_is_authenticated_bounded_and_acknowledged() {
    use vgt_syncgraph::{OfflineQueueState, SyncEnvelopeContext};
    let (doc, table_id) = create_test_grid_doc();
    let node = SyncNode {
        op_id: "q1".into(),
        actor_id: "alice".into(),
        device_id: "alice".into(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec![table_id.clone(), format!("{}#cell:A1", table_id)],
        lamport_time: 1,
        parent_ids: vec![],
        timestamp_utc: 1,
        document_id: doc.id.clone(),
        signature: None,
        operation: WorkspaceOperation::SetCell {
            table_id,
            coord: "A1".into(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(1.0),
            old_formula: None,
            new_formula: None,
        },
    };
    let mut queue = OfflineQueueState::default();
    queue
        .membership
        .add_member("alice", vgt_syncgraph::MemberRole::Owner)
        .unwrap();
    queue
        .membership
        .add_device("alice", "laptop", "key-local")
        .unwrap();
    queue.enqueue(node, 0).unwrap();
    let key = [0x77u8; 32];
    let context = SyncEnvelopeContext {
        document_id: doc.id.clone(),
        session_id: "local-offline-queue".into(),
        membership_epoch: queue.membership.epoch,
        sender_device_id: "local-native-device".into(),
    };
    let sealed = queue.seal_for_storage(&key, context).unwrap();
    let mut restored = OfflineQueueState::restore_from_storage(&sealed, &key).unwrap();
    assert_eq!(restored.outbound.len(), 1);
    assert_eq!(restored.membership.epoch, 2);
    assert_eq!(
        restored.membership.members["alice"].devices["laptop"].key_id,
        "key-local"
    );
    let mut frontier = vgt_syncgraph::VectorClock::new();
    frontier.clock.insert("alice".into(), 1);
    restored.acknowledge(&frontier);
    assert!(restored.outbound.is_empty());
}

#[test]
fn section13_membership_revocation_invalidates_old_epoch() {
    use vgt_object_model::SecurityProfile;
    use vgt_syncgraph::{AuthenticatedPeerContext, MemberRole, MembershipState, SyncError};
    let mut membership = MembershipState::default();
    membership.add_member("alice", MemberRole::Editor).unwrap();
    membership.add_device("alice", "phone", "key-1").unwrap();
    let epoch = membership.epoch;
    let peer = AuthenticatedPeerContext {
        authenticated: true,
        security_profile: SecurityProfile::Standard,
        infinity_suite: None,
        infinity_commit: None,
        member_id: "alice".into(),
        device_id: "phone".into(),
        key_id: "key-1".into(),
        membership_epoch: epoch,
    };
    membership.authorize_peer(&peer, true).unwrap();
    membership.revoke_device("alice", "phone").unwrap();
    assert_eq!(
        membership.authorize_peer(&peer, true),
        Err(SyncError::MembershipRejected)
    );
}

#[test]
fn section13_tombstones_gc_only_after_ack_frontier() {
    use vgt_syncgraph::TombstoneRegistry;
    let mut registry = TombstoneRegistry::default();
    let object = WorkspaceObject::TextBlock(TextBlockObject {
        id: "dead".into(),
        paragraphs: vec![],
    });
    let node = SyncNode {
        op_id: "delete-1".into(),
        actor_id: "alice".into(),
        device_id: "alice".into(),
        schema_version: vgt_syncgraph::SYNC_SCHEMA_VERSION,
        object_ids: vec!["dead".to_owned()],
        lamport_time: 3,
        parent_ids: vec![],
        timestamp_utc: 1,
        document_id: "doc".into(),
        signature: None,
        operation: WorkspaceOperation::RemoveObject {
            object_id: "dead".into(),
            cached_object: object,
            was_root: true,
        },
    };
    registry.observe_node(&node).unwrap();
    let mut frontier = vgt_syncgraph::VectorClock::new();
    frontier.clock.insert("alice".into(), 2);
    assert_eq!(registry.garbage_collect(&frontier), 0);
    frontier.clock.insert("alice".into(), 3);
    assert_eq!(registry.garbage_collect(&frontier), 1);
}

#[test]
fn section13_large_object_transfer_is_chunk_bounded_and_digest_finalized() {
    use vgt_crypto::hash_blake3;
    use vgt_syncgraph::{describe_large_object_chunk, LargeObjectManifest, LargeObjectReceiver};
    let data = vec![0x5au8; 1024];
    let manifest = LargeObjectManifest::new(
        "t1".into(),
        "asset-1".into(),
        data.len() as u64,
        256,
        hash_blake3(&data),
    )
    .unwrap();
    let mut receiver = LargeObjectReceiver::new(manifest.clone());
    for index in 0..manifest.chunk_count {
        let start = index as usize * 256;
        let end = (start + 256).min(data.len());
        receiver
            .accept_descriptor(
                describe_large_object_chunk(&manifest, index, &data[start..end]).unwrap(),
            )
            .unwrap();
    }
    assert!(receiver.is_complete());
    receiver.finalize(hash_blake3(&data)).unwrap();
}

#[test]
fn section13_snapshot_bootstrap_requires_dominating_frontier() {
    use vgt_syncgraph::{SyncError, SyncSnapshot, VectorClock};
    let (doc, _) = create_test_grid_doc();
    let mut snapshot_frontier = VectorClock::new();
    snapshot_frontier.clock.insert("alice".into(), 5);
    let snapshot = SyncSnapshot::capture(&doc, &snapshot_frontier, 2, 100).unwrap();
    let mut local = VectorClock::new();
    local.clock.insert("alice".into(), 4);
    snapshot.permits_bootstrap_over(&local).unwrap();
    local.clock.insert("alice".into(), 6);
    assert_eq!(
        snapshot.permits_bootstrap_over(&local),
        Err(SyncError::SnapshotRejected)
    );
}

#[test]
fn section13_backpressure_pauses_at_hard_boundary() {
    use vgt_syncgraph::{backpressure_decision, BackpressureDecision, MAX_QUEUE_ENTRIES};
    assert_eq!(backpressure_decision(0, 0, 0), BackpressureDecision::Accept);
    assert_eq!(
        backpressure_decision(MAX_QUEUE_ENTRIES, 0, 0),
        BackpressureDecision::Pause
    );
}

#[test]
fn section13_local_ids_bind_logical_time_and_parent_causality() {
    let (mut doc, table_id) = create_test_grid_doc();
    let mut engine = SyncGraphEngine::new_with_base("alice", doc.clone());
    let first = engine
        .record_local_operation(
            &mut doc,
            WorkspaceOperation::SetCell {
                table_id: table_id.clone(),
                coord: "A1".into(),
                old_value: CellValue::Empty,
                new_value: CellValue::Number(1.0),
                old_formula: None,
                new_formula: None,
            },
        )
        .unwrap();
    let second = engine
        .record_local_operation(
            &mut doc,
            WorkspaceOperation::SetCell {
                table_id,
                coord: "B1".into(),
                old_value: CellValue::Empty,
                new_value: CellValue::Number(2.0),
                old_formula: None,
                new_formula: None,
            },
        )
        .unwrap();
    assert!(first.op_id.starts_with("sg2-0000000000000001-"));
    assert!(second.op_id.starts_with("sg2-0000000000000002-"));
    assert_eq!(second.parent_ids, vec![first.op_id]);
}

#[test]
fn section13_transport_envelope_binds_context_and_rejects_tamper() {
    use vgt_syncgraph::{open_transport_payload, seal_transport_payload, SyncEnvelopeContext};
    let key = [0x33u8; 32];
    let context = SyncEnvelopeContext {
        document_id: "doc".into(),
        session_id: "s".into(),
        membership_epoch: 7,
        sender_device_id: "device".into(),
    };
    let mut sealed = seal_transport_payload(b"node-payload", &key, context).unwrap();
    assert_eq!(
        open_transport_payload(&sealed, &key).unwrap(),
        b"node-payload"
    );
    sealed.ciphertext[0] ^= 0x40;
    assert!(open_transport_payload(&sealed, &key).is_err());
}
