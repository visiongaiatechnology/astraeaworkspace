//! # VGT Formula Engine Parser
//! Bounded recursive-descent AST parser for canonical spreadsheet expressions.

use crate::lexer::Lexer;
use crate::limits::FormulaLimits;
use crate::types::{BinaryOpKind, Expr, FormulaError, Token};

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
    depth: usize,
}

impl Parser {
    pub fn parse(input: &str) -> Result<Expr, FormulaError> {
        let tokens = Lexer::tokenize(input)?;
        if tokens.is_empty() {
            return Err(FormulaError::ParseError {
                message: "empty formula".into(),
                offset: 0,
            });
        }
        let mut parser = Parser {
            tokens,
            pos: 0,
            depth: 0,
        };
        let expr = parser.parse_expression()?;
        if parser.pos < parser.tokens.len() {
            return Err(FormulaError::ParseError {
                message: "unexpected trailing tokens".into(),
                offset: parser.pos,
            });
        }
        Ok(expr)
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<Token> {
        if self.pos >= self.tokens.len() {
            return None;
        }
        let token = self.tokens[self.pos].clone();
        self.pos += 1;
        Some(token)
    }

    fn parse_expression(&mut self) -> Result<Expr, FormulaError> {
        self.depth = self.depth.saturating_add(1);
        if self.depth > FormulaLimits::DEFAULT.max_parse_depth {
            self.depth = self.depth.saturating_sub(1);
            return Err(FormulaError::ResourceLimit("parse_depth".into()));
        }
        let result = self.parse_comparison();
        self.depth = self.depth.saturating_sub(1);
        result
    }

    fn parse_comparison(&mut self) -> Result<Expr, FormulaError> {
        let mut left = self.parse_concat()?;
        loop {
            let op = match self.peek() {
                Some(Token::Equal) => BinaryOpKind::Eq,
                Some(Token::NotEqual) => BinaryOpKind::Neq,
                Some(Token::LessThan) => BinaryOpKind::Lt,
                Some(Token::GreaterThan) => BinaryOpKind::Gt,
                Some(Token::LessEqual) => BinaryOpKind::Lte,
                Some(Token::GreaterEqual) => BinaryOpKind::Gte,
                _ => break,
            };
            self.advance();
            let right = self.parse_concat()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_concat(&mut self) -> Result<Expr, FormulaError> {
        let mut left = self.parse_additive()?;
        while matches!(self.peek(), Some(Token::Ampersand)) {
            self.advance();
            let right = self.parse_additive()?;
            left = Expr::BinaryOp {
                op: BinaryOpKind::Concat,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<Expr, FormulaError> {
        let mut left = self.parse_multiplicative()?;
        loop {
            let op = match self.peek() {
                Some(Token::Plus) => BinaryOpKind::Add,
                Some(Token::Minus) => BinaryOpKind::Sub,
                _ => break,
            };
            self.advance();
            let right = self.parse_multiplicative()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_multiplicative(&mut self) -> Result<Expr, FormulaError> {
        let mut left = self.parse_power()?;
        loop {
            let op = match self.peek() {
                Some(Token::Multiply) => BinaryOpKind::Mul,
                Some(Token::Divide) => BinaryOpKind::Div,
                _ => break,
            };
            self.advance();
            let right = self.parse_power()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_power(&mut self) -> Result<Expr, FormulaError> {
        let mut left = self.parse_unary()?;
        while matches!(self.peek(), Some(Token::Power)) {
            self.advance();
            let right = self.parse_unary()?;
            left = Expr::BinaryOp {
                op: BinaryOpKind::Pow,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, FormulaError> {
        match self.peek() {
            Some(Token::Minus) => {
                self.advance();
                Ok(Expr::UnaryNeg(Box::new(self.parse_unary()?)))
            }
            Some(Token::Plus) => {
                self.advance();
                self.parse_unary()
            }
            _ => self.parse_primary(),
        }
    }

    fn parse_primary(&mut self) -> Result<Expr, FormulaError> {
        match self.advance() {
            Some(Token::Number(n)) => Ok(Expr::Number(n)),
            Some(Token::StringLiteral(s)) => Ok(Expr::StringLiteral(s)),
            Some(Token::Boolean(b)) => {
                if matches!(self.peek(), Some(Token::LeftParen)) {
                    self.advance();
                    match self.advance() {
                        Some(Token::RightParen) => {}
                        _ => {
                            return Err(FormulaError::ParseError {
                                message: "expected ')' after boolean literal".into(),
                                offset: self.pos,
                            })
                        }
                    }
                }
                Ok(Expr::Boolean(b))
            }
            Some(Token::CellRef(coord)) => Ok(Expr::CellRef(coord)),
            Some(Token::RangeRef(start, end)) => Ok(Expr::RangeRef(start, end)),
            Some(Token::QualifiedCellRef(sheet, coord)) => {
                Ok(Expr::QualifiedCellRef { sheet, coord })
            }
            Some(Token::QualifiedRangeRef(sheet, start, end)) => {
                Ok(Expr::QualifiedRangeRef { sheet, start, end })
            }
            Some(Token::StructuredRef(reference)) => Ok(Expr::StructuredRef(reference)),
            Some(Token::LeftParen) => {
                let expr = self.parse_expression()?;
                match self.advance() {
                    Some(Token::RightParen) => Ok(expr),
                    _ => Err(FormulaError::ParseError {
                        message: "expected ')'".into(),
                        offset: self.pos,
                    }),
                }
            }
            Some(Token::Ident(name)) => {
                if matches!(self.peek(), Some(Token::LeftParen)) {
                    self.advance();
                    let args = self.parse_function_args()?;
                    Ok(Expr::FunctionCall { name, args })
                } else {
                    Ok(Expr::NameRef(name))
                }
            }
            other => Err(FormulaError::ParseError {
                message: format!("unexpected token: {:?}", other),
                offset: self.pos.saturating_sub(1),
            }),
        }
    }

    fn parse_function_args(&mut self) -> Result<Vec<Expr>, FormulaError> {
        let mut args = Vec::new();
        if matches!(self.peek(), Some(Token::RightParen)) {
            self.advance();
            return Ok(args);
        }
        loop {
            if args.len() >= 255 {
                return Err(FormulaError::ResourceLimit(
                    "function_argument_count".into(),
                ));
            }
            if matches!(self.peek(), Some(Token::Comma)) {
                args.push(Expr::StringLiteral(String::new()));
                self.advance();
                continue;
            }
            args.push(self.parse_expression()?);
            match self.peek() {
                Some(Token::Comma) => {
                    self.advance();
                    if matches!(self.peek(), Some(Token::RightParen)) {
                        args.push(Expr::StringLiteral(String::new()));
                        self.advance();
                        break;
                    }
                }
                Some(Token::RightParen) => {
                    self.advance();
                    break;
                }
                _ => {
                    return Err(FormulaError::ParseError {
                        message: "expected ',' or ')' in function arguments".into(),
                        offset: self.pos,
                    })
                }
            }
        }
        Ok(args)
    }
}
