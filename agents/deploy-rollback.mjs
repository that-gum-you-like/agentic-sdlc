#!/usr/bin/env node
/**
 * deploy-rollback.mjs
 * Agentic SDLC Framework — Deploy Rollback Helper
 *
 * Reads agents/project.json for `rollbackCmd`, executes it, captures output,
 * fires notify.mjs triggers (deployFailed / deployRolledBack). Zero external deps.
 *
 * Exit codes:
 *   0  rollback succeeded
 *   1  no rollbackCmd configured — manual revert required
 *   2  rollbackCmd ran but exited non-zero
 *   3  helper error (missing project.json, etc.)
 *
 * Usage:
 *   node agents/deploy-rollback.mjs                    # auto
 *   node agents/deploy-rollback.mjs --dry-run          # show, don't run
 *   node agents/deploy-rollback.mjs --confirm          # interactive confirm
 *   node agents/deploy-rollback.mjs --reason "<msg>"   # tag notification
 *   node agents/deploy-rollback.mjs --no-debounce      # bypass notification debounce
 */

import fs from 'fs';
import { resolve, dirname, join } from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';
import { triggerNotification } from './notify.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');
const NO_DEBOUNCE = process.argv.includes('--no-debounce');
const reasonIdx = process.argv.indexOf('--reason');
const REASON = reasonIdx !== -1 ? process.argv[reasonIdx + 1] : 'unspecified';

const DEFAULT_DEBOUNCE_SECONDS = 300;
const MAX_NOTIFICATION_PAYLOAD = 4 * 1024; // 4KB

function readProjectJson() {
  try {
    const config = loadConfig();
    const path = join(config.agentsDir, 'project.json');
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`[deploy-rollback] Failed to read project.json: ${err.message}`);
    process.exit(3);
  }
}

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 60) + `\n...truncated, full output in pm/logs/rollback-${Date.now()}.log`;
}

function debouncePath(config) {
  return join(config.projectDir, 'pm', '.last-rollback');
}

function isDebounced(config, debounceSeconds) {
  if (NO_DEBOUNCE) return false;
  const path = debouncePath(config);
  if (!fs.existsSync(path)) return false;
  try {
    const lastIso = fs.readFileSync(path, 'utf8').trim();
    const lastMs = Date.parse(lastIso);
    if (!Number.isFinite(lastMs)) return false;
    const ageSeconds = (Date.now() - lastMs) / 1000;
    return ageSeconds < debounceSeconds;
  } catch {
    return false;
  }
}

function writeDebounceMarker(config) {
  const path = debouncePath(config);
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, new Date().toISOString() + '\n');
}

function dumpFullOutput(config, output) {
  const path = join(config.projectDir, 'pm', 'logs', `rollback-${Date.now()}.log`);
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, output);
  return path;
}

async function main() {
  const project = readProjectJson();
  const config = loadConfig();
  const rollbackCmd = project.rollbackCmd;
  const debounceSeconds = project.rollbackDebounce ?? DEFAULT_DEBOUNCE_SECONDS;

  if (!rollbackCmd) {
    const msg = `No rollbackCmd configured in agents/project.json. Manual revert required. Reason: ${REASON}`;
    console.error(`[deploy-rollback] ${msg}`);
    triggerNotification('deployFailed', msg);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(`[deploy-rollback] DRY RUN — would execute: ${rollbackCmd}`);
    console.log(`[deploy-rollback] DRY RUN — reason: ${REASON}`);
    console.log(`[deploy-rollback] DRY RUN — debounce: ${debounceSeconds}s${NO_DEBOUNCE ? ' (overridden)' : ''}`);
    console.log(`[deploy-rollback] DRY RUN — would trigger: deployRolledBack on success / deployFailed on failure`);
    process.exit(0);
  }

  if (CONFIRM) {
    process.stdout.write(`[deploy-rollback] About to run: ${rollbackCmd}\n[deploy-rollback] Continue? (y/N) `);
    const answer = fs.readFileSync(0, 'utf8').trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      console.log('[deploy-rollback] Aborted by user.');
      process.exit(0);
    }
  }

  console.log(`[deploy-rollback] Executing rollbackCmd: ${rollbackCmd}`);
  const result = spawnSync(rollbackCmd, { shell: true, encoding: 'utf8' });
  const combinedOutput = (result.stdout || '') + (result.stderr || '');

  if (result.status !== 0) {
    const fullPath = combinedOutput.length > MAX_NOTIFICATION_PAYLOAD
      ? dumpFullOutput(config, combinedOutput)
      : null;
    const payload = truncate(combinedOutput, MAX_NOTIFICATION_PAYLOAD);
    const msg = `Rollback command FAILED (exit ${result.status}). Reason: ${REASON}\nOutput:\n${payload}`;
    console.error(`[deploy-rollback] ${msg}`);
    if (fullPath) console.error(`[deploy-rollback] Full output: ${fullPath}`);
    triggerNotification('deployFailed', msg);
    process.exit(2);
  }

  const fullPath = combinedOutput.length > MAX_NOTIFICATION_PAYLOAD
    ? dumpFullOutput(config, combinedOutput)
    : null;
  const payload = truncate(combinedOutput, MAX_NOTIFICATION_PAYLOAD);

  if (isDebounced(config, debounceSeconds)) {
    console.warn(`[deploy-rollback] Rollback succeeded but notification debounced (last fire <${debounceSeconds}s ago)`);
  } else {
    const msg = `Rollback succeeded. Reason: ${REASON}\nOutput:\n${payload}`;
    triggerNotification('deployRolledBack', msg);
    writeDebounceMarker(config);
  }

  if (fullPath) console.log(`[deploy-rollback] Full output: ${fullPath}`);
  console.log(`[deploy-rollback] Rollback complete.`);
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === __filename;
if (isMain) {
  main().catch((err) => {
    console.error(`[deploy-rollback] Unexpected error: ${err.message}`);
    process.exit(3);
  });
}
