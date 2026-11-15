import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {assertDataDirectory, withVerifiedData} from './flix-spec-data.mjs';

test('all source and reference bytes must match the verified archive extraction', () => {
  const root = mkdtempSync(join(tmpdir(), 'flix-data-test-'));
  const expected = join(root, 'verified');
  const actual = join(root, 'supplied');
  const files = ['fixtures/positive/val.flix', 'fixtures/expected/val.json', 'pin.json'];
  try {
    for (const base of [expected, actual]) {
      mkdirSync(join(base, 'fixtures/positive'), {recursive: true});
      mkdirSync(join(base, 'fixtures/expected'), {recursive: true});
      for (const name of files) writeFileSync(join(base, name), `content ${name}`);
    }
    assert.doesNotThrow(() => assertDataDirectory(expected, actual));
    for (const name of files) {
      const path = join(actual, name);
      const original = readFileSync(path);
      writeFileSync(path, 'changed');
      assert.throws(() => assertDataDirectory(expected, actual));
      writeFileSync(path, original);
    }
    rmSync(join(actual, files[0]));
    assert.throws(() => assertDataDirectory(expected, actual));
    writeFileSync(join(actual, files[0]), `content ${files[0]}`);
    writeFileSync(join(actual, 'fixtures/positive/extra.flix'), 'extra');
    assert.throws(() => assertDataDirectory(expected, actual));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});


test('missing and mismatched data artifacts cannot reach the consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'flix-data-artifact-test-'));
  const jar = join(root, 'data.jar');
  let called = false;
  const consume = () => {
    called = true;
  };
  try {
    writeFileSync(jar, 'not the pinned artifact');
    assert.throws(() => withVerifiedData(root, '', '0'.repeat(64), consume));
    assert.throws(() => withVerifiedData(root, jar, '0'.repeat(64), consume), /SHA-256/);
    assert.throws(() => withVerifiedData(root, join(root, 'missing.jar'), '0'.repeat(64), consume));
    assert.equal(called, false);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});


test('the consumer reads a private verified extraction rather than the supplied cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'flix-data-copy-test-'));
  const source = join(root, 'source');
  const supplied = join(root, 'supplied');
  const archive = join(root, 'data.jar');
  try {
    mkdirSync(source);
    mkdirSync(supplied);
    writeFileSync(join(source, 'fixture.flix'), 'original');
    execFileSync('jar', ['cf', archive, '-C', source, '.']);
    execFileSync('jar', ['xf', archive], {cwd: supplied});
    const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
    withVerifiedData(supplied, archive, digest, privateData => {
      assert.notEqual(privateData, supplied);
      writeFileSync(join(supplied, 'fixture.flix'), 'changed after verification');
      assert.equal(readFileSync(join(privateData, 'fixture.flix'), 'utf8'), 'original');
    });
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
