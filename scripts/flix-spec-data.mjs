import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/**
 * Fail if any path or byte differs from the private, verified extraction.
 *
 * @param {string} expected - Private verified data directory.
 * @param {string} actual - Caller-supplied extracted data directory.
 * @returns {void}
 */
export function assertDataDirectory(expected, actual) {
  const walk = (left, right) => {
    const l = lstatSync(left);
    const r = lstatSync(right);
    if (l.isDirectory() && r.isDirectory()) {
      const a = readdirSync(left).sort();
      const b = readdirSync(right).sort();
      if (a.length !== b.length || a.some((name, i) => name !== b[i])) throw Error('data directory paths differ');
      for (const name of a) walk(join(left, name), join(right, name));
    } else if (!l.isFile() || !r.isFile() || !readFileSync(left).equals(readFileSync(right))) {
      throw Error('data directory bytes differ');
    }
  };
  walk(expected, actual);
}

/**
 * Verify the exact artifact, compare its extraction and consume only that private copy.
 *
 * @param {string} supplied - Caller-supplied extraction.
 * @param {string} artifact - Published data JAR.
 * @param {string} sha256 - Pinned digest.
 * @param {Function} use - Work to run on the verified private extraction.
 * @returns {*} Callback result.
 */
export function withVerifiedData(supplied, artifact, sha256, use) {
  if (!artifact || !/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw Error('pinned data JAR and SHA-256 are required');
  const bytes = readFileSync(artifact);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw Error('data JAR SHA-256 differs from pinned artifact');
  const temp = mkdtempSync(join(tmpdir(), 'tree-sitter-spec-data-'));
  try {
    const archive = join(temp, 'data.jar');
    const data = join(temp, 'data');
    writeFileSync(archive, bytes, {mode: 0o600});
    mkdirSync(data);
    execFileSync('jar', ['xf', archive], {cwd: data, stdio: 'pipe'});
    assertDataDirectory(data, supplied);
    return use(data);
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
}
