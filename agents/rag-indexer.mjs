#!/usr/bin/env node
/**
 * RAG Indexer — Local semantic index over the repo's knowledge for retrieval.
 *
 * Walks docs/, openspec/, and agents/<agent>/memory/ under the project,
 * chunks text files on paragraph boundaries (~500-800 chars per chunk),
 * and builds a local index for later retrieval.
 *
 * Uses the same local sentence-transformers detection as memory-manager.mjs /
 * semantic-index.mjs (embed.py over a subprocess, CPU-only, no cloud calls).
 * When unavailable, degrades to a deterministic lexical (term-frequency)
 * index instead of throwing — retrieval quality is lower but the pipeline
 * never breaks.
 *
 * Usage:
 *   node agents/rag-indexer.mjs                # Build index, write pm/rag-index/index.json
 *   node agents/rag-indexer.mjs --dry-run       # Compute counts only, don't write
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

const VENV_PYTHON = resolve(__dirname, '..', '.venv', 'bin', 'python3');
const EMBED_SCRIPT = resolve(__dirname, 'embed.py');
const CHUNK_MIN = 500;
const CHUNK_MAX = 800;
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on', 'with', 'as', 'be', 'this', 'that', 'are', 'was', 'were']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPythonPath() {
  if (existsSync(VENV_PYTHON)) return VENV_PYTHON;
  return 'python3';
}

function pythonAvailable() {
  try {
    execSync(`${getPythonPath()} -c "from sentence_transformers import SentenceTransformer"`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

function callEmbed(texts) {
  // Pass the payload over stdin (embed.py reads sys.stdin), NOT as a shell
  // argument. The old `echo '<json>' | python` form overflowed ARG_MAX
  // (spawnSync E2BIG) on any real corpus and mis-escaped single quotes.
  const input = JSON.stringify(texts);
  const result = execSync(`${getPythonPath()} "${EMBED_SCRIPT}"`, {
    input,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
    // Use the locally-cached model only — no HF Hub network calls. Faster,
    // deterministic, and privacy-first (no outbound requests, no telemetry).
    env: {
      ...process.env,
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      HF_HUB_DISABLE_TELEMETRY: '1',
    },
  });
  return JSON.parse(result.trim());
}

/** Recursively collect text files (.md, .json, .txt) under dir. */
function collectFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile() && /\.(md|json|txt)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Find agents/<agent>/memory/ directories under projectDir/agents. */
function collectMemoryDirs(agentsRoot) {
  const dirs = [];
  if (!existsSync(agentsRoot)) return dirs;
  for (const entry of readdirSync(agentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const memDir = resolve(agentsRoot, entry.name, 'memory');
    if (existsSync(memDir)) dirs.push(memDir);
  }
  return dirs;
}

/** Chunk text on paragraph boundaries into ~CHUNK_MIN-CHUNK_MAX char pieces. */
function chunkText(text) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > CHUNK_MAX && current) {
      chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
    if (current.length >= CHUNK_MIN && current.length <= CHUNK_MAX) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(c => c.length > 0);
}

/** Deterministic term-frequency map for a chunk of text. */
function termFrequencies(text) {
  const terms = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
  const freq = {};
  for (const term of terms) {
    freq[term] = (freq[term] || 0) + 1;
  }
  return freq;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Build the RAG index over docs/, openspec/, and agent memory files.
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun] - Compute counts without writing to disk.
 * @returns {{documents: number, chunks: number, mode: 'embedding'|'lexical', indexPath: string}}
 */
// Exported for regression testing (E2BIG on large payloads via stdin).
export { callEmbed, pythonAvailable };

export function runIndexer(opts = {}) {
  const config = loadConfig();
  const projectDir = config.projectDir;
  const indexPath = resolve(projectDir, 'pm', 'rag-index', 'index.json');

  const sourceDirs = [
    resolve(projectDir, 'docs'),
    resolve(projectDir, 'openspec'),
    ...collectMemoryDirs(config.agentsDir),
  ];

  const files = sourceDirs.flatMap(collectFiles);
  const records = [];

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!text.trim()) continue;
    const relPath = relative(projectDir, file);
    for (const chunkTextValue of chunkText(text)) {
      records.push({ file: relPath, chunkText: chunkTextValue });
    }
  }

  // An injected embedFn (tests, alternate backends) forces the embed path;
  // otherwise gate on the local python/sentence-transformers stack.
  const useEmbeddings = opts.embedFn ? true : pythonAvailable();
  let mode = useEmbeddings ? 'embedding' : 'lexical';

  const result = { documents: files.length, chunks: records.length, mode, indexPath };

  if (opts.dryRun) {
    return result;
  }

  const buildLexical = () =>
    records.map(r => ({ file: r.file, chunkText: r.chunkText, termFreq: termFrequencies(r.chunkText) }));

  const embed = opts.embedFn || callEmbed;

  let entries;
  if (useEmbeddings && records.length > 0) {
    try {
      const vectors = embed(records.map(r => r.chunkText));
      entries = records.map((r, i) => ({ file: r.file, chunkText: r.chunkText, vector: vectors[i] }));
    } catch (err) {
      // Never hard-fail a scheduled run: if embedding times out or errors,
      // degrade to the deterministic lexical index (REQ-004 graceful fallback).
      mode = 'lexical';
      result.mode = 'lexical';
      result.embeddingError = (err && err.message) ? err.message.split('\n')[0] : String(err);
      entries = buildLexical();
    }
  } else {
    entries = buildLexical();
  }

  const dir = dirname(indexPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify({ mode, builtAt: new Date().toISOString(), entries }, null, 2));

  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (__isMainModule()) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const result = runIndexer({ dryRun });

  console.log(`RAG index — mode: ${result.mode}`);
  console.log(`  Documents: ${result.documents}`);
  console.log(`  Chunks: ${result.chunks}`);
  if (dryRun) {
    console.log('  (dry run — not written)');
  } else {
    console.log(`  Written to: ${relative(process.cwd(), result.indexPath)}`);
    logCapabilityUsage('ragIndex', 'system', 'rag-index', 'rag-indexer.mjs', 'index');
  }
}
