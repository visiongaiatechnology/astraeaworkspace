//! # VGT Workspace CLI - Sovereign Productivity Platform Demonstrator & Security Auditor
//!
//! Provides automated verification, end-to-end POC execution, and security checks
//! according to VGT Workspace Masterplan & Doktrin.

mod audit;
pub mod base64;
mod bench;
pub mod ipc_auth;
mod poc;
pub mod server;

use std::env;

use audit::run_security_audit;
use bench::run_benchmarks;
use poc::run_full_poc;
use server::run_ipc_server;

fn main() {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(|s| s.as_str()).unwrap_or("poc");

    println!("================================================================================");
    println!("  VISION GAIA TECHNOLOGY (VGT) WORKSPACE CORE PLATFORM");
    println!("  Doctrine: Sovereign Productivity. Local by Default. Encrypted Native Containers.");
    println!("  Release channel: architecture / functional release candidate");
    println!("================================================================================\n");

    match command {
        "poc" => run_full_poc(),
        "security-audit" | "security" | "audit" => run_security_audit(),
        "benchmark" | "bench" => run_benchmarks(),
        "serve" | "server" | "daemon" => {
            let port = args.get(2).and_then(|p| p.parse().ok()).unwrap_or(5042);
            println!(
                "[VGT IPC Core] Launching Sovereign Desktop IPC Server on port {}...",
                port
            );
            if let Err(e) = run_ipc_server(port, None) {
                eprintln!("IPC Server error: {}", e);
            }
        }
        "help" | "--help" | "-h" => {
            println!("Usage:");
            println!(
                "  vgt-cli serve [port]     Run local loopback IPC daemon (default port 5042)"
            );
            println!("  vgt-cli poc              Run complete 10-step platform proof-of-concept");
            println!(
                "  vgt-cli security-audit   Run full adversarial security checks & test suite"
            );
            println!(
                "  vgt-cli benchmark        Run encryption & calculation throughput benchmarks"
            );
        }
        unknown => {
            println!(
                "Unknown command: '{}'. Defaulting to full POC demonstration...\n",
                unknown
            );
            run_full_poc();
        }
    }
}
