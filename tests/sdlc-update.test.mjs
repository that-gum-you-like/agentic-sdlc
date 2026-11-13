import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyTree, runUpdate, renderUnit } from '../agents/sdlc-update.mjs';
import { shouldNotifyOnce } from '../agents/notify.mjs';

const base = { branch: 'main', base: 'main', ahead: 0, behind: 4, dirty: [], incoming: ['b.json'], midOp: false };

describe('classifyTree', () => {
  const cases = [
    ['clean+behind', {}, 'pull'],
    ['dirty-disjoint', { dirty: ['a.json'] }, 'pull'],
    ['dirty-overlap', { dirty: ['agents/x.mjs'], incoming: ['agents/x.mjs'] }, 'alert', 'dirty-overlap'],
    ['untracked collides with incoming add', { dirty: ['n.txt'], incoming: ['n.txt'] }, 'alert', 'dirty-overlap'],
    ['ahead and behind', { ahead: 2 }, 'alert', 'diverged'],
    ['wrong branch', { branch: 'feat' }, 'alert', 'not-on-main'],
    ['mid-rebase', { midOp: true }, 'alert', 'mid-operation'],
    ['up to date', { behind: 0 }, 'noop'],
    ['foreign incoming', { foreign: ['t/x'] }, 'alert', 'foreign-owned'],
  ];
  for (const [name, over, action, cause] of cases) {
    it(name, () => {
      const r = classifyTree({ ...base, ...over });
      assert.equal(r.action, action);
      if (cause) assert.equal(r.cause, cause);
    });
  }
});

function fakeGit(state) {
  const calls = [];
  const git = (repo, args) => {
    calls.push(args);
    const k = args.join(' ');
    if (args[0] === 'fetch') { if (state.fetchFail) { const e = new Error('x'); e.stderr = 'could not resolve host'; throw e; } return ''; }
    if (k === 'rev-parse --abbrev-ref HEAD') return `${state.branch ?? 'main'}\n`;
    if (args[0] === 'rev-list') return `${state.ahead ?? 0}\t${state.behind ?? 0}\n`;
    if (k === 'rev-parse --git-dir') return '.git\n';
    if (k === 'diff --name-only HEAD') return (state.dirty ?? []).join('\n');
    if (args[0] === 'ls-files') return (state.untracked ?? []).join('\n');
    if (args[0] === 'diff') return (state.incoming ?? []).join('\n');
    if (args[0] === 'log') return '2026-11-12T00:00:00+00:00\n2026-10-01T00:00:00+00:00\n';
    if (args[0] === 'merge') { state.merged = true; return ''; }
    return '';
  };
  return { git, calls };
}
const run = (state, extra = {}) => {
  const sent = [];
  const f = fakeGit(state);
  const r = runUpdate({ repo: '/r', git: f.git, notify: (k, t, m) => { sent.push({ k, m }); return true; }, foreignOf: () => null, exists: () => false, ...extra });
  return { r, sent, calls: f.calls };
};

describe('runUpdate', () => {
  it('clean tree 4 behind: fast-forwards, no notification', () => {
    const s = { behind: 4, incoming: ['b.json'] };
    const { r, sent } = run(s);
    assert.equal(r.outcome, 'pulled'); assert.ok(s.merged); assert.equal(sent.length, 0);
  });
  it('dirty a.json, incoming b.json: fast-forwards', () => {
    const s = { behind: 1, dirty: ['a.json'], incoming: ['b.json'] };
    assert.equal(run(s).r.outcome, 'pulled');
  });
  it('dirty-overlap: nothing pulled, one alert naming the path', () => {
    const s = { behind: 2, dirty: ['agents/x.mjs'], incoming: ['agents/x.mjs'] };
    const { sent } = run(s);
    assert.ok(!s.merged); assert.equal(sent.length, 1);
    assert.equal(sent[0].k, 'sdlc-update:dirty-overlap');
    assert.match(sent[0].m, /agents\/x\.mjs/);
  });
  it('fetch failure alerts and exits cleanly', () => {
    const { r, sent } = run({ fetchFail: true });
    assert.equal(r.cause, 'fetch-failed'); assert.equal(sent[0].k, 'sdlc-update:fetch-failed');
  });
  it('argv never contains stash/reset/checkout/clean/chown/pull', () => {
    for (const s of [{ behind: 3, incoming: ['b'] }, { behind: 3, dirty: ['x'], incoming: ['x'] }, { branch: 'f', behind: 9 }]) {
      const { calls } = run(s);
      for (const a of calls) assert.ok(!['stash', 'reset', 'checkout', 'clean', 'chown', 'pull'].includes(a[0]), a.join(' '));
    }
  });
  it('same cause twice -> one alert (real dedupe state)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-dd-'));
    const statePath = join(dir, 's.json');
    try {
      let sent = 0;
      const notify = (key) => { if (shouldNotifyOnce(key, { statePath, now: 1000 })) sent++; };
      const s = { behind: 2, dirty: ['x'], incoming: ['x'] };
      for (let i = 0; i < 2; i++) runUpdate({ repo: '/r', git: fakeGit(s).git, notify, foreignOf: () => null, exists: () => false });
      assert.equal(sent, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('notifier throws -> still returns normally', () => {
    const f = fakeGit({ behind: 2, dirty: ['x'], incoming: ['x'] });
    const r = runUpdate({ repo: '/r', git: f.git, notify: () => { throw new Error('boom'); }, foreignOf: () => null, exists: () => false });
    assert.equal(r.outcome, 'alert');
  });
  it('31 behind with overlap -> drift alert with count and date', () => {
    const { sent } = run({ behind: 31, dirty: ['x'], incoming: ['x'] });
    const drift = sent.find(s => s.k === 'sdlc-update:drift');
    assert.ok(drift); assert.match(drift.m, /31 commits/); assert.match(drift.m, /2026-10-01/);
  });
  it('merge failure alerts', () => {
    const f = fakeGit({ behind: 1, incoming: ['b'] });
    const git = (r, a) => { if (a[0] === 'merge') { const e = new Error('m'); e.stderr = 'fatal: Not possible'; throw e; } return f.git(r, a); };
    const sent = [];
    const r = runUpdate({ repo: '/r', git, notify: (k) => sent.push(k), foreignOf: () => null, exists: () => false });
    assert.equal(r.cause, 'merge-failed'); assert.deepEqual(sent, ['sdlc-update:merge-failed']);
  });
});

describe('integration against a real repo', () => {
  it('fast-forwards a clone behind origin and leaves a dirty disjoint file alone', () => {
    const d = mkdtempSync(join(tmpdir(), 'rs-int-'));
    const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' });
    try {
      const up = join(d, 'up'); mkdirSync(up); sh(up, 'init', '-q', '-b', 'main');
      sh(up, 'config', 'user.email', 't@t'); sh(up, 'config', 'user.name', 't');
      writeFileSync(join(up, 'a'), '1'); writeFileSync(join(up, 'b'), '1'); sh(up, 'add', '-A'); sh(up, 'commit', '-qm', '1');
      sh(d, 'clone', '-q', up, 'cl');
      writeFileSync(join(up, 'b'), '2'); sh(up, 'commit', '-qam', '2');
      const cl = join(d, 'cl'); writeFileSync(join(cl, 'a'), 'mine');
      const sent = [];
      const r = runUpdate({ repo: cl, notify: (k) => sent.push(k) });
      assert.equal(r.outcome, 'pulled'); assert.equal(sent.length, 0);
      assert.equal(readFileSync(join(cl, 'b'), 'utf8'), '2');
      assert.equal(readFileSync(join(cl, 'a'), 'utf8'), 'mine');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('unit template (RS-202)', () => {
  const tpl = readFileSync(new URL('../agents/templates/systemd/sdlc-update.service.template', import.meta.url), 'utf8');
  it('ExecStart references sdlc-update.mjs and never git pull', () => {
    assert.match(tpl, /^ExecStart=.*agents\/sdlc-update\.mjs/m);
    assert.doesNotMatch(tpl, /git pull/);
  });
  it('renders with no leftover placeholders', () => {
    const out = renderUnit({ repo: '/home/u/r', node: '/usr/bin/node', template: tpl });
    assert.doesNotMatch(out, /\{\{/);
    assert.match(out, /ExecStart=\/usr\/bin\/node \/home\/u\/r\/agents\/sdlc-update\.mjs/);
  });
});
