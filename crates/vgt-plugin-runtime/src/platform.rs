use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum HostPlatform {
    Windows,
    Linux,
    Macos,
    AstraeaOs,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlatformRuntimeContract {
    pub platform: HostPlatform,
    pub standard_tier_importless_wasm: bool,
    pub ambient_filesystem: bool,
    pub ambient_network: bool,
    pub ambient_clipboard: bool,
    pub raw_key_access: bool,
    pub arbitrary_native_library_loading: bool,
    pub network_requires_netgate: bool,
}

impl PlatformRuntimeContract {
    pub fn for_platform(platform: HostPlatform) -> Self {
        Self {
            platform,
            standard_tier_importless_wasm: true,
            ambient_filesystem: false,
            ambient_network: false,
            ambient_clipboard: false,
            raw_key_access: false,
            arbitrary_native_library_loading: false,
            network_requires_netgate: true,
        }
    }
    pub fn all_supported() -> [Self; 4] {
        [
            HostPlatform::Windows,
            HostPlatform::Linux,
            HostPlatform::Macos,
            HostPlatform::AstraeaOs,
        ]
        .map(Self::for_platform)
    }
}

/// Native process sandboxes are intentionally outside the standard tier. If introduced, all OS
/// differences must remain behind this adapter and must preserve the same deny-by-default contract.
pub trait ProcessSandboxAdapter {
    fn platform(&self) -> HostPlatform;
    fn supports_strong_isolation(&self) -> bool;
}
