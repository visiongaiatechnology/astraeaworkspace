//! Recipient-envelope policy for Astraea Workspace.
//!
//! Standard recipients use one independent X25519/HKDF/AES-256-GCM envelope per recipient.
//! The VGT Top Secret profile is intentionally *not* implemented here: this module only
//! authenticates/dispatches its profile descriptor. The cryptographic implementation remains
//! exclusively owned by `vgt-top-secret` + the pinned `vgt-infinity-core` provider.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    constant_time_eq, unwrap_dek_for_x25519_recipient, validate_public_crypto_input,
    wrap_dek_for_x25519_recipient, x25519_public_from_private, CryptoError,
    X25519RecipientEnvelope, KEY_SIZE,
};

pub const RECIPIENT_BUNDLE_VERSION: u16 = 1;
pub const MAX_STANDARD_RECIPIENTS: usize = 64;
pub const MAX_RECIPIENT_LABEL_BYTES: usize = 128;
pub const STANDARD_RECIPIENT_PROFILE_ID: &str = "ASTRAEA-STANDARD-X25519-V1";
pub const TOP_SECRET_PROFILE_ID: &str = "VGT-ASTRAEA-TS-1";
pub const TOP_SECRET_EXTERNAL_SUITE_ID: &str = "VGT-INFINITY-1";
pub const TOP_SECRET_PROVIDER_OWNER: &str = "vgt-top-secret/vgt-infinity-core";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecipientSecurityProfile {
    StandardV1,
    VgtTopSecretV1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecipientProfileDescriptor {
    pub profile: RecipientSecurityProfile,
    pub profile_id: &'static str,
    pub implementation_owner: &'static str,
    pub external_suite: Option<&'static str>,
    pub forced_for_all_users: bool,
}

pub const STANDARD_RECIPIENT_PROFILE: RecipientProfileDescriptor = RecipientProfileDescriptor {
    profile: RecipientSecurityProfile::StandardV1,
    profile_id: STANDARD_RECIPIENT_PROFILE_ID,
    implementation_owner: "vgt-crypto",
    external_suite: None,
    forced_for_all_users: false,
};

pub const TOP_SECRET_RECIPIENT_PROFILE: RecipientProfileDescriptor = RecipientProfileDescriptor {
    profile: RecipientSecurityProfile::VgtTopSecretV1,
    profile_id: TOP_SECRET_PROFILE_ID,
    implementation_owner: TOP_SECRET_PROVIDER_OWNER,
    external_suite: Some(TOP_SECRET_EXTERNAL_SUITE_ID),
    forced_for_all_users: false,
};

pub fn recipient_profile_descriptor(
    profile: RecipientSecurityProfile,
) -> RecipientProfileDescriptor {
    match profile {
        RecipientSecurityProfile::StandardV1 => STANDARD_RECIPIENT_PROFILE,
        RecipientSecurityProfile::VgtTopSecretV1 => TOP_SECRET_RECIPIENT_PROFILE,
    }
}

/// Public recipient identity. This type contains public material only.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VerifiedX25519Recipient {
    pub label: String,
    pub public_key: [u8; 32],
    pub public_key_fingerprint_sha256: [u8; 32],
}

impl VerifiedX25519Recipient {
    /// Pin a public key locally during identity enrollment.
    pub fn new(label: impl Into<String>, public_key: [u8; 32]) -> Result<Self, CryptoError> {
        let fingerprint: [u8; 32] = Sha256::digest(public_key).into();
        Self::from_expected_fingerprint(label, public_key, fingerprint)
    }

    /// Construct from identity material only if its externally supplied/pinned fingerprint matches.
    pub fn from_expected_fingerprint(
        label: impl Into<String>,
        public_key: [u8; 32],
        expected_fingerprint_sha256: [u8; 32],
    ) -> Result<Self, CryptoError> {
        let label = label.into();
        if label.is_empty() || label.len() > MAX_RECIPIENT_LABEL_BYTES {
            return Err(CryptoError::BoundaryViolation("recipient label"));
        }
        let actual: [u8; 32] = Sha256::digest(public_key).into();
        if !constant_time_eq(&actual, &expected_fingerprint_sha256) {
            return Err(CryptoError::DecryptionFailed);
        }
        Ok(Self {
            label,
            public_key,
            public_key_fingerprint_sha256: expected_fingerprint_sha256,
        })
    }

    pub fn verify_fingerprint(&self) -> Result<(), CryptoError> {
        let expected: [u8; 32] = Sha256::digest(self.public_key).into();
        if constant_time_eq(&expected, &self.public_key_fingerprint_sha256) {
            Ok(())
        } else {
            Err(CryptoError::DecryptionFailed)
        }
    }
}

/// One recipient gets one independently wrapped DEK. No recipient private material is stored.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StandardRecipientSlot {
    pub label: String,
    pub recipient_public_key_fingerprint_sha256: [u8; 32],
    pub envelope: X25519RecipientEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MultiRecipientEnvelope {
    pub version: u16,
    pub profile: RecipientSecurityProfile,
    pub slots: Vec<StandardRecipientSlot>,
}

impl MultiRecipientEnvelope {
    pub fn validate_public_metadata(&self) -> Result<(), CryptoError> {
        if self.version != RECIPIENT_BUNDLE_VERSION
            || self.profile != RecipientSecurityProfile::StandardV1
            || self.slots.is_empty()
            || self.slots.len() > MAX_STANDARD_RECIPIENTS
        {
            return Err(CryptoError::BoundaryViolation("recipient bundle"));
        }
        for (index, slot) in self.slots.iter().enumerate() {
            if slot.label.is_empty() || slot.label.len() > MAX_RECIPIENT_LABEL_BYTES {
                return Err(CryptoError::BoundaryViolation("recipient label"));
            }
            if !constant_time_eq(
                &slot.recipient_public_key_fingerprint_sha256,
                &slot.envelope.recipient_public_key_fingerprint_sha256,
            ) {
                return Err(CryptoError::DecryptionFailed);
            }
            for previous in &self.slots[..index] {
                if constant_time_eq(
                    &previous.recipient_public_key_fingerprint_sha256,
                    &slot.recipient_public_key_fingerprint_sha256,
                ) {
                    return Err(CryptoError::BoundaryViolation("duplicate recipient"));
                }
            }
        }
        Ok(())
    }
}

pub fn wrap_dek_for_recipients(
    dek: &[u8; KEY_SIZE],
    recipients: &[VerifiedX25519Recipient],
) -> Result<MultiRecipientEnvelope, CryptoError> {
    wrap_dek_for_recipients_cancellable(dek, recipients, &|| false)
}

/// Bounded multi-recipient operation with cancellation between recipient slots.
/// Individual primitive calls remain atomic; cancellation never exposes partial plaintext.
pub fn wrap_dek_for_recipients_cancellable(
    dek: &[u8; KEY_SIZE],
    recipients: &[VerifiedX25519Recipient],
    cancelled: &dyn Fn() -> bool,
) -> Result<MultiRecipientEnvelope, CryptoError> {
    if recipients.is_empty() || recipients.len() > MAX_STANDARD_RECIPIENTS {
        return Err(CryptoError::BoundaryViolation("recipient count"));
    }
    let mut slots = Vec::with_capacity(recipients.len());
    for (index, recipient) in recipients.iter().enumerate() {
        if cancelled() {
            return Err(CryptoError::Cancelled);
        }
        recipient.verify_fingerprint()?;
        for previous in &recipients[..index] {
            if constant_time_eq(
                &previous.public_key_fingerprint_sha256,
                &recipient.public_key_fingerprint_sha256,
            ) {
                return Err(CryptoError::BoundaryViolation("duplicate recipient"));
            }
        }
        let envelope = wrap_dek_for_x25519_recipient(dek, &recipient.public_key)?;
        slots.push(StandardRecipientSlot {
            label: recipient.label.clone(),
            recipient_public_key_fingerprint_sha256: recipient.public_key_fingerprint_sha256,
            envelope,
        });
    }
    if cancelled() {
        return Err(CryptoError::Cancelled);
    }
    let bundle = MultiRecipientEnvelope {
        version: RECIPIENT_BUNDLE_VERSION,
        profile: RecipientSecurityProfile::StandardV1,
        slots,
    };
    bundle.validate_public_metadata()?;
    Ok(bundle)
}

pub fn unwrap_dek_from_recipients(
    bundle: &MultiRecipientEnvelope,
    recipient_private_key: &[u8; 32],
) -> Result<[u8; KEY_SIZE], CryptoError> {
    bundle.validate_public_metadata()?;
    let public_key = x25519_public_from_private(recipient_private_key);
    let fingerprint: [u8; 32] = Sha256::digest(public_key).into();
    let slot = bundle
        .slots
        .iter()
        .find(|slot| constant_time_eq(&slot.recipient_public_key_fingerprint_sha256, &fingerprint))
        .ok_or(CryptoError::DecryptionFailed)?;
    unwrap_dek_for_x25519_recipient(&slot.envelope, recipient_private_key)
}

/// Validate the external Top Secret routing contract without reimplementing any of its crypto.
/// Unknown/downgraded profile identifiers fail closed.
pub fn validate_top_secret_delegation(
    profile_id: &str,
    external_suite_id: &str,
) -> Result<(), CryptoError> {
    if profile_id == TOP_SECRET_PROFILE_ID && external_suite_id == TOP_SECRET_EXTERNAL_SUITE_ID {
        Ok(())
    } else {
        Err(CryptoError::UnsupportedSecurityProfile)
    }
}

/// Bounded parser boundary for serialized public recipient envelopes.
pub fn parse_recipient_bundle_json(bytes: &[u8]) -> Result<MultiRecipientEnvelope, CryptoError> {
    validate_public_crypto_input(
        bytes,
        crate::assurance::MAX_SERIALIZED_RECIPIENT_BUNDLE_BYTES,
    )?;
    let bundle: MultiRecipientEnvelope = serde_json::from_slice(bytes)
        .map_err(|_| CryptoError::SerializationError("recipient bundle rejected".to_string()))?;
    bundle.validate_public_metadata()?;
    Ok(bundle)
}

/// Bounded serializer for public recipient metadata. Private material is not representable here.
pub fn serialize_recipient_bundle_json(
    bundle: &MultiRecipientEnvelope,
) -> Result<Vec<u8>, CryptoError> {
    bundle.validate_public_metadata()?;
    let bytes = serde_json::to_vec(bundle).map_err(|_| {
        CryptoError::SerializationError("recipient bundle serialization failed".to_string())
    })?;
    validate_public_crypto_input(
        &bytes,
        crate::assurance::MAX_SERIALIZED_RECIPIENT_BUNDLE_BYTES,
    )?;
    Ok(bytes)
}
