#!/usr/bin/env node
/**
 * NLP Analyzer — semantic near-miss detection for identifiers (Layer 2.5).
 *
 * Catches the "fullName vs full_name" class of bug: code that ACCESSES an
 * identifier which doesn't exist anywhere in the analyzed files, but is a
 * near-miss (small edit distance + high semantic similarity) of one that DOES.
 *
 * Flag rule (per the nlp-code-analysis spec): edit distance <= 3 AND
 * similarity >= 0.80; exact matches never flag; dissimilar names never flag.
 *
 * Similarity engine: spaCy word vectors via agents/nlp-analyze.py when
 * installed (local, CPU-only, zero network); otherwise a deterministic
 * zero-dep lexical similarity over the identifiers' word tokens. Either way
 * the analyzer WORKS — spaCy sharpens it, its absence never disables it.
 *
 * Usage:
 *   node agents/nlp-analyzer.mjs --files <f1> <f2> ...   # analyze specific files
 *   node agents/nlp-analyzer.mjs                          # changed files vs HEAD
 *   node agents/nlp-analyzer.mjs --json                   # machine-readable output
 *
 * Advisory: always exits 0 (findings are warnings for the validation report).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, execFileSync } from 'child_process';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDIT_DISTANCE_MAX = 3;
const SIMILARITY_MIN = 0.80;

// Member names that belong to platform/runtime objects — never near-misses.
const BUILTIN_MEMBERS = new Set([
  'length', 'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'map', 'filter',
  'reduce', 'forEach', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf',
  'join', 'split', 'replace', 'replaceAll', 'match', 'matchAll', 'test', 'exec',
  'trim', 'toLowerCase', 'toUpperCase', 'startsWith', 'endsWith', 'padStart', 'padEnd',
  'keys', 'values', 'entries', 'has', 'get', 'set', 'add', 'delete', 'clear', 'size',
  'then', 'catch', 'finally', 'json', 'text', 'ok', 'status', 'stringify', 'parse',
  'log', 'warn', 'error', 'info', 'exit', 'env', 'argv', 'cwd', 'pid',
  'toString', 'toFixed', 'toISOString', 'name', 'message', 'stack', 'code',
  'concat', 'sort', 'reverse', 'flat', 'flatMap', 'fill', 'from', 'isArray',
  'assign', 'freeze', 'fromEntries', 'charAt', 'charCodeAt', 'repeat', 'search',
]);

// ---------------------------------------------------------------------------
// Identifier extraction (heuristic, language-agnostic for JS/TS)
// ---------------------------------------------------------------------------

/** Split an identifier into lowercase word tokens (camelCase, snake_case, kebab). */
export function identifierWords(id) {
  return String(id || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
}

/** Classic Levenshtein edit distance. */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Deterministic lexical similarity between two identifiers: Jaccard overlap
 * of their word tokens, with a partial-credit term for near-equal tokens
 * (so "colour"/"color" still count). Range [0, 1].
 */
export function lexicalSimilarity(a, b) {
  const wa = [...new Set(identifierWords(a))];
  const wb = [...new Set(identifierWords(b))];
  if (wa.length === 0 || wb.length === 0) return 0;
  if (wa.join(' ') === wb.join(' ')) return 1;

  // Dice coefficient over word tokens, with partial credit for near-equal
  // tokens (spelling variants like colour/color).
  let matched = 0;
  for (const w of wa) {
    if (wb.includes(w)) { matched += 1; continue; }
    const near = wb.find(x => editDistance(w, x) <= 1 && Math.min(w.length, x.length) >= 3);
    if (near) matched += 0.75;
  }
  return Math.min(1, Math.round((2 * matched / (wa.length + wb.length)) * 100) / 100);
}

/** Extract declared identifiers (the vocabulary) from source text. */
export function extractDeclarations(source) {
  const declared = new Set();
  const patterns = [
    /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g,
    /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function\b|\()/g, // methods/props assigned functions
    /^\s*([A-Za-z_$][\w$]*)\s*:/gm,                                   // object literal / interface keys
    /\bexport\s+\{([^}]+)\}/g,                                        // export lists
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      if (re.source.startsWith('\\bexport')) {
        for (const name of m[1].split(',')) declared.add(name.trim().split(/\s+as\s+/)[0].trim());
      } else {
        declared.add(m[1]);
      }
    }
  }
  declared.delete('');
  return declared;
}

/** Extract accessed member identifiers (obj.member) from source text. */
export function extractAccesses(source) {
  const accesses = new Set();
  for (const m of source.matchAll(/[\w$)\]]\.([A-Za-z_$][\w$]*)/g)) {
    accesses.add(m[1]);
  }
  return accesses;
}

// ---------------------------------------------------------------------------
// spaCy path (optional sharpening; local only)
// ---------------------------------------------------------------------------

const VENV_PYTHON = resolve(__dirname, '..', '.venv', 'bin', 'python3');
const NLP_SCRIPT = resolve(__dirname, 'nlp-analyze.py');

function getPythonPath() {
  return existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
}

export function spacyAvailable() {
  try {
    execSync(`${getPythonPath()} -c "import spacy"`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function spacySimilarities(pairs) {
  const out = execFileSync(getPythonPath(), [NLP_SCRIPT], {
    input: JSON.stringify({ pairs }),
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = JSON.parse(out.trim());
  if (parsed.error) return null;
  return parsed.similarities;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Find near-miss identifier accesses across a set of source texts.
 * @param {Array<{file: string, source: string}>} inputs
 * @param {object} [opts]
 * @param {boolean} [opts.useSpacy] - force/deny the spaCy path (default: auto)
 * @returns {Array<{file, accessed, suggestion, editDistance, similarity, engine}>}
 */
export function findNearMisses(inputs, opts = {}) {
  const vocabulary = new Set();
  for (const { source } of inputs) {
    for (const d of extractDeclarations(source)) vocabulary.add(d);
  }

  // Candidate = accessed member that is NOT declared anywhere in the set,
  // not a platform builtin, and long enough to be meaningful.
  const candidates = [];
  for (const { file, source } of inputs) {
    for (const accessed of extractAccesses(source)) {
      if (vocabulary.has(accessed)) continue;
      if (BUILTIN_MEMBERS.has(accessed)) continue;
      if (accessed.length < 4) continue;
      candidates.push({ file, accessed });
    }
  }
  if (candidates.length === 0) return [];

  const vocab = [...vocabulary].filter(v => v.length >= 4);
  const findings = [];
  const pending = []; // for batch spaCy scoring

  for (const cand of candidates) {
    let best = null;
    for (const v of vocab) {
      if (v === cand.accessed) continue;
      const d = editDistance(cand.accessed.toLowerCase(), v.toLowerCase());
      if (d === 0 || d > EDIT_DISTANCE_MAX) continue;
      if (!best || d < best.editDistance) best = { suggestion: v, editDistance: d };
    }
    if (best) pending.push({ ...cand, ...best });
  }
  if (pending.length === 0) return [];

  // Similarity gate: spaCy when available, deterministic lexical otherwise.
  const useSpacy = opts.useSpacy ?? spacyAvailable();
  let sims = null;
  let engine = 'lexical';
  if (useSpacy) {
    try {
      sims = spacySimilarities(pending.map(p => [
        identifierWords(p.accessed).join(' '),
        identifierWords(p.suggestion).join(' '),
      ]));
      if (sims) engine = 'spacy';
    } catch { sims = null; }
  }

  pending.forEach((p, i) => {
    const similarity = sims ? sims[i] : lexicalSimilarity(p.accessed, p.suggestion);
    if (similarity >= SIMILARITY_MIN) {
      findings.push({ ...p, similarity, engine });
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function resolveFiles(config) {
  const idx = process.argv.indexOf('--files');
  if (idx !== -1) {
    return process.argv.slice(idx + 1).filter(a => !a.startsWith('--'));
  }
  try {
    return execSync('git diff --name-only HEAD~1', { cwd: config.projectDir, encoding: 'utf8' })
      .split('\n')
      .filter(f => /\.(mjs|js|ts|tsx|jsx)$/.test(f))
      .map(f => resolve(config.projectDir, f));
  } catch {
    return [];
  }
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  const config = loadConfig();
  const jsonMode = process.argv.includes('--json');
  try { logCapabilityUsage('nlpAnalysis', process.env.AGENT || 'system', process.env.TASK_ID || 'unknown', 'nlp-analyzer.mjs', 'run'); } catch { /* advisory */ }

  const files = resolveFiles(config).filter(f => existsSync(f));
  const inputs = files.map(file => ({ file, source: readFileSync(file, 'utf8') }));
  const findings = findNearMisses(inputs);

  if (jsonMode) {
    console.log(JSON.stringify({ analyzed: files.length, engine: findings[0]?.engine || (spacyAvailable() ? 'spacy' : 'lexical'), findings }, null, 2));
  } else {
    console.log(`🔤 NLP near-miss analysis — ${files.length} file(s), engine: ${spacyAvailable() ? 'spaCy (local)' : 'lexical fallback (spaCy not installed)'}`);
    if (findings.length === 0) {
      console.log('  No near-miss identifiers found.');
    } else {
      for (const f of findings) {
        console.log(`  ⚠️  ${f.file}: \`${f.accessed}\` — did you mean \`${f.suggestion}\`? (edit distance: ${f.editDistance}, similarity: ${f.similarity})`);
      }
    }
  }
  process.exit(0); // advisory layer — findings are warnings, never a hard fail
}
