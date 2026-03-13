/**
 * performance-feedback.test.mjs
 *
 * Tests for tasks 8.1–8.3: performance feedback metrics in cost-tracker.mjs
 * and prompt injection in worker.mjs.
 *
 * Run with:
 *   node --test agents/__tests__/performance-feedback.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import computeEfficiencyMetrics once — we pass data directly via options
// so the module-level loadConfig() / file paths don't matter for these tests.
import { computeEfficiencyMetrics } from '../cost-tracker.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(agent, taskId, totalTokens, ts = '2026-03-10T10:00:00Z') {
  const half = Math.floor(totalTokens / 2);
  return { agent, taskId, inputTokens: half, outputTokens: totalTokens - half, totalTokens, timestamp: ts, model: 'sonnet' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. avgTokensPerTask computed correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEfficiencyMetrics – avgTokensPerTask', () => {
  it('averages total tokens over the rolling window', () => {
    const logData = [
      makeEntry('roy', 'T-001', 1500, '2026-03-10T10:00:00Z'),
      makeEntry('roy', 'T-002', 3000, '2026-03-11T10:00:00Z'),
      makeEntry('roy', 'T-003', 2000, '2026-03-12T10:00:00Z'),
    ];
    const budgetData = { agents: { roy: { model: 'sonnet', dailyTokens: 100000 } } };
    const metrics = computeEfficiencyMetrics('roy', { logData, budgetData });
    // (1500 + 3000 + 2000) / 3 = 2166.67
    assert.ok(Math.abs(metrics.avgTokensPerTask - 2166.67) < 1,
      `expected ~2166.67 got ${metrics.avgTokensPerTask}`);
  });

  it('uses at most the last 5 entries', () => {
    const logData = [
      makeEntry('roy', 'T-001', 1000, '2026-03-01T10:00:00Z'),
      makeEntry('roy', 'T-002', 1000, '2026-03-02T10:00:00Z'),
      makeEntry('roy', 'T-003', 1000, '2026-03-03T10:00:00Z'),
      makeEntry('roy', 'T-004', 1000, '2026-03-04T10:00:00Z'),
      makeEntry('roy', 'T-005', 1000, '2026-03-05T10:00:00Z'),
      makeEntry('roy', 'T-006', 18000, '2026-03-06T10:00:00Z'),
    ];
    const budgetData = { agents: { roy: { model: 'sonnet', dailyTokens: 100000 } } };
    const metrics = computeEfficiencyMetrics('roy', { logData, budgetData });
    // last 5: T-002 through T-006 → avg = (1000+1000+1000+1000+18000)/5 = 4400
    assert.strictEqual(metrics.avgTokensPerTask, 4400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. firstAttemptSuccessRate computed correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEfficiencyMetrics – firstAttemptSuccessRate', () => {
  it('counts first-attempt tasks correctly (3 of 5 = 60%)', () => {
    const logData = [
      makeEntry('moss', 'T-001',       1500, '2026-03-10T10:00:00Z'),
      makeEntry('moss', 'T-002',       1500, '2026-03-11T10:00:00Z'),
      makeEntry('moss', 'T-003-retry', 1500, '2026-03-12T10:00:00Z'),
      makeEntry('moss', 'T-004-reset', 1500, '2026-03-13T10:00:00Z'),
      makeEntry('moss', 'T-005',       1500, '2026-03-14T10:00:00Z'),
    ];
    const budgetData = { agents: { moss: { model: 'sonnet', dailyTokens: 100000 } } };
    const metrics = computeEfficiencyMetrics('moss', { logData, budgetData });
    // T-001, T-002, T-005 are first-attempt; T-003-retry and T-004-reset are not
    assert.strictEqual(metrics.firstAttemptSuccessRate, 60);
  });

  it('100% rate when no retries present', () => {
    const logData = [
      makeEntry('moss', 'T-001', 1000, '2026-03-10T10:00:00Z'),
      makeEntry('moss', 'T-002', 1000, '2026-03-11T10:00:00Z'),
    ];
    const budgetData = { agents: { moss: { model: 'sonnet' } } };
    const metrics = computeEfficiencyMetrics('moss', { logData, budgetData });
    assert.strictEqual(metrics.firstAttemptSuccessRate, 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. comparedToTypeAvg ratio correct when multiple agents exist
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEfficiencyMetrics – comparedToTypeAvg', () => {
  // roy: avg 2000 tok/task, jen: avg 4000 tok/task — both sonnet
  // type avg = (2000 + 4000) / 2 = 3000
  // roy comparedToTypeAvg = 2000 / 3000 ≈ 0.667
  // jen comparedToTypeAvg = 4000 / 3000 ≈ 1.333
  const logData = [
    makeEntry('roy', 'T-001', 2000, '2026-03-10T10:00:00Z'),
    makeEntry('roy', 'T-002', 2000, '2026-03-11T10:00:00Z'),
    makeEntry('jen', 'T-003', 4000, '2026-03-12T10:00:00Z'),
    makeEntry('jen', 'T-004', 4000, '2026-03-13T10:00:00Z'),
  ];
  const budgetData = {
    agents: {
      roy: { model: 'sonnet', dailyTokens: 100000 },
      jen: { model: 'sonnet', dailyTokens: 100000 },
    },
  };

  it('roy is below type average (ratio < 1)', () => {
    const metrics = computeEfficiencyMetrics('roy', { logData, budgetData });
    assert.ok(metrics.comparedToTypeAvg < 1, `expected < 1, got ${metrics.comparedToTypeAvg}`);
    assert.ok(Math.abs(metrics.comparedToTypeAvg - (2000 / 3000)) < 0.01);
  });

  it('jen is above type average (ratio > 1)', () => {
    const metrics = computeEfficiencyMetrics('jen', { logData, budgetData });
    assert.ok(metrics.comparedToTypeAvg > 1, `expected > 1, got ${metrics.comparedToTypeAvg}`);
    assert.ok(Math.abs(metrics.comparedToTypeAvg - (4000 / 3000)) < 0.01);
  });

  it('single-agent type has comparedToTypeAvg = 1', () => {
    // richmond is the only haiku agent — no peer comparison possible
    const logData2 = [
      makeEntry('richmond', 'T-001', 1000, '2026-03-10T10:00:00Z'),
    ];
    const budgetData2 = {
      agents: {
        richmond: { model: 'haiku', dailyTokens: 50000 },
        roy:      { model: 'sonnet', dailyTokens: 100000 },
      },
    };
    const metrics = computeEfficiencyMetrics('richmond', { logData: logData2, budgetData: budgetData2 });
    assert.strictEqual(metrics.comparedToTypeAvg, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Worker injects efficiency string into prompt
// ─────────────────────────────────────────────────────────────────────────────

describe('worker.mjs – efficiency string injected into prompt', () => {
  const workerSrc = readFileSync(resolve(__dirname, '../worker.mjs'), 'utf8');

  it('worker imports and calls computeEfficiencyMetrics', () => {
    assert.ok(
      workerSrc.includes('computeEfficiencyMetrics'),
      'worker.mjs should import and call computeEfficiencyMetrics'
    );
  });

  it('prompt template contains efficiency line with correct format', () => {
    assert.ok(
      workerSrc.includes('Your recent efficiency:'),
      'worker.mjs should inject "Your recent efficiency:" into the prompt'
    );
    assert.ok(
      workerSrc.includes('tokens/task avg'),
      'worker.mjs prompt should mention tokens/task avg'
    );
    assert.ok(
      workerSrc.includes('first-attempt success'),
      'worker.mjs prompt should mention first-attempt success'
    );
    assert.ok(
      workerSrc.includes('vs type average'),
      'worker.mjs prompt should mention vs type average'
    );
  });

  it('efficiency section is wrapped in try/catch for graceful degradation', () => {
    const effIdx = workerSrc.indexOf('computeEfficiencyMetrics(agentName)');
    assert.ok(effIdx !== -1, 'worker.mjs should call computeEfficiencyMetrics(agentName)');
    // Find the try { that immediately precedes the call
    const precedingBlock = workerSrc.substring(Math.max(0, effIdx - 200), effIdx);
    const followingBlock = workerSrc.substring(effIdx, effIdx + 500);
    assert.ok(precedingBlock.includes('try {'),
      'computeEfficiencyMetrics call should be preceded by try {');
    assert.ok(followingBlock.includes('} catch'),
      'computeEfficiencyMetrics block should be followed by } catch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Graceful handling when no cost data exists
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEfficiencyMetrics – no cost data', () => {
  it('returns zero metrics when log is empty', () => {
    const metrics = computeEfficiencyMetrics('roy', {
      logData: [],
      budgetData: { agents: { roy: { model: 'sonnet', dailyTokens: 100000 } } },
    });
    assert.strictEqual(metrics.avgTokensPerTask, 0);
    assert.strictEqual(metrics.firstAttemptSuccessRate, 0);
    assert.strictEqual(metrics.comparedToTypeAvg, 1);
  });

  it('returns zero metrics for unknown agent', () => {
    const metrics = computeEfficiencyMetrics('unknown-agent', {
      logData: [makeEntry('roy', 'T-001', 2000)],
      budgetData: { agents: { roy: { model: 'sonnet' } } },
    });
    assert.strictEqual(metrics.avgTokensPerTask, 0);
    assert.strictEqual(metrics.firstAttemptSuccessRate, 0);
    assert.strictEqual(metrics.comparedToTypeAvg, 1);
  });

  it('works when no budget data provided (null)', () => {
    const logData = [makeEntry('roy', 'T-001', 2000)];
    // No budget → comparedToTypeAvg stays 1, other metrics still computed
    const metrics = computeEfficiencyMetrics('roy', { logData, budgetData: null });
    assert.strictEqual(metrics.avgTokensPerTask, 2000);
    assert.strictEqual(metrics.comparedToTypeAvg, 1);
  });
});
