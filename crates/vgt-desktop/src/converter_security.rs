// STATUS: DIAMANT VGT SUPREME — shell-free converter staging invariants.
use uuid::Uuid;

pub fn validate_user_file_name_hint(file_name: &str) -> Result<(), &'static str> {
    if file_name.is_empty()
        || file_name.len() > 255
        || file_name.starts_with('-')
        || file_name.contains(['/', '\\'])
        || file_name.chars().any(char::is_control)
        || file_name
            .chars()
            .any(|ch| matches!(ch, ';' | '|' | '&' | '`' | '$'))
    {
        return Err("CONVERTER_FILE_NAME_REJECTED");
    }
    Ok(())
}

pub fn new_uuid_token() -> String {
    Uuid::new_v4().hyphenated().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec063_shellish_and_option_like_names_fail_closed() {
        assert!(validate_user_file_name_hint("report.docx").is_ok());
        assert!(validate_user_file_name_hint("; calc.exe; .docx").is_err());
        assert!(validate_user_file_name_hint("--convert-to=evil.docx").is_err());
        assert!(validate_user_file_name_hint("a/b.docx").is_err());
    }

    #[test]
    fn sec063_temp_token_is_uuid_v4() {
        let token = new_uuid_token();
        let parsed = Uuid::parse_str(&token).expect("UUID token must parse");
        assert_eq!(parsed.get_version_num(), 4);
    }
}
