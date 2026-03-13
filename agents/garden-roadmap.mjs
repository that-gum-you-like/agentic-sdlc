#!/usr/bin/env node
/**
 * Roadmap Gardener — Archive completed roadmap items, keep active roadmap focused.
 *
 * Reads plans/roadmap.md, finds checked-off items (- [x]), moves them to
 * plans/completed/roadmap-archive.md with completion date, and removes
 * them from the active roadmap.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/garden-roadmap.mjs            # Execute
 *   node ~/agentic-sdlc/agents/garden-roadmap.mjs --dry-run   # Preview changes
 *   node ~/agentic-sdlc/agents/garden-roadmap.mjs --status     # Show stats
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const projectDir = config.projectDir;

const ROADMAP_PATH = resolve(projectDir, 'plans', 'roadmap.md');
const ARCHIVE_DIR = resolve(projectDir, 'plans', 'completed');
const ARCHIVE_PATH = resolve(ARCHIVE_DIR, 'roadmap-archive.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const statusOnly = args.includes('--status');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readFileOrEmpty(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!existsSync(ROADMAP_PATH)) {
  console.log('📋 No plans/roadmap.md found. Nothing to garden.');
  process.exit(0);
}

const roadmapContent = readFileSync(ROADMAP_PATH, 'utf8');
const lines = roadmapContent.split('\n');

const completedLines = [];
const activeLines = [];
let completedCount = 0;
let activeCount = 0;

for (const line of lines) {
  const isChecked = /^\s*-\s*\[x\]/i.test(line);
  const isUnchecked = /^\s*-\s*\[\s\]/.test(line);

  if (isChecked) {
    // Add completion date if not already present
    const hasDate = /\(\d{4}-\d{2}-\d{2}\)/.test(line) || /Completed\s+\d{4}-\d{2}-\d{2}/.test(line);
    const archiveLine = hasDate ? line : `${line} (Completed ${today()})`;
    completedLines.push(archiveLine);
    completedCount++;
  } else {
    activeLines.push(line);
    if (isUnchecked) activeCount++;
  }
}

// Status mode
if (statusOnly) {
  console.log('📊 Roadmap Status:');
  console.log(`   Active items:    ${activeCount}`);
  console.log(`   Completed items: ${completedCount}`);
  console.log(`   Total lines:     ${lines.length}`);
  if (completedCount > 0) {
    console.log(`\n   Run without --status to archive ${completedCount} completed items.`);
  } else {
    console.log('\n   ✅ Roadmap is clean — no completed items to archive.');
  }
  process.exit(0);
}

if (completedCount === 0) {
  console.log('✅ Roadmap is clean — no completed items to archive.');
  process.exit(0);
}

console.log(`🌿 Gardening roadmap: ${completedCount} completed items found.`);

if (dryRun) {
  console.log('\n--- Items to archive ---');
  for (const line of completedLines) {
    console.log(`  ${line.trim()}`);
  }
  console.log(`\n--- Active roadmap would have ${activeCount} items ---`);
  console.log('(Dry run — no changes made)');
  process.exit(0);
}

// Archive completed items
ensureDir(ARCHIVE_DIR);
let archiveContent = readFileOrEmpty(ARCHIVE_PATH);
if (!archiveContent) {
  archiveContent = `# Roadmap Archive\n\nCompleted items moved from plans/roadmap.md.\n\n`;
}

archiveContent += `\n## Archived ${today()}\n\n`;
for (const line of completedLines) {
  archiveContent += `${line.trim()}\n`;
}

writeFileSync(ARCHIVE_PATH, archiveContent);
console.log(`  📦 Archived ${completedCount} items to plans/completed/roadmap-archive.md`);

// Update active roadmap (remove empty sections left behind)
let cleanedLines = activeLines;
// Remove consecutive blank lines (more than 2)
const finalLines = [];
let blankCount = 0;
for (const line of cleanedLines) {
  if (line.trim() === '') {
    blankCount++;
    if (blankCount <= 2) finalLines.push(line);
  } else {
    blankCount = 0;
    finalLines.push(line);
  }
}

writeFileSync(ROADMAP_PATH, finalLines.join('\n'));
console.log(`  📋 Updated plans/roadmap.md (${activeCount} active items remain)`);

logCapabilityUsage({
  capability: 'roadmapGardening',
  agent: 'system',
  taskId: 'garden',
  details: { archived: completedCount, remaining: activeCount }
});

console.log('\n✅ Roadmap gardened.');
