; Base case: a bare name is a variable unless something below overrides it.
; Tree-sitter keeps scanning after a match and takes the LAST pattern that
; matches a node, so these must come first or they clobber every more specific
; capture in this file.
(name_lower) @variable

(name_math) @variable

; Comments
(line_comment) @comment

(block_comment) @comment

(doc_comment) @comment.documentation

; Literals
(string) @string

(char) @character

(regex) @string.regexp

(integer) @number

(float) @number.float

(boolean) @boolean

(null) @constant.builtin

(string_interpolation) @string

(debug_prefix) @keyword.debug

(intrinsic) @function.builtin

(annotation) @attribute

(hole_anonymous) @comment.error

(hole_named) @comment.error

(hole_variable) @comment.error

(wildcard) @variable.builtin

(static_type) @type.builtin

(static_expression) @constant.builtin

(type_constant) @type.builtin

; Declarations
(module_declaration
  name: (qualified_name
    (name_upper) @module))

(function_declaration
  name: (_) @function)

(signature_declaration
  name: (_) @function)

(operation_declaration
  name: (_) @function)

(local_def_expression
  name: (_) @function)

(jvm_method
  name: (_) @function)

(handler_rule
  name: (_) @function)

(enum_declaration
  name: (_) @type)

(struct_declaration
  name: (_) @type)

(trait_declaration
  name: (_) @type)

(effect_declaration
  name: (_) @type)

(type_alias_declaration
  name: (_) @type)

(associated_type_signature
  name: (_) @type)

(associated_type_definition
  name: (_) @type)

(instance_declaration
  name: (qualified_name
    (name_upper) @type))

(enum_case
  name: (_) @constructor)

(struct_field
  name: (_) @variable.member)

(record_type_field
  name: (_) @variable.member)

; One node per record operation now, mirroring the reference's three TreeKinds.
(record_op_extend
  name: (_) @variable.member)

(record_op_restrict
  name: (_) @variable.member)

(record_op_update
  name: (_) @variable.member)

(record_pattern_field
  name: (_) @variable.member)

(struct_field_init
  name: (_) @variable.member)

(record_select
  (name_lower) @variable.member)

(struct_get
  (name_lower) @variable.member)

(struct_put
  (name_lower) @variable.member)

(get_field
  (name_lower) @variable.member)

(parameter
  name: (_) @variable.parameter)

(type_parameter
  name: (_) @type.parameter)

(type_variable) @type.parameter

(modifier) @keyword.modifier

; Types
(type_reference
  (name_upper) @type)

(trait_constraint
  (qualified_name
    (name_upper) @type))

(derivations
  (qualified_name
    (name_upper) @type))

(kind
  (name_upper) @type.builtin)

(effect_annotation
  (type_reference
    (name_upper) @type))

; Datalog
(predicate_head
  (name_upper) @function.call)

(predicate_atom
  (name_upper) @function.call)

(predicate_param
  (name_upper) @function.call)

(predicate_arity
  (name_upper) @function.call)

(schema_term
  (qualified_name
    (name_upper) @function.call))

; Calls and constructors
(invoke_method
  (name_lower) @function.call)

(apply_expression
  (qualified_name
    (name_lower) @function.call))

(tag_pattern
  (qualified_name
    (name_upper) @constructor))

(ext_tag_expression
  (name_upper) @constructor)

; A qualified name is a module path followed by the thing itself.
(qualified_name
  (name_upper) @module
  (name_lower))

; `use flixball::Game.Board`: the package names a namespace, like a module path.
(package
  [
    (name_lower)
    (name_upper)
  ] @module)

; Operators
(generic_operator) @operator

(binary_expression
  operator: _ @operator)

(unary_expression
  operator: _ @operator)

(binary_type
  operator: _ @operator)

(unary_type
  operator: _ @operator)

[
  "="
  ":"
  "::"
  ":::"
  "<-"
  ":-"
  "@"
  "\\"
  "|"
  "#"
  "~"
  "/"
] @operator

; `lazy`, `force`, `discard` and `instanceof` are spelled as keywords but occupy an operator
; position, and the reference compiler wraps each in a TreeKind.Operator, so the grammar emits them
; as `operator` nodes rather than anonymous tokens. They are matched by text here to keep the
; keyword highlighting they had before. These sit after the generic operator captures above on
; purpose: tree-sitter takes the last pattern that matches, so keyword wins over operator.
((operator) @keyword.function
  (#any-of? @keyword.function "lazy" "force"))

((operator) @keyword
  (#any-of? @keyword "discard" "instanceof"))

; Keywords
[
  "mod"
  "use"
  "import"
] @keyword.import

[
  "def"
  "redef"
] @keyword.function

[
  "enum"
  "case"
  "struct"
  "trait"
  "instance"
  "eff"
  "type"
  "alias"
  "restrictable"
  "where"
  "with"
] @keyword

[
  "let"
  "region"
  "xvar"
  "open_variant"
  "open_variant_as"
  "new"
  "super"
  "unsafe"
  "as"
  "checked_cast"
  "checked_ecast"
  "unchecked_cast"
] @keyword

[
  "if"
  "else"
  "match"
  "ematch"
  "choose"
  "choose*"
] @keyword.conditional

[
  "foreach"
  "forM"
  "forA"
  "yield"
] @keyword.repeat

[
  "try"
  "catch"
  "throw"
] @keyword.exception

[
  "run"
  "handler"
  "spawn"
  "par"
  "select"
] @keyword.coroutine

[
  "Array#"
  "Vector#"
  "List#"
  "Set#"
  "Map#"
] @function.builtin

[
  "query"
  "solve"
  "psolve"
  "pquery"
  "inject"
  "into"
  "project"
  "from"
  "fix"
] @keyword

; `not` is still an anonymous token in Datalog body atoms, so it keeps a literal pattern. The rest
; occur only in type and expression operator position, where the grammar now emits `operator` nodes
; to mirror TreeKind.Operator, so they are matched by text instead. Placed after the generic
; operator captures above: tree-sitter takes the last matching pattern, so keyword.operator wins.
"not" @keyword.operator

((operator) @keyword.operator
  (#any-of? @keyword.operator "and" "or" "not" "xor" "rvadd" "rvsub" "rvand" "rvnot"))

; Punctuation
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
  "#{"
  "#("
  "#|"
  "|#"
] @punctuation.bracket

[
  ","
  ";"
] @punctuation.delimiter

; `->` is scanned externally as a hidden token, so it has no queryable node
; type; only `=>` can be matched here.
"=>" @punctuation.special

; In a package path `::` separates; everywhere else it is cons. Later patterns win, so this
; overrides the operator capture above.
(package
  "::" @punctuation.delimiter)
