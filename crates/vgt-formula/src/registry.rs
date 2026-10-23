//! Versioned Formula function compatibility registry.
//! The dispatcher remains the executable truth; this registry exposes stable family/version metadata
//! without creating a second evaluator.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FunctionFamily {
    MathStatistical,
    Logical,
    Text,
    DateTime,
    LookupReference,
    Financial,
    Information,
    Database,
    Engineering,
    DynamicArray,
    Matrix,
    Language,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompatibilityLevel {
    Supported,
    CompatibilityTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FunctionMetadata {
    pub name: &'static str,
    pub family: FunctionFamily,
    pub level: CompatibilityLevel,
    pub volatile: bool,
    pub notes: &'static str,
}

pub const FUNCTION_REGISTRY_VERSION: u32 = 2;

pub const MATH_STATISTICAL_FUNCTIONS: &[&str] = &[
    "SUM",
    "SUMIF",
    "SUMIFS",
    "PRODUCT",
    "ROUND",
    "ROUNDUP",
    "ROUNDDOWN",
    "MOD",
    "ABS",
    "SQRT",
    "POWER",
    "CEILING",
    "FLOOR",
    "AGGREGATE",
    "SUBTOTAL",
    "AVERAGE",
    "AVERAGEIF",
    "MEDIAN",
    "MODE",
    "COUNT",
    "COUNTA",
    "COUNTIF",
    "COUNTIFS",
    "COUNTBLANK",
    "STDEV",
    "STDEV.S",
    "VAR",
    "VAR.S",
    "MIN",
    "MAX",
    "LARGE",
    "SMALL",
];
pub const LOGICAL_FUNCTIONS: &[&str] = &[
    "IF", "IFS", "SWITCH", "AND", "OR", "NOT", "XOR", "IFERROR", "IFNA", "TRUE", "FALSE",
];
pub const LOOKUP_REFERENCE_FUNCTIONS: &[&str] = &[
    "XLOOKUP", "XMATCH", "INDEX", "MATCH", "VLOOKUP", "HLOOKUP", "OFFSET", "CHOOSE", "ROW",
    "COLUMN", "ROWS", "COLUMNS",
];
pub const TEXT_FUNCTIONS: &[&str] = &[
    "TEXT",
    "CONCAT",
    "CONCATENATE",
    "TEXTJOIN",
    "LEFT",
    "RIGHT",
    "MID",
    "LEN",
    "LOWER",
    "UPPER",
    "PROPER",
    "TRIM",
    "FIND",
    "SEARCH",
    "REPLACE",
    "SUBSTITUTE",
    "REPT",
];
pub const DATE_TIME_FUNCTIONS: &[&str] = &[
    "DATE",
    "TIME",
    "TODAY",
    "NOW",
    "DAY",
    "MONTH",
    "YEAR",
    "HOUR",
    "MINUTE",
    "SECOND",
    "WORKDAY",
    "NETWORKDAYS",
    "EDATE",
    "EOMONTH",
    "DATEDIF",
];
pub const FINANCIAL_FUNCTIONS: &[&str] = &["PV", "FV", "NPV", "PMT", "RATE", "NPER", "IRR"];
pub const DATABASE_FUNCTIONS: &[&str] = &["DSUM", "DCOUNT"];
pub const ENGINEERING_FUNCTIONS: &[&str] = &["DEC2HEX", "HEX2DEC", "CONVERT"];
pub const MATRIX_FUNCTIONS: &[&str] = &["TRANSPOSE", "MMULT"];
pub const INFORMATION_FUNCTIONS: &[&str] = &[
    "ISBLANK",
    "ISNUMBER",
    "ISTEXT",
    "ISNONTEXT",
    "ISLOGICAL",
    "ISERROR",
    "ISNA",
    "NA",
    "TYPE",
    "ERROR.TYPE",
];
pub const DYNAMIC_ARRAY_FUNCTIONS: &[&str] = &[
    "FILTER",
    "SORT",
    "SORTBY",
    "UNIQUE",
    "SEQUENCE",
    "RANDARRAY",
    "TAKE",
    "DROP",
    "CHOOSECOLS",
    "CHOOSEROWS",
];

pub const MODERN_COMPATIBILITY: &[FunctionMetadata] = &[
    FunctionMetadata {
        name: "XLOOKUP",
        family: FunctionFamily::LookupReference,
        level: CompatibilityLevel::Supported,
        volatile: false,
        notes: "Exact/approximate lookup semantics implemented.",
    },
    FunctionMetadata {
        name: "FILTER",
        family: FunctionFamily::DynamicArray,
        level: CompatibilityLevel::Supported,
        volatile: false,
        notes: "Dynamic array spill with bounded output.",
    },
    FunctionMetadata {
        name: "SORT",
        family: FunctionFamily::DynamicArray,
        level: CompatibilityLevel::Supported,
        volatile: false,
        notes: "Dynamic array sort.",
    },
    FunctionMetadata {
        name: "UNIQUE",
        family: FunctionFamily::DynamicArray,
        level: CompatibilityLevel::Supported,
        volatile: false,
        notes: "Dynamic array unique rows/values.",
    },
    FunctionMetadata {
        name: "LET",
        family: FunctionFamily::Language,
        level: CompatibilityLevel::CompatibilityTarget,
        volatile: false,
        notes:
            "Reserved target; unsupported versions return #NAME? rather than guessing semantics.",
    },
    FunctionMetadata {
        name: "LAMBDA",
        family: FunctionFamily::Language,
        level: CompatibilityLevel::CompatibilityTarget,
        volatile: false,
        notes: "Reserved target; unsupported versions preserve formula text and return #NAME?.",
    },
    FunctionMetadata {
        name: "TODAY",
        family: FunctionFamily::DateTime,
        level: CompatibilityLevel::Supported,
        volatile: true,
        notes: "Blocked when deterministic volatile policy is disabled.",
    },
    FunctionMetadata {
        name: "NOW",
        family: FunctionFamily::DateTime,
        level: CompatibilityLevel::Supported,
        volatile: true,
        notes: "Blocked when deterministic volatile policy is disabled.",
    },
    FunctionMetadata {
        name: "RANDARRAY",
        family: FunctionFamily::DynamicArray,
        level: CompatibilityLevel::Supported,
        volatile: true,
        notes: "Bounded array output; blocked by deterministic volatile policy.",
    },
];

fn contains(functions: &[&str], name: &str) -> bool {
    functions.contains(&name)
}

/// Family lookup for every function exposed by the executable dispatcher.
pub fn supported_family(name: &str) -> Option<FunctionFamily> {
    let upper = name.trim().to_ascii_uppercase();
    let name = upper.as_str();
    if contains(MATH_STATISTICAL_FUNCTIONS, name) {
        return Some(FunctionFamily::MathStatistical);
    }
    if contains(LOGICAL_FUNCTIONS, name) {
        return Some(FunctionFamily::Logical);
    }
    if contains(LOOKUP_REFERENCE_FUNCTIONS, name) {
        return Some(FunctionFamily::LookupReference);
    }
    if contains(TEXT_FUNCTIONS, name) {
        return Some(FunctionFamily::Text);
    }
    if contains(DATE_TIME_FUNCTIONS, name) {
        return Some(FunctionFamily::DateTime);
    }
    if contains(FINANCIAL_FUNCTIONS, name) {
        return Some(FunctionFamily::Financial);
    }
    if contains(DATABASE_FUNCTIONS, name) {
        return Some(FunctionFamily::Database);
    }
    if contains(ENGINEERING_FUNCTIONS, name) {
        return Some(FunctionFamily::Engineering);
    }
    if contains(MATRIX_FUNCTIONS, name) {
        return Some(FunctionFamily::Matrix);
    }
    if contains(INFORMATION_FUNCTIONS, name) {
        return Some(FunctionFamily::Information);
    }
    if contains(DYNAMIC_ARRAY_FUNCTIONS, name) {
        return Some(FunctionFamily::DynamicArray);
    }
    None
}

pub fn metadata(name: &str) -> Option<&'static FunctionMetadata> {
    let upper = name.trim().to_ascii_uppercase();
    MODERN_COMPATIBILITY
        .iter()
        .find(|item| item.name == upper.as_str())
}
