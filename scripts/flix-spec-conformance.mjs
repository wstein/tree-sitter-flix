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
//   scripts/flix-spec-conformance.mjs --remeasure   # measure a flix-spec the baseline doesn't record
//
// Exits non-zero when a fixture cannot be adapted, when the comparison reports a regression
// against `conformance/baseline.json`, when the flix-spec checkout is not the one the baseline was
// measured against (pin, artifact version, vocabulary digests, fixture revision), or when the
// grammar still reserves a keyword flix-spec's `ast/retired.json` lists.
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
export function parseSExpression(text) {
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
 * The diagnostic this adapter reports for a unit it rejects, or none.
 *
 * Only parse-phase evidence counts: an ERROR node, a MISSING node, or one of this grammar's own
 * recovery markers. flix-spec's canonical diagnostics are `lexerErrors ++ parserErrors` and nothing
 * later -- its docs/CONFORMANCE.md calls Weeder2 errors out of scope by construction -- so a
 * validation-level check written into this output would add a diagnostic the reference side cannot
 * have, and break agreement on exactly the negative fixtures the lane exists to measure. Keep any
 * such check out of the projection.
 *
 * One diagnostic per unit, at the first marker: nested and adjacent ERROR nodes would otherwise
 * over-count a single rejection. The kind is our own name, not the reference's, and no
 * `diagnosticMappings` translates it, so the lane compares accept/reject only -- an ERROR spans the
 * recovery region rather than the reference's error token, so kind and line would not be a fair
 * comparison.
 *
 * @param {string} text - `tree-sitter parse` output for one file.
 * @param {string[]} markers - node kinds that mark a rejection.
 * @returns {object[]} zero or one diagnostic.
 */
function diagnosticsOf(text, markers) {
  // The whole output, not just the tree: tree-sitter's dump omits an anonymous MISSING token
  // (`(MISSING ")" [1, 12] - [1, 12])`) and reports it only on the per-file summary line, so a
  // quoted token name, possibly a parenthesis, may stand between the marker and its position.
  const pattern = new RegExp(
    `\\((${markers.join('|')})\\b(?:"(?:[^"\\\\]|\\\\.)*"|[^()\\["])*\\[(\\d+), (\\d+)\\]`,
    'g',
  );
  let first = null;
  for (const m of text.matchAll(pattern)) {
    const at = {kind: m[1], row: Number(m[2]), col: Number(m[3])};
    if (!first || at.row < first.row || (at.row === first.row && at.col < first.col)) first = at;
  }
  if (!first) return [];
  return [{
    kind: 'tree-sitter.ParseError',
    line: first.row + 1,
    col: first.col + 1,
    message: `${first.kind} node`,
  }];
}

/**
 * Checks that the flix-spec checkout is the one `conformance/baseline.json` was measured against.
 *
 * A moving commit says *that* the reference changed, never *what* changed -- which is how `law` and
 * `lawful` went stale here unnoticed. So the vocabulary digests are asserted too, not just the pin.
 *
 * @param {string} specDir - the flix-spec checkout.
 * @param {object} measuredAt - `baseline.measuredAt`.
 * @param {string} [artifactVersion] - Maven version of an extracted bundle.
 * @returns {string[]} one line per mismatch; empty when the inputs agree.
 */
export function inputMismatches(specDir, measuredAt, artifactVersion) {
  const pin = JSON.parse(readFileSync(join(specDir, 'pin.json'), 'utf8'));
  const propsPath = join(specDir, 'gradle.properties');
  const version = artifactVersion ?? (existsSync(propsPath) ?
    /^version=(.+)$/m.exec(readFileSync(propsPath, 'utf8'))?.[1]?.trim() : undefined);
  const expected = [
    ['flixSpecArtifact', version],
    ['flixSpecPin', pin.upstream?.tag],
    ['flixSpecPinCommit', pin.upstream?.commit],
    ['treeKindDigest', pin.treeKindDigest],
    ['tokenKindDigest', pin.tokenKindDigest],
  ];
  return expected
    .filter(([key, actual]) => measuredAt[key] !== actual)
    .map(([key, actual]) => `${key}: baseline has ${measuredAt[key]}, checkout has ${actual}`);
}

/**
 * Keywords this grammar still reserves although the reference has retired them.
 *
 * flix-spec's `ast/retired.json` records removed vocabulary. A retired `Keyword*` TokenKind that is
 * still a literal token in `src/grammar.json` is the `law`/`lawful` class of staleness: a keyword
 * that is now an ordinary name.
 *
 * @param {string} specDir - the flix-spec checkout.
 * @returns {string[]} the stale keywords; empty when there are none or flix-spec predates the file.
 */
function staleKeywords(specDir) {
  const retiredPath = join(specDir, 'ast', 'retired.json');
  if (!existsSync(retiredPath)) return [];
  const retired = JSON.parse(readFileSync(retiredPath, 'utf8')).retired ?? [];
  const words = retired
    .filter((r) => r.vocabulary === 'TokenKind' && r.name.startsWith('Keyword'))
    .map((r) => r.name.slice('Keyword'.length).toLowerCase());
  const strings = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (node.type === 'STRING') strings.add(node.value);
      Object.values(node).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(join(REPO, 'src', 'grammar.json'), 'utf8')).rules);
  return words.filter((w) => strings.has(w));
}

/**
 * Parses one fixture, returning either a tree or the reason it could not be adapted.
 *
 * @param {string} file - absolute path to a .flix fixture.
 * @returns {{tree?: object, raw?: string, error?: string}} `error`, or `tree` with its `raw` text.
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
  return {tree, raw: out};
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
  let remeasure = false;
  let runner = process.env.FLIX_SPEC_RUNNER ?? '';
  let artifactVersion = process.env.FLIX_SPEC_VERSION;

  for (let n = 0; n < args.length; n += 1) {
    if (args[n] === '--out') outDir = args[n + 1], n += 1;
    else if (args[n] === '--runner') runner = args[n + 1], n += 1;
    else if (args[n] === '--spec-version') artifactVersion = args[n + 1], n += 1;
    else if (args[n] === '--no-compare') compare = false;
    // Measuring a flix-spec release the baseline does not record yet -- the first step of every
    // migration. The input checks still run, but report instead of refusing.
    else if (args[n] === '--remeasure') remeasure = true;
    else specDir = args[n];
  }

  if (!specDir) {
    console.error('error: no flix-spec directory given; pass one as $1 or set FLIX_SPEC');
    return 2;
  }
  specDir = resolve(specDir);
  if (compare && (!runner || !existsSync(runner))) {
    console.error('error: provide the executable runner jar with --runner or FLIX_SPEC_RUNNER');
    return 2;
  }
  if (runner) runner = resolve(runner);
  const fixturesDir = join(specDir, 'fixtures');
  if (!existsSync(fixturesDir)) {
    console.error(`error: no fixtures/ under ${specDir} — is that a flix-spec checkout?`);
    return 2;
  }

  const baselinePath = join(REPO, 'conformance', 'baseline.json');
  const baseline = existsSync(baselinePath) ?
    JSON.parse(readFileSync(baselinePath, 'utf8')) :
    {divergences: 0, recoveryDivergences: 0, measuredAt: {}};
  const map = join(REPO, 'conformance', 'projection-map.json');
  const markers = [...JSON.parse(readFileSync(map, 'utf8')).recoveryMarkers ?? ['ERROR'], 'MISSING'];

  // The numbers in baseline.json answer a question about one flix-spec release; measured against
  // another they answer a different one. Refuse rather than compare the two.
  const mismatches = inputMismatches(specDir, baseline.measuredAt ?? {}, artifactVersion);
  if (mismatches.length > 0) {
    const say = remeasure ? console.log : console.error;
    say(`${remeasure ? 'note' : 'error'}: ${specDir} is not the flix-spec checkout ` +
      'conformance/baseline.json was measured against:');
    for (const m of mismatches) say(`  ${m}`);
    if (!remeasure) {
      console.error(`  check out flix-spec tag v${baseline.measuredAt?.flixSpecArtifact} (flixSpecPin names the ` +
        'Flix tag flix-spec pins, not a flix-spec tag), or pass --remeasure to measure a new release');
      return 2;
    }
  }
  const stale = staleKeywords(specDir);
  if (stale.length > 0) {
    console.error(`error: grammar.js still reserves keyword(s) the reference has retired: ${stale.join(', ')}`);
    console.error('  see ast/retired.json in flix-spec');
    return 1;
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
    const {tree, raw, error} = parseFixture(file);
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
      units: [{source: rel, diagnostics: diagnosticsOf(raw, markers), tree}],
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

  const report = join(out, '..', 'flix-spec-report.json');
  const html = join(out, '..', 'flix-spec-report.html');
  rmSync(report, {force: true});
  rmSync(html, {force: true});

  console.log('');
  let status = 0;
  try {
    execFileSync(
      'java',
      [
        '-jar', runner,
        '--spec-root', specDir, '--source-root', specDir,
        // Two ratchets, because there are two derived lanes and they measure different things.
        // Structure is closed one mapping at a time; error-recovery shape is a separate question a
        // grammar may never fully answer, and a single number would have let either hide the other.
        // Each lane also has a depth floor: divergences can fall simply because less of the tree is
        // compared, and the floor is what stops that from reading as progress.
        ...comparisonArgs(out, map, report, baseline),
      ],
      {cwd: REPO, encoding: 'utf8', stdio: 'inherit'},
    );
  } catch (error) {
    status = error.status === 1 ? 1 : 2;
    console.error('');
    console.error(status === 1 ? 'error: conformance regressed against conformance/baseline.json' :
      'error: runner input/execution failure (not a parser regression)');
    console.error(
      `  baselines allow ${baseline.divergences} structural and ` +
      `${baseline.recoveryDivergences ?? 0} recovery and ` +
      `${baseline.diagnosticDivergences ?? 0} diagnostic divergences, at depth floors of ` +
      `${baseline.depthFloor ?? 0}% and ${baseline.recoveryDepthFloor ?? 0}%; see ${report}`,
    );
  }
  if (!existsSync(report)) return status || 2;
  try {
    execFileSync('java', ['-jar', runner, 'render', '--report', report, '--html', html],
      {cwd: REPO, stdio: 'inherit'});
  } catch {
    console.error('error: HTML rendering failed; JSON report is preserved');
    return 2;
  }
  // flix-spec computes the fixture revision itself, so it can only be checked after the run.
  const revision = JSON.parse(readFileSync(report, 'utf8')).provenance?.fixtureRevision;
  const recorded = baseline.measuredAt?.fixtureRevision;
  if (revision !== recorded) {
    const say = remeasure ? console.log : console.error;
    say(`${remeasure ? 'note' : 'error'}: fixtureRevision ${revision} differs from the baseline's ${recorded}`);
    if (!remeasure) return 1;
  }
  console.log('');
  console.log(`report: ${report}`);
  console.log(`HTML: ${html}`);
  return status;
}

/**
 * Keeps paths as individual arguments: no Gradle --args string or shell quoting involved.
 *
 * @param {string} out - Adapter output directory.
 * @param {string} map - Consumer map path.
 * @param {string} report - JSON report path.
 * @param {object} baseline - Consumer-owned ratchets.
 * @returns {string[]} Runner comparison arguments.
 */
export function comparisonArgs(out, map, report, baseline) {
  return ['--actual', out, '--map', map, '--report', report,
    '--baseline', String(baseline.divergences ?? 0),
    '--recovery-baseline', String(baseline.recoveryDivergences ?? 0),
    '--diagnostic-baseline', String(baseline.diagnosticDivergences ?? 0),
    '--depth-floor', String(baseline.depthFloor ?? 0),
    '--recovery-depth-floor', String(baseline.recoveryDepthFloor ?? 0)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv));
