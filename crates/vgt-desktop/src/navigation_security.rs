// STATUS: DIAMANT VGT SUPREME — fail-closed Workspace webview navigation policy.

pub fn allow_workspace_navigation_url(raw: &str, allow_dev_server: bool) -> bool {
    let Ok(url) = url::Url::parse(raw) else {
        return false;
    };
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" if url.host_str() == Some("tauri.localhost") => true,
        "http" if allow_dev_server => {
            matches!(
                url.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("::1")
            ) && url.port_or_known_default() == Some(5173)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec065_external_navigation_is_denied() {
        assert!(allow_workspace_navigation_url(
            "tauri://localhost/index.html",
            false
        ));
        assert!(allow_workspace_navigation_url(
            "http://tauri.localhost/index.html",
            false
        ));
        assert!(!allow_workspace_navigation_url("https://google.com", false));
        assert!(!allow_workspace_navigation_url(
            "javascript:alert(1)",
            false
        ));
        assert!(!allow_workspace_navigation_url("file:///etc/passwd", false));
    }

    #[test]
    fn sec065_dev_navigation_is_exact_loopback_port_only() {
        assert!(allow_workspace_navigation_url(
            "http://localhost:5173/",
            true
        ));
        assert!(allow_workspace_navigation_url(
            "http://127.0.0.1:5173/",
            true
        ));
        assert!(!allow_workspace_navigation_url(
            "http://localhost:5174/",
            true
        ));
        assert!(!allow_workspace_navigation_url(
            "https://localhost:5173/",
            true
        ));
        assert!(!allow_workspace_navigation_url(
            "http://evil.localhost:5173/",
            true
        ));
    }
}
