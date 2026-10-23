//! Beta 0.1 data-integrity guard: one desktop instance per user.
//!
//! The workspace store is authoritative: every running instance autosaves the same document files.
//! Two instances therefore race on the same files (last writer wins) and a stale second window could
//! silently overwrite newer work from the first. This is exactly the "no silent data loss" release
//! priority, so the desktop takes an OS-level named mutex before it touches the workspace. A second
//! launch explains the situation in a native message box and exits; it never becomes a second writer.
//!
//! Scope/limits: implemented for Windows (the Beta platform). A crash releases the kernel mutex
//! automatically (no stale lock file), and a second launch is not forwarded to the first window or
//! used to open a document argument yet — the message tells the user to use the open window. That
//! forwarding is a documented follow-up, not a silent behavior.
#[cfg(windows)]
mod windows_guard {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};

    pub const MUTEX_NAME: &str = "Local\\AstraeaWorkspaceOpenCore.Beta.SingleInstance.v1";
    pub const TITLE: &str = "Astraea Workspace Beta";
    pub const MESSAGE: &str =
        "Astraea Workspace läuft bereits.\nAstraea Workspace is already running.\n\n\
         Bitte das bereits geöffnete Fenster verwenden, damit zwei Fenster nicht gleichzeitig \
         dieselben Dokumente speichern.\nPlease use the window that is already open so that two \
         windows never save the same documents at the same time.";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Returns `true` when this process may run. On a second launch a native message is shown and
    /// `false` is returned; the caller exits without starting the Tauri runtime.
    pub fn acquire() -> bool {
        let name = wide(MUTEX_NAME);
        // Null security attributes = default; the name lives in the current user's session
        // ("Local\\"), so two Windows users do not block each other.
        let handle: *mut c_void = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            // Availability over the guard if the OS cannot create the mutex; the normal file store
            // still uses atomic writes. This path is not expected in a normal desktop session.
            eprintln!("Astraea single-instance guard unavailable; continuing without it");
            return true;
        }
        let already_exists = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
        if already_exists {
            // Automated release smoke: a second launch reports the guard with a deterministic exit
            // code instead of a modal dialog that a headless test cannot dismiss. Production starts
            // never set this variable.
            if std::env::var("ASTRAEA_SINGLE_INSTANCE_PROBE").as_deref() == Ok("1") {
                std::process::exit(42);
            }
            let message = wide(MESSAGE);
            let title = wide(TITLE);
            unsafe {
                MessageBoxW(
                    std::ptr::null_mut(),
                    message.as_ptr(),
                    title.as_ptr(),
                    MB_OK | MB_ICONINFORMATION,
                );
            }
            return false;
        }
        // The handle intentionally lives for the whole process: dropping it would close the mutex
        // and let a second instance start while the first still runs. windows-sys has no RAII here.
        // windows-sys handles are plain pointers: not closing this one keeps the mutex held for the\n        // process lifetime. No RAII wrapper exists here, so the value is kept for the process.\n        let _held_handle = handle;
        true
    }
}

/// True when this process may run; false when another instance already owns the workspace.
#[cfg(windows)]
pub fn acquire_single_instance() -> bool {
    windows_guard::acquire()
}

/// Non-Windows platforms are not part of the Beta release surface; keep the previous behavior and
/// document the gap instead of pretending the guard exists.
#[cfg(not(windows))]
pub fn acquire_single_instance() -> bool {
    true
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    fn mutex_name_is_session_scoped_and_plain() {
        use super::windows_guard::{MESSAGE, MUTEX_NAME, TITLE};
        assert!(MUTEX_NAME.starts_with("Local\\"));
        assert!(!MUTEX_NAME.contains('\0'));
        assert!(MUTEX_NAME.len() < 200);
        assert!(!TITLE.is_empty());
        assert!(MESSAGE.contains("bereits"));
        assert!(MESSAGE.contains("already running"));
    }

    #[test]
    fn non_empty_message_contract() {
        #[cfg(windows)]
        {
            use super::windows_guard::MESSAGE;
            assert!(MESSAGE.len() > 40);
        }
    }
}
