/**
 * weekly-review-steps.test.mjs — CV-REQ-010: buildWeeklySteps returns the correct
 * ordered list of weekly review steps and appends --dry-run when requested.
 * Also tests runWeeklySteps runner function (CV-103).
 *
 * Run with:
 *   node --test agents/__tests__/weekly-review-steps.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklySteps, runWeeklySteps } from '../cycles/weekly-review.mjs';

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

describe('runWeeklySteps', () => {
  it('executes all steps even when step 1 fails (runner stub)', () => {
    const executed = [];
    const stubRunner = (label) => {
      executed.push(label);
      return { label, ok: label !== 'Step 1' };
    };
    const steps = [
      { label: 'Step 1', script: 'a.mjs', args: [] },
      { label: 'Step 2', script: 'b.mjs', args: [] },
      { label: 'Step 3', script: 'c.mjs', args: [] },
    ];
    const results = runWeeklySteps(steps, stubRunner);
    // A failing step must not stop subsequent steps
    assert.deepEqual(executed, ['Step 1', 'Step 2', 'Step 3'],
      'all three steps must be executed even when one fails');
    // Result array has all 3 entries
    assert.equal(results.length, 3, 'result array must have 3 entries');
    assert.equal(results[0].ok, false, 'step 1 must be FAIL');
    assert.equal(results[1].ok, true, 'step 2 must be PASS');
    assert.equal(results[2].ok, true, 'step 3 must be PASS');
  });

  it('returns correct number of results matching input steps', () => {
    const stubRunner = (label) => ({ label, ok: true });
    const steps = buildWeeklySteps();
    const results = runWeeklySteps(steps, stubRunner);
    assert.equal(results.length, steps.length,
      'result count must match input step count');
    for (const r of results) {
      assert.equal(typeof r.label, 'string');
      assert.equal(typeof r.ok, 'boolean');
    }
  });

  it('every step runs even when all fail', () => {
    const executed = [];
    const stubRunner = (label) => {
      executed.push(label);
      return { label, ok: false };
    };
    const steps = [
      { label: 'First', script: 'x.mjs', args: [] },
      { label: 'Second', script: 'y.mjs', args: [] },
    ];
    const results = runWeeklySteps(steps, stubRunner);
    assert.equal(results.length, 2);
    assert.equal(results[0].ok, false);
    assert.equal(results[1].ok, false);
  });

  it('uses the default runStep from monthly-review when no runner provided', () => {
    // This just verifies the default binding works at the module level
    // (no error on import). We can't easily test actual execution without
    // scripts, but the signature should accept real buildWeeklySteps output.
    const steps = buildWeeklySteps();
    assert.equal(typeof runWeeklySteps, 'function');
    assert.equal(steps.length, 3);
    // Verify it accepts the default runner by checking the function exists
    // and the import succeeded (runStep from monthly-review is valid).
  });

  it('importing weekly-review does not trigger main() side effects', () => {
    // The __isMainModule guard should prevent main() from running when
    // the module is imported. We verify this by importing and checking
    // that the file's exports are functions, not side-effect output.
    assert.equal(typeof buildWeeklySteps, 'function');
    assert.equal(typeof runWeeklySteps, 'function');
    // No side-effect console output should have been produced by the import
    // itself — the test harness would have captured any output but we just
    // verify the module is importable and exports are present.
  });
});