//! Formula runtime limits and cancellation/resource policy.

use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy)]
pub struct FormulaLimits {
    pub max_formula_bytes: usize,
    pub max_tokens: usize,
    pub max_parse_depth: usize,
    pub max_reference_cells: usize,
    pub max_array_cells: usize,
    pub max_evaluation_steps: u64,
    pub max_evaluation_time: Duration,
}

/// Die größte Spanne, die die Serien-Datumsrechnung darstellen kann (Serie 1 bis 2 958 465, Jahr 9999).
///
/// Sie wird von `serial_to_date` bereits geprüft; hier steht sie **einmal** benannt, damit die
/// WORKDAY-Schleife dieselbe Grenze benutzt statt einer zweiten Zahl.
pub const MAX_SERIAL_DATE_DAYS: i64 = 2_958_465;

/// Obergrenze für die Schrittweite von `WORKDAY`: mehr Schritte als die darstellbare Spanne kann kein
/// Ergebnis liefern, und eine unbegrenzte Schleife ist eine Rechenfalle.
pub const MAX_WORKDAY_STEP_DAYS: i64 = MAX_SERIAL_DATE_DAYS;

impl FormulaLimits {
    pub const DEFAULT: Self = Self {
        max_formula_bytes: 16 * 1024,
        max_tokens: 8_192,
        max_parse_depth: 128,
        max_reference_cells: 50_000,
        max_array_cells: 50_000,
        max_evaluation_steps: 250_000,
        max_evaluation_time: Duration::from_millis(250),
    };
}

#[derive(Debug)]
pub struct EvaluationBudget {
    started: Instant,
    steps: u64,
    cancelled: bool,
    limits: FormulaLimits,
}

impl EvaluationBudget {
    pub fn new(limits: FormulaLimits) -> Self {
        Self {
            started: Instant::now(),
            steps: 0,
            cancelled: false,
            limits,
        }
    }

    pub fn reset(&mut self) {
        self.started = Instant::now();
        self.steps = 0;
        self.cancelled = false;
    }

    pub fn cancel(&mut self) {
        self.cancelled = true;
    }

    pub fn step(&mut self) -> bool {
        if self.cancelled {
            return false;
        }
        self.steps = self.steps.saturating_add(1);
        self.steps <= self.limits.max_evaluation_steps
            && self.started.elapsed() <= self.limits.max_evaluation_time
    }

    pub fn steps(&self) -> u64 {
        self.steps
    }
}
