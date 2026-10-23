//! # Document archetype and top-level document model

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

use crate::objects::WorkspaceObject;
use crate::{
    NoteLibraryModel, NoteModelError, PdfDocumentModel, PdfModelError, PresentDocumentModel,
    PresentModelError, VaultManifestModel, VaultModelError, WorkManagementModel, WorkModelError,
    WriterDocumentModel, WriterModelError,
};

/// Canonical schema version
pub const WOM_SCHEMA_VERSION: u32 = 2;
const WOM_IDENTITY_EXTENSION: &str = "vgt.wom:identity";
const MAX_TOMBSTONES: usize = 200_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceIdentityTombstone {
    pub id: String,
    pub tombstone: bool,
    pub deleted_at: i64,
    pub author_signature: String,
    pub payload: serde_json::Value,
}

#[derive(Error, Debug, PartialEq, Eq)]
pub enum WorkspaceIdentityError {
    #[error("workspace object does not exist")]
    MissingObject,
    #[error("workspace tombstone timestamp is invalid")]
    InvalidTimestamp,
    #[error("workspace tombstone author signature is invalid")]
    InvalidAuthorSignature,
    #[error("workspace identity tombstone state is invalid")]
    InvalidTombstoneState,
    #[error("workspace identity tombstone limit exceeded")]
    TombstoneLimitExceeded,
}

/// The document archetype across all VGT Workspace applications
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DocumentKind {
    Writer,
    Grid,
    Present,
    Notes,
    PdfStudio,
    Draw,
    Whiteboard,
    Forms,
    Database,
    Publish,
    Insight,
    Tasks,
    Planner,
    Projects,
    Vault,
    Spaces,
    Connect,
    Automate,
    AdminPolicy,
    GaiaCom,
}

impl DocumentKind {
    pub fn file_extension(&self) -> Option<&'static str> {
        match self {
            DocumentKind::Writer => Some("vdoc"),
            DocumentKind::Grid => Some("vgrid"),
            DocumentKind::Present => Some("vpresent"),
            DocumentKind::Notes => Some("vnote"),
            DocumentKind::PdfStudio => Some("vpdf"),
            DocumentKind::Draw => Some("vdraw"),
            DocumentKind::Whiteboard => Some("vboard"),
            DocumentKind::Forms => None,
            DocumentKind::Database => None,
            DocumentKind::Publish => Some("vpub"),
            DocumentKind::Insight => Some("vinsight"),
            DocumentKind::Tasks => Some("vtask"),
            DocumentKind::Planner => None,
            DocumentKind::Projects => None,
            DocumentKind::Vault => Some("vvault"),
            DocumentKind::Spaces => None,
            DocumentKind::Connect => Some("vconnect"),
            DocumentKind::Automate => Some("vauto"),
            DocumentKind::AdminPolicy => Some("vpolicy"),
            DocumentKind::GaiaCom => None,
        }
    }
}

/// Canonical Workspace security profile. This is authenticated WOM truth, not UI state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SecurityProfile {
    #[default]
    Standard,
    Pqc,
    VgtTopSecret,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SecurityPolicyMetadata {
    #[serde(default)]
    pub profile: SecurityProfile,
    #[serde(default)]
    pub inherited_from_workspace: bool,
    #[serde(default)]
    pub downgrade_authorized: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub infinity_suite: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub infinity_commit: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtectionMetadata {
    #[serde(default = "default_protection_version")]
    pub version: u32,
    #[serde(default = "default_protection_classification")]
    pub classification: String,
    #[serde(default)]
    pub locked: bool,
    #[serde(default, rename = "readOnly")]
    pub read_only: bool,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "policyId")]
    pub policy_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "sensitivityLabel"
    )]
    pub sensitivity_label: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "retentionPolicyId"
    )]
    pub retention_policy_id: Option<String>,
}

impl Default for ProtectionMetadata {
    fn default() -> Self {
        Self {
            version: 1,
            classification: "standard".to_string(),
            locked: false,
            read_only: false,
            policy_id: None,
            sensitivity_label: None,
            retention_policy_id: None,
        }
    }
}

fn default_protection_version() -> u32 {
    1
}
fn default_protection_classification() -> String {
    "standard".to_string()
}

/// The top-level canonical document model
///
/// App-specific payloads intentionally cross the Rust IPC boundary as opaque JSON values.
/// The Rust container/crypto layer must preserve every canonical WOM field byte-for-byte
/// semantically even when an application evolves faster than the core crate.  Typed app
/// models may be used by application engines, but the storage boundary MUST NOT discard
/// unknown/new fields during serde round-trips.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceDocument {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub kind: DocumentKind,
    pub created_at: i64,
    pub modified_at: i64,
    pub version: u64,
    pub theme_id: String,
    #[serde(default, rename = "securityPolicy")]
    pub security_policy: SecurityPolicyMetadata,
    #[serde(default)]
    pub protection: ProtectionMetadata,
    #[serde(
        default,
        rename = "wom_extensions",
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub wom_extensions: HashMap<String, serde_json::Value>,
    pub root_object_ids: Vec<String>,
    pub objects: HashMap<String, WorkspaceObject>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notebooks: Option<serde_json::Value>,
    #[serde(rename = "noteData", default, skip_serializing_if = "Option::is_none")]
    pub note_data: Option<serde_json::Value>,
    #[serde(rename = "pdfData", default, skip_serializing_if = "Option::is_none")]
    pub pdf_data: Option<serde_json::Value>,
    #[serde(
        rename = "presentData",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub present_data: Option<serde_json::Value>,
    #[serde(rename = "gridData", default, skip_serializing_if = "Option::is_none")]
    pub grid_data: Option<serde_json::Value>,
    #[serde(rename = "formsData", default, skip_serializing_if = "Option::is_none")]
    pub forms_data: Option<serde_json::Value>,
    #[serde(
        rename = "databaseData",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub database_data: Option<serde_json::Value>,
    #[serde(rename = "workData", default, skip_serializing_if = "Option::is_none")]
    pub work_data: Option<serde_json::Value>,
    #[serde(
        rename = "workManagementData",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub work_management_data: Option<serde_json::Value>,
    #[serde(rename = "vaultData", default, skip_serializing_if = "Option::is_none")]
    pub vault_data: Option<serde_json::Value>,
    #[serde(
        rename = "writerData",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub writer_data: Option<serde_json::Value>,
    #[serde(
        rename = "whiteboardData",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub whiteboard_data: Option<serde_json::Value>,

    /// Forward-compatible preservation bucket for future top-level WOM fields.
    /// Unknown fields are captured here and serialized back instead of being destroyed.
    #[serde(flatten)]
    pub extensions: HashMap<String, serde_json::Value>,
}

fn default_schema_version() -> u32 {
    WOM_SCHEMA_VERSION
}

impl WorkspaceDocument {
    pub fn new(title: &str, kind: DocumentKind) -> Self {
        let now = Utc::now().timestamp_millis();
        Self {
            schema_version: WOM_SCHEMA_VERSION,
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            kind,
            created_at: now,
            modified_at: now,
            version: 1,
            theme_id: "vgt-default-dark".to_string(),
            security_policy: SecurityPolicyMetadata::default(),
            protection: ProtectionMetadata::default(),
            wom_extensions: HashMap::new(),
            root_object_ids: Vec::new(),
            objects: HashMap::new(),
            notebooks: None,
            note_data: None,
            pdf_data: None,
            present_data: None,
            grid_data: None,
            forms_data: None,
            database_data: None,
            work_data: None,
            work_management_data: None,
            vault_data: None,
            writer_data: None,
            whiteboard_data: None,
            extensions: HashMap::new(),
        }
    }

    /// Add an object to the document
    pub fn add_object(&mut self, object: WorkspaceObject) -> String {
        let id = object.id().to_string();
        self.objects.insert(id.clone(), object);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        id
    }

    /// Add a root object (primary display sequence)
    pub fn add_root_object(&mut self, object: WorkspaceObject) -> String {
        let id = self.add_object(object);
        self.root_object_ids.push(id.clone());
        id
    }

    /// Retrieve an object by ID
    pub fn get_object(&self, id: &str) -> Option<&WorkspaceObject> {
        self.objects.get(id)
    }

    /// Retrieve an object mutably by ID
    pub fn get_object_mut(&mut self, id: &str) -> Option<&mut WorkspaceObject> {
        self.modified_at = Utc::now().timestamp_millis();
        self.objects.get_mut(id)
    }

    /// Remove a canonical object without retaining its payload. New tombstones carry only
    /// deletion metadata and a detached author signature; legacy id-only tombstones remain readable.
    pub fn tombstone_object(
        &mut self,
        object_id: &str,
        deleted_at: i64,
        author_signature: &str,
    ) -> Result<(), WorkspaceIdentityError> {
        if deleted_at < 0 {
            return Err(WorkspaceIdentityError::InvalidTimestamp);
        }
        if !(32..=512).contains(&author_signature.len())
            || !author_signature
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        {
            return Err(WorkspaceIdentityError::InvalidAuthorSignature);
        }
        if !self.objects.contains_key(object_id) {
            return Err(WorkspaceIdentityError::MissingObject);
        }

        let mut entries = match self.wom_extensions.get(WOM_IDENTITY_EXTENSION) {
            None => Vec::new(),
            Some(value) => value
                .get("tombstones")
                .and_then(serde_json::Value::as_array)
                .cloned()
                .ok_or(WorkspaceIdentityError::InvalidTombstoneState)?,
        };
        if entries.len() >= MAX_TOMBSTONES {
            return Err(WorkspaceIdentityError::TombstoneLimitExceeded);
        }
        if entries.iter().any(|value| {
            value.as_str() == Some(object_id)
                || value.get("id").and_then(serde_json::Value::as_str) == Some(object_id)
        }) {
            return Err(WorkspaceIdentityError::InvalidTombstoneState);
        }

        entries.push(serde_json::json!({
            "id": object_id,
            "tombstone": true,
            "deleted_at": deleted_at,
            "author_signature": author_signature,
            "payload": serde_json::Value::Null,
        }));
        entries.sort_by(|left, right| {
            let left_id = left
                .as_str()
                .or_else(|| left.get("id").and_then(serde_json::Value::as_str))
                .unwrap_or("");
            let right_id = right
                .as_str()
                .or_else(|| right.get("id").and_then(serde_json::Value::as_str))
                .unwrap_or("");
            left_id.cmp(right_id)
        });

        self.objects.remove(object_id);
        self.root_object_ids.retain(|id| id != object_id);
        self.wom_extensions.insert(
            WOM_IDENTITY_EXTENSION.to_string(),
            serde_json::json!({ "tombstones": entries }),
        );
        self.modified_at = deleted_at;
        self.version += 1;
        Ok(())
    }

    pub fn identity_tombstones(
        &self,
    ) -> Result<Vec<WorkspaceIdentityTombstone>, WorkspaceIdentityError> {
        let Some(value) = self.wom_extensions.get(WOM_IDENTITY_EXTENSION) else {
            return Ok(Vec::new());
        };
        let entries = value
            .get("tombstones")
            .and_then(serde_json::Value::as_array)
            .ok_or(WorkspaceIdentityError::InvalidTombstoneState)?;
        if entries.len() > MAX_TOMBSTONES {
            return Err(WorkspaceIdentityError::TombstoneLimitExceeded);
        }
        let mut out = Vec::new();
        for value in entries {
            if value.is_string() {
                continue;
            }
            let record: WorkspaceIdentityTombstone = serde_json::from_value(value.clone())
                .map_err(|_| WorkspaceIdentityError::InvalidTombstoneState)?;
            if !record.tombstone
                || record.deleted_at < 0
                || !record.payload.is_null()
                || !(32..=512).contains(&record.author_signature.len())
                || !record
                    .author_signature
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
                || record.id.is_empty()
            {
                return Err(WorkspaceIdentityError::InvalidTombstoneState);
            }
            out.push(record);
        }
        Ok(out)
    }

    pub fn writer_model(&self) -> Result<Option<WriterDocumentModel>, WriterModelError> {
        self.writer_data
            .as_ref()
            .map(|payload| serde_json::from_value(payload.clone()).map_err(WriterModelError::from))
            .transpose()
    }

    pub fn set_writer_model(&mut self, model: WriterDocumentModel) -> Result<(), WriterModelError> {
        model.validate()?;
        self.writer_data = Some(serde_json::to_value(model)?);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        Ok(())
    }

    // GAP-0009, Runde 305: DIE ZWEITE VERDRAHTUNG, NACH DEM MUSTER VON WRITER.
    //
    // `WorkspaceDocument` trug `present_data` schon als Feld (`:205`), aber es
    // gab keinen typisierten Zugriff darauf: nur `writer_model` und
    // `set_writer_model` existierten, und `crates/vgt-ipc/src/server.rs`
    // importiert bis heute kein einziges App-Modell. Ein Feld, das nur als
    // `serde_json::Value` erreichbar ist, zwingt jeden Aufrufer, das Schema
    // selbst zu erraten — und genau das ist der Zustand, den GAP-0009
    // beschreibt.
    //
    // Die Form ist absichtlich Zug um Zug die von Writer: Getter liest und
    // deserialisiert, Setter validiert, serialisiert, setzt `modified_at` und
    // erhoeht `version`. Ein Setter, der `version` nicht erhoeht, wuerde die
    // Synchronisation um eine Aenderung betruegen.

    pub fn present_model(&self) -> Result<Option<PresentDocumentModel>, PresentModelError> {
        self.present_data
            .as_ref()
            .map(|payload| serde_json::from_value(payload.clone()).map_err(PresentModelError::from))
            .transpose()
    }

    pub fn set_present_model(
        &mut self,
        model: PresentDocumentModel,
    ) -> Result<(), PresentModelError> {
        model.validate()?;
        self.present_data = Some(serde_json::to_value(model)?);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        Ok(())
    }

    // GAP-0009, Runde 307: DIE DRITTE VERDRAHTUNG — VAULT, NACH DEMSELBEN MUSTER.
    //
    // `vault_data` lag als Feld im Dokument (`:227`, `rename = "vaultData"`) und
    // war nur als undurchsichtiges `serde_json::Value` erreichbar. Der Vault ist
    // die sicherheitsrelevante Anwendung dieser Edition, und ein Bestand, dessen
    // Zugriff nur ueber rohes JSON geht, zwingt jeden Aufrufer, die
    // Identitaetsregeln selbst zu erraten — genau der Zustand aus GAP-0009.

    pub fn vault_model(&self) -> Result<Option<VaultManifestModel>, VaultModelError> {
        self.vault_data
            .as_ref()
            .map(|payload| serde_json::from_value(payload.clone()).map_err(VaultModelError::from))
            .transpose()
    }

    pub fn set_vault_model(&mut self, model: VaultManifestModel) -> Result<(), VaultModelError> {
        model.validate()?;
        self.vault_data = Some(serde_json::to_value(model)?);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        Ok(())
    }

    // GAP-0009, Runde 308: PDF UND NOTES, DASSELBE MUSTER, ZWEIMAL.

    pub fn pdf_model(&self) -> Result<Option<PdfDocumentModel>, PdfModelError> {
        self.pdf_data
            .as_ref()
            .map(|payload| serde_json::from_value(payload.clone()).map_err(PdfModelError::from))
            .transpose()
    }

    pub fn set_pdf_model(&mut self, model: PdfDocumentModel) -> Result<(), PdfModelError> {
        model.validate()?;
        self.pdf_data = Some(serde_json::to_value(model)?);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        Ok(())
    }

    /// Das Notizbuch-Verzeichnis aus dem Feld `notebooks`.
    ///
    /// WARUM DER NAME ANDERS IST ALS DAS FELD: das Feld heisst `notebooks`
    /// (`:195`) und traegt eine Liste. Der Typ, der die Liste prueft, heisst
    /// `NoteLibraryModel` — "Bibliothek" fuer die Gesamtheit, "Notizbuch" fuer
    /// das einzelne. Zwei Dinge denselben Namen geben zu lassen waere genau die
    /// Verwechslung, die in dieser Sitzung schon viermal zu einem Fehlschluss
    /// gefuehrt hat.
    pub fn note_library(&self) -> Result<Option<NoteLibraryModel>, NoteModelError> {
        self.notebooks
            .as_ref()
            .map(|payload| serde_json::from_value(payload.clone()).map_err(NoteModelError::from))
            .transpose()
    }

    pub fn set_note_library(&mut self, model: NoteLibraryModel) -> Result<(), NoteModelError> {
        model.validate()?;
        self.notebooks = Some(serde_json::to_value(model)?);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        Ok(())
    }

    // GAP-0009, Runde 309: TASKS.
    //
    // HIER GIBT ES ZWEI FELDER FUER DIESELBE FORM, UND DAS IST GEMESSEN:
    // `work_management_data` (`:226`, `rename = "workManagementData"`) und
    // `work_data` (`:220`, `rename = "workData"`). Die Anwendung liest BEIDE,
    // mit dem neueren Namen zuerst:
    //   `ui/src/apps/notes/notebooks/useNotesManager.ts:130`
    //       const existingWork = document.workManagementData ?? document.workData;
    //   `ui/src/apps/notes/integrations/notesWorkspaceActions.ts:93`
    //       targetDoc.workManagementData ?? { tasks: [], cards: [], milestones: [] }
    //
    // DER GETTER LIEST DARUM WIE DIE ANWENDUNG: zuerst den kanonischen Namen,
    // dann den aelteren. TAETE ER DAS NICHT, saehe Rust ein leeres Dokument,
    // wo die Oberflaeche Aufgaben zeigt — und ein Modell, das etwas anderes
    // liest als die Anwendung, ist schlimmer als keines.
    //
    // DER SETTER SCHREIBT NUR DEN KANONISCHEN NAMEN. Den Migrationszustand
    // fortzuschreiben, indem er beide Felder fuellt, waere keine Verdrahtung,
    // sondern eine Verfestigung. `useNotesManager.ts:145` zeigt, dass die
    // Anwendung das tut, solange `work_data` schon da war — das ist IHRE
    // Migrationsentscheidung und nicht die des Containers.

    pub fn work_management_model(&self) -> Result<Option<WorkManagementModel>, WorkModelError> {
        let payload = self.work_management_data.as_ref().or(self.work_data.as_ref());
        payload
            .map(|value| serde_json::from_value(value.clone()).map_err(WorkModelError::from))
            .transpose()
    }

    pub fn set_work_management_model(
        &mut self,
        model: WorkManagementModel,
    ) -> Result<(), WorkModelError> {
        model.validate()?;
        self.work_management_data = Some(serde_json::to_value(model)?);
        self.modified_at = Utc::now().timestamp_millis();
        self.version += 1;
        Ok(())
    }
}
