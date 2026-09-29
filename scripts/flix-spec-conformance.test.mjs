import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {comparisonArgs, inputMismatches, metricSchemaMatches, parseSExpression} from './flix-spec-conformance.mjs';

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
