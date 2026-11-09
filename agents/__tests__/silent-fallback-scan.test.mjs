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

describe('scanFunctionMetrics — function metric scanning (CV-303)', () => {
  it('60-line function declares lines=60 and 5 params', async () => {
    const { scanFunctionMetrics } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    let src = 'function bigOne(a, b, c, d, e) {\n';
    for (let i = 0; i < 58; i++) src += '  const x = ' + i + ';\n';
    src += '}\n';
    const r = scanFunctionMetrics(src);
    assert.equal(r.length, 1);
    assert.equal(r[0].lines, 60);
    assert.equal(r[0].params, 5);
    assert.equal(r[0].name, 'bigOne');
  });

  it('5-param function returns params=5', async () => {
    const { scanFunctionMetrics } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    const r = scanFunctionMetrics('function manyParams(a, b, c, d, e) { return a + b + c + d + e; }\n');
    assert.equal(r.length, 1);
    assert.equal(r[0].params, 5);
  });

  it('nested arrow functions are counted separately', async () => {
    const { scanFunctionMetrics } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    const r = scanFunctionMetrics(
      'const outer = (x) => {\n  const inner = (y) => {\n    return x + y;\n  };\n  return inner(x);\n};\n'
    );
    assert.equal(r.length, 2, 'should detect both outer and inner arrows');
    const outer = r.find(f => f.name === 'outer');
    const inner = r.find(f => f.name === 'inner');
    assert.ok(outer, 'outer arrow should have name: outer');
    assert.ok(inner, 'inner arrow should have name: inner');
    assert.equal(outer.params, 1);
    assert.equal(inner.params, 1);
    assert.equal(outer.startLine, 1);
    assert.equal(inner.startLine, 2);
  });

  it('importing four-layer-validate.mjs does not run CLI', async () => {
    const mod = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    assert.equal(typeof mod.scanFunctionMetrics, 'function');
  });

  it('empty source returns empty array', async () => {
    const { scanFunctionMetrics } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    assert.deepEqual(scanFunctionMetrics(''), []);
  });

  it('named function expression uses the inner name', async () => {
    const { scanFunctionMetrics } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    const r = scanFunctionMetrics('const f = function add(x, y) {\n  return x + y;\n};\n');
    assert.equal(r.length, 1);
    assert.equal(r[0].name, 'add');
    assert.equal(r[0].params, 2);
  });

  it('async function declaration', async () => {
    const { scanFunctionMetrics } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'));
    const r = scanFunctionMetrics('async function fetchData(url) {\n  const res = await fetch(url);\n  return res.json();\n}\n');
    assert.equal(r.length, 1);
    assert.equal(r[0].name, 'fetchData');
    assert.equal(r[0].params, 1);
  });
});