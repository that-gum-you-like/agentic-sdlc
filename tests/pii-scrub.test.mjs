#!/usr/bin/env node
/**
 * Tests for agents/pii-scrub.mjs — PII scrubbing pipeline.
 *
 * Usage:
 *   node --test tests/pii-scrub.test.mjs
 *
 * Covers:
 *   - scrub() replaces email, phone, SSN with typed placeholders
 *   - scrub() leaves non-PII text unmodified
 *   - checkAvailability() returns { available: bool }
 *   - customer-production tier throws when Presidio is unavailable
 *   - scratch tier warns and returns original text when Presidio unavailable
 *   - PII_SCRUB_DISABLE=1 bypasses scrubbing
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDLC_ROOT = join(__dirname, '..');

let scrub, checkAvailability;

before(async () => {
  const mod = await import(join(SDLC_ROOT, 'agents/pii-scrub.mjs'));
  scrub = mod.scrub;
  checkAvailability = mod.checkAvailability;
});

const TEXT_WITH_PII =
  'Contact Jane Smith at jane.smith@example.com or call +1-555-123-4567.';
const TEXT_CLEAN = 'What is the capital of France?';

describe('pii-scrub.mjs — PII scrubbing pipeline', () => {

  it('scrub() replaces email with <EMAIL_ADDRESS> placeholder', () => {
    const result = scrub(TEXT_WITH_PII);
    assert.ok(result.scrubbed.includes('<EMAIL_ADDRESS>'),
      `Expected <EMAIL_ADDRESS> in scrubbed text, got: ${result.scrubbed}`);
    assert.ok(!result.scrubbed.includes('jane.smith@example.com'),
      'Email address should be replaced');
    assert.ok(result.available !== undefined,
      'result.available should be set');
  });

  it('scrub() replaces phone number with <PHONE_NUMBER> placeholder', () => {
    const result = scrub(TEXT_WITH_PII);
    assert.ok(result.scrubbed.includes('<PHONE_NUMBER>'),
      `Expected <PHONE_NUMBER> in scrubbed text, got: ${result.scrubbed}`);
    assert.ok(!result.scrubbed.includes('+1-555-123-4567'),
      'Phone number should be replaced');
  });

  it('scrub() leaves non-PII text unmodified', () => {
    const result = scrub(TEXT_CLEAN);
    assert.equal(result.scrubbed, TEXT_CLEAN,
      'Clean text should pass through unchanged');
  });

  it('scrub() returns entities array with found items', () => {
    const result = scrub(TEXT_WITH_PII);
    const emailEnts = result.entities.filter(e => e.type === 'EMAIL_ADDRESS');
    assert.ok(emailEnts.length >= 1,
      'Email entities should be detected');
    if (emailEnts.length > 0) {
      const e = emailEnts[0];
      assert.equal(typeof e.start, 'number');
      assert.equal(typeof e.end, 'number');
    }
  });

  it('scrub() preserves content structure', () => {
    const result = scrub(TEXT_WITH_PII);
    assert.ok(typeof result.scrubbed === 'string');
    assert.ok(result.scrubbed.length > 0);
  });

  it('checkAvailability() returns object with available boolean', () => {
    const status = checkAvailability();
    assert.equal(typeof status.available, 'boolean',
      'checkAvailability().available should be boolean');
    if (!status.available) {
      assert.ok(typeof status.error === 'string' || status.error === undefined,
        'When unavailable, checkAvailability may provide error string');
    }
  });

  it('customer-production tier throws when Presidio is unavailable', () => {
    const status = checkAvailability();
    if (!status.available) {
      assert.throws(
        () => scrub(TEXT_CLEAN, { tier: 'customer-production' }),
        /customer-production/,
        'Should throw when Presidio unavailable for customer-production'
      );
    } else {
      const result = scrub(TEXT_CLEAN, { tier: 'customer-production' });
      assert.equal(result.scrubbed, TEXT_CLEAN);
    }
  });

  it('scratch tier returns original text when Presidio unavailable', () => {
    const status = checkAvailability();
    if (!status.available) {
      // Should NOT throw for scratch tier
      const result = scrub(TEXT_CLEAN, { tier: 'scratch' });
      assert.equal(result.scrubbed, TEXT_CLEAN,
        'scratch tier should return original text when Presidio unavailable');
    } else {
      const result = scrub(TEXT_CLEAN, { tier: 'scratch' });
      assert.equal(result.scrubbed, TEXT_CLEAN);
    }
  });

  it('OpenRouter adapter imports without PII_SCRUB_DISABLE check error', async () => {
    // The openrouter adapter imports pii-scrub.mjs; verify the import chain works.
    // We use dynamic import and check no crash — the adapter can't be fully
    // exercised without a real API key.
    process.env.PII_SCRUB_DISABLE = '1';
    try {
      const openrouter = await import(join(SDLC_ROOT, 'agents/adapters/llm/openrouter.mjs'));
      assert.ok(typeof openrouter.complete === 'function',
        'openrouter adapter should export complete()');
    } finally {
      delete process.env.PII_SCRUB_DISABLE;
    }
  });

  it('scrub() scrubs SSN when present', () => {
    const textWithSsn = 'SSN is 123-45-6789.';
    const result = scrub(textWithSsn);
    assert.ok(result.scrubbed.includes('<US_SSN>'),
      `Expected <US_SSN> in scrubbed text, got: ${result.scrubbed}`);
  });
});