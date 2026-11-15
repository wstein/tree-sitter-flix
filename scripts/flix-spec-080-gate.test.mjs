import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReports, executeGate} from './flix-spec-080-gate.mjs';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const full = read('../test/fixtures/spec-080-full.json');
const subset = read('../test/fixtures/spec-080-subset.json');
const policy = read('../conformance/recovery-partition-080.json');
const accepted = read('../conformance/accepted-080.json');
const historicalAccepted = read('../conformance/accepted.json');
const fixtures = [...policy.oldFixtures, policy.addedFixture];
const setup = () => ({full: structuredClone(full), subset: structuredClone(subset), fixtures: [...fixtures], policy, accepted, historicalAccepted});
test('actual full and historic subset reports validate together', () => assert.doesNotThrow(() => validateReports(setup())));
test('missing, duplicated and added fixture fail closed', () => {
  for (const items of [fixtures.slice(1), [...fixtures, fixtures[0]], [...fixtures, 'other.json']]) {
    const x=setup(); x.fixtures=items; assert.throws(()=>validateReports(x));
  }
});
test('subset missing, low floor and unexpected divergence fail', () => {
  for (const f of [x=>x.subset=null, x=>{
    x.subset.lanes.recovery_conformance.depthPercent=80; x.subset.lanes.recovery_conformance.nodesCompared=281;
  }, x=>{
    x.subset.lanes.recovery_conformance.nodesExpected=350; x.subset.lanes.recovery_conformance.nodesCompared=284;
  }, x=>x.subset.lanes.recovery_conformance.divergences.pop(), x=>x.subset.lanes.recovery_conformance.fixturesMissing.push('x')]) {
    const x=setup(); f(x); assert.throws(()=>validateReports(x));
  }
});
test('full lane mutations and identity changes fail', () => {
  for (const f of [x=>x.full.lanes.oracle_conformance.divergences.pop(), x=>x.full.lanes.recovery_conformance.divergences.push(x.full.lanes.recovery_conformance.divergences[0]), x=>x.full.lanes.diagnostic_conformance.fixturesCompared--, x=>x.full.provenance.fixtureRevision='changed']) {
    const x=setup(); f(x); assert.throws(()=>validateReports(x));
  }
});
test('a failing or skipped runner never passes', () => {
  for (const fail of ['full', 'subset']) {
    const calls=[]; assert.throws(()=>executeGate({run: lane=>{
      calls.push(lane); return lane===fail?{status: 1}: {status: 0, report: {}};
    }, validate: ()=>{}})); assert.ok(calls.includes(fail));
  }
});
test('accepted set and unmapped kind changes cannot widen the owner exception', () => {
  for (const change of [x=>x.accepted.lanes.oracle_conformance.push('new|path|kind'), x=>x.full.lanes.oracle_conformance.unmapped[0].name='other', x=>x.full.lanes.diagnostic_conformance.unmapped[0].count++]) {
    const x=setup(); x.accepted=structuredClone(x.accepted); change(x); assert.throws(()=>validateReports(x));
  }
});

test('subset fixture revision is pinned', () => {
  const x=setup(); x.subset.provenance.fixtureRevision='changed'; assert.throws(()=>validateReports(x));
});

test('source invariant failure does not pass', () => {
  const x=setup(); x.full.lanes.source_invariants.verdict='fail'; assert.throws(()=>validateReports(x));
});
