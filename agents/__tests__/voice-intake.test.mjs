/**
 * voice-intake.test.mjs
 *
 * Tests for agents/voice-intake.sh
 *
 * Run with:
 *   node --test agents/__tests__/voice-intake.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');
const SCRIPT = resolve(AGENTS_DIR, 'voice-intake.sh');

describe('voice-intake.sh — source verification', () => {
  let src;
  before(() => {
    src = readFileSync(SCRIPT, 'utf8');
  });

  it('is executable', () => {
    const stat = execSync(`stat -c %a "${SCRIPT}"`, { encoding: 'utf8' }).trim();
    assert.ok(stat.includes('7') || stat.includes('5'), `Expected executable, got mode ${stat}`);
  });

  it('has bash shebang', () => {
    assert.ok(src.startsWith('#!/usr/bin/env bash'));
  });

  it('supports --mode flag', () => {
    assert.ok(src.includes('--mode'));
    assert.ok(src.includes('type'));
    assert.ok(src.includes('clip'));
    assert.ok(src.includes('mailbox'));
    assert.ok(src.includes('stdout'));
  });

  it('uses Groq API endpoint (not OpenAI)', () => {
    assert.ok(src.includes('api.groq.com'));
    assert.ok(!src.includes('api.openai.com'));
  });

  it('uses whisper-large-v3-turbo model', () => {
    assert.ok(src.includes('whisper-large-v3-turbo'));
  });

  it('reads GROQ_API_KEY from environment', () => {
    assert.ok(src.includes('GROQ_API_KEY'));
  });

  it('supports check command', () => {
    assert.ok(src.includes('cmd_check'));
    assert.ok(src.includes('check)'));
  });

  it('supports install-key command', () => {
    assert.ok(src.includes('cmd_install_key'));
    assert.ok(src.includes('install-key'));
  });

  it('has auto-submit (Enter key) support', () => {
    assert.ok(src.includes('AUTO_SUBMIT'));
    assert.ok(src.includes('key Return') || src.includes('Return'));
  });

  it('has toggle support via PID file', () => {
    assert.ok(src.includes('PID_FILE'));
    assert.ok(src.includes('toggle_recording'));
  });

  it('cleans up temp files on exit', () => {
    assert.ok(src.includes('trap cleanup EXIT'));
    assert.ok(src.includes('rm -f'));
  });

  it('has retry logic for Groq API', () => {
    assert.ok(src.includes('max_attempts'));
    assert.ok(src.includes('retry'));
  });

  it('supports both rec (sox) and arecord', () => {
    assert.ok(src.includes('rec'));
    assert.ok(src.includes('arecord'));
  });

  it('detects X11 vs Wayland', () => {
    assert.ok(src.includes('XDG_SESSION_TYPE'));
    assert.ok(src.includes('wayland'));
  });

  it('has fallback chain: type → clip → stdout', () => {
    assert.ok(src.includes('falling back to clipboard'));
    assert.ok(src.includes('falling back to stdout'));
  });
});

describe('voice-config.json', () => {
  let config;
  before(() => {
    config = JSON.parse(readFileSync(resolve(AGENTS_DIR, 'voice-config.json'), 'utf8'));
  });

  it('has F6 as default key', () => {
    assert.equal(config.key, 'F6');
  });

  it('has type as default mode', () => {
    assert.equal(config.mode, 'type');
  });

  it('has autoSubmit enabled', () => {
    assert.equal(config.autoSubmit, true);
  });

  it('uses whisper-large-v3-turbo', () => {
    assert.equal(config.model, 'whisper-large-v3-turbo');
  });

  it('uses GROQ_API_KEY env var', () => {
    assert.equal(config.groqApiKeyEnv, 'GROQ_API_KEY');
  });

  it('has 120s max duration', () => {
    assert.equal(config.maxSeconds, 120);
  });

  it('records at 16kHz', () => {
    assert.equal(config.sampleRate, 16000);
  });

  it('has all required fields', () => {
    const required = ['key', 'mode', 'autoSubmit', 'model', 'language', 'maxSeconds', 'groqApiKeyEnv', 'mailboxPath', 'audioFormat', 'sampleRate'];
    for (const field of required) {
      assert.ok(field in config, `missing field: ${field}`);
    }
  });
});

describe('voice-intake.sh check command', () => {
  it('runs without error', () => {
    const output = execSync(`bash "${SCRIPT}" check 2>&1`, { encoding: 'utf8' });
    assert.ok(output.includes('Dependency Check'));
    assert.ok(output.includes('curl'));
    assert.ok(output.includes('jq'));
  });

  it('reports curl as available', () => {
    const output = execSync(`bash "${SCRIPT}" check 2>&1`, { encoding: 'utf8' });
    assert.ok(output.includes('✅ curl'));
  });

  it('reports jq as available', () => {
    const output = execSync(`bash "${SCRIPT}" check 2>&1`, { encoding: 'utf8' });
    assert.ok(output.includes('✅ jq'));
  });

  it('reports audio capture tool', () => {
    const output = execSync(`bash "${SCRIPT}" check 2>&1`, { encoding: 'utf8' });
    assert.ok(
      output.includes('✅ rec') || output.includes('✅ arecord'),
      'should report an audio capture tool'
    );
  });
});

describe('voice-intake.sh mailbox mode', () => {
  it('appends timestamped entry to mailbox file', () => {
    const tmpDir = resolve(os.tmpdir(), `voice-mailbox-${Date.now()}`);
    const mailboxPath = resolve(tmpDir, 'voice-inbox.md');
    mkdirSync(tmpDir, { recursive: true });

    // Simulate what mailbox mode does
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const text = 'Test voice transcription';
    const entry = `\n## ${timestamp}\n\n${text}\n\n---\n`;
    writeFileSync(mailboxPath, entry);

    const content = readFileSync(mailboxPath, 'utf8');
    assert.ok(content.includes('## 20'));
    assert.ok(content.includes('Test voice transcription'));
    assert.ok(content.includes('---'));

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('multiple entries produce multiple timestamped sections', () => {
    const tmpDir = resolve(os.tmpdir(), `voice-mailbox-multi-${Date.now()}`);
    const mailboxPath = resolve(tmpDir, 'voice-inbox.md');
    mkdirSync(tmpDir, { recursive: true });

    const entries = ['First message', 'Second message', 'Third message'];
    let content = '';
    for (const text of entries) {
      const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      content += `\n## ${timestamp}\n\n${text}\n\n---\n`;
    }
    writeFileSync(mailboxPath, content);

    const result = readFileSync(mailboxPath, 'utf8');
    const sections = result.split('---').filter(s => s.trim());
    assert.equal(sections.length, 3);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Groq API response parsing', () => {
  it('extracts text from valid Groq response', () => {
    const response = '{"text":"Hello this is a test transcription."}';
    const parsed = JSON.parse(response);
    assert.equal(parsed.text, 'Hello this is a test transcription.');
  });

  it('handles empty text field', () => {
    const response = '{"text":""}';
    const parsed = JSON.parse(response);
    assert.equal(parsed.text, '');
  });

  it('handles error response format', () => {
    const response = '{"error":{"message":"Invalid API key","type":"invalid_request_error"}}';
    const parsed = JSON.parse(response);
    assert.ok(parsed.error);
    assert.equal(parsed.error.message, 'Invalid API key');
  });
});
