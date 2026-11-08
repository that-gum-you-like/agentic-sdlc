#!/usr/bin/env node
/**
 * error-sources.mjs — adapters for production error intake.
 *
 * Reads error events from various source types and returns normalized
 * lines suitable for ingestErrors() in seed-queue.mjs.
 *
 * Exports:
 *   SOURCE_TYPES        — array of valid source type names
 *   readErrorSource(cfg, opts)  — dispatcher: routes cfg.type to the right adapter
 *   readJsonlSource     — read a JSONL file, return each line
 *   readJournalctlSource — parse journalctl --output=short output (simulated)
 *   readVercelSource    — parse `vercel logs` output (simulated)
 *   readSupabaseSource  — parse `supabase` logs output (simulated)
 *
 * Every adapter accepts an optional `opts` bag for injecting test data
 * so that unit tests never call a live CLI. See tests/error-sources.test.mjs.
 *
 * Spec: CV-REQ-111 (openspec/changes/curriculum-v2-conformance/specs/decisions-2026-11-03.md)
 * Zero npm dependencies.
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid source types that can appear in portfolio.json errorSources[].type */
export const SOURCE_TYPES = Object.freeze(['jsonl', 'journalctl', 'vercel', 'supabase']);

// ---------------------------------------------------------------------------
// Adapter: JSONL file
// ---------------------------------------------------------------------------

/**
 * Read error events from a JSONL file.
 *
 * @param {object} cfg — source config from portfolio.json
 * @param {string} cfg.path — path to the JSONL file
 * @param {object} [opts]
 * @param {function} [opts.readFile] — alternative readFile(path) → string (for tests)
 * @returns {{ lines: string[], sourceLabel: string }}
 */
export function readJsonlSource(cfg, opts = {}) {
  const { path } = cfg;
  if (!path || typeof path !== 'string') {
    throw new Error('jsonl adapter requires a "path" string');
  }

  const readFn = opts.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const raw = readFn(path);
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  return { lines, sourceLabel: `jsonl:${path}` };
}

// ---------------------------------------------------------------------------
// Adapter: journalctl
// ---------------------------------------------------------------------------

/**
 * Simulate reading from journalctl for a given systemd unit.
 *
 * In production this runs `journalctl -u <unit> --since <since> --output=short --no-pager`.
 * In tests, opts.execFile is supplied to return a fixture.
 *
 * @param {object} cfg
 * @param {string} cfg.unit — systemd unit name (e.g. "tally.service")
 * @param {string} [cfg.since] — journalctl --since value (default "24h")
 * @param {object} [opts]
 * @param {function} [opts.execFile] — alternative execFile(bin, args) → { stdout: string } (for tests)
 * @returns {{ lines: string[], sourceLabel: string }}
 */
export function readJournalctlSource(cfg, opts = {}) {
  const { unit, since = '24h' } = cfg;
  if (!unit || typeof unit !== 'string') {
    throw new Error('journalctl adapter requires a "unit" string');
  }

  const execFn = opts.execFile || ((bin, args) => {
    const stdout = execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return { stdout };
  });

  const args = ['-u', unit, '--since', since, '--output=short', '--no-pager'];
  const { stdout } = execFn('journalctl', args);
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);

  return { lines, sourceLabel: `journalctl:${unit}` };
}

// ---------------------------------------------------------------------------
// Adapter: Vercel logs
// ---------------------------------------------------------------------------

/**
 * Simulate reading Vercel deployment logs.
 *
 * In production this runs `npx vercel logs <project> [--limit N]`.
 * In tests, opts.execFile is supplied to return a fixture.
 *
 * @param {object} cfg
 * @param {string} cfg.project — Vercel project name
 * @param {number} [cfg.limit] — max log lines to fetch (default 100)
 * @param {object} [opts]
 * @param {function} [opts.execFile] — alternative execFile(bin, args) → { stdout: string } (for tests)
 * @returns {{ lines: string[], sourceLabel: string }}
 */
export function readVercelSource(cfg, opts = {}) {
  const { project, limit = 100 } = cfg;
  if (!project || typeof project !== 'string') {
    throw new Error('vercel adapter requires a "project" string');
  }

  const execFn = opts.execFile || ((bin, args) => {
    const stdout = execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return { stdout };
  });

  const args = ['logs', project, '--limit', String(limit)];
  const { stdout } = execFn('npx', args);
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);

  return { lines, sourceLabel: `vercel:${project}` };
}

// ---------------------------------------------------------------------------
// Adapter: Supabase logs
// ---------------------------------------------------------------------------

/**
 * Simulate reading Supabase project logs.
 *
 * In production this runs `npx supabase logs --project-ref <ref> [--limit N]`.
 * In tests, opts.execFile is supplied to return a fixture.
 *
 * @param {object} cfg
 * @param {string} cfg.projectRef — Supabase project reference
 * @param {number} [cfg.limit] — max log lines to fetch (default 100)
 * @param {object} [opts]
 * @param {function} [opts.execFile] — alternative execFile(bin, args) → { stdout: string } (for tests)
 * @returns {{ lines: string[], sourceLabel: string }}
 */
export function readSupabaseSource(cfg, opts = {}) {
  const { projectRef, limit = 100 } = cfg;
  if (!projectRef || typeof projectRef !== 'string') {
    throw new Error('supabase adapter requires a "projectRef" string');
  }

  const execFn = opts.execFile || ((bin, args) => {
    const stdout = execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return { stdout };
  });

  const args = ['logs', '--project-ref', projectRef, '--limit', String(limit)];
  const { stdout } = execFn('npx', args);
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);

  return { lines, sourceLabel: `supabase:${projectRef}` };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Route a source config to the correct adapter.
 *
 * @param {object} cfg — error source config from portfolio.json errorSources[]
 * @param {string} cfg.type — one of SOURCE_TYPES
 * @param {object} [opts] — adapter-specific overrides (see individual adapters)
 * @returns {{ lines: string[], sourceLabel: string }}
 */
export function readErrorSource(cfg, opts = {}) {
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('readErrorSource requires a source config object');
  }
  if (!cfg.type || !SOURCE_TYPES.includes(cfg.type)) {
    throw new Error(`unknown source type "${cfg.type}"; expected one of ${SOURCE_TYPES.join(', ')}`);
  }

  switch (cfg.type) {
    case 'jsonl':
      return readJsonlSource(cfg, opts);
    case 'journalctl':
      return readJournalctlSource(cfg, opts);
    case 'vercel':
      return readVercelSource(cfg, opts);
    case 'supabase':
      return readSupabaseSource(cfg, opts);
    default:
      throw new Error(`unhandled source type "${cfg.type}"`);
  }
}

// ---------------------------------------------------------------------------
// CLI guard for dev/testing: read a single source and print its lines
// ---------------------------------------------------------------------------

/** @returns {number} exit code */
export function main(argv) {
  if (argv.length === 0 || argv[0] === '--help') {
    console.log('usage: error-sources.mjs <path-to-source-config-json>');
    console.log('');
    console.log('Reads a source config (JSON object on stdin or file path arg)');
    console.log('and prints the resulting error lines for inspection.');
    return 0;
  }

  let cfg;
  const maybePath = argv[0];
  if (maybePath && fs.existsSync(maybePath)) {
    cfg = JSON.parse(fs.readFileSync(maybePath, 'utf8'));
  } else {
    throw new Error(`config file not found: ${maybePath}`);
  }

  const { lines, sourceLabel } = readErrorSource(cfg);
  console.log(`Source: ${sourceLabel}`);
  console.log(`Lines:  ${lines.length}`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  return 0;
}

const __isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (__isMainModule) {
  process.exit(main(process.argv.slice(2)));
}
