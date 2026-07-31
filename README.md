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

Early development. The grammar is being built up in layers; see
[`CLAUDE.md`](CLAUDE.md) for the current scope and the development workflow.

## Usage

Build the parser and try it on a file:

```bash
tree-sitter generate
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
