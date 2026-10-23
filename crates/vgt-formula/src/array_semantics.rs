//! Shared dynamic-array and legacy implicit-intersection semantics.

use crate::limits::FormulaLimits;
use crate::types::{CellCoord, ComputedValue, FormulaError};

pub fn bounded_array(rows: Vec<Vec<ComputedValue>>) -> Result<ComputedValue, FormulaError> {
    let row_count = rows.len();
    let col_count = rows.iter().map(Vec::len).max().unwrap_or(0);
    if row_count.saturating_mul(col_count) > FormulaLimits::DEFAULT.max_array_cells {
        return Err(FormulaError::ResourceLimit("array_cells".into()));
    }
    if rows.iter().any(|row| row.len() != col_count) {
        return Err(FormulaError::ValueError("ragged_array".into()));
    }
    Ok(ComputedValue::Array(rows))
}

/// Legacy implicit intersection is explicit and deterministic: for a rectangular
/// range, prefer the current row when the range is one column, current column when
/// one row, otherwise the top-left value. Modern dynamic-array mode should not call it.
pub fn implicit_intersection(
    matrix: &[Vec<ComputedValue>],
    origin: CellCoord,
    current: CellCoord,
) -> ComputedValue {
    if matrix.is_empty() || matrix[0].is_empty() {
        return ComputedValue::Empty;
    }
    if matrix[0].len() == 1 {
        let row = current.row.saturating_sub(origin.row) as usize;
        return matrix
            .get(row)
            .and_then(|r| r.first())
            .cloned()
            .unwrap_or_else(|| matrix[0][0].clone());
    }
    if matrix.len() == 1 {
        let col = current.col.saturating_sub(origin.col) as usize;
        return matrix[0]
            .get(col)
            .cloned()
            .unwrap_or_else(|| matrix[0][0].clone());
    }
    matrix[0][0].clone()
}
