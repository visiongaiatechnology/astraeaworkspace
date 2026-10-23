use crate::{AutomationRuntimeError, MAX_CONCURRENCY, MAX_QUEUED_RUNS};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum QueueKind {
    Manual,
    Event,
    Schedule,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DeliverySemantics {
    AtLeastOnce,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MissedSchedulePolicy {
    Skip,
    RunOnce,
    CatchUpBounded,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SchedulePolicy {
    pub missed: MissedSchedulePolicy,
    pub max_catch_up: u16,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct QueuedRun {
    pub run_id: String,
    pub flow_id: String,
    pub flow_version: u64,
    pub queue: QueueKind,
    pub priority: i16,
    pub enqueued_at_ms: u64,
    pub idempotency_key: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SchedulerConfig {
    pub max_concurrency: u16,
    pub semantics: DeliverySemantics,
}

pub struct Scheduler {
    config: SchedulerConfig,
    queues: BTreeMap<QueueKind, VecDeque<QueuedRun>>,
    cancelled: std::collections::BTreeSet<String>,
}
impl Scheduler {
    pub fn new(config: SchedulerConfig) -> Result<Self, AutomationRuntimeError> {
        if config.max_concurrency == 0 || config.max_concurrency > MAX_CONCURRENCY {
            return Err(AutomationRuntimeError::LimitExceeded);
        }
        Ok(Self {
            config,
            queues: BTreeMap::new(),
            cancelled: Default::default(),
        })
    }
    pub fn enqueue(&mut self, run: QueuedRun) -> Result<(), AutomationRuntimeError> {
        if self.len() >= MAX_QUEUED_RUNS
            || !valid_id(&run.run_id)
            || !valid_id(&run.flow_id)
            || run.flow_version == 0
            || run
                .idempotency_key
                .as_deref()
                .is_some_and(|v| !valid_key(v))
        {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        self.queues.entry(run.queue).or_default().push_back(run);
        Ok(())
    }
    pub fn cancel(&mut self, run_id: &str) -> Result<(), AutomationRuntimeError> {
        if !valid_id(run_id) {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        self.cancelled.insert(run_id.to_string());
        Ok(())
    }
    pub fn dequeue_next(&mut self) -> Option<QueuedRun> {
        let mut best: Option<(QueueKind, usize, i16, u64)> = None;
        for (kind, queue) in &self.queues {
            for (idx, run) in queue.iter().enumerate() {
                if self.cancelled.contains(&run.run_id) {
                    continue;
                }
                let candidate = (*kind, idx, run.priority, run.enqueued_at_ms);
                if best
                    .as_ref()
                    .is_none_or(|b| candidate.2 > b.2 || candidate.2 == b.2 && candidate.3 < b.3)
                {
                    best = Some(candidate);
                }
            }
        }
        let (kind, idx, _, _) = best?;
        self.queues.get_mut(&kind)?.remove(idx)
    }
    pub fn len(&self) -> usize {
        self.queues.values().map(VecDeque::len).sum()
    }
    pub fn is_empty(&self) -> bool {
        self.queues.values().all(VecDeque::is_empty)
    }
    pub fn max_concurrency(&self) -> u16 {
        self.config.max_concurrency
    }
}

pub fn missed_schedule_runs(
    policy: &SchedulePolicy,
    missed_occurrences: u32,
) -> Result<u16, AutomationRuntimeError> {
    if policy.max_catch_up > 1024 {
        return Err(AutomationRuntimeError::LimitExceeded);
    }
    Ok(match policy.missed {
        MissedSchedulePolicy::Skip => 0,
        MissedSchedulePolicy::RunOnce => u16::from(missed_occurrences > 0),
        MissedSchedulePolicy::CatchUpBounded => {
            missed_occurrences.min(policy.max_catch_up as u32) as u16
        }
    })
}
fn valid_id(v: &str) -> bool {
    (1..=128).contains(&v.len())
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}
fn valid_key(v: &str) -> bool {
    (4..=256).contains(&v.len())
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dequeue_next_updates_queue_emptiness_and_length() {
        let mut scheduler = Scheduler::new(SchedulerConfig {
            max_concurrency: 1,
            semantics: DeliverySemantics::AtLeastOnce,
        })
        .expect("valid scheduler configuration");
        let run = QueuedRun {
            run_id: "run-1".into(),
            flow_id: "flow-1".into(),
            flow_version: 1,
            queue: QueueKind::Manual,
            priority: 0,
            enqueued_at_ms: 1,
            idempotency_key: None,
        };

        assert!(scheduler.is_empty());
        scheduler.enqueue(run.clone()).expect("valid queued run");
        assert!(!scheduler.is_empty());
        assert_eq!(scheduler.len(), 1);
        assert_eq!(scheduler.dequeue_next(), Some(run));
        assert!(scheduler.is_empty());
        assert_eq!(scheduler.len(), 0);
    }
}
