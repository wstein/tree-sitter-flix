import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {attachComments, comparisonArgs, inputMismatches, metricSchemaMatches, parseSExpression} from './flix-spec-conformance.mjs';

test('depth floor is tied to its metric schema and unchanged reference denominator', () => {
  const baseline = JSON.parse(readFileSync(new URL('../conformance/baseline.json', import.meta.url), 'utf8'));
  const lane = baseline.lanes.oracle_conformance;
  assert.equal(baseline.depthFloor, Math.round(100 * lane.nodesCompared / lane.nodesExpected));
  assert.ok(metricSchemaMatches({schemaVersion: baseline.measuredAt.reportSchemaVersion}, baseline));
  assert.equal(metricSchemaMatches({schemaVersion: baseline.measuredAt.reportSchemaVersion - 1}, baseline), false);
  assert.equal(metricSchemaMatches({}, {}), false);
});

test('standalone runner arguments retain paths and existing ratchets', () => {
  const args = comparisonArgs('/tmp/actual with spaces', '/tmp/map.json', '/tmp/report.json', {
    divergences: 46, recoveryDivergences: 34, diagnosticDivergences: 2, depthFloor: 95, recoveryDepthFloor: 79,
  });
  const options = Object.fromEntries(Array.from({length: args.length / 2}, (_, i) => [args[2 * i], args[2 * i + 1]]));
  assert.equal(options['--actual'], '/tmp/actual with spaces');
  assert.equal(options['--baseline'], '46');
  assert.equal(options['--depth-floor'], '95');
  assert.equal(options['--recovery-depth-floor'], '79');
});

test('extracted bundles need no Gradle files and still enforce pin identity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flix-spec-consumer-'));
  const pin = {upstream: {tag: 'v0.77.0', commit: 'abc'}, treeKindDigest: 'tree', tokenKindDigest: 'token'};
  const baseline = {flixSpecArtifact: '0.77.2', flixSpecPin: 'v0.77.0', flixSpecPinCommit: 'abc',
    treeKindDigest: 'tree', tokenKindDigest: 'token'};
  try {
    writeFileSync(join(dir, 'pin.json'), JSON.stringify(pin));
    assert.deepEqual(inputMismatches(dir, baseline, '0.77.2'), []);
    assert.equal(inputMismatches(dir, baseline, '0.77.4').length, 1);
    pin.upstream.commit = 'changed';
    writeFileSync(join(dir, 'pin.json'), JSON.stringify(pin));
    assert.match(inputMismatches(dir, baseline, '0.77.2')[0], /flixSpecPinCommit/);
  } finally {
    rmSync(dir, {recursive: true});
  }
});

test('adapter still emits its native named-node structure', () => {
  assert.deepEqual(parseSExpression('(source_file [0, 0] - [0, 1] (name_lower [0, 0] - [0, 1]))'), {
    kind: 'source_file', children: [{kind: 'name_lower', children: []}],
  });
});

// Canonical 0.79 comments are concrete syntax nodes, never transparency wrappers.
test('Flix 0.79 comment mappings retain both comment kinds', () => {
  const map = JSON.parse(readFileSync(new URL('../conformance/projection-map.json', import.meta.url), 'utf8'));
  for (const native of ['line_comment', 'block_comment']) {
    assert.equal(map.mappings[native], 'PlainComment');
    assert.ok(!map.ignored.includes(native));
  }
  assert.equal(map.mappings.doc_comment, 'DocComment');
  assert.ok(!map.ignored.includes('doc_comment'));
  for (const key of ['elide', 'flattenCanonical']) {
    assert.ok(!map[key].some(kind => ['CommentList', 'Doc', 'PlainComment', 'DocComment'].includes(kind)));
  }
});

test('comments attach only from leading documentation runs and misplaced docs reject', () => {
  const node = (kind, row, col = 0) => ({kind, children: [], position: {row, col}});
  const declaration = node('function_declaration', 3);
  declaration.children.push(node('name_lower', 3, 4));
  const tree = {kind: 'source_file', children: [node('line_comment', 0),
    node('doc_comment', 1), node('line_comment', 2), declaration]};
  const diagnostics = attachComments(tree, '// plain\n/// docs\n//// also docs\ndef f(): Int32 = 1\n');
  assert.equal(diagnostics.length, 0);
  assert.deepEqual(tree.children.map(n => n.kind), ['plain_comment', 'function_declaration']);
  assert.deepEqual(declaration.children.map(n => n.kind), ['doc_comment', 'name_lower']);
  for (const [source, row, col] of [['def f(): Int32 = 1 /// bad', 0, 19],
    ['def f(): Int32 = 1\n/// orphan', 1, 0]]) {
    const orphan = {kind: 'source_file', children: [node('doc_comment', row, col)]};
    assert.equal(attachComments(orphan, source).length, 1);
    assert.equal(orphan.children[0].kind, 'plain_comment');
  }
});

test('trailing docs cannot document a following declaration, including CRLF', () => {
  for (const newline of ['\n', '\r\n']) {
    const tree = parseSExpression('(source_file [0, 0] - [2, 0] (doc_comment [0, 19] - [0, 26]) (function_declaration [1, 0] - [1, 18]))', true);
    const diagnostics = attachComments(tree, `def f(): Int32 = 1 /// bad${newline}def g(): Int32 = 2`);
    assert.equal(diagnostics.length, 1);
    assert.equal(tree.children[0].kind, 'plain_comment');
    assert.deepEqual(tree.children[1].children, []);
  }
});
