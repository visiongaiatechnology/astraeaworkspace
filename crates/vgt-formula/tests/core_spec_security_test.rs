//! Formula Engine core-spec hardening tests.
//! These tests are part of the native Cargo suite and intentionally do not perform network/file I/O.

use vgt_formula::{
    function_metadata, supported_family, CellCoord, CompatibilityLevel, ComputedValue,
    FormulaError, FunctionFamily, Parser, SpreadsheetEngine,
};

#[test]
fn oversized_formula_and_dependency_ranges_fail_closed() {
    let huge_formula = format!("={}", "1+".repeat(9_000));
    assert!(matches!(
        Parser::parse(&huge_formula),
        Err(FormulaError::ResourceLimit(_))
    ));

    let mut engine = SpreadsheetEngine::new();
    let result = engine.set_formula(CellCoord::parse("A1").unwrap(), "=SUM(A1:XFD1048576)");
    assert!(matches!(result, Err(FormulaError::ResourceLimit(_))));
}

#[test]
fn named_structured_and_qualified_bindings_recalculate_without_callbacks() {
    let mut engine = SpreadsheetEngine::new();
    let a1 = CellCoord::parse("A1").unwrap();
    let a2 = CellCoord::parse("A2").unwrap();
    let a3 = CellCoord::parse("A3").unwrap();

    engine
        .set_named_value("Revenue", ComputedValue::Number(10.0))
        .unwrap();
    engine.set_formula(a1, "=Revenue+1").unwrap();
    assert_eq!(engine.get_value(&a1), ComputedValue::Number(11.0));
    engine
        .set_named_value("Revenue", ComputedValue::Number(20.0))
        .unwrap();
    assert_eq!(engine.get_value(&a1), ComputedValue::Number(21.0));

    engine
        .set_structured_reference("Table1[Amount]", ComputedValue::Number(7.0))
        .unwrap();
    engine.set_formula(a2, "=Table1[Amount]*2").unwrap();
    assert_eq!(engine.get_value(&a2), ComputedValue::Number(14.0));

    engine
        .set_qualified_cell_value(
            "Sheet 2",
            CellCoord::parse("B4").unwrap(),
            ComputedValue::Number(5.0),
        )
        .unwrap();
    engine.set_formula(a3, "='Sheet 2'!B4+3").unwrap();
    assert_eq!(engine.get_value(&a3), ComputedValue::Number(8.0));
}

#[test]
fn versioned_registry_is_truthful_about_supported_and_target_functions() {
    assert_eq!(supported_family("DSUM"), Some(FunctionFamily::Database));
    assert_eq!(
        supported_family("CONVERT"),
        Some(FunctionFamily::Engineering)
    );
    assert_eq!(supported_family("MMULT"), Some(FunctionFamily::Matrix));
    assert_eq!(
        supported_family("FILTER"),
        Some(FunctionFamily::DynamicArray)
    );

    assert_eq!(
        function_metadata("XLOOKUP").unwrap().level,
        CompatibilityLevel::Supported
    );
    assert_eq!(
        function_metadata("LET").unwrap().level,
        CompatibilityLevel::CompatibilityTarget
    );
    assert_eq!(
        function_metadata("LAMBDA").unwrap().level,
        CompatibilityLevel::CompatibilityTarget
    );
}

#[test]
fn deterministic_parser_fuzz_is_bounded_and_never_panics() {
    let atoms = [
        "A1",
        "$B$2",
        "SUM(A1:B3)",
        "Table1[Amount]",
        "'Sheet 2'!C4",
        "42",
        "\"txt\"",
    ];
    let operators = ["+", "-", "*", "/", "&", "=", ">="];
    let mut state: u64 = 0x5647_5446_4f52_4d55;
    for i in 0..4_096usize {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        let left = atoms[(state as usize) % atoms.len()];
        let op = operators[((state >> 11) as usize) % operators.len()];
        let right = atoms[((state >> 23) as usize) % atoms.len()];
        let formula = if i % 13 == 0 {
            format!("=({left}{op}{right}") // deliberately malformed
        } else {
            format!("={left}{op}{right}")
        };
        let _ = Parser::parse(&formula);
    }
}

#[test]
fn dde_shell_formula_is_rejected() {
    let dde = "=cmd|' /C calc'!A0";
    assert!(Parser::parse(dde).is_err());
}
