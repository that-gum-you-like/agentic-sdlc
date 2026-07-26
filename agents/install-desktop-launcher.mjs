#!/usr/bin/env node
/**
 * install-desktop-launcher.mjs
 * Agentic SDLC Framework — GNOME desktop launcher for the Hermes agent
 * (openspec: operator-desktop-launcher).
 *
 * Installs a .desktop entry (icon-click → gnome-terminal running the Hermes
 * chat CLI; right-click actions → Dashboard / Gateway logs) plus the SVG icon
 * into the user's XDG data dirs. Zero npm deps, same pattern as
 * scheduler-install.mjs. Absolute paths are resolved at INSTALL time — desktop
 * Exec lines expand neither ~ nor $VARS.
 *
 * Usage:
 *   node agents/install-desktop-launcher.mjs install
 *   node agents/install-desktop-launcher.mjs uninstall
 *   node agents/install-desktop-launcher.mjs status
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, copyFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

export const APP_ID = 'hermes-sdlc';
const DASHBOARD_URL = process.env.HERMES_DASHBOARD_URL || 'http://127.0.0.1:7777';

function which(bin, whichFn) {
  const w = whichFn || ((b) => {
    try { return execFileSync('which', [b], { encoding: 'utf8' }).trim(); } catch { return null; }
  });
  return w(bin);
}

/** Resolve every path the launcher needs. Pure given { home, whichFn }. */
export function resolvePaths({ home = homedir(), xdgDataHome = process.env.XDG_DATA_HOME, whichFn } = {}) {
  const dataHome = xdgDataHome || join(home, '.local', 'share');
  return {
    desktopFile: join(dataHome, 'applications', `${APP_ID}.desktop`),
    iconFile: join(dataHome, 'icons', 'hicolor', 'scalable', 'apps', `${APP_ID}.svg`),
    iconSource: resolve(__dirname, '..', 'docs', 'assets', 'hermes.svg'),
    hermesBin: which('hermes', whichFn) || join(home, '.local', 'bin', 'hermes'),
    terminalBin: which('gnome-terminal', whichFn) || '/usr/bin/gnome-terminal',
    journalctlBin: which('journalctl', whichFn) || '/usr/bin/journalctl',
    xdgOpenBin: which('xdg-open', whichFn) || '/usr/bin/xdg-open',
  };
}

/** Render the .desktop entry. Pure — unit tested. */
export function buildDesktopEntry(p) {
  return `[Desktop Entry]
Type=Application
Name=Hermes Agent
Comment=Chat with the Hermes autonomous SDLC agent (OpenRouter, self-hosted)
Exec=${p.terminalBin} --title=Hermes -- ${p.hermesBin}
Icon=${APP_ID}
Terminal=false
Categories=Development;Utility;
Keywords=hermes;agent;sdlc;ai;
Actions=dashboard;logs;

[Desktop Action dashboard]
Name=Command Center dashboard
Exec=${p.xdgOpenBin} ${DASHBOARD_URL}

[Desktop Action logs]
Name=Gateway logs
Exec=${p.terminalBin} --title=Hermes\\u0020logs -- ${p.journalctlBin} --user -fu hermes-gateway
`;
}

function refreshDesktopDatabase(p) {
  const udd = which('update-desktop-database');
  if (udd) {
    try { execFileSync(udd, [dirname(p.desktopFile)], { stdio: 'pipe' }); } catch { /* cosmetic */ }
  }
}

export function install(opts = {}) {
  const p = resolvePaths(opts);
  mkdirSync(dirname(p.desktopFile), { recursive: true });
  mkdirSync(dirname(p.iconFile), { recursive: true });
  writeFileSync(p.desktopFile, buildDesktopEntry(p));
  copyFileSync(p.iconSource, p.iconFile);
  refreshDesktopDatabase(p);
  return p;
}

export function uninstall(opts = {}) {
  const p = resolvePaths(opts);
  const removed = [];
  for (const f of [p.desktopFile, p.iconFile]) {
    if (existsSync(f)) { unlinkSync(f); removed.push(f); }
  }
  refreshDesktopDatabase(p);
  return removed;
}

export function status(opts = {}) {
  const p = resolvePaths(opts);
  const desktopInstalled = existsSync(p.desktopFile);
  const iconInstalled = existsSync(p.iconFile);
  let valid = null; // null = validator unavailable
  const validator = which('desktop-file-validate');
  if (desktopInstalled && validator) {
    try { execFileSync(validator, [p.desktopFile], { stdio: 'pipe' }); valid = true; } catch { valid = false; }
  }
  return { desktopInstalled, iconInstalled, valid, paths: p };
}

if (__isMainModule()) {
  const cmd = process.argv[2];
  if (cmd === 'install') {
    const p = install();
    console.log(`✅ Installed launcher: ${p.desktopFile}`);
    console.log(`   Icon: ${p.iconFile}`);
    console.log(`   Launch "Hermes Agent" from GNOME Activities (right-click for Dashboard / Logs).`);
  } else if (cmd === 'uninstall') {
    const removed = uninstall();
    console.log(removed.length ? `🗑  Removed:\n  ${removed.join('\n  ')}` : 'Nothing installed.');
  } else if (cmd === 'status') {
    const s = status();
    console.log(`Launcher: ${s.desktopInstalled ? '✅' : '❌'} ${s.paths.desktopFile}`);
    console.log(`Icon:     ${s.iconInstalled ? '✅' : '❌'} ${s.paths.iconFile}`);
    console.log(`Valid:    ${s.valid === null ? '(desktop-file-validate not installed)' : s.valid ? '✅' : '❌'}`);
  } else {
    console.log('Usage: install-desktop-launcher.mjs install|uninstall|status');
    process.exit(cmd ? 1 : 0);
  }
}
