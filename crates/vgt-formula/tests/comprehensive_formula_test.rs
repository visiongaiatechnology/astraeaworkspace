//! Comprehensive test suite for vgt-formula Excel/Calc parity.
//! Verifies all 9 function families (111 functions), dynamic array spills,
//! collision detection (#SPILL!), circular dependency detection (#CIRCULAR!),
//! and multi-level dependency propagation.

use vgt_formula::{CellCoord, ComputedValue, FormulaError, SpreadsheetEngine};

#[test]
fn test_math_trig_functions() {
    let mut engine = SpreadsheetEngine::new();

    // Populate helper cells
    // A1=1, A2=2, A3=3, A4=4, A5=5
    for i in 1..=5 {
        engine.set_value(CellCoord::new(0, i - 1), ComputedValue::Number(i as f64));
    }
    // B1=10, B2=20, B3=30, B4=40, B5=50
    for i in 1..=5 {
        engine.set_value(
            CellCoord::new(1, i - 1),
            ComputedValue::Number((i * 10) as f64),
        );
    }

    // 1. SUM
    engine
        .set_formula(CellCoord::parse("C1").unwrap(), "=SUM(A1:A5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C1").unwrap()),
        ComputedValue::Number(15.0)
    );

    // 2. SUMIF
    engine
        .set_formula(CellCoord::parse("C2").unwrap(), "=SUMIF(A1:A5, \">2\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C2").unwrap()),
        ComputedValue::Number(12.0)
    ); // 3+4+5=12

    // 3. SUMIFS
    engine
        .set_formula(
            CellCoord::parse("C3").unwrap(),
            "=SUMIFS(B1:B5, A1:A5, \">2\", A1:A5, \"<=4\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C3").unwrap()),
        ComputedValue::Number(70.0)
    ); // B3+B4=30+40=70

    // 4. PRODUCT
    engine
        .set_formula(CellCoord::parse("C4").unwrap(), "=PRODUCT(A1:A3, 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C4").unwrap()),
        ComputedValue::Number(12.0)
    ); // 1*2*3*2=12

    // 5. ROUND, ROUNDUP, ROUNDDOWN
    engine
        .set_formula(CellCoord::parse("C5").unwrap(), "=ROUND(3.14159, 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C5").unwrap()),
        ComputedValue::Number(314.0 / 100.0)
    );

    engine
        .set_formula(CellCoord::parse("C6").unwrap(), "=ROUNDUP(3.14159, 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C6").unwrap()),
        ComputedValue::Number(3.15)
    );

    engine
        .set_formula(CellCoord::parse("C7").unwrap(), "=ROUNDDOWN(3.14159, 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C7").unwrap()),
        ComputedValue::Number(314.0 / 100.0)
    );

    // 6. MOD
    engine
        .set_formula(CellCoord::parse("C8").unwrap(), "=MOD(10, 3)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C8").unwrap()),
        ComputedValue::Number(1.0)
    );

    // 7. ABS
    engine
        .set_formula(CellCoord::parse("C9").unwrap(), "=ABS(-42.5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C9").unwrap()),
        ComputedValue::Number(42.5)
    );

    // 8. SQRT
    engine
        .set_formula(CellCoord::parse("C10").unwrap(), "=SQRT(64)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C10").unwrap()),
        ComputedValue::Number(8.0)
    );

    // 9. POWER
    engine
        .set_formula(CellCoord::parse("C11").unwrap(), "=POWER(2, 8)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C11").unwrap()),
        ComputedValue::Number(256.0)
    );

    // 10. CEILING & FLOOR
    engine
        .set_formula(CellCoord::parse("C12").unwrap(), "=CEILING(4.2, 1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C12").unwrap()),
        ComputedValue::Number(5.0)
    );

    engine
        .set_formula(CellCoord::parse("C13").unwrap(), "=FLOOR(4.8, 1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C13").unwrap()),
        ComputedValue::Number(4.0)
    );

    // 11. SUBTOTAL (function 9 is SUM)
    engine
        .set_formula(CellCoord::parse("C14").unwrap(), "=SUBTOTAL(9, A1:A3)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C14").unwrap()),
        ComputedValue::Number(6.0)
    );

    // 12. AGGREGATE (function 9 is SUM, option 6 ignores error values)
    engine.set_value(
        CellCoord::parse("A6").unwrap(),
        ComputedValue::Error(FormulaError::DivisionByZero),
    );
    engine
        .set_formula(CellCoord::parse("C15").unwrap(), "=AGGREGATE(9, 6, A1:A6)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C15").unwrap()),
        ComputedValue::Number(15.0)
    );
}

#[test]
fn test_statistical_functions() {
    let mut engine = SpreadsheetEngine::new();

    // Setup values: A1=10, A2=20, A3=30, A4=40, A5=50
    for i in 1..=5 {
        engine.set_value(
            CellCoord::new(0, i - 1),
            ComputedValue::Number((i * 10) as f64),
        );
    }

    // 1. AVERAGE
    engine
        .set_formula(CellCoord::parse("B1").unwrap(), "=AVERAGE(A1:A5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B1").unwrap()),
        ComputedValue::Number(30.0)
    );

    // 2. AVERAGEIF
    engine
        .set_formula(
            CellCoord::parse("B2").unwrap(),
            "=AVERAGEIF(A1:A5, \">20\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B2").unwrap()),
        ComputedValue::Number(40.0)
    ); // (30+40+50)/3 = 40

    // 3. MEDIAN
    engine
        .set_formula(CellCoord::parse("B3").unwrap(), "=MEDIAN(A1:A5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B3").unwrap()),
        ComputedValue::Number(30.0)
    );

    // 4. MODE
    engine.set_value(CellCoord::parse("A6").unwrap(), ComputedValue::Number(20.0));
    engine
        .set_formula(CellCoord::parse("B4").unwrap(), "=MODE(A1:A6)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B4").unwrap()),
        ComputedValue::Number(20.0)
    );

    // 5. COUNT & COUNTA
    engine.set_value(CellCoord::parse("D1").unwrap(), ComputedValue::Number(1.0));
    engine.set_value(
        CellCoord::parse("D2").unwrap(),
        ComputedValue::String("hello".into()),
    );
    engine.set_value(
        CellCoord::parse("D3").unwrap(),
        ComputedValue::Boolean(true),
    );
    engine.set_value(CellCoord::parse("D4").unwrap(), ComputedValue::Empty);
    engine.set_value(CellCoord::parse("D5").unwrap(), ComputedValue::Number(5.0));

    engine
        .set_formula(CellCoord::parse("B5").unwrap(), "=COUNT(D1:D5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B5").unwrap()),
        ComputedValue::Number(2.0)
    ); // D1 and D5

    engine
        .set_formula(CellCoord::parse("B6").unwrap(), "=COUNTA(D1:D5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B6").unwrap()),
        ComputedValue::Number(4.0)
    ); // D1, D2, D3, D5

    // 6. COUNTIF & COUNTIFS
    engine
        .set_formula(CellCoord::parse("B7").unwrap(), "=COUNTIF(A1:A5, \">=30\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B7").unwrap()),
        ComputedValue::Number(3.0)
    );

    engine
        .set_formula(
            CellCoord::parse("B8").unwrap(),
            "=COUNTIFS(A1:A5, \">10\", A1:A5, \"<50\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B8").unwrap()),
        ComputedValue::Number(3.0)
    );

    // 7. COUNTBLANK
    engine
        .set_formula(CellCoord::parse("B9").unwrap(), "=COUNTBLANK(D1:D5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B9").unwrap()),
        ComputedValue::Number(1.0)
    ); // D4 is empty

    // 8. MIN & MAX
    engine
        .set_formula(CellCoord::parse("B10").unwrap(), "=MIN(A1:A5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B10").unwrap()),
        ComputedValue::Number(10.0)
    );

    engine
        .set_formula(CellCoord::parse("B11").unwrap(), "=MAX(A1:A5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B11").unwrap()),
        ComputedValue::Number(50.0)
    );

    // 9. LARGE & SMALL
    engine
        .set_formula(CellCoord::parse("B12").unwrap(), "=LARGE(A1:A5, 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B12").unwrap()),
        ComputedValue::Number(40.0)
    );

    engine
        .set_formula(CellCoord::parse("B13").unwrap(), "=SMALL(A1:A5, 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B13").unwrap()),
        ComputedValue::Number(20.0)
    );

    // 10. STDEV & VAR
    engine
        .set_formula(CellCoord::parse("B14").unwrap(), "=VAR(10, 20, 30, 40, 50)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B14").unwrap()),
        ComputedValue::Number(250.0)
    );

    engine
        .set_formula(
            CellCoord::parse("B15").unwrap(),
            "=ROUND(STDEV(10, 20, 30, 40, 50), 2)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B15").unwrap()),
        ComputedValue::Number(15.81)
    );
}

#[test]
fn test_logical_functions() {
    let mut engine = SpreadsheetEngine::new();

    // 1. IF
    engine
        .set_formula(
            CellCoord::parse("A1").unwrap(),
            "=IF(10 > 5, \"Pass\", \"Fail\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A1").unwrap()),
        ComputedValue::String("Pass".into())
    );

    // 2. IFS
    engine
        .set_formula(
            CellCoord::parse("A2").unwrap(),
            "=IFS(1 > 2, \"No\", 3 > 1, \"Yes\", TRUE, \"Default\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A2").unwrap()),
        ComputedValue::String("Yes".into())
    );

    // 3. SWITCH
    engine
        .set_formula(
            CellCoord::parse("A3").unwrap(),
            "=SWITCH(2, 1, \"One\", 2, \"Two\", \"Other\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A3").unwrap()),
        ComputedValue::String("Two".into())
    );

    // 4. AND, OR, NOT, XOR
    engine
        .set_formula(
            CellCoord::parse("A4").unwrap(),
            "=AND(TRUE, 5 > 2, 10 = 10)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A4").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A5").unwrap(), "=OR(FALSE, 1 > 5, 2 = 2)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A5").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A6").unwrap(), "=NOT(TRUE)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A6").unwrap()),
        ComputedValue::Boolean(false)
    );

    engine
        .set_formula(CellCoord::parse("A7").unwrap(), "=XOR(TRUE, FALSE)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A7").unwrap()),
        ComputedValue::Boolean(true)
    );

    // 5. IFERROR & IFNA
    engine
        .set_formula(
            CellCoord::parse("A8").unwrap(),
            "=IFERROR(10 / 0, \"DivZeroHandled\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A8").unwrap()),
        ComputedValue::String("DivZeroHandled".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A9").unwrap(),
            "=IFNA(NA(), \"NAHandled\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A9").unwrap()),
        ComputedValue::String("NAHandled".into())
    );

    // 6. TRUE & FALSE
    engine
        .set_formula(CellCoord::parse("A10").unwrap(), "=TRUE()")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A10").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A11").unwrap(), "=FALSE()")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A11").unwrap()),
        ComputedValue::Boolean(false)
    );
}

#[test]
fn test_lookup_ref_functions() {
    let mut engine = SpreadsheetEngine::new();

    // Table:
    // A1=101, B1="Alice", C1=5000
    // A2=102, B2="Bob",   C2=6000
    // A3=103, B3="Carol", C3=7000
    engine.set_value(
        CellCoord::parse("A1").unwrap(),
        ComputedValue::Number(101.0),
    );
    engine.set_value(
        CellCoord::parse("B1").unwrap(),
        ComputedValue::String("Alice".into()),
    );
    engine.set_value(
        CellCoord::parse("C1").unwrap(),
        ComputedValue::Number(5000.0),
    );

    engine.set_value(
        CellCoord::parse("A2").unwrap(),
        ComputedValue::Number(102.0),
    );
    engine.set_value(
        CellCoord::parse("B2").unwrap(),
        ComputedValue::String("Bob".into()),
    );
    engine.set_value(
        CellCoord::parse("C2").unwrap(),
        ComputedValue::Number(6000.0),
    );

    engine.set_value(
        CellCoord::parse("A3").unwrap(),
        ComputedValue::Number(103.0),
    );
    engine.set_value(
        CellCoord::parse("B3").unwrap(),
        ComputedValue::String("Carol".into()),
    );
    engine.set_value(
        CellCoord::parse("C3").unwrap(),
        ComputedValue::Number(7000.0),
    );

    // 1. VLOOKUP
    engine
        .set_formula(
            CellCoord::parse("D1").unwrap(),
            "=VLOOKUP(102, A1:C3, 2, FALSE)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D1").unwrap()),
        ComputedValue::String("Bob".into())
    );

    // 2. XLOOKUP
    engine
        .set_formula(
            CellCoord::parse("D2").unwrap(),
            "=XLOOKUP(\"Carol\", B1:B3, C1:C3)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D2").unwrap()),
        ComputedValue::Number(7000.0)
    );

    // 3. MATCH & XMATCH
    engine
        .set_formula(CellCoord::parse("D3").unwrap(), "=MATCH(103, A1:A3, 0)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D3").unwrap()),
        ComputedValue::Number(3.0)
    );

    engine
        .set_formula(CellCoord::parse("D4").unwrap(), "=XMATCH(\"Bob\", B1:B3)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D4").unwrap()),
        ComputedValue::Number(2.0)
    );

    // 4. INDEX
    engine
        .set_formula(CellCoord::parse("D5").unwrap(), "=INDEX(A1:C3, 2, 3)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D5").unwrap()),
        ComputedValue::Number(6000.0)
    );

    // 5. CHOOSE
    engine
        .set_formula(
            CellCoord::parse("D6").unwrap(),
            "=CHOOSE(2, \"Alpha\", \"Beta\", \"Gamma\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D6").unwrap()),
        ComputedValue::String("Beta".into())
    );

    // 6. ROW & COLUMN
    engine
        .set_formula(CellCoord::parse("D7").unwrap(), "=ROW(B5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D7").unwrap()),
        ComputedValue::Number(5.0)
    );

    engine
        .set_formula(CellCoord::parse("D8").unwrap(), "=COLUMN(C1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D8").unwrap()),
        ComputedValue::Number(3.0)
    );

    // 7. ROWS & COLUMNS
    engine
        .set_formula(CellCoord::parse("D9").unwrap(), "=ROWS(A1:C5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D9").unwrap()),
        ComputedValue::Number(5.0)
    );

    engine
        .set_formula(CellCoord::parse("D10").unwrap(), "=COLUMNS(A1:C5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D10").unwrap()),
        ComputedValue::Number(3.0)
    );

    // 8. OFFSET
    engine
        .set_formula(CellCoord::parse("D11").unwrap(), "=OFFSET(A1, 1, 1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("D11").unwrap()),
        ComputedValue::String("Bob".into())
    );
}

#[test]
fn test_text_functions() {
    let mut engine = SpreadsheetEngine::new();

    // 1. CONCAT & CONCATENATE
    engine
        .set_formula(
            CellCoord::parse("A1").unwrap(),
            "=CONCAT(\"VGT\", \" \", \"Grid\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A1").unwrap()),
        ComputedValue::String("VGT Grid".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A2").unwrap(),
            "=CONCATENATE(\"Hello\", \" \", \"World\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A2").unwrap()),
        ComputedValue::String("Hello World".into())
    );

    // 2. TEXTJOIN
    engine
        .set_formula(
            CellCoord::parse("A3").unwrap(),
            "=TEXTJOIN(\", \", TRUE, \"A\", \"\", \"B\", \"C\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A3").unwrap()),
        ComputedValue::String("A, B, C".into())
    );

    // 3. LEFT, RIGHT, MID, LEN
    engine
        .set_formula(CellCoord::parse("A4").unwrap(), "=LEFT(\"Spreadsheet\", 6)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A4").unwrap()),
        ComputedValue::String("Spread".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A5").unwrap(),
            "=RIGHT(\"Spreadsheet\", 5)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A5").unwrap()),
        ComputedValue::String("sheet".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A6").unwrap(),
            "=MID(\"Spreadsheet\", 2, 4)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A6").unwrap()),
        ComputedValue::String("prea".into())
    );

    engine
        .set_formula(CellCoord::parse("A7").unwrap(), "=LEN(\"VisionGaia\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A7").unwrap()),
        ComputedValue::Number(10.0)
    );

    // 4. LOWER, UPPER, PROPER, TRIM
    engine
        .set_formula(CellCoord::parse("A8").unwrap(), "=LOWER(\"ASTRAEA\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A8").unwrap()),
        ComputedValue::String("astraea".into())
    );

    engine
        .set_formula(CellCoord::parse("A9").unwrap(), "=UPPER(\"astraea\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A9").unwrap()),
        ComputedValue::String("ASTRAEA".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A10").unwrap(),
            "=PROPER(\"vgt sovereign suite\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A10").unwrap()),
        ComputedValue::String("Vgt Sovereign Suite".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A11").unwrap(),
            "=TRIM(\"   clean   spaces   \")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A11").unwrap()),
        ComputedValue::String("clean spaces".into())
    );

    // 5. FIND & SEARCH
    engine
        .set_formula(
            CellCoord::parse("A12").unwrap(),
            "=FIND(\"Gaia\", \"VisionGaiaGrid\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A12").unwrap()),
        ComputedValue::Number(7.0)
    );

    engine
        .set_formula(
            CellCoord::parse("A13").unwrap(),
            "=SEARCH(\"gaia\", \"VisionGaiaGrid\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A13").unwrap()),
        ComputedValue::Number(7.0)
    );

    // 6. REPLACE, SUBSTITUTE, REPT
    engine
        .set_formula(
            CellCoord::parse("A14").unwrap(),
            "=REPLACE(\"abcdef\", 3, 2, \"ZZ\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A14").unwrap()),
        ComputedValue::String("abZZef".into())
    );

    engine
        .set_formula(
            CellCoord::parse("A15").unwrap(),
            "=SUBSTITUTE(\"banana\", \"a\", \"o\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A15").unwrap()),
        ComputedValue::String("bonono".into())
    );

    engine
        .set_formula(CellCoord::parse("A16").unwrap(), "=REPT(\"*\", 5)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A16").unwrap()),
        ComputedValue::String("*****".into())
    );

    // 7. TEXT
    engine
        .set_formula(CellCoord::parse("A17").unwrap(), "=TEXT(1234.5, \"0.00\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A17").unwrap()),
        ComputedValue::String("1234.50".into())
    );
}

#[test]
fn test_datetime_functions() {
    let mut engine = SpreadsheetEngine::new();

    // 1. DATE, YEAR, MONTH, DAY
    engine
        .set_formula(CellCoord::parse("A1").unwrap(), "=DATE(2026, 9, 12)")
        .unwrap();
    engine
        .set_formula(CellCoord::parse("A2").unwrap(), "=YEAR(A1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A2").unwrap()),
        ComputedValue::Number(2026.0)
    );

    engine
        .set_formula(CellCoord::parse("A3").unwrap(), "=MONTH(A1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A3").unwrap()),
        ComputedValue::Number(9.0)
    );

    engine
        .set_formula(CellCoord::parse("A4").unwrap(), "=DAY(A1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A4").unwrap()),
        ComputedValue::Number(12.0)
    );

    // 2. TIME, HOUR, MINUTE, SECOND
    engine
        .set_formula(CellCoord::parse("B1").unwrap(), "=TIME(14, 30, 45)")
        .unwrap();
    engine
        .set_formula(CellCoord::parse("B2").unwrap(), "=HOUR(B1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B2").unwrap()),
        ComputedValue::Number(14.0)
    );

    engine
        .set_formula(CellCoord::parse("B3").unwrap(), "=MINUTE(B1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B3").unwrap()),
        ComputedValue::Number(30.0)
    );

    engine
        .set_formula(CellCoord::parse("B4").unwrap(), "=SECOND(B1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("B4").unwrap()),
        ComputedValue::Number(45.0)
    );

    // 3. TODAY & NOW
    engine
        .set_formula(CellCoord::parse("C1").unwrap(), "=YEAR(TODAY())")
        .unwrap();
    assert!(
        engine
            .get_value(&CellCoord::parse("C1").unwrap())
            .as_number()
            .unwrap()
            >= 2026.0
    );

    // 4. NETWORKDAYS (Monday 2026-09-07 to Friday 2026-09-11 is 5 workdays)
    engine
        .set_formula(
            CellCoord::parse("C2").unwrap(),
            "=NETWORKDAYS(DATE(2026, 9, 7), DATE(2026, 9, 11))",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C2").unwrap()),
        ComputedValue::Number(5.0)
    );

    // 5. WORKDAY (5 workdays from Monday 2026-09-07 is Monday 2026-09-14)
    engine
        .set_formula(
            CellCoord::parse("C3").unwrap(),
            "=DAY(WORKDAY(DATE(2026, 9, 7), 5))",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C3").unwrap()),
        ComputedValue::Number(14.0)
    );

    // 6. EDATE & EOMONTH
    engine
        .set_formula(
            CellCoord::parse("C4").unwrap(),
            "=MONTH(EDATE(DATE(2026, 1, 15), 3))",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C4").unwrap()),
        ComputedValue::Number(4.0)
    );

    engine
        .set_formula(
            CellCoord::parse("C5").unwrap(),
            "=DAY(EOMONTH(DATE(2026, 2, 1), 0))",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C5").unwrap()),
        ComputedValue::Number(28.0)
    ); // 2026 is not a leap year

    // 7. DATEDIF
    engine
        .set_formula(
            CellCoord::parse("C6").unwrap(),
            "=DATEDIF(DATE(2020, 1, 1), DATE(2026, 1, 1), \"Y\")",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("C6").unwrap()),
        ComputedValue::Number(6.0)
    );
}

#[test]
fn test_financial_functions() {
    let mut engine = SpreadsheetEngine::new();

    // 1. PMT
    // Loan $10,000 at 8% annual for 10 years (120 monthly payments)
    engine
        .set_formula(
            CellCoord::parse("A1").unwrap(),
            "=ROUND(PMT(0.08 / 12, 120, 10000), 2)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A1").unwrap()),
        ComputedValue::Number(-121.33)
    );

    // 2. FV
    // Save $100/mo for 5 years at 5% annual
    engine
        .set_formula(
            CellCoord::parse("A2").unwrap(),
            "=ROUND(FV(0.05 / 12, 60, -100), 2)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A2").unwrap()),
        ComputedValue::Number(6800.61)
    );

    // 3. PV
    // Present value of $500 monthly for 10 years at 8%
    engine
        .set_formula(
            CellCoord::parse("A3").unwrap(),
            "=ROUND(PV(0.08 / 12, 120, -500), 2)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A3").unwrap()),
        ComputedValue::Number(41210.74)
    );

    // 4. NPER
    engine
        .set_formula(
            CellCoord::parse("A4").unwrap(),
            "=ROUND(NPER(0.08 / 12, -121.33, 10000), 0)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A4").unwrap()),
        ComputedValue::Number(120.0)
    );

    // 5. NPV
    engine
        .set_formula(
            CellCoord::parse("A5").unwrap(),
            "=ROUND(NPV(0.1, 100, 200, 300), 2)",
        )
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A5").unwrap()),
        ComputedValue::Number(481.59)
    );

    // 6. IRR
    engine.set_value(
        CellCoord::parse("B1").unwrap(),
        ComputedValue::Number(-1000.0),
    );
    engine.set_value(
        CellCoord::parse("B2").unwrap(),
        ComputedValue::Number(300.0),
    );
    engine.set_value(
        CellCoord::parse("B3").unwrap(),
        ComputedValue::Number(400.0),
    );
    engine.set_value(
        CellCoord::parse("B4").unwrap(),
        ComputedValue::Number(500.0),
    );
    engine
        .set_formula(CellCoord::parse("A6").unwrap(), "=ROUND(IRR(B1:B4), 3)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A6").unwrap()),
        ComputedValue::Number(0.089)
    );
}

#[test]
fn test_information_error_functions() {
    let mut engine = SpreadsheetEngine::new();

    // 1. ISBLANK
    engine
        .set_formula(CellCoord::parse("A1").unwrap(), "=ISBLANK(Z100)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A1").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine.set_value(
        CellCoord::parse("Z101").unwrap(),
        ComputedValue::Number(42.0),
    );
    engine
        .set_formula(CellCoord::parse("A2").unwrap(), "=ISBLANK(Z101)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A2").unwrap()),
        ComputedValue::Boolean(false)
    );

    // 2. ISNUMBER, ISTEXT, ISNONTEXT, ISLOGICAL
    engine
        .set_formula(CellCoord::parse("A3").unwrap(), "=ISNUMBER(123.45)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A3").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A4").unwrap(), "=ISTEXT(\"Hello\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A4").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A5").unwrap(), "=ISNONTEXT(123)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A5").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A6").unwrap(), "=ISLOGICAL(TRUE)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A6").unwrap()),
        ComputedValue::Boolean(true)
    );

    // 3. ISERROR, ISNA, ERROR.TYPE
    engine
        .set_formula(CellCoord::parse("A7").unwrap(), "=ISERROR(10 / 0)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A7").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A8").unwrap(), "=ISNA(NA())")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A8").unwrap()),
        ComputedValue::Boolean(true)
    );

    engine
        .set_formula(CellCoord::parse("A9").unwrap(), "=ERROR.TYPE(10 / 0)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A9").unwrap()),
        ComputedValue::Number(2.0)
    ); // #DIV/0! is code 2

    // 4. TYPE (1=Number, 2=Text, 4=Boolean, 16=Error)
    engine
        .set_formula(CellCoord::parse("A10").unwrap(), "=TYPE(100)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A10").unwrap()),
        ComputedValue::Number(1.0)
    );

    engine
        .set_formula(CellCoord::parse("A11").unwrap(), "=TYPE(\"abc\")")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A11").unwrap()),
        ComputedValue::Number(2.0)
    );

    engine
        .set_formula(CellCoord::parse("A12").unwrap(), "=TYPE(FALSE)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("A12").unwrap()),
        ComputedValue::Number(4.0)
    );
}

#[test]
fn test_dynamic_array_functions() {
    let mut engine = SpreadsheetEngine::new();

    // Populate data in A1:B4
    // A1=10, B1="Red"
    // A2=20, B2="Blue"
    // A3=10, B3="Green"
    // A4=30, B4="Red"
    engine.set_value(CellCoord::parse("A1").unwrap(), ComputedValue::Number(10.0));
    engine.set_value(
        CellCoord::parse("B1").unwrap(),
        ComputedValue::String("Red".into()),
    );
    engine.set_value(CellCoord::parse("A2").unwrap(), ComputedValue::Number(20.0));
    engine.set_value(
        CellCoord::parse("B2").unwrap(),
        ComputedValue::String("Blue".into()),
    );
    engine.set_value(CellCoord::parse("A3").unwrap(), ComputedValue::Number(10.0));
    engine.set_value(
        CellCoord::parse("B3").unwrap(),
        ComputedValue::String("Green".into()),
    );
    engine.set_value(CellCoord::parse("A4").unwrap(), ComputedValue::Number(30.0));
    engine.set_value(
        CellCoord::parse("B4").unwrap(),
        ComputedValue::String("Red".into()),
    );

    // 1. SEQUENCE
    engine
        .set_formula(CellCoord::parse("D1").unwrap(), "=SEQUENCE(3, 2, 1, 2)")
        .unwrap();
    // Spilled cells:
    // D1=1, E1=3
    // D2=5, E2=7
    // D3=9, E3=11
    assert_eq!(
        engine.get_value(&CellCoord::parse("E1").unwrap()),
        ComputedValue::Number(3.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("D2").unwrap()),
        ComputedValue::Number(5.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("E2").unwrap()),
        ComputedValue::Number(7.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("D3").unwrap()),
        ComputedValue::Number(9.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("E3").unwrap()),
        ComputedValue::Number(11.0)
    );

    // 2. UNIQUE
    engine
        .set_formula(CellCoord::parse("G1").unwrap(), "=UNIQUE(A1:A4)")
        .unwrap();
    // Unique values: 10, 20, 30
    assert_eq!(
        engine.get_value(&CellCoord::parse("G2").unwrap()),
        ComputedValue::Number(20.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("G3").unwrap()),
        ComputedValue::Number(30.0)
    );

    // 3. SORT
    engine
        .set_formula(CellCoord::parse("I1").unwrap(), "=SORT(A1:A4, 1, -1)")
        .unwrap();
    // Descending sort: 30, 20, 10, 10
    assert_eq!(
        engine.get_value(&CellCoord::parse("I2").unwrap()),
        ComputedValue::Number(20.0)
    );

    // 4. TAKE & DROP
    engine
        .set_formula(CellCoord::parse("K1").unwrap(), "=TAKE(A1:B4, 2, 1)")
        .unwrap();
    // First 2 rows, 1 col: 10, 20
    assert_eq!(
        engine.get_value(&CellCoord::parse("K2").unwrap()),
        ComputedValue::Number(20.0)
    );

    engine
        .set_formula(CellCoord::parse("M1").unwrap(), "=DROP(A1:B4, 2, 0)")
        .unwrap();
    // Drop first 2 rows: leaves rows 3 and 4 -> M1 holds Array, N1="Green", M2=30, N2="Red"
    assert_eq!(
        engine
            .get_value(&CellCoord::parse("M1").unwrap())
            .as_number()
            .unwrap(),
        10.0
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("N1").unwrap()),
        ComputedValue::String("Green".into())
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("M2").unwrap()),
        ComputedValue::Number(30.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("N2").unwrap()),
        ComputedValue::String("Red".into())
    );

    // 5. CHOOSECOLS & CHOOSEROWS
    engine
        .set_formula(CellCoord::parse("O1").unwrap(), "=CHOOSECOLS(A1:B4, 2, 1)")
        .unwrap();
    assert_eq!(
        engine
            .get_value(&CellCoord::parse("O1").unwrap())
            .as_string(),
        "Red"
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("P1").unwrap()),
        ComputedValue::Number(10.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("O2").unwrap()),
        ComputedValue::String("Blue".into())
    );

    engine
        .set_formula(CellCoord::parse("R1").unwrap(), "=CHOOSEROWS(A1:B4, 4, 1)")
        .unwrap();
    assert_eq!(
        engine
            .get_value(&CellCoord::parse("R1").unwrap())
            .as_number()
            .unwrap(),
        30.0
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("S1").unwrap()),
        ComputedValue::String("Red".into())
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("R2").unwrap()),
        ComputedValue::Number(10.0)
    );
}

#[test]
fn test_dynamic_array_spill_collision_and_recovery() {
    let mut engine = SpreadsheetEngine::new();

    // Place an obstacle in B2
    engine.set_value(
        CellCoord::parse("B2").unwrap(),
        ComputedValue::String("OBSTACLE".into()),
    );

    // Try to spill SEQUENCE(3, 3) from A1 into A1..C3
    // B2 is occupied -> must yield #SPILL!
    engine
        .set_formula(CellCoord::parse("A1").unwrap(), "=SEQUENCE(3, 3)")
        .unwrap();
    let val = engine.get_value(&CellCoord::parse("A1").unwrap());
    assert!(
        matches!(val, ComputedValue::Error(FormulaError::SpillError(_))),
        "Expected #SPILL! but got {:?}",
        val
    );

    // Dependent formula on A1 sees the spill error
    engine
        .set_formula(CellCoord::parse("E1").unwrap(), "=ISERROR(A1)")
        .unwrap();
    assert_eq!(
        engine.get_value(&CellCoord::parse("E1").unwrap()),
        ComputedValue::Boolean(true)
    );

    // Remove the obstacle from B2
    engine.set_value(CellCoord::parse("B2").unwrap(), ComputedValue::Empty);

    // A1 must now automatically unblock and spill successfully!
    let val_after = engine.get_value(&CellCoord::parse("A1").unwrap());
    assert!(
        matches!(val_after, ComputedValue::Array(_)),
        "Expected Array after unblock but got {:?}",
        val_after
    );
    // B2 should now have the spilled value 5 (row 1, col 1 in 1-based 3x3)
    assert_eq!(
        engine.get_value(&CellCoord::parse("B2").unwrap()),
        ComputedValue::Number(5.0)
    );
    assert_eq!(
        engine.get_value(&CellCoord::parse("C3").unwrap()),
        ComputedValue::Number(9.0)
    );

    // Dependent cell E1 updates automatically
    assert_eq!(
        engine.get_value(&CellCoord::parse("E1").unwrap()),
        ComputedValue::Boolean(false)
    );
}

#[test]
fn test_circular_dependency_detection() {
    let mut engine = SpreadsheetEngine::new();

    let a1 = CellCoord::parse("A1").unwrap();
    let b1 = CellCoord::parse("B1").unwrap();

    // Direct loop
    engine.set_formula(a1, "=B1 + 1").unwrap();
    let err = engine.set_formula(b1, "=A1 * 2");
    assert!(matches!(err, Err(FormulaError::CircularDependency(_))));

    // Indirect 3-step loop: A2 -> B2 -> C2 -> A2
    let a2 = CellCoord::parse("A2").unwrap();
    let b2 = CellCoord::parse("B2").unwrap();
    let c2 = CellCoord::parse("C2").unwrap();

    engine.set_formula(a2, "=B2 + 1").unwrap();
    engine.set_formula(b2, "=C2 + 1").unwrap();
    let err3 = engine.set_formula(c2, "=A2 + 1");
    assert!(matches!(err3, Err(FormulaError::CircularDependency(_))));
}

#[test]
fn test_multilevel_dirty_propagation() {
    let mut engine = SpreadsheetEngine::new();

    let a1 = CellCoord::parse("A1").unwrap();
    let b1 = CellCoord::parse("B1").unwrap();
    let c1 = CellCoord::parse("C1").unwrap();
    let d1 = CellCoord::parse("D1").unwrap();

    engine.set_value(a1, ComputedValue::Number(10.0));
    engine.set_formula(b1, "=A1 * 2").unwrap(); // 20
    engine.set_formula(c1, "=B1 + 5").unwrap(); // 25
    engine.set_formula(d1, "=C1 * 2").unwrap(); // 50

    assert_eq!(engine.get_value(&d1), ComputedValue::Number(50.0));

    // Mutate leaf root A1
    engine.set_value(a1, ComputedValue::Number(100.0));

    // B1 = 200, C1 = 205, D1 = 410
    assert_eq!(engine.get_value(&b1), ComputedValue::Number(200.0));
    assert_eq!(engine.get_value(&c1), ComputedValue::Number(205.0));
    assert_eq!(engine.get_value(&d1), ComputedValue::Number(410.0));
}
