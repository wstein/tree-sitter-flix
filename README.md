# tree-sitter-flix

[![CI][ci-badge]][ci]
[![Release][release-badge]][releases]
[![License][license-badge]][license]

A [Tree-sitter][tree-sitter] grammar for [Flix][flix] — covering the full
surface syntax, effect system and first-class Datalog included.

Flix is a functional, imperative, and logic programming language with a
Hindley–Milner type system, a polymorphic effect system, and first-class
Datalog constraints.

## Status

It parses **every valid `.flix` file** in a Flix compiler checkout — 871 of
873 in the current upstream `master` (corpus size drifts as flix/flix
changes; re-run `scripts/parse-corpus.sh` for the current count), across the
standard library, the examples and the test suite.

Two files don't parse, and neither is a gap. `resiliency/ford-fulkerson-prefix.flix`
is an intentional negative test, truncated mid-expression to exercise the
compiler's error recovery. `examples/apps/langcensus/src/Analyse.flix` uses
`foreach (...) yield expr`, which `foreach` does not support in the reference
parser either — `Parser2.scala`'s `foreachExpr()` has no `yield` production,
unlike `forA`/`forM` — so the example does not compile against the reference
compiler regardless of this grammar. (`IfElseCoverage.flix`, an earlier
negative test that used `if b then …`, no longer exists in the corpus.)

The grammar is derived from the reference compiler's `Lexer.scala` and
`Parser2.scala` rather than from documentation, so it follows the parser's
actual behaviour — including the places where it deliberately accepts more than
the language allows and rejects it in a later phase.

## What's included

| File | Purpose |
| --- | --- |
| `queries/highlights.scm` | Syntax highlighting |
| `queries/injections.scm` | `regex"…"` as regex, `///` doc comments as markdown |
| `queries/locals.scm` | Scopes, bindings and references |
| `queries/tags.scm` | Code navigation (definitions and references) |
| `queries/folds.scm` | Folding |
| `queries/indents.scm` | Indentation |

An external scanner handles the four constructs that cannot be expressed as
regular expressions: nested block comments, interpolated-string segmentation,
the whitespace-sensitive `->` (`a->b` is struct field access, `a -> b` the
function arrow), and the `.` trichotomy (qualified-name separator, Datalog
constraint terminator, or an error).

## Editor setup

### Helix

```toml
# languages.toml
[[language]]
name = "flix"
scope = "source.flix"
file-types = ["flix"]
comment-tokens = ["//"]
block-comment-tokens = { start = "/*", end = "*/" }
indent = { tab-width = 4, unit = "    " }

[[grammar]]
name = "flix"
source = { git = "https://github.com/wstein/tree-sitter-flix", rev = "v0.1.1" }
```

Then `hx --grammar fetch && hx --grammar build`, and copy `queries/` to
`runtime/queries/flix/`.

### Neovim

With the classic nvim-treesitter API:

```lua
require("nvim-treesitter.parsers").get_parser_configs().flix = {
  install_info = {
    url = "https://github.com/wstein/tree-sitter-flix",
    files = { "src/parser.c", "src/scanner.c" },
    branch = "main",
  },
  filetype = "flix",
}
```

then `:TSInstall flix`. The query files are not installed with the parser —
copy `queries/*.scm` to `queries/flix/` somewhere on your `runtimepath` (for
example `~/.config/nvim/queries/flix/`). Newer nvim-treesitter revisions
register parsers differently; check their documentation if the above does not
apply.

## Using the bindings

Bindings are generated for C, Rust, Node, Python, Go and Swift. They are **not
published to any package registry yet**, so depend on the repository directly.

```toml
# Cargo.toml
tree-sitter-flix = { git = "https://github.com/wstein/tree-sitter-flix", tag = "v0.1.1" }
```

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_flix::LANGUAGE.into())?;
```

The highlight, injection, locals and tags queries are exposed alongside the
language as `HIGHLIGHTS_QUERY`, `INJECTIONS_QUERY`, `LOCALS_QUERY` and
`TAGS_QUERY` in each binding.

## Development

`src/parser.c` is generated **and committed**, so there is nothing to build
before parsing:

```bash
tree-sitter parse path/to/File.flix   # dump a parse tree
tree-sitter test                      # run the corpus tests
npm run lint                          # eslint over grammar.js
```

After editing `grammar.js` you must regenerate, which takes 7–11 minutes for
this grammar — the Datalog rules are expensive to build tables for:

```bash
tree-sitter generate
```

`scripts/parse-corpus.sh` measures the parse rate against a real Flix checkout,
which is the meaningful regression gate:

```bash
FLIX_SRC=/path/to/flix ./scripts/parse-corpus.sh
```

See [`CLAUDE.md`](CLAUDE.md) for the grammar's architecture, the compiler files
that define it, and the release procedure.

## References

- [Flix language reference][flix-docs]
- [Flix compiler source][flix-src] — `Lexer.scala` and `Parser2.scala` are the
  authoritative definition of the surface syntax this grammar targets.

[tree-sitter]: https://tree-sitter.github.io/tree-sitter/
[flix]: https://flix.dev
[flix-docs]: https://doc.flix.dev
[flix-src]: https://github.com/flix/flix/tree/master/main/src/ca/uwaterloo/flix/language/phase
[ci]: https://github.com/wstein/tree-sitter-flix/actions/workflows/ci.yml
[ci-badge]: https://img.shields.io/github/actions/workflow/status/wstein/tree-sitter-flix/ci.yml?branch=main&logo=github&label=CI
[releases]: https://github.com/wstein/tree-sitter-flix/releases
[release-badge]: https://img.shields.io/github/v/release/wstein/tree-sitter-flix?logo=github&label=release
[license]: LICENSE
[license-badge]: https://img.shields.io/github/license/wstein/tree-sitter-flix?label=license
