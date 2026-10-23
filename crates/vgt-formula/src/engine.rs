//! # VGT Spreadsheet Engine
//! Manages sparse spreadsheet cell storage, formula dependencies, topological recalculation, and built-in functions.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet, VecDeque};

use crate::functions::EngineContext;
use crate::limits::{EvaluationBudget, FormulaLimits};
use crate::parser::Parser;
use crate::types::{BinaryOpKind, CellCoord, ComputedValue, Expr, FormulaError};

/// Sparse Spreadsheet Sheet Engine with Dependency Graph and Dynamic Array Spill Support
pub struct SpreadsheetEngine {
    /// Raw formula strings per cell
    formulas: HashMap<CellCoord, String>,
    /// Evaluated values cache
    values: HashMap<CellCoord, ComputedValue>,
    /// Dependency graph: Cell A -> Set of cells that depend on A
    dependents: HashMap<CellCoord, HashSet<CellCoord>>,
    /// Predecessors: Cell B -> Set of cells that B depends on
    predecessors: HashMap<CellCoord, HashSet<CellCoord>>,
    /// Dynamic Array Spills: Master Cell -> List of spilled target coordinates
    spill_ranges: HashMap<CellCoord, Vec<CellCoord>>,
    /// Spilled Cell -> Master Cell
    spill_origins: HashMap<CellCoord, CellCoord>,
    /// Current cell being recalculated (for context)
    current_recalculating_cell: Option<CellCoord>,
    /// Workbook-scoped names supplied by the host. No network or file access occurs here.
    named_values: HashMap<String, ComputedValue>,
    name_dependents: HashMap<String, HashSet<CellCoord>>,
    name_predecessors: HashMap<CellCoord, HashSet<String>>,
    /// Structured table references are resolved by an explicit host binding.
    structured_values: HashMap<String, ComputedValue>,
    structured_dependents: HashMap<String, HashSet<CellCoord>>,
    structured_predecessors: HashMap<CellCoord, HashSet<String>>,
    /// Qualified sheet references are injected by the workbook host after permission checks.
    qualified_values: HashMap<String, ComputedValue>,
    qualified_dependents: HashMap<String, HashSet<CellCoord>>,
    qualified_predecessors: HashMap<CellCoord, HashSet<String>>,
    limits: FormulaLimits,
    evaluation_budget: RefCell<EvaluationBudget>,
}

impl SpreadsheetEngine {
    pub fn new() -> Self {
        Self {
            formulas: HashMap::new(),
            values: HashMap::new(),
            dependents: HashMap::new(),
            predecessors: HashMap::new(),
            spill_ranges: HashMap::new(),
            spill_origins: HashMap::new(),
            current_recalculating_cell: None,
            named_values: HashMap::new(),
            name_dependents: HashMap::new(),
            name_predecessors: HashMap::new(),
            structured_values: HashMap::new(),
            structured_dependents: HashMap::new(),
            structured_predecessors: HashMap::new(),
            qualified_values: HashMap::new(),
            qualified_dependents: HashMap::new(),
            qualified_predecessors: HashMap::new(),
            limits: FormulaLimits::DEFAULT,
            evaluation_budget: RefCell::new(EvaluationBudget::new(FormulaLimits::DEFAULT)),
        }
    }

    /// Set a direct static value
    pub fn set_value(&mut self, coord: CellCoord, value: ComputedValue) {
        // If this cell was a master of spills, clear its old spills
        self.clear_spills(&coord);

        // If this cell was occupied by another master's spill, notify that master
        let old_origin = self.spill_origins.remove(&coord);

        self.formulas.remove(&coord);
        self.clear_predecessors(&coord);

        if value == ComputedValue::Empty {
            self.values.remove(&coord);
        } else {
            self.values.insert(coord, value);
        }

        self.recalculate_dependents(&coord);

        if let Some(origin) = old_origin {
            self.recalculate_cell(&origin);
            self.recalculate_dependents(&origin);
        }

        self.retry_blocked_spills();
    }

    /// Set a formula on a cell, e.g. "=SUM(A1:A10)"
    pub fn set_formula(&mut self, coord: CellCoord, formula: &str) -> Result<(), FormulaError> {
        let ast = Parser::parse(formula)?;

        // Find bounded dependencies across cells, names, tables and qualified sheets.
        let mut referenced_cells = HashSet::new();
        let mut referenced_names = HashSet::new();
        let mut referenced_structured = HashSet::new();
        let mut referenced_qualified = HashSet::new();
        let mut dependency_count = 0usize;
        self.extract_dependencies(
            &ast,
            &mut referenced_cells,
            &mut referenced_names,
            &mut referenced_structured,
            &mut referenced_qualified,
            &mut dependency_count,
        )?;

        // Circular dependency check for local cell edges. Named/table/sheet bindings are values,
        // not executable callbacks, so they cannot smuggle a recursive evaluator into the graph.
        if self.detect_cycle(&coord, &referenced_cells) {
            self.values.insert(
                coord,
                ComputedValue::Error(FormulaError::CircularDependency(coord.to_a1_string())),
            );
            return Err(FormulaError::CircularDependency(coord.to_a1_string()));
        }

        // If this cell was occupied by another master's spill, notify that master
        let old_origin = self.spill_origins.remove(&coord);

        // Update graph
        self.clear_predecessors(&coord);
        for dep in &referenced_cells {
            self.dependents.entry(*dep).or_default().insert(coord);
        }
        for name in &referenced_names {
            self.name_dependents
                .entry(name.clone())
                .or_default()
                .insert(coord);
        }
        for reference in &referenced_structured {
            self.structured_dependents
                .entry(reference.clone())
                .or_default()
                .insert(coord);
        }
        for reference in &referenced_qualified {
            self.qualified_dependents
                .entry(reference.clone())
                .or_default()
                .insert(coord);
        }
        self.predecessors.insert(coord, referenced_cells);
        self.name_predecessors.insert(coord, referenced_names);
        self.structured_predecessors
            .insert(coord, referenced_structured);
        self.qualified_predecessors
            .insert(coord, referenced_qualified);
        self.formulas.insert(coord, formula.to_string());

        // Recalculate this cell and all its dependents
        self.recalculate_cell(&coord);
        self.recalculate_dependents(&coord);

        if let Some(origin) = old_origin {
            self.recalculate_cell(&origin);
            self.recalculate_dependents(&origin);
        }

        self.retry_blocked_spills();

        Ok(())
    }

    pub fn set_named_value(
        &mut self,
        name: &str,
        value: ComputedValue,
    ) -> Result<(), FormulaError> {
        let key = name.trim().to_uppercase();
        if key.is_empty() || key.len() > 255 {
            return Err(FormulaError::NameError("invalid_name".into()));
        }
        self.named_values.insert(key.clone(), value);
        self.recalculate_binding_dependents(
            self.name_dependents.get(&key).cloned().unwrap_or_default(),
        );
        Ok(())
    }

    pub fn set_structured_reference(
        &mut self,
        reference: &str,
        value: ComputedValue,
    ) -> Result<(), FormulaError> {
        let key = reference.trim().to_uppercase();
        if key.is_empty() || key.len() > 1024 {
            return Err(FormulaError::RefError);
        }
        self.structured_values.insert(key.clone(), value);
        self.recalculate_binding_dependents(
            self.structured_dependents
                .get(&key)
                .cloned()
                .unwrap_or_default(),
        );
        Ok(())
    }

    pub fn set_qualified_cell_value(
        &mut self,
        sheet: &str,
        coord: CellCoord,
        value: ComputedValue,
    ) -> Result<(), FormulaError> {
        if !coord.is_valid() || sheet.trim().is_empty() || sheet.len() > 255 {
            return Err(FormulaError::RefError);
        }
        let key = Self::qualified_key(sheet, &coord);
        self.qualified_values.insert(key.clone(), value);
        self.recalculate_binding_dependents(
            self.qualified_dependents
                .get(&key)
                .cloned()
                .unwrap_or_default(),
        );
        Ok(())
    }

    pub fn cancel_current_evaluation(&self) {
        self.evaluation_budget.borrow_mut().cancel();
    }

    fn recalculate_binding_dependents(&mut self, cells: HashSet<CellCoord>) {
        for cell in cells {
            self.recalculate_cell(&cell);
            self.recalculate_dependents(&cell);
        }
    }

    pub fn get_value(&self, coord: &CellCoord) -> ComputedValue {
        self.values
            .get(coord)
            .cloned()
            .unwrap_or(ComputedValue::Empty)
    }

    pub fn get_formula(&self, coord: &CellCoord) -> Option<&String> {
        self.formulas.get(coord)
    }

    /// Returns the coordinates spilled by the formula at `coord`, if it is a dynamic array master
    pub fn get_spill_range(&self, coord: &CellCoord) -> Option<&[CellCoord]> {
        self.spill_ranges.get(coord).map(|v| v.as_slice())
    }

    /// Returns the origin cell if `coord` is part of a spilled dynamic array
    pub fn get_spill_origin(&self, coord: &CellCoord) -> Option<CellCoord> {
        self.spill_origins.get(coord).copied()
    }

    fn clear_predecessors(&mut self, coord: &CellCoord) {
        if let Some(old_preds) = self.predecessors.remove(coord) {
            for pred in old_preds {
                if let Some(deps) = self.dependents.get_mut(&pred) {
                    deps.remove(coord);
                }
            }
        }
        if let Some(old) = self.name_predecessors.remove(coord) {
            for key in old {
                if let Some(deps) = self.name_dependents.get_mut(&key) {
                    deps.remove(coord);
                }
            }
        }
        if let Some(old) = self.structured_predecessors.remove(coord) {
            for key in old {
                if let Some(deps) = self.structured_dependents.get_mut(&key) {
                    deps.remove(coord);
                }
            }
        }
        if let Some(old) = self.qualified_predecessors.remove(coord) {
            for key in old {
                if let Some(deps) = self.qualified_dependents.get_mut(&key) {
                    deps.remove(coord);
                }
            }
        }
    }

    fn clear_spills(&mut self, coord: &CellCoord) -> Vec<CellCoord> {
        if let Some(old_spilled) = self.spill_ranges.remove(coord) {
            for target in &old_spilled {
                self.values.remove(target);
                self.spill_origins.remove(target);
            }
            old_spilled
        } else {
            Vec::new()
        }
    }

    fn retry_blocked_spills(&mut self) {
        let spill_error_cells: Vec<CellCoord> = self
            .values
            .iter()
            .filter_map(|(coord, val)| {
                if matches!(val, ComputedValue::Error(FormulaError::SpillError(_)))
                    && self.formulas.contains_key(coord)
                {
                    Some(*coord)
                } else {
                    None
                }
            })
            .collect();

        for c in spill_error_cells {
            self.recalculate_cell(&c);
            self.recalculate_dependents(&c);
        }
    }

    fn extract_dependencies(
        &self,
        expr: &Expr,
        cells: &mut HashSet<CellCoord>,
        names: &mut HashSet<String>,
        structured: &mut HashSet<String>,
        qualified: &mut HashSet<String>,
        count: &mut usize,
    ) -> Result<(), FormulaError> {
        match expr {
            Expr::CellRef(c) => {
                self.charge_dependencies(count, 1)?;
                cells.insert(*c);
            }
            Expr::RangeRef(start, end) => {
                let min_col = start.col.min(end.col);
                let max_col = start.col.max(end.col);
                let min_row = start.row.min(end.row);
                let max_row = start.row.max(end.row);
                let amount = (max_col - min_col + 1) as usize * (max_row - min_row + 1) as usize;
                self.charge_dependencies(count, amount)?;
                for c in min_col..=max_col {
                    for r in min_row..=max_row {
                        cells.insert(CellCoord::new(c, r));
                    }
                }
            }
            Expr::NameRef(name) => {
                self.charge_dependencies(count, 1)?;
                names.insert(name.to_uppercase());
            }
            Expr::StructuredRef(reference) => {
                self.charge_dependencies(count, 1)?;
                structured.insert(reference.to_uppercase());
            }
            Expr::QualifiedCellRef { sheet, coord } => {
                self.charge_dependencies(count, 1)?;
                qualified.insert(Self::qualified_key(sheet, coord));
            }
            Expr::QualifiedRangeRef { sheet, start, end } => {
                let min_col = start.col.min(end.col);
                let max_col = start.col.max(end.col);
                let min_row = start.row.min(end.row);
                let max_row = start.row.max(end.row);
                let amount = (max_col - min_col + 1) as usize * (max_row - min_row + 1) as usize;
                self.charge_dependencies(count, amount)?;
                for c in min_col..=max_col {
                    for r in min_row..=max_row {
                        qualified.insert(Self::qualified_key(sheet, &CellCoord::new(c, r)));
                    }
                }
            }
            Expr::BinaryOp { left, right, .. } => {
                self.extract_dependencies(left, cells, names, structured, qualified, count)?;
                self.extract_dependencies(right, cells, names, structured, qualified, count)?;
            }
            Expr::UnaryNeg(inner) => {
                self.extract_dependencies(inner, cells, names, structured, qualified, count)?
            }
            Expr::FunctionCall { args, .. } => {
                for arg in args {
                    self.extract_dependencies(arg, cells, names, structured, qualified, count)?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn qualified_key(sheet: &str, coord: &CellCoord) -> String {
        format!("{}!{}", sheet.trim().to_uppercase(), coord.to_a1_string())
    }

    fn charge_dependencies(&self, count: &mut usize, amount: usize) -> Result<(), FormulaError> {
        *count = count.saturating_add(amount);
        if *count > self.limits.max_reference_cells {
            Err(FormulaError::ResourceLimit("dependency_cells".into()))
        } else {
            Ok(())
        }
    }

    /// DFS cycle detector
    fn detect_cycle(&self, target: &CellCoord, new_deps: &HashSet<CellCoord>) -> bool {
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();

        for dep in new_deps {
            if dep == target {
                return true;
            }
            queue.push_back(*dep);
        }

        while let Some(current) = queue.pop_front() {
            if current == *target {
                return true;
            }
            if visited.insert(current) {
                if let Some(next_deps) = self.predecessors.get(&current) {
                    for next in next_deps {
                        queue.push_back(*next);
                    }
                }
            }
        }

        false
    }

    fn recalculate_cell(&mut self, coord: &CellCoord) {
        self.current_recalculating_cell = Some(*coord);
        self.evaluation_budget.borrow_mut().reset();

        let old_spilled = self.clear_spills(coord);

        if let Some(formula_str) = self.formulas.get(coord).cloned() {
            let result = match Parser::parse(&formula_str) {
                Ok(ast) => self.eval_ast(&ast),
                Err(e) => ComputedValue::Error(e),
            };

            match result {
                ComputedValue::Array(matrix) => {
                    let num_rows = matrix.len();
                    let num_cols = if num_rows > 0 { matrix[0].len() } else { 0 };
                    if num_rows.saturating_mul(num_cols) > self.limits.max_array_cells {
                        self.values.insert(
                            *coord,
                            ComputedValue::Error(FormulaError::ResourceLimit("array_cells".into())),
                        );
                        self.current_recalculating_cell = None;
                        return;
                    }

                    if num_rows == 0 || num_cols == 0 {
                        self.values.insert(*coord, ComputedValue::Empty);
                        for target in old_spilled {
                            self.recalculate_dependents(&target);
                        }
                    } else if num_rows == 1 && num_cols == 1 {
                        self.values.insert(*coord, matrix[0][0].clone());
                        for target in old_spilled {
                            self.recalculate_dependents(&target);
                        }
                    } else {
                        // Boundary check against Sheet maximums
                        let max_c = coord.col as u64 + num_cols as u64 - 1;
                        let max_r = coord.row as u64 + num_rows as u64 - 1;

                        if max_c >= CellCoord::MAX_COLS as u64
                            || max_r >= CellCoord::MAX_ROWS as u64
                        {
                            self.values.insert(
                                *coord,
                                ComputedValue::Error(FormulaError::SpillError(
                                    "Spill range exceeds sheet limits".into(),
                                )),
                            );
                            for target in old_spilled {
                                self.recalculate_dependents(&target);
                            }
                        } else {
                            // Collision detection
                            let mut collision = false;
                            let mut targets = Vec::new();

                            'collision_check: for r in 0..num_rows {
                                for c in 0..num_cols {
                                    if r == 0 && c == 0 {
                                        continue;
                                    }
                                    let target =
                                        CellCoord::new(coord.col + c as u32, coord.row + r as u32);

                                    // Collision conditions:
                                    // 1. Target has its own formula
                                    if self.formulas.contains_key(&target) {
                                        collision = true;
                                        break 'collision_check;
                                    }
                                    // 2. Target has a non-empty static value
                                    if let Some(val) = self.values.get(&target) {
                                        if *val != ComputedValue::Empty {
                                            collision = true;
                                            break 'collision_check;
                                        }
                                    }
                                    // 3. Target is the master of another dynamic array spill
                                    if self.spill_ranges.contains_key(&target) {
                                        collision = true;
                                        break 'collision_check;
                                    }
                                    // 4. Target is already a spilled cell of a DIFFERENT master
                                    if let Some(other_origin) = self.spill_origins.get(&target) {
                                        if other_origin != coord {
                                            collision = true;
                                            break 'collision_check;
                                        }
                                    }
                                    // 5. Target is referenced as a predecessor of this formula
                                    if let Some(preds) = self.predecessors.get(coord) {
                                        if preds.contains(&target) {
                                            collision = true;
                                            break 'collision_check;
                                        }
                                    }

                                    targets.push((target, r, c));
                                }
                            }

                            if collision {
                                self.values.insert(
                                    *coord,
                                    ComputedValue::Error(FormulaError::SpillError(
                                        "Spill range is not blank".into(),
                                    )),
                                );
                                for target in old_spilled {
                                    self.recalculate_dependents(&target);
                                }
                            } else {
                                // Master cell keeps the full Array value
                                self.values
                                    .insert(*coord, ComputedValue::Array(matrix.clone()));

                                let mut new_spilled = Vec::with_capacity(targets.len());
                                for (target, r, c) in targets {
                                    self.values.insert(target, matrix[r][c].clone());
                                    self.spill_origins.insert(target, *coord);
                                    new_spilled.push(target);
                                }
                                self.spill_ranges.insert(*coord, new_spilled.clone());

                                // Clean up old spilled coordinates that are no longer part of the new spill
                                for target in old_spilled {
                                    if !new_spilled.contains(&target) {
                                        self.recalculate_dependents(&target);
                                    }
                                }

                                // Recalculate dependents of the newly spilled cells
                                for target in new_spilled {
                                    self.recalculate_dependents(&target);
                                }
                            }
                        }
                    }
                }
                other => {
                    self.values.insert(*coord, other);
                    for target in old_spilled {
                        self.recalculate_dependents(&target);
                    }
                }
            }
        }

        self.current_recalculating_cell = None;
    }

    fn recalculate_dependents(&mut self, source: &CellCoord) {
        // Topological-style breadth propagation
        let mut dirty_queue = VecDeque::new();
        if let Some(direct) = self.dependents.get(source) {
            for d in direct {
                dirty_queue.push_back(*d);
            }
        }

        let mut seen = HashSet::new();
        while let Some(cell) = dirty_queue.pop_front() {
            if seen.insert(cell) {
                self.recalculate_cell(&cell);
                if let Some(next_deps) = self.dependents.get(&cell) {
                    for nd in next_deps {
                        dirty_queue.push_back(*nd);
                    }
                }
            }
        }
    }

    fn eval_ast(&self, expr: &Expr) -> ComputedValue {
        if !self.evaluation_budget.borrow_mut().step() {
            return ComputedValue::Error(FormulaError::ResourceLimit("evaluation_budget".into()));
        }
        match expr {
            Expr::Number(n) => ComputedValue::Number(*n),
            Expr::StringLiteral(s) => ComputedValue::String(s.clone()),
            Expr::Boolean(b) => ComputedValue::Boolean(*b),
            Expr::CellRef(coord) => self.get_value(coord),
            Expr::NameRef(name) => self
                .named_values
                .get(&name.to_uppercase())
                .cloned()
                .unwrap_or_else(|| ComputedValue::Error(FormulaError::NameError(name.clone()))),
            Expr::StructuredRef(reference) => self
                .structured_values
                .get(&reference.to_uppercase())
                .cloned()
                .unwrap_or(ComputedValue::Error(FormulaError::RefError)),
            Expr::QualifiedCellRef { sheet, coord } => self
                .qualified_values
                .get(&Self::qualified_key(sheet, coord))
                .cloned()
                .unwrap_or(ComputedValue::Error(FormulaError::RefError)),
            Expr::RangeRef(_, _) | Expr::QualifiedRangeRef { .. } => ComputedValue::Error(
                FormulaError::ValueError("Cannot use range outside function".into()),
            ),
            Expr::UnaryNeg(inner) => {
                let val = self.eval_ast(inner);
                if let ComputedValue::Error(_) = val {
                    return val;
                }
                match val.as_number() {
                    Ok(n) => ComputedValue::Number(-n),
                    Err(e) => ComputedValue::Error(e),
                }
            }
            Expr::BinaryOp { op, left, right } => {
                let left_val = self.eval_ast(left);
                if let ComputedValue::Error(_) = left_val {
                    return left_val;
                }
                let right_val = self.eval_ast(right);
                if let ComputedValue::Error(_) = right_val {
                    return right_val;
                }

                match op {
                    BinaryOpKind::Concat => ComputedValue::String(format!(
                        "{}{}",
                        left_val.as_string(),
                        right_val.as_string()
                    )),
                    BinaryOpKind::Eq => ComputedValue::Boolean(left_val == right_val),
                    BinaryOpKind::Neq => ComputedValue::Boolean(left_val != right_val),
                    BinaryOpKind::Lt => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Boolean(l < r)
                    }
                    BinaryOpKind::Lte => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Boolean(l <= r)
                    }
                    BinaryOpKind::Gt => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Boolean(l > r)
                    }
                    BinaryOpKind::Gte => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Boolean(l >= r)
                    }
                    BinaryOpKind::Add => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Number(l + r)
                    }
                    BinaryOpKind::Sub => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Number(l - r)
                    }
                    BinaryOpKind::Mul => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Number(l * r)
                    }
                    BinaryOpKind::Div => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        if r == 0.0 {
                            ComputedValue::Error(FormulaError::DivisionByZero)
                        } else {
                            ComputedValue::Number(l / r)
                        }
                    }
                    BinaryOpKind::Pow => {
                        let l = match left_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        let r = match right_val.as_number() {
                            Ok(v) => v,
                            Err(e) => return ComputedValue::Error(e),
                        };
                        ComputedValue::Number(l.powf(r))
                    }
                }
            }
            Expr::FunctionCall { name, args } => self.eval_function(name, args),
        }
    }

    fn eval_function(&self, name: &str, args: &[Expr]) -> ComputedValue {
        crate::functions::call_function(name, args, self)
    }

    pub fn eval_to_matrix(&self, expr: &Expr) -> Vec<Vec<ComputedValue>> {
        match expr {
            Expr::QualifiedRangeRef { sheet, start, end } => {
                let min_col = start.col.min(end.col);
                let max_col = start.col.max(end.col);
                let min_row = start.row.min(end.row);
                let max_row = start.row.max(end.row);
                let amount = (max_col - min_col + 1) as usize * (max_row - min_row + 1) as usize;
                if amount > self.limits.max_array_cells {
                    return vec![vec![ComputedValue::Error(FormulaError::ResourceLimit(
                        "array_cells".into(),
                    ))]];
                }
                let mut matrix = Vec::with_capacity((max_row - min_row + 1) as usize);
                for r in min_row..=max_row {
                    let mut row = Vec::with_capacity((max_col - min_col + 1) as usize);
                    for c in min_col..=max_col {
                        let key = Self::qualified_key(sheet, &CellCoord::new(c, r));
                        row.push(
                            self.qualified_values
                                .get(&key)
                                .cloned()
                                .unwrap_or(ComputedValue::Empty),
                        );
                    }
                    matrix.push(row);
                }
                matrix
            }
            Expr::RangeRef(start, end) => {
                let min_col = start.col.min(end.col);
                let max_col = start.col.max(end.col);
                let min_row = start.row.min(end.row);
                let max_row = start.row.max(end.row);
                let amount = (max_col - min_col + 1) as usize * (max_row - min_row + 1) as usize;
                if amount > self.limits.max_array_cells {
                    return vec![vec![ComputedValue::Error(FormulaError::ResourceLimit(
                        "array_cells".into(),
                    ))]];
                }
                let mut matrix = Vec::with_capacity((max_row - min_row + 1) as usize);
                for r in min_row..=max_row {
                    let mut row = Vec::with_capacity((max_col - min_col + 1) as usize);
                    for c in min_col..=max_col {
                        let coord = CellCoord::new(c, r);
                        let val = self.get_value(&coord);
                        if let ComputedValue::Array(ref m) = val {
                            if let Some(first_row) = m.first() {
                                if let Some(first_val) = first_row.first() {
                                    row.push(first_val.clone());
                                    continue;
                                }
                            }
                        }
                        row.push(val);
                    }
                    matrix.push(row);
                }
                matrix
            }
            Expr::QualifiedCellRef { sheet, coord } => vec![vec![self
                .qualified_values
                .get(&Self::qualified_key(sheet, coord))
                .cloned()
                .unwrap_or(ComputedValue::Empty)]],
            Expr::CellRef(coord) => {
                let val = self.get_value(coord);
                if let ComputedValue::Array(matrix) = val {
                    matrix
                } else {
                    vec![vec![val]]
                }
            }
            other => {
                let val = self.eval_ast(other);
                if let ComputedValue::Array(matrix) = val {
                    matrix
                } else {
                    vec![vec![val]]
                }
            }
        }
    }

    pub fn flatten_expr(&self, expr: &Expr) -> Vec<ComputedValue> {
        match expr {
            Expr::RangeRef(start, end) => {
                let min_col = start.col.min(end.col);
                let max_col = start.col.max(end.col);
                let min_row = start.row.min(end.row);
                let max_row = start.row.max(end.row);
                let amount = (max_col - min_col + 1) as usize * (max_row - min_row + 1) as usize;
                if amount > self.limits.max_array_cells {
                    return vec![ComputedValue::Error(FormulaError::ResourceLimit(
                        "array_cells".into(),
                    ))];
                }
                let mut list = Vec::with_capacity(amount);
                for r in min_row..=max_row {
                    for c in min_col..=max_col {
                        let coord = CellCoord::new(c, r);
                        let val = self.get_value(&coord);
                        if let ComputedValue::Array(ref m) = val {
                            if let Some(first_row) = m.first() {
                                if let Some(first_val) = first_row.first() {
                                    list.push(first_val.clone());
                                    continue;
                                }
                            }
                        }
                        list.push(val);
                    }
                }
                list
            }
            Expr::QualifiedRangeRef { .. } => {
                self.eval_to_matrix(expr).into_iter().flatten().collect()
            }
            Expr::QualifiedCellRef { sheet, coord } => vec![self
                .qualified_values
                .get(&Self::qualified_key(sheet, coord))
                .cloned()
                .unwrap_or(ComputedValue::Empty)],
            Expr::CellRef(coord) => {
                let val = self.get_value(coord);
                if let ComputedValue::Array(matrix) = val {
                    matrix.into_iter().flatten().collect()
                } else {
                    vec![val]
                }
            }
            other => {
                let val = self.eval_ast(other);
                if let ComputedValue::Array(matrix) = val {
                    matrix.into_iter().flatten().collect()
                } else {
                    vec![val]
                }
            }
        }
    }
}

impl EngineContext for SpreadsheetEngine {
    fn eval_expr(&self, expr: &Expr) -> ComputedValue {
        self.eval_ast(expr)
    }

    fn eval_to_matrix(&self, expr: &Expr) -> Vec<Vec<ComputedValue>> {
        self.eval_to_matrix(expr)
    }

    fn flatten_expr(&self, expr: &Expr) -> Vec<ComputedValue> {
        self.flatten_expr(expr)
    }

    fn current_coord(&self) -> Option<CellCoord> {
        self.current_recalculating_cell
    }

    fn get_cell_value(&self, coord: &CellCoord) -> ComputedValue {
        self.get_value(coord)
    }
}

impl Default for SpreadsheetEngine {
    fn default() -> Self {
        Self::new()
    }
}
