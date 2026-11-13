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

describe('scanFunctionMetrics (CV-303)', () => {
  let scan;
  before(async () => { ({ scanFunctionMetrics: scan } = await import(join(AGENTS_DIR, 'four-layer-validate.mjs'))); });

  it('importing the module does not run the CLI and exports the scanner', () => {
    assert.equal(typeof scan, 'function');
  });

  it('60-line function -> lines 60; 5 params -> params 5', () => {
    const src = 'function big(a, b, c, d, e) {\n' + '  const x = 1;\n'.repeat(58) + '}\n';
    assert.deepEqual(scan(src), [{ name: 'big', startLine: 1, lines: 60, params: 5 }]);
  });

  it('nested arrows are counted separately, with names', () => {
    const r = scan('const outer = (x) => {\n  const inner = (y, z) => {\n    return x;\n  };\n  return inner;\n};\n');
    assert.deepEqual(r, [
      { name: 'outer', startLine: 1, lines: 6, params: 1 },
      { name: 'inner', startLine: 2, lines: 3, params: 2 },
    ]);
  });

  it('nested function declarations inside a function are found', () => {
    const r = scan('function a() {\n  function b(q) {\n    return q;\n  }\n}\n');
    assert.deepEqual(r.map(f => f.name), ['a', 'b']);
  });

  it('function expression and single-param arrow take the variable name', () => {
    const r = scan('const f = function (a, b) { return 1; };\nconst g = x => { return x; };\n');
    assert.deepEqual(r.map(f => [f.name, f.params]), [['f', 2], ['g', 1]]);
  });

  it('braces and parens inside strings, comments and templates are ignored', () => {
    const src = 'function s(a) {\n  const t = "}{)(";\n  // }\n  const u = `${a} }`;\n  return t + u;\n}\n';
    assert.deepEqual(scan(src), [{ name: 's', startLine: 1, lines: 6, params: 1 }]);
  });

  it('nested/default params and trailing commas count correctly; zero params is 0', () => {
    assert.equal(scan('function a({ x, y }, [p, q], cb = f(1, 2),) {}')[0].params, 3);
    assert.equal(scan('function z() {}')[0].params, 0);
  });

  it('expression-bodied arrows are not reported', () => {
    assert.deepEqual(scan('const k = (a) => a + 1;\n'), []);
  });
});

describe('four-layer Layer 3 — function metrics advisory (CV-304)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'fallback-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
    }));
  });

  function runWithAllowlist(glob) {
    const allowlistPath = join(TMP_PROJECT, 'defeat-allowlist.json');
    try {
      const out = execFileSync(process.execPath, [
        VALIDATOR, '--files', glob, '--json',
        '--allowlist', allowlistPath,
      ], {
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

  it('reports [fn-length] advisory for a function over 50 lines, exit 0', () => {
    writeFileSync(join(TMP_PROJECT, 'fixture-long.mjs'),
      'function bigFn(a, b) {\n' + '  const x = 1;\n'.repeat(55) + '}\n');
    const { code, report } = runValidator('fixture-long.mjs');
    assert.equal(code, 0, 'advisory-only findings must not fail');
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.ok(layer3.details.some(d => d.includes('[fn-length]') && d.includes('bigFn')), JSON.stringify(layer3.details));
  });

  it('reports [param-count] advisory for a function with over 4 params, exit 0', () => {
    writeFileSync(join(TMP_PROJECT, 'fixture-params.mjs'),
      'function manyParams(a, b, c, d, e, f) {\n  return a + b + c + d + e + f;\n}\n');
    const { code, report } = runValidator('fixture-params.mjs');
    assert.equal(code, 0, 'advisory-only findings must not fail');
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.ok(layer3.details.some(d => d.includes('[param-count]') && d.includes('manyParams')), JSON.stringify(layer3.details));
  });

  it('allowlisted file produces no [fn-length] or [param-count] advisory', () => {
    writeFileSync(join(TMP_PROJECT, 'fixture-allowlisted.mjs'),
      'function bigFn(a, b, c, d, e, f) {\n' + '  const x = 1;\n'.repeat(55) + '}\n');
    writeFileSync(join(TMP_PROJECT, 'defeat-allowlist.json'), JSON.stringify({
      'fn-length': ['fixture-allowlisted.mjs'],
      'param-count': ['fixture-allowlisted.mjs'],
    }));
    const { code, report } = runWithAllowlist('fixture-allowlisted.mjs');
    assert.equal(code, 0, 'allowlisted advisory must not fail');
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.ok(!layer3.details.some(d => d.includes('[fn-length]')), JSON.stringify(layer3.details));
    assert.ok(!layer3.details.some(d => d.includes('[param-count]')), JSON.stringify(layer3.details));
  });

  it('silent-fallback PLUS advisory still fails with [fn-length] in details', () => {
    writeFileSync(join(TMP_PROJECT, 'mixed.mjs'),
      'function bigFn(a, b) {\n' + '  const total = computeTotal(x) || 0;\n'.repeat(55) + '}\n');
    const { code, report } = runValidator('mixed.mjs');
    assert.equal(code, 1, 'blocking issue must still fail');
    const layer3 = report.layers.find(l => l.name.startsWith('Code'));
    assert.ok(layer3.details.some(d => d.includes('[fn-length]')), JSON.stringify(layer3.details));
    assert.ok(layer3.details.some(d => d.includes('silent-fallback')), JSON.stringify(layer3.details));
  });
});
