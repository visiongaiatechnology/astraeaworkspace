// 💠 DIAMANT VGT SUPREME STATUS
use super::AppState;
use base64::{engine::general_purpose::STANDARD,Engine};
use ed25519_dalek::{Signature,Verifier,VerifyingKey};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::time::{SystemTime,UNIX_EPOCH};
use tauri::{AppHandle,Manager,State,WebviewWindow};

const MAX_SIGNAL_LIFETIME_MS:u64=15*60*1000;const MAX_CLOCK_SKEW_MS:u64=5*60*1000;
#[derive(Debug,Deserialize)]#[serde(deny_unknown_fields)]pub struct RemoteWipeRequest{pub schema:String,pub device_id:String,pub issued_at_ms:u64,pub expires_at_ms:u64,pub nonce:String,pub reason_code:String,pub signature_base64:String}
#[derive(Debug,Serialize)]pub struct RemoteWipeResponse{pub wiped:bool,pub signal_sha256:String}
fn signing_bytes(r:&RemoteWipeRequest)->Vec<u8>{format!("VGT/REMOTE-WIPE/1\0{}\0{}\0{}\0{}\0{}",r.device_id,r.issued_at_ms,r.expires_at_ms,r.nonce,r.reason_code).into_bytes()}
fn verify(r:&RemoteWipeRequest)->Result<Vec<u8>,String>{if r.schema!="vgt.admin.remote-wipe/1"||r.device_id.is_empty()||r.device_id.len()>128||r.nonce.len()<16||r.nonce.len()>128||!r.nonce.bytes().all(|b|b.is_ascii_alphanumeric()||matches!(b,b'-'|b'_'))||r.reason_code.is_empty()||r.reason_code.len()>96{return Err("REMOTE_WIPE_REJECTED".into());}let expected=std::env::var("VGT_DEVICE_ID").map_err(|_|"REMOTE_WIPE_UNCONFIGURED")?;if r.device_id!=expected{return Err("REMOTE_WIPE_REJECTED".into());}let now=SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_|"REMOTE_WIPE_REJECTED")?.as_millis() as u64;if r.expires_at_ms<=r.issued_at_ms||r.expires_at_ms-r.issued_at_ms>MAX_SIGNAL_LIFETIME_MS||now.saturating_add(MAX_CLOCK_SKEW_MS)<r.issued_at_ms||now>r.expires_at_ms{return Err("REMOTE_WIPE_REJECTED".into());}let root=STANDARD.decode(std::env::var("VGT_ENTERPRISE_REMOTE_WIPE_ROOT_ED25519_B64").map_err(|_|"REMOTE_WIPE_UNCONFIGURED")?).map_err(|_|"REMOTE_WIPE_UNCONFIGURED")?;let key=VerifyingKey::from_bytes(root.as_slice().try_into().map_err(|_|"REMOTE_WIPE_UNCONFIGURED")?).map_err(|_|"REMOTE_WIPE_UNCONFIGURED")?;let sig=STANDARD.decode(&r.signature_base64).map_err(|_|"REMOTE_WIPE_REJECTED")?;let signature=Signature::from_slice(&sig).map_err(|_|"REMOTE_WIPE_REJECTED")?;let message=signing_bytes(r);key.verify(&message,&signature).map_err(|_|"REMOTE_WIPE_REJECTED")?;Ok(message)}
fn remove_dir_if_present(path:std::path::PathBuf)->Result<(),String>{if path.exists(){std::fs::remove_dir_all(path).map_err(|_|"REMOTE_WIPE_CACHE_FAILED")?;}Ok(())}
#[tauri::command]pub fn vgt_remote_wipe(app:AppHandle,window:WebviewWindow,state:State<'_,AppState>,request:RemoteWipeRequest)->Result<RemoteWipeResponse,String>{super::require_trusted_main_window(&window)?;let signed=verify(&request)?;{let mut vault=state.vault.lock().map_err(|_|"REMOTE_WIPE_STATE_LOCK")?;vault.cryptographic_wipe().map_err(|_|"REMOTE_WIPE_KEY_PURGE_FAILED")?;}state.opened_files.lock().map_err(|_|"REMOTE_WIPE_STATE_LOCK")?.clear();state.deep_links.lock().map_err(|_|"REMOTE_WIPE_STATE_LOCK")?.clear();if let Ok(cache)=app.path().app_cache_dir(){remove_dir_if_present(cache)?;}let digest=Sha256::digest(&signed);Ok(RemoteWipeResponse{wiped:true,signal_sha256:hex::encode(digest)})}
