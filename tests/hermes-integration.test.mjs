#!/usr/bin/env node
/**
 * Tests for the hermes-integration change — the five automation scripts.
 *
 * Covers openspec/changes/hermes-integration/specs/autonomous-cron-scripts.md
 * (REQ-003, REQ-004, REQ-005): side-effect-free import, correct return shapes,
 * telegram no-op when unconfigured, rag-indexer graceful lexical fallback.
 *
 * Run: node tests/hermes-integration.test.mjs
 */

import { existsSync, statSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const __repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Ensure telegram is treated as unconfigured regardless of the host env.
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

// Importing each module MUST be side-effect-free (guarded by __isMainModule).
// If any of these ran their CLI block on import, the process would print/exit here.
import { runRedTeam } from '../agents/red-team-tester.mjs';
import { runIndexer } from '../agents/rag-indexer.mjs';
import { runHealthCheck } from '../agents/health-check.mjs';
import { sendTelegram } from '../agents/telegram-notify.mjs';
import { runDocumentSync } from '../agents/document-sync.mjs';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
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

const DOC_VERSIONS = resolve(process.cwd(), 'pm', 'doc-versions.json');

async function main() {
  console.log('hermes-integration script tests');

  // --- exports exist (import was side-effect-free) ---
  await test('all five scripts export their core function', () => {
    assert(typeof runRedTeam === 'function', 'runRedTeam not a function');
    assert(typeof runIndexer === 'function', 'runIndexer not a function');
    assert(typeof runHealthCheck === 'function', 'runHealthCheck not a function');
    assert(typeof sendTelegram === 'function', 'sendTelegram not a function');
    assert(typeof runDocumentSync === 'function', 'runDocumentSync not a function');
  });

  // --- health-check ---
  await test('runHealthCheck returns a valid status + checks', () => {
    const r = runHealthCheck();
    assert(['ok', 'degraded', 'down'].includes(r.status), `bad status: ${r.status}`);
    assert(Array.isArray(r.checks) && r.checks.length > 0, 'checks not a non-empty array');
    for (const c of r.checks) {
      assert(typeof c.name === 'string', 'check missing name');
      assert(['ok', 'degraded', 'down'].includes(c.status), `check ${c.name} bad status`);
    }
    assert(typeof r.timestamp === 'string', 'missing timestamp');
  });

  // --- red-team-tester ---
  await test('runRedTeam(dryRun) scans and returns findings array', () => {
    const r = runRedTeam({ dryRun: true });
    assert(typeof r.scanned === 'number', 'scanned not a number');
    assert(r.scanned > 0, 'expected to scan at least the AGENT.md prompts');
    assert(Array.isArray(r.findings), 'findings not an array');
    for (const f of r.findings) {
      assert(typeof f.file === 'string', 'finding missing file');
      assert(['low', 'medium', 'high'].includes(f.severity), `finding bad severity: ${f.severity}`);
    }
  });

  // --- rag-indexer (graceful fallback) ---
  await test('runIndexer(dryRun) returns counts and a valid mode', () => {
    const r = runIndexer({ dryRun: true });
    assert(typeof r.documents === 'number', 'documents not a number');
    assert(typeof r.chunks === 'number', 'chunks not a number');
    assert(['embedding', 'lexical'].includes(r.mode), `bad mode: ${r.mode}`);
    assert(typeof r.indexPath === 'string', 'missing indexPath');
  });

  // --- rag-indexer embed path (regression: E2BIG fix uses stdin, not shell arg) ---
  // The embed function is injected so we exercise the real batching/index-write
  // path deterministically without a slow CPU model. The production callEmbed now
  // streams the payload over stdin (embed.py), so large corpora no longer overflow
  // ARG_MAX — that shell-arg construction is gone entirely.
  await test('runIndexer writes an embedding index via the batched embed path', () => {
    const captured = [];
    const embedFn = (texts) => { captured.push(texts.length); return texts.map(() => [0.1, 0.2, 0.3]); };
    const r = runIndexer({ embedFn });
    assert(r.mode === 'embedding', `expected embedding mode, got ${r.mode}`);
    assert(captured.length === 1 && captured[0] === r.chunks, 'embed must receive all chunks in one batched call');
    const idx = JSON.parse(readFileSync(r.indexPath, 'utf8'));
    assert(idx.mode === 'embedding' && Array.isArray(idx.entries[0].vector), 'index must persist vectors');
  });

  // --- rag-indexer graceful degradation (scheduled job must never hard-fail) ---
  await test('runIndexer degrades to lexical when embedding throws (no crash)', () => {
    const r = runIndexer({ embedFn: () => { throw new Error('spawnSync /bin/sh ETIMEDOUT'); } });
    assert(r.mode === 'lexical', `expected lexical fallback, got ${r.mode}`);
    assert(typeof r.embeddingError === 'string' && /ETIMEDOUT/.test(r.embeddingError), 'must record the embedding error');
    const idx = JSON.parse(readFileSync(r.indexPath, 'utf8'));
    assert(idx.mode === 'lexical' && idx.entries[0].termFreq && typeof idx.entries[0].termFreq === 'object', 'fallback index must use lexical termFreq');
  });

  // --- telegram-notify (no-op when unconfigured) ---
  await test('sendTelegram no-ops when unconfigured (no network)', async () => {
    const r = await sendTelegram('test message', { config: { notification: {} } });
    assert(r && r.sent === false, 'expected sent:false when unconfigured');
    assert(typeof r.reason === 'string' && /configur/i.test(r.reason), `expected a "not configured" reason, got: ${r.reason}`);
  });

  // --- notify.mjs telegram provider registration (REQ-010) ---
  // Points load-config at a temp project with provider:telegram (unconfigured).
  // The dispatch must reach the telegram sender and no-op cleanly — no network,
  // no hang, no crash — proving the provider is wired into notify.mjs's switch.
  await test('notify.mjs registers telegram provider (dispatch + graceful no-op)', () => {
    const tmp = resolve(__repoRoot, 'pm', 'tmp-telegram-provider-test');
    mkdirSync(resolve(tmp, 'agents'), { recursive: true });
    writeFileSync(
      resolve(tmp, 'agents', 'project.json'),
      JSON.stringify({ projectName: 'tg-test', notification: { provider: 'telegram' } }),
    );
    const env = { ...process.env, SDLC_PROJECT_DIR: tmp };
    delete env.TELEGRAM_BOT_TOKEN;
    delete env.TELEGRAM_CHAT_ID;
    try {
      const notify = resolve(__repoRoot, 'agents', 'notify.mjs');

      // status must recognize telegram and report it as unconfigured (not crash).
      const status = execFileSync('node', [notify, 'status'], { env, encoding: 'utf8', timeout: 20000 });
      assert(/Provider: telegram/.test(status), 'status did not report telegram provider');
      assert(/Telegram: not configured/i.test(status), 'status did not flag telegram as unconfigured');

      // send must dispatch to the telegram sender and no-op (unconfigured) without hanging.
      // The "Telegram send failed" message originates only in notify.mjs's sendViaTelegram
      // catch — seeing it proves the switch routed to the telegram provider.
      const send = spawnSync('node', [notify, 'send', 'hermes-integration test'], { env, encoding: 'utf8', timeout: 20000 });
      assert(send.status !== null, 'notify send timed out (telegram dispatch hung on network)');
      const sendOut = `${send.stdout || ''}${send.stderr || ''}`;
      assert(/Telegram/i.test(sendOut), `send did not route through the telegram provider; got: ${sendOut}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // --- document-sync (dry-run writes nothing) ---
  await test('runDocumentSync(dryRun) returns shape and writes nothing', () => {
    const existedBefore = existsSync(DOC_VERSIONS);
    const mtimeBefore = existedBefore ? statSync(DOC_VERSIONS).mtimeMs : null;

    const r = runDocumentSync({ dryRun: true });
    assert(typeof r.tracked === 'number', 'tracked not a number');
    assert(Array.isArray(r.changed), 'changed not an array');
    assert(Array.isArray(r.newDocs), 'newDocs not an array');

    if (!existedBefore) {
      assert(!existsSync(DOC_VERSIONS), 'dry-run must not create pm/doc-versions.json');
    } else {
      assert(statSync(DOC_VERSIONS).mtimeMs === mtimeBefore, 'dry-run must not modify pm/doc-versions.json');
    }
  });

  // --- summary ---
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
    process.exit(1);
  }
}

main();
