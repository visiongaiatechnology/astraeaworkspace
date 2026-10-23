//! Detailed cell-reference semantics used by copy/fill, import and diagnostics.
//! Evaluation may reduce a reference to `CellCoord`, but these adapters preserve
//! absolute/mixed modes so rewriting never guesses from the rendered string.

use crate::types::{CellCoord, FormulaError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct A1Reference {
    pub coord: CellCoord,
    pub absolute_col: bool,
    pub absolute_row: bool,
}

impl A1Reference {
    pub fn parse(input: &str) -> Result<Self, FormulaError> {
        let raw = input.trim().to_uppercase();
        if raw.is_empty() || raw.len() > 16 {
            return Err(FormulaError::RefError);
        }
        let bytes = raw.as_bytes();
        let mut index = 0usize;
        let absolute_col = bytes.get(index) == Some(&b'$');
        if absolute_col {
            index += 1;
        }
        let col_start = index;
        while bytes.get(index).is_some_and(|b| b.is_ascii_alphabetic()) {
            index += 1;
        }
        if index == col_start {
            return Err(FormulaError::RefError);
        }
        let absolute_row = bytes.get(index) == Some(&b'$');
        if absolute_row {
            index += 1;
        }
        let row_start = index;
        while bytes.get(index).is_some_and(|b| b.is_ascii_digit()) {
            index += 1;
        }
        if index == row_start || index != bytes.len() {
            return Err(FormulaError::RefError);
        }
        let coord = CellCoord::parse(&raw)?;
        Ok(Self {
            coord,
            absolute_col,
            absolute_row,
        })
    }

    pub fn to_a1(self) -> String {
        let base = self.coord.to_a1_string();
        let split = base
            .find(|c: char| c.is_ascii_digit())
            .unwrap_or(base.len());
        let (col, row) = base.split_at(split);
        format!(
            "{}{}{}{}",
            if self.absolute_col { "$" } else { "" },
            col,
            if self.absolute_row { "$" } else { "" },
            row
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum R1C1Axis {
    Absolute(i32),
    Relative(i32),
    Current,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct R1C1Reference {
    pub row: R1C1Axis,
    pub col: R1C1Axis,
}

impl R1C1Reference {
    pub fn resolve(self, base: CellCoord) -> Result<A1Reference, FormulaError> {
        fn resolve_axis(
            axis: R1C1Axis,
            current: u32,
            max: u32,
        ) -> Result<(u32, bool), FormulaError> {
            let (value, absolute) = match axis {
                R1C1Axis::Absolute(one_based) => (one_based as i64 - 1, true),
                R1C1Axis::Relative(delta) => (current as i64 + delta as i64, false),
                R1C1Axis::Current => (current as i64, false),
            };
            if value < 0 || value >= max as i64 {
                return Err(FormulaError::RefError);
            }
            Ok((value as u32, absolute))
        }
        let (row, absolute_row) = resolve_axis(self.row, base.row, CellCoord::MAX_ROWS)?;
        let (col, absolute_col) = resolve_axis(self.col, base.col, CellCoord::MAX_COLS)?;
        Ok(A1Reference {
            coord: CellCoord::new(col, row),
            absolute_col,
            absolute_row,
        })
    }
}
