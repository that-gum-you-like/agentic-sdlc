#!/usr/bin/env node
/**
 * Monthly Review — the curriculum's monthly cycle, actually executed.
 *
 * 1. Behavior audit: full behavior tests + baseline drift check
 * 2. Agent versioning: snapshot AGENT.md files + memory-migration check
 * 3. Compost cleanup: drop compost entries older than the retention window
 * 4. Cost review: 30-day per-agent token totals from the cost ledger
 *
 * Usage:
 *   node agents/cycles/monthly-review.mjs             # Run all steps
 *   node agents/cycles/monthly-review.mjs --dry-run   # Report without writing
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

import { loadConfig } from '../load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_SCRIPTS = resolve(__dirname, '..');

const COMPOST_RETENTION_DAYS = 180;

function runStep(label, script, args = [], { allowFail = true } = {}) {
  console.log(`\n▶ ${label}`);
  console.log('─'.repeat(40));
  try {
    const out = execFileSync(process.execPath, [resolve(AGENTS_SCRIPTS, script), ...args], {
      encoding: 'utf8', timeout: 300_000,
    });
    console.log(out.trim().split('\n').slice(-12).join('\n'));
    return { label, ok: true };
  } catch (err) {
    const tail = `${err.stdout || ''}`.trim().split('\n').slice(-12).join('\n');
    console.log(tail || String(err.message));
    if (!allowFail) throw err;
    return { label, ok: false };
  }
}

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

/** 3. Compost cleanup: drop compost entries older than the retention window. */
export function cleanCompost(config, { dryRun = false } = {}) {
  console.log(`\n▶ Compost cleanup (retention: ${COMPOST_RETENTION_DAYS} days)`);
  console.log('─'.repeat(40));
  let removedTotal = 0;
  for (const agent of config.agents || []) {
    const path = resolve(config.agentsDir, agent, 'memory', 'compost.json');
    if (!existsSync(path)) continue;
    let compost;
    try { compost = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
    const entries = compost.entries || [];
    const kept = entries.filter(e => {
      const date = e.date || e.timestamp;
      return !date || daysSince(date) <= COMPOST_RETENTION_DAYS;
    });
    const removed = entries.length - kept.length;
    if (removed > 0) {
      console.log(`  ${agent}: ${removed} stale compost entr${removed === 1 ? 'y' : 'ies'} ${dryRun ? 'would be ' : ''}removed`);
      if (!dryRun) {
        compost.entries = kept;
        writeFileSync(path, JSON.stringify(compost, null, 2));
      }
      removedTotal += removed;
    }
  }
  if (removedTotal === 0) console.log('  Nothing stale — compost is clean.');
  return removedTotal;
}

/** 4. Cost review: 30-day per-agent token totals from the cost ledger. */
export function costReview(config) {
  console.log('\n▶ Cost review (last 30 days)');
  console.log('─'.repeat(40));
  if (!existsSync(config.costLogPath)) {
    console.log('  No cost ledger yet.');
    return {};
  }
  let log;
  try { log = JSON.parse(readFileSync(config.costLogPath, 'utf8')); } catch { log = []; }
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byAgent = {};
  for (const entry of log) {
    if (new Date(entry.timestamp).getTime() < cutoff) continue;
    const a = byAgent[entry.agent] || { tokens: 0, tasks: new Set() };
    a.tokens += entry.totalTokens || 0;
    a.tasks.add(entry.taskId);
    byAgent[entry.agent] = a;
  }
  if (Object.keys(byAgent).length === 0) {
    console.log('  No usage recorded in the last 30 days.');
    return {};
  }
  const result = {};
  for (const [agent, a] of Object.entries(byAgent)) {
    result[agent] = { tokens: a.tokens, tasks: a.tasks.size };
    console.log(`  ${agent.padEnd(20)} ${a.tokens.toLocaleString().padStart(12)} tokens across ${a.tasks.size} task(s)`);
  }
  return result;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = loadConfig();

  console.log(`🗓️  Monthly Review ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('═'.repeat(50));

  // 1. Behavior audit (full checks + drift vs baseline)
  runStep('Behavior audit', 'test-behavior.mjs', dryRun ? ['--dry-run'] : []);
  runStep('Behavior drift vs baseline', 'test-behavior.mjs', ['--drift', ...(dryRun ? ['--dry-run'] : [])]);

  // 2. Agent versioning: snapshot + memory-migration check
  if (!dryRun) runStep('Agent version snapshot', 'version-snapshot.mjs', ['snapshot']);
  runStep('Memory migration check', 'migrate-memory.mjs', ['--check']);

  // 3. Compost cleanup
  cleanCompost(config, { dryRun });

  // 4. Cost review
  costReview(config);

  console.log(`\n${'═'.repeat(50)}`);
  console.log('🗓️  Monthly review complete.');
}

// --- CLI ---
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  await main();
}
