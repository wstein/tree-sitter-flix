# Migrating to Flix v0.77.0 and flix-spec 0.77.2

Status: **all three PRs done, plus B6 and both guards** -- baseline at flix-spec 0.77.2, grammar at
Flix v0.77.0, diagnostic lane active. Left: CI, the `ts_query_ls` format check, and the release.
The target was flix-spec **0.77.1** (tag `v0.77.1`), since moved to 0.77.2; both pin
Flix **v0.77.0** (`4a5b60a31ac03bb762f68b554a0fc2b6f4d982b9`).

This file is a work plan, not reference documentation. Delete it when the migration merges; the
durable lessons (the `::` handling, the diagnostic lane) belong in CLAUDE.md, and the history in
commit messages and the `baseline.json` comments.

Upstream's own account of the changes, which this file does not restate:
[`MIGRATION-v0.76.0.md`](https://github.com/wstein/flix-spec/blob/v0.77.1/docs/MIGRATION-v0.76.0.md),
[`MIGRATION-v0.77.0.md`](https://github.com/wstein/flix-spec/blob/v0.77.1/docs/MIGRATION-v0.77.0.md),
[`CONFORMANCE.md`](https://github.com/wstein/flix-spec/blob/v0.77.1/docs/CONFORMANCE.md) and
[`DEFECTS.md`](https://github.com/wstein/flix-spec/blob/v0.77.1/docs/DEFECTS.md). What follows is
only what each change means for this repository.

## What changed in Flix, and what it asks of this grammar

Flix tags between the two pins: v0.75.3, v0.76.0, v0.76.1, v0.76.2, v0.77.0. The syntax changes
below landed by **v0.76.2**; v0.76.2 → v0.77.0 touches only license headers in the lexer, parser
and vocabulary files. Both vocabulary changes are additions — nothing was removed or renamed.

### Effect type parameters — a grammar gap

Since v0.76.0 an effect declaration may take type parameters: `effectDecl` calls
`Type.parameters()` after the name when a `[` follows.

**This grammar does not accept it.** `effect_declaration` (`grammar.js:532`) is
`'eff' name_upper effect_body?`, so `eff E[a] { … }` produces an `ERROR` over `[a]`.

Generic *operations* (`def op[a](…)`) are still rejected, now as `IllegalOperationTypeParams`. The
error is typed as a `WeederError`, but it is raised by the parser: `operationDecl` parses the
parameters and wraps them in an `ErrorTree` (`Parser2.scala:1364-1368`), keeping the operation's
shape. The grammar follows that tree: see B4 for why leaving it an `ERROR` was measurably worse.

### `match` / `ematch` recovery — no grammar action

Malformed `match` and `ematch` now keep the match node and the scrutinee through ordinary recovery.
This changes the reference's recovery trees, not its accepted language. Expect
`recoveryDivergences` to move on re-measurement; it is not a grammar regression.

### `UsesOrImports.Package` and `ColonColonTight`

TreeKind 191 → 192, TokenKind 158 → 159.

- **Lexing.** `::` with **no whitespace on either side** lexes as `ColonColonTight`; whitespace on
  either side (`a ::b`, `a:: b`, `a :: b`) keeps `ColonColon` (`Lexer.scala:384-400`).
- **Cons is unchanged.** Parser2 accepts *both* token kinds as list cons in expressions
  (`Parser2.scala:1669`) and patterns (`:3327`). `x::xs` and `42::Nil` are cons exactly as before.
- **Packages exist only in `use`.** In `use()` (`Parser2.scala:875-900`) a leading
  `NAME_PACKAGE` — a single lower- *or* uppercase name — followed by either `::` kind opens
  `UsesOrImports.Package`. It is then followed by a qualified name (`use flixball::Game.Board`) or
  directly by `{` (`use flixball::{Game, Board}` — no `.` before the brace). `import`, types and
  expressions take no package prefix; `pkg::Mod.f` in an expression is still cons.
- **Spaced `::` in a `use` is not a parse failure.** When a path or `{` follows, Parser2 builds
  the same `Package` node and attaches a `Malformed` error to the `::` token. A dangling
  `use flixball ::` gets no such error.

## What changed in flix-spec, and what it asks of this repository

- **Transparency is per occurrence and much larger.** `ast/transparency.json` now elides
  `Expr.Expr`, `Pattern.Pattern`, `QName` and `UsesOrImports.UseOrImportList` where they have at
  most one child, and drops `AnnotationList` and `ModifierList` only where they are **empty**
  (`elide-empty`). Every lane number is stale. → Steps A3, A4.
- **The projection-map keys `elide` and `flattenCanonical` are deprecated.** `validateProjectionMap`
  prints a `NOTE` for as long as either key is present at all; see step A4 for why this repository
  cannot drop them yet.
- **A fourth lane, `diagnostic_conformance`.** It compares accept/reject per unit and, where
  mapped, diagnostic `kind` and `line`. It reports `not-applicable` while a consumer emits no
  diagnostics — which this repository does not — but it **gates the exit status** against
  `--diagnostic-baseline` (default 0) as soon as any are emitted. → PR C.
- **Depth floors.** `--depth-floor` and `--recovery-depth-floor` exist and default to off. Report
  `schemaVersion` is 7. → Step A5.
- **`token-positions`** joins `source_invariants`. It stands down here because the adapter emits
  no tokens. No action.
- **`dropWhenEmpty`** is a new optional key. No action: `prologue()` produces no wrapper node that
  could be empty.
- **New in 0.77.1**, with the same Flix pin as 0.77.0: `ast/annotation.json` (a coverage
  vocabulary of the 16 annotations), `ast/retired.json` (`Decl.Law`, `KeywordLaw` and
  `KeywordLawful`, removed at v0.75.2 → step B6), a 147th fixture for `@Deprecated`, `@DontInline`
  and `@Skip` (already parses cleanly here), and defect FLIX-0002. FLIX-0002 asks nothing of a
  parser. It does bound what a positive fixture promises: that it *parses*, and nothing more.

## Plan

Three PRs, so that the ~10-minute regenerations and any fuzz CI run stay out of the baseline
change, and each one can be reverted on its own. No commit lands red.

### PR A — `chore(conformance)`: move to flix-spec 0.77.1

- [x] **A1. Check out the tag.** `git -C "$FLIX_SPEC" checkout v0.77.2` (measured first at
      `v0.77.1`; see the 0.77.2 section). Nothing verifies the checkout against the baseline:
      `scripts/flix-spec-conformance.mjs` reads only `divergences`, `recoveryDivergences` and the
      depth floors from `baseline.json`, and flix-spec computes `fixtureRevision` itself. A
      checkout ahead of the tag silently measures unreleased fixtures.
- [x] **A2. Measure before touching the map.** Run `npm run conformance` and keep the report (call
      it *A*). It will exceed the old ratchets; that is expected, and it is not committed.
- [x] **A3. Delete the four redundant `elide` entries.** Remove `Expr.Expr`, `Pattern.Pattern`,
      `QName` and `UsesOrImports.UseOrImportList` from `conformance/projection-map.json`. Every
      surviving occurrence of these four branches, and `elide` never removes a branching node, so
      the re-run must match *A* exactly. Any difference is a bug in the reasoning, not a result.
      Delete or rewrite `notes.QName`, which describes the removed entry.
- [x] **A4. Keep the rest — do not delete six.** Keep `ModifierList` and `AnnotationList` in
      `elide`. `elide-empty` drops only empty ones, so their 13 one-child survivors (12 and 1) are
      still in `fixtures/expected`. Today `elide` hides them. Deleting the entries measured **+48**
      divergences, not just the 13 nodes: this map maps nothing onto `modifier` or `annotation`,
      and each exposed node shifts its parent's arity. Keep the
      consumer-specific five as well (`CommentList`, `Expr.FixpointWith`, `Expr.RunWithBodyExpr`,
      `Expr.Statement`, `Type.Apply`).
      Also keep `ignored: qualified_name`. It is what stops a single-segment `qualified_name` from
      surfacing where the canonical side has no `QName`. The `QName` *mapping* stays too and now
      only meets the branching case. Keep `flattenCanonical: UsesOrImports.UseOrImportList` as
      well: it still splices the branching use list, which this grammar has no node for. As a
      result, the deprecation `NOTE` stays until `elide` and `flattenCanonical` are replaced
      outright — a separate decision.
- [x] **A5. Decide on depth floors.** Either wire `--depth-floor` / `--recovery-depth-floor` into
      the `--args=` string in `scripts/flix-spec-conformance.mjs`, reading new `depthFloor` /
      `recoveryDepthFloor` fields in `baseline.json`, or record in the commit why not. Without
      them, depth — which the baseline note says to read alongside agreement — is reported but
      not gated.
- [x] **A6. Re-record the baseline.** In `conformance/baseline.json`:
  - every `measuredAt` field: `flixSpecArtifact` `0.77.1`, `flixSpecPin` `v0.77.0`,
    `flixSpecPinCommit` `4a5b60a31ac03bb762f68b554a0fc2b6f4d982b9`, `fixtureRevision`,
    `fixtures` `147`, `treeSitterCli`;
  - both ratchets, `divergences` and `recoveryDivergences`. The recovery lane is live (currently
    failing at 5/22 fixtures), and the new negative `::` fixture carries an `ErrorTree`, so it
    likely joins the recovery set;
  - every lane's figures and `comment`. The current comments describe 0.75.8.
- [x] **A7. Commit once.** The commit message records *A*, the result after A3 (identical), the
      new figures, and why any ratchet rose: nine new fixtures, per-occurrence transparency, and
      the new match recovery. Per the baseline note, a different pin is a different question,
      not a regression.

### PR B — `feat`: package paths, effect type parameters

Write the corpus tests first. Each `tree-sitter generate` costs 7–11 minutes, and the tests pin
the behaviour that must *not* change.

- [x] **B1. Pin cons first.** Add corpus tests for tight and spaced cons in both expressions and
      patterns: `42::Nil`, `x :: xs`, and `case x::xs =>`. Leave `cons_pattern`
      (`grammar.js:711`) and the `::` binary operator (`:1079`) untouched.
- [x] **B2. Add `package` to `use_declaration`** (`grammar.js:362`). Today it is
      `seq('use', qualified_name, optional(seq(_dot, use_many)))`. A lowercase segment is legal
      only last in `qualified_name`, so `use flixball::Game.Board` fails. Target shape:

      ```js
      use_declaration: $ => seq(
        'use',
        choice(
          seq(optional($.package), $.qualified_name, optional(seq($._dot, $.use_many))),
          seq($.package, $.use_many), // `use pkg::{A, B}` -- no `.` before the brace
        ),
      ),
      package: $ => seq(choice($.name_lower, $.name_upper), '::'),
      ```

      `package` is snake-cased from `UsesOrImports.Package`. `use_expression` (`:947`) reuses
      `use_declaration` and inherits the change. A bare `use {A}` with no package stays illegal.
      `name_upper '::'` competes with an ordinary `qualified_name` start, so check the conflict set
      after `generate`.
- [x] **B3. Tight vs spaced — accept both, structurally.** The structural lanes need no whitespace
      distinction: the two package fixtures
      (`fixtures/positive/declarations__use-with-a-package-path.flix`,
      `fixtures/negative/declarations__package-path-separator-must-be-tight.flix`) have identical
      structure once the `ErrorTree` is spliced. Parse spaced `::` in a `use` as the same
      `package`, following the parser rather than the weeder. The difference matters only to the
      recovery and diagnostic lanes. If one of them needs it later, prefer a `use`-local
      `token.immediate('::')`, or an external token offered only in `use` position, over a
      general scanner change. Touching `src/scanner.c` triggers the fuzz CI job, and would need
      the "four things" list in CLAUDE.md updated.
- [x] **B4. Effect type parameters.** Add `optional($.type_parameter_list)` after the name in
      `effect_declaration`, and add a corpus test for `eff E[a] { def op(x: a): Unit }`.
      **Also add it to `operation_declaration`.** The plan was to leave generic operations an
      `ERROR`, but the new optional list on `eff` gave error recovery a cheaper, wrong path: it
      read `{ def print` as garbage and handed `[a: Type]` to the effect. Recovery went from 56 to
      57 divergences and depth fell below the floor. Parsing the operation's type parameters
      structurally, as `operationDecl` does, fixed both.
- [x] **B5. Queries.** Capture the package name as `@module` in `highlights.scm`; otherwise the
      `(name_lower) @variable` fall-through takes it. Check `locals.scm:122`
      (`@local.definition.import`) and `indents.scm:42` (`use_many` is now reachable without
      `.`). Run `ts_query_ls format queries/`. (Not run locally -- the binary is not installed
      here; CI's `ts_query_ls check -f` is the check. Node names were verified with
      `tree-sitter query`.)
- [x] **B6. Retired syntax (done separately).** `law_declaration` (`grammar.js:428`),
      the `'lawful'` modifier (`:372`) and the `"law"` highlight (`highlights.scm:258`) cover
      syntax the reference parser stopped accepting at v0.75.2 (`ast/retired.json`).
      `law_declaration` is already in the map's `ignored`. Remove them, or record why they stay.
      Keeping them does not break `law` as an identifier.
      **Done:** removed `law_declaration`, `lawful` and the now-unused `forall` token, with their
      query captures and map entries; this also let one more conflict entry go. The negative law
      fixture is now rejected, as by the reference. Cost: +1 structural and +1 recovery
      divergence (a leaf difference -- tree-sitter's `ERROR` keeps `lawful` as a child node),
      while recovery depth rose 63% -> 65%.
- [x] **B7. Mapping and ratchet.** Map `package` → `UsesOrImports.Package` in
      `conformance/projection-map.json`, re-run conformance, and **lower** the ratchets in the
      same commit.
- [x] **B8. Corpus.** Move `$FLIX_SRC` to tag `v0.77.0`; the local checkout is at v0.76.0, which
      contains no package paths. Run `./scripts/parse-corpus.sh "$FLIX_SRC"`. Result: 893 files,
      and **one** failure, `ford-fulkerson-prefix.flix`. `langcensus/src/Analyse.flix` no longer
      fails: upstream rewrote its `foreach (...) yield` to `forM` in v0.77.0 (#13382). CLAUDE.md,
      README and the `parse-corpus.sh` header now expect that one failure, and CLAUDE.md tells
      `FLIX_SRC` to sit at the pinned tag rather than on master.

### PR C (optional) — `feat(conformance)`: the diagnostic lane — **done**

Implemented as planned: one `tree-sitter.ParseError` per unit containing an `ERROR`, a `MISSING`
token or a recovery marker; no `diagnosticMappings`, so the lane compares accept/reject only; a
`diagnosticDivergences` ratchet passed as `--diagnostic-baseline`. First measurement: **138/147
fixtures agree, 9 divergences** -- two by design, six grammar gaps, and `operator-error.flix`,
which the reference accepts and this grammar rejects (listed in the baseline comment). One trap
the pitfalls below missed: tree-sitter's dump omits an anonymous `MISSING` token and reports it only
on the per-file summary line, so the marker scan reads the whole output.

Before this, `scripts/flix-spec-conformance.mjs` emitted `diagnostics: []` for every unit, so the
lane stood down. Emitting diagnostics is the only way to measure this repository's accept/reject behaviour.
Four pitfalls:

- **Rejection is more than `ERROR`.** It also includes `MISSING` and this grammar's own markers
  `trailing_dot`, `unterminated_literal` and `unterminated_string` (the map's `recoveryMarkers`).
  Counting only `ERROR` would call `ford-fulkerson-prefix.flix` accepted. `parse-corpus.sh`
  already queries the markers for this reason; mirror it.
- **Emit one diagnostic per unit, not per node.** Nested and adjacent `ERROR` nodes over-count.
  Leave `kind` unmapped and omit `line` at first: tree-sitter rows are 0-based, and an `ERROR`
  spans the recovery region rather than the reference's error token. Start with accept/reject
  alone and no `diagnosticMappings`.
- **Some disagreements are permanent by design.** This grammar parses what `Weeder2` rejects, so
  negative fixtures that only the weeder rejects will always disagree. The same holds for inputs
  Parser2 accepts structurally while attaching an error, such as the spaced package `::` after
  B3.
- **It needs a ratchet.** Add `diagnosticDivergences` to `baseline.json` and pass it as
  `--diagnostic-baseline`. Without it, the first run fails the build on any disagreement.

## Definition of done

- [x] `src/parser.c`, `src/grammar.json` and `src/node-types.json` are regenerated and committed
      with every grammar change.
- [x] `tree-sitter test` passes, and so does `npm run lint`.
- [ ] `ts_query_ls check -f queries/` passes.
- [x] `npm run conformance` passes against the re-recorded baseline, with flix-spec checked out at
      `v0.77.2`.
- [x] `parse-corpus.sh` against Flix `v0.77.0` shows exactly the one expected failure, by name.
- [ ] CI is green, including `fuzz` if the scanner changed.
- [x] CLAUDE.md is updated: `FLIX_SRC` guidance and, if applicable, the scanner's list.
- [ ] Release per CLAUDE.md "Releasing" (`tree-sitter version`, lockfile, `generate`, then tag).
      New syntax makes this a minor bump.
- [ ] This file is deleted.

## flix-spec 0.77.2 — bump the coordinate, re-measure nothing

Same upstream pin as 0.77.0 and 0.77.1 (`4a5b60a31ac03bb762f68b554a0fc2b6f4d982b9`). The three
vocabularies, both fixture forms, all 147 fixtures and the report `schemaVersion` 7 are unchanged,
so **every lane number you have measured against 0.77.1 stays valid**. Move the coordinate and stop.

The one published change is `defects/ledger.json`, and one schema field moved with it:

- `defect-ledger.schema.json` replaces the required `review` (a date) with **`reviewedAtPin`** (the
  upstream commit an entry was last triaged against). Only relevant if you read that file; none of
  the consumers do today.
- Both entries now record their upstream search result, a review-ready draft, and a standalone
  reproduction you can run with only a JDK:
  [FLIX-0001](https://github.com/wstein/flix-repro-predicate-paramuntyped) ·
  [FLIX-0002](https://github.com/wstein/flix-repro-namemath-infix-crash).

**Measured here, and done:** against a `v0.77.2` checkout both lanes are identical divergence for
divergence (same `fixtureRevision`), so `measuredAt.flixSpecArtifact` is now `0.77.2` and nothing
else moved.

**Do not follow the new validator's "removable now" list for this map.** 0.77.2 also changes
`ProjectionMapValidator.scala` -- not only the ledger -- so that the deprecation `NOTE` names
entries it considers covered by `ast/transparency.json`. For this map it names `AnnotationList`
and `ModifierList` (under `elide`) and `UsesOrImports.UseOrImportList` (under `flattenCanonical`).
All three were measured, and removing any of them makes things worse:

| Removed | Structural divergences | Depth |
|---|---|---|
| (nothing) | 85 | 93% |
| `AnnotationList`, `ModifierList` | +48 (measured at PR A) | falls |
| `UsesOrImports.UseOrImportList` | 90 (+5) | 91% |

The validator treats a kind listed in `transparency.json` as fully covered, but those rules fire
per occurrence: `elide-empty` leaves non-empty `ModifierList`/`AnnotationList` in the canonical
tree, and a branching `UseOrImportList` survives while this grammar has no node for it. That is
worth reporting to flix-spec: "removable" should be decided by measuring `fixtures/expected`, as
`validateProjectionMap` already does for mapping reachability.

**Why the field changed, since the reasoning may be worth borrowing.** The date gate failed the
build once it passed, which put a fuse in every tag: rebuilding `v0.77.0` or `v0.77.1` after
2026-11-01 would have failed, although nothing about those commits had changed and the artifacts
they published were still exactly what they published. Time passing is not evidence about a defect.
The oracle changing is — and it is the only thing that can make one of these entries stop being
true. Any ratchet you keep against a pinned input is better tied to that input than to a clock.

## Two guards worth adding while you are here — **both done**

Both are implemented in `scripts/flix-spec-conformance.mjs`. Diagnostics come from parse-phase
evidence only. The script refuses a flix-spec checkout whose artifact version, pin, tree- and
token-kind digests (now in `measuredAt`) or fixture revision differ from the baseline, unless
`--remeasure` is passed. It also fails when `src/grammar.json` still has a literal token for a
retired `Keyword*` (checked against the pre-B6 grammar: it names `law` and `lawful`). Each guard
was exercised with a deliberate mismatch.

Neither is required by the release. Both close gaps this migration exposed.

### Emit only diagnostics the lexer or `Parser2` would raise

flix-spec's pipeline stops after `Parser2`: `ProjectionExtractor` collects
`lexerErrors ++ parserErrors` and nothing else, and `docs/CONFORMANCE.md` calls `Weeder2` errors
"out of scope by construction, not a gap".

So `diagnostic_conformance` compares against a **parse-phase-only** set. A spaced `::` reported as
`Malformed` is fine, because `Parser2` raises it. But every validation-level check you later write
into the projection output — duplicate modifiers, arity rules, anything `Weeder2` would own — adds a
diagnostic the canonical side does not have, and breaks `kind`/`line` agreement on exactly the
negative fixtures the lane is there to measure.

Tag each check with the phase that owns it: parse-phase diagnostics go into the projection,
validation-only diagnostics go to your CLI and stay out of it.

### Assert the vocabulary digests, not just the pin commit

`law` and `lawful` stopped being keywords at Flix v0.75.2 and went stale here without anyone
noticing, because a commit SHA moving tells you *that* the vocabulary changed, never *what*
changed — and nothing compared the names.

Record `treeKindDigest` and `tokenKindDigest` from `pin.json` alongside the pin you already track,
and fail on a mismatch. It costs two fields and forces a review at the next vocabulary change
instead of after it.

Two cheap follow-ons, now that `ast/retired.json` exists:

- assert that nothing in your keyword or token table matches a `Keyword*` entry in
  `ast/retired.json` — that pins the `law`/`lawful` class of staleness as a regression test;
- remember the digest cannot see an existing kind's *extension* being re-partitioned. It caught
  `ColonColonTight` only because a **new name** appeared. When a name is added, ask what it took
  from; the answer belongs in a fixture.
