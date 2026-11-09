#!/usr/bin/env node
/**
 * PII scrubber — Node.js wrapper around agents/pii-scrub.py (Presidio).
 *
 * Usage:
 *   node agents/pii-scrub.mjs scrub <text>
 *   node agents/pii-scrub.mjs check          # Check if Presidio is available
 *
 * API (imported):
 *   scrub(text, options?)  →  { scrubbed, entities, available }
 *   checkAvailability()    →  { available, error? }
 *
 * When Presidio is unavailable:
 *   - tier = 'customer-production': throws (refuse prompt)
 *   - tier = 'scratch' / 'internal-production': warns and returns original text
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_SCRIPT = resolve(__dirname, 'pii-scrub.py');
const MAX_INPUT_LENGTH = 100_000; // Soft cap — presidio can be slow on very long text

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _cachedAvailable = null;

function findPython() {
  for (const cmd of ['python3', 'python']) {
    try {
      execFileSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000 });
      return cmd;
    } catch {
      continue;
    }
  }
  throw new Error('Python interpreter not found (tried python3, python)');
}

function runScrubber(text) {
  if (text.length > MAX_INPUT_LENGTH && process.env.PII_SCRUB_ALLOW_LONG !== '1') {
    return { scrubbed: text, entities: [], available: _cachedAvailable ?? false };
  }

  const python = findPython();
  const input = JSON.stringify({ text });

  let stdout;
  try {
    stdout = execFileSync(python, [PYTHON_SCRIPT], {
      input,
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONWARNINGS: 'ignore' },
    });
  } catch (err) {
    return { scrubbed: text, entities: [], available: false, error: err.stderr || err.message };
  }

  try {
    const result = JSON.parse(stdout);
    _cachedAvailable = result.presidio_available ?? false;
    return {
      scrubbed: result.scrubbed ?? text,
      entities: result.entities ?? [],
      available: _cachedAvailable,
    };
  } catch {
    return { scrubbed: text, entities: [], available: false, error: 'unparseable Python output' };
  }
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Scrub PII from text.
 *
 * @param {string} text
 * @param {{ tier?: 'scratch' | 'internal-production' | 'customer-production' }} [options]
 * @returns {{ scrubbed: string, entities: Array<{ type: string, start: number, end: number, score: number }>, available: boolean }}
 */
export function scrub(text, options = {}) {
  const result = runScrubber(text);
  const tier = options.tier ?? 'scratch';

  if (!result.available) {
    if (tier === 'customer-production') {
      throw new Error(
        `PII scrubbing unavailable — refusing to send prompt for tier "${tier}". ` +
        `Install Presidio: pip install presidio-analyzer presidio-anonymizer`
      );
    }
    // scratch / internal-production: warn and continue
    console.warn(`[pii-scrub] WARNING: Presidio unavailable — sending unscanned prompt (tier: ${tier})`);
  }

  return result;
}

/**
 * Check whether Presidio is available.
 * @returns {{ available: boolean, error?: string }}
 */
export function checkAvailability() {
  try {
    const python = findPython();
    const stdout = execFileSync(python, [PYTHON_SCRIPT], {
      input: JSON.stringify({ text: 'test' }),
      encoding: 'utf8',
      timeout: 10_000,
    });
    const result = JSON.parse(stdout);
    _cachedAvailable = result.presidio_available === true;
    return { available: _cachedAvailable };
  } catch (err) {
    _cachedAvailable = false;
    return { available: false, error: err.stderr || err.message };
  }
}

// ---------------------------------------------------------------------------
// CLI entry (guarded)
// ---------------------------------------------------------------------------

const __isMainModule = process.argv[1] === __filename;

if (__isMainModule) {
  const [, , command, ...args] = process.argv;

  if (command === 'check') {
    const status = checkAvailability();
    console.log(JSON.stringify(status));
    process.exit(status.available ? 0 : 1);
  } else if (command === 'scrub') {
    const text = args.join(' ');
    if (!text) {
      console.error('Usage: node pii-scrub.mjs scrub <text>');
      process.exit(1);
    }
    try {
      const result = scrub(text);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  } else {
    console.error('Usage: node pii-scrub.mjs {scrub <text> | check}');
    process.exit(1);
  }
}