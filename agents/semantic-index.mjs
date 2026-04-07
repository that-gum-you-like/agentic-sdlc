#!/usr/bin/env node
/**
 * Semantic Index — Build and query vector embeddings over agent memory.
 *
 * Uses embed.py (sentence-transformers, local CPU) for embedding generation.
 * Stores embeddings in agents/<agent>/memory/vectors.json.
 * Provides cosine similarity search across all memory layers.
 *
 * Usage:
 *   node agents/semantic-index.mjs embed <agent>            # Build/rebuild index
 *   node agents/semantic-index.mjs search <agent> "<query>" [--top N]
 *   node agents/semantic-index.mjs add <agent> <entry-id> "<content>"
 *   node agents/semantic-index.mjs status <agent>           # Show index stats
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS_DIR = config.agentsDir;
const EMBED_SCRIPT = resolve(__dirname, 'embed.py');
const VENV_PYTHON = resolve(__dirname, '..', '.venv', 'bin', 'python3');

const SEARCH_LAYERS = ['core', 'long-term', 'medium-term', 'recent']; // exclude compost

// --- Helpers ---

function getPythonPath() {
  // Prefer venv python (has sentence-transformers installed)
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

function getVectorsPath(agent) {
  return resolve(AGENTS_DIR, agent, 'memory', 'vectors.json');
}

function loadVectors(agent) {
  const path = getVectorsPath(agent);
  if (!existsSync(path)) return { entries: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveVectors(agent, vectors) {
  const path = getVectorsPath(agent);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(vectors, null, 2));
}

function loadMemory(agent, layer) {
  const path = resolve(AGENTS_DIR, agent, 'memory', `${layer}.json`);
  if (!existsSync(path)) return layer === 'core' ? {} : { entries: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function callEmbed(texts) {
  const input = JSON.stringify(texts);
  const result = execSync(`echo '${input.replace(/'/g, "\\'")}' | ${getPythonPath()} "${EMBED_SCRIPT}"`, {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(result.trim());
}

function callSearch(query, corpus) {
  const input = JSON.stringify({ query, corpus });
  const result = execSync(`echo '${input.replace(/'/g, "\\'")}' | python3 "${EMBED_SCRIPT}" --search`, {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(result.trim());
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// --- Core Functions ---

function getAllMemoryEntries(agent) {
  const entries = [];

  // Core failures
  const core = loadMemory(agent, 'core');
  if (core.failures) {
    for (const f of core.failures) {
      entries.push({ id: f.id, content: f.description, layer: 'core', date: f.date });
    }
  }
  // Core rules
  if (core.non_negotiable_rules) {
    for (let i = 0; i < core.non_negotiable_rules.length; i++) {
      entries.push({ id: `core-rule-${i}`, content: core.non_negotiable_rules[i], layer: 'core', date: 'permanent' });
    }
  }

  // Other layers
  for (const layer of ['long-term', 'medium-term', 'recent']) {
    const mem = loadMemory(agent, layer);
    if (mem.entries) {
      for (const e of mem.entries) {
        entries.push({ id: e.id, content: e.content, layer, date: e.date });
      }
    }
  }

  return entries;
}

/**
 * Build or rebuild the full embedding index for an agent.
 */
function buildIndex(agent) {
  try { logCapabilityUsage('semanticEmbed', agent, process.env.TASK_ID || 'unknown', 'semantic-index.mjs', 'embed'); } catch {}

  if (!pythonAvailable()) {
    console.warn('⚠️  sentence-transformers not available. Install: pip install sentence-transformers');
    return;
  }

  const entries = getAllMemoryEntries(agent);
  if (entries.length === 0) {
    console.log(`No memory entries found for ${agent}.`);
    return;
  }

  console.log(`Building index for ${agent}: ${entries.length} entries...`);
  const texts = entries.map(e => e.content);
  const embeddings = callEmbed(texts);

  const vectors = { entries: {} };
  for (let i = 0; i < entries.length; i++) {
    vectors.entries[entries[i].id] = {
      content: entries[i].content,
      layer: entries[i].layer,
      date: entries[i].date,
      vector: embeddings[i],
    };
  }

  saveVectors(agent, vectors);
  console.log(`✅ Indexed ${entries.length} entries for ${agent}`);
}

/**
 * Add a single entry to the index (incremental).
 */
function addEntry(agent, entryId, content) {
  if (!pythonAvailable()) {
    console.warn('⚠️  Semantic indexing unavailable — install sentence-transformers for semantic memory search');
    return;
  }

  const vectors = loadVectors(agent);
  const embeddings = callEmbed([content]);
  vectors.entries[entryId] = {
    content,
    layer: 'recent',
    date: new Date().toISOString().split('T')[0],
    vector: embeddings[0],
  };
  saveVectors(agent, vectors);
}

/**
 * Search memory by semantic similarity.
 * Returns top-K entries ranked by relevance.
 */
function search(agent, query, topK = 5) {
  try { logCapabilityUsage('semanticSearch', agent, process.env.TASK_ID || 'unknown', 'semantic-index.mjs', 'search'); } catch {}

  const vectors = loadVectors(agent);
  const entryIds = Object.keys(vectors.entries);

  if (entryIds.length === 0) {
    console.warn('No embeddings found — falling back to full recall');
    return null; // Caller should fall back to full recall
  }

  // Try Python search first (more accurate), fall back to JS cosine
  if (pythonAvailable()) {
    const corpus = entryIds.map(id => vectors.entries[id].content);
    const results = callSearch(query, corpus);
    return results.slice(0, topK).map(r => ({
      id: entryIds[r.index],
      ...vectors.entries[entryIds[r.index]],
      score: r.score,
      vector: undefined, // Don't include raw vector in results
    }));
  }

  // JS fallback: use stored embeddings + compute query embedding
  // This path works if embeddings exist but Python is unavailable at search time
  console.warn('⚠️  Python unavailable for search — using JS cosine fallback');
  // Without Python, can't embed the query. Return null for full recall fallback.
  return null;
}

/**
 * Check similarity between two texts (for REM sleep dedup).
 */
export function checkSimilarity(textA, textB) {
  if (!pythonAvailable()) return null;
  const embeddings = callEmbed([textA, textB]);
  return cosineSimilarity(embeddings[0], embeddings[1]);
}

/**
 * Cluster texts by similarity (for pattern-hunt).
 * Returns array of clusters, each cluster is array of {index, text}.
 */
export function clusterBySimilarity(texts, threshold = 0.85) {
  if (!pythonAvailable()) return null;

  const embeddings = callEmbed(texts);
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < texts.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [{ index: i, text: texts[i] }];
    assigned.add(i);

    for (let j = i + 1; j < texts.length; j++) {
      if (assigned.has(j)) continue;
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= threshold) {
        cluster.push({ index: j, text: texts[j] });
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function showStatus(agent) {
  const vectors = loadVectors(agent);
  const count = Object.keys(vectors.entries).length;
  const available = pythonAvailable();

  console.log(`\n📊 Semantic Index Status for ${agent}`);
  console.log('─'.repeat(40));
  console.log(`  Indexed entries: ${count}`);
  console.log(`  Python available: ${available ? '✅' : '❌'}`);
  console.log(`  Vectors file: ${getVectorsPath(agent)}`);

  if (count > 0) {
    const byLayer = {};
    for (const entry of Object.values(vectors.entries)) {
      byLayer[entry.layer] = (byLayer[entry.layer] || 0) + 1;
    }
    console.log('  By layer:');
    for (const [layer, n] of Object.entries(byLayer)) {
      console.log(`    ${layer}: ${n}`);
    }
  }
  console.log('');
}

// --- Exports for use by other scripts ---
export { buildIndex, addEntry, search, pythonAvailable, loadVectors, saveVectors, getAllMemoryEntries };

// --- CLI ---
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'embed':
    buildIndex(args[0]);
    break;

  case 'search': {
    const agent = args[0];
    const query = args[1];
    const topKIdx = args.indexOf('--top');
    const topK = topKIdx >= 0 ? parseInt(args[topKIdx + 1], 10) : 5;

    const results = search(agent, query, topK);
    if (!results) {
      console.log('Falling back to full recall (no embeddings or Python unavailable).');
    } else {
      console.log(`\n🔍 Top ${results.length} results for "${query}":`);
      for (const r of results) {
        console.log(`  [${r.score.toFixed(3)}] (${r.layer}) ${r.content}`);
      }
    }
    break;
  }

  case 'add':
    addEntry(args[0], args[1], args.slice(2).join(' '));
    console.log(`Added entry ${args[1]} to semantic index.`);
    break;

  case 'status':
    showStatus(args[0]);
    break;

  default:
    console.log(`Usage:
  semantic-index.mjs embed <agent>                    # Build/rebuild full index
  semantic-index.mjs search <agent> "<query>" [--top N]  # Semantic search
  semantic-index.mjs add <agent> <id> "<content>"     # Add single entry
  semantic-index.mjs status <agent>                   # Show index stats`);
}
} // end __isMainModule
