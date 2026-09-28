#!/usr/bin/env node
// Measure this grammar against wstein/flix-spec's fixtures and report all three conformance lanes.
//
// flix-spec owns the canonical TreeKind vocabulary, the fixtures, the expected trees and the
// comparison algorithm. This repository owns the grammar and `conformance/projection-map.json`,
// which maps our node names onto that vocabulary. The one piece that belonged to neither was the
// adapter turning `tree-sitter parse` output into the shape the comparison reads, so every
// measurement so far has been someone's scratch script and the published numbers could not be
// re-derived from a clean checkout. That is what this file fixes.
//
// Usage:
//   scripts/flix-spec-conformance.mjs [flix-spec-dir]
//   FLIX_SPEC=~/src/flix-spec scripts/flix-spec-conformance.mjs
//   scripts/flix-spec-conformance.mjs --out DIR --no-compare   # adapt only, skip the comparison
//
// Exits non-zero when a fixture cannot be adapted, or when the comparison reports a regression
// against `conformance/baseline.json`.
//
// Why the CLI and not the Node binding: `build/Release/*.node` is a native build that goes stale
// the moment `src/parser.c` is regenerated, and a stale binding reports ERROR for input the
// grammar handles perfectly well -- a very convincing wrong answer. The CLI compiles the committed
// parser, so it cannot disagree with what is checked in. `scripts/parse-corpus.sh` makes the same
// choice for the same reason.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Parses tree-sitter's s-expression output into `{kind, children}`.
 *
 * Only *named* nodes appear in this format, which is exactly the comparable part: flix-spec gates
 * node kind, child order and nesting, and drops token leaves before comparing. Anonymous tokens
 * ("def", "(") are absent here and would be discarded there.
 *
 * Deliberately not `--xml`: that renders anonymous tokens as bare text between elements, so the
 * walk has to discard them anyway, and it appends a plain-text timing line after `</sources>` that
 * breaks a strict XML parser on exactly the negative fixtures. Balanced parentheses stop at the end
 * of the tree on their own, so the same trailing line is simply never read.
 *
 * @param {string} text - `tree-sitter parse` output for one file.
 * @returns {{kind: string, children: object[]}|null} the root node, or null if there is none.
 */
function parseSExpression(text) {
  let i = 0;

  const skipSpace = () => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  };

  // `[0, 0] - [1, 20]` position ranges, and `field:` prefixes. Neither is compared, so neither is kept.
  const skipNoise = () => {
    for (;;) {
      skipSpace();
      if (text[i] === '[') {
        i = text.indexOf(']', i) + 1;
        skipSpace();
        if (text[i] === '-') i += 1;
        continue;
      }
      // A quoted name, e.g. an anonymous node the CLI chose to print. Not a named node; skip it.
      if (text[i] === '"') {
        i += 1;
        while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
        i += 1;
        continue;
      }
      return;
    }
  };

  const parseNode = () => {
    skipSpace();
    if (text[i] !== '(') return null;
    i += 1;
    skipSpace();

    let name = '';
    while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) {
      name += text[i];
      i += 1;
    }
    // `field:` prefixes bind to the following node, so a colon here means we read a field label.
    if (text[i] === ':') {
      i += 1;
      const inner = parseNode();
      skipSpace();
      if (text[i] === ')') i += 1;
      return inner;
    }

    const children = [];
    for (;;) {
      skipNoise();
      if (i >= text.length || text[i] === ')') break;
      if (text[i] === '(') {
        const child = parseNode();
        if (child) children.push(child);
        continue;
      }
      // A bare field label introducing a node: `name: (name_lower ...)`.
      let label = '';
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) {
        label += text[i];
        i += 1;
      }
      if (text[i] === ':') {
        i += 1;
        continue;
      }
      if (label === '') i += 1; // unrecognised character; never spin
    }
    if (text[i] === ')') i += 1;
    return {kind: name, children};
  };

  return parseNode();
}

/**
 * Parses one fixture, returning either a tree or the reason it could not be adapted.
 *
 * @param {string} file - absolute path to a .flix fixture.
 * @returns {{tree?: object, error?: string}} exactly one of the two is set.
 */
function parseFixture(file) {
  let out;
  try {
    out = execFileSync('tree-sitter', ['parse', file], {
      cwd: REPO, // the CLI resolves .flix to this grammar from the repository root
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // A parse error is still a tree: the CLI exits non-zero for files containing ERROR nodes, and
    // the negative fixtures exist precisely to exercise that. Only an empty result is a failure.
    out = e.stdout ?? '';
    if (!out) return {error: `tree-sitter parse produced no output: ${String(e.message).slice(0, 200)}`};
  }
  const tree = parseSExpression(out);
  if (!tree || !tree.kind) return {error: 'no root node in parse output'};
  return {tree};
}

/**
 * Adapts every flix-spec fixture and, unless --no-compare, runs the comparison.
 *
 * @param {string[]} argv - process.argv.
 * @returns {number} the process exit code.
 */
function main(argv) {
  const args = argv.slice(2);
  let specDir = process.env.FLIX_SPEC ?? '';
  let outDir = '';
  let compare = true;

  for (let n = 0; n < args.length; n += 1) {
    if (args[n] === '--out') outDir = args[n + 1], n += 1;
    else if (args[n] === '--no-compare') compare = false;
    else specDir = args[n];
  }

  if (!specDir) {
    console.error('error: no flix-spec directory given; pass one as $1 or set FLIX_SPEC');
    return 2;
  }
  specDir = resolve(specDir);
  const fixturesDir = join(specDir, 'fixtures');
  if (!existsSync(fixturesDir)) {
    console.error(`error: no fixtures/ under ${specDir} — is that a flix-spec checkout?`);
    return 2;
  }

  const out = outDir ? resolve(outDir) : join(REPO, 'build', 'flix-spec-actual');
  rmSync(out, {recursive: true, force: true});
  mkdirSync(out, {recursive: true});

  const fixtures = ['positive', 'negative']
    .flatMap((sub) =>
      readdirSync(join(fixturesDir, sub))
        .filter((f) => f.endsWith('.flix'))
        .map((f) => join(fixturesDir, sub, f)),
    )
    .sort();

  if (fixtures.length === 0) {
    console.error(`error: no .flix fixtures under ${fixturesDir}`);
    return 2;
  }

  const skipped = [];
  for (const file of fixtures) {
    const {tree, error} = parseFixture(file);
    if (error) {
      skipped.push(`${basename(file)}: ${error}`);
      continue;
    }
    // `source` must be flix-spec-relative: the comparison matches units by it, and the
    // source-invariants lane resolves it from the flix-spec root.
    const rel = file.slice(specDir.length + 1);
    // `raw`: our own tree, with our own wrappers and our own ERROR nodes intact. The comparison
    // applies conformance/projection-map.json's transparency rules itself, and it needs both lanes'
    // worth of information -- the structural lane splices our recovery markers out, the recovery
    // lane keeps them. Emitting anything pre-normalized would throw the second lane away.
    const doc = {
      schemaVersion: 2,
      generatedBy: 'tree-sitter-flix scripts/flix-spec-conformance.mjs',
      form: 'raw',
      units: [{source: rel, diagnostics: [], tree}],
    };
    writeFileSync(join(out, `${basename(file, '.flix')}.json`), `${JSON.stringify(doc, null, 1)}\n`);
  }

  const written = fixtures.length - skipped.length;
  console.log(`adapted ${written}/${fixtures.length} fixtures into ${out}`);
  for (const s of skipped) console.log(`  SKIPPED ${s}`);
  // An adapter that silently drops what it cannot read always flatters its own grammar. Every skip
  // is a measurement gap, so it is reported and it fails the run.
  if (skipped.length > 0) {
    console.error(`error: ${skipped.length} fixture(s) could not be adapted`);
    return 1;
  }
  if (!compare) return 0;

  const map = join(REPO, 'conformance', 'projection-map.json');
  const report = join(out, '..', 'flix-spec-report.json');
  const baselinePath = join(REPO, 'conformance', 'baseline.json');
  const baseline = existsSync(baselinePath) ?
    JSON.parse(readFileSync(baselinePath, 'utf8')) :
    {divergences: 0, recoveryDivergences: 0};

  console.log('');
  try {
    execFileSync(
      './gradlew',
      [
        '-q',
        ':tools:project:conformance',
        // Two ratchets, because there are two derived lanes and they measure different things.
        // Structure is closed one mapping at a time; error-recovery shape is a separate question a
        // grammar may never fully answer, and a single number would have let either hide the other.
        // Each lane also has a depth floor: divergences can fall simply because less of the tree is
        // compared, and the floor is what stops that from reading as progress.
        `--args=--actual ${out} --map ${map} --report ${report}` +
          ` --baseline ${baseline.divergences}` +
          ` --recovery-baseline ${baseline.recoveryDivergences ?? 0}` +
          ` --depth-floor ${baseline.depthFloor ?? 0}` +
          ` --recovery-depth-floor ${baseline.recoveryDepthFloor ?? 0}`,
      ],
      {cwd: specDir, encoding: 'utf8', stdio: 'inherit'},
    );
  } catch {
    console.error('');
    console.error('error: conformance regressed against conformance/baseline.json');
    console.error(
      `  baselines allow ${baseline.divergences} structural and ` +
      `${baseline.recoveryDivergences ?? 0} recovery divergences, at depth floors of ` +
      `${baseline.depthFloor ?? 0}% and ${baseline.recoveryDepthFloor ?? 0}%; see ${report}`,
    );
    return 1;
  }
  console.log('');
  console.log(`report: ${report}`);
  return 0;
}

process.exit(main(process.argv));
