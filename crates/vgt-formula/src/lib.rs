#![forbid(unsafe_code)]

//! # VGT Formula Engine
//!
//! High-performance spreadsheet formula calculation engine for VGT Grid.
//!
//! Pipeline:
//! `Formula String` -> `Tokenizer` -> `AST Parser` -> `Dependency DAG` -> `Calculation Scheduler` -> `Result`
//!
//! Key capabilities:
//! - Full precedence expression parser (`+`, `-`, `*`, `/`, `^`, `&`, comparison)
//! - Range evaluation (`A1:B10`)
//! - Built-in functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF`
//! - Sparse cell storage matrix
//! - Topological sorting & cycle detection (`#CIRCULAR!`)
//! - Targeted dirty-node cache invalidation

pub mod array_semantics;
pub mod engine;
pub mod extensions;
pub mod functions;
pub mod lexer;
pub mod limits;
pub mod parser;
pub mod reference;
pub mod registry;
pub mod types;
pub mod value;

pub use engine::SpreadsheetEngine;
pub use functions::{call_function, EngineContext};
pub use lexer::Lexer;
pub use limits::{EvaluationBudget, FormulaLimits};
pub use parser::Parser;
pub use reference::{A1Reference, R1C1Axis, R1C1Reference};
pub use registry::{
    metadata as function_metadata, supported_family, CompatibilityLevel, FunctionFamily,
    FunctionMetadata, FUNCTION_REGISTRY_VERSION,
};
pub use types::{BinaryOpKind, CellCoord, ComputedValue, Expr, FormulaError, Token};
pub use value::FormulaValue;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coordinate_parsing() {
        let c1 = CellCoord::parse("A1").unwrap();
        assert_eq!(c1, CellCoord::new(0, 0));
        assert_eq!(c1.to_a1_string(), "A1");

        let c2 = CellCoord::parse("B10").unwrap();
        assert_eq!(c2, CellCoord::new(1, 9));
        assert_eq!(c2.to_a1_string(), "B10");

        let c3 = CellCoord::parse("Z100").unwrap();
        assert_eq!(c3, CellCoord::new(25, 99));

        let c4 = CellCoord::parse("$A$1").unwrap();
        assert_eq!(c4, CellCoord::new(0, 0));
    }

    #[test]
    fn test_arithmetic_formula() {
        let mut engine = SpreadsheetEngine::new();
        engine
            .set_formula(CellCoord::new(0, 0), "=10 + 20 * 2")
            .unwrap();
        // Precedence: 10 + 40 = 50
        assert_eq!(
            engine.get_value(&CellCoord::new(0, 0)),
            ComputedValue::Number(50.0)
        );
    }

    #[test]
    fn test_dependency_recalculation() {
        let mut engine = SpreadsheetEngine::new();
        let a1 = CellCoord::parse("A1").unwrap();
        let a2 = CellCoord::parse("A2").unwrap();
        let a3 = CellCoord::parse("A3").unwrap();

        engine.set_value(a1, ComputedValue::Number(100.0));
        engine.set_value(a2, ComputedValue::Number(50.0));
        engine.set_formula(a3, "=A1 + A2").unwrap();

        assert_eq!(engine.get_value(&a3), ComputedValue::Number(150.0));

        // Update A1 -> A3 must automatically update!
        engine.set_value(a1, ComputedValue::Number(200.0));
        assert_eq!(engine.get_value(&a3), ComputedValue::Number(250.0));
    }

    #[test]
    fn test_sum_and_if() {
        let mut engine = SpreadsheetEngine::new();
        let a1 = CellCoord::parse("A1").unwrap();
        let a2 = CellCoord::parse("A2").unwrap();
        let a3 = CellCoord::parse("A3").unwrap();
        let b1 = CellCoord::parse("B1").unwrap();

        engine.set_value(a1, ComputedValue::Number(30.0));
        engine.set_value(a2, ComputedValue::Number(40.0));
        engine.set_value(a3, ComputedValue::Number(50.0));

        engine
            .set_formula(b1, "=IF(SUM(A1:A3) > 100, \"Profit\", \"Loss\")")
            .unwrap();
        assert_eq!(
            engine.get_value(&b1),
            ComputedValue::String("Profit".into())
        );
    }

    #[test]
    fn test_circular_dependency_detection() {
        let mut engine = SpreadsheetEngine::new();
        let a1 = CellCoord::parse("A1").unwrap();
        let b1 = CellCoord::parse("B1").unwrap();

        engine.set_formula(a1, "=B1 + 1").unwrap();
        let err = engine.set_formula(b1, "=A1 * 2");

        assert!(matches!(err, Err(FormulaError::CircularDependency(_))));
    }
}
