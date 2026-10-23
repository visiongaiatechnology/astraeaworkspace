// STATUS: DIAMANT VGT SUPREME — pure IPC request contracts shared with native handlers.
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShellWindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShellOpenWindowRequest {
    pub document_id: Option<String>,
    pub start_center: bool,
    pub window_state: Option<ShellWindowState>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sec062_shell_request_rejects_unknown_fields_and_wrong_types() {
        assert!(serde_json::from_value::<ShellOpenWindowRequest>(json!({
            "document_id": null,
            "start_center": true,
            "window_state": null
        }))
        .is_ok());
        assert!(serde_json::from_value::<ShellOpenWindowRequest>(json!({
            "document_id": null,
            "start_center": true,
            "window_state": null,
            "cmd": "calc.exe"
        }))
        .is_err());
        assert!(serde_json::from_value::<ShellOpenWindowRequest>(json!({
            "document_id": null,
            "start_center": "true",
            "window_state": null
        }))
        .is_err());
    }
}
