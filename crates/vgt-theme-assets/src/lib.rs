// 💠 DIAMANT VGT SUPREME STATUS
//! Astraea authoritative Theme, Template & Asset metadata core.
//! Media bytes are never fetched or decoded here; vgt Media Engine remains the ingestion truth.
pub mod assets;pub mod brand;pub mod export;pub mod templates;pub mod tokens;
pub use assets::*;pub use brand::*;pub use export::*;pub use templates::*;pub use tokens::*;
use thiserror::Error;
pub const MAX_TEMPLATE_DOCUMENT_BYTES:usize=32*1024*1024;pub const MAX_TEMPLATE_OBJECTS:usize=100_000;
pub trait ThemeCancellationCheck{fn cancelled(&self)->bool;}pub struct NeverCancel;impl ThemeCancellationCheck for NeverCancel{fn cancelled(&self)->bool{false}}
#[derive(Error,Debug,PartialEq)]pub enum ThemeError{#[error("invalid theme/template data: {0}")]Invalid(String),#[error("theme/template boundary exceeded: {0}")]Bounds(String),#[error("third-party template contains active content")]ActiveTemplateContent,#[error("theme/template operation cancelled")]Cancelled}
