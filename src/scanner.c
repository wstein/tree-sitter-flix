#include "tree_sitter/parser.h"

#include <wctype.h>

// External tokens for the parts of Flix's lexical grammar that cannot be
// expressed as regular expressions. Each corresponds to a decision the
// reference lexer (Lexer.scala) makes with lookahead or a counter.
enum TokenType {
  BLOCK_COMMENT,
  DEBUG_PREFIX,
  STRING_LITERAL,
  INTERPOLATION_START,
  INTERPOLATION_MIDDLE,
  INTERPOLATION_END,
  ARROW_TIGHT,
  ARROW_SPACED,
  DOT,
  DOT_SPACED,
};

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

// Consumes a `\` escape the way `Lexer.consumeSingleEscapes` does: a backslash
// swallows whatever character follows it, with no validation. Returns true if
// an escape was consumed.
static bool consume_escape(TSLexer *lexer) {
  if (lexer->lookahead != '\\') return false;
  advance(lexer);
  if (lexer->lookahead != 0) advance(lexer);
  return true;
}

// `/* ... */`, arbitrarily nested. Assumes the opening `/*` has not been
// consumed yet.
static bool scan_block_comment(TSLexer *lexer) {
  if (lexer->lookahead != '/') return false;
  advance(lexer);
  if (lexer->lookahead != '*') return false;
  advance(lexer);

  unsigned depth = 1;
  while (lexer->lookahead != 0) {
    if (lexer->lookahead == '/') {
      advance(lexer);
      if (lexer->lookahead == '*') {
        advance(lexer);
        depth++;
      }
    } else if (lexer->lookahead == '*') {
      advance(lexer);
      if (lexer->lookahead == '/') {
        advance(lexer);
        if (--depth == 0) {
          lexer->result_symbol = BLOCK_COMMENT;
          return true;
        }
      }
    } else {
      advance(lexer);
    }
  }

  // Unterminated: the reference lexer reports an unrecoverable error. Refusing
  // the token lets tree-sitter's own error recovery take over instead.
  return false;
}

// Scans the body of a string starting just after an opening `"` or `}`.
//
// A Flix string is split into tokens at each interpolation boundary, so the
// body ends at either `${` (more expression follows) or `"` (string is done).
// `open_symbol` is reported for the `${` ending, `close_symbol` for the `"`.
static bool scan_string_body(TSLexer *lexer, const bool *valid,
                             enum TokenType open_symbol, enum TokenType close_symbol) {
  while (lexer->lookahead != 0) {
    if (consume_escape(lexer)) continue;

    if (lexer->lookahead == '"') {
      advance(lexer);
      lexer->result_symbol = close_symbol;
      return valid[close_symbol];
    }

    // A raw newline terminates a string with an error in the reference lexer;
    // stopping here keeps the damage to a single line.
    if (lexer->lookahead == '\n') return false;

    if (lexer->lookahead == '$') {
      advance(lexer);
      if (lexer->lookahead == '{') {
        advance(lexer);
        lexer->result_symbol = open_symbol;
        return valid[open_symbol];
      }
      continue;
    }

    advance(lexer);
  }

  return false;
}

bool tree_sitter_flix_external_scanner_scan(void *payload, TSLexer *lexer,
                                            const bool *valid_symbols) {
  (void)payload;

  // Whether whitespace preceded the token distinguishes `->` from `->` and
  // `.` from `.`, so record it while skipping.
  bool space_before = false;
  while (iswspace(lexer->lookahead)) {
    space_before = true;
    skip(lexer);
  }

  // A string continuation resumes at the `}` that closed the interpolated
  // expression — `"${ x }"` puts whitespace in front of it, so this has to come
  // after the skip above. A `}` that belongs to a record or block inside the
  // interpolation is lexed normally, because neither continuation token is
  // valid until that inner brace has been closed.
  if ((valid_symbols[INTERPOLATION_MIDDLE] || valid_symbols[INTERPOLATION_END]) &&
      lexer->lookahead == '}') {
    advance(lexer);
    return scan_string_body(lexer, valid_symbols, INTERPOLATION_MIDDLE, INTERPOLATION_END);
  }

  if (valid_symbols[BLOCK_COMMENT] && lexer->lookahead == '/') {
    return scan_block_comment(lexer);
  }

  // `d"..."` is a debug interpolation. The reference lexer emits the `d` as a
  // token of its own and lexes the string separately, so a bare `d` followed
  // by a quote must not be read as an identifier.
  if (valid_symbols[DEBUG_PREFIX] && lexer->lookahead == 'd') {
    advance(lexer);
    if (lexer->lookahead != '"') return false;
    lexer->result_symbol = DEBUG_PREFIX;
    return true;
  }

  if ((valid_symbols[STRING_LITERAL] || valid_symbols[INTERPOLATION_START]) &&
      lexer->lookahead == '"') {
    advance(lexer);
    return scan_string_body(lexer, valid_symbols, INTERPOLATION_START, STRING_LITERAL);
  }

  if ((valid_symbols[ARROW_TIGHT] || valid_symbols[ARROW_SPACED]) &&
      lexer->lookahead == '-') {
    advance(lexer);
    if (lexer->lookahead != '>') return false;
    advance(lexer);
    // `a->b` is struct field access; any surrounding space makes it the
    // function arrow. See the ArrowThinRTight/ArrowThinRWhitespace split.
    bool tight = !space_before && !iswspace(lexer->lookahead) && lexer->lookahead != 0;
    lexer->result_symbol = tight ? ARROW_TIGHT : ARROW_SPACED;
    return valid_symbols[lexer->result_symbol];
  }

  if ((valid_symbols[DOT] || valid_symbols[DOT_SPACED]) && lexer->lookahead == '.') {
    // A dot with whitespace *before* it is rejected outright: the reference
    // lexer emits FreeDot, forbidding `Shape.  Rectangle`-style names.
    if (space_before) return false;
    advance(lexer);
    // A trailing space makes this a fixpoint-constraint terminator rather than
    // a qualified-name separator.
    bool spaced = iswspace(lexer->lookahead) || lexer->lookahead == 0;
    lexer->result_symbol = spaced ? DOT_SPACED : DOT;
    return valid_symbols[lexer->result_symbol];
  }

  return false;
}

// The scanner keeps no state between tokens: every decision above is made from
// the character stream and the set of symbols the parser will accept.
unsigned tree_sitter_flix_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_flix_external_scanner_deserialize(void *payload, const char *buffer,
                                                   unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

void *tree_sitter_flix_external_scanner_create(void) { return NULL; }

void tree_sitter_flix_external_scanner_destroy(void *payload) { (void)payload; }
