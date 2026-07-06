#!/usr/bin/env node
/**
 * replay.test.mjs — corpus-driven replay regression harness.
 *
 * Loads every tests/replay-corpus/*.json, re-runs the same builder/code path
 * with the fixed inputs, and asserts deterministic expectations.
 *
 * FAILS (not skips) if corpus directory is empty or a file violates SCHEMA.md.
 *
 * Usage: node tests/replay.test.mjs
 *   (also run as part of `npm test` — node --test picks it up naturally)
 */

import { readFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = resolve(__dirname, 'replay-corpus');
const REPLAY_DIFF_DIR = resolve(__dirname, '..', 'pm', 'replay-diff');

// ---------------------------------------------------------------------------
// Test framework (parallel to existing tests/hermes-drain.test.mjs)
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];
const asyncTests = [];

function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  let threw = false;
  let err;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // Defer async test result to be awaited later
      const p = result.then(
        () => { console.log('OK'); passed++; },
        (e) => { console.log('FAIL'); failures.push({ name, err: e.message }); failed++; },
      );
      asyncTests.push(p);
      return;
    }
  } catch (e) {
    threw = true;
    err = e;
  }
  if (threw) {
    console.log('FAIL');
    failures.push({ name, err: err.message });
    failed++;
  } else {
    console.log('OK');
    passed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

/** Validate a single corpus entry against SCHEMA.md fields. */
function validateSchema(entry, file) {
  const errors = [];
  if (!entry || typeof entry !== 'object') errors.push('entry is not an object');
  if (!entry.id || typeof entry.id !== 'string') errors.push('id must be a non-empty string');
  if (!entry.description || typeof entry.description !== 'string') errors.push('description must be a non-empty string');
  if (!entry.input || typeof entry.input !== 'object') errors.push('input must be an object');
  if (!entry.expected || typeof entry.expected !== 'object') errors.push('expected must be an object');
  if (entry.expected) {
    const hasExpected = (entry.expected.mustContain?.length || 0)
      + (entry.expected.mustNotContain?.length || 0)
      + (entry.expected.mustMatch?.length || 0);
    if (hasExpected === 0) errors.push('at least one of mustContain, mustNotContain, mustMatch must be non-empty');
    if (entry.expected.mustContain && !Array.isArray(entry.expected.mustContain)) errors.push('expected.mustContain must be an array');
    if (entry.expected.mustNotContain && !Array.isArray(entry.expected.mustNotContain)) errors.push('expected.mustNotContain must be an array');
    if (entry.expected.mustMatch && !Array.isArray(entry.expected.mustMatch)) errors.push('expected.mustMatch must be an array');
  }
  if (!entry.metadata || typeof entry.metadata !== 'object') errors.push('metadata must be an object');
  if (entry.metadata) {
    if (!entry.metadata.builderFunction || typeof entry.metadata.builderFunction !== 'string') {
      errors.push('metadata.builderFunction must be a non-empty string');
    }
    if (!entry.metadata.module || typeof entry.metadata.module !== 'string') {
      errors.push('metadata.module must be a non-empty string');
    }
  }
  if (errors.length > 0) {
    throw new Error(`SCHEMA validation failed for ${file}: ${errors.join('; ')}`);
  }
}

/** Normalize a corpus entry's input into the shape expected by the builder. */
function normalizeInput(entry) {
  // Most builders expect their input directly — pass `entry.input` verbatim.
  // For functions that take positional args (scanScope, taskIdFromBranch),
  // destructure the input.
  const fn = entry.metadata.builderFunction;
  if (fn === 'scanScope') {
    return [entry.input.paths];
  }
  if (fn === 'taskIdFromBranch') {
    return [entry.input.branch];
  }
  // buildReviewPrompt takes a single options object
  return [entry.input];
}

// ---------------------------------------------------------------------------
// Builder function loader — maps metadata to the real imported function
// ---------------------------------------------------------------------------

/** Module-level cache so we only import each module once. */
const moduleCache = {};

async function loadBuilder(modulePath) {
  if (!moduleCache[modulePath]) {
    moduleCache[modulePath] = await import(resolve(__dirname, '..', modulePath));
  }
  return moduleCache[modulePath];
}

// ---------------------------------------------------------------------------
// Boot check: corpus directory must exist and be non-empty
// ---------------------------------------------------------------------------

let corpusFiles;
console.log('replay-regression harness');

// Wrap main in async so we can await async tests before summary
const main = async () => {

test('corpus directory exists and is non-empty', () => {
  assert(existsSync(CORPUS_DIR), 'replay-corpus/ directory missing');
  const entries = readdirSync(CORPUS_DIR);
  const jsonFiles = entries.filter(f => f.endsWith('.json'));
  assert(jsonFiles.length > 0, `corpus directory is empty (no *.json files found)`);
  corpusFiles = jsonFiles;
});

// ---------------------------------------------------------------------------
// Load and validate every corpus file
// ---------------------------------------------------------------------------

const corpusEntries = [];

if (corpusFiles) {
  for (const file of corpusFiles) {
    test(`schema: ${file}`, () => {
      const raw = readFileSync(resolve(CORPUS_DIR, file), 'utf8');
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) {
        throw new Error(`${file}: invalid JSON — ${e.message}`);
      }
      validateSchema(parsed, file);
      corpusEntries.push({ file, entry: parsed });
    });
  }
}

// ---------------------------------------------------------------------------
// Re-run builders and check expectations
// ---------------------------------------------------------------------------

for (const { file, entry } of corpusEntries) {
  const fnName = entry.metadata.builderFunction;
  const modulePath = entry.metadata.module;
  const display = `${fnName}(${file})`;

  test(`replay: ${display}`, async () => {
    const mod = await loadBuilder(modulePath);
    const builder = mod[fnName];
    if (typeof builder !== 'function') {
      throw new Error(`module ${modulePath} does not export a function named ${fnName}`);
    }

    const args = normalizeInput(entry);
    const result = builder(...args);

    // Convert structured results (objects) to string for substring/regex checks
    const output = typeof result === 'string' ? result : JSON.stringify(result);

    // mustContain checks
    for (const needle of (entry.expected.mustContain || [])) {
      if (!output.includes(needle)) {
        throw new Error(`mustContain "${needle}" not found in output`);
      }
    }

    // mustNotContain checks
    for (const needle of (entry.expected.mustNotContain || [])) {
      if (output.includes(needle)) {
        throw new Error(`mustNotContain "${needle}" found in output`);
      }
    }

    // mustMatch checks
    for (const pattern of (entry.expected.mustMatch || [])) {
      try {
        const re = new RegExp(pattern);
        if (!re.test(output)) {
          throw new Error(`mustMatch /${pattern}/ did not match output`);
        }
      } catch (reErr) {
        throw new Error(`mustMatch regex /${pattern}/ error: ${reErr.message}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

  await Promise.all(asyncTests);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    // Write failure diffs if output dir exists
    if (!existsSync(REPLAY_DIFF_DIR)) {
      mkdirSync(REPLAY_DIFF_DIR, { recursive: true });
    }
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.err}`);
    }
    process.exit(1);
  }
};

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});