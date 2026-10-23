//! Astraea Workspace authoritative Plugin Runtime Core.
//!
//! Security model:
//! - third-party standard-tier code is importless WASM only;
//! - package/manifest/signature/capability truth lives here, not in the UI;
//! - host APIs are deny-by-default and capability checked at this boundary;
//! - plugin output is always a proposal; authoritative document operations validate before commit.

pub mod api;
pub mod manifest;
pub mod package;
pub mod platform;
pub mod registry;
pub mod wasm;

pub use api::*;
pub use manifest::*;
pub use package::*;
pub use platform::*;
pub use registry::*;
pub use wasm::*;

pub const PLUGIN_MANIFEST_SCHEMA: &str = "vgt.workspace.plugin-manifest/2";
pub const PLUGIN_API_CURRENT: &str = "vgt.workspace.plugin/1";
pub const MAX_PLUGIN_PACKAGE_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_PLUGIN_WASM_BYTES: usize = 4 * 1024 * 1024;
pub const PLUGIN_INITIAL_LINEAR_MEMORY_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_PLUGIN_LINEAR_MEMORY_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_PLUGIN_IO_BYTES: u64 = 4 * 1024 * 1024;
pub const MAX_PLUGIN_EXECUTION_MS: u64 = 5_000;
pub const MAX_PLUGIN_STORAGE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_PLUGIN_CAPABILITIES: usize = 32;
pub const MAX_PLUGIN_ENTRYPOINTS: usize = 16;
pub const MAX_PLUGIN_LOG_ENTRIES: usize = 512;
pub const MAX_INSTALLED_PLUGINS: usize = 256;
pub const MAX_ROLLBACK_SNAPSHOTS: usize = 3;
