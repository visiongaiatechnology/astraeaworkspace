//! # VGT Workspace Core Runtime & Workspace Fabric
//!
//! Orchestrates the unified local-first productivity environment:
//! - Workspace Session manager (multiple open tabs / documents)
//! - Workspace Fabric: Cross-document object graph dependency tracking and live syncing
//! - Transactional encrypted persistence via VgtContainer
//! - Unified NetGate policy enforcement
//! - Formula computation synchronization

use std::collections::HashMap;
use thiserror::Error;
use vgt_container::{ContainerError, SaveOptions, VgtContainer};
use vgt_keyvault::VgtKeyVault;
use vgt_netgate::NetGate;
use vgt_object_model::{
    DocumentKind, ReferenceMode, ReferenceStatus, WorkspaceDocument, WorkspaceObject, WorkspaceReferenceObject,
};
pub use vgt_workspace_fabric::{FabricUpdateNotice, WorkspaceFabric};

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Document not found: {0}")]
    DocumentNotFound(String),

    #[error("Object not found: {0}")]
    ObjectNotFound(String),

    #[error("Container error: {0}")]
    Container(#[from] ContainerError),

    #[error("Fabric link error: {0}")]
    FabricError(String),
}

/// Main Workspace Session orchestrator
pub struct WorkspaceSession {
    pub keyvault: VgtKeyVault,
    pub netgate: NetGate,
    pub fabric: WorkspaceFabric,
    pub documents: HashMap<String, WorkspaceDocument>,
    pub active_document_id: Option<String>,
}

impl WorkspaceSession {
    pub fn new() -> Self {
        let mut keyvault = VgtKeyVault::new();
        let _ = keyvault.ensure_workspace_root(); // Initialize master key

        Self {
            keyvault,
            netgate: NetGate::new(),
            fabric: WorkspaceFabric::new(),
            documents: HashMap::new(),
            active_document_id: None,
        }
    }

    /// Create a new document in the session
    pub fn create_document(&mut self, title: &str, kind: DocumentKind) -> String {
        let doc = WorkspaceDocument::new(title, kind);
        let id = doc.id.clone();
        self.documents.insert(id.clone(), doc);
        self.active_document_id = Some(id.clone());
        id
    }

    /// Save a document into an encrypted VWC container binary
    pub fn save_document(
        &mut self,
        doc_id: &str,
        pin: Option<&str>,
        portable_password: Option<&str>,
    ) -> Result<Vec<u8>, CoreError> {
        let doc = self
            .documents
            .get(doc_id)
            .ok_or_else(|| CoreError::DocumentNotFound(doc_id.to_string()))?;

        let bytes = VgtContainer::pack_document(
            doc,
            &mut self.keyvault,
            SaveOptions {
                policy: None,
                pin,
                portable_password,
                recipient_public_key: None,
            },
        )?;

        Ok(bytes)
    }

    /// Open an encrypted VWC container into the session
    pub fn open_document_with_vault(&mut self, bytes: &[u8]) -> Result<String, CoreError> {
        let doc = VgtContainer::unpack_with_vault(bytes, &self.keyvault)?;
        let id = doc.id.clone();

        // Scan document for any WorkspaceReference objects and re-register in Fabric
        for (obj_id, obj) in &doc.objects {
            if let WorkspaceObject::WorkspaceReference(r) = obj {
                self.fabric.register_link(&id, obj_id, &r.uri, r.mode);
            }
        }

        self.documents.insert(id.clone(), doc);
        self.active_document_id = Some(id.clone());
        Ok(id)
    }

    /// Link an object from a source document into a target document via Workspace Fabric
    pub fn link_object(
        &mut self,
        target_doc_id: &str,
        source_doc_id: &str,
        source_object_id: &str,
        mode: ReferenceMode,
    ) -> Result<String, CoreError> {
        // 1. Verify source object exists
        let source_doc = self
            .documents
            .get(source_doc_id)
            .ok_or_else(|| CoreError::DocumentNotFound(source_doc_id.to_string()))?;

        let source_obj = source_doc
            .get_object(source_object_id)
            .ok_or_else(|| CoreError::ObjectNotFound(source_object_id.to_string()))?;

        if mode == ReferenceMode::Live && self.fabric.would_create_cycle(source_doc_id, target_doc_id) {
            return Err(CoreError::FabricError(format!(
                "Workspace Fabric cycle rejected: {} -> {}",
                source_doc_id, target_doc_id
            )));
        }
        let source_version = source_doc.version;
        let expected_type = source_obj.type_name().to_string();

        let cached_snapshot = match mode {
            ReferenceMode::Frozen => Some(Box::new(source_obj.clone())),
            ReferenceMode::Live => None,
        };

        let uri = format!(
            "vgt://workspace/document/{}/object/{}",
            source_doc_id, source_object_id
        );
        let ref_obj = WorkspaceReferenceObject {
            id: uuid::Uuid::new_v4().to_string(),
            uri: uri.clone(),
            mode,
            cached_snapshot: cached_snapshot.clone(),
            expected_type: Some(expected_type),
            source_snapshot_id: if mode == ReferenceMode::Frozen { Some(format!("snapshot-{}-{}", source_version, source_object_id)) } else { None },
            source_version: Some(source_version),
            resolved_source_version: Some(source_version),
            fabric_status: Some(match mode {
                ReferenceMode::Live => ReferenceStatus::Current,
                ReferenceMode::Frozen => ReferenceStatus::Frozen,
            }),
            frozen_at: None,
            permission_provenance: Some(vgt_object_model::WorkspaceReferencePermissionProvenance {
                source_document_id: source_doc_id.to_string(),
                source_policy_version: None,
                source_role_ceiling: Some("viewer".to_string()),
                snapshot_explicitly_embedded: mode == ReferenceMode::Frozen,
            }),
            permission_state: Some("unknown".to_string()),
            fallback_snapshot: cached_snapshot,
            fallback_policy: Some(if mode == ReferenceMode::Frozen { "allowed".to_string() } else { "forbidden".to_string() }),
            common: Some(vgt_object_model::WorkspaceObjectCommonMetadata {
                ownership: Some(match mode {
                    ReferenceMode::Live => vgt_object_model::WorkspaceObjectOwnership::ExternalLive,
                    ReferenceMode::Frozen => vgt_object_model::WorkspaceObjectOwnership::ExternalFrozen,
                }),
                ..Default::default()
            }),
        };

        let ref_id = ref_obj.id.clone();

        // 2. Insert reference into target document
        let target_doc = self
            .documents
            .get_mut(target_doc_id)
            .ok_or_else(|| CoreError::DocumentNotFound(target_doc_id.to_string()))?;

        target_doc.add_root_object(WorkspaceObject::WorkspaceReference(ref_obj));

        // 3. Register in Fabric
        self.fabric
            .register_link(target_doc_id, &ref_id, &uri, mode);

        Ok(ref_id)
    }

    /// Update an object in a document and propagate live changes through Fabric
    pub fn update_object(
        &mut self,
        doc_id: &str,
        updated_object: WorkspaceObject,
    ) -> Result<Vec<FabricUpdateNotice>, CoreError> {
        let obj_id = updated_object.id().to_string();

        // Stage the entire multi-document update. The live session is replaced only after every
        // affected reference has been validated and updated, preventing half-applied propagation.
        let mut staged = self.documents.clone();
        let source_version = {
            let doc = staged
                .get_mut(doc_id)
                .ok_or_else(|| CoreError::DocumentNotFound(doc_id.to_string()))?;
            doc.add_object(updated_object.clone());
            doc.version
        };

        let notices = self.fabric.notify_object_changed(doc_id, &obj_id);
        for notice in &notices {
            if notice.mode != ReferenceMode::Live {
                continue;
            }
            let target_doc = staged
                .get_mut(&notice.target_doc_id)
                .ok_or_else(|| CoreError::DocumentNotFound(notice.target_doc_id.clone()))?;
            let target_object = target_doc
                .get_object_mut(&notice.target_reference_id)
                .ok_or_else(|| CoreError::ObjectNotFound(notice.target_reference_id.clone()))?;
            let WorkspaceObject::WorkspaceReference(reference) = target_object else {
                return Err(CoreError::FabricError(format!(
                    "Target object '{}' is no longer a WorkspaceReference",
                    notice.target_reference_id
                )));
            };
            if let Some(expected) = &reference.expected_type {
                if expected != updated_object.type_name() {
                    reference.fabric_status = Some(ReferenceStatus::Broken);
                    continue;
                }
            }
            reference.cached_snapshot = None;
            reference.fallback_snapshot = None;
            reference.fallback_policy = Some("forbidden".to_string());
            if let Some(provenance) = reference.permission_provenance.as_mut() { provenance.snapshot_explicitly_embedded = false; }
            reference.source_version = Some(source_version);
            reference.resolved_source_version = Some(source_version);
            reference.fabric_status = Some(ReferenceStatus::Current);
        }

        self.documents = staged;
        Ok(notices)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vgt_object_model::{ChartObject, ChartSeries, ChartType};

    #[test]
    fn test_fabric_live_linking_between_grid_and_present() {
        let mut session = WorkspaceSession::new();

        // 1. Create Grid document with RevenueChart
        let grid_id = session.create_document("Revenue.vgrid", DocumentKind::Grid);
        let chart = ChartObject {
            id: "revenue-chart-1".to_string(),
            chart_type: ChartType::Column,
            title: "Q1-Q4 Revenue".to_string(),
            categories: vec!["Q1".into(), "Q2".into(), "Q3".into(), "Q4".into()],
            series: vec![ChartSeries {
                name: "2026 Forecast".into(),
                values: vec![100.0, 150.0, 200.0, 250.0],
                color: Some("#3b82f6".into()),
            }],
            data_source_link: None,
        };

        session
            .documents
            .get_mut(&grid_id)
            .unwrap()
            .add_root_object(WorkspaceObject::Chart(chart.clone()));

        // 2. Create Present document
        let present_id = session.create_document("Board.vpresent", DocumentKind::Present);

        // 3. Link RevenueChart from Grid into Present as LIVE object
        let ref_id = session
            .link_object(
                &present_id,
                &grid_id,
                "revenue-chart-1",
                ReferenceMode::Live,
            )
            .expect("linking failed");

        // Verify initial reference state in Present
        let present_doc = session.documents.get(&present_id).unwrap();
        let ref_obj = match present_doc.get_object(&ref_id).unwrap() {
            WorkspaceObject::WorkspaceReference(r) => r,
            _ => panic!("Expected WorkspaceReference"),
        };
        assert_eq!(ref_obj.mode, ReferenceMode::Live);

        // 4. Update RevenueChart in Grid with new Q4 numbers
        let mut updated_chart = chart.clone();
        updated_chart.series[0].values[3] = 320.0; // Q4 increased from 250 to 320

        let notices = session
            .update_object(&grid_id, WorkspaceObject::Chart(updated_chart))
            .expect("update failed");

        // Fabric should have reported exactly 1 subscriber update
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].target_doc_id, present_id);
        assert_eq!(notices[0].target_reference_id, ref_id);

        // 5. LIVE references advance authenticated version metadata without copying source
        // content into the target document. This prevents permission loss from leaving behind
        // an implicit secret snapshot. Frozen links are the explicit snapshot mechanism.
        let updated_present_doc = session.documents.get(&present_id).unwrap();
        if let WorkspaceObject::WorkspaceReference(r) = updated_present_doc.get_object(&ref_id).unwrap() {
            assert!(r.cached_snapshot.is_none());
            assert!(r.fallback_snapshot.is_none());
            assert_eq!(r.resolved_source_version, session.documents.get(&grid_id).map(|doc| doc.version));
        }
    }
}
