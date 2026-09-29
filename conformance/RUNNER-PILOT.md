# Standalone runner pilot

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

The floor is now explicitly re-recorded at **92%**, with runner version and report
schema in `baseline.json`. Compared nodes remain 2002; the former denominator was
2162 = 2183 − 18 elided − 3 flattened canonical nodes. Rounding 2002/2162 gives
93%; rounding 2002/2183 gives 92%. No parser, mapping or count allowance changed.
The adapter refuses a report schema different from the recorded metric definition.
The original failing pilot result above is retained as migration evidence.
