# Standalone runner pilot

## Flix 0.79 qualification (2026-11-09)

The consumer now uses full types in all three schema/extensible row tails. The
adapter retains native comment positions and reconstructs comment runs: trailing
comments stay plain; leading documentation belongs to the next documentable
native node. Misplaced documentation emits a parse-phase diagnostic. No expected
tree is read by the producer. Concrete PlainComment/DocComment nodes remain visible.

The qualified published artifacts are the exact timestamped snapshot
`0.79.0-20261108.013727-1`, not a stable 0.79 release. Download from
`https://wstein.github.io/flix-spec/maven/io/github/wstein/`:

- Data: `flix-spec/0.79.0-SNAPSHOT/flix-spec-0.79.0-20261108.013727-1.jar`
  SHA-256 `6092ac9a0f09b801f6b02ab7304af46247c90c9ac33a7aebc2642209031242e0`.
- Runner: `flix-spec-runner/0.79.0-SNAPSHOT/flix-spec-runner-0.79.0-20261108.013727-1.jar`
  SHA-256 `ea02ead1dbe3c5d9d22f6bfffec7f8207715f04ebc0d33a694e9f75aebc1fec2`.

Verify these digests before extracting the data jar into a separate directory.
The adapter additionally enforces the runner digest, data pin, vocabulary digests,
and fixture revision. No floating snapshot alias is used to select artifact bytes.

```sh
node scripts/flix-spec-conformance.mjs /absolute/extracted-data \
  --spec-version 0.79.0-20261108.013727-1 \
  --runner /absolute/flix-spec-runner-0.79.0-20261108.013727-1.jar
npm run test:conformance
npm run lint
tree-sitter test
```

Java 21, Node 22 and tree-sitter CLI 0.27.1: 163/163 fixtures projected;
structure 40 differences, 139 agreeing, depth 95%; recovery 30 differences,
18/30 agreeing, depth 81%; diagnostics one accept/reject difference, 162 agreeing.
Ratchets tighten from 46/34/2 to 40/30/1; recovery depth tightens 79% to 81%.
`accepted.json` also binds each remaining fixture/path/reason identity to this
fixture revision, so a smaller total cannot conceal a new recovery difference.

Diagnostics remain accept/reject only; kinds and lines are not mapped. The
remaining diagnostic disagreement is `operator-error.flix`. Token accounting,
positions and lexical correctness remain unmeasured: this is a named-node adapter.
The upstream 0.79 corpus contains 894 files: 893 clean, plus the expected truncated
`resiliency/ford-fulkerson-prefix.flix` detected by the error-marker pass.

### Unpublished 166-fixture candidate qualification

The exact source-check candidate at flix-spec source revision
`1463cdaafd8dd5b67c5cdd3b9948923c1e98b1b9` also passes with this consumer code.
Data SHA-256: `f58c987974501e22f6671511a4454458fb669511c140788d27a560ac09b03922`;
runner SHA-256: `9e8c4388c3feed99d3918b58b9c1b5ecd6aff2f265662778573a57efb0ed0b2c`.
Its fixture revision is
`7e017bc8d4850fd293c6c97ddb3e4e5c4cb8cee0ed691d2750d461eccc236dd2`.
All 166 fixtures project: structure 40 differences, 142 agreeing, depth 95%;
recovery 30 differences, 18/30 agreeing, depth 81%; diagnostics one difference,
165 agreeing. Each remaining fixture/path/reason identity is unchanged from the
published 163-fixture qualification. The candidate was tested in an isolated copy
with its digest and fixture revision supplied explicitly; it does not replace the
normal published artifact pin, and no standalone candidate build was run here.

The following older pilot records are historical.

## Current status (2026-09-29)

Implemented in `ad132be`: the local standalone gate passes with data **0.77.2**,
runner **0.77.4**, report schema **9**, and the reviewed structural floor **92%**.
The initial failure below is historical; count allowances were not increased.

[CI at ad132be passed](https://github.com/wstein/tree-sitter-flix/actions/runs/36582290916).
That workflow checks grammar/build behavior, not the standalone conformance gate;
it is not evidence of remote runner qualification. Local qualification included
114 grammar tests, four adapter tests and lint.

The runner is still a pre-release dependency. The
[flix-spec publish run](https://github.com/wstein/flix-spec/actions/runs/36582083655)
was cancelled, so it does not establish completed publication verification.
Use the staged runner until the stable artifact is published and verified. Then
re-run this gate with the downloaded artifact, preserving the data pin and gates.

## Running the migrated adapter

This adapter now invokes the executable `flix-spec-runner` jar, not a Gradle task
inside a flix-spec checkout. It needs Java 21+, Node and tree-sitter; it does not
need Gradle or the Flix oracle. The grammar and the pinned data version (0.77.2)
remain unchanged. The runner may be a newer version than the data.

```sh
# Download the pinned data jar and verify its published SHA-256, then extract it.
# During the pre-release pilot, build the runner from the flix-spec checkout.
export FLIX_SPEC=/path/to/extracted/flix-spec-0.77.2
export FLIX_SPEC_VERSION=0.77.2
export FLIX_SPEC_RUNNER=/path/to/flix-spec-runner-0.77.4.jar
npm run conformance -- --out build/runner-pilot/actual
npm run test:conformance
```

`--spec-version` records the coordinate the bundle was extracted from. The actual
pin, vocabulary digests and fixture revision are still checked against the
consumer baseline. For a source checkout, the version can still be read from
`gradle.properties`. Runner paths and output paths are individual process
arguments, including paths with spaces.

The map declares structure, recovery and diagnostics, but not tokens: the adapter
emits named nodes and accept/reject evidence, not a Flix token stream. JSON and
HTML reports are written next to the actual-output directory, including when a
conformance gate fails. Invalid runner input exits 2; a failed conformance gate
exits 1. `--remeasure` never updates the baseline or relaxes its gates.

Schema 9 uses the reference tree as the depth denominator. Old numeric floors
must be reviewed against the new measurement; the reviewed migration below
records that decision explicitly. Results are recorded
in flix-spec's consumer pilot notes. The runner is not yet released; do not assume
that the public Maven repository already provides it.

## Initial pilot result (historical, 2026-09-29)

Data 0.77.2, runner 0.77.4/report schema 9, tree-sitter CLI 0.27.0:

| Lane | Result |
| --- | --- |
| Structure | 86 divergences; 106/147 agree; 2002/2183 nodes, rounded depth 92% |
| Recovery | 54 divergences; 7/28 agree; depth 67% |
| Diagnostics | 7 accept/reject divergences; 140/147 agree; native kinds unmeasured |
| Source invariants | Shape passes; no tokenization claim |

The initial invocation exited 1 because the then-existing structural floor was 93%, not because
any divergence count changed. The old comparator let consumer normalization
shrink the depth denominator. No grammar, mapping target, count baseline or depth
floor was changed to make the pilot pass. HTML is emitted even on this failure.
That prompted the explicit 93→92 metric review below.

## Reviewed metric migration

For the original pilot grammar, the floor was re-recorded at **92%**. Compared nodes
remained 2002; the former denominator was 2162 = 2183 − 18 elided − 3 flattened
canonical nodes. Rounding 2002/2162 gives 93%; rounding 2002/2183 gives 92%.
No parser, mapping or count allowance changed in that measurement. The original
failing pilot result above is retained as migration evidence.

After rebasing the runner onto the newer grammar, the same schema 9 comparison
measures 46 structural, 34 recovery and 2 diagnostic divergences. Structural
depth is 2063/2183, still 95% when rounded. Recovery depth is 271/341, now
79% rather than the old metric's 271/339 = 80%. The baseline records these
counts and floors, and the adapter refuses a report schema different from its
recorded metric definition.
