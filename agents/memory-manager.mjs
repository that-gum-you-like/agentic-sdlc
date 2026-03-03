#!/usr/bin/env node
/**
 * Agent Memory Manager
 *
 * Manages the 5-layer memory system for each agent:
 *   core.json       — Permanent: identity, values, non-negotiable lessons
 *   long-term.json  — Persistent: patterns learned, corrections received
 *   medium-term.json — Session-spanning: current sprint context
 *   recent.json     — Current session: what just happened
 *   compost.json    — Failed ideas, deprecated approaches
 *
 * Usage:
 *   node agents/memory-manager.mjs recall <agent>
 *   node agents/memory-manager.mjs record <agent> <layer> <entry>
 *   node agents/memory-manager.mjs consolidate <agent>
 *   node agents/memory-manager.mjs compost <agent> <entry-id>
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { loadConfig } from './load-config.mjs';
import { triggerNotification } from './notify.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const LAYERS = ['core', 'long-term', 'medium-term', 'recent', 'compost'];

function getMemoryPath(agent, layer) {
  return resolve(AGENTS_DIR, agent, 'memory', `${layer}.json`);
}

function loadMemory(agent, layer) {
  const path = getMemoryPath(agent, layer);
  if (!existsSync(path)) return layer === 'core' ? {} : { entries: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveMemory(agent, layer, data) {
  const path = getMemoryPath(agent, layer);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function recall(agent) {
  if (!AGENTS.includes(agent)) {
    console.error(`Unknown agent: ${agent}. Available: ${AGENTS.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🧠 Memory Recall for ${agent}`);
  console.log('═'.repeat(50));

  // Core — always loaded
  const core = loadMemory(agent, 'core');
  console.log('\n📌 CORE (non-negotiable):');
  console.log(`   Identity: ${core.identity?.name} — ${core.identity?.role}`);
  if (core.values) {
    console.log('   Values:');
    core.values.forEach(v => console.log(`     • ${v}`));
  }
  if (core.non_negotiable_rules) {
    console.log('   Rules:');
    core.non_negotiable_rules.forEach(r => console.log(`     ⛔ ${r}`));
  }
  if (core.failures?.length > 0) {
    console.log('   Failures (LEARN FROM THESE):');
    core.failures.forEach(f => console.log(`     ❌ ${f.description} (${f.date})`));
  }

  // Long-term
  const longTerm = loadMemory(agent, 'long-term');
  if (longTerm.entries?.length > 0) {
    console.log('\n📚 LONG-TERM (patterns learned):');
    longTerm.entries.forEach(e => console.log(`   • ${e.content} (${e.date})`));
  }

  // Medium-term
  const mediumTerm = loadMemory(agent, 'medium-term');
  if (mediumTerm.entries?.length > 0) {
    console.log('\n📋 MEDIUM-TERM (sprint context):');
    mediumTerm.entries.forEach(e => console.log(`   • ${e.content} (${e.date})`));
  }

  // Recent
  const recent = loadMemory(agent, 'recent');
  if (recent.entries?.length > 0) {
    console.log('\n🕐 RECENT (this session):');
    recent.entries.forEach(e => console.log(`   • ${e.content} (${e.date})`));
  }

  console.log('');
}

function record(agent, layer, content) {
  if (!AGENTS.includes(agent)) {
    console.error(`Unknown agent: ${agent}`);
    process.exit(1);
  }
  if (!LAYERS.includes(layer)) {
    console.error(`Unknown layer: ${layer}. Available: ${LAYERS.join(', ')}`);
    process.exit(1);
  }

  if (layer === 'core') {
    // For core, add to failures array
    const core = loadMemory(agent, 'core');
    core.failures = core.failures || [];
    core.failures.push({
      id: `F-${Date.now()}`,
      description: content,
      date: new Date().toISOString().split('T')[0],
    });
    saveMemory(agent, 'core', core);
    console.log(`Recorded failure in ${agent}/core.json`);
    triggerNotification('highSeverityFailure', `🔴 New failure memory for ${agent}: ${content}`);
  } else {
    const memory = loadMemory(agent, layer);
    memory.entries = memory.entries || [];
    memory.entries.push({
      id: `M-${Date.now()}`,
      content,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
    });
    saveMemory(agent, layer, memory);
    console.log(`Recorded in ${agent}/${layer}.json`);
  }
}

function consolidate(agent) {
  if (!AGENTS.includes(agent)) {
    console.error(`Unknown agent: ${agent}`);
    process.exit(1);
  }

  console.log(`\n🌙 REM Sleep consolidation for ${agent}...`);

  // Move recent → medium-term (keep last 5 in recent)
  const recent = loadMemory(agent, 'recent');
  const mediumTerm = loadMemory(agent, 'medium-term');

  if (recent.entries?.length > 5) {
    const toMove = recent.entries.slice(0, -5);
    mediumTerm.entries = [...(mediumTerm.entries || []), ...toMove];
    recent.entries = recent.entries.slice(-5);
    console.log(`  Moved ${toMove.length} entries from recent → medium-term`);
  }

  // Move medium-term → long-term (keep last 10 in medium-term)
  const longTerm = loadMemory(agent, 'long-term');

  if (mediumTerm.entries?.length > 10) {
    const toMove = mediumTerm.entries.slice(0, -10);
    longTerm.entries = [...(longTerm.entries || []), ...toMove];
    mediumTerm.entries = mediumTerm.entries.slice(-10);
    console.log(`  Moved ${toMove.length} entries from medium-term → long-term`);
  }

  // Deduplicate long-term (by content)
  if (longTerm.entries?.length > 0) {
    const seen = new Set();
    const before = longTerm.entries.length;
    longTerm.entries = longTerm.entries.filter(e => {
      if (seen.has(e.content)) return false;
      seen.add(e.content);
      return true;
    });
    const removed = before - longTerm.entries.length;
    if (removed > 0) console.log(`  Removed ${removed} duplicates from long-term`);
  }

  saveMemory(agent, 'recent', recent);
  saveMemory(agent, 'medium-term', mediumTerm);
  saveMemory(agent, 'long-term', longTerm);

  console.log('  Consolidation complete.');
}

function compostEntry(agent, entryId) {
  if (!AGENTS.includes(agent)) {
    console.error(`Unknown agent: ${agent}`);
    process.exit(1);
  }

  const compost = loadMemory(agent, 'compost');

  // Search all layers for the entry
  for (const layer of ['recent', 'medium-term', 'long-term']) {
    const memory = loadMemory(agent, layer);
    const idx = memory.entries?.findIndex(e => e.id === entryId);
    if (idx >= 0) {
      const [entry] = memory.entries.splice(idx, 1);
      entry.composted_from = layer;
      entry.composted_at = new Date().toISOString();
      compost.entries = compost.entries || [];
      compost.entries.push(entry);
      saveMemory(agent, layer, memory);
      saveMemory(agent, 'compost', compost);
      console.log(`Composted entry ${entryId} from ${layer}`);
      return;
    }
  }

  console.error(`Entry ${entryId} not found in any layer for ${agent}`);
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'recall':
    recall(args[0]);
    break;

  case 'record':
    record(args[0], args[1], args.slice(2).join(' '));
    break;

  case 'consolidate':
    recall(args[0]); // Show before
    consolidate(args[0]);
    break;

  case 'compost':
    compostEntry(args[0], args[1]);
    break;

  default:
    console.log(`Usage:
  memory-manager.mjs recall <agent>                    # Show all memories
  memory-manager.mjs record <agent> <layer> <entry>    # Add a memory
  memory-manager.mjs consolidate <agent>               # REM Sleep consolidation
  memory-manager.mjs compost <agent> <entry-id>        # Move to compost

Agents: ${AGENTS.join(', ')}
Layers: ${LAYERS.join(', ')}`);
}
