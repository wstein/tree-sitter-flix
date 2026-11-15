# Flix 0.80 conformance

The gate uses the published timestamped `0.80.0-20261115.222714-1` data and
runner artifacts from `https://wstein.github.io/flix-spec/maven/io/github/wstein/`.
The data SHA-256 is `27419d170de4af8a4a817ad48a04aa214808e8933ea23f040635357103f7c2b3`;
the runner SHA-256 is `467c7cf746799366dce795890b52dbb8f7423f98d800b1756fe8efcb3df4fa8a`.
Set `FLIX_SPEC` to the extracted data, `FLIX_SPEC_VERSION` to the timestamped
version and `FLIX_SPEC_RUNNER` to the runner JAR, then run `npm run conformance`.
The adapter rebuilds the tree-sitter parser once before producing fixture trees.

Both runner comparisons must pass. The complete 168 fixtures have 42 structural
and 32 recovery divergences, with depths 95% and 78%; one diagnostic difference
remains. Removing only `identifier__reserved-val` yields 167 fixtures with the
historical 40 structural and 30 recovery identities and 95% and 81% depths. The
historical 81% recovery floor applies to that complete subset. Full fixture
membership, revision, exact identities, unmapped kinds and diagnostics are checked.
The owner accepted only two structural and two recovery differences caused by
error recovery in the reserved-identifier fixture. Its rejection is separately
covered by the grammar corpus tests. This is not a claim that recovery trees match.

The earlier 0.79 baseline and accepted identities remain in `baseline.json` and
`accepted.json`. Historical pilot notes are in `RUNNER-PILOT.md`.
