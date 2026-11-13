#!/usr/bin/env node
/**
 * Tests for .gitignore patterns in the framework repo.
 *
 * Run: node tests/gitignore.test.mjs
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gitignorePath = resolve(root, '.gitignore');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('.gitignore tests');

test('.gitignore contains agents/versions/ pattern', () => {
  const content = readFileSync(gitignorePath, 'utf8');
  assert(content.includes('agents/versions/'), '.gitignore must have agents/versions/ entry');
});

test('git check-ignore exits 0 for new paths under agents/versions/', () => {
  // Untracked paths under agents/versions/ must be ignored by git.
  // execFileSync with silent:true lets us check exit code via try/catch
  // (exits 0 = no match output = success; matches throw).
  const out = execFileSync('git', ['-C', root, 'check-ignore', '-q', 'agents/versions/2099-01-01/x'], { encoding: 'utf8', silent: true });
  assert(out === '', 'git check-ignore must have no output for ignored path');
});

test('already-tracked snapshot files remain tracked', () => {
  // Files added to git before the .gitignore entry must stay tracked.
  const out = execFileSync('git', ['-C', root, 'ls-files', 'agents/versions/'], { encoding: 'utf8' });
  assert(out.trim().length > 0, 'agents/versions/ must still have tracked files');
  assert(out.includes('sdlc-developer.md'), 'tracked developer snapshot must still be tracked');
});

test('new untracked files under agents/versions/ are ignored by git status', () => {
  // Create a temporary file and verify git status does not show it as untracked.
  const tmpFile = resolve(root, 'agents/versions/test-ignore-check.tmp');
  try {
    writeFileSync(tmpFile, 'test');
    const out = execFileSync('git', ['-C', root, 'status', '--porcelain', 'agents/versions/'], { encoding: 'utf8' });
    assert(!out.includes('test-ignore-check.tmp'), 'untracked file under agents/versions/ must not appear in git status');
  } finally {
    try { rmSync(tmpFile); } catch { /* best-effort cleanup — file may not exist */ }
  }
});

// Summary LAST
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`); process.exit(1); }