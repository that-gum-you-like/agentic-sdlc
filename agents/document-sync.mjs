#!/usr/bin/env node
/**
 * Document Sync — Version-tracks knowledge docs and flags changed docs for
 * re-indexing by rag-indexer.mjs.
 *
 * Embedding-first knowledge base primitive: walks text/markdown files under
 * docs/ and openspec/, hashes their content, and compares against a stored
 * manifest (pm/doc-versions.json). New files start at version 1; files whose
 * content hash changed get their version bumped. Unchanged files are left
 * alone. Changed + new docs are written to pm/rag-index/reindex-queue.json
 * for rag-indexer.mjs to consume (this script does not invoke it).
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/document-sync.mjs              # Sync + write manifest
 *   node ~/agentic-sdlc/agents/document-sync.mjs --dry-run    # Compute + print, write nothing
 *
 * Programmatic:
 *   import { runDocumentSync } from './document-sync.mjs';
 *   const { tracked, changed, newDocs, versionsPath } = runDocumentSync({ dryRun: true });
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, extname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

const DOC_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const WATCH_DIRS = ['docs', 'openspec'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function walkDocs(rootDir) {
  const results = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile() && DOC_EXTENSIONS.has(extname(entry).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(rootDir);
  return results;
}

function loadManifest(versionsPath) {
  if (!existsSync(versionsPath)) return {};
  try {
    return JSON.parse(readFileSync(versionsPath, 'utf8'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Walk docs/ and openspec/ under projectDir, hash each file, and compare
 * against the stored manifest (pm/doc-versions.json) to find new/changed docs.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] - Compute + return without writing anything
 * @returns {{ tracked: number, changed: string[], newDocs: string[], versionsPath: string }}
 */
export function runDocumentSync(opts = {}) {
  const config = loadConfig();
  const projectDir = config.projectDir;
  const versionsPath = resolve(projectDir, 'pm', 'doc-versions.json');
  const queuePath = resolve(projectDir, 'pm', 'rag-index', 'reindex-queue.json');

  const manifest = loadManifest(versionsPath);
  const nextManifest = {};
  const changed = [];
  const newDocs = [];
  let tracked = 0;

  for (const dirName of WATCH_DIRS) {
    const files = walkDocs(resolve(projectDir, dirName));
    for (const filePath of files) {
      const relPath = relative(projectDir, filePath);
      const content = readFileSync(filePath, 'utf8');
      const hash = hashContent(content);
      const existing = manifest[relPath];
      tracked += 1;

      if (!existing) {
        nextManifest[relPath] = { hash, version: 1, lastSynced: new Date().toISOString() };
        newDocs.push(relPath);
      } else if (existing.hash !== hash) {
        nextManifest[relPath] = {
          hash,
          version: (existing.version || 1) + 1,
          lastSynced: new Date().toISOString(),
        };
        changed.push(relPath);
      } else {
        nextManifest[relPath] = existing;
      }
    }
  }

  if (!opts.dryRun) {
    ensureDir(dirname(versionsPath));
    writeFileSync(versionsPath, JSON.stringify(nextManifest, null, 2));

    ensureDir(dirname(queuePath));
    writeFileSync(queuePath, JSON.stringify([...newDocs, ...changed], null, 2));
  }

  return { tracked, changed, newDocs, versionsPath };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (__isMainModule()) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const result = runDocumentSync({ dryRun });

  console.log(`📚 Document Sync — ${result.tracked} docs tracked`);
  console.log(`  New: ${result.newDocs.length}`);
  for (const doc of result.newDocs) console.log(`    + ${doc}`);
  console.log(`  Changed: ${result.changed.length}`);
  for (const doc of result.changed) console.log(`    ~ ${doc}`);

  if (dryRun) {
    console.log('\n(Dry run — manifest and reindex queue not written)');
  } else {
    console.log('\n📄 Manifest saved to pm/doc-versions.json');
    console.log(
      `📥 Reindex queue saved to pm/rag-index/reindex-queue.json (${result.newDocs.length + result.changed.length} entries)`
    );

    logCapabilityUsage('documentSync', 'system', 'document-sync', 'document-sync.mjs', 'sync');
  }
}
