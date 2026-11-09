/**
 * Unit tests for error-sources.mjs (CV-704 / CV-REQ-111).
 *
 * Usage: node tests/error-sources.test.mjs
 *
 * Covers:
 *   1. JSONL adapter reads a fixture file and returns lines
 *   2. Journalctl adapter parses recorded fixture output
 *   3. Vercel adapter parses recorded fixture output
 *   4. Supabase adapter parses recorded fixture output
 *   5. readErrorSource dispatcher routes by source type
 *   6. Dispatcher rejects unknown or missing source types
 *   7. Each adapter validates its required config fields
 *   8. Portfolio.validate() accepts valid errorSources[] in a project
 *   9. Portfolio.validate() rejects invalid types in errorSources[]
 *  10. Portfolio.validate() rejects missing required fields per type
 *  11. Adapters propagate opts overrides (execFile, readFile)
 *  12. Empty input handling
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCE_TYPES,
  readJsonlSource,
  readJournalctlSource,
  readVercelSource,
  readSupabaseSource,
  readErrorSource,
} from '../agents/error-sources.mjs';
import { validate } from '../agents/portfolio.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Helper: fixture reader
// ---------------------------------------------------------------------------

import fs from 'node:fs';

function loadFixture(name) {
  return fs.readFileSync(join(FIXTURES, name), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('SOURCE_TYPES are frozen and contain the four expected types', () => {
  assert.deepEqual([...SOURCE_TYPES], ['jsonl', 'journalctl', 'vercel', 'supabase']);
  assert.throws(() => { SOURCE_TYPES.push('fake'); }, { name: 'TypeError' });
});

test('JSONL adapter reads fixture file and returns lines', () => {
  const { lines, sourceLabel } = readJsonlSource(
    { type: 'jsonl', path: join(FIXTURES, 'errors.jsonl') },
  );

  assert.equal(lines.length, 5, '5 JSONL lines in fixture');
  assert.match(lines[0], /Connection timeout/, 'first line contains error text');
  assert.match(lines[2], /Connection timeout/, 'duplicate error is included');
  assert.match(sourceLabel, /^jsonl:/, 'sourceLabel prepends type');
});

test('JSONL adapter rejects missing path', () => {
  assert.throws(
    () => readJsonlSource({ type: 'jsonl' }),
    /requires a "path" string/,
  );
});

test('JSONL adapter supports readFile override for testing', () => {
  const fakeData = '{"message":"test error1"}\n{"message":"test error2"}\n';
  const { lines } = readJsonlSource(
    { type: 'jsonl', path: '/fake/path' },
    { readFile: () => fakeData },
  );

  assert.equal(lines.length, 2);
  assert.match(lines[0], /test error1/);
  assert.match(lines[1], /test error2/);
});

test('JSONL adapter returns empty lines for empty file', () => {
  const { lines } = readJsonlSource(
    { type: 'jsonl', path: '/empty' },
    { readFile: () => '' },
  );
  assert.equal(lines.length, 0);
});

test('Journalctl adapter returns lines from fixture via execFile override', () => {
  const fixture = loadFixture('journalctl-output.txt');
  const { lines, sourceLabel } = readJournalctlSource(
    { type: 'journalctl', unit: 'tally.service', since: '24h' },
    { execFile: () => ({ stdout: fixture }) },
  );

  assert.equal(lines.length, 5, '5 journalctl lines in fixture');
  assert.match(lines[0], /Connection timeout/, 'first line');
  assert.match(lines[3], /Out of memory/, 'critical error present');
  assert.match(sourceLabel, /^journalctl:/, 'sourceLabel prepends type');
});

test('Journalctl adapter rejects missing unit', () => {
  assert.throws(
    () => readJournalctlSource({ type: 'journalctl' }),
    /requires a "unit" string/,
  );
});

test('Journalctl adapter defaults since to 24h', () => {
  // Test that execFile is called with --since 24h when no since is provided
  let capturedArgs = null;
  readJournalctlSource(
    { type: 'journalctl', unit: 'my.service' },
    { execFile: (bin, args) => { capturedArgs = args; return { stdout: 'line1\nline2\n' }; } },
  );

  assert.ok(capturedArgs !== null, 'execFile was called');
  assert.ok(capturedArgs.includes('--since'), '--since flag present');
  const sinceIdx = capturedArgs.indexOf('--since');
  assert.equal(capturedArgs[sinceIdx + 1], '24h', 'defaults to 24h');
});

test('Vercel adapter returns lines from fixture via execFile override', () => {
  const fixture = loadFixture('vercel-logs.txt');
  const { lines, sourceLabel } = readVercelSource(
    { type: 'vercel', project: 'tally', limit: 50 },
    { execFile: () => ({ stdout: fixture }) },
  );

  assert.equal(lines.length, 5, '5 vercel log lines in fixture');
  assert.match(lines[0], /Connection timeout/, 'first line');
  assert.match(lines[4], /500 Internal Server Error/, 'last line');
  assert.match(sourceLabel, /^vercel:/, 'sourceLabel prepends type');
});

test('Vercel adapter rejects missing project', () => {
  assert.throws(
    () => readVercelSource({ type: 'vercel' }),
    /requires a "project" string/,
  );
});

test('Vercel adapter defaults limit to 100', () => {
  let capturedArgs = null;
  readVercelSource(
    { type: 'vercel', project: 'tally' },
    { execFile: (bin, args) => { capturedArgs = args; return { stdout: 'line1\n' }; } },
  );

  assert.ok(capturedArgs !== null);
  const limitIdx = capturedArgs.indexOf('--limit');
  assert.equal(capturedArgs[limitIdx + 1], '100', 'defaults to 100');
});

test('Supabase adapter returns lines from fixture via execFile override', () => {
  const fixture = loadFixture('supabase-logs.txt');
  const { lines, sourceLabel } = readSupabaseSource(
    { type: 'supabase', projectRef: 'abc123', limit: 50 },
    { execFile: () => ({ stdout: fixture }) },
  );

  assert.equal(lines.length, 5, '5 supabase log lines in fixture');
  assert.match(lines[0], /Connection timeout/, 'first line');
  assert.match(lines[4], /relation "orders" does not exist/, 'last line');
  assert.match(sourceLabel, /^supabase:/, 'sourceLabel prepends type');
});

test('Supabase adapter rejects missing projectRef', () => {
  assert.throws(
    () => readSupabaseSource({ type: 'supabase' }),
    /requires a "projectRef" string/,
  );
});

test('Supabase adapter defaults limit to 100', () => {
  let capturedArgs = null;
  readSupabaseSource(
    { type: 'supabase', projectRef: 'abc123' },
    { execFile: (bin, args) => { capturedArgs = args; return { stdout: 'line1\n' }; } },
  );

  assert.ok(capturedArgs !== null);
  const limitIdx = capturedArgs.indexOf('--limit');
  assert.equal(capturedArgs[limitIdx + 1], '100', 'defaults to 100');
});

// ---------------------------------------------------------------------------
// Dispatcher tests
// ---------------------------------------------------------------------------

test('readErrorSource dispatches jsonl to readJsonlSource', () => {
  const { lines, sourceLabel } = readErrorSource(
    { type: 'jsonl', path: '/fake' },
    { readFile: () => '{"message":"via dispatcher"}\n' },
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /via dispatcher/);
  assert.match(sourceLabel, /^jsonl:/);
});

test('readErrorSource dispatches journalctl via execFile override', () => {
  const { lines } = readErrorSource(
    { type: 'journalctl', unit: 'test.service', since: '1h' },
    { execFile: () => ({ stdout: 'test journalctl error\n' }) },
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /test journalctl error/);
});

test('readErrorSource dispatches vercel via execFile override', () => {
  const { lines } = readErrorSource(
    { type: 'vercel', project: 'test-proj', limit: 10 },
    { execFile: () => ({ stdout: 'test vercel error\n' }) },
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /test vercel error/);
});

test('readErrorSource dispatches supabase via execFile override', () => {
  const { lines } = readErrorSource(
    { type: 'supabase', projectRef: 'test-ref', limit: 10 },
    { execFile: () => ({ stdout: 'test supabase error\n' }) },
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /test supabase error/);
});

test('readErrorSource rejects null config', () => {
  assert.throws(
    () => readErrorSource(null),
    /requires a source config object/,
  );
});

test('readErrorSource rejects unknown type', () => {
  assert.throws(
    () => readErrorSource({ type: 'unknown-type' }),
    /unknown source type/,
  );
});

test('readErrorSource rejects missing type', () => {
  assert.throws(
    () => readErrorSource({}),
    /unknown source type/,
  );
});

// ---------------------------------------------------------------------------
// Portfolio validation tests
// ---------------------------------------------------------------------------

test('portfolio.validate() accepts projects with valid errorSources', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'jsonl', path: '/var/log/errors.jsonl' },
          { type: 'journalctl', unit: 'test.service', since: '24h' },
          { type: 'vercel', project: 'test-vercel', limit: 100 },
          { type: 'supabase', projectRef: 'abc123def', limit: 50 },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.equal(errors.length, 0, 'valid errorSources should not produce errors');
});

test('portfolio.validate() rejects errorSources that is not an array', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: 'not-an-array',
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0, 'non-array errorSources should produce errors');
  assert.match(errors[0], /must be an array/);
});

test('portfolio.validate() rejects invalid error source type', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'invalid-type' },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /invalid-type/);
});

test('portfolio.validate() rejects jsonl source missing path', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'jsonl' },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /jsonl adapter requires a "path" string/);
});

test('portfolio.validate() rejects journalctl source missing unit', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'journalctl' },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /journalctl adapter requires a "unit" string/);
});

test('portfolio.validate() rejects vercel source missing project', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'vercel' },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /vercel adapter requires a "project" string/);
});

test('portfolio.validate() rejects supabase source missing projectRef', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'supabase' },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /supabase adapter requires a "projectRef" string/);
});

test('portfolio.validate() rejects invalid limit values', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [
          { type: 'jsonl', path: '/tmp/err.jsonl', limit: -1 },
        ],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /"limit" must be a positive number/);
});

test('portfolio.validate() accepts projects with no errorSources field', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
      },
    ],
  };

  const errors = validate(doc);
  // Should have no errorSources-related errors (might have other errors for missing required fields)
  const esErrors = errors.filter(e => e.includes('errorSource'));
  assert.equal(esErrors.length, 0, 'no errorSource errors when field is absent');
});

test('portfolio.validate() continues working on real portfolio.json', () => {
  // The real portfolio.json should still pass validation
  const doc = JSON.parse(fs.readFileSync(resolve(__dirname, '..', 'portfolio.json'), 'utf8'));
  const errors = validate(doc);
  assert.equal(errors.length, 0, 'real portfolio.json should pass validation unchanged');
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('empty errorSources array is valid', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [],
      },
    ],
  };

  const errors = validate(doc);
  const esErrors = errors.filter(e => e.includes('errorSource'));
  assert.equal(esErrors.length, 0, 'empty errorSources array is valid');
});

test('error source object with null entry is flagged', () => {
  const doc = {
    version: 1,
    projects: [
      {
        name: 'test-project',
        owner: 'self',
        stage: 'live',
        errorSources: [null],
      },
    ],
  };

  const errors = validate(doc);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /must be an object/);
});
