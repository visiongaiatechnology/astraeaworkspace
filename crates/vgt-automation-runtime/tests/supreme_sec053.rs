use vgt_automation_runtime::{RunLimits, MAX_CPU_MS, MAX_RUN_MS};

#[test]
fn default_execution_deadline_is_five_seconds() {
    let limits = RunLimits::default();
    assert_eq!(limits.wall_ms, 5_000);
    assert_eq!(limits.cpu_ms, 5_000);
    assert!(limits.validate().is_ok());
    assert!(MAX_RUN_MS >= limits.wall_ms);
    assert!(MAX_CPU_MS >= limits.cpu_ms);
}
