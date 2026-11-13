/**
 * memory-publish.test.mjs — RS-REQ-016 / RS-REQ-053 (runtime-state-isolation)
 * Run: node --test tests/memory-publish.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { publish, scanSecrets, addedLines } from '../agents/memory-publish.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' }).trim();
const write = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 2)); };

describe('memory-publish (RS-REQ-016/053)', () => {
  let root, origin, live, stateDir, ghCalls, openPrs, scrubResult, alerts;

  const exec = (cmd, args, opts = {}) => {
    if (cmd === 'gh') {
      ghCalls.push(args);
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(openPrs);
      if (args[0] === 'pr' && args[1] === 'create') return 'https://example.test/pr/1';
      throw new Error(`unexpected gh ${args.join(' ')}`);
    }
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
  };
  const run = (o = {}) => publish({
    stateDir, repoDir: live, base: 'main', exec,
    scrubFn: async () => scrubResult, notify: async (k, m) => { alerts.push({ k, m }); },
    now: () => new Date('2026-11-15T23:45:00Z'), ...o,
  });
  const state = (agent, layer, obj) => write(join(stateDir, 'memory', agent, `${layer}.json`), obj);
  const seed = { entries: [{ id: 'A', content: 'one' }] };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rs-pub-'));
    origin = join(root, 'origin.git'); live = join(root, 'live'); stateDir = join(root, 'state');
    ghCalls = []; openPrs = []; scrubResult = { entities: [] }; alerts = [];
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['clone', '-q', origin, live], { stdio: 'ignore' });
    sh(live, 'checkout', '-q', '-b', 'main');
    for (const layer of ['core', 'long-term', 'recent']) write(join(live, 'agents/ag/memory', `${layer}.json`), layer === 'core' ? { identity: { name: 'ag' } } : seed);
    sh(live, 'add', '-A'); sh(live, 'commit', '-qm', 'seeds'); sh(live, 'push', '-q', 'origin', 'main');
    // state == seeds
    state('ag', 'core', { identity: { name: 'ag' } }); state('ag', 'long-term', seed); state('ag', 'recent', seed);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const liveSnapshot = () => ({ head: sh(live, 'rev-parse', 'HEAD'), status: sh(live, 'status', '--porcelain') });

  it('no diff -> no PR', async () => {
    const before = liveSnapshot();
    const r = await run();
    assert.equal(r.status, 'no-diff');
    assert.equal(ghCalls.some(a => a[1] === 'create'), false);
    assert.equal(sh(live, 'ls-remote', '--heads', 'origin').includes('memory-publish'), false);
    assert.deepEqual(liveSnapshot(), before);
  });

  it('two changed layers -> one PR with exactly two files', async () => {
    state('ag', 'long-term', { entries: [...seed.entries, { id: 'B', content: 'two' }] });
    state('ag', 'recent', { entries: [] });
    const before = liveSnapshot();
    const r = await run();
    assert.equal(r.status, 'published');
    assert.deepEqual(r.files.sort(), ['agents/ag/memory/long-term.json', 'agents/ag/memory/recent.json']);
    assert.equal(r.branch, 'chore/memory-publish-2026-11-15');
    sh(live, 'fetch', '-q', 'origin');
    assert.deepEqual(execFileSync('git', ['-C', live, 'diff', '--name-only', 'origin/main', `origin/${r.branch}`], { encoding: 'utf8' }).trim().split('\n').sort(), r.files.sort());
    const creates = ghCalls.filter(a => a[1] === 'create');
    assert.equal(creates.length, 1);
    assert.ok(creates[0].includes('--base') && creates[0].includes('chore/memory-publish-2026-11-15'));
    assert.match(creates[0][creates[0].indexOf('--title') + 1], /^chore\(memory\):/);
    assert.deepEqual(liveSnapshot(), before, 'live checkout untouched');
    assert.equal(existsSync(join(live, 'agents/ag/memory/long-term.json')) && readFileSync(join(live, 'agents/ag/memory/long-term.json'), 'utf8').includes('"B"'), false, 'live seed not written');
    assert.equal(sh(live, 'worktree', 'list').split('\n').length, 1, 'scratch worktree removed');
  });

  it('secret in diff -> refusal, nothing pushed, one alert', async () => {
    state('ag', 'long-term', { entries: [...seed.entries, { id: 'B', content: 'key is sk-abcdefghijklmnopqrstuvwxyz123456' }] });
    const r = await run();
    assert.equal(r.status, 'refused');
    assert.ok(r.findings.some(f => /long-term/.test(f)));
    assert.equal(sh(live, 'ls-remote', '--heads', 'origin').includes('memory-publish'), false, 'nothing pushed');
    assert.equal(ghCalls.some(a => a[1] === 'create'), false);
    assert.equal(alerts.length, 1);
    await run();
    assert.equal(alerts[0].k, alerts[1].k, 'same finding set -> same dedupe key (notify dedupes by key)');
  });

  it('pii-scrub high-risk entity refuses; benign entities (PERSON) do not', async () => {
    state('ag', 'long-term', { entries: [...seed.entries, { id: 'B', content: 'call 555-123-4567 about Roy' }] });
    scrubResult = { entities: [{ type: 'PERSON', start: 0, end: 3 }] };
    assert.equal((await run()).status, 'published');
    // fresh remote for second attempt
    sh(live, 'push', '-q', 'origin', '--delete', 'chore/memory-publish-2026-11-15');
    scrubResult = { entities: [{ type: 'PHONE_NUMBER', start: 0, end: 3 }] };
    assert.equal((await run()).status, 'refused');
  });

  it('skips when a publish PR is open', async () => {
    state('ag', 'recent', { entries: [] });
    openPrs = [{ number: 7, headRefName: 'chore/memory-publish-2026-11-08', url: 'https://example.test/pr/7' }];
    const r = await run();
    assert.equal(r.status, 'skipped-open-pr');
    assert.equal(ghCalls.some(a => a[1] === 'create'), false);
  });

  it('dry-run reports files and pushes nothing', async () => {
    state('ag', 'recent', { entries: [] });
    const r = await run({ dryRun: true });
    assert.equal(r.status, 'dry-run');
    assert.deepEqual(r.files, ['agents/ag/memory/recent.json']);
    assert.equal(sh(live, 'ls-remote', '--heads', 'origin').includes('memory-publish'), false);
  });

  it('no merge call exists', () => {
    const src = readFileSync(join(REPO, 'agents/memory-publish.mjs'), 'utf8');
    assert.equal(/['"`]merge['"`]|pr['",\s]+merge|--auto\b|mergePr/.test(src), false, 'publisher must not contain a merge invocation');
    assert.equal(ghCalls.some(a => a.includes('merge')), false);
  });

  it('memory-only PRs are not guardrail surface (hardGate/scanScope accept them)', async () => {
    const M = await import('../agents/pr-auto-review.mjs');
    const scope = M.scanScope(['agents/sdlc-developer/memory/long-term.json', 'agents/sdlc-reviewer/memory/recent.json']);
    assert.equal(scope.ok, true, `memory paths flagged: ${JSON.stringify(scope)}`);
  });

  it('memory-publish-weekly is scheduled Sunday 23:45 in the live schedule and the template', () => {
    for (const f of ['agents/cron-schedule.json', 'agents/templates/cron-schedule.json.template']) {
      const e = JSON.parse(readFileSync(join(REPO, f), 'utf8')).schedules.find(x => x.name === 'memory-publish-weekly');
      assert.ok(e, `${f} missing memory-publish-weekly`);
      assert.equal(e.cron, '45 23 * * 0');
      assert.match(e.script, /memory-publish\.mjs/);
    }
  });

  it('scanSecrets / addedLines helpers', () => {
    assert.deepEqual(scanSecrets('nothing here'), []);
    assert.ok(scanSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123').length);
    assert.ok(scanSecrets('postgres://u:hunter22@db/x').length);
    assert.deepEqual(addedLines('a\nb', 'a\nb\nc'), ['c']);
  });
});
