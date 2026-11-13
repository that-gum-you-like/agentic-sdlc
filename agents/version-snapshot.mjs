#!/usr/bin/env node
/**
 * Agent Version Snapshot — Snapshot and restore agent AGENT.md and memory files.
 *
 * Usage:
 *   node agents/version-snapshot.mjs snapshot          # Save current AGENT.md + memory/*.json
 *   node agents/version-snapshot.mjs list              # List all snapshots
 *   node agents/version-snapshot.mjs restore <date>    # Restore from a snapshot
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { writeAtomic } from './memory-store.mjs';
import { memoryDir, LEGACY } from './state-dir.mjs';

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
function memoryFilesFor(agent, agentsDir, stateDir = LEGACY) {
  const list = dir => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : []);
  const seeds = list(resolve(agentsDir, agent, 'memory'));
  // Live memory is in the state dir (derived vectors.json is never snapshotted from there)
  const live = stateDir === LEGACY ? [] : list(memoryDir(agent, { stateDir, agentsDir })).filter(f => f !== 'vectors.json');
  return [...new Set([...seeds, ...live])].sort();
}

/**
 * Where live memory is read/written. An explicit agentsDir (tests, tools) without
 * an explicit stateDir means "that directory is the whole world": legacy layout.
 */
function resolveStateOpt(opts) {
  if (opts.stateDir) return opts.stateDir;
  return opts.agentsDir ? LEGACY : config.stateDir;
}

/**
 * Find the most recent snapshot date before the given date.
 *
 * @param {string} versionsDir - Versions directory
 * @param {string} currentDate - Current date string (YYYY-MM-DD)
 * @returns {string|null} Previous snapshot date string, or null if none
 */
function previousSnapshotDate(versionsDir, currentDate) {
  if (!existsSync(versionsDir)) return null;
  const dates = readdirSync(versionsDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f) && f < currentDate)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * Compute approximate line diff stats (added/removed) between two texts
 * using a longest-common-subsequence approach.
 *
 * @param {string} oldText - Previous text
 * @param {string} newText - Current text
 * @returns {{ added: number, removed: number }}
 */
function lineDiffStats(oldText, newText) {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table — O(m*n), acceptable for AGENT.md files (<300 lines)
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs = dp[m][n];
  return {
    added: n - lcs,
    removed: m - lcs
  };
}

/**
 * Append a version history entry to the live AGENT.md for an agent, if:
 * - The AGENT.md differs from the previous snapshot copy
 * - The AGENT.md has a `## Version History` section
 * - The current date does not already have an entry (idempotent)
 *
 * @param {string} agent - Agent name
 * @param {string} agentsDir - Agents root directory
 * @param {string} prevSnapshotDir - Previous snapshot directory path
 * @param {string} date - Current date string (YYYY-MM-DD)
 */
function appendVersionHistoryEntry(agent, agentsDir, prevSnapshotDir, date) {
  const agentMDPath = resolve(agentsDir, agent, 'AGENT.md');
  const prevSnapshotPath = join(prevSnapshotDir, `${agent}.md`);

  if (!existsSync(agentMDPath) || !existsSync(prevSnapshotPath)) return;

  const currentContent = readFileSync(agentMDPath, 'utf8');
  const prevContent = readFileSync(prevSnapshotPath, 'utf8');

  // No change — nothing to record
  if (currentContent === prevContent) return;

  // Must have a ## Version History section
  const vhRegex = /^## Version History\s*$/m;
  const vhMatch = currentContent.match(vhRegex);
  if (!vhMatch) return;

  // Check idempotency — if this date already has an entry, skip
  const dateLine = `- ${date}: changed`;
  const vhStartIndex = vhMatch.index;
  const sectionEndMatch = currentContent.slice(vhStartIndex + vhMatch[0].length).match(/\n(?=## )/);
  const sectionEnd = sectionEndMatch
    ? vhStartIndex + vhMatch[0].length + sectionEndMatch.index
    : currentContent.length;

  const sectionContent = currentContent.slice(vhStartIndex, sectionEnd);
  if (sectionContent.includes(dateLine)) return;

  // Compute diff stats
  const { added, removed } = lineDiffStats(prevContent, currentContent);
  const entry = `- ${date}: changed (+${added}/-${removed} lines)`;

  // Insert the entry before the end of the Version History section
  const newContent = currentContent.slice(0, sectionEnd) + '\n' + entry + currentContent.slice(sectionEnd);
  writeFileSync(agentMDPath, newContent, 'utf8');
  console.log(`  📝 ${agent}/AGENT.md: appended version history entry`);
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
  const stateDir = resolveStateOpt(opts);
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

  // Version history: append entry for each changed AGENT.md (CV-251)
  const prevDate = previousSnapshotDate(versionsDir, date);
  if (prevDate) {
    const prevSnapshotDir = join(versionsDir, prevDate);
    for (const agent of agents) {
      appendVersionHistoryEntry(agent, agentsDir, prevSnapshotDir, date);
    }
  }

  // Copy memory/*.json files
  for (const agent of agents) {
    const memFiles = memoryFilesFor(agent, agentsDir, stateDir);
    if (memFiles.length > 0) {
      const memSnapshotDir = join(snapshotDir, 'memory', agent);
      if (!existsSync(memSnapshotDir)) mkdirSync(memSnapshotDir, { recursive: true });
      for (const memFile of memFiles) {
        const stateSrc = stateDir === LEGACY ? null : join(memoryDir(agent, { stateDir, agentsDir }), memFile);
        const src = stateSrc && existsSync(stateSrc) ? stateSrc : resolve(agentsDir, agent, 'memory', memFile);
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
  const stateDir = resolveStateOpt(opts);
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
        // Restore writes the STATE dir, never the tracked seed (RS-REQ-014)
        const destMemDir = memoryDir(agent, { stateDir, agentsDir });
        if (!existsSync(destMemDir)) mkdirSync(destMemDir, { recursive: true, mode: 0o700 });
        for (const memFile of memFiles) {
          const src = join(agentMemSrcDir, memFile);
          const dest = join(destMemDir, memFile);
          if (stateDir === LEGACY) copyFileSync(src, dest);
          else writeAtomic(dest, readFileSync(src));
          console.log(`  🔄 Restored ${agent}/memory/${memFile} from ${date}`);
        }
      }
    }
    console.log(`\n✅ Restored all agents from snapshot ${date} (including memory)`);
  } else {
    console.log(`\n✅ Restored all agents from snapshot ${date}`);
  }
}

export { snapshot, list, restore, memoryFilesFor, previousSnapshotDate, lineDiffStats, appendVersionHistoryEntry };

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
