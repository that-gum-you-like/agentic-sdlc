/**
 * migrate-runtime-state.test.mjs — RS-REQ-015 (runtime-state-isolation)
 * Run: node --test tests/migrate-runtime-state.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, utimesSync, copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { migrate, MANIFEST_REL } from '../agents/migrate-runtime-state.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const LAYERS = ['core', 'long-term', 'medium-term', 'recent', 'compost'];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

describe('migrate-runtime-state (RS-REQ-015)', () => {
  let root, project, agentsDir, stateDir;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rs-mig-'));
    project = join(root, 'p');
    agentsDir = join(project, 'agents');
    stateDir = join(root, 'state');
    // Real seeds: every tracked layer of this repo, byte for byte
    for (const agent of ['jony-aive', 'sdlc-developer', 'sdlc-documentarian', 'sdlc-reviewer']) {
      mkdirSync(join(agentsDir, agent, 'memory'), { recursive: true });
      for (const l of LAYERS) copyFileSync(join(REPO, 'agents', agent, 'memory', `${l}.json`), join(agentsDir, agent, 'memory', `${l}.json`));
    }
    // The PR #164 rescue
    execFileSync('cp', ['-r', join(REPO, 'state-archive'), join(project, 'state-archive')]);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const seedHashes = () => Object.fromEntries(walk(agentsDir).map(p => [p, sha(p)]));

  it('20 layers -> 20 matching hashes', () => {
    const seeds = seedHashes();
    const r = migrate({ agentsDir, stateDir, projectDir: project });
    assert.equal(r.status, 'migrated');
    assert.equal(r.ok, true, r.errors.join('; '));
    const manifest = JSON.parse(readFileSync(join(stateDir, MANIFEST_REL), 'utf8'));
    assert.equal(manifest.entries.length, 20);
    for (const e of manifest.entries) {
      assert.equal(e.seedSha256, e.stateSha256, `${e.agent}/${e.layer}`);
      assert.equal(e.action, 'copied');
    }
    assert.deepEqual(seedHashes(), seeds, 'seeds byte-identical (never deleted or edited)');
  });

  it('PR #164 sdlc-developer lessons are present after migration', () => {
    const r = migrate({ agentsDir, stateDir, projectDir: project });
    assert.equal(r.ok, true, r.errors.join('; '));
    const archived = JSON.parse(readFileSync(join(project, 'state-archive/2026-11-12/agent-memory-local-state/sdlc-developer/long-term.json'), 'utf8')).entries;
    assert.ok(archived.length >= 4);
    const state = JSON.parse(readFileSync(join(stateDir, 'memory/sdlc-developer/long-term.json'), 'utf8')).entries;
    const text = state.map(e => e.content).join('\n');
    for (const e of archived) assert.ok(state.some(s => s.id === e.id), `lesson ${e.id} missing`);
    assert.match(text, /provider-health-probe-gaps/);
    assert.match(text, /systemd user units do NOT inherit/);
    assert.equal(r.lessonCheck.missing.length, 0);
    // and none of the seed's entries were lost
    const seed = JSON.parse(readFileSync(join(agentsDir, 'sdlc-developer/memory/long-term.json'), 'utf8')).entries;
    for (const e of seed) assert.ok(state.some(s => s.id === e.id), `seed entry ${e.id} lost`);
  });

  it('mismatch exits non-zero, no manifest, seeds intact', () => {
    const seeds = seedHashes();
    let n = 0;
    const r = migrate({
      agentsDir, stateDir, projectDir: project,
      copyFn: (src, dest) => { n++; writeFileSync(dest, n === 3 ? 'CORRUPTED' : readFileSync(src)); },
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'failed');
    assert.match(r.errors[0], /sha256 mismatch/);
    assert.equal(existsSync(join(stateDir, MANIFEST_REL)), false);
    assert.deepEqual(seedHashes(), seeds);
    assert.equal(existsSync(join(stateDir, 'memory')) && walk(join(stateDir, 'memory')).length, 0, 'partial copies rolled back');
  });

  it('second run is a no-op', () => {
    assert.equal(migrate({ agentsDir, stateDir, projectDir: project }).ok, true);
    const before = Object.fromEntries(walk(stateDir).map(p => [p, sha(p)]));
    const r = migrate({ agentsDir, stateDir, projectDir: project });
    assert.equal(r.status, 'already-migrated');
    assert.deepEqual(Object.fromEntries(walk(stateDir).map(p => [p, sha(p)])), before);
  });

  it('newer state never overwritten', () => {
    const target = join(stateDir, 'memory/sdlc-reviewer/recent.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify({ entries: [{ id: 'LIVE-1', content: 'newer than seed' }] }));
    const future = new Date(Date.now() + 60_000);
    utimesSync(target, future, future);
    const before = readFileSync(target, 'utf8');
    const r = migrate({ agentsDir, stateDir, projectDir: project });
    assert.equal(r.ok, true);
    assert.equal(readFileSync(target, 'utf8'), before);
    assert.equal(r.entries.find(e => e.agent === 'sdlc-reviewer' && e.layer === 'recent').action, 'kept-existing-state');
  });

  it('dry-run writes nothing', () => {
    const r = migrate({ agentsDir, stateDir, projectDir: project, dryRun: true });
    assert.equal(r.status, 'dry-run');
    assert.equal(r.entries.length, 20);
    assert.equal(existsSync(stateDir), false, 'not even the state dir is created');
    assert.ok(r.archiveMerged.some(m => m.agent === 'sdlc-developer' && m.layer === 'long-term'), 'reports what it would merge');
  });

  it('refuses legacy mode', () => {
    const r = migrate({ agentsDir, stateDir: 'legacy', projectDir: project });
    assert.equal(r.ok, false);
  });

  it('CLI: exit 0 and prints status', () => {
    writeFileSync(join(agentsDir, 'project.json'), JSON.stringify({ name: 'T', agents: [] }));
    const p = spawnSync(process.execPath, [join(REPO, 'agents/migrate-runtime-state.mjs'), '--dry-run', '--project-dir', project, '--state-dir', stateDir], { encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /dry-run/);
  });
});
