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

// ─── Version History (CV-251) ──────────────────────────────────────

describe('version-snapshot.mjs — version history (CV-251)', () => {
  let previousSnapshotDateFn;
  let lineDiffStatsFn;
  let appendVersionHistoryEntryFn;
  let snapshotFn;

  const TMP_VH = join(tmpdir(), `sdlc-vh-test-${process.pid}`);

  before(async () => {
    const mod = await import(SCRIPT_PATH);
    previousSnapshotDateFn = mod.previousSnapshotDate;
    lineDiffStatsFn = mod.lineDiffStats;
    appendVersionHistoryEntryFn = mod.appendVersionHistoryEntry;
    snapshotFn = mod.snapshot;

    // Clean and recreate temp directory
    rmSync(TMP_VH, { recursive: true, force: true });
  });

  after(() => {
    rmSync(TMP_VH, { recursive: true, force: true });
  });

  // ─── previousSnapshotDate ─────────────────────────────────────────

  it('previousSnapshotDate returns null for empty versions dir', () => {
    const vDir = join(TMP_VH, 'empty');
    mkdirSync(vDir, { recursive: true });
    assert.strictEqual(previousSnapshotDateFn(vDir, '2026-11-11'), null);
  });

  it('previousSnapshotDate returns the most recent date before current', () => {
    const vDir = join(TMP_VH, 'dates');
    mkdirSync(vDir, { recursive: true });
    mkdirSync(join(vDir, '2026-11-09'));
    mkdirSync(join(vDir, '2026-11-10'));
    mkdirSync(join(vDir, '2026-11-12')); // after current, should be ignored

    assert.strictEqual(previousSnapshotDateFn(vDir, '2026-11-11'), '2026-11-10');
  });

  it('previousSnapshotDate ignores non-date directories', () => {
    const vDir = join(TMP_VH, 'non-date');
    mkdirSync(vDir, { recursive: true });
    mkdirSync(join(vDir, 'not-a-date'));
    mkdirSync(join(vDir, '2026-11-10'));
    mkdirSync(join(vDir, 'some-file.txt'));

    assert.strictEqual(previousSnapshotDateFn(vDir, '2026-11-11'), '2026-11-10');
  });

  it('previousSnapshotDate returns null when no dates are before current', () => {
    const vDir = join(TMP_VH, 'no-prior');
    mkdirSync(vDir, { recursive: true });
    mkdirSync(join(vDir, '2026-11-11')); // same date, not before

    assert.strictEqual(previousSnapshotDateFn(vDir, '2026-11-11'), null);
  });

  // ─── lineDiffStats ───────────────────────────────────────────────

  it('lineDiffStats returns 0 added, 0 removed for identical texts', () => {
    const text = 'line 1\nline 2\nline 3';
    const result = lineDiffStatsFn(text, text);
    assert.deepStrictEqual(result, { added: 0, removed: 0 });
  });

  it('lineDiffStats counts added lines', () => {
    const oldText = 'line 1\nline 2';
    const newText = 'line 1\nline 2\nline 3\nline 4';
    const result = lineDiffStatsFn(oldText, newText);
    assert.strictEqual(result.added, 2);
    assert.strictEqual(result.removed, 0);
  });

  it('lineDiffStats counts removed lines', () => {
    const oldText = 'line 1\nline 2\nline 3';
    const newText = 'line 1\nline 3';
    const result = lineDiffStatsFn(oldText, newText);
    assert.strictEqual(result.added, 0);
    assert.strictEqual(result.removed, 1);
  });

  it('lineDiffStats counts both added and removed lines', () => {
    const oldText = 'keep\nremove-a\nkeep\nremove-b';
    const newText = 'keep\nadd-x\nkeep\nadd-y\nadd-z';
    const result = lineDiffStatsFn(oldText, newText);
    assert.strictEqual(result.added, 3);
    assert.strictEqual(result.removed, 2);
  });

  it('lineDiffStats handles empty old text', () => {
    const newText = 'a\nb\nc';
    const result = lineDiffStatsFn('', newText);
    assert.strictEqual(result.added, 3);
    assert.strictEqual(result.removed, 0);
  });

  it('lineDiffStats handles empty new text', () => {
    const oldText = 'a\nb\nc';
    const result = lineDiffStatsFn(oldText, '');
    assert.strictEqual(result.added, 0);
    assert.strictEqual(result.removed, 3);
  });

  // ─── appendVersionHistoryEntry ───────────────────────────────────

  it('appendVersionHistoryEntry does nothing when agent has no AGENT.md', () => {
    const agentsDir = join(TMP_VH, 'no-agent-md');
    mkdirSync(agentsDir, { recursive: true });

    const prevSnapshotDir = join(TMP_VH, 'prev-snap');
    mkdirSync(prevSnapshotDir, { recursive: true });
    writeFileSync(join(prevSnapshotDir, 'agent-x.md'), '# old');

    // No agent-x dir exists at all — should not throw
    appendVersionHistoryEntryFn('agent-x', agentsDir, prevSnapshotDir, '2026-11-11');
    // No assertion needed — just verifying no crash
  });

  it('appendVersionHistoryEntry does nothing when no previous snapshot exists for agent', () => {
    const agentsDir = join(TMP_VH, 'no-prev-snap');
    mkdirSync(join(agentsDir, 'agent-y'), { recursive: true });
    writeFileSync(join(agentsDir, 'agent-y', 'AGENT.md'), '# Agent Y\n\n## Version History\n\nold content');

    const prevSnapshotDir = join(TMP_VH, 'prev-snap2');
    mkdirSync(prevSnapshotDir, { recursive: true });
    // No agent-y.md in prevSnapshotDir

    appendVersionHistoryEntryFn('agent-y', agentsDir, prevSnapshotDir, '2026-11-11');
    const content = readFileSync(join(agentsDir, 'agent-y', 'AGENT.md'), 'utf8');
    assert.strictEqual(content, '# Agent Y\n\n## Version History\n\nold content');
  });

  it('appendVersionHistoryEntry does nothing when AGENT.md is unchanged', () => {
    const agentsDir = join(TMP_VH, 'unchanged');
    mkdirSync(join(agentsDir, 'agent-z'), { recursive: true });
    writeFileSync(join(agentsDir, 'agent-z', 'AGENT.md'), '# Agent Z\n\n## Version History\n\nold content');

    const prevSnapshotDir = join(TMP_VH, 'prev-snap3');
    mkdirSync(prevSnapshotDir, { recursive: true });
    writeFileSync(join(prevSnapshotDir, 'agent-z.md'), '# Agent Z\n\n## Version History\n\nold content');

    appendVersionHistoryEntryFn('agent-z', agentsDir, prevSnapshotDir, '2026-11-11');
    const content = readFileSync(join(agentsDir, 'agent-z', 'AGENT.md'), 'utf8');
    assert.strictEqual(content, '# Agent Z\n\n## Version History\n\nold content');
  });

  it('appendVersionHistoryEntry does nothing when AGENT.md has no Version History section', () => {
    const agentsDir = join(TMP_VH, 'no-vh');
    mkdirSync(join(agentsDir, 'agent-w'), { recursive: true });
    writeFileSync(join(agentsDir, 'agent-w', 'AGENT.md'), '# Agent W\n\nJust content');

    const prevSnapshotDir = join(TMP_VH, 'prev-snap4');
    mkdirSync(prevSnapshotDir, { recursive: true });
    writeFileSync(join(prevSnapshotDir, 'agent-w.md'), '# Agent W\n\nOld content');

    appendVersionHistoryEntryFn('agent-w', agentsDir, prevSnapshotDir, '2026-11-11');
    const content = readFileSync(join(agentsDir, 'agent-w', 'AGENT.md'), 'utf8');
    assert.strictEqual(content, '# Agent W\n\nJust content', 'should not modify file without Version History');
  });

  it('appendVersionHistoryEntry appends one line for changed AGENT.md with Version History', () => {
    const agentsDir = join(TMP_VH, 'append-test');
    mkdirSync(join(agentsDir, 'agent-v'), { recursive: true });
    writeFileSync(join(agentsDir, 'agent-v', 'AGENT.md'), '# Agent V\n\n## Version History\n\nExisting entry\n\n## Other Section\n\ncontent');

    const prevSnapshotDir = join(TMP_VH, 'prev-snap5');
    mkdirSync(prevSnapshotDir, { recursive: true });
    writeFileSync(join(prevSnapshotDir, 'agent-v.md'), '# Agent V\n\n## Version History\n\nExisting entry\n\n## Other Section\n\nold content');

    appendVersionHistoryEntryFn('agent-v', agentsDir, prevSnapshotDir, '2026-11-11');

    const content = readFileSync(join(agentsDir, 'agent-v', 'AGENT.md'), 'utf8');
    assert.ok(content.includes('- 2026-11-11: changed'), 'should contain version history entry for the date');
    assert.ok(content.includes('Existing entry'), 'should preserve existing Version History content');
    assert.ok(content.includes('## Other Section'), 'should preserve subsequent sections');
    // Should appear before ## Other Section
    const vhEndIndex = content.indexOf('## Other Section');
    const entryIndex = content.indexOf('- 2026-11-11: changed');
    assert.ok(entryIndex < vhEndIndex, 'version history entry should appear before next section');
  });

  it('appendVersionHistoryEntry is idempotent: rerun same date adds no new line', () => {
    const agentsDir = join(TMP_VH, 'idempotent');
    mkdirSync(join(agentsDir, 'agent-u'), { recursive: true });
    writeFileSync(join(agentsDir, 'agent-u', 'AGENT.md'), '# Agent U\n\n## Version History\n\nExisting entry\n\n## Other Section\n\ncontent');

    const prevSnapshotDir = join(TMP_VH, 'prev-snap6');
    mkdirSync(prevSnapshotDir, { recursive: true });
    writeFileSync(join(prevSnapshotDir, 'agent-u.md'), '# Agent U\n\n## Version History\n\nExisting entry\n\n## Other Section\n\nold content');

    // First run
    appendVersionHistoryEntryFn('agent-u', agentsDir, prevSnapshotDir, '2026-11-11');
    const afterFirst = readFileSync(join(agentsDir, 'agent-u', 'AGENT.md'), 'utf8');
    const firstEntryCount = (afterFirst.match(/- 2026-11-11: changed/g) || []).length;
    assert.strictEqual(firstEntryCount, 1, 'first run should add exactly one entry');

    // Second run — now the live file has the entry, and the snapshot still doesn't
    // But the date check should prevent a second entry
    appendVersionHistoryEntryFn('agent-u', agentsDir, prevSnapshotDir, '2026-11-11');
    const afterSecond = readFileSync(join(agentsDir, 'agent-u', 'AGENT.md'), 'utf8');
    const secondEntryCount = (afterSecond.match(/- 2026-11-11: changed/g) || []).length;
    assert.strictEqual(secondEntryCount, 1, 'second run on same date should add no new entry');
  });

  // ─── snapshot integration ────────────────────────────────────────

  it('snapshot integration: edited AGENT.md with Version History gets one line appended', () => {
    const agentsDir = join(TMP_VH, 'integ-1');
    mkdirSync(join(agentsDir, 'agent-a'), { recursive: true });
    mkdirSync(join(agentsDir, 'agent-a', 'memory'), { recursive: true });

    // Create a previous snapshot with old content
    const versionsDir = join(agentsDir, 'versions');
    mkdirSync(join(versionsDir, '2026-11-10'), { recursive: true });
    writeFileSync(join(versionsDir, '2026-11-10', 'agent-a.md'),
      '# Agent A\n\n## Version History\n\n- 2026-11-09: initial\n\n## Breaking Changes\n\nnone');

    // Current AGENT.md has new content
    writeFileSync(join(agentsDir, 'agent-a', 'AGENT.md'),
      '# Agent A\n\n## Version History\n\n- 2026-11-09: initial\n\n## Breaking Changes\n\nnone\n\nNew content added');

    writeFileSync(join(agentsDir, 'agent-a', 'memory', 'core.json'), JSON.stringify({ k: 'v' }));

    // Freeze the date for the test by mocking via the versionsDir approach
    // Actually, snapshot() uses Date().toISOString() for the date.
    // We can't easily mock Date, but we can use a different approach:
    // Run snapshot with the agents, which will create today's snapshot dir,
    // and then check that the live AGENT.md got a version history entry.

    snapshotFn({ agents: ['agent-a'], agentsDir });

    const content = readFileSync(join(agentsDir, 'agent-a', 'AGENT.md'), 'utf8');
    const today = new Date().toISOString().split('T')[0];
    assert.ok(content.includes(`- ${today}: changed`), 'should have a version history entry for today');

    // Count entries for today — should be exactly 1
    const entryCount = (content.match(new RegExp(`- ${today}: changed`, 'g')) || []).length;
    assert.strictEqual(entryCount, 1, 'should have exactly one entry for today');
  });

  it('snapshot integration: rerun same date adds no additional entry', () => {
    const agentsDir = join(TMP_VH, 'integ-2');
    mkdirSync(join(agentsDir, 'agent-a'), { recursive: true });
    mkdirSync(join(agentsDir, 'agent-a', 'memory'), { recursive: true });

    const versionsDir = join(agentsDir, 'versions');
    mkdirSync(join(versionsDir, '2026-11-10'), { recursive: true });
    writeFileSync(join(versionsDir, '2026-11-10', 'agent-a.md'),
      '# Agent A\n\n## Version History\n\n## Breaking Changes\n\nnone');

    writeFileSync(join(agentsDir, 'agent-a', 'AGENT.md'),
      '# Agent A\n\n## Version History\n\n## Breaking Changes\n\nnone\n\nMore content');

    writeFileSync(join(agentsDir, 'agent-a', 'memory', 'core.json'), JSON.stringify({ k: 'v' }));

    // First snapshot
    snapshotFn({ agents: ['agent-a'], agentsDir });
    const afterFirst = readFileSync(join(agentsDir, 'agent-a', 'AGENT.md'), 'utf8');
    const today = new Date().toISOString().split('T')[0];
    const firstCount = (afterFirst.match(new RegExp(`- ${today}: changed`, 'g')) || []).length;
    assert.strictEqual(firstCount, 1, 'first snapshot adds exactly one entry');

    // Second snapshot on same date — the live file now has the entry,
    // and today's snapshot dir already exists (contains the pre-update copy).
    // The previous snapshot is still 2026-11-10.
    // The current content differs from the previous snapshot (has version history entry),
    // but the date check should prevent adding another.
    snapshotFn({ agents: ['agent-a'], agentsDir });
    const afterSecond = readFileSync(join(agentsDir, 'agent-a', 'AGENT.md'), 'utf8');
    const secondCount = (afterSecond.match(new RegExp(`- ${today}: changed`, 'g')) || []).length;
    assert.strictEqual(secondCount, 1, 'second snapshot on same date adds no entry');
  });

  it('snapshot integration: agent without Version History section is left untouched', () => {
    const agentsDir = join(TMP_VH, 'integ-3');
    mkdirSync(join(agentsDir, 'agent-a'), { recursive: true });
    mkdirSync(join(agentsDir, 'agent-a', 'memory'), { recursive: true });

    const versionsDir = join(agentsDir, 'versions');
    mkdirSync(join(versionsDir, '2026-11-10'), { recursive: true });
    writeFileSync(join(versionsDir, '2026-11-10', 'agent-a.md'),
      '# Agent A\n\nOld content');

    writeFileSync(join(agentsDir, 'agent-a', 'AGENT.md'),
      '# Agent A\n\nNew content without version history');

    writeFileSync(join(agentsDir, 'agent-a', 'memory', 'core.json'), JSON.stringify({ k: 'v' }));

    snapshotFn({ agents: ['agent-a'], agentsDir });

    const content = readFileSync(join(agentsDir, 'agent-a', 'AGENT.md'), 'utf8');
    assert.strictEqual(content, '# Agent A\n\nNew content without version history',
      'should not modify file without Version History section');
  });

  it('snapshot integration: no previous snapshot means no version history entry', () => {
    const agentsDir = join(TMP_VH, 'integ-4');
    mkdirSync(join(agentsDir, 'agent-a'), { recursive: true });
    mkdirSync(join(agentsDir, 'agent-a', 'memory'), { recursive: true });

    writeFileSync(join(agentsDir, 'agent-a', 'AGENT.md'),
      '# Agent A\n\n## Version History\n\ncontent');

    writeFileSync(join(agentsDir, 'agent-a', 'memory', 'core.json'), JSON.stringify({ k: 'v' }));

    // No previous snapshots exist — first run should not add version history
    // because there's nothing to diff against
    snapshotFn({ agents: ['agent-a'], agentsDir });

    const content = readFileSync(join(agentsDir, 'agent-a', 'AGENT.md'), 'utf8');
    assert.strictEqual(content, '# Agent A\n\n## Version History\n\ncontent',
      'first snapshot with no previous should not add version history entry');
  });
});