//! STATUS: DIAMANT VGT SUPREME
//! Passive document rendering is never a network authority. Remote resources embedded in a
//! document must not cause DNS, socket, HTTP, font, media or beacon traffic merely by opening it.

use crate::NetGateError;

pub fn validate_passive_document_resource(raw: &str) -> Result<(), NetGateError> {
    let value = raw.trim();
    if value.is_empty() {
        return Ok(());
    }
    let lower = value.to_ascii_lowercase();
    if lower == "about:blank"
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("cid:")
        || lower.starts_with("vgt:")
        || lower.starts_with('#')
    {
        return Ok(());
    }
    Err(NetGateError::AccessDenied)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec034_remote_document_resources_are_fail_closed() {
        for index in 0..10 {
            assert!(validate_passive_document_resource(&format!(
                "https://attacker.example/pixel-{index}.png"
            ))
            .is_err());
        }
        for hostile in [
            "http://attacker.example/font.woff2",
            "//attacker.example/beacon",
            "file:///etc/passwd",
            "ftp://attacker.example/x",
            "wss://attacker.example/socket",
        ] {
            assert!(validate_passive_document_resource(hostile).is_err());
        }
        for local in [
            "data:image/png;base64,AA==",
            "blob:vgt-local",
            "cid:image-1",
            "vgt://doc/object",
            "about:blank",
        ] {
            assert!(validate_passive_document_resource(local).is_ok());
        }
    }
}
