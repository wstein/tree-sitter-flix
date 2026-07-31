#include "tree_sitter/parser.h"

// External tokens for the parts of Flix's lexical grammar that cannot be
// expressed as regular expressions. Each corresponds to a decision the
// reference lexer (Lexer.scala) makes with lookahead or a counter.
//
// ERROR_SENTINEL is referenced by no grammar rule, so it is only ever "valid"
// in tree-sitter's error-recovery state, where every external is marked valid.
// It is how this scanner tells a real parse from recovery; it must stay last.
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
    ERROR_SENTINEL,
};

// The characters a user-defined operator may be built from (`isUserOp`).
static inline bool is_user_op(int32_t c) {
    return c == '+' || c == '-' || c == '*' || c == '<' || c == '>' || c == '=' || c == '!' ||
           c == '&' || c == '|' || c == '^' || c == '$';
}

// ASCII whitespace, matching what the grammar's `\s` extra compiles to.
//
// Deliberately not `iswspace`: that classifies according to LC_CTYPE, which the
// host editor sets and this scanner does not, so the same bytes would parse
// differently depending on the embedder's locale. It is also formally undefined
// for codepoints outside wchar_t — on MSVC, where wint_t is 16 bits, U+10020
// would truncate to U+0020 and read as a space.
static inline bool is_space(int32_t c) {
    return c == ' ' || (c >= '\t' && c <= '\r');
}

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

// Consumes a `\` escape the way `Lexer.consumeSingleEscapes` does: a backslash
// swallows whatever character follows it, with no validation. Returns true if
// an escape was consumed.
static bool consume_escape(TSLexer *lexer) {
    if (lexer->lookahead != '\\') return false;
    advance(lexer);
    if (!lexer->eof(lexer)) advance(lexer);
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
    while (!lexer->eof(lexer)) {
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

    // Unterminated. Emit the comment anyway rather than refusing the token:
    // refusing would make every later `/` rescan to end of file, which is
    // quadratic in exactly the buffer you get while typing `/*` near the top of
    // a large file. Treating the tail as a comment also highlights better.
    lexer->result_symbol = BLOCK_COMMENT;
    return true;
}

// Scans the body of a string starting just after an opening `"` or `}`.
//
// A Flix string is split into tokens at each interpolation boundary, so the
// body ends at either `${` (more expression follows) or `"` (string is done).
// `open_symbol` is reported for the `${` ending, `close_symbol` for the `"`.
static bool scan_string_body(TSLexer *lexer, const bool *valid, enum TokenType open_symbol,
                             enum TokenType close_symbol) {
    while (!lexer->eof(lexer)) {
        if (consume_escape(lexer)) continue;

        if (lexer->lookahead == '"') {
            advance(lexer);
            lexer->result_symbol = close_symbol;
            return valid[close_symbol];
        }

        // A raw line break terminates a string with an error in the reference
        // lexer; stopping here keeps the damage to a single line.
        if (lexer->lookahead == '\n' || lexer->lookahead == '\r') return false;

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

    // In error recovery tree-sitter marks every external valid, which would let
    // the unbounded scans below fire on tokens they have no business claiming.
    const bool recovering = valid_symbols[ERROR_SENTINEL];

    // Whether whitespace preceded the token separates ArrowThinRTight from
    // ArrowThinRWhitespace, and Dot from the illegal space-before form, so
    // record it while skipping.
    bool space_before = false;
    while (is_space(lexer->lookahead)) {
        space_before = true;
        skip(lexer);
    }

    // A string continuation resumes at the `}` that closed the interpolated
    // expression — `"${ x }"` puts whitespace in front of it, so this has to
    // come after the skip above. A `}` that belongs to a record or block inside
    // the interpolation is lexed normally, because neither continuation token is
    // valid until that inner brace has been closed.
    //
    // Skipped during recovery: otherwise any stray `}` scans to end of line
    // looking for a quote, swallowing whatever it crosses.
    if (!recovering && (valid_symbols[INTERPOLATION_MIDDLE] || valid_symbols[INTERPOLATION_END]) &&
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
    if (!recovering && valid_symbols[DEBUG_PREFIX] && lexer->lookahead == 'd') {
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

    if ((valid_symbols[ARROW_TIGHT] || valid_symbols[ARROW_SPACED]) && lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead != '>') return false;
        advance(lexer);
        // The reference lexer only treats `->` as an arrow when the next
        // character cannot continue an operator. `->>` and `->=` are single
        // user-defined operators, so decline and let the internal lexer take the
        // whole run.
        if (is_user_op(lexer->lookahead)) return false;
        // `a->b` is struct field access; whitespace on either side makes it the
        // function arrow. End of file counts as whitespace here, matching the
        // reference lexer's `outOfBounds = true`.
        bool tight = !space_before && !is_space(lexer->lookahead) && !lexer->eof(lexer);
        lexer->result_symbol = tight ? ARROW_TIGHT : ARROW_SPACED;
        return valid_symbols[lexer->result_symbol];
    }

    if ((valid_symbols[DOT] || valid_symbols[DOT_SPACED]) && lexer->lookahead == '.') {
        // A dot with whitespace *before* it is rejected outright: the reference
        // lexer emits FreeDot, forbidding `Shape.  Rectangle`-style names.
        if (space_before) return false;
        advance(lexer);
        // A trailing space makes this a fixpoint-constraint terminator rather
        // than a qualified-name separator.
        bool spaced = is_space(lexer->lookahead) || lexer->eof(lexer);
        lexer->result_symbol = spaced ? DOT_SPACED : DOT;
        return valid_symbols[lexer->result_symbol];
    }

    return false;
}

// The scanner keeps no state between tokens: every decision above is made from
// the character stream and the set of symbols the parser will accept. This was
// checked against incremental reparses — the whitespace it skips lives in the
// token's padding, so tree-sitter's reuse invalidation already covers it.
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
