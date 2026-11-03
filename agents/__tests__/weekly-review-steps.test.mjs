/**
 * weekly-review-steps.test.mjs — CV-REQ-010: buildWeeklySteps returns the correct
 * ordered list of weekly review steps and appends --dry-run when requested.
 *
 * Run with:
 *   node --test agents/__tests__/weekly-review-steps.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklySteps } from '../cycles/weekly-review.mjs';

describe('buildWeeklySteps', () => {
  it('returns exactly three steps in the correct order', () => {
    const steps = buildWeeklySteps();
    assert.equal(steps.length, 3, 'must return three steps');

    assert.equal(steps[0].label, 'Pattern hunt');
    assert.equal(steps[0].script, 'pattern-hunt.mjs');
    assert.deepEqual(steps[0].args, []);

    assert.equal(steps[1].label, 'REM sleep similarity');
    assert.equal(steps[1].script, 'rem-sleep.mjs');
    assert.deepEqual(steps[1].args, ['--similarity']);

    assert.equal(steps[2].label, 'Behavior drift');
    assert.equal(steps[2].script, 'test-behavior.mjs');
    assert.deepEqual(steps[2].args, ['--drift']);
  });

  it('appends --dry-run to every step when dryRun is true', () => {
    const steps = buildWeeklySteps({ dryRun: true });
    assert.equal(steps.length, 3);
    for (const step of steps) {
      assert.ok(step.args.includes('--dry-run'),
        `step "${step.label}" should include --dry-run in args: ${JSON.stringify(step.args)}`);
    }
    // Also verify the original step-specific args are preserved
    assert.ok(steps[0].args.includes('--dry-run'));
    assert.deepEqual(steps[1].args, ['--similarity', '--dry-run']);
    assert.deepEqual(steps[2].args, ['--drift', '--dry-run']);
  });

  it('does not add --dry-run when dryRun is false (default)', () => {
    const steps = buildWeeklySteps();
    for (const step of steps) {
      assert.ok(!step.args.includes('--dry-run'),
        `step "${step.label}" should NOT include --dry-run when dryRun is false`);
    }
  });

  it('each step has the expected shape {label, script, args}', () => {
    const steps = buildWeeklySteps();
    for (const step of steps) {
      assert.equal(typeof step.label, 'string', 'label must be a string');
      assert.equal(typeof step.script, 'string', 'script must be a string');
      assert.ok(Array.isArray(step.args), 'args must be an array');
      assert.match(step.script, /\.mjs$/, 'script must end with .mjs');
    }
  });
});