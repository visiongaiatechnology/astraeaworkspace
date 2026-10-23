//! # Zero-dependency RFC 4648 Base64 codec

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn encode(data: &[u8]) -> String {
    let mut result = String::with_capacity(data.len().div_ceil(3) * 4);
    let mut chunks = data.chunks_exact(3);
    for chunk in chunks.by_ref() {
        let n = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
        result.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 6) & 63) as usize] as char);
        result.push(ALPHABET[(n & 63) as usize] as char);
    }
    let rem = chunks.remainder();
    if rem.len() == 1 {
        let n = (rem[0] as u32) << 16;
        result.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        result.push('=');
        result.push('=');
    } else if rem.len() == 2 {
        let n = ((rem[0] as u32) << 16) | ((rem[1] as u32) << 8);
        result.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 6) & 63) as usize] as char);
        result.push('=');
    }
    result
}

pub fn decode(input: &str) -> Result<Vec<u8>, &'static str> {
    let clean: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if !clean.len().is_multiple_of(4) {
        return Err("Invalid base64 length");
    }
    let mut table = [0xFFu8; 256];
    for (i, &b) in ALPHABET.iter().enumerate() {
        table[b as usize] = i as u8;
    }

    let mut output = Vec::with_capacity(clean.len() / 4 * 3);
    let chunk_count = clean.len() / 4;
    for (chunk_index, chunk) in clean.chunks(4).enumerate() {
        let b0 = table[chunk[0] as usize];
        let b1 = table[chunk[1] as usize];
        let has_padding = chunk[2] == b'=' || chunk[3] == b'=';
        if has_padding && chunk_index + 1 != chunk_count {
            return Err("Base64 padding is only valid in the final quartet");
        }
        if chunk[2] == b'=' && chunk[3] != b'=' {
            return Err("Invalid base64 padding position");
        }

        let b2 = if chunk[2] == b'=' {
            0
        } else {
            table[chunk[2] as usize]
        };
        let b3 = if chunk[3] == b'=' {
            0
        } else {
            table[chunk[3] as usize]
        };

        if b0 == 0xFF
            || b1 == 0xFF
            || (chunk[2] != b'=' && b2 == 0xFF)
            || (chunk[3] != b'=' && b3 == 0xFF)
        {
            return Err("Invalid base64 character");
        }

        if chunk[2] == b'=' && b1 & 0x0f != 0 {
            return Err("Non-canonical base64 padding bits");
        }
        if chunk[3] == b'=' && chunk[2] != b'=' && b2 & 0x03 != 0 {
            return Err("Non-canonical base64 padding bits");
        }

        let triple = ((b0 as u32) << 18) | ((b1 as u32) << 12) | ((b2 as u32) << 6) | (b3 as u32);
        output.push(((triple >> 16) & 0xFF) as u8);
        if chunk[2] != b'=' {
            output.push(((triple >> 8) & 0xFF) as u8);
        }
        if chunk[3] != b'=' {
            output.push((triple & 0xFF) as u8);
        }
    }
    Ok(output)
}
