// STATUS: DIAMANT VGT SUPREME — Tauri IPC panic containment bridge

use crate::ipc_panic_core;
use serde::Serialize;
use std::panic::{catch_unwind, AssertUnwindSafe};
use tauri::{ipc::InvokeResolver, Runtime};

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub struct SerializableError {
    pub code: &'static str,
    pub message: &'static str,
}

impl From<ipc_panic_core::IpcPanicError> for SerializableError {
    fn from(error: ipc_panic_core::IpcPanicError) -> Self {
        Self {
            code: error.code,
            message: error.message,
        }
    }
}

pub fn catch_dispatch<F>(dispatch: F) -> Result<bool, SerializableError>
where
    F: FnOnce() -> bool,
{
    ipc_panic_core::catch_dispatch(dispatch).map_err(Into::into)
}

pub fn reject_panic<R: Runtime>(resolver: InvokeResolver<R>, error: SerializableError) {
    // A cloned resolver shares Tauri's single-use responder. A command that panics
    // after responding must not trigger a second unwind while we attempt the opaque
    // fallback rejection, so the rejection itself is contained as well.
    let _ = catch_unwind(AssertUnwindSafe(|| resolver.reject(error)));
}
