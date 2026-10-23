// STATUS: PLATIN — bounded, token-scoped encrypted Search transfer staging.

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub const MAX_SEARCH_TRANSFER_BYTES: usize = 96 * 1024 * 1024;
pub const SEARCH_TRANSFER_CHUNK_BYTES: usize = (128 * 1024 / 3) * 3;
pub const MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES: usize =
    SEARCH_TRANSFER_CHUNK_BYTES.div_ceil(3) * 4;
pub const MAX_SEARCH_TRANSFER_REQUEST_BYTES: usize = MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES + 1024;
const MAX_ACTIVE_SEARCH_TRANSFERS: usize = 8;
const MAX_STAGED_SEARCH_TRANSFER_BYTES: usize = 128 * 1024 * 1024;
const SEARCH_TRANSFER_TTL: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchTransferError {
    Invalid,
    TooLarge,
    Busy,
    NotFound,
    WrongDirection,
    InvalidSequence,
    StaleGeneration,
    Incomplete,
    DigestMismatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Direction {
    Import,
    Export,
}

struct Transfer {
    direction: Direction,
    workspace_scope: String,
    data: Vec<u8>,
    expected_bytes: usize,
    expected_digest: [u8; 32],
    expected_generation: u64,
    next_chunk_index: usize,
    created_at: Instant,
}

#[derive(Default)]
pub struct SearchTransferStore {
    transfers: HashMap<(String, String), Transfer>,
    reserved_bytes: usize,
}

impl SearchTransferStore {
    pub fn begin_import(
        &mut self,
        session_token: &str,
        transfer_id: &str,
        workspace_scope: String,
        expected_bytes: usize,
        expected_digest_hex: &str,
        expected_generation: u64,
    ) -> Result<(), SearchTransferError> {
        self.purge_expired();
        let key = transfer_key(session_token, transfer_id)?;
        let digest = parse_sha256(expected_digest_hex)?;
        self.reserve(session_token, expected_bytes)?;
        self.transfers.insert(
            key,
            Transfer {
                direction: Direction::Import,
                workspace_scope,
                data: Vec::new(),
                expected_bytes,
                expected_digest: digest,
                expected_generation,
                next_chunk_index: 0,
                created_at: Instant::now(),
            },
        );
        Ok(())
    }

    pub fn append_import_chunk(
        &mut self,
        session_token: &str,
        transfer_id: &str,
        chunk_index: usize,
        chunk: &[u8],
    ) -> Result<usize, SearchTransferError> {
        self.purge_expired();
        let key = transfer_key(session_token, transfer_id)?;
        let Some(transfer) = self.transfers.get_mut(&key) else {
            return Err(SearchTransferError::NotFound);
        };
        if transfer.direction != Direction::Import {
            self.remove(&key);
            return Err(SearchTransferError::WrongDirection);
        }

        let remaining = transfer.expected_bytes.saturating_sub(transfer.data.len());
        let expected_chunk_bytes = remaining.min(SEARCH_TRANSFER_CHUNK_BYTES);
        if chunk_index != transfer.next_chunk_index
            || chunk.is_empty()
            || chunk.len() != expected_chunk_bytes
            || transfer.data.len().saturating_add(chunk.len()) > transfer.expected_bytes
        {
            self.remove(&key);
            return Err(SearchTransferError::InvalidSequence);
        }

        transfer.data.extend_from_slice(chunk);
        transfer.next_chunk_index = transfer.next_chunk_index.saturating_add(1);
        Ok(transfer.data.len())
    }

    pub fn finish_import(
        &mut self,
        session_token: &str,
        transfer_id: &str,
    ) -> Result<(String, Vec<u8>, u64), SearchTransferError> {
        self.purge_expired();
        let key = transfer_key(session_token, transfer_id)?;
        let transfer = self.remove(&key).ok_or(SearchTransferError::NotFound)?;
        if transfer.direction != Direction::Import {
            return Err(SearchTransferError::WrongDirection);
        }
        if transfer.data.len() != transfer.expected_bytes {
            return Err(SearchTransferError::Incomplete);
        }
        if !digest_matches(&transfer.data, &transfer.expected_digest) {
            return Err(SearchTransferError::DigestMismatch);
        }
        Ok((
            transfer.workspace_scope,
            transfer.data,
            transfer.expected_generation,
        ))
    }

    pub fn begin_export(
        &mut self,
        session_token: &str,
        transfer_id: &str,
        workspace_scope: String,
        data: Vec<u8>,
        generation: u64,
    ) -> Result<String, SearchTransferError> {
        self.purge_expired();
        let key = transfer_key(session_token, transfer_id)?;
        if data.is_empty() {
            return Err(SearchTransferError::Invalid);
        }
        let expected_bytes = data.len();
        let digest = Sha256::digest(&data);
        self.reserve(session_token, expected_bytes)?;
        self.transfers.insert(
            key,
            Transfer {
                direction: Direction::Export,
                workspace_scope,
                data,
                expected_bytes,
                expected_digest: digest.into(),
                expected_generation: generation,
                next_chunk_index: 0,
                created_at: Instant::now(),
            },
        );
        Ok(hex_encode(&digest))
    }

    pub fn next_export_chunk(
        &mut self,
        session_token: &str,
        transfer_id: &str,
        chunk_index: usize,
        current_generation: u64,
    ) -> Result<(Vec<u8>, usize), SearchTransferError> {
        self.purge_expired();
        let key = transfer_key(session_token, transfer_id)?;
        let Some(transfer) = self.transfers.get_mut(&key) else {
            return Err(SearchTransferError::NotFound);
        };
        if transfer.direction != Direction::Export {
            self.remove(&key);
            return Err(SearchTransferError::WrongDirection);
        }
        if transfer.expected_generation != current_generation {
            self.remove(&key);
            return Err(SearchTransferError::StaleGeneration);
        }
        if chunk_index != transfer.next_chunk_index {
            self.remove(&key);
            return Err(SearchTransferError::InvalidSequence);
        }

        let start = chunk_index
            .checked_mul(SEARCH_TRANSFER_CHUNK_BYTES)
            .ok_or(SearchTransferError::InvalidSequence)?;
        let end = start
            .saturating_add(SEARCH_TRANSFER_CHUNK_BYTES)
            .min(transfer.expected_bytes);
        if start >= end || end > transfer.data.len() {
            self.remove(&key);
            return Err(SearchTransferError::InvalidSequence);
        }
        let chunk = transfer.data[start..end].to_vec();
        let total_chunks = transfer
            .expected_bytes
            .div_ceil(SEARCH_TRANSFER_CHUNK_BYTES);
        transfer.next_chunk_index = transfer.next_chunk_index.saturating_add(1);
        if transfer.next_chunk_index == total_chunks {
            self.remove(&key);
        }
        Ok((chunk, total_chunks))
    }

    pub fn abort(&mut self, session_token: &str, transfer_id: &str) -> bool {
        self.purge_expired();
        let Ok(key) = transfer_key(session_token, transfer_id) else {
            return false;
        };
        self.remove(&key).is_some()
    }

    #[cfg(test)]
    pub fn staged_bytes(&mut self) -> usize {
        self.purge_expired();
        self.reserved_bytes
    }

    pub fn expire_stale(&mut self) {
        self.purge_expired();
    }

    #[cfg(test)]
    pub fn active_count(&mut self) -> usize {
        self.purge_expired();
        self.transfers.len()
    }

    fn reserve(
        &mut self,
        session_token: &str,
        expected_bytes: usize,
    ) -> Result<(), SearchTransferError> {
        if expected_bytes == 0 {
            return Err(SearchTransferError::Invalid);
        }
        if expected_bytes > MAX_SEARCH_TRANSFER_BYTES {
            return Err(SearchTransferError::TooLarge);
        }
        if self
            .transfers
            .keys()
            .any(|(owner, _)| owner == session_token)
        {
            return Err(SearchTransferError::Busy);
        }
        if self.transfers.len() >= MAX_ACTIVE_SEARCH_TRANSFERS
            || self.reserved_bytes.saturating_add(expected_bytes) > MAX_STAGED_SEARCH_TRANSFER_BYTES
        {
            return Err(SearchTransferError::Busy);
        }
        self.reserved_bytes = self.reserved_bytes.saturating_add(expected_bytes);
        Ok(())
    }

    fn purge_expired(&mut self) {
        self.transfers
            .retain(|_, transfer| transfer.created_at.elapsed() < SEARCH_TRANSFER_TTL);
        self.reserved_bytes = self
            .transfers
            .values()
            .map(|transfer| transfer.expected_bytes)
            .sum();
    }

    fn remove(&mut self, key: &(String, String)) -> Option<Transfer> {
        let transfer = self.transfers.remove(key)?;
        self.reserved_bytes = self.reserved_bytes.saturating_sub(transfer.expected_bytes);
        Some(transfer)
    }
}

pub fn transfer_id_is_valid(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex_encode(&Sha256::digest(bytes))
}

fn transfer_key(
    session_token: &str,
    transfer_id: &str,
) -> Result<(String, String), SearchTransferError> {
    if session_token.len() != 64
        || !session_token.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !transfer_id_is_valid(transfer_id)
    {
        return Err(SearchTransferError::Invalid);
    }
    Ok((
        session_token.to_ascii_lowercase(),
        transfer_id.to_ascii_lowercase(),
    ))
}

fn parse_sha256(value: &str) -> Result<[u8; 32], SearchTransferError> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(SearchTransferError::Invalid);
    }
    let mut digest = [0u8; 32];
    for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
        digest[index] = (hex_nibble(pair[0]).ok_or(SearchTransferError::Invalid)? << 4)
            | hex_nibble(pair[1]).ok_or(SearchTransferError::Invalid)?;
    }
    Ok(digest)
}

fn digest_matches(bytes: &[u8], expected: &[u8; 32]) -> bool {
    let actual = Sha256::digest(bytes);
    actual
        .iter()
        .zip(expected)
        .fold(0u8, |difference, (left, right)| difference | (left ^ right))
        == 0
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN_A: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const TOKEN_B: &str = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const TRANSFER: &str = "00112233445566778899aabbccddeeff";

    #[test]
    fn imports_require_ordered_chunks_complete_length_and_matching_digest() {
        let data = vec![0x5a; SEARCH_TRANSFER_CHUNK_BYTES + 7];
        let mut store = SearchTransferStore::default();
        store
            .begin_import(
                TOKEN_A,
                TRANSFER,
                "scope-a".into(),
                data.len(),
                &sha256_hex(&data),
                0,
            )
            .unwrap();
        assert_eq!(
            store.append_import_chunk(TOKEN_A, TRANSFER, 0, &data[..SEARCH_TRANSFER_CHUNK_BYTES]),
            Ok(SEARCH_TRANSFER_CHUNK_BYTES)
        );
        assert_eq!(
            store.append_import_chunk(TOKEN_A, TRANSFER, 1, &data[SEARCH_TRANSFER_CHUNK_BYTES..]),
            Ok(data.len())
        );
        assert_eq!(
            store.finish_import(TOKEN_A, TRANSFER),
            Ok(("scope-a".into(), data, 0))
        );
        assert_eq!(store.staged_bytes(), 0);
    }

    #[test]
    fn duplicate_out_of_order_and_cross_session_chunks_are_rejected_and_discarded() {
        let data = vec![0x5a; SEARCH_TRANSFER_CHUNK_BYTES + 7];
        let mut store = SearchTransferStore::default();
        store
            .begin_import(
                TOKEN_A,
                TRANSFER,
                "scope-a".into(),
                data.len(),
                &sha256_hex(&data),
                0,
            )
            .unwrap();
        assert_eq!(
            store.append_import_chunk(TOKEN_B, TRANSFER, 0, &data[..SEARCH_TRANSFER_CHUNK_BYTES]),
            Err(SearchTransferError::NotFound)
        );
        assert_eq!(
            store.append_import_chunk(TOKEN_A, TRANSFER, 1, &data[SEARCH_TRANSFER_CHUNK_BYTES..]),
            Err(SearchTransferError::InvalidSequence)
        );
        assert_eq!(store.active_count(), 0);

        store
            .begin_import(
                TOKEN_A,
                TRANSFER,
                "scope-a".into(),
                data.len(),
                &sha256_hex(&data),
                0,
            )
            .unwrap();
        assert_eq!(
            store.append_import_chunk(TOKEN_A, TRANSFER, 0, &data[..SEARCH_TRANSFER_CHUNK_BYTES]),
            Ok(SEARCH_TRANSFER_CHUNK_BYTES)
        );
        assert_eq!(
            store.append_import_chunk(TOKEN_A, TRANSFER, 0, &data[..SEARCH_TRANSFER_CHUNK_BYTES]),
            Err(SearchTransferError::InvalidSequence)
        );
        assert_eq!(store.active_count(), 0);
    }

    #[test]
    fn transfer_budget_and_checksum_are_fail_closed() {
        let mut store = SearchTransferStore::default();
        assert_eq!(
            store.begin_import(
                TOKEN_A,
                TRANSFER,
                "scope-a".into(),
                MAX_SEARCH_TRANSFER_BYTES + 1,
                &"0".repeat(64),
                0
            ),
            Err(SearchTransferError::TooLarge)
        );
        let data = b"encrypted bytes";
        store
            .begin_import(
                TOKEN_A,
                TRANSFER,
                "scope-a".into(),
                data.len(),
                &"0".repeat(64),
                0,
            )
            .unwrap();
        store
            .append_import_chunk(TOKEN_A, TRANSFER, 0, data)
            .unwrap();
        assert_eq!(
            store.finish_import(TOKEN_A, TRANSFER),
            Err(SearchTransferError::DigestMismatch)
        );
        assert_eq!(store.staged_bytes(), 0);
    }

    #[test]
    fn exports_enforce_chunk_order_and_release_staging_after_last_chunk() {
        let data = vec![0x41; SEARCH_TRANSFER_CHUNK_BYTES + 5];
        let mut store = SearchTransferStore::default();
        let digest = store
            .begin_export(TOKEN_A, TRANSFER, "scope-a".into(), data.clone(), 0)
            .unwrap();
        assert_eq!(digest, sha256_hex(&data));
        assert_eq!(
            store.next_export_chunk(TOKEN_A, TRANSFER, 1, 0),
            Err(SearchTransferError::InvalidSequence)
        );
        assert_eq!(store.active_count(), 0);

        store
            .begin_export(TOKEN_A, TRANSFER, "scope-a".into(), data.clone(), 0)
            .unwrap();
        let (first, count) = store.next_export_chunk(TOKEN_A, TRANSFER, 0, 0).unwrap();
        let (last, count_again) = store.next_export_chunk(TOKEN_A, TRANSFER, 1, 0).unwrap();
        assert_eq!(count, 2);
        assert_eq!(count_again, 2);
        assert_eq!([first, last].concat(), data);
        assert_eq!(store.staged_bytes(), 0);
    }

    #[test]
    fn export_rejects_a_search_generation_change_mid_transfer() {
        let mut store = SearchTransferStore::default();
        store
            .begin_export(
                TOKEN_A,
                TRANSFER,
                "scope-a".into(),
                vec![0x41; SEARCH_TRANSFER_CHUNK_BYTES + 1],
                7,
            )
            .unwrap();
        assert_eq!(
            store.next_export_chunk(TOKEN_A, TRANSFER, 0, 8),
            Err(SearchTransferError::StaleGeneration)
        );
        assert_eq!(store.active_count(), 0);
        assert_eq!(store.staged_bytes(), 0);
    }

    #[test]
    fn active_count_staging_budget_and_expiry_are_bounded() {
        let mut store = SearchTransferStore::default();
        for index in 0..MAX_ACTIVE_SEARCH_TRANSFERS {
            let token = format!("{index:064x}");
            let transfer_id = format!("{index:032x}");
            store
                .begin_import(
                    &token,
                    &transfer_id,
                    "scope".into(),
                    1,
                    &sha256_hex(b"x"),
                    0,
                )
                .unwrap();
        }
        assert_eq!(store.active_count(), MAX_ACTIVE_SEARCH_TRANSFERS);
        assert_eq!(store.staged_bytes(), MAX_ACTIVE_SEARCH_TRANSFERS);
        assert_eq!(
            store.begin_import(
                "f".repeat(64).as_str(),
                "ffffffffffffffffffffffffffffffff",
                "scope".into(),
                1,
                &sha256_hex(b"x"),
                0,
            ),
            Err(SearchTransferError::Busy)
        );

        let mut budgeted = SearchTransferStore::default();
        let first = MAX_STAGED_SEARCH_TRANSFER_BYTES / 2;
        let second = MAX_STAGED_SEARCH_TRANSFER_BYTES - first;
        budgeted
            .begin_import(TOKEN_A, TRANSFER, "scope".into(), first, &"0".repeat(64), 0)
            .unwrap();
        budgeted
            .begin_import(
                TOKEN_B,
                TRANSFER,
                "scope".into(),
                second,
                &"0".repeat(64),
                0,
            )
            .unwrap();
        assert_eq!(budgeted.staged_bytes(), MAX_STAGED_SEARCH_TRANSFER_BYTES);
        assert_eq!(
            budgeted.begin_import(
                "e".repeat(64).as_str(),
                "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                "scope".into(),
                1,
                &sha256_hex(b"x"),
                0,
            ),
            Err(SearchTransferError::Busy)
        );

        let expired_key = (TOKEN_A.to_ascii_lowercase(), TRANSFER.to_ascii_lowercase());
        budgeted.transfers.get_mut(&expired_key).unwrap().created_at =
            Instant::now() - SEARCH_TRANSFER_TTL;
        budgeted.expire_stale();
        assert_eq!(budgeted.active_count(), 1);
        assert_eq!(budgeted.staged_bytes(), second);
    }
}
