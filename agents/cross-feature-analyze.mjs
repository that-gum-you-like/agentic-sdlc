#!/usr/bin/env node
/**
 * cross-feature-analyze.mjs
 *
 * Static analyzer for active OpenSpec changes. Reads every active change folder,
 * extracts file mentions and capability names, and reports pairwise conflicts.
 *
 * Borrowed pattern from GitHub Spec Kit's cross-feature interaction analysis,
 * adapted to OpenSpec's per-change folder structure.
 *
 * Zero dependencies (Node stdlib only).
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRAMEWORK_ROOT = process.env.AGENTIC_SDLC_ROOT
  ?? join(fileURLToPath(import.meta.url), '..', '..');

const FILE_REGEX = /[\w.-]+\/[\w./-]+\.(?:mjs|md|json|sh|mdc|ts|tsx|js|jsx|yml|yaml)/g;

const SOURCES = ['proposal.md', 'design.md', 'tasks.md'];

// ---------- discovery ----------

async function listActiveChanges(repoRoot) {
  const changesDir = join(repoRoot, 'openspec', 'changes');
  const entries = await readdir(changesDir, { withFileTypes: true });
  const active = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') continue;
    active.push(join(changesDir, entry.name));
  }
  return active.sort();
}

// ---------- extraction ----------

async function extractTouchedFiles(changeDir) {
  const touched = new Set();
  for (const src of SOURCES) {
    const path = join(changeDir, src);
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(FILE_REGEX)) {
      const candidate = match[0];
      // Skip URL-context matches — the regex can extract `example.com/docs/foo.md`
      // from a `https://example.com/docs/foo.md` URL. Look back up to 100 chars
      // for a `://` not separated by whitespace.
      const prefix = text.slice(Math.max(0, match.index - 100), match.index);
      if (/:\/\/\S*$/.test(prefix)) continue;
      touched.add(candidate);
    }
  }
  return touched;
}

async function extractCapabilities(changeDir) {
  const caps = new Set();
  const specsDir = join(changeDir, 'specs');
  let entries;
  try {
    entries = await readdir(specsDir, { withFileTypes: true });
  } catch {
    return caps;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    caps.add(entry.name.replace(/\.md$/, ''));
  }
  return caps;
}

// ---------- analysis ----------

function intersect(a, b) {
  const out = [];
  for (const item of a) if (b.has(item)) out.push(item);
  return out;
}

function classifySeverity(filePath) {
  // Source code / config / scripts → high severity (real conflict risk)
  if (/\.(mjs|js|ts|tsx|jsx|json|sh|yml|yaml|mdc)$/.test(filePath)) return 'high';
  // Markdown / docs → low severity (typically additive)
  return 'low';
}

function analyze(changes) {
  const high = [];
  const medium = [];
  const low = [];
  for (let i = 0; i < changes.length; i++) {
    for (let j = i + 1; j < changes.length; j++) {
      const a = changes[i];
      const b = changes[j];
      const fileOverlap = intersect(a.files, b.files);
      const capOverlap = intersect(a.capabilities, b.capabilities);
      if (fileOverlap.length > 0) {
        const highFiles = fileOverlap.filter(f => classifySeverity(f) === 'high');
        const lowFiles = fileOverlap.filter(f => classifySeverity(f) === 'low');
        if (highFiles.length > 0) high.push({ a: a.name, b: b.name, files: highFiles });
        if (lowFiles.length > 0) low.push({ a: a.name, b: b.name, files: lowFiles });
      }
      if (capOverlap.length > 0) {
        medium.push({ a: a.name, b: b.name, capabilities: capOverlap });
      }
    }
  }
  // Sort: severity DESC implicit by section, then change-A name ASC, then change-B name ASC
  const sortFn = (x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b);
  high.sort(sortFn);
  medium.sort(sortFn);
  low.sort(sortFn);
  return { high, medium, low };
}

// ---------- report ----------

function actionFor(severity) {
  if (severity === 'high') return 'Action: align before either merges. Owners should sync on the contract.';
  if (severity === 'medium') return 'Action: confirm capability semantics are compatible; spec deltas may compose or conflict.';
  return 'Action: review for ordering; typically additive but worth a glance.';
}

function renderReport(buckets, changeCount) {
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  lines.push('# Cross-Feature Report');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push(`Active changes scanned: ${changeCount}`);
  lines.push('');

  const totalFlags = buckets.high.length + buckets.medium.length + buckets.low.length;
  if (totalFlags === 0) {
    lines.push('No conflicts detected. All active changes touch disjoint files and capabilities.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(`Total flags: ${totalFlags} (high: ${buckets.high.length}, medium: ${buckets.medium.length}, low: ${buckets.low.length})`);
  lines.push('');

  if (buckets.high.length > 0) {
    lines.push('## High-severity (same source/config file)');
    lines.push('');
    for (const flag of buckets.high) {
      lines.push(`- **${flag.a}** ↔ **${flag.b}** — files: ${flag.files.map(f => '`' + f + '`').join(', ')}`);
      lines.push(`  - ${actionFor('high')}`);
    }
    lines.push('');
  }
  if (buckets.medium.length > 0) {
    lines.push('## Medium-severity (same capability)');
    lines.push('');
    for (const flag of buckets.medium) {
      lines.push(`- **${flag.a}** ↔ **${flag.b}** — capability: ${flag.capabilities.map(c => '`' + c + '`').join(', ')}`);
      lines.push(`  - ${actionFor('medium')}`);
    }
    lines.push('');
  }
  if (buckets.low.length > 0) {
    lines.push('## Low-severity (shared markdown / doc)');
    lines.push('');
    for (const flag of buckets.low) {
      lines.push(`- **${flag.a}** ↔ **${flag.b}** — files: ${flag.files.map(f => '`' + f + '`').join(', ')}`);
      lines.push(`  - ${actionFor('low')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- orchestration ----------

export async function analyzeRepo(repoRoot) {
  const dirs = await listActiveChanges(repoRoot);
  const changes = await Promise.all(dirs.map(async (dir) => {
    const name = dir.split('/').pop();
    const [files, capabilities] = await Promise.all([
      extractTouchedFiles(dir),
      extractCapabilities(dir),
    ]);
    return { name, files, capabilities };
  }));
  const buckets = analyze(changes);
  return { changes, buckets };
}

async function writeReport(repoRoot, report) {
  const reportDir = join(repoRoot, 'pm');
  await mkdir(reportDir, { recursive: true });
  const path = join(reportDir, 'cross-feature-report.md');
  await writeFile(path, report, 'utf8');
  return path;
}

// ---------- CLI ----------

function __isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

async function main() {
  const args = process.argv.slice(2);
  const writeFlag = !args.includes('--stdout');
  const repoRoot = args.find(a => a.startsWith('--root='))?.slice('--root='.length) ?? FRAMEWORK_ROOT;

  const { changes, buckets } = await analyzeRepo(repoRoot);
  const report = renderReport(buckets, changes.length);

  if (writeFlag) {
    const path = await writeReport(repoRoot, report);
    const flagged = buckets.high.length + buckets.medium.length + buckets.low.length;
    console.log(`Cross-feature report written: ${relative(process.cwd(), path)}`);
    console.log(`Scanned ${changes.length} active changes, flagged ${flagged} pairs (${buckets.high.length} high, ${buckets.medium.length} medium, ${buckets.low.length} low).`);
  } else {
    process.stdout.write(report);
  }
}

if (__isMainModule()) {
  main().catch(err => {
    console.error('cross-feature-analyze failed:', err.message);
    process.exit(2);
  });
}
