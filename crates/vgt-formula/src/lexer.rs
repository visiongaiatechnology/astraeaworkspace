//! # VGT Formula Engine Lexer
//! Bounded tokenizer for canonical spreadsheet formulas.

use crate::limits::FormulaLimits;
use crate::types::{CellCoord, FormulaError, Token};

pub struct Lexer<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Lexer<'a> {
    pub fn tokenize(input: &'a str) -> Result<Vec<Token>, FormulaError> {
        let trimmed = input.trim();
        if trimmed.len() > FormulaLimits::DEFAULT.max_formula_bytes {
            return Err(FormulaError::ResourceLimit("formula_length".into()));
        }
        let body = trimmed.strip_prefix('=').unwrap_or(trimmed);
        let mut lexer = Self {
            input: body,
            pos: 0,
        };
        let mut tokens = Vec::new();
        while let Some(ch) = lexer.peek_char() {
            if ch.is_whitespace() {
                lexer.next_char();
                continue;
            }
            let offset = lexer.pos;
            let token = match ch {
                '+' => {
                    lexer.next_char();
                    Token::Plus
                }
                '-' => {
                    lexer.next_char();
                    Token::Minus
                }
                '*' => {
                    lexer.next_char();
                    Token::Multiply
                }
                '/' => {
                    lexer.next_char();
                    Token::Divide
                }
                '^' => {
                    lexer.next_char();
                    Token::Power
                }
                '&' => {
                    lexer.next_char();
                    Token::Ampersand
                }
                '(' => {
                    lexer.next_char();
                    Token::LeftParen
                }
                ')' => {
                    lexer.next_char();
                    Token::RightParen
                }
                ',' => {
                    lexer.next_char();
                    Token::Comma
                }
                '=' => {
                    lexer.next_char();
                    Token::Equal
                }
                '<' => {
                    lexer.next_char();
                    match lexer.peek_char() {
                        Some('=') => {
                            lexer.next_char();
                            Token::LessEqual
                        }
                        Some('>') => {
                            lexer.next_char();
                            Token::NotEqual
                        }
                        _ => Token::LessThan,
                    }
                }
                '>' => {
                    lexer.next_char();
                    if lexer.peek_char() == Some('=') {
                        lexer.next_char();
                        Token::GreaterEqual
                    } else {
                        Token::GreaterThan
                    }
                }
                '"' => lexer.read_string(offset)?,
                '\'' => lexer.read_quoted_sheet_reference(offset)?,
                c if c.is_ascii_digit() || c == '.' => lexer.read_number(offset)?,
                c if c.is_ascii_alphabetic() || c == '$' || c == '_' => {
                    lexer.read_identifier_or_reference(offset)?
                }
                other => {
                    return Err(FormulaError::ParseError {
                        message: format!("unexpected character '{}'", other),
                        offset,
                    })
                }
            };
            tokens.push(token);
            if tokens.len() > FormulaLimits::DEFAULT.max_tokens {
                return Err(FormulaError::ResourceLimit("token_count".into()));
            }
        }
        Ok(tokens)
    }

    fn peek_char(&self) -> Option<char> {
        self.input.get(self.pos..)?.chars().next()
    }

    fn next_char(&mut self) -> Option<char> {
        let ch = self.peek_char()?;
        self.pos += ch.len_utf8();
        Some(ch)
    }

    fn read_string(&mut self, offset: usize) -> Result<Token, FormulaError> {
        self.next_char();
        let mut out = String::new();
        loop {
            match self.next_char() {
                Some('"') if self.peek_char() == Some('"') => {
                    self.next_char();
                    out.push('"');
                }
                Some('"') => return Ok(Token::StringLiteral(out)),
                Some(ch) => out.push(ch),
                None => {
                    return Err(FormulaError::ParseError {
                        message: "unterminated string literal".into(),
                        offset,
                    })
                }
            }
        }
    }

    fn read_number(&mut self, offset: usize) -> Result<Token, FormulaError> {
        let start = self.pos;
        let mut seen_dot = false;
        let mut seen_exp = false;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_digit() {
                self.next_char();
                continue;
            }
            if ch == '.' && !seen_dot && !seen_exp {
                seen_dot = true;
                self.next_char();
                continue;
            }
            if (ch == 'e' || ch == 'E') && !seen_exp {
                seen_exp = true;
                self.next_char();
                if matches!(self.peek_char(), Some('+') | Some('-')) {
                    self.next_char();
                }
                continue;
            }
            break;
        }
        let raw = &self.input[start..self.pos];
        let value = raw.parse::<f64>().map_err(|_| FormulaError::ParseError {
            message: "invalid number literal".into(),
            offset,
        })?;
        if !value.is_finite() {
            return Err(FormulaError::ParseError {
                message: "non-finite number literal".into(),
                offset,
            });
        }
        Ok(Token::Number(value))
    }

    fn read_identifier_or_reference(&mut self, offset: usize) -> Result<Token, FormulaError> {
        let ident = self.read_identifier();
        if ident.is_empty() {
            return Err(FormulaError::ParseError {
                message: "empty identifier".into(),
                offset,
            });
        }

        if self.peek_char() == Some('!') {
            self.next_char();
            return self.read_qualified_reference(ident, offset);
        }

        if self.peek_char() == Some('[') {
            let mut text = ident;
            let mut depth = 0usize;
            while let Some(ch) = self.next_char() {
                text.push(ch);
                if ch == '[' {
                    depth += 1;
                }
                if ch == ']' {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        break;
                    }
                }
                if text.len() > 1024 {
                    return Err(FormulaError::ResourceLimit(
                        "structured_reference_length".into(),
                    ));
                }
            }
            if depth != 0 {
                return Err(FormulaError::ParseError {
                    message: "unterminated structured reference".into(),
                    offset,
                });
            }
            return Ok(Token::StructuredRef(text));
        }

        if self.peek_char() == Some(':') {
            self.next_char();
            let second = self.read_reference_atom();
            let start = CellCoord::parse(&ident).map_err(|_| FormulaError::ParseError {
                message: "invalid range start".into(),
                offset,
            })?;
            let end = CellCoord::parse(&second).map_err(|_| FormulaError::ParseError {
                message: "invalid range end".into(),
                offset: self.pos.saturating_sub(second.len()),
            })?;
            return Ok(Token::RangeRef(start, end));
        }

        if let Ok(coord) = CellCoord::parse(&ident) {
            return Ok(Token::CellRef(coord));
        }
        let upper = ident.to_uppercase();
        if upper == "TRUE" {
            return Ok(Token::Boolean(true));
        }
        if upper == "FALSE" {
            return Ok(Token::Boolean(false));
        }
        Ok(Token::Ident(upper))
    }

    fn read_quoted_sheet_reference(&mut self, offset: usize) -> Result<Token, FormulaError> {
        self.next_char();
        let mut sheet = String::new();
        loop {
            match self.next_char() {
                Some('\'') if self.peek_char() == Some('\'') => {
                    self.next_char();
                    sheet.push('\'');
                }
                Some('\'') => break,
                Some(ch) => sheet.push(ch),
                None => {
                    return Err(FormulaError::ParseError {
                        message: "unterminated quoted sheet name".into(),
                        offset,
                    })
                }
            }
        }
        if self.peek_char() != Some('!') {
            return Err(FormulaError::ParseError {
                message: "quoted sheet name must be followed by !".into(),
                offset,
            });
        }
        self.next_char();
        self.read_qualified_reference(sheet, offset)
    }

    fn read_qualified_reference(
        &mut self,
        sheet: String,
        offset: usize,
    ) -> Result<Token, FormulaError> {
        if sheet.is_empty() || sheet.len() > 255 {
            return Err(FormulaError::ParseError {
                message: "invalid sheet name".into(),
                offset,
            });
        }
        let first_raw = self.read_reference_atom();
        let first = CellCoord::parse(&first_raw).map_err(|_| FormulaError::ParseError {
            message: "invalid qualified cell reference".into(),
            offset: self.pos.saturating_sub(first_raw.len()),
        })?;
        if self.peek_char() == Some(':') {
            self.next_char();
            let second_raw = self.read_reference_atom();
            let second = CellCoord::parse(&second_raw).map_err(|_| FormulaError::ParseError {
                message: "invalid qualified range end".into(),
                offset: self.pos.saturating_sub(second_raw.len()),
            })?;
            Ok(Token::QualifiedRangeRef(sheet, first, second))
        } else {
            Ok(Token::QualifiedCellRef(sheet, first))
        }
    }

    fn read_identifier(&mut self) -> String {
        let start = self.pos;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_alphanumeric() || ch == '$' || ch == '_' || ch == '.' {
                self.next_char();
            } else {
                break;
            }
        }
        self.input[start..self.pos].to_string()
    }

    fn read_reference_atom(&mut self) -> String {
        let start = self.pos;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_alphanumeric() || ch == '$' {
                self.next_char();
            } else {
                break;
            }
        }
        self.input[start..self.pos].to_string()
    }
}
