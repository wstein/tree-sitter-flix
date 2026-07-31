; Indentation for editors that consume nvim-treesitter-style indent queries.
;
; Flix is brace-delimited but its bodies are frequently brace-less — a `def`
; body is an expression, and `let ... ;` sequences continue at the same level —
; so the delimited forms drive @indent.begin and the closing bracket dedents.
[
  (block)
  (record_expression)
  (enum_body)
  (trait_body)
  (instance_body)
  (effect_body)
  (match_body)
  (ext_match_body)
  (handler_body)
  (catch_body)
  (select_expression)
  (parameter_list)
  (argument_list)
  (type_parameter_list)
  (type_argument_list)
  (tuple_expression)
  (tuple_pattern)
  (tuple_type)
  (paren_expression)
  (record_type)
  (record_row_type)
  (record_pattern)
  (effect_set_type)
  (schema_type)
  (schema_row_type)
  (extensible_type)
  (fixpoint_constraint_set)
  (for_fragments)
  (par_fragments)
  (vector_literal)
  (list_literal)
  (set_literal)
  (map_literal)
  (array_literal)
  (case_body)
  (use_many)
] @indent.begin

; The module body is the one declaration form whose braces are mandatory.
(module_declaration
  "{" @indent.begin)

[
  ")"
  "]"
  "}"
  "|#"
] @indent.end @indent.branch

; A rule arm continues the line it starts on.
[
  (match_rule)
  (ext_match_rule)
  (select_rule)
  (catch_rule)
  (handler_rule)
] @indent.align

; Comments should not shift the surrounding indent.
[
  (line_comment)
  (doc_comment)
  (block_comment)
] @indent.ignore
