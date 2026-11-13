/**
 * memory-audit.test.mjs — Memory audit logging tests (CV-REQ-072)
 *
 * Tests that saveMemory appends {ts,agent,layer,bytesBefore,bytesAfter,sha256}
 * to <stateDir>/memory-audit.jsonl (RS-REQ-011), and that audit failures never fail the memory save.
 *
 * Run with:
 *   node --test agents/__tests__/memory-audit.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');

describe('memory-manager.mjs — audit logging (CV-REQ-072)', () => {
  let saveMemory, loadMemory;
  const TMP_PROJECT = join(tmpdir(), `sdlc-mem-audit-${process.pid}`);
  const STATE = join(TMP_PROJECT, 'state'); // runtime state dir (RS-REQ-010/011)

  before(async () => {
    // Scaffold a minimal project
    mkdirSync(join(TMP_PROJECT, 'agents', 'testagent', 'memory'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'pm'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'Test Project',
      agents: ['testagent'],
      memoryTokenBudget: 4000,
    }));

    // Set env var BEFORE importing so loadConfig picks it up (cached on first call)
    process.env.SDLC_PROJECT_DIR = TMP_PROJECT;
    process.env.SDLC_STATE_DIR = STATE;
    const mod = await import(resolve(AGENTS_DIR, 'memory-manager.mjs'));
    saveMemory = mod.saveMemory;
    loadMemory = mod.loadMemory;
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('save writes one audit line with correct sha256', async () => {
    const data = { identity: { name: 'test', role: 'tester' } };
    saveMemory('testagent', 'core', data);

    // Memory file must exist and have correct content
    const memPath = resolve(STATE, 'memory', 'testagent', 'core.json');
    assert.ok(existsSync(memPath), 'memory file should be created');
    const saved = JSON.parse(readFileSync(memPath, 'utf8'));
    assert.equal(saved.identity.name, 'test');

    // Audit log must have exactly one line
    const auditPath = resolve(STATE, 'memory-audit.jsonl');
    assert.ok(existsSync(auditPath), 'audit log should be created');
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'audit log should have exactly one entry');

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.agent, 'testagent');
    assert.equal(entry.layer, 'core');
    assert.ok(!isNaN(Date.parse(entry.ts)), 'ts should be valid ISO date');
    assert.equal(typeof entry.bytesBefore, 'number');
    assert.equal(typeof entry.bytesAfter, 'number');
    assert.equal(typeof entry.sha256, 'string');
    assert.equal(entry.sha256.length, 64, 'SHA-256 hex string should be 64 characters');

    // Verify sha256 is correct by recomputing
    const content = JSON.stringify(data, null, 2);
    const { createHash } = await import('crypto');
    const expectedSha = createHash('sha256').update(content, 'utf8').digest('hex');
    assert.equal(entry.sha256, expectedSha, 'sha256 should match content hash');
  });

  it('unwritable audit path still saves the memory file', () => {
    // Make every audit target unwritable: state audit path is a directory, pm/ is a file
    rmSync(join(STATE, 'memory-audit.jsonl'), { force: true });
    mkdirSync(join(STATE, 'memory-audit.jsonl'));
    rmSync(join(TMP_PROJECT, 'pm'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'pm'), 'not-a-directory');

    const data = { identity: { name: 'survivor', role: 'audit-failure' } };
    // This must NOT throw
    saveMemory('testagent', 'core', data);

    // Memory file must still have been written
    const memPath = resolve(STATE, 'memory', 'testagent', 'core.json');
    assert.ok(existsSync(memPath), 'memory file should still be saved');
    const saved = JSON.parse(readFileSync(memPath, 'utf8'));
    assert.equal(saved.identity.name, 'survivor', 'memory content should match');
  });
});