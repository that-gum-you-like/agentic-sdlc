#!/usr/bin/env node
/**
 * Agent Version Snapshot — Snapshot and restore agent AGENT.md files.
 *
 * Usage:
 *   node agents/version-snapshot.mjs snapshot          # Save current AGENT.md files
 *   node agents/version-snapshot.mjs list              # List all snapshots
 *   node agents/version-snapshot.mjs restore <date>    # Restore from a snapshot
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const VERSIONS_DIR = resolve(AGENTS_DIR, 'versions');

function snapshot() {
  const date = new Date().toISOString().split('T')[0];
  const snapshotDir = join(VERSIONS_DIR, date);

  if (!existsSync(VERSIONS_DIR)) mkdirSync(VERSIONS_DIR, { recursive: true });
  if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });

  for (const agent of AGENTS) {
    const src = resolve(AGENTS_DIR, agent, 'AGENT.md');
    const dest = join(snapshotDir, `${agent}.md`);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`  📸 ${agent}/AGENT.md → versions/${date}/${agent}.md`);
    } else {
      console.log(`  ⚠️  ${agent}/AGENT.md not found, skipping`);
    }
  }

  console.log(`\n✅ Snapshot saved to agents/versions/${date}/`);
}

function list() {
  if (!existsSync(VERSIONS_DIR)) {
    console.log('No snapshots found.');
    return;
  }

  const snapshots = readdirSync(VERSIONS_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
  if (snapshots.length === 0) {
    console.log('No snapshots found.');
    return;
  }

  console.log('📋 Agent Version Snapshots:');
  for (const s of snapshots) {
    const files = readdirSync(join(VERSIONS_DIR, s)).filter(f => f.endsWith('.md'));
    console.log(`  ${s} (${files.length} agents)`);
  }
}

function restore(date) {
  const snapshotDir = join(VERSIONS_DIR, date);
  if (!existsSync(snapshotDir)) {
    console.error(`Snapshot ${date} not found. Use 'list' to see available snapshots.`);
    process.exit(1);
  }

  for (const agent of AGENTS) {
    const src = join(snapshotDir, `${agent}.md`);
    const dest = resolve(AGENTS_DIR, agent, 'AGENT.md');
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`  🔄 Restored ${agent}/AGENT.md from ${date}`);
    } else {
      console.log(`  ⚠️  ${agent}.md not in snapshot, skipping`);
    }
  }

  console.log(`\n✅ Restored all agents from snapshot ${date}`);
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'snapshot':
    snapshot();
    break;
  case 'list':
    list();
    break;
  case 'restore':
    if (!args[0]) { console.error('Usage: version-snapshot.mjs restore <date>'); break; }
    restore(args[0]);
    break;
  default:
    console.log(`Usage:
  version-snapshot.mjs snapshot       # Save current AGENT.md files
  version-snapshot.mjs list           # List all snapshots
  version-snapshot.mjs restore <date> # Restore from a snapshot`);
}
