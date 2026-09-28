# Migrating to Flix v0.77.0 and the current flix-spec

Status: **not started.** This repository is at `flixSpecArtifact` 0.75.8, `flixSpecPin` v0.75.2
(`conformance/baseline.json`), two Flix releases behind.

## What changed in Flix

This repository is pinned to Flix **v0.75.2** (`40949531`). The reference has moved twice since.

### v0.75.2 → v0.76.0

- Effects accept type parameters. Generic *operations* remain invalid and now report
  `IllegalOperationTypeParams` rather than `IllegalEffectTypeParams`.
- Malformed `match` and `ematch` expressions retain the match node and the scrutinee through
  ordinary recovery instead of collapsing.
- **Vocabulary unchanged**: 191 TreeKinds and 158 TokenKinds, same names, same digests.

### v0.76.0 → v0.77.0

- **`+UsesOrImports.Package`** (TreeKind 191 → 192). `use` now recognises a package path:
  `use flixball::Game.Board` and `use flixball::{Game, Board}`.
- **`+ColonColonTight`** (TokenKind 158 → 159). `::` written **without surrounding whitespace** lexes
  as a distinct token. Tight `::` is the package-path separator; spaced `::` remains list cons.
  Writing the separator with whitespace is now a `Malformed` error.
- Nothing was removed or re-parented. Both releases are additive at the vocabulary level.
- Internally, Flix deleted its `Reader` phase and `shared.Input`. That broke `flix-spec`'s own
  adapter and is fixed there; it does not reach consumers.

> **`ColonColonTight` is the one that bites quietly.** Upstream left `("::", ColonColon)` in the
> lexer's operator table and decides tightness in hand-written dispatch outside every table. Nothing
> that scrapes or reflects over that table sees a change. A rule matching `ColonColon` today simply
> stops matching `a::b`, with no error anywhere.

## What changed in flix-spec

Beyond the pin, the release you are moving to changes four things that affect consumers.

**1. The transparency contract is stated per occurrence, and is much larger.**
It used to admit a kind only if *every* occurrence had at most one child. It now fires per
occurrence — dropped when empty, replaced when singular, kept when branching — which admitted four
kinds every structural consumer was already eliding for itself: `Expr.Expr`, `Pattern.Pattern`,
`QName`, `UsesOrImports.UseOrImportList`. A third rule, `elide-empty`, drops empty `AnnotationList`
and `ModifierList` without splicing their tokens.

Normalisation now removes **2285 of 4449 nodes (51.4%)**, up from 753 of 4398 (17.1%). Canonical
trees are substantially smaller and every baseline is stale.

Because the rules fire per occurrence, an elided kind is **not always absent**: `QName` survives
wherever a name is qualified (23 occurrences), and `ModifierList` wherever it holds a modifier (12).
Mappings onto those are legitimate, and `validateProjectionMap` now decides that by measuring
`fixtures/expected` rather than inferring it from the rule name.

**2. A fourth lane: `diagnostic_conformance`.**
It compares whether the same units are **rejected**, and whether each carries the same gated
`kind`/`line`. Accept/reject needs no tree, no projection map and no shared vocabulary. If your
diagnostic names are your own, declare `diagnosticMappings` in your projection map; without it the
lane compares accept/reject alone and says so. A consumer that emits no diagnostics at all is
`not-applicable`, not failed.

**3. Depth is published and can be gated.**
Reports now carry `nodesExpected` and `depthPercent` beside `nodesCompared`, and the CLI accepts
`--depth-floor` / `--recovery-depth-floor`. Report `schemaVersion` is **7**. A version-6 report's
depth was computed against the walk rather than the expectation — it read *highest* for the maps
that skipped most — so old and new depth figures are not comparable.

**4. `source_invariants` gained `token-positions`.**
Token `start`/`end` were schema-required and read by nothing. The lane now checks that each token's
text is what its source holds at those offsets, that tokens advance in order, and that what lies
between them is only whitespace or the `$` escape. It stands down for consumers that emit no tokens.

New projection-map keys, both optional: `dropWhenEmpty` (the consumer-side counterpart of
`elide-empty`) and `diagnosticMappings`.

## What this repository must do

### 1. Move the pin

`conformance/baseline.json` — `flixSpecArtifact` to the new release, `flixSpecPin` to `v0.77.0`,
`flixSpecPinCommit` to `4a5b60a31ac03bb762f68b554a0fc2b6f4d982b9`. `scripts/flix-spec-conformance.mjs`
refuses to run on a mismatch, so this is the first thing that will stop you.

### 2. Re-measure. Every lane number is stale.

The suite goes 138 → **146** fixtures and normalisation removes more than three times as many nodes,
so `fixtureRevision` moves and the recorded `oracle_conformance` figures (105/138 agreeing, 61
divergences, 1922 nodes compared, 95% depth) describe a different question. Re-run and re-record;
do not treat the new numbers as a regression against the old ones.

### 3. Delete six now-redundant `elide` entries

`conformance/projection-map.json` declares 11 canonical kinds in `elide`. Six are now in
`ast/transparency.json` and the canonical tree no longer contains them at those arities:

```
AnnotationList  Expr.Expr  ModifierList  Pattern.Pattern  QName  UsesOrImports.UseOrImportList
```

Five remain genuinely yours and should stay: `CommentList`, `Expr.FixpointWith`,
`Expr.RunWithBodyExpr`, `Expr.Statement`, `Type.Apply`.

Your `QName` **mapping** stays. `QName` survives wherever a name is qualified, so the mapping is
reachable and now worth more: it is the branching case only.

### 4. The `::` split — the change most likely to be silently wrong here

`grammar.js` must distinguish tight `::` from spaced `::`. Tight is the package-path separator
inside a `use`; spaced is list cons. Add a rule for `use flixball::Game.Board` and
`use flixball::{Game, Board}`, mapping the package segment to `UsesOrImports.Package`.

Two fixtures in flix-spec cover this and will be compared against you:
`fixtures/positive/declarations__use-with-a-package-path.flix` and
`fixtures/negative/declarations__package-path-separator-must-be-tight.flix`.

### 5. The diagnostic lane will stand down, and that is a choice worth revisiting

`scripts/flix-spec-conformance.mjs:212` emits `diagnostics: []` unconditionally, so the new lane
reports `not-applicable` for this repository. That is permitted and will not fail the build.

It is also the cheapest signal available here. Tree-sitter has `ERROR`/`MISSING` nodes; emitting one
diagnostic per `ERROR` node would give accept/reject agreement across all 146 fixtures without any
grammar work, and would be the only lane measuring this repository's error behaviour at all.

### Suggested order

1. Bump the pin, run conformance, accept that it fails.
2. Delete the six redundant `elide` entries, re-run, re-record the baseline.
3. Add the tight-`::` rules and the `UsesOrImports.Package` mapping.
4. Optionally emit diagnostics from `ERROR` nodes and pick up the fourth lane.
