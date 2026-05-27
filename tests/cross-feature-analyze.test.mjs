#!/usr/bin/env node
/**
 * Tests for agents/cross-feature-analyze.mjs
 * Zero deps — uses Node's built-in test runner.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analyzeRepo } from '../agents/cross-feature-analyze.mjs';

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cfa-'));
  const changesDir = join(root, 'openspec', 'changes');
  await mkdir(changesDir, { recursive: true });
  return { root, changesDir };
}

async function writeChange(changesDir, name, { proposal = '', design = '', tasks = '', specs = [] } = {}) {
  const dir = join(changesDir, name);
  await mkdir(dir, { recursive: true });
  if (proposal) await writeFile(join(dir, 'proposal.md'), proposal);
  if (design) await writeFile(join(dir, 'design.md'), design);
  if (tasks) await writeFile(join(dir, 'tasks.md'), tasks);
  if (specs.length > 0) {
    const specsDir = join(dir, 'specs');
    await mkdir(specsDir, { recursive: true });
    for (const spec of specs) {
      await writeFile(join(specsDir, `${spec}.md`), `# Spec: ${spec}\n`);
    }
  }
}

test('detects high-severity file overlap', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await writeChange(changesDir, 'change-a', {
      proposal: 'Touches `agents/memory-manager.mjs` for tier transitions.',
    });
    await writeChange(changesDir, 'change-b', {
      proposal: 'Also touches `agents/memory-manager.mjs` for compaction.',
    });
    const { buckets } = await analyzeRepo(root);
    assert.equal(buckets.high.length, 1);
    assert.equal(buckets.high[0].a, 'change-a');
    assert.equal(buckets.high[0].b, 'change-b');
    assert.ok(buckets.high[0].files.includes('agents/memory-manager.mjs'));
    assert.equal(buckets.medium.length, 0);
    assert.equal(buckets.low.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('detects medium-severity capability overlap', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await writeChange(changesDir, 'change-a', {
      proposal: 'Adds memory-tiers behavior.',
      specs: ['memory-tiers'],
    });
    await writeChange(changesDir, 'change-b', {
      proposal: 'Modifies memory-tiers behavior.',
      specs: ['memory-tiers'],
    });
    const { buckets } = await analyzeRepo(root);
    assert.equal(buckets.medium.length, 1);
    assert.deepEqual(buckets.medium[0].capabilities, ['memory-tiers']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('classifies markdown overlap as low severity', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await writeChange(changesDir, 'change-a', {
      proposal: 'Updates `docs/memory-protocol.md`.',
    });
    await writeChange(changesDir, 'change-b', {
      proposal: 'Also updates `docs/memory-protocol.md`.',
    });
    const { buckets } = await analyzeRepo(root);
    assert.equal(buckets.high.length, 0);
    assert.equal(buckets.low.length, 1);
    assert.ok(buckets.low[0].files.includes('docs/memory-protocol.md'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports no conflicts when changes are disjoint', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await writeChange(changesDir, 'change-a', {
      proposal: 'Edits `agents/foo.mjs` only.',
    });
    await writeChange(changesDir, 'change-b', {
      proposal: 'Edits `agents/bar.mjs` only.',
    });
    const { buckets } = await analyzeRepo(root);
    assert.equal(buckets.high.length, 0);
    assert.equal(buckets.medium.length, 0);
    assert.equal(buckets.low.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ignores archived changes', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await mkdir(join(changesDir, 'archive', 'old-change'), { recursive: true });
    await writeFile(join(changesDir, 'archive', 'old-change', 'proposal.md'),
      'Touches `agents/queue-drainer.mjs`.');
    await writeChange(changesDir, 'live-change', {
      proposal: 'Touches `agents/queue-drainer.mjs`.',
    });
    const { changes, buckets } = await analyzeRepo(root);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].name, 'live-change');
    assert.equal(buckets.high.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('filters URL false positives from file regex', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await writeChange(changesDir, 'change-a', {
      proposal: 'See https://example.com/docs/foo.md for context.',
    });
    await writeChange(changesDir, 'change-b', {
      proposal: 'Also see https://example.com/docs/foo.md.',
    });
    const { buckets } = await analyzeRepo(root);
    assert.equal(buckets.high.length, 0);
    assert.equal(buckets.low.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('all three artifact sources contribute to file set', async () => {
  const { root, changesDir } = await makeFixture();
  try {
    await writeChange(changesDir, 'change-a', {
      proposal: 'Mentions `agents/x.mjs` in proposal.',
      design: 'Mentions `agents/y.mjs` in design.',
      tasks: 'Mentions `agents/z.mjs` in tasks.',
    });
    await writeChange(changesDir, 'change-b', {
      proposal: 'Mentions `agents/y.mjs`.',
    });
    const { buckets } = await analyzeRepo(root);
    assert.equal(buckets.high.length, 1);
    assert.deepEqual(buckets.high[0].files, ['agents/y.mjs']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
