#!/usr/bin/env node
/**
 * Tests for outbox artifact delivery (openspec: operator-desktop-launcher
 * REQ-002/REQ-003): notify.mjs deliverArtifact, deploy receipts, and the
 * drain's failed-log producer.
 *
 * Run: node tests/outbox.test.mjs
 */

import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { deliverArtifact } from '../agents/notify.mjs';
import { writeDeployReceipt } from '../agents/deploy-runner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    fn();
    console.log('OK');
    passed++;
  } catch (err) {
    console.log('FAIL');
    failures.push({ name, err: err.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('outbox tests');

test('deliverArtifact copies with a sortable timestamp prefix and notifies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
  try {
    const src = join(dir, 'report.txt');
    writeFileSync(src, 'hello');
    const notes = [];
    const dest = deliverArtifact(src, 'test note', { outboxDir: join(dir, 'box'), notifyFn: (m) => notes.push(m) });
    assert(dest && existsSync(dest), 'file must land in the outbox');
    assert(/\d{8}-\d{6}-report\.txt$/.test(dest), `timestamp-prefixed name, got ${dest}`);
    assert(readFileSync(dest, 'utf8') === 'hello', 'content preserved');
    assert(notes.length === 1 && notes[0].includes('test note'), 'notification names the delivery');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deliverArtifact returns false (never throws) on a missing source or failed copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
  try {
    assert(deliverArtifact(join(dir, 'nope.txt'), 'x', { outboxDir: dir, notifyFn: () => {} }) === false, 'missing source → false');
    const src = join(dir, 'real.txt');
    writeFileSync(src, 'x');
    const r = deliverArtifact(src, 'x', { outboxDir: dir, notifyFn: () => {}, copyFn: () => { throw new Error('disk full'); } });
    assert(r === false, 'copy failure → false, not a throw');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeDeployReceipt records project, sha, verify status, and url', () => {
  const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
  try {
    const path = writeDeployReceipt({
      projectName: 'pilot', targetSha: 'abcdef0123456789', baseBranch: 'main',
      verifyStatus: 200, smokeUrl: 'https://x.vercel.app', outboxDir: dir,
    });
    assert(path && existsSync(path), 'receipt written');
    const body = readFileSync(path, 'utf8');
    assert(/pilot/.test(body) && /abcdef01/.test(path) && /HTTP 200/.test(body) && /x\.vercel\.app/.test(body),
      `receipt content incomplete:\n${body}`);
    assert(readdirSync(dir).length === 1, 'exactly one file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('failed drains copy their log into the outbox (source assertion, best-effort)', () => {
  const s = readFileSync(join(root, 'agents', 'hermes-drain.sh'), 'utf8');
  assert(/HERMES_OUTBOX:-\$HOME\/hermes-outbox/.test(s), 'drain must honor HERMES_OUTBOX with the standard default');
  const block = s.match(/if \[ "\$rc" -ne 0 \]; then[\s\S]*?\nfi/);
  assert(block && /cp "\$logfile".*\|\| true/.test(block[0]), 'failed-run log copy must exist and be || true guarded');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
