# Standalone runner pilot

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
must be reviewed against the new measurement; the pilot deliberately preserves
them so a changed metric is visible, not silently accepted. Results are recorded
in flix-spec's consumer pilot notes. The runner is not yet released; do not assume
that the public Maven repository already provides it.

## Measured result (2026-09-29)

Data 0.77.2, runner 0.77.4/report schema 9, tree-sitter CLI 0.27.0:

| Lane | Result |
| --- | --- |
| Structure | 86 divergences; 106/147 agree; 2002/2183 nodes, rounded depth 92% |
| Recovery | 54 divergences; 7/28 agree; depth 67% |
| Diagnostics | 7 accept/reject divergences; 140/147 agree; native kinds unmeasured |
| Source invariants | Shape passes; no tokenization claim |

The invocation exits 1 because the existing structural floor is 93%, not because
any divergence count changed. The old comparator let consumer normalization
shrink the depth denominator. No grammar, mapping target, count baseline or depth
floor was changed to make the pilot pass. HTML is emitted even on this failure.
The baseline owner must review the 93→92 metric migration before release adoption.

## Reviewed metric migration

The floor is now explicitly re-recorded at **92%**, with runner version and report
schema in `baseline.json`. Compared nodes remain 2002; the former denominator was
2162 = 2183 − 18 elided − 3 flattened canonical nodes. Rounding 2002/2162 gives
93%; rounding 2002/2183 gives 92%. No parser, mapping or count allowance changed.
The adapter refuses a report schema different from the recorded metric definition.
The original failing pilot result above is retained as migration evidence.
