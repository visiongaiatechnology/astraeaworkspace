// STATUS: DIAMANT VGT SUPREME — canonical temporary jail for external converter processes.
use crate::converter_security::new_uuid_token;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub fn reject_absolute_or_escape_path(raw: &str) -> Result<(), &'static str> {
    if raw.is_empty() || raw.len() > 4096 || raw.chars().any(char::is_control) {
        return Err("CONVERTER_JAIL_PATH_REJECTED");
    }
    let normalized = raw.replace('\\', "/");
    if normalized.starts_with('/')
        || normalized.starts_with("//")
        || normalized
            .as_bytes()
            .get(1)
            .is_some_and(|value| *value == b':')
    {
        return Err("CONVERTER_JAIL_PATH_REJECTED");
    }
    let path = Path::new(&normalized);
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("CONVERTER_JAIL_PATH_REJECTED");
    }
    Ok(())
}

pub fn create_private_converter_jail(prefix: &str) -> Result<PathBuf, String> {
    if prefix.is_empty()
        || prefix.len() > 48
        || !prefix
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err("Converter jail prefix is invalid".to_string());
    }
    let path = std::env::temp_dir().join(format!("astraea-{prefix}-{}", new_uuid_token()));
    #[cfg(unix)]
    let builder = {
        use std::os::unix::fs::DirBuilderExt;
        let mut builder = fs::DirBuilder::new();
        builder.mode(0o700);
        builder
    };
    #[cfg(not(unix))]
    let builder = fs::DirBuilder::new();
    builder
        .create(&path)
        .map_err(|_| "Converter jail could not be created".to_string())?;
    canonical_jail_root(&path)
}

pub fn canonical_jail_root(root: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(root)
        .map_err(|_| "Converter jail metadata is unavailable".to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Converter jail root is invalid".to_string());
    }
    root.canonicalize()
        .map_err(|_| "Converter jail root is invalid".to_string())
}

pub fn jail_leaf(root: &Path, leaf: &str) -> Result<PathBuf, String> {
    reject_absolute_or_escape_path(leaf)
        .map_err(|_| "Converter jail member path is invalid".to_string())?;
    if leaf.contains('/') || leaf.contains('\\') || leaf == "." || leaf == ".." {
        return Err("Converter jail member path is invalid".to_string());
    }
    let root = canonical_jail_root(root)?;
    Ok(root.join(leaf))
}

pub fn require_existing_path_in_jail(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root = canonical_jail_root(root)?;
    let metadata = fs::symlink_metadata(candidate)
        .map_err(|_| "Converter jail member is unavailable".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Converter jail member symlink rejected".to_string());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "Converter jail member is unavailable".to_string())?;
    if canonical == root || !canonical.starts_with(&root) {
        return Err("Converter jail escape rejected".to_string());
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn sec064_windows_system_path_and_parent_escape_fail_closed() {
        for candidate in [
            r"C:\Windows\System32\",
            r"\\server\share\evil.docx",
            "/etc/passwd",
            "../../etc/passwd",
            r"..\..\Windows\System32\calc.exe",
        ] {
            assert!(
                reject_absolute_or_escape_path(candidate).is_err(),
                "{candidate}"
            );
        }
        assert!(reject_absolute_or_escape_path("input.docx").is_ok());
    }

    #[test]
    fn sec064_canonical_member_cannot_escape_jail() {
        let root = create_private_converter_jail("sec064-test").unwrap();
        let inside = jail_leaf(&root, "input.docx").unwrap();
        let mut file = fs::File::create(&inside).unwrap();
        file.write_all(b"safe").unwrap();
        assert_eq!(
            require_existing_path_in_jail(&root, &inside).unwrap(),
            inside.canonicalize().unwrap()
        );
        assert!(require_existing_path_in_jail(&root, Path::new("/etc/passwd")).is_err());
        let _ = fs::remove_file(inside);
        let _ = fs::remove_dir(root);
    }
}
