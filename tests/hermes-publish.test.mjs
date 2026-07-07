#!/usr/bin/env node
/**
 * Unit tests for hermes-publish.mjs — human-gated sandbox→local promotion.
 * Usage: node tests/hermes-publish.test.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SDLC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}: ${err.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
function assertEqual(a, e, m) { if (a !== e) throw new Error(m || `Expected ${e}, got ${a}`); }
function assertThrows(fn, re, m) {
  try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error(`wrong error: ${e.message}`); return; }
  throw new Error(m || 'expected a throw');
}

// --- temp sandbox, wired BEFORE import ---
const base = mkdtempSync(join(tmpdir(), 'hp-sandbox-'));
const outside = mkdtempSync(join(tmpdir(), 'hp-outside-'));
const wsDir = join(base, 'docker', 'default', 'workspace');
const homeDir = join(base, 'docker', 'default', 'home');
mkdirSync(wsDir, { recursive: true });
mkdirSync(homeDir, { recursive: true });
writeFileSync(join(wsDir, 'tool.sh'), '#!/usr/bin/env bash\necho hi\n');
writeFileSync(join(homeDir, 'note.txt'), 'plain text, not a script\n');
writeFileSync(join(outside, 'secret.txt'), 'do not promote me\n');

process.env.HERMES_SANDBOX_BASE = base;
const hp = await import(resolve(SDLC_ROOT, 'agents/hermes-publish.mjs'));

const dest = mkdtempSync(join(tmpdir(), 'hp-dest-'));

console.log('\n📋 hermes-publish: resolve + sandbox guard');
test('resolveSource finds a file in workspace/', () => {
  assertEqual(hp.resolveSource('tool.sh'), join(wsDir, 'tool.sh'));
});
test('resolveSource falls back to home/', () => {
  assertEqual(hp.resolveSource('note.txt'), join(homeDir, 'note.txt'));
});
test('resolveSource throws when not found', () => {
  assertThrows(() => hp.resolveSource('nope.sh'), /not found/);
});
test('isInSandbox accepts inside, rejects outside', () => {
  assert(hp.isInSandbox(join(wsDir, 'tool.sh')), 'inside should pass');
  assert(!hp.isInSandbox(join(outside, 'secret.txt')), 'outside should fail');
});
test('resolveSource refuses an absolute path outside the sandbox zone', () => {
  assertThrows(() => hp.resolveSource(join(outside, 'secret.txt')), /outside the sandbox/);
});

console.log('\n📋 hermes-publish: publish');
test('publish copies content to a dest file', () => {
  const target = join(dest, 'sub', 'tool.sh');
  const r = hp.publish('tool.sh', target, {});
  assertEqual(r.dest, target);
  assert(existsSync(target), 'file written');
  assertEqual(readFileSync(target, 'utf8'), '#!/usr/bin/env bash\necho hi\n');
});
test('publish into an existing dir appends the basename', () => {
  const r = hp.publish('tool.sh', dest, {});
  assertEqual(r.dest, join(dest, 'tool.sh'));
});
test('publish sets 0755 on a shebang script', () => {
  const r = hp.publish('tool.sh', join(dest, 'exec-tool'), {});
  assertEqual((statSync(r.dest).mode & 0o777), 0o755, 'script should be executable');
});
test('publish keeps a plain file non-executable', () => {
  const r = hp.publish('note.txt', join(dest, 'note-copy.txt'), {});
  assert((statSync(r.dest).mode & 0o111) === 0, 'plain file should not be executable');
});
test('publish reports overwrote on an existing target', () => {
  const t = join(dest, 'twice.sh');
  hp.publish('tool.sh', t, {});
  const r = hp.publish('tool.sh', t, {});
  assert(r.overwrote, 'second publish should report overwrote');
});
test('publish refuses a source outside the sandbox', () => {
  assertThrows(() => hp.publish(join(outside, 'secret.txt'), join(dest, 'x'), {}), /outside the sandbox/);
});

// cleanup
try { for (const d of [base, outside, dest]) rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
