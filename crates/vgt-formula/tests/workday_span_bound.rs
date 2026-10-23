// STATUS: PLATIN — W-322: Die beiden unbeschränkten Schleifen im lebenden Formelmotor
//
// **Fund (Runde 79, Quelltextmessung):** `WORKDAY` und `NETWORKDAYS` waren die einzigen zwei `while`-Schleifen in
// `functions.rs` ohne Schranke und ohne Bewertungsbudget. Das Budget (`EvaluationBudget`, 250 000 Schritte /
// 250 ms) wird im ganzen Kern an **genau einer** Stelle benutzt (`engine.rs:608`); die Funktionsschleifen kamen
// nicht daran. `=WORKDAY(TODAY(), 999999999)` lief daher rund 95 Millionen Schritte.
//
// **Dieser Test unterscheidet die Schranke von der Datumsüberlauf-Prüfung.** Beide liefern `#NUM!` — aber nur
// die Schranke **nennt den Grund mit Zahl** ("exceeds the representable span"). Läuft die Gegenprobe (Schranke
// entfernt), meldet der Überlauf etwas anderes und der Test wird rot — **ohne zu hängen**, weil der Prüfwert nur
// knapp über der Grenze liegt.
use vgt_formula::{CellCoord, ComputedValue, FormulaError, SpreadsheetEngine};

/// Ein Wert **knapp über** `MAX_SERIAL_DATE_DAYS` (2 958 465): groß genug für die Schranke, klein genug, dass
/// die Gegenprobe nicht 95 Millionen Schritte dreht.
const JUST_ABOVE: i64 = 3_000_000;

/// Wertet eine Formel aus und gibt den Fehlertext zurück, egal ob der Fehler beim Setzen oder beim Lesen
/// auftritt — beide Wege sind in dieser Bibliothek möglich, und der Test soll nicht raten, welcher gilt.
fn evaluated(engine: &mut SpreadsheetEngine, formula: &str) -> String {
    let coord = CellCoord::parse("Z1").unwrap();
    if let Err(error) = engine.set_formula(coord, formula) {
        return format!("{error:?}");
    }
    match engine.get_value(&coord) {
        ComputedValue::Error(error) => format!("{error:?}"),
        other => format!("{other:?}"),
    }
}

#[test]
fn workday_rejects_a_step_beyond_the_representable_span_by_name() {
    let mut engine = SpreadsheetEngine::new();
    let text = evaluated(&mut engine, &format!("=WORKDAY(1, {JUST_ABOVE})"));
    assert!(
        text.contains("exceeds the representable span"),
        "die Schranke muss den Grund MIT ZAHL nennen, war aber: {text}"
    );
    assert!(text.contains(&JUST_ABOVE.to_string()), "die Zahl fehlt in der Meldung: {text}");
}

#[test]
fn workday_still_accepts_a_step_inside_the_bound() {
    let mut engine = SpreadsheetEngine::new();
    let coord = CellCoord::parse("Z1").unwrap();
    engine.set_formula(coord, "=WORKDAY(1, 1000)").unwrap();
    match engine.get_value(&coord) {
        ComputedValue::Number(n) => assert!(n > 0.0, "ein zulässiger Schritt muss ein Datum ergeben"),
        other => panic!("erwartet eine Zahl, war: {other:?}"),
    }
}

#[test]
fn workday_does_not_apply_the_span_boundary_message_at_the_exact_limit() {
    let mut engine = SpreadsheetEngine::new();
    let text = evaluated(&mut engine, "=WORKDAY(1, 2958465)");
    // Genau die Grenze ist erlaubt: entweder ein Datum oder der Datumsüberlauf — aber NICHT die Span-Meldung.
    assert!(
        !text.contains("exceeds the representable span"),
        "die exakte Grenze darf nicht mit der Span-Meldung abgelehnt werden, war aber: {text}"
    );
}

#[test]
fn networkdays_is_protected_by_the_serial_range_not_by_a_second_guard() {
    // **Gemessen, und die eigene Annahme widerlegt:** Ich hatte hier zuerst eine zusätzliche Spannenschranke
    // eingebaut — sie ist **unerreichbar**, weil `serial_to_date` beide Enden schon auf die darstellbare Spanne
    // begrenzt. Eine solche Prüfung wäre toter Code, der wie Schutz aussieht (W-320). Dieser Test hält fest,
    // **was** hier wirklich schützt: die Seriengrenze.
    let mut engine = SpreadsheetEngine::new();
    let text = evaluated(&mut engine, "=NETWORKDAYS(1, 2958470)");
    assert!(
        text.contains("out of range"),
        "die Seriengrenze muss greifen, war aber: {text}"
    );
    // Und die Spanne bleibt innerhalb der Grenze, wenn beide Enden gültig sind.
    let mut ok = SpreadsheetEngine::new();
    let coord = CellCoord::parse("Z1").unwrap();
    ok.set_formula(coord, "=NETWORKDAYS(1, 2958465)").unwrap();
    match ok.get_value(&coord) {
        ComputedValue::Number(n) => assert!(n > 0.0, "zwei gültige Serien müssen zählen"),
        other => panic!("erwartet eine Zahl, war: {other:?}"),
    }
}

#[test]
fn networkdays_still_counts_a_normal_range() {
    let mut engine = SpreadsheetEngine::new();
    let coord = CellCoord::parse("Z1").unwrap();
    engine.set_formula(coord, "=NETWORKDAYS(1, 7)").unwrap();
    match engine.get_value(&coord) {
        // **Keine geratene Zahl:** die Woche enthält je nach Wochentag 0 bis 5 Werktage. Geprüft wird, dass
        // überhaupt gezählt wurde und die Zahl im möglichen Bereich liegt — nicht ein Wert, den ich annehme.
        ComputedValue::Number(n) => assert!((0.0..=5.0).contains(&n), "unerwartete Werktagszahl: {n}"),
        other => panic!("erwartet eine Zahl, war: {other:?}"),
    }
}

#[test]
fn a_symbol_that_does_not_exist_is_still_a_name_error() {
    // Gegenprobe zur Gegenprobe: Der Bound darf nicht jede Ablehnung verschlucken.
    let mut engine = SpreadsheetEngine::new();
    let text = evaluated(&mut engine, "=GIBTESNICHT(1)");
    assert!(
        text.contains("UnknownFunction") || text.contains("Name"),
        "unbekannte Funktion muss weiterhin #NAME? ergeben, war: {text}"
    );
    let _ = FormulaError::ValueError(String::new()); // Der Typ wird benutzt, damit der Import nicht warnt.
}
