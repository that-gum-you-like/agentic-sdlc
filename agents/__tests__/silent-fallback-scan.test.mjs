/**
 * silent-fallback-scan.test.mjs — Curriculum Ph5: the `.get(x, 0)` / `|| 0`
 * silent-default fallback class (the NaN Fallback Disaster) must be caught
 * by four-layer Layer 3, without needing the TypeScript compiler.
 *
 * Runs the validator CLI in a subprocess against fixture files.
 *
 * Run with:
 *   node --test agents/__tests__/silent-fallback-scan.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const VALIDATOR = join(AGENTS_DIR, 'four-layer-validate.mjs');
const TMP_PROJECT = join(tmpdir(), `sdlc-fallback-scan-test-${process.pid}`);

function runValidator(glob) {
  try {
    const out = execFileSync(process.execPath, [VALIDATOR, '--files', glob, '--json'], {
      encoding: 'utf8',
      cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });
    return { code: 0, report: JSON.parse(out) };
  } catch (err) {
    let report = null;
    try { report = JSON.parse(String(err.stdout || '')); } catch { /* non-JSON */ }
    return { code: err.status, report, raw: String(err.stdout || '') };
  }
}

describe('four-layer Layer 3 — silent-default fallback scan (curriculum Ph5)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'fallback-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
    }));
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('FAILS a computed value silently defaulted to zero (|| 0)', () => {
    writeFileSync(join(TMP_PROJECT, 'bad-zero.mjs'),
      'export function price(cart) {\n  const total = computeTotal(cart) || 0;\n  return total;\n}\n');
    const { code, report } = runValidator('bad-zero.mjs');
    assert.equal(code, 1, 'silent zero fallback must fail validation');
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.equal(layer3.status, 'fail');
    assert.ok(layer3.details.some(d => d.includes('silent-fallback') && d.includes('bad-zero.mjs')), JSON.stringify(layer3.details));
  });

  it('FAILS a catch that swallows the error into an empty default', () => {
    writeFileSync(join(TMP_PROJECT, 'bad-catch.mjs'),
      'export function load() {\n  try { return realLoad(); } catch { return []; }\n}\n');
    const { code, report } = runValidator('bad-catch.mjs');
    assert.equal(code, 1);
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.ok(layer3.details.some(d => d.includes('error swallowed')), JSON.stringify(layer3.details));
  });

  it('PASSES legitimate defaults that are not computed-value fallbacks', () => {
    writeFileSync(join(TMP_PROJECT, 'ok.mjs'), [
      "export function pick(opts = {}) {",
      "  const retries = opts.retries || 0; // config default — fine",
      "  const nullable = maybeFind() ?? null; // explicit null, not a silent zero",
      "  return { retries, nullable };",
      "}",
      "",
    ].join('\n'));
    const { code, report } = runValidator('ok.mjs');
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.ok(!layer3.details.some(d => d.includes('silent-fallback')), JSON.stringify(layer3.details));
    assert.equal(code, 0, 'legit defaults must not fail');
  });

  it('ignores test files (fixtures may exercise the pattern deliberately)', () => {
    writeFileSync(join(TMP_PROJECT, 'thing.test.mjs'),
      'const total = computeTotal(x) || 0;\n');
    const { code } = runValidator('thing.test.mjs');
    assert.equal(code, 0);
  });
});
