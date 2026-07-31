/**
 * @file Flix grammar for tree-sitter
 * @author Werner Stein <claude@wstein.de>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: 'flix',

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => 'hello',
  },
});
