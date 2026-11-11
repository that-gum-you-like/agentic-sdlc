#!/usr/bin/env node
/**
 * Agent Version Snapshot — Snapshot and restore agent AGENT.md and memory files.
 *
 * Usage:
 *   node agents/version-snapshot.mjs snapshot          # Save current AGENT.md + memory/*.json
 *   node agents/version-snapshot.mjs list              # List all snapshots
 *   node agents/version-snapshot.mjs restore <date>    # Restore from a snapshot
 */

import { existsSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const VERSIONS_DIR = resolve(AGENTS_DIR, 'versions');

/**
 * Return sorted list of memory JSON filenames for a given agent.
 * Pure function — no filesystem side effects beyond reading the directory.
 *
 * @param {string} agent - Agent name (directory under agentsDir)
 * @param {string} agentsDir - Root agents directory
 * @returns {string[]} Sorted list of .json filenames
 */
function memoryFilesFor(agent, agentsDir) {
  const memoryDir = resolve(agentsDir, agent, 'memory');
  if (!existsSync(memoryDir)) return [];
  return readdirSync(memoryDir)
    .filter(f => f.endsWith('.json'))
    .sort();
}

/**
 * Snapshot current agent state (AGENT.md + memory/*.json) into agents/versions/<date>/.
 *
 * @param {object} [opts] - Optional parameterization for testing
 * @param {string[]} [opts.agents] - Agent list (defaults to config.agents)
 * @param {string} [opts.agentsDir] - Agents root dir (defaults to config.agentsDir)
 */
function snapshot(opts = {}) {
  const agents = (opts.agents && opts.agents.length > 0) ? opts.agents : AGENTS;
  const agentsDir = opts.agentsDir || AGENTS_DIR;
  const versionsDir = resolve(agentsDir, 'versions');

  const date = new Date().toISOString().split('T')[0];
  const snapshotDir = join(versionsDir, date);

  if (!existsSync(versionsDir)) mkdirSync(versionsDir, { recursive: true });
  if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });

  // Copy AGENT.md files (existing behaviour unchanged)
  for (const agent of agents) {
    const src = resolve(agentsDir, agent, 'AGENT.md');
    const dest = join(snapshotDir, `${agent}.md`);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`  📸 ${agent}/AGENT.md → versions/${date}/${agent}.md`);
    } else {
      console.log(`  ⚠️  ${agent}/AGENT.md not found, skipping`);
    }
  }

  // Copy memory/*.json files
  for (const agent of agents) {
    const memFiles = memoryFilesFor(agent, agentsDir);
    if (memFiles.length > 0) {
      const memSnapshotDir = join(snapshotDir, 'memory', agent);
      if (!existsSync(memSnapshotDir)) mkdirSync(memSnapshotDir, { recursive: true });
      for (const memFile of memFiles) {
        const src = resolve(agentsDir, agent, 'memory', memFile);
        const dest = join(memSnapshotDir, memFile);
        copyFileSync(src, dest);
        console.log(`  📸 ${agent}/memory/${memFile} → versions/${date}/memory/${agent}/${memFile}`);
      }
    } else {
      console.log(`  ⚠️  ${agent}/memory/ not found or empty, skipping`);
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

function restore(date, opts = {}) {
  const agents = (opts.agents && opts.agents.length > 0) ? opts.agents : AGENTS;
  const agentsDir = opts.agentsDir || AGENTS_DIR;
  const versionsDir = resolve(agentsDir, 'versions');
  const snapshotDir = join(versionsDir, date);

  if (!existsSync(snapshotDir)) {
    const msg = `Snapshot ${date} not found. Use 'list' to see available snapshots.`;
    if (opts._throwOnError) throw new Error(msg);
    console.error(msg);
    process.exit(1);
  }

  const restoreMemory = opts.memory === true;

  if (restoreMemory) {
    const memSnapshotDir = join(snapshotDir, 'memory');
    if (!existsSync(memSnapshotDir)) {
      const msg = `Snapshot ${date} has no memory snapshot. Run 'snapshot' first or omit --memory.`;
      if (opts._throwOnError) throw new Error(msg);
      console.error(msg);
      process.exit(1);
    }
  }

  // Restore AGENT.md files (always)
  for (const agent of agents) {
    const src = join(snapshotDir, `${agent}.md`);
    const dest = resolve(agentsDir, agent, 'AGENT.md');
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`  🔄 Restored ${agent}/AGENT.md from ${date}`);
    } else {
      console.log(`  ⚠️  ${agent}.md not in snapshot, skipping`);
    }
  }

  // Restore memory files (when --memory)
  if (restoreMemory) {
    for (const agent of agents) {
      const agentMemSrcDir = join(snapshotDir, 'memory', agent);
      if (existsSync(agentMemSrcDir)) {
        const memFiles = readdirSync(agentMemSrcDir).filter(f => f.endsWith('.json'));
        const destMemDir = resolve(agentsDir, agent, 'memory');
        if (!existsSync(destMemDir)) mkdirSync(destMemDir, { recursive: true });
        for (const memFile of memFiles) {
          const src = join(agentMemSrcDir, memFile);
          const dest = join(destMemDir, memFile);
          copyFileSync(src, dest);
          console.log(`  🔄 Restored ${agent}/memory/${memFile} from ${date}`);
        }
      }
    }
    console.log(`\n✅ Restored all agents from snapshot ${date} (including memory)`);
  } else {
    console.log(`\n✅ Restored all agents from snapshot ${date}`);
  }
}

export { snapshot, list, restore, memoryFilesFor };

// CLI
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  const [,, cmd, ...args] = process.argv;

  switch (cmd) {
    case 'snapshot':
      snapshot();
      break;
    case 'list':
      list();
      break;
    case 'restore':
      if (!args[0]) { console.error('Usage: version-snapshot.mjs restore <date> [--memory]'); break; }
      const memoryFlag = args.includes('--memory');
      restore(args[0], { memory: memoryFlag });
      break;
    default:
      console.log(`Usage:
  version-snapshot.mjs snapshot       # Save current AGENT.md + memory files
  version-snapshot.mjs list           # List all snapshots
  version-snapshot.mjs restore <date> # Restore AGENT.md from a snapshot
  version-snapshot.mjs restore <date> --memory # Restore AGENT.md + memory`);
  }
}
