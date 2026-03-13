/**
 * maturation-tracking.test.mjs
 *
 * Tests for agent maturation tracking (tasks 7.2–7.5):
 *
 *   1. Maturation level advancement through milestones
 *   2. Regression detection (corrections spike after decline)
 *   3. Metrics written to core.json correctly
 *   4. Dashboard section formatting
 *
 * Run with:
 *   node --test agents/__tests__/maturation-tracking.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a temporary directory tree that mimics the agent memory layout.
 * Returns { tmpRoot, agentDir, memDir, corePath, writeCore, readCore }.
 */
function makeTempAgent(agentName = 'testbot') {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'maturation-test-'));
  const agentDir = join(tmpRoot, agentName);
  const memDir = join(agentDir, 'memory');
  mkdirSync(memDir, { recursive: true });
  const corePath = join(memDir, 'core.json');

  function writeCore(data) {
    writeFileSync(corePath, JSON.stringify(data, null, 2));
  }

  function readCore() {
    return JSON.parse(readFileSync(corePath, 'utf8'));
  }

  return { tmpRoot, agentDir, memDir, corePath, writeCore, readCore };
}

/**
 * Builds a maturation object with the given metrics keyed by ISO week string.
 * metricsMap: { 'YYYY-Www': { correctionsReceived, selfCorrections } }
 */
function buildMaturation(level = 0, metricsMap = {}, overrides = {}) {
  return {
    level,
    weekStarted: new Date().toISOString().split('T')[0],
    milestonesHit: [],
    metrics: metricsMap,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Maturation level advancement
// ─────────────────────────────────────────────────────────────────────────────

describe('Maturation level advancement', () => {
  // Extract checkMaturationAdvancement from memory-manager.mjs source so we
  // can unit-test it without importing the CLI module (which has side-effects).
  let checkMaturationAdvancement;

  before(async () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'memory-manager.mjs'), 'utf8');
    const match = src.match(/(function checkMaturationAdvancement\([\s\S]*?\n\})/);
    assert.ok(match, 'Could not find checkMaturationAdvancement in memory-manager.mjs');
    // The function references loadMemory/saveMemory from outer scope; we stub them.
    // eslint-disable-next-line no-new-func
    checkMaturationAdvancement = new Function(
      'loadMemory', 'saveMemory',
      `return (${match[1]})`
    );
  });

  it('level 0 → 1 on any correction', () => {
    const core = { maturation: buildMaturation(0) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] missed error handling');
    assert.ok(saved, 'saveMemory should have been called');
    assert.equal(saved.maturation.level, 1, 'Level should advance to 1');
    assert.ok(
      saved.maturation.milestonesHit.some(m => m.trigger === 'first_correction'),
      'Milestone first_correction should be recorded'
    );
  });

  it('level 1 → 2 on self-correction tag', () => {
    const core = { maturation: buildMaturation(1) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[self-correction] I caught this before it was reviewed');
    assert.ok(saved, 'saveMemory should have been called');
    assert.equal(saved.maturation.level, 2, 'Level should advance to 2');
    assert.ok(
      saved.maturation.milestonesHit.some(m => m.trigger === 'first_self_correction'),
      'Milestone first_self_correction should be recorded'
    );
  });

  it('level 1 → stays 1 on non-self-correction content', () => {
    const core = { maturation: buildMaturation(1) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] reviewer noticed a bug');
    assert.equal(saved, null, 'saveMemory should NOT be called — no advancement');
  });

  it('level 2 → 3 when 3+ consecutive weeks declining', () => {
    const metrics = {
      '2026-W08': { correctionsReceived: 5, selfCorrections: 0, reviewSeverity: {} },
      '2026-W09': { correctionsReceived: 3, selfCorrections: 0, reviewSeverity: {} },
      '2026-W10': { correctionsReceived: 1, selfCorrections: 0, reviewSeverity: {} },
    };
    const core = { maturation: buildMaturation(2, metrics) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] latest correction');
    assert.ok(saved, 'saveMemory should have been called');
    assert.equal(saved.maturation.level, 3, 'Level should advance to 3');
    assert.ok(
      saved.maturation.milestonesHit.some(m => m.trigger === 'declining_correction_rate'),
      'Milestone declining_correction_rate should be recorded'
    );
  });

  it('level 2 → stays 2 when corrections not consistently declining', () => {
    const metrics = {
      '2026-W08': { correctionsReceived: 5, selfCorrections: 0, reviewSeverity: {} },
      '2026-W09': { correctionsReceived: 6, selfCorrections: 0, reviewSeverity: {} },
      '2026-W10': { correctionsReceived: 2, selfCorrections: 0, reviewSeverity: {} },
    };
    const core = { maturation: buildMaturation(2, metrics) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] latest correction');
    assert.equal(saved, null, 'saveMemory should NOT be called — not declining');
  });

  it('level 3 → 4 when contributesToPatterns is true', () => {
    const core = { maturation: { ...buildMaturation(3), contributesToPatterns: true } };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] team improvement');
    assert.ok(saved, 'saveMemory should have been called');
    assert.equal(saved.maturation.level, 4, 'Level should advance to 4');
    assert.ok(
      saved.maturation.milestonesHit.some(m => m.trigger === 'team_pattern_contribution'),
      'Milestone team_pattern_contribution should be recorded'
    );
  });

  it('level 4 → 5 after 2 consecutive weeks with zero corrections', () => {
    const metrics = {
      '2026-W09': { correctionsReceived: 0, selfCorrections: 0, reviewSeverity: {} },
      '2026-W10': { correctionsReceived: 0, selfCorrections: 0, reviewSeverity: {} },
    };
    const core = { maturation: buildMaturation(4, metrics) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] minor');
    assert.ok(saved, 'saveMemory should have been called');
    assert.equal(saved.maturation.level, 5, 'Level should advance to 5');
    assert.ok(
      saved.maturation.milestonesHit.some(m => m.trigger === 'autonomous_operation'),
      'Milestone autonomous_operation should be recorded'
    );
  });

  it('level 4 → stays 4 when only 1 zero-correction week', () => {
    const metrics = {
      '2026-W09': { correctionsReceived: 2, selfCorrections: 0, reviewSeverity: {} },
      '2026-W10': { correctionsReceived: 0, selfCorrections: 0, reviewSeverity: {} },
    };
    const core = { maturation: buildMaturation(4, metrics) };
    const loadMemory = () => core;
    let saved = null;
    const saveMemory = (_, __, data) => { saved = data; };
    const fn = checkMaturationAdvancement(loadMemory, saveMemory);
    fn('testbot', '[correction] minor');
    assert.equal(saved, null, 'saveMemory should NOT be called — only 1 zero week');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Regression detection
// ─────────────────────────────────────────────────────────────────────────────

describe('Regression detection', () => {
  // Extract the regression logic from test-behavior.mjs so we can unit-test it
  // without running the full behavior test suite.
  function detectRegression(metrics) {
    const weeks = Object.keys(metrics).sort();
    if (weeks.length < 4) return false;

    const rates = weeks.map(w => metrics[w].correctionsReceived || 0);

    for (let i = 0; i <= rates.length - 4; i++) {
      const declineStreak = rates[i] > rates[i + 1] && rates[i + 1] > rates[i + 2];
      const spikeStreak = rates[i + 2] < rates[i + 3];
      if (declineStreak && spikeStreak) return true;
    }

    return false;
  }

  it('no regression with steady improvement', () => {
    const metrics = {
      '2026-W07': { correctionsReceived: 8 },
      '2026-W08': { correctionsReceived: 6 },
      '2026-W09': { correctionsReceived: 4 },
      '2026-W10': { correctionsReceived: 2 },
    };
    assert.equal(detectRegression(metrics), false, 'Steady decline should not flag regression');
  });

  it('regression detected: 3-week decline then spike', () => {
    const metrics = {
      '2026-W07': { correctionsReceived: 8 },
      '2026-W08': { correctionsReceived: 5 },
      '2026-W09': { correctionsReceived: 2 },
      '2026-W10': { correctionsReceived: 7 },
    };
    assert.equal(detectRegression(metrics), true, 'Spike after decline should flag regression');
  });

  it('no regression with insufficient weeks of data', () => {
    const metrics = {
      '2026-W08': { correctionsReceived: 5 },
      '2026-W09': { correctionsReceived: 2 },
    };
    assert.equal(detectRegression(metrics), false, 'Only 2 weeks: not enough data');
  });

  it('no regression when corrections remain flat', () => {
    const metrics = {
      '2026-W07': { correctionsReceived: 3 },
      '2026-W08': { correctionsReceived: 3 },
      '2026-W09': { correctionsReceived: 3 },
      '2026-W10': { correctionsReceived: 3 },
    };
    assert.equal(detectRegression(metrics), false, 'Flat corrections are not a regression');
  });

  it('regression at end of a longer series', () => {
    const metrics = {
      '2026-W05': { correctionsReceived: 10 },
      '2026-W06': { correctionsReceived: 9 },
      '2026-W07': { correctionsReceived: 7 },
      '2026-W08': { correctionsReceived: 4 },
      '2026-W09': { correctionsReceived: 2 },
      '2026-W10': { correctionsReceived: 9 },
    };
    assert.equal(detectRegression(metrics), true, 'Late spike after long decline should flag regression');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Metrics written to core.json correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('Metrics written to core.json', () => {
  // Extract computeMaturationMetrics from weekly-review.mjs source so we can
  // unit-test it with a controlled filesystem.
  let computeMaturationMetricsFactory;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cycles/weekly-review.mjs'), 'utf8');
    const match = src.match(/(function computeMaturationMetrics\(\)[\s\S]*?\n\})/);
    assert.ok(match, 'Could not find computeMaturationMetrics in weekly-review.mjs');
    // The function references: AGENTS, AGENTS_DIR, REVIEWS_DIR, existsSync,
    // readdirSync, readFileSync, writeFileSync, resolve.
    // We will re-create it with injectable dependencies.
    computeMaturationMetricsFactory = match[1];
  });

  it('writes metrics to core.json under the current ISO week key', () => {
    const { tmpRoot, memDir, writeCore, readCore } = makeTempAgent('testbot');

    // Write a minimal core.json
    writeCore({ maturation: { level: 0, weekStarted: '', milestonesHit: [], metrics: {} } });

    // Write a recent.json with a correction entry
    const recentPath = join(memDir, 'recent.json');
    writeFileSync(recentPath, JSON.stringify({
      entries: [
        { id: 'M-1', content: '[correction] missed null check', date: '2026-03-10', timestamp: new Date().toISOString() },
        { id: 'M-2', content: 'normal work entry', date: '2026-03-10', timestamp: new Date().toISOString() },
      ],
    }, null, 2));

    // Build a function that operates on our temp directory
    const fn = new Function(
      'AGENTS', 'AGENTS_DIR', 'REVIEWS_DIR', 'existsSync', 'readdirSync', 'readFileSync', 'writeFileSync', 'resolve',
      `return (${computeMaturationMetricsFactory})`
    )(
      ['testbot'],
      tmpRoot,
      join(tmpRoot, 'richmond/reviews'),
      existsSync,
      readdirSync,
      readFileSync,
      writeFileSync,
      resolve
    );

    fn();

    const core = readCore();
    assert.ok(core.maturation.metrics, 'maturation.metrics should exist');
    const weekKeys = Object.keys(core.maturation.metrics);
    assert.equal(weekKeys.length, 1, 'Exactly one ISO week key should be written');

    const weekKey = weekKeys[0];
    assert.match(weekKey, /^\d{4}-W\d{2}$/, `Week key "${weekKey}" should match YYYY-Www format`);

    const weekData = core.maturation.metrics[weekKey];
    assert.equal(typeof weekData.correctionsReceived, 'number', 'correctionsReceived should be a number');
    assert.equal(typeof weekData.selfCorrections, 'number', 'selfCorrections should be a number');
    assert.ok('reviewSeverity' in weekData, 'reviewSeverity should be present');
    assert.equal(weekData.correctionsReceived, 1, 'Should count 1 correction entry in recent.json');
    assert.equal(weekData.selfCorrections, 0, 'No self-corrections in test data');

    // Cleanup
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('counts self-correction entries separately', () => {
    const { tmpRoot, memDir, writeCore, readCore } = makeTempAgent('testbot2');

    writeCore({ maturation: { level: 1, weekStarted: '', milestonesHit: [], metrics: {} } });

    const recentPath = join(memDir, 'recent.json');
    writeFileSync(recentPath, JSON.stringify({
      entries: [
        { id: 'M-1', content: '[correction] reviewer noticed bug', date: '2026-03-10', timestamp: new Date().toISOString() },
        { id: 'M-2', content: '[self-correction] I caught this one', date: '2026-03-10', timestamp: new Date().toISOString() },
        { id: 'M-3', content: '[self-correction] another catch', date: '2026-03-11', timestamp: new Date().toISOString() },
      ],
    }, null, 2));

    const fn = new Function(
      'AGENTS', 'AGENTS_DIR', 'REVIEWS_DIR', 'existsSync', 'readdirSync', 'readFileSync', 'writeFileSync', 'resolve',
      `return (${computeMaturationMetricsFactory})`
    )(
      ['testbot2'],
      tmpRoot,
      join(tmpRoot, 'richmond/reviews'),
      existsSync,
      readdirSync,
      readFileSync,
      writeFileSync,
      resolve
    );

    fn();

    const core = readCore();
    const weekKey = Object.keys(core.maturation.metrics)[0];
    const weekData = core.maturation.metrics[weekKey];

    // correctionsReceived counts both [correction] and [self-correction] tagged entries
    assert.ok(weekData.correctionsReceived >= 1, 'Should count correction entries');
    // selfCorrections counts only [self-correction] entries
    assert.equal(weekData.selfCorrections, 2, 'Should count 2 self-correction entries');

    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('does not overwrite unrelated core.json fields', () => {
    const { tmpRoot, memDir, writeCore, readCore } = makeTempAgent('testbot3');

    writeCore({
      identity: { name: 'testbot3', role: 'tester' },
      values: ['test'],
      failures: [],
      maturation: { level: 0, weekStarted: '', milestonesHit: [], metrics: {} },
    });

    writeFileSync(join(memDir, 'recent.json'), JSON.stringify({ entries: [] }, null, 2));

    const fn = new Function(
      'AGENTS', 'AGENTS_DIR', 'REVIEWS_DIR', 'existsSync', 'readdirSync', 'readFileSync', 'writeFileSync', 'resolve',
      `return (${computeMaturationMetricsFactory})`
    )(
      ['testbot3'],
      tmpRoot,
      join(tmpRoot, 'richmond/reviews'),
      existsSync,
      readdirSync,
      readFileSync,
      writeFileSync,
      resolve
    );

    fn();

    const core = readCore();
    assert.deepEqual(core.identity, { name: 'testbot3', role: 'tester' }, 'identity should be preserved');
    assert.deepEqual(core.values, ['test'], 'values should be preserved');
    assert.deepEqual(core.failures, [], 'failures should be preserved');

    rmSync(tmpRoot, { recursive: true, force: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Dashboard section formatting
// ─────────────────────────────────────────────────────────────────────────────

describe('Dashboard maturation section formatting', () => {
  // Extract generateMaturationSection from daily-review.mjs source.
  let generateMaturationSectionFactory;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cycles/daily-review.mjs'), 'utf8');
    const match = src.match(/(function generateMaturationSection\(\)[\s\S]*?\n\})/);
    assert.ok(match, 'Could not find generateMaturationSection in daily-review.mjs');
    generateMaturationSectionFactory = match[1];
  });

  function buildSection(agents, coreByAgent, opts = {}) {
    const { AGENTS_DIR: agentsDir = '/fake', existsSync: existsFn, readFileSync: readFn } = opts;
    const MATURATION_LEVEL_NAMES = ['New', 'Corrected', 'Remembering', 'Teaching', 'Autonomous', 'Evolving'];

    // existsSync mock: returns true if any known agent appears in the path AND that agent has core data
    const defaultExistsFn = (p) => agents.some(a => p.includes(`/${a}/`) && a in coreByAgent);
    // readFileSync mock: find the agent from the path and return its core data
    const defaultReadFn = (p) => {
      const agent = agents.find(a => p.includes(`/${a}/`));
      if (!agent) throw new Error(`No mock data for path: ${p}`);
      return JSON.stringify(coreByAgent[agent]);
    };

    return new Function(
      'AGENTS', 'AGENTS_DIR', 'MATURATION_LEVEL_NAMES', 'existsSync', 'readFileSync', 'resolve',
      `return (${generateMaturationSectionFactory})`
    )(
      agents,
      agentsDir,
      MATURATION_LEVEL_NAMES,
      existsFn || defaultExistsFn,
      readFn || defaultReadFn,
      (...parts) => parts.join('/')
    )();
  }

  it('returns empty string when no agents have core.json', () => {
    const result = buildSection(
      ['agent1'],
      {},
      { existsSync: () => false, readFileSync: () => '{}' }
    );
    assert.equal(result, '', 'Should return empty string when no data available');
  });

  it('section contains markdown table header', () => {
    const coreByAgent = {
      roy: {
        maturation: buildMaturation(1, {}, { weekStarted: '2026-01-01' }),
      },
    };
    const result = buildSection(['roy'], coreByAgent);
    assert.match(result, /### Agent Maturation/, 'Should contain section header');
    assert.match(result, /\| Agent \|/, 'Should contain table header row');
    assert.match(result, /\| Level \|/, 'Should contain Level column');
    assert.match(result, /\| Weeks at Level \|/, 'Should contain Weeks column');
    assert.match(result, /\| Trend \|/, 'Should contain Trend column');
  });

  it('section shows correct level name', () => {
    const coreByAgent = {
      moss: {
        maturation: buildMaturation(2, {}, { weekStarted: '2026-01-01' }),
      },
    };
    const result = buildSection(['moss'], coreByAgent);
    assert.match(result, /Remembering/, 'Level 2 should show "Remembering"');
  });

  it('trend shows "improving" when last week has fewer corrections', () => {
    const metrics = {
      '2026-W09': { correctionsReceived: 5, selfCorrections: 0, reviewSeverity: {} },
      '2026-W10': { correctionsReceived: 2, selfCorrections: 0, reviewSeverity: {} },
    };
    const coreByAgent = {
      jen: { maturation: buildMaturation(2, metrics, { weekStarted: '2026-01-01' }) },
    };
    const result = buildSection(['jen'], coreByAgent);
    assert.match(result, /improving/, 'Should show "improving" when corrections decline');
  });

  it('trend shows "regressing" when last week has more corrections', () => {
    const metrics = {
      '2026-W09': { correctionsReceived: 2, selfCorrections: 0, reviewSeverity: {} },
      '2026-W10': { correctionsReceived: 7, selfCorrections: 0, reviewSeverity: {} },
    };
    const coreByAgent = {
      jen: { maturation: buildMaturation(2, metrics, { weekStarted: '2026-01-01' }) },
    };
    const result = buildSection(['jen'], coreByAgent);
    assert.match(result, /regressing/, 'Should show "regressing" when corrections spike');
  });

  it('trend shows "stable" when no metrics available', () => {
    const coreByAgent = {
      douglas: { maturation: buildMaturation(0, {}, { weekStarted: '' }) },
    };
    const result = buildSection(['douglas'], coreByAgent);
    assert.match(result, /stable/, 'Should show "stable" when no metrics yet');
  });

  it('multiple agents each get a row', () => {
    const coreByAgent = {
      roy: { maturation: buildMaturation(1, {}, { weekStarted: '2026-01-01' }) },
      moss: { maturation: buildMaturation(3, {}, { weekStarted: '2026-01-15' }) },
    };
    const result = buildSection(['roy', 'moss'], coreByAgent);
    assert.match(result, /roy/, 'Should contain row for roy');
    assert.match(result, /moss/, 'Should contain row for moss');
    // Two pipe-delimited data rows
    const rows = result.split('\n').filter(l => l.startsWith('| ') && !l.includes('Agent') && !l.includes('---'));
    assert.equal(rows.length, 2, 'Should have exactly 2 data rows');
  });
});
