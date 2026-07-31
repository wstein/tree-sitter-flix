# tree-sitter-flix

[![CI][ci]](https://github.com/wstein/tree-sitter-flix/actions/workflows/ci.yml)
[![discord][discord]](https://discord.gg/w7nTvsVJhm)
[![matrix][matrix]](https://matrix.to/#/#tree-sitter-chat:matrix.org)

A [Tree-sitter][tree-sitter] parser for the [Flix][flix] programming language.

Flix is a functional, imperative, and logic programming language with a
Hindley–Milner type system, a polymorphic effect system, and first-class
Datalog constraints. This grammar aims to parse the full surface syntax
accepted by the reference compiler.

## Status

The grammar covers the full surface syntax: declarations, the type and effect
language, patterns, expressions, and first-class Datalog constraints.

It parses **888 of the 890** `.flix` files in a Flix compiler checkout —
standard library, examples and test suite. Both remaining files are deliberately
invalid fixtures from the compiler's own error-recovery tests (`if b then …`,
which Flix has no `then` keyword for, and a truncated source file); rejecting
them is the correct behaviour.

See [`CLAUDE.md`](CLAUDE.md) for the development workflow.

## Usage

Try it on a file — `src/parser.c` is committed, so there is nothing to generate:

```bash
tree-sitter parse path/to/File.flix
```

Run the corpus tests:

```bash
tree-sitter test
```

## References

- [Flix language reference][flix-docs]
- [Flix compiler source][flix-src] — `Lexer.scala` and `Parser2.scala` are the
  authoritative definition of the surface syntax this grammar targets.

[tree-sitter]: https://tree-sitter.github.io/tree-sitter/
[flix]: https://flix.dev
[flix-docs]: https://doc.flix.dev
[flix-src]: https://github.com/flix/flix/tree/master/main/src/ca/uwaterloo/flix/language/phase
[ci]: https://img.shields.io/github/actions/workflow/status/wstein/tree-sitter-flix/ci.yml?logo=github&label=CI
[discord]: https://img.shields.io/discord/1063097320771698699?logo=discord&label=discord
[matrix]: https://img.shields.io/matrix/tree-sitter-chat%3Amatrix.org?logo=matrix&label=matrix
