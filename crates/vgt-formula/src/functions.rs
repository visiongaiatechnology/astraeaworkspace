//! # VGT Formula Functions Library
//! Comprehensive implementation of standard Excel/Calc spreadsheet functions.
//! Covers Math/Trig, Statistical, Logical, Lookup/Ref, Text, Date/Time, Financial, Information, and Dynamic Arrays.

use chrono::{Datelike, NaiveDate, Timelike};
use crate::limits::{MAX_SERIAL_DATE_DAYS, MAX_WORKDAY_STEP_DAYS};
use rand::Rng;
use std::collections::HashMap;

use crate::types::{CellCoord, ComputedValue, Expr, FormulaError};

pub trait EngineContext {
    fn eval_expr(&self, expr: &Expr) -> ComputedValue;

    /// **Der Zeitpunkt der Auswertung** (W-426).
    ///
    /// Der **Standard** liest die Zone des Rechners (`chrono::Local`) — genau das Verhalten von vor W-426 ✓,
    /// damit **jede bestehende Implementierung unverändert weiter übersetzt** ✓. Eine Implementierung, die die
    /// Zone des **Nutzers** kennt, überschreibt diese Methode ✓ — und dann folgen `TODAY`/`NOW` dieser Zone ✓,
    /// statt der des Rechners ✗.
    ///
    /// **Die Naht ist absichtlich hier:** Die zwei Funktionen, die den Kontext früher *ignorierten*, sind die
    /// einzigen, die ihn *nicht bekamen* ✓. Mit dieser Methode sind **alle** Arme des Verteilers gleich geformt ✓
    /// — *eine Form, die man nicht übersehen kann, statt einer Sorgfalt, die man aufbringen muss* ✓.
    ///
    /// **W-426, der IPC-Pfad:** Ist für diesen Auswertungs-Thread eine Nutzerzone gesetzt (`UserZoneGuard` ✓),
    /// gilt **sie** ✓. Gesetzt wird sie **nur**, wenn die Nutzlast sie mitbringt ✓ — fehlt sie, bleibt es bei der
    /// Zone des Rechners ✓, und zwar **ohne** einen einzigen zusätzlichen Zweig ✗ (*genau der bisherige Ausdruck* ✓).
    fn now_local(&self) -> chrono::NaiveDateTime {
        let zone = AKTIVE_NUTZERZONE.with(|zelle| zelle.borrow().clone());
        match zone {
            // **Kein Wächter gesetzt** → dasselbe Verhalten wie vor W-426 ✓.
            None => chrono::Local::now().naive_local(),
            Some(zone) => {
                // Der **festgehaltene** Zeitpunkt macht dasselbe Ergebnis zweimal **gleich** ✓; ohne ihn gilt die
                // Uhr des Rechners ✓. Ein nicht darstellbarer Zeitpunkt wird **nicht** geraten ✗ — der IPC-Handler
                // lehnt ihn vorher **benannt** ab ✓, hier bleibt es bei der Uhr des Rechners ✓.
                let (utc_ms, utc) = match zone.at_utc_ms {
                    Some(ms) => match chrono::DateTime::from_timestamp_millis(ms) {
                        Some(zeit) => (ms, zeit.naive_utc()),
                        None => {
                            let jetzt = chrono::Utc::now();
                            (jetzt.timestamp_millis(), jetzt.naive_utc())
                        }
                    },
                    None => {
                        let jetzt = chrono::Utc::now();
                        (jetzt.timestamp_millis(), jetzt.naive_utc())
                    }
                };
                utc_to_user_local(
                    utc,
                    zone_offset_minutes(&zone.transitions, zone.fixed_offset_minutes, utc_ms),
                )
            }
        }
    }
    fn eval_to_matrix(&self, expr: &Expr) -> Vec<Vec<ComputedValue>>;
    fn flatten_expr(&self, expr: &Expr) -> Vec<ComputedValue>;
    fn current_coord(&self) -> Option<CellCoord>;
    fn get_cell_value(&self, coord: &CellCoord) -> ComputedValue;
}

// ---------------------------------------------------------------------------
// W-426: die Zone kommt von AUSSEN
// ---------------------------------------------------------------------------

/// **Eine Umstellung** der Zone: ab `at_utc_ms` gilt `offset_minutes` ✓.
///
/// Die Gestalt ist die des Vorrats aus **W-321** (`GridFormulaTimeZoneRule` ✓): eine **Tabelle von Übergängen** ✓,
/// keine Regel mit Sonderfällen ✓. Wer die Tabelle hat, hat die Zeitzone ✓.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimeZoneTransition {
    pub at_utc_ms: i64,
    pub offset_minutes: i32,
}

/// **Der Offset zu einem Zeitpunkt** — der der **letzten** Umstellung, die nicht nach ihm liegt ✓.
///
/// `None`, wenn **keine** Umstellung vorausgeht ✓: Eine Zone ohne bekannten Anfang ist **unbeantwortet** ✓, nicht
/// „UTC" ✗. Die Tabelle darf unsortiert sein ✓ — gesucht wird das **Maximum** der zutreffenden Übergänge ✓, nicht
/// der letzte Eintrag der Liste ✓ (*eine Reihenfolge anzunehmen wäre eine zweite, ungeschriebene Regel* ✓).
pub fn offset_from_transitions(transitions: &[TimeZoneTransition], utc_ms: i64) -> Option<i32> {
    transitions
        .iter()
        .filter(|u| u.at_utc_ms <= utc_ms)
        .max_by_key(|u| u.at_utc_ms)
        .map(|u| u.offset_minutes)
}

/// **Reine Umrechnung** von UTC auf die Nutzerzeit ✓ — der Offset wird **addiert**, nichts anderes.
///
/// `utc_offset_minutes` ist positiv **östlich** von UTC (Berlin im Winter: `+60`) ✓. Die Funktion ist damit
/// **deterministisch** und ohne Uhr prüfbar ✓ — *eine Umrechnung, die man nicht ohne Uhr prüfen kann, ist keine
/// Umrechnung, sondern eine Behauptung* ✓.
pub fn utc_to_user_local(utc: chrono::NaiveDateTime, utc_offset_minutes: i32) -> chrono::NaiveDateTime {
    utc + chrono::Duration::minutes(utc_offset_minutes as i64)
}

// ---------------------------------------------------------------------------
// W-426: die Zone der **Auswertung** — sie muss den Motor erreichen
// ---------------------------------------------------------------------------

thread_local! {
    /// **Die Zone, die für diesen Auswertungs-Thread gilt** ✓ (W-426).
    ///
    /// ***Warum nicht allein die Hülle `UserZoneContext`?*** Weil `SpreadsheetEngine` seine Funktionen mit **sich
    /// selbst** aufruft (`crates/vgt-formula/src/engine.rs:772`: `call_function(name, args, self)` ✓). Eine Hülle
    /// **um** den Motor wird deshalb **nie gefragt** ✗ — sie delegiert `eval_expr` an den Motor, und der Motor reicht
    /// wieder **sich selbst** in den Verteiler ✓, sodass `TODAY`/`NOW` unverändert die Zone des Rechners läsen ✗.
    /// *Gemessen, nicht vermutet* (siehe `w426_user_zone_im_motor_tests` ✓).
    ///
    /// Die Zone wird deshalb dort gesetzt, wo der Motor sie **fragt**: im Standard von `now_local` ✓. Der Wächter
    /// `UserZoneGuard` setzt sie und **nimmt sie zurück** ✓ — auch bei einer Panik ✓. **Ohne** gesetzte Zone gilt
    /// unverändert die Zone des Rechners ✓.
    static AKTIVE_NUTZERZONE: std::cell::RefCell<Option<AktiveZone>> = const { std::cell::RefCell::new(None) };
}

/// **Die gesetzte Zone** — **entweder** eine Übergangstabelle **oder** ein fester Offset ✓, nie beides geraten ✓.
#[derive(Debug, Clone, PartialEq, Eq)]
struct AktiveZone {
    transitions: Vec<TimeZoneTransition>,
    fixed_offset_minutes: Option<i32>,
    /// Der **festgehaltene** Zeitpunkt (ms seit der Epoche) ✓ — `None`: die Uhr des Rechners ✓.
    at_utc_ms: Option<i64>,
}

/// **Die eine Offset-Regel** ✓ — sie wird von **beiden** Gestalten benutzt (Hülle **und** Wächter ✓), damit es keine
/// zweite Regel gibt ✗: fester Offset ✓, sonst die **letzte** zutreffende Umstellung ✓, sonst UTC ✓.
fn zone_offset_minutes(
    transitions: &[TimeZoneTransition],
    fixed_offset_minutes: Option<i32>,
    utc_ms: i64,
) -> i32 {
    if let Some(fest) = fixed_offset_minutes {
        return fest;
    }
    offset_from_transitions(transitions, utc_ms).unwrap_or(0)
}

/// **Der Wächter der Zone** ✓ (W-426): setzt die Zone für die Dauer seiner Lebensdauer ✓ und **stellt den vorherigen
/// Zustand wieder her** ✓ — auch bei einer Panik ✓ (RAII ✓). Verschachtelte Wächter werden in **umgekehrter**
/// Reihenfolge zurückgenommen ✓.
#[derive(Debug)]
pub struct UserZoneGuard {
    vorher: Option<AktiveZone>,
}

impl UserZoneGuard {
    fn setze(
        transitions: Vec<TimeZoneTransition>,
        fixed_offset_minutes: Option<i32>,
        at_utc_ms: Option<i64>,
    ) -> Self {
        let vorher = AKTIVE_NUTZERZONE.with(|zelle| {
            zelle.borrow_mut().replace(AktiveZone {
                transitions,
                fixed_offset_minutes,
                at_utc_ms,
            })
        });
        Self { vorher }
    }
}

impl Drop for UserZoneGuard {
    fn drop(&mut self) {
        AKTIVE_NUTZERZONE.with(|zelle| {
            *zelle.borrow_mut() = self.vorher.take();
        });
    }
}

/// **Auch eine Ausleihe ist ein Kontext** ✓ — damit lässt sich eine `UserZoneContext`-Hülle **über** einem
/// vorhandenen Motor bilden (`UserZoneContext::new(&engine, offset)` ✓), **ohne** den Motor zu verschieben ✓.
impl<T: EngineContext + ?Sized> EngineContext for &T {
    fn eval_expr(&self, expr: &Expr) -> ComputedValue {
        (**self).eval_expr(expr)
    }
    fn eval_to_matrix(&self, expr: &Expr) -> Vec<Vec<ComputedValue>> {
        (**self).eval_to_matrix(expr)
    }
    fn flatten_expr(&self, expr: &Expr) -> Vec<ComputedValue> {
        (**self).flatten_expr(expr)
    }
    fn current_coord(&self) -> Option<CellCoord> {
        (**self).current_coord()
    }
    fn get_cell_value(&self, coord: &CellCoord) -> ComputedValue {
        (**self).get_cell_value(coord)
    }
    fn now_local(&self) -> chrono::NaiveDateTime {
        (**self).now_local()
    }
}

/// **Der Kontext, der die Nutzer-Zone kennt** ✓ — er **delegiert** alles außer der Zeit an einen inneren Kontext ✓.
///
/// Damit gibt es **keine** Platzhalter und **keine** Panik ✓: Wer diesen Kontext benutzt, bekommt für alle übrigen
/// Fragen dieselben Antworten wie zuvor ✓ — nur `TODAY`/`NOW` folgen jetzt dem **Nutzer** ✓ statt dem Rechner ✗.
pub struct UserZoneContext<C: EngineContext> {
    inner: C,
    /// **Die Übergangstabelle** ✓ — aus derselben Quelle wie der Vorrat aus **W-321** ✓. Sie ist die Zeitzone ✓.
    transitions: Vec<TimeZoneTransition>,
    /// Der feste Offset, **nur** für `new` ohne Tabelle ✓ — dann ist er die ganze Wahrheit ✓ (und der Aufrufer
    /// weiß das ✓).
    fixed_offset_minutes: Option<i32>,
}

impl<C: EngineContext> UserZoneContext<C> {
    /// **Mit festem Offset** ✓ — für Fälle ohne Übergangstabelle ✓ (z. B. eine Zone ohne Sommerzeit ✓).
    pub fn new(inner: C, utc_offset_minutes: i32) -> Self {
        Self { inner, transitions: Vec::new(), fixed_offset_minutes: Some(utc_offset_minutes) }
    }

    /// **Mit Übergangstabelle** ✓ — die **DST-fähige** Form ✓. Eine **leere** Tabelle wird abgelehnt ✓: Sie wäre eine
    /// Zone ohne jede Angabe ✗, und der Aufrufer soll das **hier** merken, nicht an einem falschen Datum später ✓.
    pub fn with_transitions(inner: C, transitions: Vec<TimeZoneTransition>) -> Result<Self, &'static str> {
        if transitions.is_empty() { return Err("w426: empty time zone table"); }
        Ok(Self { inner, transitions, fixed_offset_minutes: None })
    }

    /// **Der Offset zu einem Zeitpunkt** — **rein** ✓, ohne Uhr ✓, damit prüfbar ✓.
    ///
    /// Reihenfolge der Quellen: die **Tabelle** ✓ (die Regel ✓), sonst der **feste** Offset ✓, sonst **UTC** ✓ — der
    /// letzte Ausweg ist **sichtbar** und nicht stillschweigend ✗ ✓.
    pub fn offset_at(&self, utc_ms: i64) -> i32 {
        zone_offset_minutes(&self.transitions, self.fixed_offset_minutes, utc_ms)
    }

    /// Der Offset **jetzt** ✓ — die einzige Stelle mit einer Uhr ✓.
    pub fn utc_offset_minutes(&self) -> i32 {
        self.offset_at(chrono::Utc::now().timestamp_millis())
    }

    /// **Diese Zone für die Dauer des zurückgegebenen Wächters gültig machen** ✓ — der IPC-Pfad von W-426 ✓.
    ///
    /// *Warum ein Wächter und nicht die Hülle selbst?* Siehe `AKTIVE_NUTZERZONE` ✓: der **Motor** fragt die Hülle
    /// nicht ✓; der Wächter setzt die Zone dort, wo der Motor sie fragt ✓.
    ///
    /// **Fail-closed, nicht still** ✓: Eine Tabelle **ohne** Auswertungszeitpunkt wird abgelehnt ✓ (ohne Zeitpunkt
    /// wäre ihre Antwort geraten ✗), ein Zeitpunkt, den `chrono` nicht darstellen kann, ebenfalls ✓, und eine
    /// Tabelle, die den Zeitpunkt **nicht bedeckt**, ebenfalls ✓ — statt still „UTC 0" zu werden ✗.
    pub fn install_at(&self, at_utc_ms: Option<i64>) -> Result<UserZoneGuard, &'static str> {
        if !self.transitions.is_empty() {
            let ms = match at_utc_ms {
                Some(ms) => ms,
                None => return Err("w426: a transition table needs the evaluation instant"),
            };
            if chrono::DateTime::from_timestamp_millis(ms).is_none() {
                return Err("w426: evaluation instant is not representable");
            }
            if offset_from_transitions(&self.transitions, ms).is_none() {
                return Err("w426: time zone table does not cover the evaluation instant");
            }
        } else if let Some(ms) = at_utc_ms {
            if chrono::DateTime::from_timestamp_millis(ms).is_none() {
                return Err("w426: evaluation instant is not representable");
            }
        }
        Ok(UserZoneGuard::setze(
            self.transitions.clone(),
            self.fixed_offset_minutes,
            at_utc_ms,
        ))
    }
}

impl<C: EngineContext> EngineContext for UserZoneContext<C> {
    fn eval_expr(&self, expr: &Expr) -> ComputedValue { self.inner.eval_expr(expr) }
    fn eval_to_matrix(&self, expr: &Expr) -> Vec<Vec<ComputedValue>> { self.inner.eval_to_matrix(expr) }
    fn flatten_expr(&self, expr: &Expr) -> Vec<ComputedValue> { self.inner.flatten_expr(expr) }
    fn current_coord(&self) -> Option<CellCoord> { self.inner.current_coord() }
    fn get_cell_value(&self, coord: &CellCoord) -> ComputedValue { self.inner.get_cell_value(coord) }
    /// **Die Naht, gesetzt** ✓: UTC plus Nutzer-Offset ✓.
    fn now_local(&self) -> chrono::NaiveDateTime {
        utc_to_user_local(chrono::Utc::now().naive_utc(), self.utc_offset_minutes())
    }
}

// ---------------------------------------------------------------------------
// Helpers: Criteria Matching & Wildcards
// ---------------------------------------------------------------------------

pub fn matches_criteria(val: &ComputedValue, crit: &ComputedValue) -> bool {
    let crit_str = crit.as_string();
    let crit_trimmed = crit_str.trim();

    let (op, target_str) = if let Some(stripped) = crit_trimmed.strip_prefix(">=") {
        ("GTE", stripped.trim())
    } else if let Some(stripped) = crit_trimmed.strip_prefix("<=") {
        ("LTE", stripped.trim())
    } else if let Some(stripped) = crit_trimmed.strip_prefix("<>") {
        ("NEQ", stripped.trim())
    } else if let Some(stripped) = crit_trimmed.strip_prefix('>') {
        ("GT", stripped.trim())
    } else if let Some(stripped) = crit_trimmed.strip_prefix('<') {
        ("LT", stripped.trim())
    } else if let Some(stripped) = crit_trimmed.strip_prefix('=') {
        ("EQ", stripped.trim())
    } else {
        ("EQ", crit_trimmed)
    };

    if let Ok(target_num) = target_str.parse::<f64>() {
        if let Ok(val_num) = val.as_number() {
            return match op {
                "GTE" => val_num >= target_num,
                "LTE" => val_num <= target_num,
                "GT" => val_num > target_num,
                "LT" => val_num < target_num,
                "EQ" => (val_num - target_num).abs() < 1e-12,
                "NEQ" => (val_num - target_num).abs() >= 1e-12,
                _ => false,
            };
        }
    }

    let val_str = val.as_string();
    match op {
        "EQ" => wildcard_match(&target_str.to_uppercase(), &val_str.to_uppercase()),
        "NEQ" => !wildcard_match(&target_str.to_uppercase(), &val_str.to_uppercase()),
        "GT" => val_str.to_uppercase() > target_str.to_uppercase(),
        "LT" => val_str.to_uppercase() < target_str.to_uppercase(),
        "GTE" => val_str.to_uppercase() >= target_str.to_uppercase(),
        "LTE" => val_str.to_uppercase() <= target_str.to_uppercase(),
        _ => false,
    }
}

pub fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p_chars: Vec<char> = pattern.chars().collect();
    let t_chars: Vec<char> = text.chars().collect();
    let mut p = 0;
    let mut t = 0;
    let mut star_idx: Option<usize> = None;
    let mut match_idx = 0;

    while t < t_chars.len() {
        if p < p_chars.len() && (p_chars[p] == '?' || p_chars[p] == t_chars[t]) {
            p += 1;
            t += 1;
        } else if p < p_chars.len() && p_chars[p] == '*' {
            star_idx = Some(p);
            match_idx = t;
            p += 1;
        } else if let Some(s) = star_idx {
            p = s + 1;
            match_idx += 1;
            t = match_idx;
        } else {
            return false;
        }
    }

    while p < p_chars.len() && p_chars[p] == '*' {
        p += 1;
    }

    p == p_chars.len()
}

// ---------------------------------------------------------------------------
// Helpers: Date & Time Serial Conversion
// ---------------------------------------------------------------------------

pub fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

pub fn date_to_serial(date: NaiveDate) -> f64 {
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30).unwrap();
    let days = date.signed_duration_since(epoch).num_days();
    if days < 60 {
        (days + 1) as f64
    } else {
        days as f64
    }
}

pub fn serial_to_date(serial: f64) -> Result<NaiveDate, FormulaError> {
    if !(1.0..=MAX_SERIAL_DATE_DAYS as f64).contains(&serial) {
        return Err(FormulaError::NumError("Date serial out of range".into()));
    }
    let days = serial.floor() as i64;
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30).unwrap();
    let adjusted_days = if days < 60 {
        days - 1
    } else if days == 60 {
        59
    } else {
        days
    };
    epoch
        .checked_add_signed(chrono::Duration::days(adjusted_days))
        .ok_or_else(|| FormulaError::NumError("Date overflow".into()))
}

// ---------------------------------------------------------------------------
// Math / Trig Functions
// ---------------------------------------------------------------------------

pub fn eval_sum(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut sum = 0.0;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                sum += n;
            }
        }
    }
    ComputedValue::Number(sum)
}

pub fn eval_sumif(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 || args.len() > 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SUMIF requires 2 or 3 arguments".into(),
        ));
    }
    let range_vals = ctx.flatten_expr(&args[0]);
    let crit_val = ctx.eval_expr(&args[1]);
    let sum_vals = if args.len() == 3 {
        ctx.flatten_expr(&args[2])
    } else {
        range_vals.clone()
    };
    let mut sum = 0.0;
    for (i, r_val) in range_vals.iter().enumerate() {
        if matches_criteria(r_val, &crit_val) {
            if let Some(s_val) = sum_vals.get(i) {
                if let Ok(n) = s_val.as_number() {
                    sum += n;
                }
            }
        }
    }
    ComputedValue::Number(sum)
}

pub fn eval_sumifs(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 || args.len().is_multiple_of(2) {
        return ComputedValue::Error(FormulaError::ValueError(
            "SUMIFS requires sum_range and pairs of criteria_range and criteria".into(),
        ));
    }
    let sum_vals = ctx.flatten_expr(&args[0]);
    let num_pairs = (args.len() - 1) / 2;
    let mut criteria_pairs = Vec::new();
    for p in 0..num_pairs {
        let crange = ctx.flatten_expr(&args[1 + p * 2]);
        let crit = ctx.eval_expr(&args[2 + p * 2]);
        criteria_pairs.push((crange, crit));
    }
    let mut sum = 0.0;
    for (i, sum_val) in sum_vals.iter().enumerate() {
        let mut all_match = true;
        for (crange, crit) in &criteria_pairs {
            if let Some(cval) = crange.get(i) {
                if !matches_criteria(cval, crit) {
                    all_match = false;
                    break;
                }
            } else {
                all_match = false;
                break;
            }
        }
        if all_match {
            if let Ok(n) = sum_val.as_number() {
                sum += n;
            }
        }
    }
    ComputedValue::Number(sum)
}

pub fn eval_product(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut prod = 1.0;
    let mut found = false;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                prod *= n;
                found = true;
            }
        }
    }
    ComputedValue::Number(if found { prod } else { 0.0 })
}

pub fn eval_round(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "ROUND requires 2 arguments".into(),
        ));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let d = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i32,
        Err(e) => return ComputedValue::Error(e),
    };
    let factor = 10.0f64.powi(d);
    ComputedValue::Number((n * factor).round() / factor)
}

pub fn eval_roundup(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "ROUNDUP requires 2 arguments".into(),
        ));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let d = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i32,
        Err(e) => return ComputedValue::Error(e),
    };
    let factor = 10.0f64.powi(d);
    let res = if n >= 0.0 {
        (n * factor).ceil() / factor
    } else {
        (n * factor).floor() / factor
    };
    ComputedValue::Number(res)
}

pub fn eval_rounddown(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "ROUNDDOWN requires 2 arguments".into(),
        ));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let d = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i32,
        Err(e) => return ComputedValue::Error(e),
    };
    let factor = 10.0f64.powi(d);
    let res = if n >= 0.0 {
        (n * factor).floor() / factor
    } else {
        (n * factor).ceil() / factor
    };
    ComputedValue::Number(res)
}

pub fn eval_mod(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError("MOD requires 2 arguments".into()));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let d = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    if d == 0.0 {
        ComputedValue::Error(FormulaError::DivisionByZero)
    } else {
        ComputedValue::Number(n - d * (n / d).floor())
    }
}

pub fn eval_abs(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("ABS requires 1 argument".into()));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    ComputedValue::Number(n.abs())
}

pub fn eval_sqrt(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("SQRT requires 1 argument".into()));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    if n < 0.0 {
        ComputedValue::Error(FormulaError::NumError("Negative number in SQRT".into()))
    } else {
        ComputedValue::Number(n.sqrt())
    }
}

pub fn eval_power(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "POWER requires 2 arguments".into(),
        ));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let p = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    ComputedValue::Number(n.powf(p))
}

pub fn eval_ceiling(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "CEILING requires at least 1 argument".into(),
        ));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let s = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else if n >= 0.0 {
        1.0
    } else {
        -1.0
    };
    if s == 0.0 {
        ComputedValue::Number(0.0)
    } else if (n > 0.0 && s < 0.0) || (n < 0.0 && s > 0.0) {
        ComputedValue::Error(FormulaError::NumError("Opposite signs in CEILING".into()))
    } else {
        ComputedValue::Number((n / s).ceil() * s)
    }
}

pub fn eval_floor(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "FLOOR requires at least 1 argument".into(),
        ));
    }
    let n = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let s = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else if n >= 0.0 {
        1.0
    } else {
        -1.0
    };
    if s == 0.0 {
        ComputedValue::Error(FormulaError::DivisionByZero)
    } else if (n > 0.0 && s < 0.0) || (n < 0.0 && s > 0.0) {
        ComputedValue::Error(FormulaError::NumError("Opposite signs in FLOOR".into()))
    } else {
        ComputedValue::Number((n / s).floor() * s)
    }
}

pub fn eval_aggregate(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "AGGREGATE requires at least 3 arguments".into(),
        ));
    }
    let f_num = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v as u32,
        Err(e) => return ComputedValue::Error(e),
    };
    let opt = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as u32,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut vals = Vec::new();
    for arg in &args[2..] {
        for val in ctx.flatten_expr(arg) {
            if (opt == 6 || opt == 7) && val.is_error() {
                continue;
            }
            vals.push(val);
        }
    }
    match f_num {
        1 => {
            let mut sum = 0.0;
            let mut count = 0usize;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    sum += n;
                    count += 1;
                }
            }
            if count == 0 {
                ComputedValue::Error(FormulaError::DivisionByZero)
            } else {
                ComputedValue::Number(sum / count as f64)
            }
        }
        2 => {
            let count = vals
                .iter()
                .filter(|v| matches!(v, ComputedValue::Number(_)))
                .count();
            ComputedValue::Number(count as f64)
        }
        3 => {
            let count = vals.iter().filter(|v| !v.is_empty()).count();
            ComputedValue::Number(count as f64)
        }
        4 => {
            let mut max = f64::NEG_INFINITY;
            let mut found = false;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    if n > max {
                        max = n;
                        found = true;
                    }
                }
            }
            ComputedValue::Number(if found { max } else { 0.0 })
        }
        5 => {
            let mut min = f64::INFINITY;
            let mut found = false;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    if n < min {
                        min = n;
                        found = true;
                    }
                }
            }
            ComputedValue::Number(if found { min } else { 0.0 })
        }
        6 => {
            let mut prod = 1.0;
            let mut found = false;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    prod *= n;
                    found = true;
                }
            }
            ComputedValue::Number(if found { prod } else { 0.0 })
        }
        7 => {
            let mut nums = Vec::new();
            for v in vals {
                if let Ok(n) = v.as_number() {
                    nums.push(n);
                }
            }
            if nums.len() < 2 {
                ComputedValue::Error(FormulaError::DivisionByZero)
            } else {
                let mean = nums.iter().sum::<f64>() / nums.len() as f64;
                let var =
                    nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() - 1) as f64;
                ComputedValue::Number(var.sqrt())
            }
        }
        8 => {
            let mut nums = Vec::new();
            for v in vals {
                if let Ok(n) = v.as_number() {
                    nums.push(n);
                }
            }
            if nums.len() < 2 {
                ComputedValue::Error(FormulaError::DivisionByZero)
            } else {
                let mean = nums.iter().sum::<f64>() / nums.len() as f64;
                let var =
                    nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() - 1) as f64;
                ComputedValue::Number(var)
            }
        }
        9 => {
            let mut sum = 0.0;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    sum += n;
                }
            }
            ComputedValue::Number(sum)
        }
        10 => {
            let mut nums: Vec<f64> = vals.iter().filter_map(|v| v.as_number().ok()).collect();
            if nums.is_empty() {
                ComputedValue::Error(FormulaError::NumError("No numbers for MEDIAN".into()))
            } else {
                nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let mid = nums.len() / 2;
                if nums.len() % 2 == 1 {
                    ComputedValue::Number(nums[mid])
                } else {
                    ComputedValue::Number((nums[mid - 1] + nums[mid]) / 2.0)
                }
            }
        }
        _ => ComputedValue::Error(FormulaError::ValueError(
            "Unsupported AGGREGATE function_num".into(),
        )),
    }
}

pub fn eval_subtotal(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SUBTOTAL requires at least 2 arguments".into(),
        ));
    }
    let f_num = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v as u32,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut vals = Vec::new();
    for arg in &args[1..] {
        for val in ctx.flatten_expr(arg) {
            vals.push(val);
        }
    }
    let code = if f_num > 100 { f_num - 100 } else { f_num };
    match code {
        1 => {
            let mut sum = 0.0;
            let mut count = 0usize;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    sum += n;
                    count += 1;
                }
            }
            if count == 0 {
                ComputedValue::Error(FormulaError::DivisionByZero)
            } else {
                ComputedValue::Number(sum / count as f64)
            }
        }
        2 => {
            let count = vals
                .iter()
                .filter(|v| matches!(v, ComputedValue::Number(_)))
                .count();
            ComputedValue::Number(count as f64)
        }
        3 => {
            let count = vals.iter().filter(|v| !v.is_empty()).count();
            ComputedValue::Number(count as f64)
        }
        4 => {
            let mut max = f64::NEG_INFINITY;
            let mut found = false;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    if n > max {
                        max = n;
                        found = true;
                    }
                }
            }
            ComputedValue::Number(if found { max } else { 0.0 })
        }
        5 => {
            let mut min = f64::INFINITY;
            let mut found = false;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    if n < min {
                        min = n;
                        found = true;
                    }
                }
            }
            ComputedValue::Number(if found { min } else { 0.0 })
        }
        6 => {
            let mut prod = 1.0;
            let mut found = false;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    prod *= n;
                    found = true;
                }
            }
            ComputedValue::Number(if found { prod } else { 0.0 })
        }
        7 => {
            let mut nums = Vec::new();
            for v in vals {
                if let Ok(n) = v.as_number() {
                    nums.push(n);
                }
            }
            if nums.len() < 2 {
                ComputedValue::Error(FormulaError::DivisionByZero)
            } else {
                let mean = nums.iter().sum::<f64>() / nums.len() as f64;
                let var =
                    nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() - 1) as f64;
                ComputedValue::Number(var.sqrt())
            }
        }
        8 => {
            let mut nums = Vec::new();
            for v in vals {
                if let Ok(n) = v.as_number() {
                    nums.push(n);
                }
            }
            if nums.len() < 2 {
                ComputedValue::Error(FormulaError::DivisionByZero)
            } else {
                let mean = nums.iter().sum::<f64>() / nums.len() as f64;
                let var =
                    nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() - 1) as f64;
                ComputedValue::Number(var)
            }
        }
        9 => {
            let mut sum = 0.0;
            for v in vals {
                if let Ok(n) = v.as_number() {
                    sum += n;
                }
            }
            ComputedValue::Number(sum)
        }
        _ => ComputedValue::Error(FormulaError::ValueError(
            "Unsupported SUBTOTAL function_num".into(),
        )),
    }
}

// ---------------------------------------------------------------------------
// Statistical Functions
// ---------------------------------------------------------------------------

pub fn eval_average(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut sum = 0.0;
    let mut count = 0usize;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                sum += n;
                count += 1;
            }
        }
    }
    if count == 0 {
        ComputedValue::Error(FormulaError::DivisionByZero)
    } else {
        ComputedValue::Number(sum / count as f64)
    }
}

pub fn eval_averageif(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 || args.len() > 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "AVERAGEIF requires 2 or 3 arguments".into(),
        ));
    }
    let range_vals = ctx.flatten_expr(&args[0]);
    let crit_val = ctx.eval_expr(&args[1]);
    let avg_vals = if args.len() == 3 {
        ctx.flatten_expr(&args[2])
    } else {
        range_vals.clone()
    };
    let mut sum = 0.0;
    let mut count = 0usize;
    for (i, r_val) in range_vals.iter().enumerate() {
        if matches_criteria(r_val, &crit_val) {
            if let Some(a_val) = avg_vals.get(i) {
                if let Ok(n) = a_val.as_number() {
                    sum += n;
                    count += 1;
                }
            }
        }
    }
    if count == 0 {
        ComputedValue::Error(FormulaError::DivisionByZero)
    } else {
        ComputedValue::Number(sum / count as f64)
    }
}

pub fn eval_median(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut nums = Vec::new();
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                nums.push(n);
            }
        }
    }
    if nums.is_empty() {
        return ComputedValue::Error(FormulaError::NumError("No numbers for MEDIAN".into()));
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = nums.len() / 2;
    if nums.len() % 2 == 1 {
        ComputedValue::Number(nums[mid])
    } else {
        ComputedValue::Number((nums[mid - 1] + nums[mid]) / 2.0)
    }
}

pub fn eval_mode(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut counts: HashMap<i64, (f64, usize)> = HashMap::new();
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                let key = (n * 1_000_000.0).round() as i64;
                counts.entry(key).and_modify(|e| e.1 += 1).or_insert((n, 1));
            }
        }
    }
    let mut max_freq = 1;
    let mut mode_val = None;
    for (_key, (val, freq)) in counts {
        if freq > max_freq {
            max_freq = freq;
            mode_val = Some(val);
        }
    }
    match mode_val {
        Some(v) => ComputedValue::Number(v),
        None => ComputedValue::Error(FormulaError::NAError),
    }
}

pub fn eval_count(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut count = 0usize;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if matches!(val, ComputedValue::Number(_)) {
                count += 1;
            }
        }
    }
    ComputedValue::Number(count as f64)
}

pub fn eval_counta(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut count = 0usize;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if !val.is_empty() {
                count += 1;
            }
        }
    }
    ComputedValue::Number(count as f64)
}

pub fn eval_countif(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "COUNTIF requires 2 arguments".into(),
        ));
    }
    let range_vals = ctx.flatten_expr(&args[0]);
    let crit_val = ctx.eval_expr(&args[1]);
    let mut count = 0usize;
    for r_val in &range_vals {
        if matches_criteria(r_val, &crit_val) {
            count += 1;
        }
    }
    ComputedValue::Number(count as f64)
}

pub fn eval_countifs(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() || !args.len().is_multiple_of(2) {
        return ComputedValue::Error(FormulaError::ValueError(
            "COUNTIFS requires pairs of criteria_range and criteria".into(),
        ));
    }
    let num_pairs = args.len() / 2;
    let mut criteria_pairs = Vec::new();
    for p in 0..num_pairs {
        let crange = ctx.flatten_expr(&args[p * 2]);
        let crit = ctx.eval_expr(&args[p * 2 + 1]);
        criteria_pairs.push((crange, crit));
    }
    let total_len = if !criteria_pairs.is_empty() {
        criteria_pairs[0].0.len()
    } else {
        0
    };
    let mut count = 0usize;
    for i in 0..total_len {
        let mut all_match = true;
        for (crange, crit) in &criteria_pairs {
            if let Some(cval) = crange.get(i) {
                if !matches_criteria(cval, crit) {
                    all_match = false;
                    break;
                }
            } else {
                all_match = false;
                break;
            }
        }
        if all_match {
            count += 1;
        }
    }
    ComputedValue::Number(count as f64)
}

pub fn eval_countblank(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "COUNTBLANK requires 1 argument".into(),
        ));
    }
    let mut count = 0usize;
    for val in ctx.flatten_expr(&args[0]) {
        let is_blank = val.is_empty()
            || match &val {
                ComputedValue::String(s) => s.is_empty(),
                _ => false,
            };
        if is_blank {
            count += 1;
        }
    }
    ComputedValue::Number(count as f64)
}

pub fn eval_stdev(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut nums = Vec::new();
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                nums.push(n);
            }
        }
    }
    if nums.len() < 2 {
        ComputedValue::Error(FormulaError::DivisionByZero)
    } else {
        let mean = nums.iter().sum::<f64>() / nums.len() as f64;
        let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() - 1) as f64;
        ComputedValue::Number(var.sqrt())
    }
}

pub fn eval_var(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut nums = Vec::new();
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                nums.push(n);
            }
        }
    }
    if nums.len() < 2 {
        ComputedValue::Error(FormulaError::DivisionByZero)
    } else {
        let mean = nums.iter().sum::<f64>() / nums.len() as f64;
        let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() - 1) as f64;
        ComputedValue::Number(var)
    }
}

pub fn eval_min(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut min = f64::INFINITY;
    let mut found = false;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                if n < min {
                    min = n;
                    found = true;
                }
            }
        }
    }
    ComputedValue::Number(if found { min } else { 0.0 })
}

pub fn eval_max(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut max = f64::NEG_INFINITY;
    let mut found = false;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if let Ok(n) = val.as_number() {
                if n > max {
                    max = n;
                    found = true;
                }
            }
        }
    }
    ComputedValue::Number(if found { max } else { 0.0 })
}

pub fn eval_large(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "LARGE requires 2 arguments".into(),
        ));
    }
    let mut nums = Vec::new();
    for val in ctx.flatten_expr(&args[0]) {
        if let Ok(n) = val.as_number() {
            nums.push(n);
        }
    }
    let k = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if k == 0 || k > nums.len() {
        return ComputedValue::Error(FormulaError::NumError("k out of bounds in LARGE".into()));
    }
    nums.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    ComputedValue::Number(nums[k - 1])
}

pub fn eval_small(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SMALL requires 2 arguments".into(),
        ));
    }
    let mut nums = Vec::new();
    for val in ctx.flatten_expr(&args[0]) {
        if let Ok(n) = val.as_number() {
            nums.push(n);
        }
    }
    let k = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if k == 0 || k > nums.len() {
        return ComputedValue::Error(FormulaError::NumError("k out of bounds in SMALL".into()));
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    ComputedValue::Number(nums[k - 1])
}

// ---------------------------------------------------------------------------
// Helper: Flatten Matrix
// ---------------------------------------------------------------------------

fn flatten_matrix(matrix: &[Vec<ComputedValue>]) -> Vec<ComputedValue> {
    let mut list = Vec::new();
    for row in matrix {
        for val in row {
            list.push(val.clone());
        }
    }
    list
}

// ---------------------------------------------------------------------------
// Logical Functions
// ---------------------------------------------------------------------------

pub fn eval_if(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 || args.len() > 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "IF requires 2 or 3 arguments".into(),
        ));
    }
    let cond = ctx.eval_expr(&args[0]);
    if cond.is_truthy() {
        ctx.eval_expr(&args[1])
    } else if args.len() == 3 {
        ctx.eval_expr(&args[2])
    } else {
        ComputedValue::Boolean(false)
    }
}

pub fn eval_ifs(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() || !args.len().is_multiple_of(2) {
        return ComputedValue::Error(FormulaError::ValueError(
            "IFS requires an even number of arguments".into(),
        ));
    }
    for i in (0..args.len()).step_by(2) {
        let cond = ctx.eval_expr(&args[i]);
        if cond.is_truthy() {
            return ctx.eval_expr(&args[i + 1]);
        }
    }
    ComputedValue::Error(FormulaError::NAError)
}

pub fn eval_switch(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SWITCH requires at least 3 arguments".into(),
        ));
    }
    let target = ctx.eval_expr(&args[0]);
    let has_default = (args.len() - 1) % 2 == 1;
    let pairs_count = (args.len() - 1) / 2;
    for i in 0..pairs_count {
        let match_val = ctx.eval_expr(&args[1 + i * 2]);
        if target == match_val {
            return ctx.eval_expr(&args[2 + i * 2]);
        }
    }
    if has_default {
        ctx.eval_expr(args.last().unwrap())
    } else {
        ComputedValue::Error(FormulaError::NAError)
    }
}

pub fn eval_and(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "AND requires at least 1 argument".into(),
        ));
    }
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if !val.is_truthy() {
                return ComputedValue::Boolean(false);
            }
        }
    }
    ComputedValue::Boolean(true)
}

pub fn eval_or(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "OR requires at least 1 argument".into(),
        ));
    }
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if val.is_truthy() {
                return ComputedValue::Boolean(true);
            }
        }
    }
    ComputedValue::Boolean(false)
}

pub fn eval_not(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("NOT requires 1 argument".into()));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(!val.is_truthy())
}

pub fn eval_xor(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut true_count = 0usize;
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            if val.is_truthy() {
                true_count += 1;
            }
        }
    }
    ComputedValue::Boolean(true_count % 2 == 1)
}

pub fn eval_iferror(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "IFERROR requires 2 arguments".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    if val.is_error() {
        ctx.eval_expr(&args[1])
    } else {
        val
    }
}

pub fn eval_ifna(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError("IFNA requires 2 arguments".into()));
    }
    let val = ctx.eval_expr(&args[0]);
    if matches!(val, ComputedValue::Error(FormulaError::NAError)) {
        ctx.eval_expr(&args[1])
    } else {
        val
    }
}

// ---------------------------------------------------------------------------
// Lookup & Reference Functions
// ---------------------------------------------------------------------------

pub fn eval_xlookup(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "XLOOKUP requires at least 3 arguments".into(),
        ));
    }
    let lk_val = ctx.eval_expr(&args[0]);
    let lk_matrix = ctx.eval_to_matrix(&args[1]);
    let ret_matrix = ctx.eval_to_matrix(&args[2]);

    let lk_list = flatten_matrix(&lk_matrix);
    let ret_list = flatten_matrix(&ret_matrix);

    let match_mode = if args.len() > 4 {
        ctx.eval_expr(&args[4]).as_number().unwrap_or(0.0) as i32
    } else {
        0
    };
    let search_mode = if args.len() > 5 {
        ctx.eval_expr(&args[5]).as_number().unwrap_or(1.0) as i32
    } else {
        1
    };

    let n = lk_list.len();
    if n == 0 {
        return if args.len() > 3 {
            ctx.eval_expr(&args[3])
        } else {
            ComputedValue::Error(FormulaError::NAError)
        };
    }

    let indices: Vec<usize> = if search_mode == -1 {
        (0..n).rev().collect()
    } else {
        (0..n).collect()
    };

    let mut found_idx = None;
    for idx in indices {
        let item = &lk_list[idx];
        match match_mode {
            0 => {
                if item == &lk_val {
                    found_idx = Some(idx);
                    break;
                }
            }
            2 => {
                let pat = lk_val.as_string().to_uppercase();
                let txt = item.as_string().to_uppercase();
                if wildcard_match(&pat, &txt) {
                    found_idx = Some(idx);
                    break;
                }
            }
            _ => {
                if item == &lk_val {
                    found_idx = Some(idx);
                    break;
                }
            }
        }
    }

    if found_idx.is_none() && (match_mode == -1 || match_mode == 1) {
        if let Ok(lk_num) = lk_val.as_number() {
            let mut best_diff = f64::INFINITY;
            let mut best_idx = None;
            for (idx, item) in lk_list.iter().enumerate() {
                if let Ok(item_num) = item.as_number() {
                    if match_mode == -1 && item_num <= lk_num {
                        let diff = lk_num - item_num;
                        if diff < best_diff {
                            best_diff = diff;
                            best_idx = Some(idx);
                        }
                    } else if match_mode == 1 && item_num >= lk_num {
                        let diff = item_num - lk_num;
                        if diff < best_diff {
                            best_diff = diff;
                            best_idx = Some(idx);
                        }
                    }
                }
            }
            found_idx = best_idx;
        }
    }

    match found_idx {
        Some(idx) => {
            if idx < ret_list.len() {
                ret_list[idx].clone()
            } else {
                ComputedValue::Empty
            }
        }
        None => {
            if args.len() > 3 {
                ctx.eval_expr(&args[3])
            } else {
                ComputedValue::Error(FormulaError::NAError)
            }
        }
    }
}

pub fn eval_xmatch(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "XMATCH requires at least 2 arguments".into(),
        ));
    }
    let lk_val = ctx.eval_expr(&args[0]);
    let lk_matrix = ctx.eval_to_matrix(&args[1]);
    let lk_list = flatten_matrix(&lk_matrix);

    let match_mode = if args.len() > 2 {
        ctx.eval_expr(&args[2]).as_number().unwrap_or(0.0) as i32
    } else {
        0
    };
    let search_mode = if args.len() > 3 {
        ctx.eval_expr(&args[3]).as_number().unwrap_or(1.0) as i32
    } else {
        1
    };

    let n = lk_list.len();
    let indices: Vec<usize> = if search_mode == -1 {
        (0..n).rev().collect()
    } else {
        (0..n).collect()
    };

    for idx in indices {
        let item = &lk_list[idx];
        if match_mode == 0 {
            if item == &lk_val {
                return ComputedValue::Number((idx + 1) as f64);
            }
        } else if match_mode == 2 {
            let pat = lk_val.as_string().to_uppercase();
            let txt = item.as_string().to_uppercase();
            if wildcard_match(&pat, &txt) {
                return ComputedValue::Number((idx + 1) as f64);
            }
        } else if item == &lk_val {
            return ComputedValue::Number((idx + 1) as f64);
        }
    }

    ComputedValue::Error(FormulaError::NAError)
}

pub fn eval_index(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "INDEX requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Error(FormulaError::RefError);
    }
    let row_num = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    let col_num = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        if matrix[0].len() == 1 {
            1
        } else {
            0
        }
    };

    if row_num == 0 && col_num == 0 {
        ComputedValue::Array(matrix)
    } else if row_num == 0 {
        if col_num < 1 || col_num > matrix[0].len() {
            ComputedValue::Error(FormulaError::RefError)
        } else {
            let col_data: Vec<Vec<ComputedValue>> = matrix
                .iter()
                .map(|r| vec![r[col_num - 1].clone()])
                .collect();
            ComputedValue::Array(col_data)
        }
    } else if col_num == 0 {
        if row_num < 1 || row_num > matrix.len() {
            ComputedValue::Error(FormulaError::RefError)
        } else {
            ComputedValue::Array(vec![matrix[row_num - 1].clone()])
        }
    } else {
        if row_num < 1 || row_num > matrix.len() || col_num < 1 || col_num > matrix[0].len() {
            ComputedValue::Error(FormulaError::RefError)
        } else {
            matrix[row_num - 1][col_num - 1].clone()
        }
    }
}

pub fn eval_match(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "MATCH requires at least 2 arguments".into(),
        ));
    }
    let lk_val = ctx.eval_expr(&args[0]);
    let list = ctx.flatten_expr(&args[1]);
    let m_type = if args.len() > 2 {
        ctx.eval_expr(&args[2]).as_number().unwrap_or(1.0) as i32
    } else {
        1
    };

    if m_type == 0 {
        for (i, item) in list.iter().enumerate() {
            if item == &lk_val {
                return ComputedValue::Number((i + 1) as f64);
            }
            if let ComputedValue::String(s) = item {
                if let ComputedValue::String(p) = &lk_val {
                    if wildcard_match(&p.to_uppercase(), &s.to_uppercase()) {
                        return ComputedValue::Number((i + 1) as f64);
                    }
                }
            }
        }
        ComputedValue::Error(FormulaError::NAError)
    } else if m_type == 1 {
        let lk_num = match lk_val.as_number() {
            Ok(n) => n,
            Err(_) => return ComputedValue::Error(FormulaError::NAError),
        };
        let mut last_valid = None;
        for (i, item) in list.iter().enumerate() {
            if let Ok(n) = item.as_number() {
                if n <= lk_num {
                    last_valid = Some(i + 1);
                } else {
                    break;
                }
            }
        }
        match last_valid {
            Some(idx) => ComputedValue::Number(idx as f64),
            None => ComputedValue::Error(FormulaError::NAError),
        }
    } else {
        let lk_num = match lk_val.as_number() {
            Ok(n) => n,
            Err(_) => return ComputedValue::Error(FormulaError::NAError),
        };
        let mut last_valid = None;
        for (i, item) in list.iter().enumerate() {
            if let Ok(n) = item.as_number() {
                if n >= lk_num {
                    last_valid = Some(i + 1);
                } else {
                    break;
                }
            }
        }
        match last_valid {
            Some(idx) => ComputedValue::Number(idx as f64),
            None => ComputedValue::Error(FormulaError::NAError),
        }
    }
}

pub fn eval_vlookup(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "VLOOKUP requires at least 3 arguments".into(),
        ));
    }
    let lk_val = ctx.eval_expr(&args[0]);
    let matrix = ctx.eval_to_matrix(&args[1]);
    if matrix.is_empty() {
        return ComputedValue::Error(FormulaError::NAError);
    }
    let col_idx = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if col_idx < 1 || col_idx > matrix[0].len() {
        return ComputedValue::Error(FormulaError::RefError);
    }
    let range_lookup = if args.len() > 3 {
        ctx.eval_expr(&args[3]).is_truthy()
    } else {
        true
    };

    if !range_lookup {
        for row in &matrix {
            let key = &row[0];
            if key == &lk_val {
                return row[col_idx - 1].clone();
            }
            if let (ComputedValue::String(k_str), ComputedValue::String(lk_str)) = (key, &lk_val) {
                if wildcard_match(&lk_str.to_uppercase(), &k_str.to_uppercase()) {
                    return row[col_idx - 1].clone();
                }
            }
        }
        ComputedValue::Error(FormulaError::NAError)
    } else {
        let lk_num = match lk_val.as_number() {
            Ok(n) => n,
            Err(_) => return ComputedValue::Error(FormulaError::NAError),
        };
        let mut last_row = None;
        for row in &matrix {
            if let Ok(n) = row[0].as_number() {
                if n <= lk_num {
                    last_row = Some(row);
                } else {
                    break;
                }
            }
        }
        match last_row {
            Some(row) => row[col_idx - 1].clone(),
            None => ComputedValue::Error(FormulaError::NAError),
        }
    }
}

pub fn eval_hlookup(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "HLOOKUP requires at least 3 arguments".into(),
        ));
    }
    let lk_val = ctx.eval_expr(&args[0]);
    let matrix = ctx.eval_to_matrix(&args[1]);
    if matrix.is_empty() {
        return ComputedValue::Error(FormulaError::NAError);
    }
    let row_idx = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if row_idx < 1 || row_idx > matrix.len() {
        return ComputedValue::Error(FormulaError::RefError);
    }
    let range_lookup = if args.len() > 3 {
        ctx.eval_expr(&args[3]).is_truthy()
    } else {
        true
    };

    let cols = matrix[0].len();
    if !range_lookup {
        for (c, key) in matrix[0].iter().take(cols).enumerate() {
            if key == &lk_val {
                return matrix[row_idx - 1][c].clone();
            }
        }
        ComputedValue::Error(FormulaError::NAError)
    } else {
        let lk_num = match lk_val.as_number() {
            Ok(n) => n,
            Err(_) => return ComputedValue::Error(FormulaError::NAError),
        };
        let mut last_c = None;
        for (c, key) in matrix[0].iter().take(cols).enumerate() {
            if let Ok(n) = key.as_number() {
                if n <= lk_num {
                    last_c = Some(c);
                } else {
                    break;
                }
            }
        }
        match last_c {
            Some(c) => matrix[row_idx - 1][c].clone(),
            None => ComputedValue::Error(FormulaError::NAError),
        }
    }
}

pub fn eval_offset(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "OFFSET requires at least 3 arguments".into(),
        ));
    }
    let base_coord = match &args[0] {
        Expr::CellRef(c) => *c,
        Expr::RangeRef(start, _) => *start,
        _ => return ComputedValue::Error(FormulaError::RefError),
    };
    let rows = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    let cols = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    let height = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let width = if args.len() > 4 {
        match ctx.eval_expr(&args[4]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };

    let target_row = base_coord.row as i64 + rows;
    let target_col = base_coord.col as i64 + cols;

    if target_row < 0 || target_col < 0 {
        return ComputedValue::Error(FormulaError::RefError);
    }
    let start_row = target_row as u32;
    let start_col = target_col as u32;

    if start_col + width as u32 > CellCoord::MAX_COLS
        || start_row + height as u32 > CellCoord::MAX_ROWS
    {
        return ComputedValue::Error(FormulaError::RefError);
    }

    if height == 1 && width == 1 {
        ctx.get_cell_value(&CellCoord::new(start_col, start_row))
    } else {
        let mut grid = Vec::new();
        for r in 0..height {
            let mut row = Vec::new();
            for c in 0..width {
                row.push(
                    ctx.get_cell_value(&CellCoord::new(start_col + c as u32, start_row + r as u32)),
                );
            }
            grid.push(row);
        }
        ComputedValue::Array(grid)
    }
}

pub fn eval_choose(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "CHOOSE requires at least 2 arguments".into(),
        ));
    }
    let idx = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if idx < 1 || idx >= args.len() {
        ComputedValue::Error(FormulaError::ValueError(
            "CHOOSE index out of bounds".into(),
        ))
    } else {
        ctx.eval_expr(&args[idx])
    }
}

pub fn eval_row(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        match ctx.current_coord() {
            Some(c) => ComputedValue::Number((c.row + 1) as f64),
            None => ComputedValue::Number(1.0),
        }
    } else {
        match &args[0] {
            Expr::CellRef(c) => ComputedValue::Number((c.row + 1) as f64),
            Expr::RangeRef(start, _) => ComputedValue::Number((start.row + 1) as f64),
            _ => ComputedValue::Number(1.0),
        }
    }
}

pub fn eval_column(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        match ctx.current_coord() {
            Some(c) => ComputedValue::Number((c.col + 1) as f64),
            None => ComputedValue::Number(1.0),
        }
    } else {
        match &args[0] {
            Expr::CellRef(c) => ComputedValue::Number((c.col + 1) as f64),
            Expr::RangeRef(start, _) => ComputedValue::Number((start.col + 1) as f64),
            _ => ComputedValue::Number(1.0),
        }
    }
}

pub fn eval_rows(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("ROWS requires 1 argument".into()));
    }
    match &args[0] {
        Expr::RangeRef(start, end) => {
            let r = start.row.max(end.row) - start.row.min(end.row) + 1;
            ComputedValue::Number(r as f64)
        }
        _ => {
            let m = ctx.eval_to_matrix(&args[0]);
            ComputedValue::Number(m.len() as f64)
        }
    }
}

pub fn eval_columns(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "COLUMNS requires 1 argument".into(),
        ));
    }
    match &args[0] {
        Expr::RangeRef(start, end) => {
            let c = start.col.max(end.col) - start.col.min(end.col) + 1;
            ComputedValue::Number(c as f64)
        }
        _ => {
            let m = ctx.eval_to_matrix(&args[0]);
            let cols = if m.is_empty() { 0 } else { m[0].len() };
            ComputedValue::Number(cols as f64)
        }
    }
}

// ---------------------------------------------------------------------------
// Text Functions
// ---------------------------------------------------------------------------

pub fn eval_text_fn(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError("TEXT requires 2 arguments".into()));
    }
    let val = ctx.eval_expr(&args[0]);
    let fmt = ctx.eval_expr(&args[1]).as_string();
    if let Ok(n) = val.as_number() {
        let fmt_upper = fmt.trim().to_uppercase();
        if fmt_upper == "0" {
            ComputedValue::String(format!("{}", n.round() as i64))
        } else if fmt_upper == "0.0" {
            ComputedValue::String(format!("{:.1}", n))
        } else if fmt_upper == "0.00" {
            ComputedValue::String(format!("{:.2}", n))
        } else if fmt_upper == "0%" {
            ComputedValue::String(format!("{}%", (n * 100.0).round() as i64))
        } else if fmt_upper == "0.00%" {
            ComputedValue::String(format!("{:.2}%", n * 100.0))
        } else if fmt_upper == "#,##0" {
            let int_part = n.round() as i64;
            ComputedValue::String(format_thousands(int_part))
        } else if fmt_upper == "#,##0.00" {
            let int_part = n.trunc() as i64;
            let fract = (n.fract().abs() * 100.0).round() as u64;
            ComputedValue::String(format!("{}.{:02}", format_thousands(int_part), fract))
        } else if fmt_upper.contains("YYYY") || fmt_upper.contains("MM") || fmt_upper.contains("DD")
        {
            if let Ok(date) = serial_to_date(n) {
                let s = fmt
                    .replace("YYYY", &format!("{:04}", date.year()))
                    .replace("yyyy", &format!("{:04}", date.year()))
                    .replace("MM", &format!("{:02}", date.month()))
                    .replace("mm", &format!("{:02}", date.month()))
                    .replace("DD", &format!("{:02}", date.day()))
                    .replace("dd", &format!("{:02}", date.day()));
                ComputedValue::String(s)
            } else {
                ComputedValue::String(val.as_string())
            }
        } else {
            ComputedValue::String(val.as_string())
        }
    } else {
        ComputedValue::String(val.as_string())
    }
}

fn format_thousands(n: i64) -> String {
    let s = n.abs().to_string();
    let mut result = String::new();
    for (count, ch) in s.chars().rev().enumerate() {
        if count > 0 && count.is_multiple_of(3) {
            result.insert(0, ',');
        }
        result.insert(0, ch);
    }
    if n < 0 {
        result.insert(0, '-');
    }
    result
}

pub fn eval_concat(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let mut s = String::new();
    for arg in args {
        for val in ctx.flatten_expr(arg) {
            s.push_str(&val.as_string());
        }
    }
    ComputedValue::String(s)
}

pub fn eval_textjoin(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "TEXTJOIN requires at least 3 arguments".into(),
        ));
    }
    let delim = ctx.eval_expr(&args[0]).as_string();
    let ignore_empty = ctx.eval_expr(&args[1]).is_truthy();
    let mut items = Vec::new();
    for arg in &args[2..] {
        for val in ctx.flatten_expr(arg) {
            let s = val.as_string();
            if ignore_empty && (val.is_empty() || s.is_empty()) {
                continue;
            }
            items.push(s);
        }
    }
    ComputedValue::String(items.join(&delim))
}

pub fn eval_left(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "LEFT requires at least 1 argument".into(),
        ));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    let count = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v.max(0.0) as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let chars: Vec<char> = s.chars().collect();
    let take_count = count.min(chars.len());
    let res: String = chars[..take_count].iter().collect();
    ComputedValue::String(res)
}

pub fn eval_right(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "RIGHT requires at least 1 argument".into(),
        ));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    let count = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v.max(0.0) as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let chars: Vec<char> = s.chars().collect();
    let take_count = count.min(chars.len());
    let start = chars.len() - take_count;
    let res: String = chars[start..].iter().collect();
    ComputedValue::String(res)
}

pub fn eval_mid(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError("MID requires 3 arguments".into()));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    let start_num = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    let count = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v.max(0.0) as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if start_num == 0 {
        return ComputedValue::Error(FormulaError::ValueError("start_num must be >= 1".into()));
    }
    let chars: Vec<char> = s.chars().collect();
    if start_num > chars.len() {
        return ComputedValue::String("".into());
    }
    let start_idx = start_num - 1;
    let end_idx = (start_idx + count).min(chars.len());
    let res: String = chars[start_idx..end_idx].iter().collect();
    ComputedValue::String(res)
}

pub fn eval_len(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("LEN requires 1 argument".into()));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    ComputedValue::Number(s.chars().count() as f64)
}

pub fn eval_lower(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("LOWER requires 1 argument".into()));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    ComputedValue::String(s.to_lowercase())
}

pub fn eval_upper(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("UPPER requires 1 argument".into()));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    ComputedValue::String(s.to_uppercase())
}

pub fn eval_proper(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "PROPER requires 1 argument".into(),
        ));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    let mut res = String::new();
    let mut capitalize_next = true;
    for ch in s.chars() {
        if ch.is_alphabetic() {
            if capitalize_next {
                for upper_ch in ch.to_uppercase() {
                    res.push(upper_ch);
                }
                capitalize_next = false;
            } else {
                for lower_ch in ch.to_lowercase() {
                    res.push(lower_ch);
                }
            }
        } else {
            res.push(ch);
            capitalize_next = true;
        }
    }
    ComputedValue::String(res)
}

pub fn eval_trim(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("TRIM requires 1 argument".into()));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    let words: Vec<&str> = s.split_whitespace().collect();
    ComputedValue::String(words.join(" "))
}

pub fn eval_find(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "FIND requires at least 2 arguments".into(),
        ));
    }
    let find_text = ctx.eval_expr(&args[0]).as_string();
    let within_text = ctx.eval_expr(&args[1]).as_string();
    let start_num = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    if start_num == 0 {
        return ComputedValue::Error(FormulaError::ValueError("start_num must be >= 1".into()));
    }
    let within_chars: Vec<char> = within_text.chars().collect();
    if start_num > within_chars.len() + 1 {
        return ComputedValue::Error(FormulaError::ValueError(
            "start_num exceeds string length".into(),
        ));
    }
    let sub: String = within_chars[(start_num - 1)..].iter().collect();
    match sub.find(&find_text) {
        Some(byte_pos) => {
            let char_offset = sub[..byte_pos].chars().count();
            ComputedValue::Number((start_num + char_offset) as f64)
        }
        None => ComputedValue::Error(FormulaError::ValueError("Substring not found".into())),
    }
}

pub fn eval_search(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SEARCH requires at least 2 arguments".into(),
        ));
    }
    let find_text = ctx.eval_expr(&args[0]).as_string().to_uppercase();
    let within_text = ctx.eval_expr(&args[1]).as_string().to_uppercase();
    let start_num = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    if start_num == 0 {
        return ComputedValue::Error(FormulaError::ValueError("start_num must be >= 1".into()));
    }
    let within_chars: Vec<char> = within_text.chars().collect();
    if start_num > within_chars.len() + 1 {
        return ComputedValue::Error(FormulaError::ValueError(
            "start_num exceeds string length".into(),
        ));
    }

    let sub_len = within_chars.len();
    for i in (start_num - 1)..sub_len {
        for j in i..=sub_len {
            let slice: String = within_chars[i..j].iter().collect();
            if wildcard_match(&find_text, &slice) {
                return ComputedValue::Number((i + 1) as f64);
            }
        }
    }
    ComputedValue::Error(FormulaError::ValueError("Substring not found".into()))
}

pub fn eval_replace(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 4 {
        return ComputedValue::Error(FormulaError::ValueError(
            "REPLACE requires 4 arguments".into(),
        ));
    }
    let old_text = ctx.eval_expr(&args[0]).as_string();
    let start_num = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    let num_chars = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v.max(0.0) as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    let new_text = ctx.eval_expr(&args[3]).as_string();
    if start_num == 0 {
        return ComputedValue::Error(FormulaError::ValueError("start_num must be >= 1".into()));
    }
    let chars: Vec<char> = old_text.chars().collect();
    let mut res = String::new();
    let start_idx = (start_num - 1).min(chars.len());
    let end_idx = (start_idx + num_chars).min(chars.len());
    res.extend(&chars[..start_idx]);
    res.push_str(&new_text);
    res.extend(&chars[end_idx..]);
    ComputedValue::String(res)
}

pub fn eval_substitute(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SUBSTITUTE requires at least 3 arguments".into(),
        ));
    }
    let text = ctx.eval_expr(&args[0]).as_string();
    let old_text = ctx.eval_expr(&args[1]).as_string();
    let new_text = ctx.eval_expr(&args[2]).as_string();

    if old_text.is_empty() {
        return ComputedValue::String(text);
    }

    if args.len() > 3 {
        let instance_num = match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        };
        if instance_num == 0 {
            return ComputedValue::Error(FormulaError::ValueError(
                "instance_num must be >= 1".into(),
            ));
        }
        let mut curr_inst = 0usize;
        let mut result = String::new();
        let mut remainder = text.as_str();

        while let Some(pos) = remainder.find(&old_text) {
            curr_inst += 1;
            result.push_str(&remainder[..pos]);
            if curr_inst == instance_num {
                result.push_str(&new_text);
                result.push_str(&remainder[pos + old_text.len()..]);
                return ComputedValue::String(result);
            } else {
                result.push_str(&old_text);
            }
            remainder = &remainder[pos + old_text.len()..];
        }
        result.push_str(remainder);
        ComputedValue::String(result)
    } else {
        ComputedValue::String(text.replace(&old_text, &new_text))
    }
}

pub fn eval_rept(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError("REPT requires 2 arguments".into()));
    }
    let s = ctx.eval_expr(&args[0]).as_string();
    let count = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v.max(0.0) as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    if count > 32767 {
        return ComputedValue::Error(FormulaError::ValueError("REPT count exceeds 32767".into()));
    }
    ComputedValue::String(s.repeat(count))
}

// ---------------------------------------------------------------------------
// Date / Time Functions
// ---------------------------------------------------------------------------

pub fn eval_date(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError("DATE requires 3 arguments".into()));
    }
    let mut year = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v as i32,
        Err(e) => return ComputedValue::Error(e),
    };
    let month = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    let day = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };

    if (0..=1899).contains(&year) {
        year += 1900;
    }

    let total_months = (year as i64) * 12 + (month - 1);
    let new_year = total_months.div_euclid(12) as i32;
    let new_month = (total_months.rem_euclid(12) + 1) as u32;

    match NaiveDate::from_ymd_opt(new_year, new_month, 1) {
        Some(base_date) => {
            let final_date = base_date + chrono::Duration::days(day - 1);
            ComputedValue::Number(date_to_serial(final_date))
        }
        None => ComputedValue::Error(FormulaError::NumError("Invalid date components".into())),
    }
}

pub fn eval_time(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError("TIME requires 3 arguments".into()));
    }
    let h = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let m = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let s = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let total_secs = h * 3600.0 + m * 60.0 + s;
    let day_fraction = (total_secs % 86400.0) / 86400.0;
    ComputedValue::Number(if day_fraction < 0.0 {
        day_fraction + 1.0
    } else {
        day_fraction
    })
}

pub fn eval_today(ctx: &dyn EngineContext) -> ComputedValue {
    let now = ctx.now_local().date();
    ComputedValue::Number(date_to_serial(now))
}

pub fn eval_now(ctx: &dyn EngineContext) -> ComputedValue {
    let now = ctx.now_local();
    let date_serial = date_to_serial(now.date());
    let time_sec = now.num_seconds_from_midnight();
    let fraction = time_sec as f64 / 86400.0;
    ComputedValue::Number(date_serial + fraction)
}

pub fn eval_day(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("DAY requires 1 argument".into()));
    }
    let serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    match serial_to_date(serial) {
        Ok(d) => ComputedValue::Number(d.day() as f64),
        Err(e) => ComputedValue::Error(e),
    }
}

pub fn eval_month(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("MONTH requires 1 argument".into()));
    }
    let serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    match serial_to_date(serial) {
        Ok(d) => ComputedValue::Number(d.month() as f64),
        Err(e) => ComputedValue::Error(e),
    }
}

pub fn eval_year(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("YEAR requires 1 argument".into()));
    }
    let serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    match serial_to_date(serial) {
        Ok(d) => ComputedValue::Number(d.year() as f64),
        Err(e) => ComputedValue::Error(e),
    }
}

pub fn eval_hour(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("HOUR requires 1 argument".into()));
    }
    let serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut fraction = serial.fract();
    if fraction < 0.0 {
        fraction += 1.0;
    }
    let total_secs = (fraction * 86400.0).round() as u32 % 86400;
    ComputedValue::Number((total_secs / 3600) as f64)
}

pub fn eval_minute(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "MINUTE requires 1 argument".into(),
        ));
    }
    let serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut fraction = serial.fract();
    if fraction < 0.0 {
        fraction += 1.0;
    }
    let total_secs = (fraction * 86400.0).round() as u32 % 86400;
    ComputedValue::Number(((total_secs % 3600) / 60) as f64)
}

pub fn eval_second(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "SECOND requires 1 argument".into(),
        ));
    }
    let serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut fraction = serial.fract();
    if fraction < 0.0 {
        fraction += 1.0;
    }
    let total_secs = (fraction * 86400.0).round() as u32 % 86400;
    ComputedValue::Number((total_secs % 60) as f64)
}

pub fn eval_workday(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "WORKDAY requires at least 2 arguments".into(),
        ));
    }
    let start_serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let days_to_add = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut holiday_dates = Vec::new();
    if args.len() > 2 {
        for val in ctx.flatten_expr(&args[2]) {
            if let Ok(s) = val.as_number() {
                if let Ok(d) = serial_to_date(s) {
                    holiday_dates.push(d);
                }
            }
        }
    }

    let mut current = match serial_to_date(start_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };

    // **Schranke mit Namen** (W-322): Vorher lief diese Schleife bei `=WORKDAY(TODAY(), 999999999)`
    // rund 95 Millionen Schritte. Mehr Schritte als die darstellbare Spanne kann kein Ergebnis liefern, und
    // `remaining` wird währenddessen dekrementiert — ein `checked_sub` ist hier nicht nötig, aber die
    // Grenze muss vor der Schleife stehen, nicht in ihr.
    if days_to_add.abs() > MAX_WORKDAY_STEP_DAYS {
        return ComputedValue::Error(FormulaError::NumError(format!(
            "WORKDAY step {} exceeds the representable span of {} days",
            days_to_add, MAX_WORKDAY_STEP_DAYS
        )));
    }
    let step = if days_to_add >= 0 { 1 } else { -1 };
    let mut remaining = days_to_add.abs();

    while remaining > 0 {
        current = match current.checked_add_signed(chrono::Duration::days(step)) {
            Some(d) => d,
            None => return ComputedValue::Error(FormulaError::NumError("Date overflow".into())),
        };
        let wd = current.weekday();
        if wd != chrono::Weekday::Sat
            && wd != chrono::Weekday::Sun
            && !holiday_dates.contains(&current)
        {
            remaining -= 1;
        }
    }

    ComputedValue::Number(date_to_serial(current))
}

pub fn eval_networkdays(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "NETWORKDAYS requires at least 2 arguments".into(),
        ));
    }
    let start_serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let end_serial = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut holiday_dates = Vec::new();
    if args.len() > 2 {
        for val in ctx.flatten_expr(&args[2]) {
            if let Ok(s) = val.as_number() {
                if let Ok(d) = serial_to_date(s) {
                    holiday_dates.push(d);
                }
            }
        }
    }

    let start = match serial_to_date(start_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };
    let end = match serial_to_date(end_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };

    // **Hier steht bewusst KEINE zusätzliche Spannenschranke** (W-322): Beide Enden sind bereits durch
    // `serial_to_date` auf die darstellbare Spanne begrenzt, also kann die Differenz nie größer werden als
    // diese Spanne. Eine Prüfung an dieser Stelle wäre toter Code — und toter Code, der wie Schutz aussieht,
    // ist ein eigener Mangel (W-320). Die wirksame Grenze ist die der Serien, und sie steht **einmal**.
    let (d1, d2, sign) = if start <= end {
        (start, end, 1.0)
    } else {
        (end, start, -1.0)
    };

    let mut count = 0i64;
    let mut curr = d1;
    while curr <= d2 {
        let wd = curr.weekday();
        if wd != chrono::Weekday::Sat
            && wd != chrono::Weekday::Sun
            && !holiday_dates.contains(&curr)
        {
            count += 1;
        }
        curr = match curr.checked_add_signed(chrono::Duration::days(1)) {
            Some(d) => d,
            None => return ComputedValue::Error(FormulaError::NumError("Date overflow".into())),
        };
    }

    ComputedValue::Number(sign * count as f64)
}

pub fn eval_edate(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "EDATE requires 2 arguments".into(),
        ));
    }
    let start_serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let months = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };

    let date = match serial_to_date(start_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };
    let total_months = (date.year() as i64) * 12 + (date.month0() as i64) + months;
    let new_year = total_months.div_euclid(12) as i32;
    let new_month = (total_months.rem_euclid(12) + 1) as u32;
    let max_day = days_in_month(new_year, new_month);
    let new_day = date.day().min(max_day);
    match NaiveDate::from_ymd_opt(new_year, new_month, new_day) {
        Some(res) => ComputedValue::Number(date_to_serial(res)),
        None => ComputedValue::Error(FormulaError::NumError("Invalid date calculated".into())),
    }
}

pub fn eval_eomonth(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "EOMONTH requires 2 arguments".into(),
        ));
    }
    let start_serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let months = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };

    let date = match serial_to_date(start_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };
    let total_months = (date.year() as i64) * 12 + (date.month0() as i64) + months;
    let new_year = total_months.div_euclid(12) as i32;
    let new_month = (total_months.rem_euclid(12) + 1) as u32;
    let max_day = days_in_month(new_year, new_month);
    match NaiveDate::from_ymd_opt(new_year, new_month, max_day) {
        Some(res) => ComputedValue::Number(date_to_serial(res)),
        None => ComputedValue::Error(FormulaError::NumError("Invalid date calculated".into())),
    }
}

pub fn eval_datedif(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "DATEDIF requires 3 arguments".into(),
        ));
    }
    let start_serial = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let end_serial = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let unit = ctx.eval_expr(&args[2]).as_string();

    if start_serial > end_serial {
        return ComputedValue::Error(FormulaError::NumError(
            "start_date greater than end_date".into(),
        ));
    }
    let d1 = match serial_to_date(start_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };
    let d2 = match serial_to_date(end_serial) {
        Ok(d) => d,
        Err(e) => return ComputedValue::Error(e),
    };

    match unit.trim().to_uppercase().as_str() {
        "Y" => {
            let mut years = d2.year() - d1.year();
            if (d2.month(), d2.day()) < (d1.month(), d1.day()) {
                years -= 1;
            }
            ComputedValue::Number(years.max(0) as f64)
        }
        "M" => {
            let mut months = (d2.year() - d1.year()) * 12 + (d2.month() as i32 - d1.month() as i32);
            if d2.day() < d1.day() {
                months -= 1;
            }
            ComputedValue::Number(months.max(0) as f64)
        }
        "D" => ComputedValue::Number(d2.signed_duration_since(d1).num_days() as f64),
        "MD" => {
            if d2.day() >= d1.day() {
                ComputedValue::Number((d2.day() - d1.day()) as f64)
            } else {
                let prev_month = if d2.month() == 1 { 12 } else { d2.month() - 1 };
                let prev_year = if d2.month() == 1 {
                    d2.year() - 1
                } else {
                    d2.year()
                };
                let dim = days_in_month(prev_year, prev_month);
                ComputedValue::Number((dim - d1.day() + d2.day()) as f64)
            }
        }
        "YM" => {
            let mut months = d2.month() as i32 - d1.month() as i32;
            if months < 0 {
                months += 12;
            }
            if d2.day() < d1.day() {
                months = (months - 1).rem_euclid(12);
            }
            ComputedValue::Number(months as f64)
        }
        "YD" => {
            let d1_same_year = NaiveDate::from_ymd_opt(
                d2.year(),
                d1.month(),
                d1.day().min(days_in_month(d2.year(), d1.month())),
            )
            .unwrap_or(d1);
            let diff = if d2 >= d1_same_year {
                d2.signed_duration_since(d1_same_year).num_days()
            } else {
                let d1_prev_year = NaiveDate::from_ymd_opt(
                    d2.year() - 1,
                    d1.month(),
                    d1.day().min(days_in_month(d2.year() - 1, d1.month())),
                )
                .unwrap_or(d1);
                d2.signed_duration_since(d1_prev_year).num_days()
            };
            ComputedValue::Number(diff as f64)
        }
        _ => ComputedValue::Error(FormulaError::ValueError("Invalid unit in DATEDIF".into())),
    }
}

// ---------------------------------------------------------------------------
// Financial Functions
// ---------------------------------------------------------------------------

pub fn eval_pv(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "PV requires at least 3 arguments".into(),
        ));
    }
    let rate = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let nper = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pmt = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let fv = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.0
    };
    let p_type = if args.len() > 4 {
        if ctx.eval_expr(&args[4]).is_truthy() {
            1.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    if rate == 0.0 {
        ComputedValue::Number(-(fv + pmt * nper))
    } else {
        let pv = -(fv / (1.0 + rate).powf(nper)
            + pmt * (1.0 + rate * p_type) * ((1.0 + rate).powf(nper) - 1.0)
                / (rate * (1.0 + rate).powf(nper)));
        ComputedValue::Number(pv)
    }
}

pub fn eval_fv(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "FV requires at least 3 arguments".into(),
        ));
    }
    let rate = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let nper = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pmt = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pv = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.0
    };
    let p_type = if args.len() > 4 {
        if ctx.eval_expr(&args[4]).is_truthy() {
            1.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    if rate == 0.0 {
        ComputedValue::Number(-(pv + pmt * nper))
    } else {
        let fv = -((pv * (1.0 + rate).powf(nper))
            + (pmt * (1.0 + rate * p_type) * ((1.0 + rate).powf(nper) - 1.0) / rate));
        ComputedValue::Number(fv)
    }
}

pub fn eval_npv(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "NPV requires at least 2 arguments".into(),
        ));
    }
    let rate = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let mut sum = 0.0;
    let mut t = 1.0;
    for arg in &args[1..] {
        for val in ctx.flatten_expr(arg) {
            if let Ok(cf) = val.as_number() {
                sum += cf / (1.0 + rate).powf(t);
                t += 1.0;
            }
        }
    }
    ComputedValue::Number(sum)
}

pub fn eval_pmt(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "PMT requires at least 3 arguments".into(),
        ));
    }
    let rate = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let nper = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pv = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let fv = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.0
    };
    let p_type = if args.len() > 4 {
        if ctx.eval_expr(&args[4]).is_truthy() {
            1.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    if rate == 0.0 {
        ComputedValue::Number(-(pv + fv) / nper)
    } else {
        let pmt = -(pv * (1.0 + rate).powf(nper) + fv)
            / ((1.0 + rate * p_type) * ((1.0 + rate).powf(nper) - 1.0) / rate);
        ComputedValue::Number(pmt)
    }
}

pub fn eval_rate(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "RATE requires at least 3 arguments".into(),
        ));
    }
    let nper = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pmt = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pv = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let fv = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.0
    };
    let p_type = if args.len() > 4 {
        if ctx.eval_expr(&args[4]).is_truthy() {
            1.0
        } else {
            0.0
        }
    } else {
        0.0
    };
    let mut rate = if args.len() > 5 {
        match ctx.eval_expr(&args[5]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.1
    };

    let f = |r: f64| -> f64 {
        if r.abs() < 1e-12 {
            pv + pmt * nper + fv
        } else {
            pv * (1.0 + r).powf(nper)
                + pmt * (1.0 + r * p_type) * ((1.0 + r).powf(nper) - 1.0) / r
                + fv
        }
    };

    for _ in 0..100 {
        let y = f(rate);
        if y.abs() < 1e-8 {
            return ComputedValue::Number(rate);
        }
        let eps = 1e-6;
        let dy = (f(rate + eps) - f(rate - eps)) / (2.0 * eps);
        if dy.abs() < 1e-12 {
            break;
        }
        let next_rate = rate - y / dy;
        if (next_rate - rate).abs() < 1e-10 {
            return ComputedValue::Number(next_rate);
        }
        rate = next_rate;
    }

    ComputedValue::Number(rate)
}

pub fn eval_nper(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 3 {
        return ComputedValue::Error(FormulaError::ValueError(
            "NPER requires at least 3 arguments".into(),
        ));
    }
    let rate = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pmt = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let pv = match ctx.eval_expr(&args[2]).as_number() {
        Ok(v) => v,
        Err(e) => return ComputedValue::Error(e),
    };
    let fv = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.0
    };
    let p_type = if args.len() > 4 {
        if ctx.eval_expr(&args[4]).is_truthy() {
            1.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    if rate == 0.0 {
        if pmt == 0.0 {
            ComputedValue::Error(FormulaError::DivisionByZero)
        } else {
            ComputedValue::Number(-(pv + fv) / pmt)
        }
    } else {
        let num =
            (pmt * (1.0 + rate * p_type) - fv * rate) / (pmt * (1.0 + rate * p_type) + pv * rate);
        if num <= 0.0 {
            ComputedValue::Error(FormulaError::NumError(
                "Cannot compute NPER with given parameters".into(),
            ))
        } else {
            ComputedValue::Number(num.ln() / (1.0 + rate).ln())
        }
    }
}

pub fn eval_irr(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "IRR requires at least 1 argument".into(),
        ));
    }
    let mut values = Vec::new();
    for val in ctx.flatten_expr(&args[0]) {
        if let Ok(n) = val.as_number() {
            values.push(n);
        }
    }
    if values.len() < 2 {
        return ComputedValue::Error(FormulaError::NumError(
            "IRR requires at least 2 cash flows".into(),
        ));
    }
    let mut guess = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.1
    };

    for _ in 0..100 {
        let mut npv = 0.0;
        let mut d_npv = 0.0;
        for (t, &cf) in values.iter().enumerate() {
            let disc = (1.0 + guess).powi(t as i32);
            npv += cf / disc;
            if t > 0 {
                d_npv -= (t as f64) * cf / (1.0 + guess).powi((t + 1) as i32);
            }
        }
        if npv.abs() < 1e-8 {
            return ComputedValue::Number(guess);
        }
        if d_npv.abs() < 1e-12 {
            break;
        }
        let next = guess - npv / d_npv;
        if (next - guess).abs() < 1e-10 {
            return ComputedValue::Number(next);
        }
        guess = next;
    }

    ComputedValue::Number(guess)
}

// ---------------------------------------------------------------------------
// Information & Error Functions
// ---------------------------------------------------------------------------

pub fn eval_isblank(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ISBLANK requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(val.is_empty())
}

pub fn eval_isnumber(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ISNUMBER requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(val.is_number())
}

pub fn eval_istext(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ISTEXT requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(val.is_string())
}

pub fn eval_isnontext(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ISNONTEXT requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(!val.is_string())
}

pub fn eval_islogical(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ISLOGICAL requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(val.is_boolean())
}

pub fn eval_iserror(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ISERROR requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(val.is_error())
}

pub fn eval_isna(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("ISNA requires 1 argument".into()));
    }
    let val = ctx.eval_expr(&args[0]);
    ComputedValue::Boolean(matches!(val, ComputedValue::Error(FormulaError::NAError)))
}

pub fn eval_na(_args: &[Expr], _ctx: &dyn EngineContext) -> ComputedValue {
    ComputedValue::Error(FormulaError::NAError)
}

pub fn eval_type(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError("TYPE requires 1 argument".into()));
    }
    let val = ctx.eval_expr(&args[0]);
    match val {
        ComputedValue::Number(_) => ComputedValue::Number(1.0),
        ComputedValue::String(_) => ComputedValue::Number(2.0),
        ComputedValue::Boolean(_) => ComputedValue::Number(4.0),
        ComputedValue::Error(_) => ComputedValue::Number(16.0),
        ComputedValue::Array(_) => ComputedValue::Number(64.0),
        ComputedValue::Empty => ComputedValue::Number(1.0),
    }
}

pub fn eval_error_type(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "ERROR.TYPE requires 1 argument".into(),
        ));
    }
    let val = ctx.eval_expr(&args[0]);
    match val {
        ComputedValue::Error(e) => ComputedValue::Number(e.error_type_code() as f64),
        _ => ComputedValue::Error(FormulaError::NAError),
    }
}

// ---------------------------------------------------------------------------
// Dynamic Array Functions
// ---------------------------------------------------------------------------

pub fn eval_filter(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "FILTER requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    let include_vals = ctx.flatten_expr(&args[1]);

    if matrix.is_empty() {
        return if args.len() > 2 {
            ctx.eval_expr(&args[2])
        } else {
            ComputedValue::Error(FormulaError::ValueError("Array is empty".into()))
        };
    }

    if include_vals.len() != matrix.len() {
        return ComputedValue::Error(FormulaError::ValueError(
            "FILTER include dimensions do not match array rows".into(),
        ));
    }

    let mut filtered = Vec::new();
    for (i, row) in matrix.iter().enumerate() {
        if include_vals[i].is_truthy() {
            filtered.push(row.clone());
        }
    }

    if filtered.is_empty() {
        if args.len() > 2 {
            ctx.eval_expr(&args[2])
        } else {
            ComputedValue::Error(FormulaError::ValueError(
                "No items match FILTER criteria".into(),
            ))
        }
    } else {
        ComputedValue::Array(filtered)
    }
}

pub fn eval_sort(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "SORT requires at least 1 argument".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let sort_idx = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let sort_order = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v as i32,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let by_col = if args.len() > 3 {
        ctx.eval_expr(&args[3]).is_truthy()
    } else {
        false
    };

    if !by_col {
        if sort_idx < 1 || sort_idx > matrix[0].len() {
            return ComputedValue::Error(FormulaError::ValueError(
                "SORT index out of bounds".into(),
            ));
        }
        let col_to_sort = sort_idx - 1;
        let mut sorted = matrix;
        sorted.sort_by(|a, b| {
            let cmp = compare_computed_values(&a[col_to_sort], &b[col_to_sort]);
            if sort_order == -1 {
                cmp.reverse()
            } else {
                cmp
            }
        });
        ComputedValue::Array(sorted)
    } else {
        if sort_idx < 1 || sort_idx > matrix.len() {
            return ComputedValue::Error(FormulaError::ValueError(
                "SORT index out of bounds".into(),
            ));
        }
        let row_to_sort = sort_idx - 1;
        let mut cols: Vec<Vec<ComputedValue>> = Vec::new();
        for c in 0..matrix[0].len() {
            let mut col_data = Vec::new();
            for row in &matrix {
                col_data.push(row[c].clone());
            }
            cols.push(col_data);
        }
        cols.sort_by(|a, b| {
            let cmp = compare_computed_values(&a[row_to_sort], &b[row_to_sort]);
            if sort_order == -1 {
                cmp.reverse()
            } else {
                cmp
            }
        });
        let mut result = Vec::new();
        for r in 0..matrix.len() {
            let mut row_data = Vec::new();
            for col in &cols {
                row_data.push(col[r].clone());
            }
            result.push(row_data);
        }
        ComputedValue::Array(result)
    }
}

pub fn compare_computed_values(a: &ComputedValue, b: &ComputedValue) -> std::cmp::Ordering {
    match (a, b) {
        (ComputedValue::Number(x), ComputedValue::Number(y)) => {
            x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal)
        }
        (ComputedValue::String(x), ComputedValue::String(y)) => x.cmp(y),
        (ComputedValue::Boolean(x), ComputedValue::Boolean(y)) => x.cmp(y),
        (ComputedValue::Empty, ComputedValue::Empty) => std::cmp::Ordering::Equal,
        (ComputedValue::Empty, _) => std::cmp::Ordering::Less,
        (_, ComputedValue::Empty) => std::cmp::Ordering::Greater,
        (ComputedValue::Number(_), _) => std::cmp::Ordering::Less,
        (_, ComputedValue::Number(_)) => std::cmp::Ordering::Greater,
        (ComputedValue::String(_), _) => std::cmp::Ordering::Less,
        (_, ComputedValue::String(_)) => std::cmp::Ordering::Greater,
        _ => std::cmp::Ordering::Equal,
    }
}

pub fn eval_sortby(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "SORTBY requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    let by_vals = ctx.flatten_expr(&args[1]);
    let order = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v as i32,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };

    if matrix.len() != by_vals.len() {
        return ComputedValue::Error(FormulaError::ValueError(
            "SORTBY array and by_array must have same number of rows".into(),
        ));
    }

    let mut indexed: Vec<(usize, Vec<ComputedValue>)> = matrix.into_iter().enumerate().collect();
    indexed.sort_by(|(i1, _), (i2, _)| {
        let cmp = compare_computed_values(&by_vals[*i1], &by_vals[*i2]);
        if order == -1 {
            cmp.reverse()
        } else {
            cmp
        }
    });

    let sorted: Vec<Vec<ComputedValue>> = indexed.into_iter().map(|(_, row)| row).collect();
    ComputedValue::Array(sorted)
}

pub fn eval_unique(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "UNIQUE requires at least 1 argument".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let by_col = if args.len() > 1 {
        ctx.eval_expr(&args[1]).is_truthy()
    } else {
        false
    };
    let exactly_once = if args.len() > 2 {
        ctx.eval_expr(&args[2]).is_truthy()
    } else {
        false
    };

    if !by_col {
        let mut row_counts: Vec<(Vec<ComputedValue>, usize)> = Vec::new();
        for row in matrix {
            if let Some(entry) = row_counts.iter_mut().find(|(r, _)| r == &row) {
                entry.1 += 1;
            } else {
                row_counts.push((row, 1));
            }
        }
        let result: Vec<Vec<ComputedValue>> = row_counts
            .into_iter()
            .filter(|(_, count)| !exactly_once || *count == 1)
            .map(|(r, _)| r)
            .collect();

        if result.is_empty() {
            ComputedValue::Error(FormulaError::ValueError("No unique items found".into()))
        } else {
            ComputedValue::Array(result)
        }
    } else {
        let mut cols: Vec<Vec<ComputedValue>> = Vec::new();
        for c in 0..matrix[0].len() {
            let mut col_data = Vec::new();
            for row in &matrix {
                col_data.push(row[c].clone());
            }
            cols.push(col_data);
        }
        let mut col_counts: Vec<(Vec<ComputedValue>, usize)> = Vec::new();
        for col in cols {
            if let Some(entry) = col_counts.iter_mut().find(|(c, _)| c == &col) {
                entry.1 += 1;
            } else {
                col_counts.push((col, 1));
            }
        }
        let kept_cols: Vec<Vec<ComputedValue>> = col_counts
            .into_iter()
            .filter(|(_, count)| !exactly_once || *count == 1)
            .map(|(c, _)| c)
            .collect();

        if kept_cols.is_empty() {
            return ComputedValue::Error(FormulaError::ValueError(
                "No unique columns found".into(),
            ));
        }
        let mut result = Vec::new();
        for r in 0..matrix.len() {
            let mut row = Vec::new();
            for col in &kept_cols {
                row.push(col[r].clone());
            }
            result.push(row);
        }
        ComputedValue::Array(result)
    }
}

pub fn eval_sequence(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.is_empty() {
        return ComputedValue::Error(FormulaError::ValueError(
            "SEQUENCE requires at least 1 argument".into(),
        ));
    }
    let rows = match ctx.eval_expr(&args[0]).as_number() {
        Ok(v) => v.max(0.0) as usize,
        Err(e) => return ComputedValue::Error(e),
    };
    let cols = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v.max(0.0) as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let start = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1.0
    };
    let step = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1.0
    };

    if rows == 0 || cols == 0 {
        return ComputedValue::Array(Vec::new());
    }

    let mut grid = Vec::with_capacity(rows);
    let mut current = start;
    for _ in 0..rows {
        let mut row = Vec::with_capacity(cols);
        for _ in 0..cols {
            row.push(ComputedValue::Number(current));
            current += step;
        }
        grid.push(row);
    }
    ComputedValue::Array(grid)
}

pub fn eval_randarray(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let rows = if !args.is_empty() {
        match ctx.eval_expr(&args[0]).as_number() {
            Ok(v) => v.max(1.0) as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let cols = if args.len() > 1 {
        match ctx.eval_expr(&args[1]).as_number() {
            Ok(v) => v.max(1.0) as usize,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1
    };
    let min = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        0.0
    };
    let max = if args.len() > 3 {
        match ctx.eval_expr(&args[3]).as_number() {
            Ok(v) => v,
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        1.0
    };
    let whole_number = if args.len() > 4 {
        ctx.eval_expr(&args[4]).is_truthy()
    } else {
        false
    };

    if min > max {
        return ComputedValue::Error(FormulaError::NumError(
            "min greater than max in RANDARRAY".into(),
        ));
    }

    let mut rng = rand::thread_rng();
    let mut grid = Vec::with_capacity(rows);
    for _ in 0..rows {
        let mut row = Vec::with_capacity(cols);
        for _ in 0..cols {
            if whole_number {
                let min_int = min.ceil() as i64;
                let max_int = max.floor() as i64;
                let val = if min_int <= max_int {
                    rng.gen_range(min_int..=max_int) as f64
                } else {
                    min_int as f64
                };
                row.push(ComputedValue::Number(val));
            } else {
                let val = rng.gen_range(min..=max);
                row.push(ComputedValue::Number(val));
            }
        }
        grid.push(row);
    }
    ComputedValue::Array(grid)
}

pub fn eval_take(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "TAKE requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let rows_arg = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    let cols_arg = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => Some(v as i64),
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        None
    };

    let total_rows = matrix.len();
    let row_slice: &[Vec<ComputedValue>] = if rows_arg >= 0 {
        let count = (rows_arg as usize).min(total_rows);
        &matrix[..count]
    } else {
        let count = ((-rows_arg) as usize).min(total_rows);
        &matrix[total_rows - count..]
    };

    let result: Vec<Vec<ComputedValue>> = match cols_arg {
        Some(cols) => {
            let total_cols = if row_slice.is_empty() {
                0
            } else {
                row_slice[0].len()
            };
            row_slice
                .iter()
                .map(|r| {
                    if cols >= 0 {
                        let count = (cols as usize).min(total_cols);
                        r[..count].to_vec()
                    } else {
                        let count = ((-cols) as usize).min(total_cols);
                        r[total_cols - count..].to_vec()
                    }
                })
                .collect()
        }
        None => row_slice.to_vec(),
    };

    ComputedValue::Array(result)
}

pub fn eval_drop(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "DROP requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let rows_arg = match ctx.eval_expr(&args[1]).as_number() {
        Ok(v) => v as i64,
        Err(e) => return ComputedValue::Error(e),
    };
    let cols_arg = if args.len() > 2 {
        match ctx.eval_expr(&args[2]).as_number() {
            Ok(v) => Some(v as i64),
            Err(e) => return ComputedValue::Error(e),
        }
    } else {
        None
    };

    let total_rows = matrix.len();
    let row_slice: &[Vec<ComputedValue>] = if rows_arg >= 0 {
        let skip = (rows_arg as usize).min(total_rows);
        &matrix[skip..]
    } else {
        let count = ((-rows_arg) as usize).min(total_rows);
        &matrix[..total_rows - count]
    };

    let result: Vec<Vec<ComputedValue>> = match cols_arg {
        Some(cols) => {
            let total_cols = if row_slice.is_empty() {
                0
            } else {
                row_slice[0].len()
            };
            row_slice
                .iter()
                .map(|r| {
                    if cols >= 0 {
                        let skip = (cols as usize).min(total_cols);
                        r[skip..].to_vec()
                    } else {
                        let count = ((-cols) as usize).min(total_cols);
                        r[..total_cols - count].to_vec()
                    }
                })
                .collect()
        }
        None => row_slice.to_vec(),
    };

    ComputedValue::Array(result)
}

pub fn eval_choosecols(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "CHOOSECOLS requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let total_cols = matrix[0].len();
    let mut selected_indices = Vec::new();
    for arg in &args[1..] {
        let col_num = match ctx.eval_expr(arg).as_number() {
            Ok(v) => v as i64,
            Err(e) => return ComputedValue::Error(e),
        };
        let idx = if col_num > 0 && (col_num as usize) <= total_cols {
            (col_num - 1) as usize
        } else if col_num < 0 && ((-col_num) as usize) <= total_cols {
            total_cols - (-col_num as usize)
        } else {
            return ComputedValue::Error(FormulaError::ValueError(
                "Column index out of bounds in CHOOSECOLS".into(),
            ));
        };
        selected_indices.push(idx);
    }

    let result: Vec<Vec<ComputedValue>> = matrix
        .iter()
        .map(|row| {
            selected_indices
                .iter()
                .map(|&idx| row[idx].clone())
                .collect()
        })
        .collect();

    ComputedValue::Array(result)
}

pub fn eval_chooserows(args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    if args.len() < 2 {
        return ComputedValue::Error(FormulaError::ValueError(
            "CHOOSEROWS requires at least 2 arguments".into(),
        ));
    }
    let matrix = ctx.eval_to_matrix(&args[0]);
    if matrix.is_empty() {
        return ComputedValue::Array(Vec::new());
    }
    let total_rows = matrix.len();
    let mut selected_indices = Vec::new();
    for arg in &args[1..] {
        let row_num = match ctx.eval_expr(arg).as_number() {
            Ok(v) => v as i64,
            Err(e) => return ComputedValue::Error(e),
        };
        let idx = if row_num > 0 && (row_num as usize) <= total_rows {
            (row_num - 1) as usize
        } else if row_num < 0 && ((-row_num) as usize) <= total_rows {
            total_rows - (-row_num as usize)
        } else {
            return ComputedValue::Error(FormulaError::ValueError(
                "Row index out of bounds in CHOOSEROWS".into(),
            ));
        };
        selected_indices.push(idx);
    }

    let result: Vec<Vec<ComputedValue>> = selected_indices
        .into_iter()
        .map(|idx| matrix[idx].clone())
        .collect();

    ComputedValue::Array(result)
}

// ---------------------------------------------------------------------------
// Master Dispatcher
// ---------------------------------------------------------------------------

pub fn call_function(name: &str, args: &[Expr], ctx: &dyn EngineContext) -> ComputedValue {
    let name_upper = name.trim().to_uppercase();
    match name_upper.as_str() {
        // Math / Trig
        "SUM" => eval_sum(args, ctx),
        "SUMIF" => eval_sumif(args, ctx),
        "SUMIFS" => eval_sumifs(args, ctx),
        "PRODUCT" => eval_product(args, ctx),
        "ROUND" => eval_round(args, ctx),
        "ROUNDUP" => eval_roundup(args, ctx),
        "ROUNDDOWN" => eval_rounddown(args, ctx),
        "MOD" => eval_mod(args, ctx),
        "ABS" => eval_abs(args, ctx),
        "SQRT" => eval_sqrt(args, ctx),
        "POWER" => eval_power(args, ctx),
        "CEILING" => eval_ceiling(args, ctx),
        "FLOOR" => eval_floor(args, ctx),
        "AGGREGATE" => eval_aggregate(args, ctx),
        "SUBTOTAL" => eval_subtotal(args, ctx),

        // Statistical
        "AVERAGE" => eval_average(args, ctx),
        "AVERAGEIF" => eval_averageif(args, ctx),
        "MEDIAN" => eval_median(args, ctx),
        "MODE" => eval_mode(args, ctx),
        "COUNT" => eval_count(args, ctx),
        "COUNTA" => eval_counta(args, ctx),
        "COUNTIF" => eval_countif(args, ctx),
        "COUNTIFS" => eval_countifs(args, ctx),
        "COUNTBLANK" => eval_countblank(args, ctx),
        "STDEV" | "STDEV.S" => eval_stdev(args, ctx),
        "VAR" | "VAR.S" => eval_var(args, ctx),
        "MIN" => eval_min(args, ctx),
        "MAX" => eval_max(args, ctx),
        "LARGE" => eval_large(args, ctx),
        "SMALL" => eval_small(args, ctx),

        // Logical
        "IF" => eval_if(args, ctx),
        "IFS" => eval_ifs(args, ctx),
        "SWITCH" => eval_switch(args, ctx),
        "AND" => eval_and(args, ctx),
        "OR" => eval_or(args, ctx),
        "NOT" => eval_not(args, ctx),
        "XOR" => eval_xor(args, ctx),
        "IFERROR" => eval_iferror(args, ctx),
        "IFNA" => eval_ifna(args, ctx),
        "TRUE" => ComputedValue::Boolean(true),
        "FALSE" => ComputedValue::Boolean(false),

        // Lookup & Reference
        "XLOOKUP" => eval_xlookup(args, ctx),
        "XMATCH" => eval_xmatch(args, ctx),
        "INDEX" => eval_index(args, ctx),
        "MATCH" => eval_match(args, ctx),
        "VLOOKUP" => eval_vlookup(args, ctx),
        "HLOOKUP" => eval_hlookup(args, ctx),
        "OFFSET" => eval_offset(args, ctx),
        "CHOOSE" => eval_choose(args, ctx),
        "ROW" => eval_row(args, ctx),
        "COLUMN" => eval_column(args, ctx),
        "ROWS" => eval_rows(args, ctx),
        "COLUMNS" => eval_columns(args, ctx),

        // Text
        "TEXT" => eval_text_fn(args, ctx),
        "CONCAT" | "CONCATENATE" => eval_concat(args, ctx),
        "TEXTJOIN" => eval_textjoin(args, ctx),
        "LEFT" => eval_left(args, ctx),
        "RIGHT" => eval_right(args, ctx),
        "MID" => eval_mid(args, ctx),
        "LEN" => eval_len(args, ctx),
        "LOWER" => eval_lower(args, ctx),
        "UPPER" => eval_upper(args, ctx),
        "PROPER" => eval_proper(args, ctx),
        "TRIM" => eval_trim(args, ctx),
        "FIND" => eval_find(args, ctx),
        "SEARCH" => eval_search(args, ctx),
        "REPLACE" => eval_replace(args, ctx),
        "SUBSTITUTE" => eval_substitute(args, ctx),
        "REPT" => eval_rept(args, ctx),

        // Date / Time
        "DATE" => eval_date(args, ctx),
        "TIME" => eval_time(args, ctx),
        "TODAY" => eval_today(ctx),
        "NOW" => eval_now(ctx),
        "DAY" => eval_day(args, ctx),
        "MONTH" => eval_month(args, ctx),
        "YEAR" => eval_year(args, ctx),
        "HOUR" => eval_hour(args, ctx),
        "MINUTE" => eval_minute(args, ctx),
        "SECOND" => eval_second(args, ctx),
        "WORKDAY" => eval_workday(args, ctx),
        "NETWORKDAYS" => eval_networkdays(args, ctx),
        "EDATE" => eval_edate(args, ctx),
        "EOMONTH" => eval_eomonth(args, ctx),
        "DATEDIF" => eval_datedif(args, ctx),

        // Financial
        "PV" => eval_pv(args, ctx),
        "FV" => eval_fv(args, ctx),
        "NPV" => eval_npv(args, ctx),
        "PMT" => eval_pmt(args, ctx),
        "RATE" => eval_rate(args, ctx),
        "NPER" => eval_nper(args, ctx),
        "IRR" => eval_irr(args, ctx),

        // Database
        "DSUM" => crate::extensions::eval_dsum(args, ctx),
        "DCOUNT" => crate::extensions::eval_dcount(args, ctx),

        // Engineering
        "DEC2HEX" => crate::extensions::eval_dec2hex(args, ctx),
        "HEX2DEC" => crate::extensions::eval_hex2dec(args, ctx),
        "CONVERT" => crate::extensions::eval_convert(args, ctx),

        // Matrix
        "TRANSPOSE" => crate::extensions::eval_transpose(args, ctx),
        "MMULT" => crate::extensions::eval_mmult(args, ctx),

        // Information & Error
        "ISBLANK" => eval_isblank(args, ctx),
        "ISNUMBER" => eval_isnumber(args, ctx),
        "ISTEXT" => eval_istext(args, ctx),
        "ISNONTEXT" => eval_isnontext(args, ctx),
        "ISLOGICAL" => eval_islogical(args, ctx),
        "ISERROR" => eval_iserror(args, ctx),
        "ISNA" => eval_isna(args, ctx),
        "NA" => eval_na(args, ctx),
        "TYPE" => eval_type(args, ctx),
        "ERROR.TYPE" => eval_error_type(args, ctx),

        // Dynamic Array
        "FILTER" => eval_filter(args, ctx),
        "SORT" => eval_sort(args, ctx),
        "SORTBY" => eval_sortby(args, ctx),
        "UNIQUE" => eval_unique(args, ctx),
        "SEQUENCE" => eval_sequence(args, ctx),
        "RANDARRAY" => eval_randarray(args, ctx),
        "TAKE" => eval_take(args, ctx),
        "DROP" => eval_drop(args, ctx),
        "CHOOSECOLS" => eval_choosecols(args, ctx),
        "CHOOSEROWS" => eval_chooserows(args, ctx),

        unknown => ComputedValue::Error(FormulaError::UnknownFunction(unknown.to_string())),
    }
}

#[cfg(test)]
mod date_serial_boundary_tests {
    use super::serial_to_date;

    #[test]
    fn serial_to_date_rejects_nan_and_infinity() {
        assert!(serial_to_date(f64::NAN).is_err());
        assert!(serial_to_date(f64::INFINITY).is_err());
        assert!(serial_to_date(f64::NEG_INFINITY).is_err());
    }
}

#[cfg(test)]
mod w426_time_context_tests {
    //! **W-426:** `TODAY`/`NOW` folgen dem **Kontext**, nicht dem Rechner.
    //!
    //! Die vier Pflichtmethoden des Trait sind **benannte Platzhalter**, die **paniken** ✓ — dieser Test ruft sie nie ✓,
    //! und ein stiller Falschwert wäre schlimmer als ein lauter Fehler ✓. `now_local` ist die **einzige** Methode mit
    //! Standard ✓ — genau das macht den Umbau nicht-brechend ✓.
    use super::{date_to_serial, eval_now, eval_today, EngineContext};
    use crate::types::{CellCoord, ComputedValue, Expr, FormulaError};

    struct FesterZeitpunkt(chrono::NaiveDateTime);

    fn platzhalter(name: &str) -> ComputedValue {
        ComputedValue::Error(FormulaError::ValueError(format!("w426-test: {name} wird nicht gebraucht")))
    }

    impl EngineContext for FesterZeitpunkt {
        fn eval_expr(&self, _expr: &Expr) -> ComputedValue { platzhalter("eval_expr") }
        fn eval_to_matrix(&self, _expr: &Expr) -> Vec<Vec<ComputedValue>> { panic!("w426-test: eval_to_matrix ungenutzt") }
        fn flatten_expr(&self, _expr: &Expr) -> Vec<ComputedValue> { panic!("w426-test: flatten_expr ungenutzt") }
        fn current_coord(&self) -> Option<CellCoord> { panic!("w426-test: current_coord ungenutzt") }
        fn get_cell_value(&self, _coord: &CellCoord) -> ComputedValue { panic!("w426-test: get_cell_value ungenutzt") }
        fn now_local(&self) -> chrono::NaiveDateTime { self.0 }
    }

    fn zeitpunkt(jahr: i32, monat: u32, tag: u32, stunde: u32) -> FesterZeitpunkt {
        FesterZeitpunkt(
            chrono::NaiveDate::from_ymd_opt(jahr, monat, tag).expect("Datum").and_hms_opt(stunde, 0, 0).expect("Zeit"),
        )
    }

    /// **Der Typ, der den E0308 ausgelöst hat ✓:** `ComputedValue` herausziehen, dann vergleichen ✓.
    fn als_zahl(wert: ComputedValue) -> f64 {
        match wert {
            ComputedValue::Number(n) => n,
            anderes => panic!("keine Zahl, sondern {anderes:?}"),
        }
    }

    #[test]
    fn today_folgt_dem_kontext_statt_dem_rechner() {
        let maerz = als_zahl(eval_today(&zeitpunkt(2026, 3, 15, 12)));
        let juli = als_zahl(eval_today(&zeitpunkt(2026, 7, 15, 12)));
        assert_ne!(maerz, juli, "TODAY lieferte fuer zwei Kontexte denselben Wert — es liest offenbar den Rechner");
        let erwartet = date_to_serial(chrono::NaiveDate::from_ymd_opt(2026, 3, 15).expect("Datum"));
        assert_eq!(maerz, erwartet);
    }

    #[test]
    fn now_folgt_dem_kontext_und_traegt_den_tagesbruch() {
        let mittag = als_zahl(eval_now(&zeitpunkt(2026, 3, 15, 12)));
        let mitternacht = als_zahl(eval_now(&zeitpunkt(2026, 3, 15, 0)));
        assert!((mittag - mitternacht - 0.5).abs() < 1e-9, "Tagesbruch nicht 0,5: {mittag} - {mitternacht}");
        assert_ne!(
            als_zahl(eval_now(&zeitpunkt(2026, 3, 15, 12))),
            als_zahl(eval_now(&zeitpunkt(2026, 7, 15, 12))),
            "NOW lieferte fuer zwei Kontexte denselben Wert",
        );
    }

    #[test]
    fn utc_zu_nutzerzeit_addiert_den_offset() {
        // **Die reine Umrechnung** — ohne Uhr, ohne Zone der Maschine ✓.
        let utc = chrono::NaiveDate::from_ymd_opt(2026, 3, 15).expect("Datum").and_hms_opt(12, 0, 0).expect("Zeit");
        // Berlin im Winter: +60 → 13:00 ✓. New York im Winter: −300 → 07:00 ✓.
        assert_eq!(super::utc_to_user_local(utc, 60).format("%H:%M").to_string(), "13:00");
        assert_eq!(super::utc_to_user_local(utc, -300).format("%H:%M").to_string(), "07:00");
        // Und der Datumswechsel wird korrekt getragen ✓: +14 h aus 12:00 UTC wird der **nächste** Tag 02:00 ✓.
        let plus14 = super::utc_to_user_local(utc, 14 * 60);
        assert_eq!(plus14.format("%d.%m %H:%M").to_string(), "16.03 02:00");
    }

    #[test]
    fn der_nutzerkontext_setzt_die_naht_und_delegiert_den_rest() {
        // Der innere Kontext hat einen **festen** Zeitpunkt ✓ — der äußere überschreibt ihn mit UTC+Offset ✓.
        let inner = zeitpunkt(2000, 1, 1, 0);
        let aussen = super::UserZoneContext::new(inner, 120);
        // **Delegation geprüft:** `current_coord` kommt aus dem inneren Kontext ✓ — der Platzhalter panikt ✗,
        // also beweist ein erfolgreicher Aufruf die Delegation ✓.
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| aussen.current_coord())).is_err());
        // **Und die Naht ist gesetzt:** `now_local` liefert **nicht** mehr den festen inneren Wert (2000-01-01) ✓.
        let jetzt = aussen.now_local();
        assert_ne!(jetzt.format("%Y").to_string(), "2000", "now_local wurde nicht ueberschrieben");
        assert_eq!(aussen.utc_offset_minutes(), 120);
    }

    #[test]
    fn der_kontext_benutzt_die_regel_ueber_eine_umstellung_hinweg() {
        // **Dieselbe Zone, zwei Zeitpunkte, zwei Offsets** ✓ — der Kern von W-426, jetzt im Kontext ✓.
        let tabelle = vec![
            super::TimeZoneTransition { at_utc_ms: 0, offset_minutes: 60 },
            super::TimeZoneTransition { at_utc_ms: 1_774_742_400_000, offset_minutes: 120 },
        ];
        let kontext = super::UserZoneContext::with_transitions(zeitpunkt(2026, 1, 1, 0), tabelle)
            .expect("nicht-leere Tabelle");
        assert_eq!(kontext.offset_at(1_773_000_000_000), 60, "Winter");
        assert_eq!(kontext.offset_at(1_780_000_000_000), 120, "Sommer");
        // **Und die leere Tabelle wird abgelehnt** ✓ — eine Zone ohne Angabe ist keine Zone ✓.
        assert!(super::UserZoneContext::with_transitions(zeitpunkt(2026, 1, 1, 0), Vec::new()).is_err());
        // Der feste Offset bleibt als **einfache** Form erhalten ✓.
        let fest = super::UserZoneContext::new(zeitpunkt(2026, 1, 1, 0), -300);
        assert_eq!(fest.offset_at(0), -300);
    }

    #[test]
    fn die_dst_regel_waehlt_den_letzten_uebergang() {
        // Berlin 2026: Winter +60 ab Jahresbeginn, Sommer +120 ab dem 29. Maerz ✓.
        let tabelle = [
            super::TimeZoneTransition { at_utc_ms: 0, offset_minutes: 60 },
            super::TimeZoneTransition { at_utc_ms: 1_774_742_400_000, offset_minutes: 120 }, // 2026-03-29 01:00 UTC
        ];
        // **Vor** der Umstellung gilt der Winterwert ✓ …
        assert_eq!(super::offset_from_transitions(&tabelle, 1_773_000_000_000), Some(60));
        // … **genau auf** der Umstellung schon der Sommerwert ✓ (die Grenze gehoert zum neuen Zustand ✓).
        assert_eq!(super::offset_from_transitions(&tabelle, 1_774_742_400_000), Some(120));
        // … und danach ebenfalls ✓.
        assert_eq!(super::offset_from_transitions(&tabelle, 1_780_000_000_000), Some(120));
    }

    #[test]
    fn ohne_vorherige_umstellung_ist_die_antwort_unbeantwortet() {
        let tabelle = [super::TimeZoneTransition { at_utc_ms: 1_000_000, offset_minutes: 120 }];
        // **fail-closed** ✓: keine Umstellung vorausgegangen → `None` ✓, **nicht** Offset 0 ✗.
        assert_eq!(super::offset_from_transitions(&tabelle, 999_999), None);
        assert_eq!(super::offset_from_transitions(&[], 1_780_000_000_000), None);
        // Und die **unsortierte** Tabelle liefert dasselbe ✓ — die Reihenfolge ist keine Regel ✓.
        let unsortiert = [
            super::TimeZoneTransition { at_utc_ms: 1_774_742_400_000, offset_minutes: 120 },
            super::TimeZoneTransition { at_utc_ms: 0, offset_minutes: 60 },
        ];
        assert_eq!(super::offset_from_transitions(&unsortiert, 1_780_000_000_000), Some(120));
    }

    #[test]
    fn derselbe_kontext_ergibt_dasselbe_ergebnis() {
        assert_eq!(eval_now(&zeitpunkt(2026, 3, 15, 12)), eval_now(&zeitpunkt(2026, 3, 15, 12)));
    }
}

#[cfg(test)]
mod w426_user_zone_im_motor_tests {
    //! **W-426, der zweite Teil:** Die Zone aus der Nutzlast erreicht den **echten** Motor ✓.
    //!
    //! *Warum diese Prüfung den Motor fährt und nicht nur die Hülle:* Der Motor ruft seine Funktionen mit **sich
    //! selbst** auf (`crates/vgt-formula/src/engine.rs:772`: `call_function(name, args, self)` ✓); eine Hülle **um**
    //! ihn wird **nie** gefragt ✗. Ein Zeuge, der nur `UserZoneContext::now_local` prüft, würde deshalb **grün**,
    //! obwohl `TODAY`/`NOW` im Motorbetrieb unverändert den Rechner lesen ✗ — *eine Prüfung, die den falschen
    //! Gegenstand fährt, ist eine Behauptung* ✓. Deshalb: **echter `SpreadsheetEngine`**, echte Formeln ✓.
    //!
    //! Der Zeitpunkt ist **festgehalten** ✓ — damit hängt kein Ergebnis an der Uhr des Rechners ✓ und dieselbe
    //! Nutzlast ergibt zweimal **dasselbe** ✓.
    use super::{date_to_serial, offset_from_transitions, EngineContext, TimeZoneTransition, UserZoneContext};
    use crate::engine::SpreadsheetEngine;
    use crate::types::{CellCoord, ComputedValue, Expr, FormulaError};

    /// **Der Zeitpunkt**, zu dem der Offset gilt, in Millisekunden seit der Epoche ✓.
    fn zeitpunkt_ms(jahr: i32, monat: u32, tag: u32, stunde: u32, minute: u32) -> i64 {
        chrono::NaiveDate::from_ymd_opt(jahr, monat, tag)
            .expect("Datum")
            .and_hms_opt(stunde, minute, 0)
            .expect("Zeit")
            .and_utc()
            .timestamp_millis()
    }

    fn als_zahl(wert: ComputedValue) -> f64 {
        match wert {
            ComputedValue::Number(n) => n,
            anderes => panic!("keine Zahl, sondern {anderes:?}"),
        }
    }

    fn als_utc(ms: i64) -> chrono::NaiveDateTime {
        chrono::DateTime::from_timestamp_millis(ms).expect("Zeitpunkt").naive_utc()
    }

    /// **Der echte Motor unter einer Zone** ✓ — `TODAY` und `NOW` werden **unter** dem Wächter gesetzt ✓
    /// (`set_formula` rechnet sofort, `engine.rs:159` ✓), deshalb steht der Wächter **vor** den Formeln ✓.
    fn motor_unter_zone(offset_minuten: i32) -> (f64, f64) {
        motor_mit(|motor| {
            UserZoneContext::new(motor, offset_minuten)
                .install_at(Some(zeitpunkt_ms(2026, 3, 15, 22, 30)))
                .expect("ein fester Offset braucht keine Tabelle")
        })
    }

    /// **Derselbe Motor unter einer Übergangstabelle** ✓ — die DST-fähige Gestalt ✓.
    fn motor_unter_tabelle(tabelle: Vec<TimeZoneTransition>, at_utc_ms: i64) -> (f64, f64) {
        motor_mit(|motor| {
            UserZoneContext::with_transitions(motor, tabelle)
                .expect("nicht-leere Tabelle")
                .install_at(Some(at_utc_ms))
                .expect("die Tabelle bedeckt den Zeitpunkt")
        })
    }

    /// Baut den Motor, setzt die Zone **vor** den Formeln ✓ und liefert `(TODAY, NOW)` ✓.
    fn motor_mit<F>(setze_zone: F) -> (f64, f64)
    where
        F: FnOnce(&SpreadsheetEngine) -> super::UserZoneGuard,
    {
        let mut motor = SpreadsheetEngine::new();
        let waechter = setze_zone(&motor);
        let heute = CellCoord::new(5, 5);
        let jetzt = CellCoord::new(6, 5);
        motor.set_formula(heute, "=TODAY()").expect("Formel");
        motor.set_formula(jetzt, "=NOW()").expect("Formel");
        let ergebnis = (als_zahl(motor.get_value(&heute)), als_zahl(motor.get_value(&jetzt)));
        drop(waechter);
        ergebnis
    }

    /// **Der Zeuge:** eine **Nicht-Host**-Zone verschiebt `TODAY`/`NOW` im echten Motor um **genau** ihren Offset ✓.
    #[test]
    fn die_zone_der_nutzlast_verschiebt_today_und_now_im_echten_motor() {
        // Fester Zeitpunkt: 2026-03-15 **22:30 UTC**. +14 h → **16.03. 12:30** (Datumswechsel ✓), −11 h → **15.03. 11:30** ✓.
        let (heute_plus14, jetzt_plus14) = motor_unter_zone(14 * 60);
        let (heute_minus11, jetzt_minus11) = motor_unter_zone(-11 * 60);

        // **Getragen, nicht behauptet** ✓: gleicher Zeitpunkt, zwei Zonen, zwei Ergebnisse ✓.
        assert_ne!(heute_plus14, heute_minus11, "TODAY war in beiden Zonen gleich — die Zone wird nicht getragen");
        assert_ne!(jetzt_plus14, jetzt_minus11, "NOW war in beiden Zonen gleich — die Zone wird nicht getragen");

        // **Die Beträge stimmen** ✓ — unabhängig von der Zone des Rechners, weil der Zeitpunkt festgehalten ist ✓.
        let tag_plus14 = date_to_serial(chrono::NaiveDate::from_ymd_opt(2026, 3, 16).expect("Datum"));
        let tag_minus11 = date_to_serial(chrono::NaiveDate::from_ymd_opt(2026, 3, 15).expect("Datum"));
        assert_eq!(heute_plus14, tag_plus14, "+14 h muss der 16.03. sein");
        assert_eq!(heute_minus11, tag_minus11, "−11 h muss der 15.03. sein");
        assert!((jetzt_plus14 - (tag_plus14 + 12.5 / 24.0)).abs() < 1e-9, "NOW (+14) war {jetzt_plus14}");
        assert!((jetzt_minus11 - (tag_minus11 + 11.5 / 24.0)).abs() < 1e-9, "NOW (−11) war {jetzt_minus11}");
        // **25 Stunden** Unterschied zum selben Zeitpunkt ✓ — der Unterschied der beiden Offsets ✓.
        assert!((jetzt_plus14 - jetzt_minus11 - 25.0 / 24.0).abs() < 1e-9, "Offset-Unterschied nicht 25 h");
    }

    /// **Dieselbe Nutzlast ergibt zweimal dasselbe** ✓ — der festgehaltene Zeitpunkt macht es möglich ✓.
    #[test]
    fn dieselbe_nutzlast_ergibt_zweimal_dasselbe() {
        assert_eq!(motor_unter_zone(120), motor_unter_zone(120));
        assert_eq!(motor_unter_zone(-330), motor_unter_zone(-330));
    }

    /// **Die Tabelle treibt den Motor** ✓ — und die DST-Regel gilt über die Umstellung hinweg ✓.
    #[test]
    fn eine_uebergangstabelle_verschiebt_den_echten_motor_ueber_die_dst_grenze() {
        // Berlin 2026: Winter +60 ✓, ab 2026-03-29 01:00 UTC Sommer +120 ✓ (die Gestalt aus W-321 ✓).
        let tabelle = vec![
            TimeZoneTransition { at_utc_ms: 0, offset_minutes: 60 },
            TimeZoneTransition { at_utc_ms: zeitpunkt_ms(2026, 3, 29, 1, 0), offset_minutes: 120 },
        ];
        let winter = zeitpunkt_ms(2026, 1, 15, 12, 0);
        let sommer = zeitpunkt_ms(2026, 7, 15, 12, 0);
        assert_eq!(offset_from_transitions(&tabelle, winter), Some(60));
        assert_eq!(offset_from_transitions(&tabelle, sommer), Some(120));

        let (heute_winter, jetzt_winter) = motor_unter_tabelle(tabelle.clone(), winter);
        let (heute_sommer, jetzt_sommer) = motor_unter_tabelle(tabelle, sommer);
        assert_eq!(heute_winter, date_to_serial(chrono::NaiveDate::from_ymd_opt(2026, 1, 15).expect("Datum")));
        assert_eq!(heute_sommer, date_to_serial(chrono::NaiveDate::from_ymd_opt(2026, 7, 15).expect("Datum")));
        // 12:00 UTC + **60** = 13:00 ✓ bzw. + **120** = 14:00 ✓ — **eine** Tabelle, **zwei** Offsets ✓.
        assert!((jetzt_winter - (heute_winter + 13.0 / 24.0)).abs() < 1e-9, "Winter: {jetzt_winter}");
        assert!((jetzt_sommer - (heute_sommer + 14.0 / 24.0)).abs() < 1e-9, "Sommer: {jetzt_sommer}");
    }

    /// **Additiv** ✓: **ohne** Zone bleibt es bei der Zone des Rechners — wie vor W-426 ✓.
    #[test]
    fn ohne_zone_bleibt_es_die_zone_des_rechners() {
        let mut motor = SpreadsheetEngine::new();
        let zelle = CellCoord::new(5, 5);
        motor.set_formula(zelle, "=TODAY()").expect("Formel");
        // Die Laufzeit zwischen beiden Uhrenabrufen liegt im Millisekundenbereich ✓ — nur ein Mitternachtswechsel
        // genau dazwischen könnte sie trennen ✓.
        assert_eq!(
            als_zahl(motor.get_value(&zelle)),
            date_to_serial(chrono::Local::now().date_naive()),
            "ohne Zone muss TODAY die Zone des Rechners lesen",
        );
    }

    /// **Die Sonde prüft den Standard** ✓ — `now_local` ist hier **nicht** überschrieben ✓, genau wie im Motor ✓.
    struct Rechnerzone;

    fn platzhalter(name: &str) -> ComputedValue {
        ComputedValue::Error(FormulaError::ValueError(format!("w426-test: {name} wird nicht gebraucht")))
    }

    impl EngineContext for Rechnerzone {
        fn eval_expr(&self, _expr: &Expr) -> ComputedValue {
            platzhalter("eval_expr")
        }
        fn eval_to_matrix(&self, _expr: &Expr) -> Vec<Vec<ComputedValue>> {
            panic!("w426-test: eval_to_matrix ungenutzt")
        }
        fn flatten_expr(&self, _expr: &Expr) -> Vec<ComputedValue> {
            panic!("w426-test: flatten_expr ungenutzt")
        }
        fn current_coord(&self) -> Option<CellCoord> {
            panic!("w426-test: current_coord ungenutzt")
        }
        fn get_cell_value(&self, _coord: &CellCoord) -> ComputedValue {
            panic!("w426-test: get_cell_value ungenutzt")
        }
        // **Kein `now_local`** ✓ — diese Sonde misst **genau den Standard**, den der Motor benutzt ✓.
    }

    #[test]
    fn der_waechter_gibt_die_vorherige_zone_zurueck() {
        let at = zeitpunkt_ms(2026, 3, 15, 22, 30);
        let aussen = UserZoneContext::new(&Rechnerzone, 60).install_at(Some(at)).expect("fester Offset");
        assert_eq!(Rechnerzone.now_local(), als_utc(at + 60 * 60_000));
        let innen = UserZoneContext::new(&Rechnerzone, 120).install_at(Some(at)).expect("fester Offset");
        assert_eq!(Rechnerzone.now_local(), als_utc(at + 120 * 60_000), "der innere Wächter gilt");
        drop(innen);
        assert_eq!(Rechnerzone.now_local(), als_utc(at + 60 * 60_000), "danach gilt wieder der äußere");
        drop(aussen);
        // **Und ohne Wächter die Uhr des Rechners** ✓ — die Laufzeit dazwischen ist Millisekunden ✓.
        assert!(
            (Rechnerzone.now_local() - chrono::Local::now().naive_local()).num_seconds().abs() <= 5,
            "ohne Wächter muss wieder die Zone des Rechners gelten",
        );
    }

    /// **Fail-closed mit Namen** ✓: eine unbedeckte Tabelle wird **abgelehnt** ✓, nicht still „UTC 0" ✗.
    #[test]
    fn unbrauchbare_zonenangaben_werden_benannt_abgelehnt() {
        let tabelle = vec![TimeZoneTransition { at_utc_ms: 1_000_000, offset_minutes: 120 }];
        let kontext = UserZoneContext::with_transitions(&Rechnerzone, tabelle).expect("nicht-leere Tabelle");
        assert_eq!(
            kontext.install_at(Some(999_999)).err(),
            Some("w426: time zone table does not cover the evaluation instant"),
        );
        assert_eq!(
            kontext.install_at(None).err(),
            Some("w426: a transition table needs the evaluation instant"),
        );
        assert_eq!(
            UserZoneContext::new(&Rechnerzone, 60).install_at(Some(i64::MAX)).err(),
            Some("w426: evaluation instant is not representable"),
        );
    }
}
