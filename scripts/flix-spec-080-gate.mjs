import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {basename, join} from 'node:path';
import {tmpdir} from 'node:os';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const lanes = ['oracle_conformance', 'recovery_conformance', 'diagnostic_conformance'];
const same = (a, b) => a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && a.every(x => b.includes(x));
const ids = lane => lane.divergences.map(d => `${d.fixture}|${d.path}|${d.reason}`);
/**
 *
 * @param {*} lane
 * @param {*} expected
 * @param {*} identities
 * @param {*} floor
 */
function checkLane(lane, expected, identities, floor) {
  if (!lane || lane.fixturesExpected !== expected || lane.fixturesCompared !== expected || !Array.isArray(lane.fixturesMissing) || lane.fixturesMissing.length || !Array.isArray(lane.divergences) || !same(ids(lane), identities)) throw Error('lane coverage or identities');
  if (floor !== null && (!Number.isInteger(lane.nodesExpected) || lane.nodesExpected <= 0 || !Number.isInteger(lane.nodesCompared) || Math.round(100 * lane.nodesCompared / lane.nodesExpected) !== lane.depthPercent || lane.depthPercent < floor)) throw Error('lane depth');
}
/**
 *
 * @param {*} root0
 * @param {*} root0.full
 * @param {*} root0.subset
 * @param {*} root0.fixtures
 * @param {*} root0.policy
 * @param {*} root0.accepted
 * @param {*} root0.historicalAccepted
 */
export function validateReports({full, subset, fixtures, policy, accepted, historicalAccepted}) {
  const expected = [...policy.oldFixtures, policy.addedFixture];
  if (!same(fixtures, expected)) throw Error('fixture partition');
  if (!full || !subset || full.schemaVersion !== 9 || subset.schemaVersion !== 9 || full.provenance.fixtureRevision !== accepted.fixtureRevision || full.provenance.pinCommit !== '0c641c73c4635dee992d01c4364f224ea56d9a46' || subset.provenance.pinCommit !== full.provenance.pinCommit || subset.provenance.fixtureRevision !== 'ba965a8489db14bf219158f9b46fa6a39097fd25a595142eb54762352b1477f9') throw Error('report provenance');
  if (full.lanes.source_invariants?.verdict !== 'pass' || subset.lanes.source_invariants?.verdict !== 'pass') throw Error('source invariants');
  for (const lane of lanes) {
    checkLane(full.lanes[lane], lane === 'recovery_conformance' ? 31 : 168, accepted.lanes[lane], lane === 'oracle_conformance' ? 95 : lane === 'recovery_conformance' ? 78 : null);
    checkLane(subset.lanes[lane], lane === 'recovery_conformance' ? 30 : 167, historicalAccepted.lanes[lane], lane === 'oracle_conformance' ? 95 : lane === 'recovery_conformance' ? 81 : null);
  }
  const added = {
    oracle_conformance: ['identifier__reserved-val.json|fixtures/negative/identifier__reserved-val.flix.Root[0]|kind', 'identifier__reserved-val.json|fixtures/negative/identifier__reserved-val.flix.Root[1]|kind'],
    recovery_conformance: ['identifier__reserved-val.json|fixtures/negative/identifier__reserved-val.flix.Root[0]|kind', 'identifier__reserved-val.json|fixtures/negative/identifier__reserved-val.flix|arity'],
    diagnostic_conformance: [],
  };
  for (const lane of lanes) if (!same(accepted.lanes[lane], [...historicalAccepted.lanes[lane], ...added[lane]])) throw Error('accepted identities changed');
  const unmapped = lane => lane.unmapped.map(x => `${x.name}|${x.count}`);
  const structure = ['argument|3', 'literal_pattern|2', 'associated_type_definition|1', 'debug_interpolation|1'];
  if (!same(unmapped(full.lanes.oracle_conformance), structure) || !same(unmapped(subset.lanes.oracle_conformance), structure)) throw Error('unmapped structure changed');
  if (!same(unmapped(full.lanes.diagnostic_conformance), ['tree-sitter.ParseError|31', 'tree-sitter.MisplacedDocComments|4']) || !same(unmapped(subset.lanes.diagnostic_conformance), ['tree-sitter.ParseError|30', 'tree-sitter.MisplacedDocComments|4'])) throw Error('unmapped diagnostics changed');
  if (subset.lanes.recovery_conformance.nodesExpected !== 351) throw Error('historic recovery denominator changed');
}
/**
 *
 * @param {*} root0
 * @param {*} root0.run
 * @param {*} root0.validate
 */
export function executeGate({run, validate}) {
  const full = run('full');
  if (!full || full.status !== 0 || !full.report) throw Error('full comparison missing or failed');
  const subset = run('subset');
  if (!subset || subset.status !== 0 || !subset.report) throw Error('subset comparison missing or failed');
  validate(full.report, subset.report);
}
// Source checks call this only after projecting all 168 fixtures. Both runner exits are required.
/**
 *
 * @param {*} root0
 * @param {*} root0.spec
 * @param {*} root0.actual
 * @param {*} root0.runner
 * @param {*} root0.map
 * @param {*} root0.acceptedPath
 * @param {*} root0.historicalAcceptedPath
 * @param {*} root0.policyPath
 * @param {*} root0.reportDir
 * @param {*} root0.java
 */
export function comparePublished({spec, actual, runner, map, acceptedPath, historicalAcceptedPath, policyPath, reportDir, java='java'}) {
  const policy = json(policyPath); const accepted = json(acceptedPath); const historicalAccepted = json(historicalAcceptedPath);
  const fixtures = readdirSync(actual).filter(x => x.endsWith('.json')).sort();
  if (!same(fixtures, [...policy.oldFixtures, policy.addedFixture])) throw Error('fixture partition');
  const temp = mkdtempSync(join(tmpdir(), 'tree-sitter-spec-subset-'));
  try {
    const selected = join(temp, 'spec'); const projected = join(temp, 'actual');
    mkdirSync(selected); mkdirSync(projected);
    cpSync(join(spec, 'pin.json'), join(selected, 'pin.json'));
    for (const dir of ['ast', 'profiles', 'schemas', 'defects', 'corpus']) if (existsSync(join(spec, dir))) cpSync(join(spec, dir), join(selected, dir), {recursive: true});
    for (const sub of ['positive', 'negative']) {
      const dir = join(spec, 'fixtures', sub);
      for (const name of readdirSync(dir).filter(n => n.endsWith('.flix'))) {
        const stem=basename(name, '.flix');
        if (!policy.oldFixtures.includes(`${stem}.json`)) continue;
        const target=join(selected, 'fixtures', sub); mkdirSync(target, {recursive: true}); cpSync(join(dir, name), join(target, name));
        for (const form of ['expected', 'raw']) {
          const dest=join(selected, 'fixtures', form); mkdirSync(dest, {recursive: true}); cpSync(join(spec, 'fixtures', form, `${stem}.json`), join(dest, `${stem}.json`));
        }
        cpSync(join(actual, `${stem}.json`), join(projected, `${stem}.json`));
      }
    }
    if (!same(readdirSync(projected), policy.oldFixtures)) throw Error('subset input coverage');
    executeGate({
      run: lane => {
        const isFull=lane==='full'; const report=join(reportDir, `flix-spec-${lane}-report.json`);
        rmSync(report, {force: true});
        const args=['-jar', runner, '--spec-root', isFull?spec:selected, '--source-root', isFull?spec:selected, '--actual', isFull?actual:projected, '--map', map, '--report', report, '--baseline', isFull?'42':'40', '--recovery-baseline', isFull?'32':'30', '--diagnostic-baseline', '1', '--depth-floor', '95', '--recovery-depth-floor', isFull?'78':'81'];
        if (isFull) args.push('--accepted', acceptedPath);
        try {
          execFileSync(java, args, {stdio: 'inherit'});
        } catch (error) {
          return {status: error.status ?? 2};
        }
        return {status: 0, report: existsSync(report)?json(report):null};
      },
      validate: (full, subset)=>validateReports({full, subset, fixtures, policy, accepted, historicalAccepted}),
    });
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
}
