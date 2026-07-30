#!/usr/bin/env node
/**
 * Tests for install-desktop-launcher.mjs (openspec: operator-desktop-launcher).
 * Installs into a temp XDG_DATA_HOME — the real desktop is never touched.
 *
 * Run: node tests/install-desktop-launcher.test.mjs
 */

import { existsSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

import { install, uninstall, status, buildDesktopEntry, resolvePaths, APP_ID } from '../agents/install-desktop-launcher.mjs';

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

console.log('install-desktop-launcher tests');

const fakeWhich = (bin) => ({
  hermes: '/home/x/.local/bin/hermes',
  'gnome-terminal': '/usr/bin/gnome-terminal',
  journalctl: '/usr/bin/journalctl',
  'xdg-open': '/usr/bin/xdg-open',
}[bin] || null);

test('buildDesktopEntry renders absolute paths only — no ~, no $VARS', () => {
  const p = resolvePaths({ home: '/home/x', xdgDataHome: '/home/x/.local/share', whichFn: fakeWhich });
  const entry = buildDesktopEntry(p);
  assert(/^Exec=\/usr\/bin\/gnome-terminal --title=Hermes -- \/home\/x\/\.local\/bin\/hermes$/m.test(entry),
    `main Exec must be absolute: ${entry.match(/^Exec=.*$/m)}`);
  assert(!/(^|\s)~\//.test(entry), 'no unexpanded ~ (desktop Exec lines do not expand it)');
  assert(!/\$[A-Z]/.test(entry), 'no $VARS (desktop Exec lines do not expand them)');
  assert(/Actions=dashboard;logs;/.test(entry), 'both desktop actions declared');
  assert(/\[Desktop Action dashboard\]/.test(entry) && /127\.0\.0\.1:7777/.test(entry), 'dashboard action opens the command center');
  assert(/\[Desktop Action logs\]/.test(entry) && /journalctl --user -fu hermes-gateway/.test(entry), 'logs action follows the gateway');
  assert(new RegExp(`^Icon=${APP_ID}$`, 'm').test(entry), 'themed icon name');
});

test('install → status → uninstall cycle in a temp XDG_DATA_HOME, idempotent, removes only its own files', () => {
  const xdg = mkdtempSync(join(tmpdir(), 'launcher-xdg-'));
  try {
    const opts = { home: '/home/x', xdgDataHome: xdg, whichFn: fakeWhich };
    const p = install(opts);
    assert(existsSync(p.desktopFile) && existsSync(p.iconFile), 'both files installed');
    assert(p.desktopFile.startsWith(xdg), 'installed under the temp XDG dir, not the real one');

    // desktop-file-validate (when present on the host) must accept the entry.
    // The "is it installed" probe and the "does it validate" check are kept in
    // separate try/catches on purpose: both execFileSync calls throw an Error
    // whose .message contains the string "desktop-file-validate" (it's just the
    // argv), so a single catch block can't tell "validator missing" (fine, skip)
    // apart from "validator ran and rejected the file" (a real failure) by
    // pattern-matching the message. That conflation is exactly what made this
    // test fail on CI's headless runner, which doesn't have desktop-file-utils
    // installed — the "not installed" case was being mistaken for a validation
    // failure and rethrown. Checking existence first, unconditionally, and only
    // ever letting the validate call itself throw fixes that.
    let validatorPath = null;
    try {
      validatorPath = execFileSync('which', ['desktop-file-validate'], { stdio: 'pipe' }).toString().trim();
    } catch {
      validatorPath = null; // not installed on this host — acceptable, unit checks above still hold
    }
    if (validatorPath) {
      execFileSync('desktop-file-validate', [p.desktopFile], { stdio: 'pipe' }); // throws (and fails the test) if actually invalid
    }

    const s1 = status(opts);
    assert(s1.desktopInstalled && s1.iconInstalled, 'status sees both files');

    install(opts); // idempotent re-install
    assert(readFileSync(p.desktopFile, 'utf8').includes('[Desktop Entry]'), 're-install keeps a valid entry');

    const removed = uninstall(opts);
    assert(removed.length === 2, `uninstall removes exactly its two files, got ${removed.length}`);
    const s2 = status(opts);
    assert(!s2.desktopInstalled && !s2.iconInstalled, 'clean after uninstall');
  } finally {
    rmSync(xdg, { recursive: true, force: true });
  }
});

test('falls back to conventional paths when binaries are not on PATH', () => {
  const p = resolvePaths({ home: '/home/x', xdgDataHome: '/tmp/x', whichFn: () => null });
  assert(p.hermesBin === '/home/x/.local/bin/hermes', 'hermes falls back to ~/.local/bin');
  assert(p.terminalBin === '/usr/bin/gnome-terminal', 'terminal falls back to /usr/bin');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
