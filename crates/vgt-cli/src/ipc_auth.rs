//! STATUS: DIAMANT VGT SUPREME
//! Ephemeral, process-local authorization for the loopback Workspace IPC bridge.

pub const IPC_AUTH_HEADER: &str = "x-vgt-ipc-token";
const TOKEN_BYTES: usize = 32;
const TOKEN_HEX_LEN: usize = TOKEN_BYTES * 2;
const MAX_PAIRED_TOKENS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IpcAuthError {
    InvalidToken,
    Capacity,
    Unauthorized,
}

#[derive(Debug, Default)]
pub struct IpcAuthState {
    tokens: Vec<[u8; TOKEN_BYTES]>,
}

impl IpcAuthState {
    pub fn pair(&mut self, token_hex: &str) -> Result<(), IpcAuthError> {
        let token = decode_token(token_hex)?;
        if self
            .tokens
            .iter()
            .any(|existing| constant_time_eq(existing, &token))
        {
            return Ok(());
        }
        if self.tokens.len() >= MAX_PAIRED_TOKENS {
            return Err(IpcAuthError::Capacity);
        }
        self.tokens.push(token);
        Ok(())
    }

    pub fn authorize(&self, token_hex: Option<&str>) -> Result<(), IpcAuthError> {
        let supplied = decode_token(token_hex.ok_or(IpcAuthError::Unauthorized)?)?;
        let mut matched = 0u8;
        for existing in &self.tokens {
            matched |= constant_time_eq(existing, &supplied) as u8;
        }
        if matched == 1 {
            Ok(())
        } else {
            Err(IpcAuthError::Unauthorized)
        }
    }

    pub fn paired_count(&self) -> usize {
        self.tokens.len()
    }
}

fn decode_token(value: &str) -> Result<[u8; TOKEN_BYTES], IpcAuthError> {
    let bytes = value.as_bytes();
    if bytes.len() != TOKEN_HEX_LEN {
        return Err(IpcAuthError::InvalidToken);
    }
    let mut out = [0u8; TOKEN_BYTES];
    for i in 0..TOKEN_BYTES {
        let hi = decode_nibble(bytes[i * 2]).ok_or(IpcAuthError::InvalidToken)?;
        let lo = decode_nibble(bytes[i * 2 + 1]).ok_or(IpcAuthError::InvalidToken)?;
        out[i] = (hi << 4) | lo;
    }
    Ok(out)
}

fn decode_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn constant_time_eq(left: &[u8; TOKEN_BYTES], right: &[u8; TOKEN_BYTES]) -> bool {
    let mut diff = 0u8;
    for i in 0..TOKEN_BYTES {
        diff |= left[i] ^ right[i];
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN_A: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    const TOKEN_B: &str = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

    #[test]
    fn unpaired_and_wrong_tokens_fail_closed() {
        let mut state = IpcAuthState::default();
        assert_eq!(state.authorize(None), Err(IpcAuthError::Unauthorized));
        state.pair(TOKEN_A).unwrap();
        assert_eq!(
            state.authorize(Some(TOKEN_B)),
            Err(IpcAuthError::Unauthorized)
        );
        assert_eq!(
            state.authorize(Some("abcd")),
            Err(IpcAuthError::InvalidToken)
        );
    }

    #[test]
    fn paired_tokens_authorize_and_pairing_is_idempotent() {
        let mut state = IpcAuthState::default();
        state.pair(TOKEN_A).unwrap();
        state.pair(TOKEN_A).unwrap();
        assert_eq!(state.paired_count(), 1);
        assert!(state.authorize(Some(TOKEN_A)).is_ok());
    }

    #[test]
    fn pairing_capacity_is_bounded() {
        let mut state = IpcAuthState::default();
        for index in 0..MAX_PAIRED_TOKENS {
            let token = format!("{:064x}", index + 1);
            state.pair(&token).unwrap();
        }
        assert_eq!(state.paired_count(), MAX_PAIRED_TOKENS);
        assert_eq!(
            state.pair(&format!("{:064x}", MAX_PAIRED_TOKENS + 1)),
            Err(IpcAuthError::Capacity)
        );
    }
}
