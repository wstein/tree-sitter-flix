; Scopes
;
; Every construct that introduces a binding also opens a scope. `let` is a scope
; because its binding is visible only in the statement that follows it, and a
; Datalog constraint is one because rule variables are local to that rule.
[
  (source_file)
  (module_declaration)
  (function_declaration)
  (signature_declaration)
  (law_declaration)
  (operation_declaration)
  (local_def_expression)
  (jvm_method)
  (jvm_constructor)
  (handler_rule)
  (trait_declaration)
  (instance_declaration)
  (enum_declaration)
  (struct_declaration)
  (effect_declaration)
  (type_alias_declaration)
  (lambda)
  (match_lambda)
  (ext_match_lambda)
  (block)
  (let_expression)
  (region_expression)
  (match_rule)
  (ext_match_rule)
  (catch_rule)
  (select_rule)
  (foreach_expression)
  (for_monadic_expression)
  (for_applicative_expression)
  (par_yield_expression)
  (fixpoint_constraint)
  (fixpoint_lambda)
  (unsafe_expression)
] @local.scope

; Definitions
(module_declaration
  name: (qualified_name) @local.definition.namespace)

(function_declaration
  name: (_) @local.definition.function)

(signature_declaration
  name: (_) @local.definition.function)

(law_declaration
  name: (_) @local.definition.function)

(operation_declaration
  name: (_) @local.definition.method)

(local_def_expression
  name: (_) @local.definition.function)

(jvm_method
  name: (_) @local.definition.method)

(handler_rule
  name: (_) @local.definition.method)

; Types
(enum_declaration
  name: (_) @local.definition.enum)

(struct_declaration
  name: (_) @local.definition.type)

(trait_declaration
  name: (_) @local.definition.type)

(effect_declaration
  name: (_) @local.definition.type)

(type_alias_declaration
  name: (_) @local.definition.type)

(associated_type_signature
  name: (_) @local.definition.associated)

(associated_type_definition
  name: (_) @local.definition.associated)

(type_parameter
  name: (_) @local.definition.type)

(restriction_parameter
  (_) @local.definition.type)

(enum_case
  name: (_) @local.definition.enum)

; Fields
(struct_field
  name: (_) @local.definition.field)

(record_type_field
  name: (_) @local.definition.field)

; Value bindings
(parameter
  name: (_) @local.definition.parameter)

(variable_pattern
  (_) @local.definition.var)

(region_expression
  (_) @local.definition.var)

(catch_rule
  (_) @local.definition.var)

(predicate_functional
  (_) @local.definition.var)

; Imports
(use_declaration
  (qualified_name) @local.definition.import)

(import_declaration
  (java_qualified_name) @local.definition.import)

(aliased_name
  (_) @local.definition.import)

; References
(qualified_name) @local.reference

(java_qualified_name) @local.reference

(type_reference) @local.reference

(type_variable) @local.reference

(record_select
  (name_lower) @local.reference)

(struct_get
  (name_lower) @local.reference)

(struct_put
  (name_lower) @local.reference)

(get_field
  (name_lower) @local.reference)

(invoke_method
  (name_lower) @local.reference)

(predicate_head
  (name_upper) @local.reference)

(predicate_atom
  (name_upper) @local.reference)
