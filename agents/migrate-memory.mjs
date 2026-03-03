#!/usr/bin/env node
/**
 * Memory Migration — Check agent memories for references to outdated patterns
 * when agent versions change.
 *
 * Usage:
 *   node agents/migrate-memory.mjs --check   # Report-only (default)
 *   node agents/migrate-memory.mjs --apply   # Apply migrations
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const VERSIONS_DIR = resolve(AGENTS_DIR, 'versions');
const LAYERS = ['long-term', 'medium-term', 'recent'];

const applyMode = process.argv.includes('--apply');

function parseVersionHeader(content) {
  const match = content.match(/<!--\s*version:\s*([\d.]+)\s*\|\s*date:\s*([\d-]+)\s*-->/);
  return match ? { version: match[1], date: match[2] } : null;
}

function getLatestSnapshot() {
  if (!existsSync(VERSIONS_DIR)) return null;
  const snapshots = readdirSync(VERSIONS_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

function loadMemory(agent, layer) {
  const path = resolve(AGENTS_DIR, agent, 'memory', `${layer}.json`);
  if (!existsSync(path)) return { entries: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveMemory(agent, layer, data) {
  const path = resolve(AGENTS_DIR, agent, 'memory', `${layer}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function checkAgent(agent) {
  const agentMdPath = resolve(AGENTS_DIR, agent, 'AGENT.md');
  if (!existsSync(agentMdPath)) {
    console.log(`  ⚠️  ${agent}/AGENT.md not found`);
    return [];
  }

  const currentContent = readFileSync(agentMdPath, 'utf8');
  const currentVersion = parseVersionHeader(currentContent);

  // Check against latest snapshot
  const latestSnapshot = getLatestSnapshot();
  if (!latestSnapshot) {
    console.log(`  ℹ️  No snapshots to compare against`);
    return [];
  }

  const snapshotPath = join(VERSIONS_DIR, latestSnapshot, `${agent}.md`);
  if (!existsSync(snapshotPath)) {
    console.log(`  ℹ️  No snapshot found for ${agent}`);
    return [];
  }

  const snapshotContent = readFileSync(snapshotPath, 'utf8');
  const snapshotVersion = parseVersionHeader(snapshotContent);

  if (currentVersion?.version === snapshotVersion?.version) {
    console.log(`  ✓ Version unchanged (${currentVersion?.version || 'unversioned'})`);
    return [];
  }

  console.log(`  🔄 Version changed: ${snapshotVersion?.version || 'unversioned'} → ${currentVersion?.version || 'unversioned'}`);

  // Extract rules/values from both versions to find changes
  const currentRules = extractRules(currentContent);
  const snapshotRules = extractRules(snapshotContent);

  const addedRules = currentRules.filter(r => !snapshotRules.includes(r));
  const removedRules = snapshotRules.filter(r => !currentRules.includes(r));

  if (addedRules.length > 0) {
    console.log(`    Added: ${addedRules.length} rules`);
  }
  if (removedRules.length > 0) {
    console.log(`    Removed: ${removedRules.length} rules`);
  }

  // Check memories for references to removed rules
  const flags = [];
  for (const layer of LAYERS) {
    const memory = loadMemory(agent, layer);
    for (const entry of memory.entries || []) {
      for (const rule of removedRules) {
        if (entry.content?.includes(rule)) {
          flags.push({ agent, layer, entryId: entry.id, rule, content: entry.content });
        }
      }
    }
  }

  return flags;
}

function extractRules(content) {
  const rules = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed.length > 10) {
      rules.push(trimmed.substring(2).trim());
    }
  }
  return rules;
}

// Main
console.log(`🧠 Memory Migration ${applyMode ? '(APPLY MODE)' : '(CHECK MODE — no changes)'}`);
console.log('═'.repeat(50));

let totalFlags = 0;

for (const agent of AGENTS) {
  console.log(`\n📋 ${agent}:`);
  const flags = checkAgent(agent);

  if (flags.length > 0) {
    console.log(`    ⚠️  ${flags.length} memory entries reference removed rules:`);
    for (const flag of flags) {
      console.log(`      [${flag.layer}/${flag.entryId}] "${flag.content?.substring(0, 60)}..."`);

      if (applyMode) {
        const memory = loadMemory(flag.agent, flag.layer);
        const entry = memory.entries?.find(e => e.id === flag.entryId);
        if (entry) {
          entry.migrated_from = `auto-migration-${new Date().toISOString().split('T')[0]}`;
          entry.content = `[REVIEW] ${entry.content}`;
          saveMemory(flag.agent, flag.layer, memory);
          console.log(`        → Flagged for review`);
        }
      }
    }
    totalFlags += flags.length;
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Total flags: ${totalFlags}`);
if (!applyMode && totalFlags > 0) {
  console.log('Run with --apply to flag entries for review.');
}
