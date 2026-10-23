// STATUS: DIAMANT VGT SUPREME — atomic ciphertext-only storage transaction boundary.

use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const VERIFY_BUFFER_BYTES: usize = 64 * 1024;

fn transaction_path(final_path: &Path) -> Result<PathBuf, String> {
    let parent = final_path
        .parent()
        .ok_or_else(|| "Container path has no parent directory".to_string())?;
    let file_name = final_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Container file name is invalid".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System clock is invalid".to_string())?
        .as_nanos();
    Ok(parent.join(format!(
        ".{file_name}.vgt-txn-{}-{nonce}",
        std::process::id()
    )))
}

struct HashingWriter<'a> {
    file: &'a mut fs::File,
    hasher: Sha256,
    bytes: u64,
}

impl<'a> HashingWriter<'a> {
    fn new(file: &'a mut fs::File) -> Self {
        Self {
            file,
            hasher: Sha256::new(),
            bytes: 0,
        }
    }
    fn finish(self) -> ([u8; 32], u64) {
        let digest = self.hasher.finalize();
        let mut output = [0u8; 32];
        output.copy_from_slice(&digest);
        (output, self.bytes)
    }
}

impl Write for HashingWriter<'_> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let written = self.file.write(buf)?;
        self.hasher.update(&buf[..written]);
        self.bytes = self.bytes.checked_add(written as u64).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, "ciphertext size overflow")
        })?;
        Ok(written)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.file.flush()
    }
}

fn create_private_transaction_file(path: &Path) -> Result<fs::File, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|_| "Encrypted transaction file could not be created".to_string())
    }
    #[cfg(not(unix))]
    {
        // Windows inherits the DACL of the selected parent directory and this path never
        // widens it. Workspace-managed/recovery roots live in the user's private app-data tree.
        fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|_| "Encrypted transaction file could not be created".to_string())
    }
}

pub fn atomic_write_encrypted_stream<WriteFn, VerifyFn>(
    final_path: &Path,
    write_ciphertext: WriteFn,
    verify_ciphertext: VerifyFn,
) -> Result<(), String>
where
    WriteFn: FnOnce(&mut dyn Write) -> Result<(), String>,
    VerifyFn: FnOnce(&Path) -> Result<(), String>,
{
    let parent = final_path
        .parent()
        .ok_or_else(|| "Container path has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Container directory could not be created".to_string())?;
    let temp_path = transaction_path(final_path)?;

    let result = (|| -> Result<(), String> {
        let mut file = create_private_transaction_file(&temp_path)?;
        let (expected_digest, expected_size) = {
            let mut writer = HashingWriter::new(&mut file);
            write_ciphertext(&mut writer)?;
            writer
                .flush()
                .map_err(|_| "Encrypted transaction file could not be flushed".to_string())?;
            writer.finish()
        };
        file.sync_all()
            .map_err(|_| "Encrypted transaction file could not be synchronized".to_string())?;
        drop(file);
        verify_disk_digest(&temp_path, &expected_digest, expected_size)?;
        verify_ciphertext(&temp_path)?;
        atomic_replace_path(&temp_path, final_path)?;
        sync_parent_directory(parent)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub fn atomic_replace_encrypted(final_path: &Path, encrypted_bytes: &[u8]) -> Result<(), String> {
    atomic_write_encrypted_stream(
        final_path,
        |writer| {
            writer
                .write_all(encrypted_bytes)
                .map_err(|_| "Encrypted transaction file could not be written".to_string())
        },
        |_| Ok(()),
    )
}

pub fn atomic_write_vwc_stream<WriteFn>(final_path: &Path, write_vwc: WriteFn) -> Result<(), String>
where
    WriteFn: FnOnce(&mut dyn Write) -> Result<(), String>,
{
    atomic_write_encrypted_stream(final_path, write_vwc, |path| {
        let mut file = fs::File::open(path)
            .map_err(|_| "VWC transaction could not be reopened".to_string())?;
        vgt_container::VgtContainer::inspect_structure_reader(&mut file)
            .map_err(|_| "VWC transaction failed structural verification".to_string())?;
        Ok(())
    })
}

fn verify_disk_digest(path: &Path, expected: &[u8; 32], expected_size: u64) -> Result<(), String> {
    let mut file = fs::File::open(path)
        .map_err(|_| "Encrypted transaction file could not be verified".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "Encrypted transaction metadata could not be verified".to_string())?;
    if metadata.len() != expected_size {
        return Err("Encrypted transaction size verification failed".to_string());
    }
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; VERIFY_BUFFER_BYTES];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "Encrypted transaction file could not be verified".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = hasher.finalize();
    if actual.as_slice() != expected {
        return Err("Encrypted transaction digest verification failed".to_string());
    }
    Ok(())
}

#[cfg(unix)]
fn atomic_replace_path(temp_path: &Path, final_path: &Path) -> Result<(), String> {
    fs::rename(temp_path, final_path)
        .map_err(|_| "Encrypted container could not be atomically replaced".to_string())
}

#[cfg(windows)]
fn atomic_replace_path(temp_path: &Path, final_path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let from: Vec<u16> = temp_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let to: Vec<u16> = final_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    if unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err("Encrypted container could not be atomically replaced".to_string());
    }
    Ok(())
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> Result<(), String> {
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "Container directory could not be synchronized".to_string())
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod software_provider_vwc_tests {
    use super::atomic_write_vwc_stream;
    use std::ffi::OsString;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::{Mutex, MutexGuard};
    use std::time::{SystemTime, UNIX_EPOCH};
    use vgt_container::{SaveOptions, VgtContainer};
    use vgt_keyvault::{KeyVaultError, UnlockPolicy, VgtKeyVault};
    use vgt_object_model::{DocumentKind, WorkspaceDocument};

    const PASSPHRASE: &str = "correct horse battery staple";
    static APPDATA_TEST_LOCK: Mutex<()> = Mutex::new(());

    struct IsolatedAppData {
        path: PathBuf,
        previous: Option<OsString>,
        _lock: MutexGuard<'static, ()>,
    }

    impl IsolatedAppData {
        fn new() -> Self {
            let lock = APPDATA_TEST_LOCK
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let previous = std::env::var_os("APPDATA");
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "vgt-open-core-software-vwc-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create isolated app-data root");
            println!("ISOLATED_APPDATA_TEST_ROOT={}", path.display());
            std::env::set_var("APPDATA", &path);
            Self {
                path,
                previous,
                _lock: lock,
            }
        }
    }

    impl Drop for IsolatedAppData {
        fn drop(&mut self) {
            restore_appdata(self.previous.take());
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    struct ScopedAppData {
        previous: Option<OsString>,
    }

    impl ScopedAppData {
        fn set(path: &std::path::Path) -> Self {
            let previous = std::env::var_os("APPDATA");
            std::env::set_var("APPDATA", path);
            Self { previous }
        }
    }

    impl Drop for ScopedAppData {
        fn drop(&mut self) {
            restore_appdata(self.previous.take());
        }
    }

    fn restore_appdata(previous: Option<OsString>) {
        if let Some(previous) = previous {
            std::env::set_var("APPDATA", previous);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    fn save_options() -> SaveOptions<'static> {
        SaveOptions {
            policy: Some(UnlockPolicy::DeviceOnly),
            pin: None,
            portable_password: None,
            recipient_public_key: None,
        }
    }

    fn write_vwc(path: &std::path::Path, document: &WorkspaceDocument, vault: &mut VgtKeyVault) {
        atomic_write_vwc_stream(path, |writer| {
            VgtContainer::write_document_streaming(
                writer,
                document,
                vault,
                save_options(),
                &[],
                std::collections::HashMap::new(),
            )
            .map_err(|_| "native VWC encryption failed".to_string())
        })
        .expect("atomic VWC write");
    }

    fn spawn_restart_child(
        app_data: &std::path::Path,
        file: &std::path::Path,
        expected_title: &str,
    ) {
        let output = Command::new(std::env::current_exe().expect("test executable path"))
            .args([
                "--exact",
                "container_storage::software_provider_vwc_tests::software_provider_restart_child",
                "--ignored",
                "--nocapture",
            ])
            .env("APPDATA", app_data)
            .env("VGT_SOFTWARE_VWC_TEST_FILE", file)
            .env("VGT_SOFTWARE_VWC_EXPECTED_TITLE", expected_title)
            .output()
            .expect("spawn isolated restart process");
        assert!(
            output.status.success(),
            "restart child failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let child_output = String::from_utf8_lossy(&output.stdout);
        assert!(
            child_output.contains("1 passed; 0 failed"),
            "restart child did not run the restore assertion: {child_output}"
        );
    }

    #[test]
    #[ignore = "spawned by the isolated software-provider roundtrip test"]
    fn software_provider_restart_child() {
        let Some(file) = std::env::var_os("VGT_SOFTWARE_VWC_TEST_FILE") else {
            return;
        };
        let expected_title =
            std::env::var("VGT_SOFTWARE_VWC_EXPECTED_TITLE").expect("restart test expected title");
        let bytes = fs::read(file).expect("read VWC after process restart");
        let mut vault = VgtKeyVault::new();
        vault
            .unlock_software_provider(PASSPHRASE.to_string())
            .expect("unlock software key in restarted process");
        let document = VgtContainer::unpack_with_vault(&bytes, &vault)
            .expect("decrypt VWC in restarted process");
        assert_eq!(document.title, expected_title);
    }

    #[test]
    fn software_provider_survives_restart_for_vwc_edit_atomic_rewrite_and_recovery() {
        let app_data = IsolatedAppData::new();
        let vault_dir = app_data.path.join("vgt_workspace");
        let document_dir = app_data.path.join("workspace");
        let recovery_dir = app_data.path.join("recovery");
        fs::create_dir_all(&document_dir).unwrap();
        fs::create_dir_all(&recovery_dir).unwrap();
        let document_path = document_dir.join("roundtrip.vwc");
        let recovery_path = recovery_dir.join("roundtrip.vrec");
        let mut document =
            WorkspaceDocument::new("Software provider roundtrip", DocumentKind::Writer);

        let mut first_process_vault = VgtKeyVault::new();
        first_process_vault
            .create_software_provider(PASSPHRASE.to_string())
            .expect("explicitly create and unlock software provider");
        write_vwc(&document_path, &document, &mut first_process_vault);
        let initial_bytes = fs::read(&document_path).expect("read encrypted VWC");
        assert!(!initial_bytes
            .windows(document.title.len())
            .any(|window| window == document.title.as_bytes()));
        assert!(
            !vault_dir.join("wmk.dat").exists(),
            "DPAPI root was not created"
        );
        drop(first_process_vault);
        spawn_restart_child(&app_data.path, &document_path, &document.title);

        let mut restarted_vault = VgtKeyVault::new();
        assert!(matches!(
            restarted_vault.unlock_software_provider("wrong passphrase".to_string()),
            Err(KeyVaultError::InvalidCredentialFormat) | Err(KeyVaultError::AuthenticationFailed)
        ));
        restarted_vault
            .unlock_software_provider(PASSPHRASE.to_string())
            .expect("unlock same software root after restart");
        let opened = VgtContainer::unpack_with_vault(&initial_bytes, &restarted_vault)
            .expect("decrypt VWC after restart");
        assert_eq!(opened.title, document.title);

        document.title = "Edited after software-key restart".to_string();
        write_vwc(&document_path, &document, &mut restarted_vault);
        let rewritten_bytes = fs::read(&document_path).expect("read atomically rewritten VWC");
        assert_ne!(rewritten_bytes, initial_bytes);
        assert_eq!(
            VgtContainer::unpack_with_vault(&rewritten_bytes, &restarted_vault)
                .expect("decrypt rewritten VWC")
                .title,
            document.title
        );

        write_vwc(&recovery_path, &document, &mut restarted_vault);
        let recovery_bytes = fs::read(&recovery_path).expect("read encrypted recovery VWC");
        drop(restarted_vault);
        spawn_restart_child(&app_data.path, &recovery_path, &document.title);
        let mut recovery_process_vault = VgtKeyVault::new();
        recovery_process_vault
            .unlock_software_provider(PASSPHRASE.to_string())
            .expect("unlock for recovery restore after another restart");
        assert_eq!(
            VgtContainer::unpack_with_vault(&recovery_bytes, &recovery_process_vault)
                .expect("restore encrypted recovery VWC")
                .title,
            document.title
        );

        let mut damaged = recovery_bytes;
        let last = damaged.len() - 1;
        damaged[last] ^= 1;
        assert!(VgtContainer::unpack_with_vault(&damaged, &recovery_process_vault).is_err());
        assert!(
            !vault_dir.join("wmk.dat").exists(),
            "software path never touched DPAPI root"
        );

        let preserved_profile = app_data.path.join("existing-provider-profile");
        let preserved_vault_dir = preserved_profile.join("vgt_workspace");
        fs::create_dir_all(&preserved_vault_dir).unwrap();
        let legacy_dpapi_record = preserved_vault_dir.join("wmk.dat");
        let legacy_record_bytes = b"existing DPAPI-protected root record";
        fs::write(&legacy_dpapi_record, legacy_record_bytes).unwrap();
        let preserved_profile_appdata = ScopedAppData::set(&preserved_profile);
        let mut separate_software_vault = VgtKeyVault::new();
        separate_software_vault
            .create_software_provider(PASSPHRASE.to_string())
            .expect("create independent software provider alongside existing record");
        drop(separate_software_vault);
        assert_eq!(fs::read(&legacy_dpapi_record).unwrap(), legacy_record_bytes);
        drop(preserved_profile_appdata);
        assert_eq!(
            std::env::var_os("APPDATA").as_deref(),
            Some(app_data.path.as_os_str()),
            "temporary provider swap must restore the fixture APPDATA root"
        );
    }

    #[test]
    fn corrupt_vwc_replacement_preserves_the_last_committed_container() {
        let app_data = IsolatedAppData::new();
        let document_dir = app_data.path.join("workspace");
        fs::create_dir_all(&document_dir).expect("create isolated document directory");
        let document_path = document_dir.join("last-good.vwc");
        let document = WorkspaceDocument::new("Last committed document", DocumentKind::Writer);
        let mut vault = VgtKeyVault::new();
        vault
            .create_software_provider(PASSPHRASE.to_string())
            .expect("create isolated software provider");

        write_vwc(&document_path, &document, &mut vault);
        let committed_bytes = fs::read(&document_path).expect("read committed container");
        let replacement = atomic_write_vwc_stream(&document_path, |writer| {
            writer
                .write_all(b"VWC1-corrupt-replacement")
                .map_err(|_| "corrupt fixture could not be written".to_string())
        });

        assert!(
            replacement.is_err(),
            "invalid VWC replacement must fail verification"
        );
        assert_eq!(
            fs::read(&document_path).expect("read preserved committed container"),
            committed_bytes,
            "failed transaction must leave the previously committed VWC intact"
        );
        let remaining_entries = fs::read_dir(&document_dir)
            .expect("read isolated document directory")
            .collect::<Result<Vec<_>, _>>()
            .expect("enumerate isolated document directory");
        assert_eq!(
            remaining_entries.len(),
            1,
            "failed transaction must remove its temporary write file"
        );
        assert_eq!(
            remaining_entries[0].file_name(),
            "last-good.vwc",
            "only the committed container may remain"
        );
    }
}
