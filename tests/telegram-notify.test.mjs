/**
 * Delivered Telegram status messages are mirrored to a local JSONL log — the Bot API
 * cannot read back what a bot sent, so without it nobody can audit the reports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordSent, sendTelegram } from '../agents/telegram-notify.mjs';

test('recordSent appends one JSON line per delivered message', () => {
  const log = join(mkdtempSync(join(tmpdir(), 'tg-')), 'nested', 'sent.jsonl');
  recordSent('first', {}, log);
  recordSent('second\nline', {}, log);
  const rows = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(r => r.message), ['first', 'second\nline']);
  assert.ok(rows.every(r => !Number.isNaN(Date.parse(r.ts))));
});

test('an unconfigured send is not logged', async () => {
  // Env credentials win over config; the review gate runs with ~/.hermes/.env loaded,
  // so without this the test would send a REAL message.
  const saved = { t: process.env.TELEGRAM_BOT_TOKEN, c: process.env.TELEGRAM_CHAT_ID };
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
  try {
  const log = join(mkdtempSync(join(tmpdir(), 'tg-')), 'sent.jsonl');
  const res = await sendTelegram('x', { config: { notification: { telegram: {} } }, sentLog: log });
  assert.equal(res.sent, false);
  assert.equal(existsSync(log), false);
  } finally {
    if (saved.t !== undefined) process.env.TELEGRAM_BOT_TOKEN = saved.t;
    if (saved.c !== undefined) process.env.TELEGRAM_CHAT_ID = saved.c;
  }
});

test('real sends are suppressed under node --test; an injected transport still works', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'tg-')), 'sent.jsonl');
  const creds = { config: { notification: { telegram: { botToken: 'x', chatId: '1' } } }, sentLog: log };
  assert.ok(process.env.NODE_TEST_CONTEXT, 'node --test marks test processes');
  const blocked = await sendTelegram('HTASK fixture', creds);
  assert.deepEqual(blocked, { sent: false, reason: 'suppressed under node --test' });
  const posted = [];
  const ok = await sendTelegram('injected', { ...creds, post: async (_t, _c, m) => { posted.push(m); return { sent: true }; } });
  assert.equal(ok.sent, true);
  assert.deepEqual(posted, ['injected']);
});
