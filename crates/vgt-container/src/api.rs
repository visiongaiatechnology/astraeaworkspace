// STATUS: DIAMANT VGT SUPREME — public VWC orchestration APIs.

use crate::format::{parse_framing, read_chunk_header, write_v3_header};
use crate::*;
use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use vgt_crypto::{generate_dek, generate_random_bytes, zeroize_best_effort, KEY_SIZE, SALT_SIZE};
use vgt_keyvault::{UnlockPolicy, VgtKeyVault};
use vgt_object_model::WorkspaceDocument;

impl VgtContainer {
    pub fn pack_document(
        doc: &WorkspaceDocument,
        vault: &mut VgtKeyVault,
        options: SaveOptions<'_>,
    ) -> Result<Vec<u8>, ContainerError> {
        Self::pack_document_with_journal(doc, vault, options, &[])
    }

    pub fn pack_document_with_journal(
        doc: &WorkspaceDocument,
        vault: &mut VgtKeyVault,
        options: SaveOptions<'_>,
        journal_deltas: &[&[u8]],
    ) -> Result<Vec<u8>, ContainerError> {
        let mut output = Vec::new();
        Self::write_document_streaming(
            &mut output,
            doc,
            vault,
            options,
            journal_deltas,
            HashMap::new(),
        )?;
        Ok(output)
    }

    pub fn write_document_streaming<W: Write + ?Sized>(
        writer: &mut W,
        doc: &WorkspaceDocument,
        vault: &mut VgtKeyVault,
        options: SaveOptions<'_>,
        journal_deltas: &[&[u8]],
        header_extensions: HashMap<String, serde_json::Value>,
    ) -> Result<(), ContainerError> {
        let never_cancel = || false;
        Self::write_document_streaming_cancellable(
            writer,
            doc,
            vault,
            options,
            journal_deltas,
            header_extensions,
            &never_cancel,
        )
    }

    pub fn write_document_streaming_cancellable<W: Write + ?Sized>(
        writer: &mut W,
        doc: &WorkspaceDocument,
        vault: &mut VgtKeyVault,
        options: SaveOptions<'_>,
        journal_deltas: &[&[u8]],
        header_extensions: HashMap<String, serde_json::Value>,
        cancellation: &dyn CancellationCheck,
    ) -> Result<(), ContainerError> {
        if cancellation.is_cancelled() {
            return Err(ContainerError::Cancelled);
        }
        let document_len = streaming::serialized_json_len(doc)?;
        if document_len > MAX_DOCUMENT_PLAINTEXT_SIZE as u64 {
            return Err(ContainerError::PlaintextTooLarge(
                document_len.min(usize::MAX as u64) as usize,
            ));
        }
        let mut entries = Vec::new();
        append_manifest_entries(&mut entries, ChunkType::DocumentTree, document_len)?;
        for delta in journal_deltas {
            append_manifest_entries(&mut entries, ChunkType::JournalDelta, delta.len() as u64)?;
        }
        let manifest = ContainerManifest::new(doc.schema_version, entries)?;
        let manifest_json = serde_json::to_vec(&manifest)?;

        let mut dek = generate_dek();
        let policy = resolve_policy(options);
        let result = (|| {
            let slots = vault.create_slots_for_policy_scoped(
                &dek,
                policy,
                options.pin,
                options.portable_password,
                options.recipient_public_key,
                Some(&doc.id),
            )?;
            let salt = generate_random_bytes::<SALT_SIZE>();
            let metadata = ContainerHeaderMetadata {
                header_schema_version: CURRENT_HEADER_SCHEMA_VERSION,
                key_slots: slots,
                document_id: doc.id.clone(),
                document_kind: format!("{:?}", doc.kind),
                security_profile: doc.security_policy.profile,
                unlock_policy: policy,
                compression: CompressionAlgorithm::None,
                chunk_kdf_salt: Some(salt),
                extensions: header_extensions,
            };
            let metadata_json = serde_json::to_vec(&metadata)?;
            validate_estimated_v3_size(&metadata_json, &manifest_json, &manifest)?;
            write_v3_header(
                writer,
                &metadata_json,
                &manifest_json,
                manifest.chunks.len() as u32,
            )?;
            let auth_header = streaming::document_auth_header(&metadata)?;
            let framing_digest = streaming::framing_digest(&metadata_json, &manifest_json);
            let mut emitter = streaming::V3ChunkEmitter::new(
                writer,
                &dek,
                &salt,
                &auth_header,
                framing_digest,
                &manifest.chunks,
                cancellation,
            );
            emitter.write_json_document(doc)?;
            for delta in journal_deltas {
                emitter.write_reader_exact(
                    &mut Cursor::new(*delta),
                    delta.len() as u64,
                    ChunkType::JournalDelta,
                )?;
            }
            emitter.finish()?;
            Ok::<(), ContainerError>(())
        })();
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn read_metadata(bytes: &[u8]) -> Result<ContainerHeaderMetadata, ContainerError> {
        let framing = parse_framing(bytes)?;
        let metadata: ContainerHeaderMetadata = serde_json::from_slice(framing.metadata_bytes)?;
        validate_metadata_for_version(&metadata, framing.format_version)?;
        Ok(metadata)
    }

    pub fn read_manifest(bytes: &[u8]) -> Result<Option<ContainerManifest>, ContainerError> {
        let framing = parse_framing(bytes)?;
        match framing.manifest_bytes {
            Some(raw) => {
                let manifest: ContainerManifest = serde_json::from_slice(raw)?;
                manifest.validate()?;
                if manifest.chunks.len() != framing.chunk_count as usize {
                    return Err(ContainerError::ManifestChunkMismatch);
                }
                Ok(Some(manifest))
            }
            None => Ok(None),
        }
    }

    pub fn inspect_structure(bytes: &[u8]) -> Result<ContainerStructure, ContainerError> {
        let framing = parse_framing(bytes)?;
        let manifest = match framing.manifest_bytes {
            Some(raw) => {
                let value: ContainerManifest = serde_json::from_slice(raw)?;
                value.validate()?;
                if value.chunks.len() != framing.chunk_count as usize {
                    return Err(ContainerError::ManifestChunkMismatch);
                }
                Some(value)
            }
            None => None,
        };
        let mut chunks = Vec::with_capacity(framing.chunk_count.min(1024) as usize);
        let mut offset = framing.chunks_offset;
        for index in 0..framing.chunk_count {
            let header = read_chunk_header(bytes, offset, framing.format_version)?;
            if let Some(manifest) = &manifest {
                let entry = &manifest.chunks[index as usize];
                if entry.index != index
                    || entry.chunk_type != header.chunk_type.as_u8()
                    || entry.flags != header.flags
                    || entry.plaintext_len.checked_add(16) != Some(header.encrypted_len as u64)
                {
                    return Err(ContainerError::ManifestChunkMismatch);
                }
            }
            chunks.push(ChunkDescriptor {
                index,
                chunk_type: header.chunk_type,
                flags: header.flags,
                nonce_offset: header.nonce_offset,
                payload_offset: header.payload_offset,
                encrypted_len: header.encrypted_len,
            });
            offset = header.next_offset;
        }
        if offset != bytes.len() {
            return Err(ContainerError::TrailingBytes);
        }
        Ok(ContainerStructure {
            format_version: framing.format_version,
            crypto_version: framing.crypto_version,
            metadata_len: framing.metadata_bytes.len(),
            manifest_len: framing.manifest_bytes.map_or(0, |value| value.len()),
            chunk_count: framing.chunk_count,
            chunks,
        })
    }

    pub fn fuzz_parse(bytes: &[u8]) -> Result<ContainerStructure, &'static str> {
        Self::inspect_structure(bytes).map_err(|error| error.code())
    }

    pub fn recovery_probe(bytes: &[u8]) -> Result<RecoveryProbe, ContainerError> {
        let framing = parse_framing(bytes)?;
        let metadata: ContainerHeaderMetadata = serde_json::from_slice(framing.metadata_bytes)?;
        validate_metadata_for_version(&metadata, framing.format_version)?;
        Ok(RecoveryProbe {
            format_version: framing.format_version,
            document_kind: bounded_public_label(&metadata.document_kind, 48),
            security_profile: bounded_public_label(&format!("{:?}", metadata.security_profile), 48),
            protection: bounded_public_label(&format!("{:?}", metadata.unlock_policy), 48),
        })
    }

    pub fn migration_plan_for_bytes(
        bytes: &[u8],
    ) -> Result<ContainerMigrationPlan, ContainerError> {
        let framing = parse_framing(bytes)?;
        let manifest = match framing.manifest_bytes {
            Some(raw) => Some(serde_json::from_slice::<ContainerManifest>(raw)?),
            None => None,
        };
        if let Some(value) = &manifest {
            value.validate()?;
        }
        Ok(migration_plan(framing.format_version, manifest.as_ref()))
    }

    pub fn migrate_to_current_with_vault(
        bytes: &[u8],
        vault: &mut VgtKeyVault,
    ) -> Result<Vec<u8>, ContainerError> {
        let framing = parse_framing(bytes)?;
        if framing.format_version == CURRENT_FORMAT_VERSION {
            return Ok(bytes.to_vec());
        }
        let metadata: ContainerHeaderMetadata = serde_json::from_slice(framing.metadata_bytes)?;
        validate_metadata_for_version(&metadata, framing.format_version)?;
        if metadata.unlock_policy != UnlockPolicy::DeviceOnly {
            return Err(ContainerError::MigrationCredentialsRequired);
        }
        let document = Self::unpack_with_vault(bytes, vault)?;
        let payload_schema_version = document.schema_version;
        let migrated = Self::pack_document_with_extensions(
            &document,
            vault,
            SaveOptions {
                policy: Some(metadata.unlock_policy),
                ..SaveOptions::default()
            },
            metadata.extensions,
        )?;
        let new_manifest =
            Self::read_manifest(&migrated)?.ok_or(ContainerError::CorruptedManifest)?;
        if new_manifest.compatibility.payload_schema_version != payload_schema_version {
            return Err(ContainerError::CorruptedData);
        }
        Ok(migrated)
    }

    fn pack_document_with_extensions(
        doc: &WorkspaceDocument,
        vault: &mut VgtKeyVault,
        options: SaveOptions<'_>,
        extensions: HashMap<String, serde_json::Value>,
    ) -> Result<Vec<u8>, ContainerError> {
        let mut output = Vec::new();
        Self::write_document_streaming(&mut output, doc, vault, options, &[], extensions)?;
        Ok(output)
    }

    pub fn unpack_with_vault(
        bytes: &[u8],
        vault: &VgtKeyVault,
    ) -> Result<WorkspaceDocument, ContainerError> {
        let metadata = Self::read_metadata(bytes)?;
        let mut dek = vault.unlock_dek_local(&metadata.key_slots)?;
        let result = decrypt_with_dek(bytes, &dek);
        zeroize_best_effort(&mut dek);
        result
    }

    /// Authenticates encrypted chunks without retaining the current document payload in memory.
    pub fn verify_authenticated_chunks_with_vault(
        bytes: &[u8],
        vault: &VgtKeyVault,
    ) -> Result<(), ContainerError> {
        let framing = parse_framing(bytes)?;
        let metadata: ContainerHeaderMetadata = serde_json::from_slice(framing.metadata_bytes)?;
        validate_metadata_for_version(&metadata, framing.format_version)?;
        let mut dek = vault.unlock_dek_local(&metadata.key_slots)?;
        let result = (|| {
            if framing.format_version < CURRENT_FORMAT_VERSION {
                decrypt_with_dek(bytes, &dek).map(drop)
            } else {
                let mut cursor = Cursor::new(bytes);
                let stream_framing = stream_reader::read_current_framing(&mut cursor)?;
                stream_reader::verify_current_stream(&mut cursor, stream_framing, &dek)
            }
        })();
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn unpack_with_pin(
        bytes: &[u8],
        vault: &mut VgtKeyVault,
        pin: &str,
    ) -> Result<WorkspaceDocument, ContainerError> {
        let metadata = Self::read_metadata(bytes)?;
        let mut dek = vault.unlock_dek_with_pin_for_document(
            &metadata.document_id,
            &metadata.key_slots,
            pin,
        )?;
        let result = decrypt_with_dek(bytes, &dek);
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn unpack_with_password(
        bytes: &[u8],
        password: &str,
    ) -> Result<WorkspaceDocument, ContainerError> {
        let metadata = Self::read_metadata(bytes)?;
        let mut dek = VgtKeyVault::unlock_dek_with_password(&metadata.key_slots, password)?;
        let result = decrypt_with_dek(bytes, &dek);
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn unpack_with_recipient(
        bytes: &[u8],
        recipient_private_key: &[u8; 32],
    ) -> Result<WorkspaceDocument, ContainerError> {
        let metadata = Self::read_metadata(bytes)?;
        if metadata.unlock_policy != UnlockPolicy::RecipientOnly {
            return Err(ContainerError::CorruptedData);
        }
        let mut dek =
            VgtKeyVault::unlock_dek_with_recipient(&metadata.key_slots, recipient_private_key)?;
        let result = decrypt_with_dek(bytes, &dek);
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn unpack_with_hardware(
        bytes: &[u8],
        vault: &mut VgtKeyVault,
    ) -> Result<WorkspaceDocument, ContainerError> {
        let metadata = Self::read_metadata(bytes)?;
        if metadata.unlock_policy != UnlockPolicy::HardwareBackedOnly {
            return Err(ContainerError::CorruptedData);
        }
        let mut dek =
            vault.unlock_dek_hardware_for_document(&metadata.document_id, &metadata.key_slots)?;
        let result = decrypt_with_dek(bytes, &dek);
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn inspect_structure_reader<R: Read>(
        reader: &mut R,
    ) -> Result<ContainerStructure, ContainerError> {
        stream_reader::inspect_current_stream(reader)
    }

    pub fn unpack_reader_with_vault<R: Read>(
        reader: &mut R,
        vault: &VgtKeyVault,
    ) -> Result<WorkspaceDocument, ContainerError> {
        let never_cancel = || false;
        Self::unpack_reader_with_vault_cancellable(reader, vault, &never_cancel)
    }

    pub fn unpack_reader_with_vault_cancellable<R: Read>(
        reader: &mut R,
        vault: &VgtKeyVault,
        cancellation: &dyn CancellationCheck,
    ) -> Result<WorkspaceDocument, ContainerError> {
        if cancellation.is_cancelled() {
            return Err(ContainerError::Cancelled);
        }
        let framing = stream_reader::read_current_framing(reader)?;
        let mut dek = vault.unlock_dek_local(&framing.metadata.key_slots)?;
        let result =
            stream_reader::decrypt_current_stream_cancellable(reader, framing, &dek, cancellation);
        zeroize_best_effort(&mut dek);
        result
    }
}

fn decrypt_with_dek(
    bytes: &[u8],
    dek: &[u8; KEY_SIZE],
) -> Result<WorkspaceDocument, ContainerError> {
    let framing = parse_framing(bytes)?;
    if framing.format_version < 3 {
        return legacy::decrypt_legacy(bytes, dek);
    }
    let mut cursor = Cursor::new(bytes);
    let stream_framing = stream_reader::read_current_framing(&mut cursor)?;
    stream_reader::decrypt_current_stream(&mut cursor, stream_framing, dek)
}

fn append_manifest_entries(
    entries: &mut Vec<ManifestChunkEntry>,
    chunk_type: ChunkType,
    total_len: u64,
) -> Result<(), ContainerError> {
    let chunks = required_stream_chunks(total_len)?;
    let mut remaining = total_len;
    for _ in 0..chunks {
        let len = if remaining == 0 {
            0
        } else {
            remaining.min(STREAM_PLAINTEXT_CHUNK_SIZE as u64)
        };
        let index = u32::try_from(entries.len())
            .map_err(|_| ContainerError::TooManyChunks(u32::MAX, MAX_CHUNK_COUNT))?;
        entries.push(ManifestChunkEntry::known(index, chunk_type, len));
        remaining = remaining
            .checked_sub(len)
            .ok_or(ContainerError::CorruptedData)?;
    }
    Ok(())
}

fn validate_estimated_v3_size(
    metadata_json: &[u8],
    manifest_json: &[u8],
    manifest: &ContainerManifest,
) -> Result<(), ContainerError> {
    let mut estimate =
        4u64 + 2 + 2 + 4 + metadata_json.len() as u64 + 4 + manifest_json.len() as u64 + 4;
    for entry in &manifest.chunks {
        estimate = estimate
            .checked_add(18 + entry.plaintext_len + 16)
            .ok_or(ContainerError::ContainerTooLarge(usize::MAX))?;
    }
    if estimate > MAX_CONTAINER_SIZE as u64 {
        return Err(ContainerError::ContainerTooLarge(
            estimate.min(usize::MAX as u64) as usize,
        ));
    }
    Ok(())
}

pub(crate) fn validate_metadata_for_version(
    metadata: &ContainerHeaderMetadata,
    format_version: u16,
) -> Result<(), ContainerError> {
    if metadata.key_slots.is_empty() || metadata.key_slots.len() > 64 {
        return Err(ContainerError::InvalidKeySlotCount(
            metadata.key_slots.len(),
        ));
    }
    if format_version >= 3
        && (metadata.header_schema_version < CURRENT_HEADER_SCHEMA_VERSION
            || metadata.chunk_kdf_salt.is_none())
    {
        return Err(ContainerError::CorruptedData);
    }
    Ok(())
}

fn bounded_public_label(value: &str, max: usize) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control())
        .take(max)
        .collect()
}

fn resolve_policy(options: SaveOptions<'_>) -> UnlockPolicy {
    options.policy.unwrap_or_else(|| {
        if options.pin.is_some_and(|value| !value.trim().is_empty()) {
            UnlockPolicy::DeviceAndPin
        } else if options
            .portable_password
            .is_some_and(|value| !value.trim().is_empty())
        {
            UnlockPolicy::PortablePasswordOnly
        } else {
            UnlockPolicy::DeviceOnly
        }
    })
}
