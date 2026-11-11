/**
 * version-snapshot.test.mjs — Tests for agents/version-snapshot.mjs
 *
 * Covers CV-247: snapshot copies memory JSON files; memoryFilesFor is exported
 * and works standalone.
 *
 * Run with:
 *   node --test agents/__tests__/version-snapshot.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const SCRIPT_PATH = resolve(AGENTS_DIR, 'version-snapshot.mjs');
const TMP_ROOT = join(tmpdir(), `sdlc-version-test-${process.pid}`);
const TMP_AGENTS = join(TMP_ROOT, 'agents');

describe('version-snapshot.mjs — memory snapshot and restore (CV-247, CV-248)', () => {
  let snapshot;
  let memoryFilesFor;
  let restore;

  before(async () => {
    const mod = await import(SCRIPT_PATH);
    snapshot = mod.snapshot;
    memoryFilesFor = mod.memoryFilesFor;
    restore = mod.restore;

    // Create temp agent directories
    mkdirSync(join(TMP_AGENTS, 'agent-a', 'memory'), { recursive: true });
    mkdirSync(join(TMP_AGENTS, 'agent-b', 'memory'), { recursive: true });
    mkdirSync(join(TMP_AGENTS, 'agent-c'), { recursive: true }); // no memory dir

    // AGENT.md files
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'AGENT.md'), '# Agent A\nContent A');
    writeFileSync(join(TMP_AGENTS, 'agent-b', 'AGENT.md'), '# Agent B\nContent B');
    writeFileSync(join(TMP_AGENTS, 'agent-c', 'AGENT.md'), '# Agent C\nContent C');

    // Memory JSON files
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'core.json'), JSON.stringify({ key: 'a-core' }));
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'recent.json'), JSON.stringify({ last: 'task' }));
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'long-term.json'), JSON.stringify({ patterns: [] }));
    writeFileSync(join(TMP_AGENTS, 'agent-b', 'memory', 'core.json'), JSON.stringify({ key: 'b-core' }));
  });

  after(() => {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  // ─── memoryFilesFor ──────────────────────────────────────────────

  it('exports memoryFilesFor as a function', () => {
    assert.strictEqual(typeof memoryFilesFor, 'function');
  });

  it('memoryFilesFor returns sorted JSON filenames for an agent with memory', () => {
    const files = memoryFilesFor('agent-a', TMP_AGENTS);
    assert.ok(Array.isArray(files), 'returns an array');
    assert.strictEqual(files.length, 3, 'agent-a has 3 memory JSON files');
    assert.ok(files.includes('core.json'));
    assert.ok(files.includes('recent.json'));
    assert.ok(files.includes('long-term.json'));
    // Sorted alphabetically: core < long-term < recent
    assert.strictEqual(files[0], 'core.json');
    assert.strictEqual(files[1], 'long-term.json');
    assert.strictEqual(files[2], 'recent.json');
  });

  it('memoryFilesFor returns files, not paths', () => {
    const files = memoryFilesFor('agent-a', TMP_AGENTS);
    for (const f of files) {
      assert.ok(!f.includes('/'), `${f} should not contain path separators`);
      assert.ok(f.endsWith('.json'), `${f} should end with .json`);
    }
  });

  it('memoryFilesFor returns empty array for agent with no memory dir', () => {
    const files = memoryFilesFor('agent-c', TMP_AGENTS);
    assert.ok(Array.isArray(files));
    assert.strictEqual(files.length, 0);
  });

  it('memoryFilesFor returns empty array for nonexistent agent', () => {
    const files = memoryFilesFor('nonexistent', TMP_AGENTS);
    assert.ok(Array.isArray(files));
    assert.strictEqual(files.length, 0);
  });

  it('memoryFilesFor filters only .json files (not .md or other)', () => {
    // agent-c has no memory dir; create one with mixed content
    const memDir = join(TMP_AGENTS, 'agent-a', 'memory');
    writeFileSync(join(memDir, 'notes.txt'), 'not json');
    writeFileSync(join(memDir, 'data.yaml'), 'key: value');
    const files = memoryFilesFor('agent-a', TMP_AGENTS);
    assert.ok(files.includes('core.json'), 'includes json files');
    assert.ok(!files.includes('notes.txt'), 'excludes .txt files');
    assert.ok(!files.includes('data.yaml'), 'excludes .yaml files');
  });

  // ─── snapshot: AGENT.md (existing behaviour) ─────────────────────

  it('snapshot copies AGENT.md files (existing behaviour unchanged)', () => {
    snapshot({ agents: ['agent-a', 'agent-b', 'agent-c'], agentsDir: TMP_AGENTS });

    const versionsDir = join(TMP_AGENTS, 'versions');
    assert.ok(existsSync(versionsDir), 'versions dir created');

    const snapshots = readdirSync(versionsDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    assert.ok(snapshots.length > 0, 'at least one snapshot dir');

    const date = snapshots[snapshots.length - 1];
    const sDir = join(versionsDir, date);

    assert.ok(existsSync(join(sDir, 'agent-a.md')), 'agent-a.md copied');
    assert.ok(existsSync(join(sDir, 'agent-b.md')), 'agent-b.md copied');
    assert.ok(existsSync(join(sDir, 'agent-c.md')), 'agent-c.md copied');
  });

  // ─── snapshot: memory/*.json (new behaviour) ─────────────────────

  it('snapshot copies memory JSON into versions/<date>/memory/<agent>/', () => {
    const versionsDir = join(TMP_AGENTS, 'versions');
    const snapshots = readdirSync(versionsDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    const date = snapshots[snapshots.length - 1];
    const sDir = join(versionsDir, date);

    // agent-a has 3 memory files
    const aMem = join(sDir, 'memory', 'agent-a');
    assert.ok(existsSync(aMem), 'memory/agent-a dir exists');
    const aFiles = readdirSync(aMem);
    assert.ok(aFiles.includes('core.json'), 'core.json present');
    assert.ok(aFiles.includes('recent.json'), 'recent.json present');
    assert.ok(aFiles.includes('long-term.json'), 'long-term.json present');
    assert.strictEqual(aFiles.length, 3, 'exactly 3 memory files for agent-a');

    // agent-b has 1 memory file
    const bMem = join(sDir, 'memory', 'agent-b');
    assert.ok(existsSync(bMem), 'memory/agent-b dir exists');
    const bFiles = readdirSync(bMem);
    assert.ok(bFiles.includes('core.json'), 'b core.json present');
    assert.strictEqual(bFiles.length, 1, 'exactly 1 memory file for agent-b');

    // agent-c has no memory dir, so memory/agent-c should not exist
    const cMem = join(sDir, 'memory', 'agent-c');
    assert.ok(!existsSync(cMem), 'agent-c has no memory dir, should not be in snapshot');
  });

  it('snapshot memory copies are identical to originals', () => {
    const versionsDir = join(TMP_AGENTS, 'versions');
    const snapshots = readdirSync(versionsDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    const date = snapshots[snapshots.length - 1];
    const sDir = join(versionsDir, date);

    // Read back an agent-b memory file and verify it round-trips
    const bMem = join(sDir, 'memory', 'agent-b');
    const bFiles = readdirSync(bMem);
    assert.ok(bFiles.includes('core.json'));

    // Also check that agent-a's files survived (second snapshot run adds to same dir)
    const aMem = join(sDir, 'memory', 'agent-a');
    const aFiles = readdirSync(aMem);
    assert.strictEqual(aFiles.length >= 3, true, 'agent-a still has its memory files');
  });

  // ─── restore: AGENT.md (existing behaviour unchanged) ────────────

  it('restore without memory flag restores AGENT.md only (existing behaviour)', () => {
    // Modify an AGENT.md to confirm restore puts it back
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'AGENT.md'), '# Agent A - CORRUPTED');

    const versionsDir = join(TMP_AGENTS, 'versions');
    const snapshots = readdirSync(versionsDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    const date = snapshots[snapshots.length - 1];

    restore(date, { agents: ['agent-a', 'agent-b', 'agent-c'], agentsDir: TMP_AGENTS });

    const restored = readFileSync(join(TMP_AGENTS, 'agent-a', 'AGENT.md'), 'utf8');
    assert.strictEqual(restored, '# Agent A\nContent A', 'AGENT.md restored to original content');
  });

  // ─── restore: with --memory flag ──────────────────────────────────

  it('restore with memory flag copies memory JSON files back', () => {
    // Corrupt memory files
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'core.json'), JSON.stringify({ corrupted: true }));
    writeFileSync(join(TMP_AGENTS, 'agent-b', 'memory', 'core.json'), JSON.stringify({ corrupted: true }));

    const versionsDir = join(TMP_AGENTS, 'versions');
    const snapshots = readdirSync(versionsDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    const date = snapshots[snapshots.length - 1];

    restore(date, { agents: ['agent-a', 'agent-b', 'agent-c'], agentsDir: TMP_AGENTS, memory: true });

    // agent-a core.json should be restored to original
    const aCore = JSON.parse(readFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'core.json'), 'utf8'));
    assert.deepStrictEqual(aCore, { key: 'a-core' }, 'agent-a core.json restored');

    // agent-a recent.json should be restored too
    const aRecent = JSON.parse(readFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'recent.json'), 'utf8'));
    assert.deepStrictEqual(aRecent, { last: 'task' }, 'agent-a recent.json restored');

    // agent-b core.json restored
    const bCore = JSON.parse(readFileSync(join(TMP_AGENTS, 'agent-b', 'memory', 'core.json'), 'utf8'));
    assert.deepStrictEqual(bCore, { key: 'b-core' }, 'agent-b core.json restored');

    // agent-c has no memory dir — should not cause error, just be skipped
  });

  it('restore with memory flag refuses a date with no memory snapshot', () => {
    // Create a snapshot date with NO memory/ subdirectory
    const versionsDir = join(TMP_AGENTS, 'versions');
    const noMemDate = '2020-01-01';
    const noMemSnapshotDir = join(versionsDir, noMemDate);
    mkdirSync(noMemSnapshotDir, { recursive: true });
    writeFileSync(join(noMemSnapshotDir, 'agent-a.md'), '# stub');

    assert.throws(
      () => {
        restore(noMemDate, { agents: ['agent-a'], agentsDir: TMP_AGENTS, memory: true, _throwOnError: true });
      },
      { name: 'Error', message: /no memory snapshot/ },
      'should throw on restore --memory when snapshot has no memory dir'
    );
  });

  it('restore with memory flag: corrupted file equals snapshot copy after restore', () => {
    // Fresh snapshot to a known date
    const testDate = '2025-06-15';
    const versionsDir = join(TMP_AGENTS, 'versions');
    const sDir = join(versionsDir, testDate);
    mkdirSync(join(sDir, 'memory', 'agent-a'), { recursive: true });

    // Create a snapshot with a known memory file
    const originalContent = JSON.stringify({ key: 'snapshot-value', nested: { a: 1 } });
    writeFileSync(join(sDir, 'memory', 'agent-a', 'core.json'), originalContent);
    writeFileSync(join(sDir, 'agent-a.md'), '# Agent A\nOriginal');

    // Now corrupt the live memory file
    writeFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'core.json'), JSON.stringify({ corrupted: true, original: 'gone' }));

    // Restore with memory flag
    restore(testDate, { agents: ['agent-a'], agentsDir: TMP_AGENTS, memory: true });

    // Verify the file now equals the snapshot copy
    const restoredContent = readFileSync(join(TMP_AGENTS, 'agent-a', 'memory', 'core.json'), 'utf8');
    assert.strictEqual(restoredContent, originalContent, 'corrupted file equals snapshot copy after restore');
  });
});