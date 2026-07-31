/**
 * @file Flix grammar for tree-sitter
 * @author Werner Stein <claude@wstein.de>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Expression precedence, mirroring `Parser2.Op.precedence`. Higher binds
// tighter. Equal precedence is left-associative except where noted.
const PREC = {
  sequence: 0, // `;` — looser than every operator
  instanceof: 1,
  or: 2,
  and: 3,
  equality: 4,
  comparison: 5,
  cons: 6, // right-associative
  additive: 7,
  multiplicative: 8,
  angled_plus: 9,
  discard: 10, // unary prefix
  infix_function: 11, // `a `f` b`
  user_operator: 12,
  lazy_force: 13, // unary prefix
  unary_sign: 14, // unary prefix
  not: 15, // unary prefix
  postfix: 16, // application, field access, indexing
};

// Type precedence, mirroring `Parser2.Type.TYPE_OP_PRECEDENCE`.
const TPREC = {
  arrow: 1, // right-associative
  rv_add_sub: 2,
  rv_and: 3,
  additive: 4,
  intersection: 5,
  xor: 6,
  or: 7,
  and: 8,
  unary: 9,
  apply: 10,
};

// `isOperator` — the operators that may be written as `(op)` to get a lambda.
const OPERATOR_TOKENS = ['+', '-', '*', '/', '<', '>', '<=>', '<=', '>=', '==', '!=', ':::'];

/**
 * A comma-separated list. Every delimited list in `Parser2` is built with
 * `Separation.Required(Comma, allowTrailing = false)`.
 *
 * @param {RuleOrLiteral} rule
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * @param {RuleOrLiteral} rule
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * The declaration prologue: annotations then modifiers, in that order.
 * `Decl.declaration` runs `annotations()` strictly before `modifiers()`, so
 * `pub @Test def` does not parse while `@Test pub def` does. Spread into a
 * `seq` rather than made a rule, since it can match the empty string.
 *
 * @param {GrammarSymbols<string>} $
 */
function prologue($) {
  return [repeat($.annotation), repeat($.modifier)];
}

/**
 * NAME_PARAMETER / NAME_VARIABLE — the name class for binding positions, which
 * unlike qualified-name segments does allow `_`. Inlined rather than made a
 * hidden rule so it does not compete with `_name` over the same tokens.
 *
 * @param {GrammarSymbols<string>} $
 */
function variableName($) {
  return choice($.name_lower, $.name_math, $.wildcard);
}

/**
 * NAME_FUNCTION — `def`, `redef`, `law` and effect-operation names. Flix lets a
 * definition be named by a user-defined operator, which is how the standard
 * library declares `>>`, `=<<` and friends.
 *
 * @param {GrammarSymbols<string>} $
 */
function functionName($) {
  return choice($.name_lower, $.name_math, $.generic_operator);
}

/**
 * NAME_DEFINITION / NAME_USE — like `functionName` but also allowing an
 * uppercase name, for trait names and `use`/`import` aliases such as
 * `use Bool.{==>, <==>}`.
 *
 * @param {GrammarSymbols<string>} $
 */
function definitionName($) {
  return choice($.name_lower, $.name_upper, $.name_math, $.generic_operator);
}

export default grammar({
  name: 'flix',

  word: $ => $.name_lower,

  extras: $ => [/\s/, $.line_comment, $.doc_comment, $.block_comment],

  externals: $ => [
    $.block_comment,
    $.debug_prefix,
    $.string,
    $._interpolation_start,
    $._interpolation_middle,
    $._interpolation_end,
    $._arrow_tight,
    $._arrow_spaced,
    $._dot,
    $._dot_spaced,
  ],

  supertypes: $ => [$._declaration, $._expression, $._type, $._pattern],

  conflicts: $ => [
    // --- conflicts added while converging the parser tables ---
    [$._statement, $.sequence_expression],
    [$.unary_pattern, $._expression],
    [$.parameter_list, $.tuple_pattern],
    [$.tuple_pattern, $.unit_expression],
    [$.parameter, $.variable_pattern, $._expression],
    [$.record_pattern, $.record_expression],
    [$._name, $.record_pattern_field],
    [$._name, $.record_operation],
    [$.tag_pattern, $._expression],
    [$.literal_pattern, $._expression],
    [$.parameter, $.variable_pattern],
    [$.variable_pattern, $._expression],
    [$._name, $.parameter, $.variable_pattern],
    [$._name, $.variable_pattern],
    [$.paren_expression, $.argument],
    // `(a, b)` is a tuple until a `->` turns it into a lambda parameter list.
    [$.unit_expression, $.parameter_list],
    // `x` alone can be a variable reference or a one-parameter lambda head.
    [$._name, $.parameter],
    [$._expression, $.parameter],
    // `{` opens a block or a record; two tokens of lookahead decide.
    // `(` opens a tuple type or a record row type.
    // `use A.B` vs `use A.{b, c}` — the `.` needs two tokens of lookahead.
    [$.qualified_name],
    // `where` may take an empty constraint list, and `{` can also start a type.
    [$.equality_constraints],
  ],

  rules: {
    source_file: $ => seq(repeat($._use_or_import), repeat($._declaration)),

    // ---------------------------------------------------------------------
    // Lexical layer
    // ---------------------------------------------------------------------

    // The lexer classifies a name by its first letter, after an optional
    // leading `_`. A `$` prefix escapes a keyword and is dropped from the
    // token text by the reference lexer; here it stays part of the token.
    name_lower: _ => /(\$[a-zA-Z]|_?[a-z])[a-zA-Z0-9_!$]*/,
    name_upper: _ => /_?[A-Z][a-zA-Z0-9_!$]*/,
    // Mathematical operators block; used for names like `⊆`.
    name_math: _ => /_?[∀-⋿]+/,

    // Segments of a qualified name. `_` is never one: a bare `_` in expression
    // position is its own Ident, and as a parameter or type parameter it is
    // covered by `_variable_name`.
    _name: $ => choice($.name_lower, $.name_upper, $.name_math),
    wildcard: _ => '_',

    // A user-defined operator: two or more characters from the operator set, or
    // a single `_` followed by one or more of them (`_>==>`), which the lexer
    // folds into the operator token. No explicit precedence:
    // tree-sitter weighs explicit precedence before match length, so demoting
    // this would make `>>` lex as two `>` tokens. Length alone lets it beat the
    // single-character operators, and at equal length the reserved spellings
    // win because a string literal is more specific than a pattern.
    generic_operator: _ =>
      token(/_[+\-*<>=!&|^$]+|[+\-*<>=!&|^$][+\-*<>=!&|^$]+/),

    line_comment: _ => token(prec(-1, /\/\/[^\n]*/)),
    doc_comment: _ => token(prec(1, /\/\/\/[^\n]*/)),

    annotation: _ => /@[a-zA-Z]+/,
    intrinsic: _ => /%%[A-Z0-9_]*%%/,

    hole_anonymous: _ => '???',
    hole_named: _ => /\?[a-zA-Z][a-zA-Z0-9_!$]*/,
    hole_variable: _ => /_?[a-zA-Z][a-zA-Z0-9_!$]*\?/,

    // `regex"..."` may contain raw newlines; a plain string may not.
    regex: _ => /regex"(\\.|[^"\\])*"/,
    char: _ => /'(\\.|[^'\\])*'/,

    integer: _ =>
      token(
        choice(
          /0x[0-9a-fA-F]+(_[0-9a-fA-F]+)*(i8|i16|i32|i64|ii)?/,
          /[0-9]+(_[0-9]+)*(i8|i16|i32|i64|ii)?/,
        ),
      ),
    float: _ =>
      token(
        choice(
          seq(
            /[0-9]+(_[0-9]+)*/,
            optional(/\.[0-9]+(_[0-9]+)*/),
            optional(/e[+-]?[0-9]+(_[0-9]+)*(\.[0-9]+(_[0-9]+)*)?/),
            /f32|f64|ff/,
          ),
          // A fractional or exponent form is a float even without a suffix.
          seq(
            /[0-9]+(_[0-9]+)*/,
            choice(
              seq(/\.[0-9]+(_[0-9]+)*/, optional(/e[+-]?[0-9]+(_[0-9]+)*/)),
              /e[+-]?[0-9]+(_[0-9]+)*/,
            ),
          ),
        ),
      ),

    string_interpolation: $ =>
      seq(
        $._interpolation_start,
        $._statement,
        repeat(seq($._interpolation_middle, $._statement)),
        $._interpolation_end,
      ),

    // `debug_prefix` is scanned externally: it is the letter `d` only when a
    // quote follows immediately.
    debug_interpolation: $ => seq($.debug_prefix, choice($.string, $.string_interpolation)),

    _literal: $ =>
      choice(
        $.string,
        $.string_interpolation,
        $.char,
        $.regex,
        $.integer,
        $.float,
        $.boolean,
        $.null,
      ),
    boolean: _ => choice('true', 'false'),
    null: _ => 'null',

    // ---------------------------------------------------------------------
    // Names
    // ---------------------------------------------------------------------

    qualified_name: $ => seq($._name, repeat(seq($._dot, $._name))),

    // ---------------------------------------------------------------------
    // Uses and imports — a strict prefix of the compilation unit
    // ---------------------------------------------------------------------

    _use_or_import: $ => seq(choice($.use_declaration, $.import_declaration), optional(';')),

    use_declaration: $ => seq('use', $.qualified_name, optional(seq($._dot, $.use_many))),
    import_declaration: $ => seq('import', $.qualified_name, optional(seq($._dot, $.use_many))),
    use_many: $ => seq('{', commaSep($.aliased_name), '}'),
    aliased_name: $ => seq(definitionName($), optional(seq('=>', definitionName($)))),

    // ---------------------------------------------------------------------
    // Declarations
    // ---------------------------------------------------------------------

    modifier: _ => choice('pub', 'sealed', 'lawful', 'mut'),

    _declaration: $ =>
      choice(
        $.module_declaration,
        $.function_declaration,
        $.enum_declaration,
        $.struct_declaration,
        $.trait_declaration,
        $.instance_declaration,
        $.effect_declaration,
        $.type_alias_declaration,
      ),

    module_declaration: $ =>
      seq(
        ...prologue($),
        'mod',
        field('name', $.qualified_name),
        '{',
        repeat($._use_or_import),
        repeat($._declaration),
        '}',
      ),

    function_declaration: $ =>
      seq(
        ...prologue($),
        choice('def', 'redef'),
        field('name', functionName($)),
        optional($.type_parameter_list),
        field('parameters', $.parameter_list),
        ':',
        $._type_and_effect,
        optional($.trait_constraints),
        optional($.equality_constraints),
        '=',
        field('body', $._statement),
      ),

    // A trait signature is a `def` whose body may be omitted.
    signature_declaration: $ =>
      seq(
        ...prologue($),
        'def',
        field('name', functionName($)),
        optional($.type_parameter_list),
        field('parameters', $.parameter_list),
        ':',
        $._type_and_effect,
        optional($.trait_constraints),
        optional($.equality_constraints),
        optional(seq('=', field('body', $._statement))),
      ),

    law_declaration: $ =>
      seq(
        ...prologue($),
        'law',
        field('name', functionName($)),
        ':',
        'forall',
        optional($.type_parameter_list),
        optional($.parameter_list),
        optional($.trait_constraints),
        optional($.equality_constraints),
        field('body', $._expression),
      ),

    // A restrictable enum takes a mandatory bare `[s]` restriction parameter
    // before its ordinary type parameters, so it is a separate branch: the two
    // bracket lists are otherwise indistinguishable.
    enum_declaration: $ =>
      seq(
        ...prologue($),
        choice(
          seq('enum', field('name', $._type_name)),
          seq('restrictable', 'enum', field('name', $._type_name), $.restriction_parameter),
        ),
        optional($.type_parameter_list),
        optional($.case_body),
        optional($.derivations),
        optional($.enum_body),
      ),
    restriction_parameter: $ => seq('[', variableName($), ']'),
    enum_body: $ => seq('{', repeat($.enum_case), '}'),
    // Cases may be separated by `,`, by nothing, or introduced by a bare `,`
    // with `case` elided — `enumCases` is deliberately permissive.
    enum_case: $ =>
      seq(optional(','), optional('case'), field('name', $.name_upper), optional($.case_body)),
    case_body: $ => seq('(', commaSep($._type), ')'),
    derivations: $ => seq('with', commaSep1($.qualified_name)),

    struct_declaration: $ =>
      seq(
        ...prologue($),
        'struct',
        field('name', $._type_name),
        $.type_parameter_list,
        optional(seq('{', commaSep($.struct_field), '}')),
      ),
    struct_field: $ => seq(repeat($.modifier), field('name', $.name_lower), ':', $._type),

    trait_declaration: $ =>
      seq(
        ...prologue($),
        'trait',
        field('name', definitionName($)),
        $.type_parameter_list,
        optional($.trait_constraints),
        optional($.trait_body),
      ),
    trait_body: $ =>
      seq(
        '{',
        repeat(choice($.law_declaration, $.signature_declaration, $.associated_type_signature)),
        '}',
      ),
    associated_type_signature: $ =>
      seq(
        ...prologue($),
        'type',
        field('name', $._type_name),
        optional($.type_parameter_list),
        optional(seq(':', $.kind)),
        optional(seq('=', $._type)),
      ),

    instance_declaration: $ =>
      seq(
        ...prologue($),
        'instance',
        field('name', $.qualified_name),
        '[',
        $._type,
        ']',
        optional($.trait_constraints),
        optional($.equality_constraints),
        optional($.instance_body),
      ),
    instance_body: $ =>
      seq('{', repeat(choice($.function_declaration, $.associated_type_definition)), '}'),
    associated_type_definition: $ =>
      seq(
        ...prologue($),
        'type',
        field('name', $._type_name),
        optional($.type_argument_list),
        optional(seq('=', $._type)),
      ),

    effect_declaration: $ =>
      seq(...prologue($), 'eff', field('name', $.name_upper), optional($.effect_body)),
    effect_body: $ => seq('{', repeat($.operation_declaration), '}'),
    // Effect operations take no `\ eff` and no body.
    operation_declaration: $ =>
      seq(
        ...prologue($),
        'def',
        field('name', functionName($)),
        optional($.parameter_list),
        ':',
        $._type,
        optional($.trait_constraints),
      ),

    type_alias_declaration: $ =>
      seq(
        ...prologue($),
        'type',
        'alias',
        field('name', $._type_name),
        optional($.type_parameter_list),
        '=',
        $._type,
      ),

    // ---------------------------------------------------------------------
    // Parameters, constraints, kinds
    // ---------------------------------------------------------------------

    parameter_list: $ => seq('(', commaSep($.parameter), ')'),
    parameter: $ => seq(field('name', variableName($)), optional(seq(':', $._type))),

    type_parameter_list: $ => seq('[', commaSep($.type_parameter), ']'),
    type_parameter: $ => seq(field('name', variableName($)), optional(seq(':', $.kind))),

    type_argument_list: $ => seq('[', commaSep($._type), ']'),

    trait_constraints: $ => seq('with', commaSep1($.trait_constraint)),
    trait_constraint: $ => seq($.qualified_name, '[', $._type, ']'),

    equality_constraints: $ => seq('where', commaSep($.equality_constraint)),
    equality_constraint: $ => seq($._type, '~', $._type),

    // The reference parser only accepts a parenthesis before the name, which
    // makes `(K -> K) -> K` unparseable. This is the natural superset.
    kind: $ => choice($.name_upper, seq('(', $.kind, ')'), $.kind_arrow),
    kind_arrow: $ => prec.right(seq($.kind, $._arrow_spaced, $.kind)),

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    _type_name: $ => choice($.name_upper, $.static_type),
    static_type: _ => 'Static',

    // `a -> b \ ef` attaches the effect to the arrow's result, so the effect is
    // always taken by the innermost pending type.
    _type_and_effect: $ => prec.right(seq($._type, optional($.effect_annotation))),
    effect_annotation: $ => seq('\\', $._type),

    // A qualified name in type position is uppercase throughout; a bare
    // lowercase name there is a type variable, never a reference.
    type_reference: $ => seq($._type_name, repeat(seq($._dot, $._type_name))),

    _type: $ =>
      choice(
        $.type_reference,
        $.type_variable,
        $.type_constant,
        $.tuple_type,
        $.record_row_type,
        $.record_type,
        $.effect_set_type,
        $.schema_type,
        $.schema_row_type,
        $.extensible_type,
        $.case_set_type,
        $.type_application,
        $.unary_type,
        $.binary_type,
      ),

    type_variable: $ => choice($.name_lower, $.name_math, $.wildcard),
    type_constant: _ => choice('Univ', 'true', 'false'),

    type_application: $ => prec.left(TPREC.apply, seq($._type, $.type_argument_list)),

    unary_type: $ =>
      prec.right(TPREC.unary, seq(field('operator', choice('not', '~', 'rvnot')), $._type)),

    binary_type: $ =>
      choice(
        prec.right(TPREC.arrow, seq($._type, $._arrow_spaced, $._type_and_effect)),
        ...[
          [TPREC.rv_add_sub, choice('rvadd', 'rvsub')],
          [TPREC.rv_and, 'rvand'],
          [TPREC.additive, choice('+', '-')],
          [TPREC.intersection, '&'],
          [TPREC.xor, 'xor'],
          [TPREC.or, 'or'],
          [TPREC.and, 'and'],
        ].map(([p, op]) =>
          prec.left(
            /** @type {number} */ (p),
            seq($._type, field('operator', /** @type {RuleOrLiteral} */ (op)), $._type),
          ),
        ),
      ),

    // `()` is an empty record row, not a tuple.
    tuple_type: $ => seq('(', commaSep1($._type), ')'),
    record_row_type: $ => seq('(', commaSep($.record_type_field), optional(seq('|', $._type)), ')'),
    // `{}` is an empty effect set, not an empty record; a record needs either a
    // field or the `| row` tail (`{|}` is the open empty record).
    record_type: $ =>
      seq(
        '{',
        choice(
          seq(commaSep1($.record_type_field), optional(seq('|', $._type))),
          seq('|', optional($._type)),
        ),
        '}',
      ),
    record_type_field: $ => seq(field('name', $.name_lower), '=', $._type),

    effect_set_type: $ => seq('{', commaSep($._type), '}'),

    schema_type: $ => seq('#{', commaSep($.schema_term), optional(seq('|', $._type)), '}'),
    schema_row_type: $ => seq('#(', commaSep($.schema_term), optional(seq('|', $._type)), ')'),
    extensible_type: $ => seq('#|', commaSep($.schema_term), optional(seq('|', $._type)), '|#'),
    schema_term: $ =>
      seq(
        $.qualified_name,
        optional(
          choice($.type_argument_list, seq('(', commaSep($._type), optional(seq(';', $._type)), ')')),
        ),
      ),

    case_set_type: $ => seq('<', commaSep($.qualified_name), '>'),

    // ---------------------------------------------------------------------
    // Patterns
    // ---------------------------------------------------------------------

    _pattern: $ =>
      choice(
        $.variable_pattern,
        $.literal_pattern,
        $.tag_pattern,
        $.tuple_pattern,
        $.record_pattern,
        $.unary_pattern,
        $.cons_pattern,
      ),

    variable_pattern: $ => choice($.name_lower, $.name_math, $.wildcard),
    literal_pattern: $ => $._literal,
    tag_pattern: $ => seq($.qualified_name, optional($.tag_pattern_body)),
    tag_pattern_body: $ => seq('(', commaSep($._pattern), ')'),
    tuple_pattern: $ => seq('(', commaSep($._pattern), ')'),
    record_pattern: $ =>
      seq('{', commaSep($.record_pattern_field), optional(seq('|', $._pattern)), '}'),
    record_pattern_field: $ => seq(field('name', $.name_lower), optional(seq('=', $._pattern))),
    unary_pattern: $ => seq('-', $._literal),
    cons_pattern: $ => prec.right(seq($._pattern, '::', $._pattern)),

    // ---------------------------------------------------------------------
    // Expressions
    // ---------------------------------------------------------------------

    _statement: $ => choice($._expression, $.sequence_expression),
    sequence_expression: $ => prec.right(PREC.sequence, seq($._expression, ';', $._statement)),

    _expression: $ =>
      choice(
        $._literal,
        $.debug_interpolation,
        $.qualified_name,
        $.wildcard,
        $.intrinsic,
        $.hole_anonymous,
        $.hole_named,
        $.hole_variable,
        $.static_expression,
        $.unit_expression,
        $.paren_expression,
        $.tuple_expression,
        $.ascribe_expression,
        $.operator_lambda,
        $.lambda,
        $.block,
        $.record_expression,
        $.let_expression,
        $.local_def_expression,
        $.region_expression,
        $.if_expression,
        $.match_expression,
        $.match_lambda,
        $.ext_match_expression,
        $.ext_match_lambda,
        $.restrictable_choose,
        $.ext_tag_expression,
        $.open_variant_expression,
        $.foreach_expression,
        $.for_monadic_expression,
        $.for_applicative_expression,
        $.array_literal,
        $.vector_literal,
        $.list_literal,
        $.set_literal,
        $.map_literal,
        $.checked_cast,
        $.unchecked_cast,
        $.unsafe_expression,
        $.run_expression,
        $.handler_expression,
        $.try_expression,
        $.throw_expression,
        $.new_expression,
        $.invoke_constructor,
        $.super_expression,
        $.spawn_expression,
        $.par_yield_expression,
        $.select_expression,
        $.use_expression,
        $.fixpoint_constraint_set,
        $.fixpoint_solve,
        $.fixpoint_psolve,
        $.fixpoint_inject,
        $.fixpoint_query,
        $.fixpoint_query_with_provenance,
        $.fixpoint_lambda,
        $.apply_expression,
        $.invoke_method,
        $.get_field,
        $.record_select,
        $.struct_get,
        $.struct_put,
        $.index_expression,
        $.index_assign_expression,
        $.unary_expression,
        $.binary_expression,
      ),

    static_expression: _ => 'Static',

    unit_expression: _ => seq('(', ')'),
    paren_expression: $ => seq('(', $._expression, ')'),
    // Tuple elements may be named: `(x = 1, y = 2)`.
    tuple_expression: $ => seq('(', commaSep1($.argument), ')'),
    ascribe_expression: $ => seq('(', $._expression, ':', $._type_and_effect, ')'),
    operator_lambda: $ => seq('(', choice(...OPERATOR_TOKENS, $.generic_operator), ')'),

    lambda: $ =>
      prec.right(
        seq(
          field('parameters', choice($.parameter_list, $.parameter)),
          $._arrow_spaced,
          field('body', $._expression),
        ),
      ),

    block: $ => seq('{', $._statement, '}'),

    record_expression: $ =>
      seq('{', commaSep($.record_operation), optional(seq('|', $._expression)), '}'),
    record_operation: $ =>
      choice(
        seq('+', field('name', $.name_lower), '=', $._expression),
        seq('-', field('name', $.name_lower)),
        seq(field('name', $.name_lower), '=', $._expression),
      ),

    let_expression: $ =>
      prec.right(
        seq('let', $._pattern, optional(seq(':', $._type)), '=', field('body', $._statement)),
      ),

    local_def_expression: $ =>
      prec.right(
        seq(
          repeat($.annotation),
          'def',
          field('name', functionName($)),
          field('parameters', $.parameter_list),
          optional(seq(':', $._type_and_effect)),
          '=',
          field('body', $._statement),
        ),
      ),

    region_expression: $ => prec.right(seq('region', variableName($), optional($.block))),

    if_expression: $ =>
      prec.right(
        seq(
          'if',
          '(',
          field('condition', $._expression),
          ')',
          field('consequence', $._expression),
          optional(seq('else', field('alternative', $._expression))),
        ),
      ),

    match_expression: $ => seq('match', $._expression, $.match_body),
    match_body: $ => seq('{', repeat(seq($.match_rule, optional(','))), '}'),
    match_rule: $ => seq('case', $._pattern, optional(seq('if', $._expression)), '=>', $._statement),

    match_lambda: $ => prec.right(seq('match', $._pattern, $._arrow_spaced, $._expression)),

    ext_match_expression: $ => seq('ematch', $._expression, $.ext_match_body),
    ext_match_body: $ => seq('{', repeat(seq($.ext_match_rule, optional(','))), '}'),
    ext_match_rule: $ => seq('case', $._pattern, '=>', $._statement),
    ext_match_lambda: $ => prec.right(seq('ematch', $._pattern, $._arrow_spaced, $._expression)),

    restrictable_choose: $ => seq(choice('choose', 'choose*'), $._expression, $.match_body),

    ext_tag_expression: $ => prec.right(seq('xvar', $.name_upper, optional($.argument_list))),
    open_variant_expression: $ =>
      choice(
        seq('open_variant', $.qualified_name),
        seq('open_variant_as', $.qualified_name, $._expression),
      ),

    for_fragments: $ => seq('(', seq($._for_fragment, repeat(seq(';', $._for_fragment))), ')'),
    _for_fragment: $ => choice($.for_guard, $.for_generator, $.for_let),
    for_guard: $ => seq('if', $._expression),
    for_generator: $ => seq($._pattern, '<-', $._expression),
    for_let: $ => seq($._pattern, '=', $._expression),

    foreach_expression: $ => prec.right(seq('foreach', $.for_fragments, $._expression)),
    for_monadic_expression: $ => seq('forM', $.for_fragments, 'yield', $._expression),
    for_applicative_expression: $ => seq('forA', $.for_fragments, 'yield', $._expression),

    // `Array#{...}` and `spawn` both require an explicit region.
    array_literal: $ => seq('Array#', '{', commaSep($._expression), '}', $.region_name),
    vector_literal: $ => seq('Vector#', '{', commaSep($._expression), '}'),
    list_literal: $ => seq('List#', '{', commaSep($._expression), '}'),
    set_literal: $ => seq('Set#', '{', commaSep($._expression), '}'),
    map_literal: $ => seq('Map#', '{', commaSep($.map_entry), '}'),
    map_entry: $ => seq($._expression, '=>', $._expression),
    region_name: $ => seq('@', $._expression),

    checked_cast: $ => seq(choice('checked_cast', 'checked_ecast'), '(', $._expression, ')'),
    unchecked_cast: $ =>
      seq('unchecked_cast', '(', $._expression, optional(seq('as', $._type_and_effect)), ')'),

    unsafe_expression: $ => seq('unsafe', $._type, optional(seq('as', $._type)), $.block),

    run_expression: $ => prec.right(seq('run', $._expression, repeat1(seq('with', $._expression)))),
    handler_expression: $ => seq('handler', $.qualified_name, $.handler_body),
    handler_body: $ => seq('{', repeat(seq($.handler_rule, optional(','))), '}'),
    handler_rule: $ => seq('def', field('name', $.name_lower), $.parameter_list, '=', $._expression),

    try_expression: $ => prec.right(seq('try', $._expression, repeat($.catch_body))),
    catch_body: $ => seq('catch', '{', repeat(seq($.catch_rule, optional(','))), '}'),
    catch_rule: $ => seq('case', variableName($), ':', $.qualified_name, '=>', $._statement),
    throw_expression: $ => prec.right(seq('throw', $._expression)),

    new_expression: $ =>
      choice(
        seq('new', $._type, $.region_name, '{', commaSep($.struct_field_init), '}'),
        seq('new', $._type, '{', repeat(choice($.jvm_method, $.jvm_constructor)), '}'),
      ),
    struct_field_init: $ => seq(field('name', $.name_lower), '=', $._expression),
    jvm_method: $ =>
      seq(
        repeat($.annotation),
        'def',
        field('name', $._name),
        $.parameter_list,
        ':',
        $._type_and_effect,
        '=',
        $._statement,
      ),
    jvm_constructor: $ => seq('def', 'new', '(', ')', ':', $._type_and_effect, '=', $._statement),
    invoke_constructor: $ => seq('new', $._type, $.argument_list),

    super_expression: $ =>
      choice(seq('super', $.argument_list), seq('super', $._dot, $._name, $.argument_list)),

    spawn_expression: $ => prec.right(seq('spawn', $._expression, $.region_name)),
    par_yield_expression: $ => seq('par', optional($.par_fragments), 'yield', $._expression),
    par_fragments: $ => seq('(', seq($.par_fragment, repeat(seq(';', $.par_fragment))), ')'),
    par_fragment: $ => seq($._pattern, '<-', $._expression),

    select_expression: $ => seq('select', '{', repeat($.select_rule), '}'),
    select_rule: $ =>
      choice(
        seq('case', variableName($), '<-', $.qualified_name, '(', $._expression, ')', '=>', $._statement),
        seq('case', $.wildcard, '=>', $._statement),
      ),

    use_expression: $ =>
      prec.right(seq(choice($.use_declaration, $.import_declaration), ';', $._statement)),


    fixpoint_constraint_set: $ => seq('#{', repeat($.fixpoint_constraint), '}'),
    fixpoint_constraint: $ =>
      seq($.predicate_head, optional(seq(':-', commaSep1($._predicate_body))), $._dot_spaced),
    predicate_head: $ => prec.right(seq($.name_upper, optional($.head_term_list))),
    head_term_list: $ =>
      seq('(', commaSep($._expression), optional(seq(';', $._expression)), ')'),
    _predicate_body: $ => choice($.predicate_guard, $.predicate_functional, $.predicate_atom),
    predicate_guard: $ => seq('if', '(', $._expression, ')'),
    predicate_functional: $ =>
      seq('let', choice(variableName($), seq('(', commaSep(variableName($)), ')')), '=', $._expression),
    predicate_atom: $ =>
      prec.right(seq(optional('not'), optional('fix'), $.name_upper, optional($.body_term_list))),
    body_term_list: $ => seq('(', commaSep($._pattern), optional(seq(';', $._pattern)), ')'),

    // Every fixpoint keyword takes the same greedy comma-separated expression
    // list. Sharing one hidden rule keeps the parse tables far smaller than
    // repeating `commaSep1($._expression)` at each site would.
    _fixpoint_expressions: $ => prec.right(commaSep1($._expression)),

    fixpoint_solve: $ =>
      prec.right(
        seq(
          'solve',
          $._fixpoint_expressions,
          optional(seq('project', commaSep1($.name_upper))),
        ),
      ),
    fixpoint_psolve: $ => prec.right(seq('psolve', $._fixpoint_expressions)),
    // The trailing predicate list is greedy: a `,` after it continues the list
    // rather than closing the enclosing argument list.
    fixpoint_inject: $ =>
      prec.right(seq('inject', $._fixpoint_expressions, 'into', commaSep1($.predicate_arity))),
    predicate_arity: $ => seq($.name_upper, '/', $.integer),

    // `Parser2` takes the three clauses in a fixed order, each optional. Three
    // chained optionals after a greedy expression list is by far the most
    // expensive shape in this grammar to build tables for, so accept them as a
    // repeated choice instead: a strict superset that generates in a fraction
    // of the time, and clause order is a semantic check anyway.
    fixpoint_query: $ =>
      prec.right(seq('query', $._fixpoint_expressions, repeat($._fixpoint_query_clause))),
    _fixpoint_query_clause: $ => choice($.fixpoint_select, $.fixpoint_from, $.fixpoint_where),
    // `Parser2` splits the select clause three ways on lookahead — `()`, a
    // parenthesised term list, or a bare expression. A plain expression already
    // covers all three (`()` is the unit expression, `(x, y)` a tuple), and
    // spelling the list form out separately only adds an ambiguity with tuples.
    fixpoint_select: $ => prec.right(seq('select', $._expression)),
    fixpoint_from: $ => prec.right(seq('from', commaSep1($.predicate_atom))),
    fixpoint_where: $ => prec.right(seq('where', $._expression)),
    fixpoint_query_with_provenance: $ =>
      seq(
        'pquery',
        $._fixpoint_expressions,
        'select',
        $.predicate_head,
        'with',
        '{',
        commaSep($.name_upper),
        '}',
      ),

    fixpoint_lambda: $ =>
      seq('#(', commaSep($.predicate_param), ')', $._arrow_spaced, $._expression),
    predicate_param: $ =>
      seq($.name_upper, optional(seq('(', commaSep($._type), optional(seq(';', $._type)), ')'))),

    // --- postfix chain (left-associative, tighter than any operator) ---

    argument_list: $ => seq('(', commaSep($.argument), ')'),
    argument: $ => seq($._expression, optional(seq('=', $._expression))),

    apply_expression: $ => prec.left(PREC.postfix, seq($._expression, $.argument_list)),
    invoke_method: $ =>
      prec.left(PREC.postfix, seq($._expression, $._dot, $.name_lower, $.argument_list)),
    get_field: $ => prec.left(PREC.postfix, seq($._expression, $._dot, $.name_lower)),
    // Record selection is `r#label`; `.label` is Java field access.
    record_select: $ => prec.left(PREC.postfix, seq($._expression, '#', $.name_lower)),
    struct_get: $ => prec.left(PREC.postfix, seq($._expression, $._arrow_tight, $.name_lower)),
    struct_put: $ =>
      prec.left(PREC.postfix, seq($._expression, $._arrow_tight, $.name_lower, '=', $._expression)),
    index_expression: $ => prec.left(PREC.postfix, seq($._expression, '[', $._expression, ']')),
    index_assign_expression: $ =>
      prec.left(PREC.postfix, seq($._expression, '[', $._expression, ']', '=', $._expression)),

    // --- operators ---

    unary_expression: $ =>
      choice(
        ...[
          [PREC.discard, 'discard'],
          [PREC.lazy_force, choice('lazy', 'force')],
          [PREC.unary_sign, choice('+', '-')],
          [PREC.not, 'not'],
        ].map(([p, op]) =>
          prec.right(
            /** @type {number} */ (p),
            seq(field('operator', /** @type {RuleOrLiteral} */ (op)), $._expression),
          ),
        ),
      ),

    binary_expression: $ =>
      choice(
        prec.right(
          PREC.cons,
          seq($._expression, field('operator', choice('::', ':::')), $._expression),
        ),
        prec.left(
          PREC.infix_function,
          seq($._expression, '`', $.qualified_name, '`', $._expression),
        ),
        ...[
          [PREC.instanceof, 'instanceof'],
          [PREC.or, 'or'],
          [PREC.and, 'and'],
          [PREC.equality, choice('==', '<=>', '!=')],
          [PREC.comparison, choice('<', '>', '<=', '>=')],
          [PREC.additive, choice('+', '-')],
          [PREC.multiplicative, choice('*', '/')],
          [PREC.angled_plus, '<+>'],
          [PREC.user_operator, choice($.generic_operator, $.name_math)],
        ].map(([p, op]) =>
          prec.left(
            /** @type {number} */ (p),
            seq($._expression, field('operator', /** @type {RuleOrLiteral} */ (op)), $._expression),
          ),
        ),
      ),
  },
});
