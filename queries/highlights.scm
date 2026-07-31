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

(law_declaration
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

(record_operation
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

; Keywords
[
  "mod"
  "use"
  "import"
] @keyword.import

[
  "def"
  "redef"
  "law"
  "lazy"
  "force"
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
  "forall"
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
  "discard"
  "unsafe"
  "instanceof"
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

[
  "and"
  "or"
  "not"
  "xor"
  "rvadd"
  "rvsub"
  "rvand"
  "rvnot"
] @keyword.operator

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

; Fall-through: any remaining name is a plain variable.
(name_lower) @variable

(name_math) @variable
