/**
 * memory-state.test.mjs — RS-REQ-011/012/014/017 (runtime-state-isolation)
 * Memory reads fall back to the seed, writes go only to the state dir,
 * writers are serialised, snapshot/restore go through state.
 *
 * Run: node --test agents/__tests__/memory-state.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createMemoryStore, writeAtomic } from '../memory-store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENTS_SRC = resolve(HERE, '..');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });

describe('memory state (RS-REQ-011/012/014/017)', () => {
  let root, project, agentsDir, stateDir, store;
  const seedFile = (agent, layer) => join(agentsDir, agent, 'memory', `${layer}.json`);
  const stateFile = (agent, layer) => join(stateDir, 'memory', agent, `${layer}.json`);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rs-mem-'));
    project = join(root, 'project');
    agentsDir = join(project, 'agents');
    stateDir = join(root, 'state');
    mkdirSync(join(agentsDir, 'a1', 'memory'), { recursive: true });
    writeFileSync(join(agentsDir, 'project.json'), JSON.stringify({ name: 'T', agents: ['a1'] }));
    writeFileSync(seedFile('a1', 'long-term'), JSON.stringify({ entries: [{ id: 'S1', content: 'seed lesson' }] }, null, 2));
    git(project, 'init', '-q');
    git(project, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
    git(project, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed');
    store = createMemoryStore({ stateDir, agentsDir, projectDir: project });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('read falls back to seed', () => {
    assert.equal(store.loadMemory('a1', 'long-term').entries[0].id, 'S1');
    assert.deepEqual(store.loadMemory('a1', 'recent'), { entries: [] });
    assert.deepEqual(store.loadMemory('a1', 'core'), {});
    assert.equal(existsSync(stateDir), false, 'reads never create state');
  });

  it('save never touches seed (git status unchanged)', () => {
    const seedBefore = readFileSync(seedFile('a1', 'long-term'), 'utf8');
    const mem = store.loadMemory('a1', 'long-term');
    mem.entries.push({ id: 'N1', content: 'new lesson' });
    store.saveMemory('a1', 'long-term', mem);
    store.saveMemory('a1', 'recent', { entries: [{ id: 'R1', content: 'r' }] });
    assert.equal(readFileSync(seedFile('a1', 'long-term'), 'utf8'), seedBefore, 'seed byte-identical');
    assert.equal(git(project, 'status', '--porcelain').trim(), '', 'checkout stays clean');
    const state = JSON.parse(readFileSync(stateFile('a1', 'long-term'), 'utf8'));
    assert.deepEqual(state.entries.map(e => e.id), ['S1', 'N1'], 'seed entries plus the new one');
  });

  it('first write copies the seed into state before writing', () => {
    store.saveMemory('a1', 'long-term', { entries: [{ id: 'S1', content: 'seed lesson' }, { id: 'N', content: 'n' }] });
    assert.ok(existsSync(stateFile('a1', 'long-term')));
  });

  it('truncated write impossible (kill simulation)', () => {
    store.saveMemory('a1', 'recent', { entries: [{ id: 'old', content: 'old' }] });
    const before = readFileSync(stateFile('a1', 'recent'), 'utf8');
    const boom = () => { throw new Error('killed before rename'); };
    assert.throws(() => writeAtomic(stateFile('a1', 'recent'), '{"entries": [TRUNC', { renameFn: boom }));
    assert.equal(readFileSync(stateFile('a1', 'recent'), 'utf8'), before, 'old file intact');
    assert.deepEqual(readdirSync(dirname(stateFile('a1', 'recent'))).filter(f => f.endsWith('.tmp')), [], 'temp cleaned');
  });

  it('audit failure never fails save', () => {
    mkdirSync(join(stateDir, 'memory-audit.jsonl'), { recursive: true }); // directory: append fails
    writeFileSync(join(project, 'pm'), 'file, not dir'); // fallback also fails
    store.saveMemory('a1', 'recent', { entries: [{ id: 'x', content: 'x' }] });
    assert.equal(JSON.parse(readFileSync(stateFile('a1', 'recent'), 'utf8')).entries[0].id, 'x');
  });

  it('audit line goes to the state dir', () => {
    store.saveMemory('a1', 'recent', { entries: [] });
    const lines = readFileSync(join(stateDir, 'memory-audit.jsonl'), 'utf8').trim().split('\n');
    assert.equal(JSON.parse(lines[0]).layer, 'recent');
  });

  it('two concurrent writers both persist', async () => {
    store.saveMemory('a1', 'recent', { entries: [] });
    const script = `
      import { createMemoryStore } from ${JSON.stringify(join(AGENTS_SRC, 'memory-store.mjs'))};
      const s = createMemoryStore({ stateDir: ${JSON.stringify(stateDir)}, agentsDir: ${JSON.stringify(agentsDir)}, projectDir: ${JSON.stringify(project)} });
      for (let i = 0; i < 15; i++) {
        s.updateMemory('a1', 'recent', m => { m.entries.push({ id: process.argv[1] + i }); return m; });
      }`;
    const run = id => new Promise((res, rej) => {
      const c = spawn(process.execPath, ['--input-type=module', '-e', script, id], { stdio: 'inherit' });
      c.on('exit', code => (code === 0 ? res() : rej(new Error(`child ${id} exit ${code}`))));
    });
    await Promise.all([run('A'), run('B')]);
    const ids = JSON.parse(readFileSync(stateFile('a1', 'recent'), 'utf8')).entries.map(e => e.id);
    assert.equal(ids.length, 30, 'no lost update');
    assert.equal(new Set(ids).size, 30);
  });

  it('stale lock broken', () => {
    const lock = join(stateDir, 'memory', 'a1', '.lock');
    mkdirSync(lock, { recursive: true });
    const old = new Date(Date.now() - 11 * 60 * 1000);
    utimesSync(lock, old, old);
    store.saveMemory('a1', 'recent', { entries: [{ id: 'after-stale' }] });
    assert.equal(JSON.parse(readFileSync(stateFile('a1', 'recent'), 'utf8')).entries[0].id, 'after-stale');
    assert.equal(existsSync(lock), false, 'lock released');
  });

  it('timer skip is non-fatal', () => {
    const lock = join(stateDir, 'memory', 'a1', '.lock');
    mkdirSync(lock, { recursive: true }); // fresh lock held by "someone else"
    const fast = createMemoryStore({ stateDir, agentsDir, projectDir: project });
    const res = fast.withAgentLock('a1', () => 'ran', { mode: 'skip', timeoutMs: 150, pollMs: 20 });
    assert.deepEqual(res, { skipped: true });
    assert.equal(existsSync(stateFile('a1', 'recent')), false, 'nothing written');
    // worker mode retries and eventually errors rather than skipping silently
    assert.throws(() => fast.withAgentLock('a1', () => 'ran', { mode: 'retry', timeoutMs: 100, pollMs: 20 }), /not acquired/);
  });

  it('legacy mode writes the tracked path with no lock dir', () => {
    const legacy = createMemoryStore({ stateDir: 'legacy', agentsDir, projectDir: project });
    legacy.saveMemory('a1', 'recent', { entries: [{ id: 'L' }] });
    assert.ok(existsSync(seedFile('a1', 'recent')));
    assert.equal(existsSync(join(agentsDir, 'a1', 'memory', '.lock')), false);
  });

  it('restore --memory writes state not seed; snapshot reads state, writes agents/versions', async () => {
    const stateAgentFile = stateFile('a1', 'long-term');
    store.saveMemory('a1', 'long-term', { entries: [{ id: 'S1', content: 'seed lesson' }, { id: 'LIVE', content: 'live' }] });
    const vs = await import('../version-snapshot.mjs');
    writeFileSync(join(agentsDir, 'a1', 'AGENT.md'), '# a1\n');
    vs.snapshot({ agentsDir, stateDir, agents: ['a1'] });
    const date = readdirSync(join(agentsDir, 'versions'))[0];
    const snap = JSON.parse(readFileSync(join(agentsDir, 'versions', date, 'memory', 'a1', 'long-term.json'), 'utf8'));
    assert.deepEqual(snap.entries.map(e => e.id), ['S1', 'LIVE'], 'snapshot holds LIVE state, not the seed');
    // corrupt state, restore
    writeFileSync(stateAgentFile, '{corrupt');
    const seedBefore = readFileSync(seedFile('a1', 'long-term'), 'utf8');
    vs.restore(date, { agentsDir, stateDir, agents: ['a1'], memory: true });
    assert.deepEqual(JSON.parse(readFileSync(stateAgentFile, 'utf8')), snap);
    assert.equal(readFileSync(seedFile('a1', 'long-term'), 'utf8'), seedBefore, 'seed untouched by restore');
  });

  it('vectors.json recreated outside checkout', () => {
    const script = `
      const { saveVectors } = await import(${JSON.stringify(join(AGENTS_SRC, 'semantic-index.mjs'))});
      saveVectors('a1', { entries: {} });`;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, SDLC_PROJECT_DIR: project, SDLC_STATE_DIR: stateDir }, cwd: project,
    });
    assert.ok(existsSync(stateFile('a1', 'vectors')), 'vectors in state dir');
    assert.equal(existsSync(seedFile('a1', 'vectors')), false, 'not in the checkout');
    assert.equal(git(project, 'status', '--porcelain').trim(), '');
  });
});
