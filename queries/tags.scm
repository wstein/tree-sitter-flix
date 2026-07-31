; Definitions
(function_declaration
  name: (_) @name) @definition.function

(local_def_expression
  name: (_) @name) @definition.function

(signature_declaration
  name: (_) @name) @definition.method

(operation_declaration
  name: (_) @name) @definition.method

(law_declaration
  name: (_) @name) @definition.function

(jvm_method
  name: (_) @name) @definition.method

(module_declaration
  name: (_) @name) @definition.module

(trait_declaration
  name: (_) @name) @definition.interface

(instance_declaration
  name: (_) @name) @definition.implementation

(enum_declaration
  name: (_) @name) @definition.enum

(enum_case
  name: (_) @name) @definition.enumerator

(struct_declaration
  name: (_) @name) @definition.class

(struct_field
  name: (_) @name) @definition.field

(effect_declaration
  name: (_) @name) @definition.interface

(type_alias_declaration
  name: (_) @name) @definition.type

(associated_type_signature
  name: (_) @name) @definition.type

(associated_type_definition
  name: (_) @name) @definition.type

; References
(apply_expression
  (qualified_name) @name) @reference.call

(invoke_method
  (name_lower) @name) @reference.call

(invoke_constructor
  (type_reference) @name) @reference.call

(trait_constraint
  (qualified_name) @name) @reference.implementation

(derivations
  (qualified_name) @name) @reference.implementation

(type_reference) @name @reference.type
