//! # VGT Formula Engine Types
//! Core coordinate representations, AST expressions, and computed values.

use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq)]
pub enum FormulaError {
    #[error("Syntax error: {0}")]
    SyntaxError(String),

    #[error("Parse error at byte {offset}: {message}")]
    ParseError { message: String, offset: usize },

    #[error("Calculation resource limit exceeded: {0}")]
    ResourceLimit(String),

    #[error("Null error (#NULL!)")]
    Null,

    #[error("Division by zero (#DIV/0!)")]
    DivisionByZero,

    #[error("Value error (#VALUE!): {0}")]
    ValueError(String),

    #[error("Reference error (#REF!)")]
    RefError,

    #[error("Circular dependency detected (#CIRCULAR!): {0}")]
    CircularDependency(String),

    #[error("Unknown function: {0}")]
    UnknownFunction(String),

    #[error("Name error (#NAME?): {0}")]
    NameError(String),

    #[error("Number error (#NUM!): {0}")]
    NumError(String),

    #[error("Value not available (#N/A)")]
    NAError,

    #[error("Spill error (#SPILL!): {0}")]
    SpillError(String),
}

impl FormulaError {
    pub fn excel_code(&self) -> &'static str {
        match self {
            FormulaError::Null => "#NULL!",
            FormulaError::DivisionByZero => "#DIV/0!",
            FormulaError::ValueError(_) => "#VALUE!",
            FormulaError::RefError => "#REF!",
            FormulaError::CircularDependency(_) => "#CIRCULAR!",
            FormulaError::UnknownFunction(_) => "#NAME?",
            FormulaError::NameError(_) => "#NAME?",
            FormulaError::NumError(_) => "#NUM!",
            FormulaError::NAError => "#N/A",
            FormulaError::SpillError(_) => "#SPILL!",
            FormulaError::SyntaxError(_) | FormulaError::ParseError { .. } => "#ERROR!",
            FormulaError::ResourceLimit(_) => "#CALC!",
        }
    }

    pub fn error_type_code(&self) -> u32 {
        match self {
            FormulaError::Null => 1,
            FormulaError::DivisionByZero => 2,
            FormulaError::ValueError(_) => 3,
            FormulaError::RefError => 4,
            FormulaError::NameError(_) | FormulaError::UnknownFunction(_) => 5,
            FormulaError::NumError(_) => 6,
            FormulaError::NAError => 7,
            FormulaError::SpillError(_) => 9,
            _ => 3,
        }
    }
}

/// 2D Zero-indexed cell coordinate: (col, row). (0, 0) is "A1".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub struct CellCoord {
    pub col: u32,
    pub row: u32,
}

impl CellCoord {
    pub const MAX_COLS: u32 = 16_384;
    pub const MAX_ROWS: u32 = 1_048_576;

    pub fn new(col: u32, row: u32) -> Self {
        Self { col, row }
    }

    pub fn is_valid(&self) -> bool {
        self.col < Self::MAX_COLS && self.row < Self::MAX_ROWS
    }

    /// Parse an Excel-style coordinate string like "A1", "C25", "AA5", "XFD1048576"
    pub fn parse(s: &str) -> Result<Self, FormulaError> {
        let s = s.trim().to_uppercase();
        let mut col_str = String::new();
        let mut row_str = String::new();

        for ch in s.chars() {
            if ch == '$' {
                continue; // Ignore absolute markers for coordinate resolution
            }
            if ch.is_ascii_alphabetic() {
                if !row_str.is_empty() {
                    return Err(FormulaError::RefError);
                }
                col_str.push(ch);
            } else if ch.is_ascii_digit() {
                row_str.push(ch);
            } else {
                return Err(FormulaError::RefError);
            }
        }

        if col_str.is_empty() || row_str.is_empty() {
            return Err(FormulaError::RefError);
        }

        let mut col: u32 = 0;
        for ch in col_str.chars() {
            col = col
                .checked_mul(26)
                .and_then(|c| c.checked_add(ch as u32 - 'A' as u32 + 1))
                .ok_or(FormulaError::RefError)?;
        }
        col = col.checked_sub(1).ok_or(FormulaError::RefError)?; // 0-indexed

        if col >= Self::MAX_COLS {
            return Err(FormulaError::RefError);
        }

        let row_num: u32 = row_str.parse::<u32>().map_err(|_| FormulaError::RefError)?;

        if row_num == 0 || row_num > Self::MAX_ROWS {
            return Err(FormulaError::RefError);
        }

        let row = row_num - 1;

        Ok(CellCoord { col, row })
    }

    /// Format to Excel-style coordinate e.g. "A1", "XFD1048576"
    pub fn to_a1_string(&self) -> String {
        let mut col = self.col + 1;
        let mut col_str = String::new();
        while col > 0 {
            let rem = ((col - 1) % 26) as u8;
            col_str.insert(0, (b'A' + rem) as char);
            col = (col - 1) / 26;
        }
        format!("{}{}", col_str, self.row + 1)
    }
}

/// Token types for formula lexer
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Number(f64),
    StringLiteral(String),
    Boolean(bool),
    CellRef(CellCoord),
    RangeRef(CellCoord, CellCoord),
    QualifiedCellRef(String, CellCoord),
    QualifiedRangeRef(String, CellCoord, CellCoord),
    StructuredRef(String),
    Ident(String),
    Plus,
    Minus,
    Multiply,
    Divide,
    Power,
    Ampersand,
    Equal,
    NotEqual,
    LessThan,
    GreaterThan,
    LessEqual,
    GreaterEqual,
    LeftParen,
    RightParen,
    Comma,
}

/// Abstract Syntax Tree (AST) for parsed formulas
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Number(f64),
    StringLiteral(String),
    Boolean(bool),
    CellRef(CellCoord),
    RangeRef(CellCoord, CellCoord),
    QualifiedCellRef {
        sheet: String,
        coord: CellCoord,
    },
    QualifiedRangeRef {
        sheet: String,
        start: CellCoord,
        end: CellCoord,
    },
    StructuredRef(String),
    NameRef(String),
    BinaryOp {
        op: BinaryOpKind,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    UnaryNeg(Box<Expr>),
    FunctionCall {
        name: String,
        args: Vec<Expr>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryOpKind {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Concat,
    Eq,
    Neq,
    Lt,
    Gt,
    Lte,
    Gte,
}

/// Evaluated value in spreadsheet
#[derive(Debug, Clone, PartialEq)]
pub enum ComputedValue {
    Empty,
    Number(f64),
    String(String),
    Boolean(bool),
    Array(Vec<Vec<ComputedValue>>),
    Error(FormulaError),
}

impl ComputedValue {
    pub fn as_number(&self) -> Result<f64, FormulaError> {
        match self {
            ComputedValue::Number(n) => Ok(*n),
            ComputedValue::Boolean(b) => Ok(if *b { 1.0 } else { 0.0 }),
            ComputedValue::Empty => Ok(0.0),
            ComputedValue::String(s) => {
                let s_trim = s.trim();
                if s_trim.is_empty() {
                    Ok(0.0)
                } else {
                    s_trim.parse::<f64>().map_err(|_| {
                        FormulaError::ValueError(format!("Cannot cast '{}' to number", s))
                    })
                }
            }
            ComputedValue::Array(arr) => {
                if arr.is_empty() || arr[0].is_empty() {
                    Ok(0.0)
                } else {
                    arr[0][0].as_number()
                }
            }
            ComputedValue::Error(e) => Err(e.clone()),
        }
    }

    pub fn as_string(&self) -> String {
        match self {
            ComputedValue::Empty => "".into(),
            ComputedValue::Number(n) => {
                if n.is_nan() {
                    "#NUM!".into()
                } else if n.is_infinite() {
                    if *n > 0.0 {
                        "#NUM!".into()
                    } else {
                        "-#NUM!".into()
                    }
                } else if n.fract() == 0.0 && n.abs() < 1e15 {
                    format!("{}", *n as i64)
                } else {
                    format!("{}", n)
                }
            }
            ComputedValue::String(s) => s.clone(),
            ComputedValue::Boolean(b) => if *b { "TRUE" } else { "FALSE" }.into(),
            ComputedValue::Array(arr) => {
                if arr.is_empty() || arr[0].is_empty() {
                    "".into()
                } else {
                    arr[0][0].as_string()
                }
            }
            ComputedValue::Error(e) => e.excel_code().to_string(),
        }
    }

    pub fn is_truthy(&self) -> bool {
        match self {
            ComputedValue::Boolean(b) => *b,
            ComputedValue::Number(n) => *n != 0.0,
            ComputedValue::String(s) => {
                let upper = s.trim().to_uppercase();
                if upper == "TRUE" {
                    true
                } else if upper == "FALSE" {
                    false
                } else {
                    !s.is_empty()
                }
            }
            ComputedValue::Empty => false,
            ComputedValue::Array(arr) => {
                if arr.is_empty() || arr[0].is_empty() {
                    false
                } else {
                    arr[0][0].is_truthy()
                }
            }
            ComputedValue::Error(_) => false,
        }
    }

    pub fn is_empty(&self) -> bool {
        matches!(self, ComputedValue::Empty)
    }

    pub fn is_number(&self) -> bool {
        matches!(self, ComputedValue::Number(_))
    }

    pub fn is_string(&self) -> bool {
        matches!(self, ComputedValue::String(_))
    }

    pub fn is_boolean(&self) -> bool {
        matches!(self, ComputedValue::Boolean(_))
    }

    pub fn is_array(&self) -> bool {
        matches!(self, ComputedValue::Array(_))
    }

    pub fn is_error(&self) -> bool {
        matches!(self, ComputedValue::Error(_))
    }

    pub fn as_array(&self) -> Option<&Vec<Vec<ComputedValue>>> {
        match self {
            ComputedValue::Array(arr) => Some(arr),
            _ => None,
        }
    }

    pub fn to_matrix(&self) -> Vec<Vec<ComputedValue>> {
        match self {
            ComputedValue::Array(arr) => arr.clone(),
            other => vec![vec![other.clone()]],
        }
    }

    pub fn rows_count(&self) -> usize {
        match self {
            ComputedValue::Array(arr) => arr.len(),
            _ => 1,
        }
    }

    pub fn cols_count(&self) -> usize {
        match self {
            ComputedValue::Array(arr) => {
                if arr.is_empty() {
                    0
                } else {
                    arr[0].len()
                }
            }
            _ => 1,
        }
    }
}
