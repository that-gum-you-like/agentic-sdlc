#!/usr/bin/env node
/**
 * Unit tests for hermes-git-push.mjs (hermes-github-write-access).
 *
 * Usage: node tests/hermes-git-push.test.mjs
 *
 * Covers REQ-001..REQ-005: allowlist gate (fail closed), protected-branch /
 * namespace guard, token discovery + redaction, commit->push->draft-PR
 * pipeline with injected fake git + fetch, no-op on clean synced tree,
 * duplicate-PR 422 tolerance, init scaffold. No real git repo, network, or
 * token involved.
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDLC_ROOT = resolve(__dirname, '..');

let passed = 0, failed = 0;
function test(name, fn) {
  const done = (err) => {
    if (err) { console.log(`  ❌ ${name}: ${err.message}`); failed++; }
    else { console.log(`  ✅ ${name}`); passed++; }
  };
  try { const r = fn(); if (r && r.then) return r.then(() => done(), done); done(); }
  catch (err) { done(err); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, e, msg) { if (a !== e) throw new Error(msg || `Expected ${e}, got ${a}`); }

// isolate config BEFORE import (paths are read lazily, but keep the pattern)
const conf = mkdtempSync(join(tmpdir(), 'git-push-'));
process.env.HERMES_ALLOWLIST_PATH = join(conf, 'allowlist.json');
process.env.HERMES_ENV_PATH = join(conf, 'env');
delete process.env.GITHUB_WRITE_TOKEN;
delete process.env.GITHUB_TOKEN;

const gp = await import(resolve(SDLC_ROOT, 'agents/hermes-git-push.mjs'));

const ALLOW = { repos: ['that-gum-you-like/agentic-sdlc'], branchPrefix: 'hermes/auto/', protectedBranches: ['main', 'master'] };

/** A scriptable fake git: map of subcommand -> output or thrower. */
function fakeGit(overrides = {}) {
  const calls = [];
  const runGit = (args, { cwd }) => {
    calls.push(args.join(' '));
    const key = args[0] === 'remote' ? 'remote' : args[0];
    const h = overrides[key];
    if (typeof h === 'function') return h(args);
    if (h !== undefined) return h;
    return '';
  };
  return { runGit, calls };
}
function fakeFetch(status, jsonBody) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    return { status, ok: status >= 200 && status < 300, json: async () => jsonBody, text: async () => JSON.stringify(jsonBody) };
  };
  return { impl, calls };
}

console.log('\n📋 hermes-git-push: pure guards');
test('parseOrigin: https, https+auth, ssh, non-github', () => {
  assertEqual(gp.parseOrigin('https://github.com/o/r.git').full, 'o/r');
  assertEqual(gp.parseOrigin('https://x-access-token:tok@github.com/o/r').full, 'o/r');
  assertEqual(gp.parseOrigin('git@github.com:o/r.git').full, 'o/r');
  assertEqual(gp.parseOrigin('https://gitlab.com/o/r.git'), null);
});
test('sanitizeId strips branch-unsafe characters', () => {
  assertEqual(gp.sanitizeId('cycle 42; rm -rf /'), 'cycle42rm-rf');
  assertEqual(gp.sanitizeId('../..'), '....');
  assertEqual(gp.sanitizeId('T-101_ok.v2'), 'T-101_ok.v2');
});
test('REQ-001: guard fails closed without an allowlist', () => {
  const r = gp.guard({ repoFull: 'o/r', cycleId: 'x', allowlist: null });
  assert(!r.ok && /fail closed/i.test(r.reason));
});
test('REQ-001: guard refuses non-designated repo', () => {
  const r = gp.guard({ repoFull: 'evil/repo', cycleId: 'x', allowlist: ALLOW });
  assert(!r.ok && /not allowlisted/.test(r.reason));
});
test('REQ-002: branch is always prefix+id; empty id refused', () => {
  const ok = gp.guard({ repoFull: 'that-gum-you-like/agentic-sdlc', cycleId: 'c1', allowlist: ALLOW });
  assert(ok.ok); assertEqual(ok.branch, 'hermes/auto/c1');
  const bad = gp.guard({ repoFull: 'that-gum-you-like/agentic-sdlc', cycleId: '///', allowlist: ALLOW });
  assert(!bad.ok && /sanitizes to empty/.test(bad.reason));
});
test('REQ-002: protected branch refused even if prefix collides', () => {
  const allow = { ...ALLOW, branchPrefix: '', protectedBranches: ['main'] };
  const r = gp.guard({ repoFull: 'that-gum-you-like/agentic-sdlc', cycleId: 'main', allowlist: allow });
  assert(!r.ok && /protected/.test(r.reason));
});
test('REQ-003: redact scrubs tokenized remotes', () => {
  const out = gp.redact('failed: https://x-access-token:ghp_SECRET@github.com/o/r.git rejected');
  assert(!out.includes('ghp_SECRET'));
  assert(out.includes('x-access-token:***@'));
});

console.log('\n📋 hermes-git-push: token discovery');
test('REQ-003: env var wins; WRITE_TOKEN beats TOKEN; .env fallback', () => {
  assertEqual(gp.findToken({ GITHUB_WRITE_TOKEN: 'w', GITHUB_TOKEN: 't' }), 'w');
  assertEqual(gp.findToken({ GITHUB_TOKEN: 't' }), 't');
  assertEqual(gp.findToken({}), null, 'no env, no .env file');
  writeFileSync(process.env.HERMES_ENV_PATH, '# comment\nGITHUB_TOKEN="from_file"\n');
  assertEqual(gp.findToken({}), 'from_file');
});

console.log('\n📋 hermes-git-push: init scaffold');
test('REQ-005: init creates seeded allowlist once, never overwrites', () => {
  assert(!existsSync(process.env.HERMES_ALLOWLIST_PATH));
  const r1 = gp.initAllowlist();
  assert(r1.created);
  const parsed = JSON.parse(readFileSync(process.env.HERMES_ALLOWLIST_PATH, 'utf8'));
  assert(parsed.repos.includes('that-gum-you-like/agentic-sdlc'));
  writeFileSync(process.env.HERMES_ALLOWLIST_PATH, JSON.stringify({ repos: ['custom/repo'] }));
  const r2 = gp.initAllowlist();
  assert(!r2.created, 'second init is a no-op');
  assertEqual(JSON.parse(readFileSync(process.env.HERMES_ALLOWLIST_PATH, 'utf8')).repos[0], 'custom/repo', 'existing file untouched');
});

console.log('\n📋 hermes-git-push: pipeline (fake git + fetch)');
writeFileSync(process.env.HERMES_ALLOWLIST_PATH, JSON.stringify(ALLOW));
writeFileSync(process.env.HERMES_ENV_PATH, 'GITHUB_TOKEN=tok123\n');
const ORIGIN = 'https://github.com/that-gum-you-like/agentic-sdlc.git';

await test('REQ-004: dirty tree -> commit, tokenized push (no force), draft PR', async () => {
  const git = fakeGit({ remote: ORIGIN, status: ' M file.js', 'rev-parse': 'abc' });
  const f = fakeFetch(201, { number: 7, html_url: 'https://github.com/x/pull/7' });
  const r = await gp.pushCycle({ repoDir: '/fake', cycleId: 'c1', runGit: git.runGit, fetchImpl: f.impl, env: {} });
  assertEqual(r.pr, 7);
  assert(git.calls.some((c) => c.startsWith('add -A')), 'staged');
  assert(git.calls.some((c) => c.startsWith('commit -m')), 'committed');
  const push = git.calls.find((c) => c.startsWith('push'));
  assert(push.includes('x-access-token:tok123@github.com/that-gum-you-like/agentic-sdlc'), 'tokenized remote as argument');
  assert(push.includes('HEAD:refs/heads/hermes/auto/c1'), 'namespaced branch');
  assert(!push.includes('--force') && !/\s-f\s/.test(push), 'never force');
  const req = JSON.parse(f.calls[0].opts.body);
  assertEqual(req.draft, true);
  assertEqual(req.head, 'hermes/auto/c1');
  assertEqual(req.base, 'main');
});
await test('REQ-004: clean tree synced with remote branch -> no-op, no push', async () => {
  const git = fakeGit({ remote: ORIGIN, status: '', 'ls-remote': 'abc\trefs/heads/hermes/auto/c1', 'rev-parse': 'abc' });
  const f = fakeFetch(201, {});
  const r = await gp.pushCycle({ repoDir: '/fake', cycleId: 'c1', runGit: git.runGit, fetchImpl: f.impl, env: {} });
  assert(!r.pushed);
  assert(!git.calls.some((c) => c.startsWith('push')), 'no push issued');
  assertEqual(f.calls.length, 0, 'no PR call');
});
await test('REQ-004: duplicate PR (422) treated as success', async () => {
  const git = fakeGit({ remote: ORIGIN, status: ' M f', 'rev-parse': 'abc' });
  const f = fakeFetch(422, { message: 'already exists' });
  const r = await gp.pushCycle({ repoDir: '/fake', cycleId: 'c1', runGit: git.runGit, fetchImpl: f.impl, env: {} });
  assertEqual(r.pr, 'exists');
});
await test('REQ-001: pipeline refuses non-allowlisted origin before any write', async () => {
  const git = fakeGit({ remote: 'https://github.com/evil/repo.git' });
  let threw = null;
  try { await gp.pushCycle({ repoDir: '/fake', cycleId: 'c1', runGit: git.runGit, fetchImpl: fakeFetch(201, {}).impl, env: {} }); }
  catch (e) { threw = e; }
  assert(threw && /not allowlisted/.test(threw.message));
  assertEqual(git.calls.length, 1, 'only the origin read happened');
});
await test('REQ-003: missing token fails before any git write', async () => {
  writeFileSync(process.env.HERMES_ENV_PATH, '# no tokens here\n');
  const git = fakeGit({ remote: ORIGIN, status: ' M f' });
  let threw = null;
  try { await gp.pushCycle({ repoDir: '/fake', cycleId: 'c1', runGit: git.runGit, fetchImpl: fakeFetch(201, {}).impl, env: {} }); }
  catch (e) { threw = e; }
  assert(threw && /no GitHub token/.test(threw.message));
  assert(!git.calls.some((c) => c.startsWith('push') || c.startsWith('commit')), 'nothing written');
});
await test('REQ-004: dry-run (check) passes gates without touching the tree', async () => {
  writeFileSync(process.env.HERMES_ENV_PATH, 'GITHUB_TOKEN=tok123\n');
  const git = fakeGit({ remote: ORIGIN });
  const r = await gp.pushCycle({ repoDir: '/fake', cycleId: 'c9', dryRun: true, runGit: git.runGit, fetchImpl: fakeFetch(201, {}).impl, env: {} });
  assert(r.dryRun && r.branch === 'hermes/auto/c9');
  assertEqual(git.calls.length, 1, 'origin read only');
});

// cleanup
try { rmSync(conf, { recursive: true, force: true }); } catch { /* ignore */ }
delete process.env.HERMES_ALLOWLIST_PATH;
delete process.env.HERMES_ENV_PATH;

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
