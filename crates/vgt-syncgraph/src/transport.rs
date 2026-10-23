// STATUS: DIAMANT VGT SUPREME
//! Transport-neutral encrypted envelopes, bounded offline queues and backpressure.
//!
//! `seal_transport_payload` / `open_transport_payload` accept a 32-byte session key supplied by
//! the authenticated transport adapter (GaiaCom/LAN/self-hosted). SyncGraph never assumes a relay
//! can read document plaintext and never derives a cross-device session key from a local WMK.

use crate::{MembershipState, SyncError, SyncNode, VectorClock, SYNC_SCHEMA_VERSION};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeSet, VecDeque};
use vgt_crypto::{decrypt_aes_gcm, encrypt_aes_gcm, hash_blake3, KEY_SIZE, NONCE_SIZE};

pub const MAX_QUEUE_ENTRIES: usize = 8_192;
pub const MAX_QUEUE_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_TRANSPORT_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_IN_FLIGHT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_RETRY_ATTEMPTS: u8 = 12;
pub const BASE_RETRY_MS: u64 = 250;
pub const MAX_RETRY_MS: u64 = 60_000;
pub const SYNC_ENVELOPE_VERSION: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncEnvelopeContext {
    pub document_id: String,
    pub session_id: String,
    pub membership_epoch: u64,
    pub sender_device_id: String,
}

impl SyncEnvelopeContext {
    fn aad(&self) -> Result<Vec<u8>, SyncError> {
        if self.document_id.is_empty() || self.document_id.len() > 256
            || self.session_id.is_empty() || self.session_id.len() > 256
            || self.sender_device_id.is_empty() || self.sender_device_id.len() > 256
        {
            return Err(SyncError::ResourceBoundary);
        }
        serde_json::to_vec(&(SYNC_ENVELOPE_VERSION, self)).map_err(|_| SyncError::EnvelopeAuthentication)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SealedSyncEnvelope {
    pub version: u16,
    pub context: SyncEnvelopeContext,
    pub nonce: [u8; NONCE_SIZE],
    pub ciphertext: Vec<u8>,
    pub ciphertext_digest: [u8; 32],
}

pub fn seal_transport_payload(
    payload: &[u8],
    key: &[u8; KEY_SIZE],
    context: SyncEnvelopeContext,
) -> Result<SealedSyncEnvelope, SyncError> {
    if payload.is_empty() || payload.len() > MAX_TRANSPORT_PAYLOAD_BYTES { return Err(SyncError::ResourceBoundary); }
    let aad = context.aad()?;
    let (ciphertext, nonce) = encrypt_aes_gcm(payload, key, &aad).map_err(|_| SyncError::EnvelopeAuthentication)?;
    let ciphertext_digest = hash_blake3(&ciphertext);
    Ok(SealedSyncEnvelope { version: SYNC_ENVELOPE_VERSION, context, nonce, ciphertext, ciphertext_digest })
}

pub fn open_transport_payload(envelope: &SealedSyncEnvelope, key: &[u8; KEY_SIZE]) -> Result<Vec<u8>, SyncError> {
    if envelope.version != SYNC_ENVELOPE_VERSION
        || envelope.ciphertext.is_empty()
        || envelope.ciphertext.len() > MAX_TRANSPORT_PAYLOAD_BYTES + 32
        || hash_blake3(&envelope.ciphertext) != envelope.ciphertext_digest
    {
        return Err(SyncError::EnvelopeAuthentication);
    }
    let aad = envelope.context.aad()?;
    decrypt_aes_gcm(&envelope.ciphertext, &envelope.nonce, key, &aad).map_err(|_| SyncError::EnvelopeAuthentication)
}


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QuarantinedFutureOperation {
    pub document_id: String,
    pub op_id: String,
    pub schema_version: u16,
    pub received_at_ms: u64,
    pub raw: Value,
    pub encoded_bytes: usize,
}

impl QuarantinedFutureOperation {
    pub fn new(document_id: String, op_id: String, schema_version: u16, received_at_ms: u64, raw: Value) -> Result<Self, SyncError> {
        if document_id.trim().is_empty() || document_id.len() > 256
            || op_id.trim().is_empty() || op_id.len() > 256
            || schema_version <= SYNC_SCHEMA_VERSION
        {
            return Err(SyncError::ResourceBoundary);
        }
        let encoded_bytes = serde_json::to_vec(&raw).map_err(|_| SyncError::ResourceBoundary)?.len();
        if encoded_bytes == 0 || encoded_bytes > MAX_TRANSPORT_PAYLOAD_BYTES { return Err(SyncError::ResourceBoundary); }
        Ok(Self { document_id, op_id, schema_version, received_at_ms, raw, encoded_bytes })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QueuedSyncOperation {
    pub node: SyncNode,
    pub attempt: u8,
    pub next_retry_at_ms: u64,
    pub encoded_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OfflineQueueState {
    /// Durable local collaboration control-plane state. It is sealed together with the queue so
    /// membership and revocation survive restarts without exposing identities in plaintext.
    #[serde(default)]
    pub membership: MembershipState,
    pub frontier: VectorClock,
    pub outbound: VecDeque<QueuedSyncOperation>,
    pub inbound_causal: VecDeque<SyncNode>,
    #[serde(default)]
    pub future_quarantine: VecDeque<QuarantinedFutureOperation>,
    pub quarantined_ids: BTreeSet<String>,
    pub total_bytes: usize,
}

impl Default for OfflineQueueState {
    fn default() -> Self {
        Self { membership: MembershipState::default(), frontier: VectorClock::new(), outbound: VecDeque::new(), inbound_causal: VecDeque::new(), future_quarantine: VecDeque::new(), quarantined_ids: BTreeSet::new(), total_bytes: 0 }
    }
}

impl OfflineQueueState {
    pub fn enqueue(&mut self, node: SyncNode, now_ms: u64) -> Result<(), SyncError> {
        if self.outbound.iter().any(|entry| entry.node.op_id == node.op_id) { return Ok(()); }
        let encoded_bytes = serde_json::to_vec(&node).map_err(|_| SyncError::ResourceBoundary)?.len();
        if encoded_bytes > MAX_TRANSPORT_PAYLOAD_BYTES
            || self.outbound.len() >= MAX_QUEUE_ENTRIES
            || self.total_bytes.saturating_add(encoded_bytes) > MAX_QUEUE_BYTES
        {
            return Err(SyncError::ResourceBoundary);
        }
        self.total_bytes += encoded_bytes;
        self.outbound.push_back(QueuedSyncOperation { node, attempt: 0, next_retry_at_ms: now_ms, encoded_bytes });
        Ok(())
    }

    pub fn replace_inbound_causal(&mut self, nodes: &[SyncNode]) -> Result<(), SyncError> {
        if nodes.len() > MAX_QUEUE_ENTRIES { return Err(SyncError::ResourceBoundary); }
        let outbound_bytes: usize = self.outbound.iter().map(|entry| entry.encoded_bytes).sum();
        let future_bytes: usize = self.future_quarantine.iter().map(|entry| entry.encoded_bytes).sum();
        let mut inbound = VecDeque::with_capacity(nodes.len());
        let mut inbound_bytes = 0usize;
        for node in nodes {
            let encoded = serde_json::to_vec(node).map_err(|_| SyncError::ResourceBoundary)?.len();
            inbound_bytes = inbound_bytes.checked_add(encoded).ok_or(SyncError::ResourceBoundary)?;
            if outbound_bytes.saturating_add(future_bytes).saturating_add(inbound_bytes) > MAX_QUEUE_BYTES { return Err(SyncError::ResourceBoundary); }
            inbound.push_back(node.clone());
        }
        self.inbound_causal = inbound;
        self.total_bytes = outbound_bytes.saturating_add(future_bytes).saturating_add(inbound_bytes);
        Ok(())
    }

    pub fn quarantine_future(&mut self, entry: QuarantinedFutureOperation) -> Result<(), SyncError> {
        if self.future_quarantine.iter().any(|candidate| candidate.op_id == entry.op_id) { return Ok(()); }
        if self.future_quarantine.len() >= 1_024
            || self.total_bytes.saturating_add(entry.encoded_bytes) > MAX_QUEUE_BYTES
        {
            return Err(SyncError::ResourceBoundary);
        }
        self.total_bytes = self.total_bytes.saturating_add(entry.encoded_bytes);
        self.future_quarantine.push_back(entry);
        Ok(())
    }

    pub fn next_ready(&self, now_ms: u64, max_items: usize) -> Vec<SyncNode> {
        self.outbound.iter()
            .filter(|entry| entry.next_retry_at_ms <= now_ms && !self.quarantined_ids.contains(&entry.node.op_id))
            .take(max_items.min(256))
            .map(|entry| entry.node.clone())
            .collect()
    }

    pub fn mark_retry(&mut self, op_id: &str, now_ms: u64) -> Result<u64, SyncError> {
        let entry = self.outbound.iter_mut().find(|entry| entry.node.op_id == op_id).ok_or(SyncError::MissingParent(op_id.to_string()))?;
        if entry.attempt >= MAX_RETRY_ATTEMPTS {
            self.quarantined_ids.insert(op_id.to_string());
            return Ok(entry.next_retry_at_ms);
        }
        entry.attempt = entry.attempt.saturating_add(1);
        let shift = u32::from(entry.attempt.min(8));
        let delay = BASE_RETRY_MS.saturating_mul(1_u64 << shift).min(MAX_RETRY_MS);
        entry.next_retry_at_ms = now_ms.saturating_add(delay);
        Ok(entry.next_retry_at_ms)
    }

    pub fn acknowledge(&mut self, frontier: &VectorClock) {
        self.frontier.merge(frontier);
        let mut removed_bytes = 0usize;
        self.outbound.retain(|entry| {
            let keep = frontier.get(&entry.node.actor_id) < entry.node.lamport_time;
            if !keep { removed_bytes = removed_bytes.saturating_add(entry.encoded_bytes); }
            keep
        });
        let inbound_bytes: usize = self.inbound_causal.iter().filter_map(|node| serde_json::to_vec(node).ok().map(|bytes| bytes.len())).sum();
        let future_bytes: usize = self.future_quarantine.iter().map(|entry| entry.encoded_bytes).sum();
        self.total_bytes = self.outbound.iter().map(|entry| entry.encoded_bytes).sum::<usize>().saturating_add(inbound_bytes).saturating_add(future_bytes);
        let _ = removed_bytes;
        self.quarantined_ids.retain(|op_id| self.outbound.iter().any(|entry| &entry.node.op_id == op_id));
    }

    pub fn seal_for_storage(&self, key: &[u8; KEY_SIZE], context: SyncEnvelopeContext) -> Result<SealedSyncEnvelope, SyncError> {
        let bytes = serde_json::to_vec(self).map_err(|_| SyncError::EnvelopeAuthentication)?;
        if bytes.len() > MAX_QUEUE_BYTES { return Err(SyncError::ResourceBoundary); }
        // Queue storage may be larger than one wire payload; use a dedicated bounded envelope path.
        let aad = context.aad()?;
        let (ciphertext, nonce) = encrypt_aes_gcm(&bytes, key, &aad).map_err(|_| SyncError::EnvelopeAuthentication)?;
        Ok(SealedSyncEnvelope {
            version: SYNC_ENVELOPE_VERSION,
            context,
            ciphertext_digest: hash_blake3(&ciphertext),
            nonce,
            ciphertext,
        })
    }

    pub fn restore_from_storage(envelope: &SealedSyncEnvelope, key: &[u8; KEY_SIZE]) -> Result<Self, SyncError> {
        if envelope.version != SYNC_ENVELOPE_VERSION || hash_blake3(&envelope.ciphertext) != envelope.ciphertext_digest {
            return Err(SyncError::EnvelopeAuthentication);
        }
        let aad = envelope.context.aad()?;
        let plaintext = decrypt_aes_gcm(&envelope.ciphertext, &envelope.nonce, key, &aad).map_err(|_| SyncError::EnvelopeAuthentication)?;
        if plaintext.len() > MAX_QUEUE_BYTES { return Err(SyncError::ResourceBoundary); }
        let restored: Self = serde_json::from_slice(&plaintext).map_err(|_| SyncError::EnvelopeAuthentication)?;
        restored.membership.validate()?;
        if restored.outbound.len() > MAX_QUEUE_ENTRIES || restored.inbound_causal.len() > MAX_QUEUE_ENTRIES || restored.future_quarantine.len() > 1_024 || restored.total_bytes > MAX_QUEUE_BYTES { return Err(SyncError::ResourceBoundary); }
        let outbound_measured = restored.outbound.iter().try_fold(0usize, |sum, entry| sum.checked_add(entry.encoded_bytes)).ok_or(SyncError::ResourceBoundary)?;
        let inbound_measured = restored.inbound_causal.iter().try_fold(0usize, |sum, node| {
            let size = serde_json::to_vec(node).map_err(|_| SyncError::EnvelopeAuthentication)?.len();
            sum.checked_add(size).ok_or(SyncError::ResourceBoundary)
        })?;
        let future_measured = restored.future_quarantine.iter().try_fold(0usize, |sum, entry| {
            if entry.schema_version <= SYNC_SCHEMA_VERSION || entry.document_id.is_empty() || entry.op_id.is_empty() { return Err(SyncError::EnvelopeAuthentication); }
            let size = serde_json::to_vec(&entry.raw).map_err(|_| SyncError::EnvelopeAuthentication)?.len();
            if size != entry.encoded_bytes { return Err(SyncError::EnvelopeAuthentication); }
            sum.checked_add(size).ok_or(SyncError::ResourceBoundary)
        })?;
        if outbound_measured.saturating_add(inbound_measured).saturating_add(future_measured) != restored.total_bytes { return Err(SyncError::EnvelopeAuthentication); }
        Ok(restored)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackpressureDecision { Accept, SlowDown, Pause }

pub fn backpressure_decision(queue_entries: usize, queue_bytes: usize, in_flight_bytes: usize) -> BackpressureDecision {
    if queue_entries >= MAX_QUEUE_ENTRIES || queue_bytes >= MAX_QUEUE_BYTES || in_flight_bytes >= MAX_IN_FLIGHT_BYTES {
        BackpressureDecision::Pause
    } else if queue_entries >= MAX_QUEUE_ENTRIES * 3 / 4
        || queue_bytes >= MAX_QUEUE_BYTES * 3 / 4
        || in_flight_bytes >= MAX_IN_FLIGHT_BYTES * 3 / 4
    {
        BackpressureDecision::SlowDown
    } else {
        BackpressureDecision::Accept
    }
}
