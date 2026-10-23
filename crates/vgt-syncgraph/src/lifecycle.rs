// STATUS: DIAMANT VGT SUPREME
//! Ephemeral presence, durable membership/revocation and tombstone lifecycle.

use crate::{AuthenticatedPeerContext, SyncError, SyncNode, VectorClock};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vgt_operations::WorkspaceOperation;

pub const MAX_PRESENCE_SESSIONS: usize = 512;
pub const MAX_MEMBERS: usize = 4_096;
pub const MAX_DEVICES_PER_MEMBER: usize = 64;
pub const MAX_TOMBSTONES: usize = 65_536;
pub const DEFAULT_PRESENCE_TTL_MS: i64 = 45_000;

/// Presence is explicitly ephemeral and is never inserted into the durable SyncGraph DAG.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PresenceRecord {
    pub actor_id: String,
    pub session_id: String,
    pub document_id: String,
    pub display_name: String,
    pub selection_anchor: Option<String>,
    pub updated_at_ms: i64,
    pub expires_at_ms: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct PresenceRegistry {
    sessions: BTreeMap<String, PresenceRecord>,
}

impl PresenceRegistry {
    pub fn upsert(&mut self, mut record: PresenceRecord, now_ms: i64) -> Result<(), SyncError> {
        if record.session_id.is_empty()
            || record.session_id.len() > 256
            || record.actor_id.is_empty()
            || record.actor_id.len() > 256
            || record.document_id.is_empty()
            || record.document_id.len() > 256
            || record.display_name.len() > 512
            || record.selection_anchor.as_ref().is_some_and(|value| value.len() > 2_048)
        {
            return Err(SyncError::ResourceBoundary);
        }
        if !self.sessions.contains_key(&record.session_id) && self.sessions.len() >= MAX_PRESENCE_SESSIONS {
            return Err(SyncError::ResourceBoundary);
        }
        record.updated_at_ms = now_ms;
        record.expires_at_ms = now_ms.saturating_add(DEFAULT_PRESENCE_TTL_MS);
        self.sessions.insert(record.session_id.clone(), record);
        Ok(())
    }

    pub fn active_for_document(&mut self, document_id: &str, now_ms: i64) -> Vec<PresenceRecord> {
        self.sweep(now_ms);
        self.sessions
            .values()
            .filter(|value| value.document_id == document_id)
            .cloned()
            .collect()
    }

    pub fn remove(&mut self, session_id: &str) -> bool { self.sessions.remove(session_id).is_some() }

    pub fn sweep(&mut self, now_ms: i64) {
        self.sessions.retain(|_, value| value.expires_at_ms > now_ms);
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MemberRole { Owner, Editor, Commenter, Viewer }

impl MemberRole {
    pub fn can_write(self) -> bool { matches!(self, Self::Owner | Self::Editor) }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceRecord {
    pub device_id: String,
    pub key_id: String,
    pub revoked: bool,
    pub revoked_at_epoch: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemberRecord {
    pub member_id: String,
    pub role: MemberRole,
    pub active: bool,
    pub devices: BTreeMap<String, DeviceRecord>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MembershipState {
    pub epoch: u64,
    pub members: BTreeMap<String, MemberRecord>,
}

impl MembershipState {
    fn bump_epoch(&mut self) -> Result<u64, SyncError> {
        self.epoch = self.epoch.checked_add(1).ok_or(SyncError::ResourceBoundary)?;
        Ok(self.epoch)
    }

    pub fn add_member(&mut self, member_id: &str, role: MemberRole) -> Result<u64, SyncError> {
        if member_id.is_empty() || member_id.len() > 256 || (!self.members.contains_key(member_id) && self.members.len() >= MAX_MEMBERS) {
            return Err(SyncError::ResourceBoundary);
        }
        let epoch = self.bump_epoch()?;
        self.members.entry(member_id.to_string()).and_modify(|member| {
            member.active = true;
            member.role = role;
        }).or_insert(MemberRecord {
            member_id: member_id.to_string(), role, active: true, devices: BTreeMap::new(),
        });
        Ok(epoch)
    }

    pub fn add_device(&mut self, member_id: &str, device_id: &str, key_id: &str) -> Result<u64, SyncError> {
        if device_id.is_empty() || device_id.len() > 256 || key_id.is_empty() || key_id.len() > 512 {
            return Err(SyncError::ResourceBoundary);
        }
        let member = self.members.get(member_id).ok_or(SyncError::MembershipRejected)?;
        if !member.active || (!member.devices.contains_key(device_id) && member.devices.len() >= MAX_DEVICES_PER_MEMBER) {
            return Err(SyncError::MembershipRejected);
        }
        let epoch = self.bump_epoch()?;
        let member = self.members.get_mut(member_id).ok_or(SyncError::MembershipRejected)?;
        member.devices.insert(device_id.to_string(), DeviceRecord {
            device_id: device_id.to_string(), key_id: key_id.to_string(), revoked: false, revoked_at_epoch: None,
        });
        Ok(epoch)
    }

    pub fn revoke_device(&mut self, member_id: &str, device_id: &str) -> Result<u64, SyncError> {
        if self.members.get(member_id).and_then(|member| member.devices.get(device_id)).is_none() {
            return Err(SyncError::MembershipRejected);
        }
        let epoch = self.bump_epoch()?;
        let device = self.members.get_mut(member_id)
            .and_then(|member| member.devices.get_mut(device_id))
            .ok_or(SyncError::MembershipRejected)?;
        device.revoked = true;
        device.revoked_at_epoch = Some(epoch);
        Ok(epoch)
    }

    pub fn remove_member(&mut self, member_id: &str) -> Result<u64, SyncError> {
        if !self.members.contains_key(member_id) { return Err(SyncError::MembershipRejected); }
        let epoch = self.bump_epoch()?;
        let member = self.members.get_mut(member_id).ok_or(SyncError::MembershipRejected)?;
        member.active = false;
        for device in member.devices.values_mut() {
            device.revoked = true;
            device.revoked_at_epoch = Some(epoch);
        }
        Ok(epoch)
    }

    pub fn authorize_peer(&self, peer: &AuthenticatedPeerContext, require_write: bool) -> Result<(), SyncError> {
        if !peer.authenticated || peer.membership_epoch != self.epoch { return Err(SyncError::MembershipRejected); }
        let member = self.members.get(&peer.member_id).filter(|value| value.active).ok_or(SyncError::MembershipRejected)?;
        if require_write && !member.role.can_write() { return Err(SyncError::MembershipRejected); }
        let device = member.devices.get(&peer.device_id).filter(|value| !value.revoked).ok_or(SyncError::MembershipRejected)?;
        if device.key_id.is_empty() || peer.key_id != device.key_id { return Err(SyncError::MembershipRejected); }
        Ok(())
    }

    pub fn authorize_owner(&self, peer: &AuthenticatedPeerContext) -> Result<(), SyncError> {
        self.authorize_peer(peer, true)?;
        let member = self.members.get(&peer.member_id).ok_or(SyncError::MembershipRejected)?;
        if member.role != MemberRole::Owner { return Err(SyncError::MembershipRejected); }
        Ok(())
    }

    /// Initial local bootstrap may enroll exactly one owner's first device before a device-bound
    /// authorizer exists. Every later membership mutation requires an authenticated owner device.
    pub fn permits_first_owner_device_bootstrap(&self, member_id: &str) -> bool {
        if self.members.len() != 1 { return false; }
        self.members.get(member_id).is_some_and(|member| {
            member.active && member.role == MemberRole::Owner && member.devices.is_empty()
        })
    }

    pub fn validate(&self) -> Result<(), SyncError> {
        if self.members.len() > MAX_MEMBERS { return Err(SyncError::ResourceBoundary); }
        for (member_id, member) in &self.members {
            if member_id.is_empty() || member_id.len() > 256 || member.member_id != *member_id
                || member.devices.len() > MAX_DEVICES_PER_MEMBER
            { return Err(SyncError::ResourceBoundary); }
            for (device_id, device) in &member.devices {
                if device_id.is_empty() || device_id.len() > 256 || device.device_id != *device_id
                    || device.key_id.is_empty() || device.key_id.len() > 512
                { return Err(SyncError::ResourceBoundary); }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tombstone {
    pub logical_id: String,
    pub operation_id: String,
    pub actor_id: String,
    pub lamport_time: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TombstoneRegistry {
    entries: BTreeMap<String, Tombstone>,
}

impl TombstoneRegistry {
    pub fn observe_node(&mut self, node: &SyncNode) -> Result<(), SyncError> {
        let logical_id = match &node.operation {
            WorkspaceOperation::RemoveObject { object_id, .. } => Some(format!("object:{object_id}")),
            WorkspaceOperation::DeleteParagraph { paragraph_id, .. } => Some(format!("paragraph:{paragraph_id}")),
            WorkspaceOperation::DeletePresentSlide { slide_id, .. } => Some(format!("slide:{slide_id}")),
            _ => None,
        };
        let Some(logical_id) = logical_id else { return Ok(()); };
        if !self.entries.contains_key(&logical_id) && self.entries.len() >= MAX_TOMBSTONES {
            return Err(SyncError::ResourceBoundary);
        }
        self.entries.insert(logical_id.clone(), Tombstone {
            logical_id, operation_id: node.op_id.clone(), actor_id: node.actor_id.clone(), lamport_time: node.lamport_time,
        });
        Ok(())
    }

    /// GC is allowed only after the acknowledged causal frontier includes the delete operation.
    pub fn garbage_collect(&mut self, acknowledged: &VectorClock) -> usize {
        let before = self.entries.len();
        self.entries.retain(|_, tombstone| acknowledged.get(&tombstone.actor_id) < tombstone.lamport_time);
        before.saturating_sub(self.entries.len())
    }

    pub fn len(&self) -> usize { self.entries.len() }
    pub fn is_empty(&self) -> bool { self.entries.is_empty() }
}
