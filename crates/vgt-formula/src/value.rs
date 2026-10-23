//! Public typed formula-value contract. The hot evaluator keeps Excel-compatible
//! numeric serials internally, while this transport type prevents callers from
//! accidentally treating dates/times/references as untyped JavaScript numbers.

use crate::types::{CellCoord, ComputedValue, FormulaError};

#[derive(Debug, Clone, PartialEq)]
pub enum FormulaValue {
    Blank,
    Number(f64),
    Decimal(String),
    DateSerial(f64),
    TimeSerial(f64),
    Text(String),
    Boolean(bool),
    Error(FormulaError),
    Array(Vec<Vec<FormulaValue>>),
    Reference(CellCoord),
}

impl FormulaValue {
    pub fn from_computed(value: ComputedValue) -> Self {
        match value {
            ComputedValue::Empty => Self::Blank,
            ComputedValue::Number(n) => Self::Number(n),
            ComputedValue::String(s) => Self::Text(s),
            ComputedValue::Boolean(v) => Self::Boolean(v),
            ComputedValue::Error(e) => Self::Error(e),
            ComputedValue::Array(rows) => Self::Array(
                rows.into_iter()
                    .map(|row| row.into_iter().map(Self::from_computed).collect())
                    .collect(),
            ),
        }
    }
}
