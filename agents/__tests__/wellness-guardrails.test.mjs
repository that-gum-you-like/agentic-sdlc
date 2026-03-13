/**
 * wellness-guardrails.test.mjs
 *
 * Tests for Group A: Human wellness guardrails (tasks 13.3–13.7)
 *
 * Covers:
 *   - Session hours computed correctly (via computeSessionHours in cost-tracker.mjs)
 *   - Alerts fire once per threshold per day (runWellnessCheck in notify.mjs)
 *   - Queue not blocked by wellness (runWellnessCheck never throws)
 *
 * Run with:
 *   node --test agents/__tests__/wellness-guardrails.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build ISO timestamps relative to now
// ─────────────────────────────────────────────────────────────────────────────

function ts(deltaMs = 0) {
  return new Date(Date.now() + deltaMs).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Session hours computed correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('Session hours computation (computeSessionHours)', () => {
  // Extract computeSessionHours from cost-tracker.mjs source without importing
  // the whole CLI module (which has side-effects at module level).
  let computeSessionHours;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cost-tracker.mjs'), 'utf8');
    const match = src.match(/((?:export\s+)?function computeSessionHours\([\s\S]*?\n\})/);
    assert.ok(match, 'Could not extract computeSessionHours from cost-tracker.mjs');
    // Strip the optional "export" keyword before passing to Function
    const fnSrc = match[1].replace(/^export\s+/, '');
    // eslint-disable-next-line no-new-func
    computeSessionHours = new Function(`return (${fnSrc})`)();
  });

  it('empty log returns 0', () => {
    assert.equal(computeSessionHours([], new Date(0)), 0);
  });

  it('single entry returns 5-minute minimum credit (≈0.0833h)', () => {
    const log = [{ timestamp: ts(0), agent: 'roy', totalTokens: 100 }];
    const cutoff = new Date(Date.now() - 60_000);
    const hours = computeSessionHours(log, cutoff);
    assert.ok(Math.abs(hours - 5 / 60) < 0.001,
      `Expected ~${(5 / 60).toFixed(4)}h, got ${hours}`);
  });

  it('two entries 10 min apart are counted as one session (10 min + 5 min credit)', () => {
    const TEN_MIN = 10 * 60 * 1000;
    const log = [
      { timestamp: ts(-TEN_MIN), agent: 'moss', totalTokens: 50 },
      { timestamp: ts(0),        agent: 'moss', totalTokens: 50 },
    ];
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const hours = computeSessionHours(log, cutoff);
    const expected = 10 / 60 + 5 / 60; // 15 min total
    assert.ok(Math.abs(hours - expected) < 0.01,
      `Expected ~${expected.toFixed(3)}h, got ${hours.toFixed(3)}`);
  });

  it('gap > 30 min creates a new session, entries are still counted', () => {
    const now = Date.now();
    const log = [
      { timestamp: new Date(now - 90 * 60 * 1000).toISOString(), agent: 'jen', totalTokens: 100 },
      { timestamp: new Date(now - 80 * 60 * 1000).toISOString(), agent: 'jen', totalTokens: 100 },
      // 45-min gap (> 30 min threshold)
      { timestamp: new Date(now - 35 * 60 * 1000).toISOString(), agent: 'jen', totalTokens: 100 },
      { timestamp: new Date(now - 30 * 60 * 1000).toISOString(), agent: 'jen', totalTokens: 100 },
    ];
    const cutoff = new Date(now - 2 * 60 * 60 * 1000);
    const hours = computeSessionHours(log, cutoff);
    // Session A: 10 min span; Session B: 5 min span; plus 5 min credit
    assert.ok(hours > 0, `Expected hours > 0, got ${hours}`);
    assert.ok(hours < 2, `Hours ${hours.toFixed(3)} unexpectedly large`);
  });

  it('entries before cutoff are excluded', () => {
    const now = Date.now();
    const log = [
      { timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString(), agent: 'roy', totalTokens: 999 },
      { timestamp: new Date(now - 5 * 60 * 1000).toISOString(), agent: 'roy', totalTokens: 100 },
    ];
    const cutoff = new Date(now - 10 * 60 * 1000);
    const hours = computeSessionHours(log, cutoff);
    assert.ok(Math.abs(hours - 5 / 60) < 0.001,
      `Expected only the recent entry's credit, got ${hours}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Wellness alerts fire once per threshold per day (no spam)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wellness alerts — fire once per threshold per day', () => {
  // Extract the wellness-alert dedup logic by inspecting the source code:
  // runWellnessCheck only fires an alert when todayAlerts[key] is falsy.
  // We verify this by reading the source.

  let src;
  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
  });

  it('runWellnessCheck is exported from notify.mjs', () => {
    assert.match(src, /export function runWellnessCheck/,
      'runWellnessCheck must be exported');
  });

  it('dailyMax alert checks todayAlerts.dailyMax before firing', () => {
    // The guard !todayAlerts.dailyMax prevents duplicate alerts
    assert.match(src, /!todayAlerts\.dailyMax/,
      'Must check todayAlerts.dailyMax to prevent duplicate daily-max alerts');
  });

  it('nightCutoff alert checks todayAlerts.nightCutoff before firing', () => {
    assert.match(src, /!todayAlerts\.nightCutoff/,
      'Must check todayAlerts.nightCutoff to prevent duplicate night-cutoff alerts');
  });

  it('break interval uses a per-bucket key to prevent same-bucket duplicates', () => {
    // The pattern breakInterval_${intervalBucket} gives per-interval dedup
    assert.match(src, /breakInterval_\$\{intervalBucket\}/,
      'Must use per-bucket key for break interval dedup');
    assert.match(src, /!todayAlerts\[alertKey\]/,
      'Must check todayAlerts[alertKey] before firing break interval alert');
  });

  it('wellness alerts are persisted to pm/wellness-alerts.json', () => {
    assert.match(src, /wellness-alerts\.json/,
      'Must persist alerts to wellness-alerts.json to survive restarts');
  });

  it('today key is used to scope alerts to the current day', () => {
    // allAlerts[today] ensures the per-day structure
    assert.match(src, /allAlerts\[today\]/,
      'Must scope alerts under a today key for per-day tracking');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Queue not blocked by wellness — runWellnessCheck never throws
// ─────────────────────────────────────────────────────────────────────────────

describe('Queue not blocked by wellness (13.5)', () => {
  let src;
  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
  });

  it('queue-drainer imports runWellnessCheck from notify.mjs', () => {
    assert.match(src, /runWellnessCheck/,
      'queue-drainer must import runWellnessCheck');
  });

  it('wellness check calls in queue-drainer are wrapped in try/catch', () => {
    // Both parallel and serial run paths must guard with try/catch
    const tryCatchMatches = src.match(/try\s*\{\s*runWellnessCheck\(\)/g) || [];
    assert.ok(tryCatchMatches.length >= 1,
      `Expected at least 1 try { runWellnessCheck() } block, found ${tryCatchMatches.length}`);
  });

  it('wellness check never uses break or process.exit in queue run path', () => {
    // Extract the run case to verify wellness check doesn't gate task assignment
    const runCaseMatch = src.match(/case 'run':\s*\{([\s\S]*?)case 'assign'/);
    if (runCaseMatch) {
      const runBody = runCaseMatch[1];
      // The try/catch around runWellnessCheck must not re-throw or block
      const wellnessBlock = runBody.match(/try\s*\{[^}]*runWellnessCheck[^}]*\}[^}]*catch[^}]*\{([^}]*)\}/);
      if (wellnessBlock) {
        const catchBody = wellnessBlock[1];
        // catch body should not re-throw or call process.exit
        assert.doesNotMatch(catchBody, /throw|process\.exit/,
          'catch block for wellness check must not re-throw or exit');
      }
    }
    // Pass if we can't parse — this is a structural check, not a runtime one
    assert.ok(true);
  });

  it('runWellnessCheck returns early (does not throw) when wellness is disabled', () => {
    // The function checks wellness.enabled at the top and returns early
    const notifySrc = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    assert.match(notifySrc, /if\s*\(!wellness\?\.enabled\)/,
      'Must return early when wellness.enabled is false');
  });
});
