#!/usr/bin/env node
/**
 * capture-corpus.mjs — captures replay corpus traces by calling exported
 * builder functions with fixed inputs. Run once to seed the corpus.
 *
 * Usage: node tests/replay-corpus/capture-corpus.mjs
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = resolve(__dirname);

// Import real builder functions
const { buildReviewPrompt, scanScope, taskIdFromBranch } = await import(
  resolve(CORPUS_DIR, '../../agents/pr-auto-review.mjs')
);

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function writeCorpus(entry) {
  const path = resolve(CORPUS_DIR, `${entry.id}.json`);
  writeFileSync(path, JSON.stringify(entry, null, 2) + '\n');
  console.log(`  wrote ${path}`);
}

const now = new Date().toISOString();

console.log('Capturing replay corpus traces...\n');

// ---------------------------------------------------------------------------
// Trace 1: buildReviewPrompt — full typical PR
// ---------------------------------------------------------------------------
{
  const task = {
    id: 'Q-999',
    title: 'fix: handle edge case in worker prompt assembly',
    description: 'Fixes a crash when task.description is undefined',
    priority: 'MEDIUM',
    status: 'pending',
  };
  const title = 'fix: handle edge case in worker prompt assembly';
  const body = 'Reproduces and fixes the crash when generatePrompt receives a task with no description field.';
  const diff = `--- a/agents/worker.mjs
+++ b/agents/worker.mjs
@@ -267,1 +267,1 @@
-**Description:** \${task.description}
+**Description:** \${task.description || '(no description)'}`;

  const output = buildReviewPrompt({ task, title, body, diff });

  writeCorpus({
    id: 'reviewer-full-pr-review',
    description: 'buildReviewPrompt with a typical Q-task PR (full fields: task, title, body, diff)',
    input: {
      task,
      title,
      body,
      diff,
    },
    expected: {
      mustContain: [
        'Queue task this PR claims to implement',
        '"id": "Q-999"',
        'PR title',
        'PR description',
        'Safety checklist',
        'verdict',
        'approve',
        'reject',
      ],
      mustNotContain: ['OPENROUTER_API_KEY', 'undefined'],
      mustMatch: ['\\{"verdict":\\s*"(approve|reject)"'],
    },
    metadata: {
      builderFunction: 'buildReviewPrompt',
      module: 'agents/pr-auto-review.mjs',
      capturedAt: now,
    },
  });
}

// ---------------------------------------------------------------------------
// Trace 2: buildReviewPrompt — minimal task (no body, no diff)
// ---------------------------------------------------------------------------
{
  const output = buildReviewPrompt({
    task: null,
    title: 'docs: update README',
    body: '',
    diff: '',
  });

  writeCorpus({
    id: 'reviewer-missing-task',
    description: 'buildReviewPrompt with no matching queue task, empty body, empty diff — must not crash',
    input: {
      task: null,
      title: 'docs: update README',
      body: '',
      diff: '',
    },
    expected: {
      mustContain: [
        '(no matching queue task found',
        'PR title',
        'Safety checklist',
        'verdict',
      ],
      mustNotContain: ['undefined', 'null'],
      mustMatch: [],
    },
    metadata: {
      builderFunction: 'buildReviewPrompt',
      module: 'agents/pr-auto-review.mjs',
      capturedAt: now,
    },
  });
}

// ---------------------------------------------------------------------------
// Trace 3: scanScope — safe paths only (no rejects, no flags)
// ---------------------------------------------------------------------------
{
  const paths = [
    'agents/worker.mjs',
    'tests/adapter-and-model-manager.test.mjs',
    'README.md',
  ];
  const result = scanScope(paths);

  writeCorpus({
    id: 'scanner-safe-paths',
    description: 'scanScope with normal, safe file paths — no rejects, no flags',
    input: { paths },
    expected: {
      mustContain: [],
      mustNotContain: [],
      mustMatch: [],
    },
    metadata: {
      builderFunction: 'scanScope',
      module: 'agents/pr-auto-review.mjs',
      capturedAt: now,
    },
  });

  // Verify the result is deterministic — export it for the harness
  // The harness re-runs scanScope(input.paths) and must produce the same result
  console.log(`  scanScope safe → ok=${result.ok}, rejects=${result.rejects.length}, flags=${result.flags.length}`);
}

// ---------------------------------------------------------------------------
// Trace 4: scanScope — paths that trigger rejects (.env, key material)
// ---------------------------------------------------------------------------
{
  const paths = [
    'agents/worker.mjs',
    'config/.env.production',
    'tests/hermes-drain.test.mjs',
  ];
  const result = scanScope(paths);

  writeCorpus({
    id: 'scanner-reject-env',
    description: 'scanScope with a .env file path — must produce a reject',
    input: { paths },
    expected: {
      mustContain: [],
      mustNotContain: [],
      mustMatch: [],
    },
    metadata: {
      builderFunction: 'scanScope',
      module: 'agents/pr-auto-review.mjs',
      capturedAt: now,
    },
  });

  console.log(`  scanScope with .env → ok=${result.ok}, rejects=${result.rejects.length}, flags=${result.flags.length}`);
}

// ---------------------------------------------------------------------------
// Trace 5: taskIdFromBranch — valid drain branch
// ---------------------------------------------------------------------------
{
  const branch = 'agent/drain/Q-105';
  const result = taskIdFromBranch(branch);

  writeCorpus({
    id: 'scanner-branch-extract',
    description: 'taskIdFromBranch extracts the task id from a valid agent/drain/ branch name',
    input: { branch },
    expected: {
      mustContain: [],
      mustNotContain: [],
      mustMatch: [],
    },
    metadata: {
      builderFunction: 'taskIdFromBranch',
      module: 'agents/pr-auto-review.mjs',
      capturedAt: now,
    },
  });

  console.log(`  taskIdFromBranch('${branch}') → ${result}`);
}

console.log('\nCorpus capture complete.');