#!/usr/bin/env node
/**
 * Tests for the best-effort desktop popup channel in notify.mjs
 * (openspec: telegram-activation, REQ-003).
 *
 * The popup is a courtesy layered on the primary provider: it must never
 * throw, and its outcome must never leak into sendNotification's result.
 *
 * Run: node tests/notify-desktop.test.mjs
 */

import { sendDesktopNotification } from '../agents/notify.mjs';

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

console.log('notify desktop-popup tests');

test('returns false (never throws) when notify-send is unavailable', () => {
  const result = sendDesktopNotification('hello', {
    execFn: () => { throw new Error('notify-send: command not found'); },
  });
  assert(result === false, 'a missing notify-send must yield false, not a throw');
});

test('returns true when the popup command succeeds', () => {
  const result = sendDesktopNotification('hello', { execFn: () => '' });
  assert(result === true, 'a successful popup must yield true');
});

test('supplies the standard user-bus DBUS address when the env lacks one', () => {
  const saved = process.env.DBUS_SESSION_BUS_ADDRESS;
  delete process.env.DBUS_SESSION_BUS_ADDRESS;
  let seenEnv = null;
  try {
    sendDesktopNotification('hello', { execFn: (_cmd, opts) => { seenEnv = opts.env; return ''; } });
  } finally {
    if (saved !== undefined) process.env.DBUS_SESSION_BUS_ADDRESS = saved;
  }
  assert(seenEnv && /unix:path=\/run\/user\/\d+\/bus/.test(seenEnv.DBUS_SESSION_BUS_ADDRESS),
    'timer-run units have no session bus address — the helper must supply the standard user-bus path');
});

test('escapes double quotes in the message (no shell breakage)', () => {
  let seenCmd = '';
  sendDesktopNotification('a "quoted" msg', { execFn: (cmd) => { seenCmd = cmd; return ''; } });
  assert(seenCmd.includes('a \\"quoted\\" msg'), `quotes must be escaped in: ${seenCmd}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
