#!/usr/bin/env node
/**
 * REM Sleep — Automated memory consolidation for all agents.
 *
 * Runs age-based promotion:
 *   recent entries > 7 days → medium-term or compost
 *   medium-term entries > 30 days → long-term or compost
 *
 * Usage:
 *   node agents/rem-sleep.mjs              # Run consolidation for all agents
 *   node agents/rem-sleep.mjs --dry-run    # Show what would change without modifying files
 *   node agents/rem-sleep.mjs --similarity # Also deduplicate near-duplicates by cosine similarity (requires semantic-index)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

let checkSimilarity = null;
try {
  const si = await import('./semantic-index.mjs');
  checkSimilarity = si.checkSimilarity;
} catch {
  // semantic-index not available
}

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const RECENT_AGE_DAYS = 7;
const MEDIUM_AGE_DAYS = 30;

const dryRun = process.argv.includes('--dry-run');
const useSimilarity = process.argv.includes('--similarity');

function getMemoryPath(agent, layer) {
  return resolve(AGENTS_DIR, agent, 'memory', `${layer}.json`);
}

function loadMemory(agent, layer) {
  const path = getMemoryPath(agent, layer);
  if (!existsSync(path)) return { entries: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveMemory(agent, layer, data) {
  if (dryRun) return;
  const path = getMemoryPath(agent, layer);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function daysSince(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

async function consolidateAgent(agent) {
  try { logCapabilityUsage('remSleep', agent, process.env.TASK_ID || 'unknown', 'rem-sleep.mjs', 'consolidate'); } catch {}

  console.log(`\n🌙 ${agent}`);

  const recent = loadMemory(agent, 'recent');
  const mediumTerm = loadMemory(agent, 'medium-term');
  const longTerm = loadMemory(agent, 'long-term');
  const compost = loadMemory(agent, 'compost');

  let changes = 0;

  // Recent → medium-term (entries older than 7 days)
  if (recent.entries?.length > 0) {
    const toPromote = [];
    const toKeep = [];

    for (const entry of recent.entries) {
      const entryDate = entry.date || entry.timestamp;
      if (!entryDate) {
        console.log(`  ⚠️  Skipping entry without date: "${(entry.content || entry.id || 'unknown').substring(0, 40)}"`);
        toKeep.push(entry);
        continue;
      }
      const age = daysSince(entryDate);
      if (age > RECENT_AGE_DAYS) {
        toPromote.push(entry);
      } else {
        toKeep.push(entry);
      }
    }

    if (toPromote.length > 0) {
      console.log(`  📤 recent → medium-term: ${toPromote.length} entries (> ${RECENT_AGE_DAYS} days old)`);
      mediumTerm.entries = [...(mediumTerm.entries || []), ...toPromote];
      recent.entries = toKeep;
      changes += toPromote.length;
    }
  }

  // Medium-term → long-term (entries older than 30 days)
  if (mediumTerm.entries?.length > 0) {
    const toPromote = [];
    const toKeep = [];

    for (const entry of mediumTerm.entries) {
      const entryDate = entry.date || entry.timestamp;
      if (!entryDate) {
        console.log(`  ⚠️  Skipping entry without date: "${(entry.content || entry.id || 'unknown').substring(0, 40)}"`);
        toKeep.push(entry);
        continue;
      }
      const age = daysSince(entryDate);
      if (age > MEDIUM_AGE_DAYS) {
        toPromote.push(entry);
      } else {
        toKeep.push(entry);
      }
    }

    if (toPromote.length > 0) {
      console.log(`  📤 medium-term → long-term: ${toPromote.length} entries (> ${MEDIUM_AGE_DAYS} days old)`);
      longTerm.entries = [...(longTerm.entries || []), ...toPromote];
      mediumTerm.entries = toKeep;
      changes += toPromote.length;
    }
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
    if (removed > 0) {
      console.log(`  🗑️  Removed ${removed} duplicates from long-term`);
      changes += removed;
    }

    // Similarity-based dedup (requires --similarity flag and semantic-index)
    if (useSimilarity && checkSimilarity && longTerm.entries.length > 1) {
      const SIMILARITY_THRESHOLD = 0.92;
      const composted = new Set();

      for (let i = 0; i < longTerm.entries.length; i++) {
        if (composted.has(i)) continue;
        for (let j = i + 1; j < longTerm.entries.length; j++) {
          if (composted.has(j)) continue;
          const entryA = longTerm.entries[i];
          const entryB = longTerm.entries[j];
          const contentA = entryA.content || '';
          const contentB = entryB.content || '';
          if (!contentA || !contentB) continue;

          const similarity = await checkSimilarity(contentA, contentB);
          if (similarity >= SIMILARITY_THRESHOLD) {
            const dateA = new Date(entryA.date || entryA.timestamp || 0);
            const dateB = new Date(entryB.date || entryB.timestamp || 0);
            // Keep newer, compost older
            const [keepIdx, compostIdx] = dateA >= dateB ? [i, j] : [j, i];
            const kept = longTerm.entries[keepIdx];
            const composting = longTerm.entries[compostIdx];
            console.log(`  Near-duplicate found (similarity: ${similarity.toFixed(2)}): kept '${(kept.content || '').substring(0, 60)}' composted '${(composting.content || '').substring(0, 60)}'`);
            composted.add(compostIdx);
            if (!dryRun) {
              compost.entries = [...(compost.entries || []), composting];
            }
            changes++;
          }
        }
      }

      if (composted.size > 0) {
        longTerm.entries = longTerm.entries.filter((_, idx) => !composted.has(idx));
      }
    }
  }

  if (changes === 0) {
    console.log('  ✓ Nothing to consolidate');
  }

  saveMemory(agent, 'recent', recent);
  saveMemory(agent, 'medium-term', mediumTerm);
  saveMemory(agent, 'long-term', longTerm);
  saveMemory(agent, 'compost', compost);

  return changes;
}

// Main
console.log(`🌙 REM Sleep Consolidation ${dryRun ? '(DRY RUN)' : ''}`);
console.log('═'.repeat(50));

let totalChanges = 0;
for (const agent of AGENTS) {
  totalChanges += await consolidateAgent(agent);
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Total changes: ${totalChanges}${dryRun ? ' (would be made)' : ''}`);
