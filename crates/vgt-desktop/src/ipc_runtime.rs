// STATUS: PLATIN
//! Lifecycle state for the desktop-owned loopback IPC runtime.

use crate::security_gate_bridge::require_trusted_main_window;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;

#[derive(Clone)]
pub struct IpcServerStatus {
    ready: Arc<AtomicBool>,
}

impl IpcServerStatus {
    pub fn new(ready: Arc<AtomicBool>) -> Self {
        Self { ready }
    }

    fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Acquire)
    }
}

#[tauri::command]
pub fn vgt_ipc_server_status(
    window: tauri::WebviewWindow,
    status: State<'_, IpcServerStatus>,
) -> Result<bool, String> {
    require_trusted_main_window(&window)?;
    Ok(status.is_ready())
}
