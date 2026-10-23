//! Bounded function-family extensions missing from the legacy corpus.

use crate::array_semantics::bounded_array;
use crate::functions::{matches_criteria, EngineContext};
use crate::limits::FormulaLimits;
use crate::types::{ComputedValue, Expr, FormulaError};

fn arg_number(args: &[Expr], index: usize, ctx: &dyn EngineContext) -> Result<f64, FormulaError> {
    args.get(index)
        .ok_or_else(|| FormulaError::ValueError("missing_argument".into()))
        .and_then(|expr| ctx.eval_expr(expr).as_number())
}

pub fn eval_transpose(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() != 1 {
        return ComputedValue::Error(FormulaError::ValueError(
            "TRANSPOSE requires 1 argument".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let cols = matrix[0].len();
    if matrix.iter().any(|row| row.len() != cols) {
        return ComputedValue::Error(FormulaError::ValueError("ragged_array".into()));
    }
    if matrix.len().saturating_mul(cols) > FormulaLimits::DEFAULT.max_array_cells {
        return ComputedValue::Error(FormulaError::ResourceLimit("array_cells".into()));
    }
    let mut out = vec![Vec::with_capacity(matrix.len()); cols];
    for c in 0..cols {
        for row in &matrix {
            out[c].push(row[c].clone());
        }
    }
    ComputedValue::Array(out)
}

pub fn eval_mmult(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() != 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "MMULT requires 2 arguments".into(),
        ));
    }
    let left = ctx.eval_to_matrix(&args[0]);
    let right = ctx.eval_to_matrix(&args[1]);
    if left.is_empty() || right.is_empty() || left[0].is_empty() || right[0].is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("MMULT empty matrix".into()));
    }
    let inner = left[0].len();
    if left.iter().any(|r| r.len() != inner)
        || right.iter().any(|r| r.len() != right[0].len())
        || right.len() != inner
    {
        return ComputedValue::Error(FormulaError::ValueError("MMULT dimension mismatch".into()));
    }
    let out_cells = left.len().saturating_mul(right[0].len());
    let operations = out_cells.saturating_mul(inner);
    if out_cells > FormulaLimits::DEFAULT.max_array_cells
        || operations > FormulaLimits::DEFAULT.max_evaluation_steps as usize
    {
        return ComputedValue::Error(FormulaError::ResourceLimit("matrix_operations".into()));
    }
    let mut out = vec![vec![ComputedValue::Number(0.0); right[0].len()]; left.len()];
    for r in 0..left.len() {
        for c in 0..right[0].len() {
            let mut sum = 0.0;
            for k in 0..inner {
                let a = match left[r][k].as_number() {
                    Ok(v) => v,
                    Err(e) => return ComputedValue::Error(e),
                };
                let b = match right[k][c].as_number() {
                    Ok(v) => v,
                    Err(e) => return ComputedValue::Error(e),
                };
                sum += a * b;
            }
            out[r][c] = ComputedValue::Number(sum);
        }
    }
    bounded_array(out).unwrap_or_else(ComputedValue::Error)
}

pub fn eval_dec2hex(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let value = match arg_number(args, 0, ctx) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    if !(-549_755_813_888..=549_755_813_887).contains(&value) {
        return ComputedValue::Error(FormulaError::NumError("DEC2HEX range".into()));
    }
    ComputedValue::String(format!("{:X}", value))
}

pub fn eval_hex2dec(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() != 1 {
        return ComputedValue::Error(FormulaError::ValueError(
            "HEX2DEC requires 1 argument".into(),
        ));
    }
    let raw = ctx.eval_expr(&args[0]).as_string();
    if raw.is_empty() || raw.len() > 10 || !raw.chars().all(|c| c.is_ascii_hexdigit()) {
        return ComputedValue::Error(FormulaError::NumError("HEX2DEC input".into()));
    }
    match i64::from_str_radix(&raw, 16) {
        Ok(v) => ComputedValue::Number(v as f64),
        Err(_) => ComputedValue::Error(FormulaError::NumError("HEX2DEC input".into())),
    }
}

pub fn eval_convert(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() != 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "CONVERT requires 3 arguments".into(),
        ));
    }
    let value = match arg_number(args, 0, ctx) {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let from = ctx.eval_expr(&args[1]).as_string().to_ascii_lowercase();
    let to = ctx.eval_expr(&args[2]).as_string().to_ascii_lowercase();
    fn factor(unit: &str) -> Option<(&'static str, f64)> {
        match unit {
            "m" => Some(("length", 1.0)),
            "km" => Some(("length", 1000.0)),
            "cm" => Some(("length", 0.01)),
            "mm" => Some(("length", 0.001)),
            "in" => Some(("length", 0.0254)),
            "ft" => Some(("length", 0.3048)),
            "yd" => Some(("length", 0.9144)),
            "mi" => Some(("length", 1609.344)),
            "g" => Some(("mass", 1.0)),
            "kg" => Some(("mass", 1000.0)),
            "lbm" => Some(("mass", 453.59237)),
            "s" => Some(("time", 1.0)),
            "min" => Some(("time", 60.0)),
            "hr" => Some(("time", 3600.0)),
            "day" => Some(("time", 86400.0)),
            _ => None,
        }
    }
    match (factor(&from), factor(&to)) {
        (Some((a, fa)), Some((b, fb))) if a == b => ComputedValue::Number(value * fa / fb),
        _ => ComputedValue::Error(FormulaError::NAError),
    }
}

fn resolve_field(
    database: &[Vec<ComputedValue>],
    field: &ComputedValue,
) -> Result<usize, FormulaError> {
    let headers = database
        .first()
        .ok_or_else(|| FormulaError::ValueError("database has no header".into()))?;
    if let Ok(n) = field.as_number() {
        let index = n.trunc() as isize - 1;
        if index >= 0 && (index as usize) < headers.len() {
            return Ok(index as usize);
        }
    }
    let wanted = field.as_string().to_ascii_uppercase();
    headers
        .iter()
        .position(|v| v.as_string().to_ascii_uppercase() == wanted)
        .ok_or(FormulaError::RefError)
}

fn criteria_match(
    database: &[Vec<ComputedValue>],
    row: &[ComputedValue],
    criteria: &[Vec<ComputedValue>],
) -> bool {
    if criteria.len() < 2 || criteria[0].is_empty() {
        return true;
    }
    criteria.iter().skip(1).any(|criteria_row| {
        criteria[0].iter().enumerate().all(|(ci, header)| {
            let wanted = criteria_row
                .get(ci)
                .cloned()
                .unwrap_or(ComputedValue::Empty);
            if wanted.is_empty() {
                return true;
            }
            let header_name = header.as_string().to_ascii_uppercase();
            let Some(db_col) = database[0]
                .iter()
                .position(|v| v.as_string().to_ascii_uppercase() == header_name)
            else {
                return false;
            };
            row.get(db_col)
                .is_some_and(|value| matches_criteria(value, &wanted))
        })
    })
}

pub fn eval_dsum(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() != 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "DSUM requires database, field, criteria".into(),
        ));
    }
    let database = ctx.eval_to_matrix(&args[0]);
    let criteria = ctx.eval_to_matrix(&args[2]);
    if database
        .len()
        .saturating_mul(database.first().map(Vec::len).unwrap_or(0))
        > FormulaLimits::DEFAULT.max_array_cells
    {
        return ComputedValue::Error(FormulaError::ResourceLimit("database_cells".into()));
    }
    let field_value = ctx.eval_expr(&args[1]);
    let field = match resolve_field(&database, &field_value) {
        Ok(i) => i,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut sum = 0.0;
    for row in database.iter().skip(1) {
        if criteria_match(&database, row, &criteria) {
            if let Some(value) = row.get(field) {
                if let Ok(n) = value.as_number() {
                    sum += n;
                }
            }
        }
    }
    ComputedValue::Number(sum)
}

pub fn eval_dcount(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() != 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "DCOUNT requires database, field, criteria".into(),
        ));
    }
    let database = ctx.eval_to_matrix(&args[0]);
    let criteria = ctx.eval_to_matrix(&args[2]);
    let field_value = ctx.eval_expr(&args[1]);
    let field = match resolve_field(&database, &field_value) {
        Ok(i) => i,
        Err(e) => return ComputedValue::Error(e),
    };
    let count = database
        .iter()
        .skip(1)
        .filter(|row| criteria_match(&database, row, &criteria))
        .filter(|row| row.get(field).is_some_and(ComputedValue::is_number))
        .count();
    ComputedValue::Number(count as f64)
}
