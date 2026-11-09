#!/usr/bin/env node
/**
 * Four-Layer Validation Pipeline
 *
 * Runs 4 layers of validation on changed files:
 *   Layer 1 (Research)   — import resolution via TypeScript compiler API
 *   Layer 2 (Critique)   — Richmond's checklist: any, console.log, {data,error}, file sizes
 *   Layer 3 (Code)       — defeat-test AST patterns on changed files
 *   Layer 4 (Statistics) — file size deltas, new/modified counts, test coverage presence
 *
 * CLI:
 *   node agents/four-layer-validate.mjs [--files <glob>] [--json]
 *   node agents/four-layer-validate.mjs --json           # JSON output
 *   node agents/four-layer-validate.mjs --files "src/**" # custom glob
 *
 * Defaults to `git diff --name-only HEAD~1` when no --files flag given.
 *
 * Output: { passed, layers: [{ name, status, details }] }
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { glob as globFn } from 'fs/promises';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const _config = loadConfig();
const PROJECT_ROOT = _config.projectDir;
const LINGUAFLOW_ROOT = _config.appPath;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const filesIdx = args.indexOf('--files');
const filesGlob = filesIdx !== -1 ? args[filesIdx + 1] : null;
const allowlistIdx = args.indexOf('--allowlist');
const allowlistPath = allowlistIdx !== -1 ? args[allowlistIdx + 1] : null;
const allowlistUpdate = args.includes('--update');

// Load allowlist if provided
let allowlist = null;
if (allowlistPath && fs.existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  } catch {
    console.error(`Failed to parse allowlist: ${allowlistPath}`);
  }
}

/**
 * Filter violations against the allowlist.
 * Returns { newViolations, knownDebt, fixedEntries }.
 */
function applyAllowlist(violations, category) {
  if (!allowlist || !allowlist[category]) return { newViolations: violations, knownDebt: [], fixedEntries: [] };

  const allowedFiles = new Set(allowlist[category]);
  const newViolations = [];
  const knownDebt = [];
  const seenFiles = new Set();

  for (const v of violations) {
    // Extract file path from violation string (format: [category] path:line — message)
    const match = v.match(/\] ([^:]+):/);
    const filePath = match ? match[1] : '';
    if (allowedFiles.has(filePath)) {
      knownDebt.push(v);
      seenFiles.add(filePath);
    } else {
      newViolations.push(v);
    }
  }

  // Find allowlist entries that are now clean (violation fixed)
  const fixedEntries = [...allowedFiles].filter(f => !seenFiles.has(f));

  return { newViolations, knownDebt, fixedEntries };
}

/**
 * Shrink the allowlist by removing fixed entries. Write back if --update.
 */
function shrinkAllowlist(category, fixedEntries) {
  if (!allowlist || !fixedEntries.length) return;
  allowlist[category] = allowlist[category].filter(f => !fixedEntries.includes(f));
  if (allowlistUpdate && allowlistPath) {
    fs.writeFileSync(allowlistPath, JSON.stringify(allowlist, null, 2));
    console.log(`  Allowlist shrunk: removed ${fixedEntries.length} fixed entries from ${category}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect files matching predicate. */
function collectFiles(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Return lines of a file. */
function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n');
  } catch {
    return [];
  }
}

/** True when a path is a test file. */
function isTestFile(filePath) {
  return (
    filePath.includes('__tests__') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  );
}

/** Return path relative to LINGUAFLOW_ROOT for display. */
function rel(absPath) {
  if (absPath.startsWith(LINGUAFLOW_ROOT)) {
    return path.relative(LINGUAFLOW_ROOT, absPath);
  }
  return path.relative(PROJECT_ROOT, absPath);
}

/**
 * Scan JavaScript/TypeScript source code and return metrics for every function
 * with a brace-delimited body. Supports:
 *   - Function declarations: `function name(params) { ... }`
 *   - Async function declarations: `async function name(params) { ... }`
 *   - Function expressions assigned to variables: `const name = function(params) { ... }`
 *   - Arrow functions with block body: `const name = (params) => { ... }`
 *   - Method shorthand: `name(params) { ... }`
 *   - Async method shorthand: `async name(params) { ... }`
 *   - Getters/setters: `get name() { ... }`
 *
 * Uses brace-matching to determine function span. Nested functions are counted
 * separately. Only functions with brace-delimited bodies are reported (implicit
 * return arrow functions like `() => x` are excluded).
 *
 * @param {string} source - Source code to scan
 * @returns {Array<{name: string, startLine: number, lines: number, params: number}>}
 */




export function scanFunctionMetrics(source) {
  source = source.replace(/\r\n/g, '\n');
  const results = [];

  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }

  function lineFromOffset(offset) {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  function countParams(text) {
    if (!text || text.trim() === '') return 0;
    let depth = 0, count = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"' || ch === "'" || ch === '`') { i++; while (i < text.length && text[i] !== ch) { if (text[i] === '\\') i++; i++; } continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { if (depth) depth--; continue; }
      if (depth === 0 && ch === ',') count++;
    }
    return count + 1;
  }

  function matchBrace(src, braceStart) {
    let depth = 1;
    let i = braceStart + 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '"' || ch === "'") {
        const quote = ch; i++;
        while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
      } else if (ch === '`') {
        i++;
        while (i < src.length && src[i] !== '`') {
          if (src[i] === '\\') i++;
          if (src[i] === '$' && i + 1 < src.length && src[i + 1] === '{') { depth++; i += 2; continue; }
          i++;
        }
      } else if (ch === '/' && i + 1 < src.length) {
        const n = src[i + 1];
        if (n === '/') { i += 2; while (i < src.length && src[i] !== '\n') i++; }
        else if (n === '*') { i += 2; while (i + 1 < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; if (i < src.length) i++; }
        else if (i > braceStart + 1) { const p = src[i - 1]; if (/[;=(\[!&|,:{?]/.test(p)) { i++; while (i < src.length && src[i] !== '/' && src[i] !== '\n') { if (src[i] === '\\') i++; i++; } } }
      } else if (ch === '{') { depth++; }
      else if (ch === '}') { depth--; }
      if (depth > 0) i++;
    }
    return depth === 0 ? i : -1;
  }

  function nearestOf(src, startIdx) {
    for (let i = startIdx; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(') return { type: 'paren-open', pos: i };
      if (ch === '{' || ch === ';' || ch === '\n') return { type: 'stop', pos: i };
      if (ch === '"' || ch === "'") { const q = ch; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } }
    }
    return { type: 'stop', pos: src.length - 1 };
  }

  function matchParen(src, openParen) {
    let depth = 1;
    let i = openParen + 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '"' || ch === "'") { const q = ch; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } }
      else if (ch === '`') { i++; while (i < src.length && src[i] !== '`') { if (src[i] === '\\') i++; i++; } }
      if (depth > 0) i++;
    }
    return depth === 0 ? i : -1;
  }

  /**
   * Extract get/set/async prefix from before a method name.
   * cursor is at the last char of the method name.
   * Returns { prefixName, posBeforePrefix } or null.
   */
  function extractPrefix(src, cursor) {
    // Walk back to start of method name
    let ms = cursor;
    while (ms >= 0 && /\w/.test(src[ms])) ms--;
    ms++;
    // Before the name, skip whitespace
    let bw = ms - 1;
    while (bw >= 0 && /\s/.test(src[bw])) bw--;
    if (bw < 0) return null;
    // Find start of the word before the name
    let ws = bw;
    while (ws >= 0 && /\w/.test(src[ws])) ws--;
    ws++;
    const word = src.slice(ws, bw + 1);
    if (word === 'get' || word === 'set' || word === 'async') {
      // Return the prefix word and position before it (for context check)
      return { prefixName: word, posBeforePrefix: ws - 1 };
    }
    return null;
  }

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < source.length && source[i] !== q) { if (source[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '`') { i++; while (i < source.length && source[i] !== '`') { if (source[i] === '\\') i++; if (source[i] === '$' && i + 1 < source.length && source[i + 1] === '{') { i += 2; continue; } i++; } i++; continue; }
    if (ch === '/' && i + 1 < source.length && source[i + 1] === '/') { i += 2; while (i < source.length && source[i] !== '\n') i++; i++; continue; }
    if (ch === '/' && i + 1 < source.length && source[i + 1] === '*') { i += 2; while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }

    // Pattern A: function declarations and expressions
    if (ch === 'f' && source.startsWith('function', i)) {
      let j = i + 8;
      while (j < source.length && (source[j] === ' ' || source[j] === '\t' || source[j] === '\n')) j++;
      let name = '(anonymous)';
      if (j < source.length && /[a-zA-Z_$]/.test(source[j])) {
        const ns = j;
        while (j < source.length && /\w/.test(source[j])) j++;
        name = source.slice(ns, j);
      }
      const next = nearestOf(source, j);
      if (next.type !== 'paren-open') { i++; continue; }
      const openParen = next.pos;
      const closeParen = matchParen(source, openParen);
      if (closeParen === -1) { i++; continue; }
      const paramCount = countParams(source.slice(openParen + 1, closeParen));
      let k = closeParen + 1;
      while (k < source.length && source[k] !== '{' && source[k] !== ';' && source[k] !== '\n') k++;
      if (k < source.length && source[k] === '{') {
        const cb = matchBrace(source, k);
        if (cb !== -1) {
          results.push({ name, startLine: lineFromOffset(i), lines: lineFromOffset(cb) - lineFromOffset(i) + 1, params: paramCount });
        }
      }
      i++;
      continue;
    }

    // Pattern B: Arrow functions with block body
    if (ch === '=' && i + 1 < source.length && source[i + 1] === '>') {
      let k = i + 2;
      while (k < source.length && (source[k] === ' ' || source[k] === '\t' || source[k] === '\n')) k++;
      if (k < source.length && source[k] === '{') {
        const arrowResult = { name: '(anonymous)', paramCount: 0 };
        let scanPos = i - 1;
        while (scanPos >= 0 && /\s/.test(source[scanPos])) scanPos--;

        if (scanPos >= 0 && source[scanPos] === ')') {
          let pd = 1;
          let openParenPos = scanPos - 1;
          while (openParenPos >= 0 && pd > 0) {
            const bc = source[openParenPos];
            if (bc === ')') pd++;
            if (bc === '(') pd--;
            if (pd > 0) openParenPos--;
          }
          if (openParenPos >= 0) {
            arrowResult.paramCount = countParams(source.slice(openParenPos + 1, scanPos));
            let eqPos = openParenPos - 1;
            while (eqPos >= 0 && /\s/.test(source[eqPos])) eqPos--;
            if (eqPos >= 0 && source[eqPos] === '=') {
              let ns = eqPos - 1;
              while (ns >= 0 && /\s/.test(source[ns])) ns--;
              if (ns >= 0 && /[a-zA-Z_$]/.test(source[ns])) {
                const ne = ns + 1;
                while (ns >= 0 && /\w/.test(source[ns])) ns--;
                ns++;
                arrowResult.name = source.slice(ns, ne);
              }
            }
          }
        } else {
          let eqPos = scanPos;
          while (eqPos >= 0 && /\s/.test(source[eqPos])) eqPos--;
          if (eqPos >= 0 && source[eqPos] === '=') {
            arrowResult.paramCount = 1;
            let ns = eqPos - 1;
            while (ns >= 0 && /\s/.test(source[ns])) ns--;
            if (ns >= 0 && /[a-zA-Z_$]/.test(source[ns])) {
              const ne = ns + 1;
              while (ns >= 0 && /\w/.test(source[ns])) ns--;
              ns++;
              arrowResult.name = source.slice(ns, ne);
            }
          }
        }

        const cb = matchBrace(source, k);
        if (cb !== -1) {
          const startOffset = (() => {
            let s = i - 1;
            while (s >= 0 && (/\w/.test(source[s]) || /\s/.test(source[s]) || source[s] === '(' || source[s] === ')' || source[s] === ',')) s--;
            return s + 1;
          })();
          results.push({
            name: arrowResult.name,
            startLine: lineFromOffset(startOffset),
            lines: lineFromOffset(cb) - lineFromOffset(startOffset) + 1,
            params: arrowResult.paramCount,
          });
        }
      }
      i++;
      continue;
    }

    // Pattern C: Method shorthand and get/set/async methods
    if (ch === ')') {
      let afterParen = i + 1;
      while (afterParen < source.length && (source[afterParen] === ' ' || source[afterParen] === '\t')) afterParen++;
      if (afterParen < source.length && source[afterParen] === '{') {
        let pd = 1;
        let openParenPos = i - 1;
        while (openParenPos >= 0 && pd > 0) {
          const bc = source[openParenPos];
          if (bc === ')') pd++;
          if (bc === '(') pd--;
          if (pd > 0) openParenPos--;
        }
        if (openParenPos < 0) { i++; continue; }

        // Find the method name (word before '(')
        let nameEndPos = openParenPos - 1;
        while (nameEndPos >= 0 && /\s/.test(source[nameEndPos])) nameEndPos--;
        if (nameEndPos < 0 || !/[a-zA-Z_$]/.test(source[nameEndPos])) { i++; continue; }

        // Walk back to find start of method name
        let nameStartPos = nameEndPos;
        while (nameStartPos >= 0 && /\w/.test(source[nameStartPos])) nameStartPos--;
        nameStartPos++;

        // Check for get/set/async prefix before the name
        const prefixInfo = extractPrefix(source, nameEndPos);
        let prefix = '';
        let contextPos = nameStartPos - 1;
        if (prefixInfo) {
          if (prefixInfo.prefixName === "async") {
            contextPos = prefixInfo.posBeforePrefix;
          } else {
            prefix = prefixInfo.prefixName + " ";
            contextPos = prefixInfo.posBeforePrefix;
          }
        }

        // Skip whitespace before contextPos to find the context character
        while (contextPos >= 0 && /\s/.test(source[contextPos])) contextPos--;

        // Method context check: the character before should be , { ; = or line start
        if (!(contextPos < 0 || /[,{};=]/.test(source[contextPos]))) { i++; continue; }

        const rawName = source.slice(nameStartPos, nameEndPos + 1);
        const SKIP_KEYWORDS = new Set(["function", "if", "while", "for", "switch", "catch", "with"]);
        if (SKIP_KEYWORDS.has(rawName)) { i++; continue; }
        const methodName = prefix + rawName;
        const paramCount = countParams(source.slice(openParenPos + 1, i));
        const cb = matchBrace(source, afterParen);
        if (cb !== -1) {
          results.push({
            name: methodName,
            startLine: lineFromOffset(nameStartPos),
            lines: lineFromOffset(cb) - lineFromOffset(nameStartPos) + 1,
            params: paramCount,
          });
        }
      }
    }

    i++;
  }

  return results;
}
// ---------------------------------------------------------------------------
// File collection: git diff or glob
// ---------------------------------------------------------------------------

async function resolveTargetFiles() {
  let filePaths = [];

  if (filesGlob) {
    // Expand glob relative to LINGUAFLOW_ROOT
    try {
      const matches = [];
      for await (const match of globFn(filesGlob, { cwd: LINGUAFLOW_ROOT })) {
        matches.push(path.join(LINGUAFLOW_ROOT, match));
      }
      filePaths = matches;
    } catch {
      // Fallback: manual glob via collectFiles with extension filter
      filePaths = collectFiles(LINGUAFLOW_ROOT, (f) =>
        f.endsWith('.ts') || f.endsWith('.tsx'),
      );
    }
  } else {
    // Default: git diff --name-only HEAD~1
    try {
      const diffOutput = execSync('git diff --name-only HEAD~1', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      filePaths = diffOutput
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .map((f) => path.join(PROJECT_ROOT, f))
        .filter((f) => fs.existsSync(f));
    } catch {
      // If git diff fails (e.g. shallow repo), scan entire src/
      filePaths = collectFiles(path.join(LINGUAFLOW_ROOT, 'src'), (f) =>
        f.endsWith('.ts') || f.endsWith('.tsx'),
      );
    }
  }

  // Keep source files. TS-only layers (import resolution, Richmond checks,
  // AST defeat patterns, coverage) filter down to .ts/.tsx internally;
  // text-based layers (2.5 near-miss, silent-fallback scan) cover the whole
  // JS family so framework .mjs scripts are validated too.
  return filePaths.filter((f) => /\.(ts|tsx|mjs|js|jsx)$/.test(f));
}

// ---------------------------------------------------------------------------
// Layer 1: Research — Import Resolution via TypeScript compiler API
// ---------------------------------------------------------------------------

async function runLayer1(targetFiles) {
  const layerName = 'Research (Import Resolution)';
  const details = [];
  const unresolvedImports = [];

  // This layer builds a TypeScript program — TS files only.
  targetFiles = targetFiles.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

  if (targetFiles.length === 0) {
    return {
      name: layerName,
      status: 'pass',
      details: ['No TypeScript files to analyse'],
    };
  }

  let ts;
  try {
    const requireFn = createRequire(import.meta.url);
    ts = requireFn(path.join(LINGUAFLOW_ROOT, 'node_modules', 'typescript'));
  } catch (e) {
    return {
      name: layerName,
      status: 'warn',
      details: [`TypeScript compiler not available: ${e.message}`],
    };
  }

  // Build a TypeScript program for the changed files
  const tsconfigPath = path.join(LINGUAFLOW_ROOT, 'tsconfig.json');
  const compilerOptions = {
    noEmit: true,
    allowJs: false,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactNative,
    baseUrl: LINGUAFLOW_ROOT,
    paths: { '@/*': ['./*'] },
  };

  // Parse tsconfig if available
  let parsedOptions = compilerOptions;
  if (fs.existsSync(tsconfigPath)) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        LINGUAFLOW_ROOT,
      );
      parsedOptions = { ...parsed.options, noEmit: true, skipLibCheck: true };
    }
  }

  // Check each file independently for unresolved imports
  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) continue;
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Extract import/require statements using regex (fast, avoids full compilation)
    const importMatches = fileContent.matchAll(
      /^(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/gm,
    );
    const requireMatches = fileContent.matchAll(
      /require\(['"]([^'"]+)['"]\)/g,
    );

    const allImports = [
      ...Array.from(importMatches, (m) => m[1]),
      ...Array.from(requireMatches, (m) => m[1]),
    ];

    for (const importPath of allImports) {
      // Skip node built-ins and node_modules (non-relative, non-@/ imports)
      if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
        continue;
      }

      // Resolve relative to file location
      let baseDir = path.dirname(filePath);
      let resolvedBase = importPath;

      if (importPath.startsWith('@/')) {
        baseDir = LINGUAFLOW_ROOT;
        resolvedBase = '.' + importPath.slice(1); // '@/foo' -> './foo'
      }

      const resolved = ts.resolveModuleName(
        resolvedBase.startsWith('.') ? resolvedBase : './' + resolvedBase,
        filePath,
        parsedOptions,
        ts.sys,
      );

      if (!resolved.resolvedModule) {
        // Try with explicit extensions
        const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
        let found = false;
        for (const ext of extensions) {
          const candidate = path.resolve(baseDir, resolvedBase + ext);
          if (fs.existsSync(candidate)) {
            found = true;
            break;
          }
        }
        if (!found) {
          unresolvedImports.push(`${rel(filePath)}: unresolved import '${importPath}'`);
        }
      }
    }
  }

  if (unresolvedImports.length > 0) {
    details.push(...unresolvedImports);
    return { name: layerName, status: 'fail', details };
  }

  const scannedCount = targetFiles.length;
  details.push(`Scanned ${scannedCount} file(s) — all imports resolved`);
  return { name: layerName, status: 'pass', details };
}

// ---------------------------------------------------------------------------
// Layer 2: Critique — Richmond's Checklist Patterns
// ---------------------------------------------------------------------------

async function runLayer2(targetFiles) {
  const layerName = "Critique (Richmond's Checklist)";
  const violations = [];

  const productionFiles = targetFiles.filter(
    (f) => !isTestFile(f) && (f.endsWith('.ts') || f.endsWith('.tsx')),
  );

  for (const filePath of productionFiles) {
    if (!fs.existsSync(filePath)) continue;
    const fileLines = readLines(filePath);
    const relPath = rel(filePath);

    // Check 1: no `: any` type annotations
    fileLines.forEach((line, idx) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      const codeBeforeComment = line.split('//')[0];
      if (codeBeforeComment.includes(': any')) {
        violations.push(`[any-type] ${relPath}:${idx + 1} — \`: any\` type annotation`);
      }
    });

    // Check 2: no console.log
    fileLines.forEach((line, idx) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      const codeBeforeComment = line.split('//')[0];
      if (codeBeforeComment.includes('console.log')) {
        violations.push(`[console-log] ${relPath}:${idx + 1} — console.log in production code`);
      }
    });

    // Check 3: service files return {data, error} pattern
    const isService =
      filePath.includes('/services/') && filePath.endsWith('.ts');
    if (isService) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Heuristic: service should have at least one function returning an object
      // Check that exported async functions mention data or error in their returns
      const hasExportedFunction = /export\s+(async\s+)?function/.test(content);
      const hasDataErrorPattern = /\{\s*(data|error)/.test(content) ||
        /return\s+\{\s*(data|error)/.test(content) ||
        /:\s*\{\s*data[?:]/.test(content);

      if (hasExportedFunction && !hasDataErrorPattern) {
        violations.push(
          `[data-error] ${relPath} — service should return { data, error } pattern`,
        );
      }
    }

    // Check 4: file size limits
    const lineCount = fileLines.length;
    const isServiceFile =
      filePath.includes('/services/') && !isTestFile(filePath);
    const isScreenFile =
      filePath.includes('/app/') &&
      filePath.endsWith('.tsx') &&
      !isTestFile(filePath) &&
      !path.basename(filePath).startsWith('_layout');

    if (isServiceFile && lineCount > 150) {
      violations.push(
        `[file-size] ${relPath} — service is ${lineCount} lines (limit: 150)`,
      );
    }
    if (isScreenFile && lineCount > 200) {
      violations.push(
        `[file-size] ${relPath} — screen is ${lineCount} lines (limit: 200)`,
      );
    }
  }

  // Apply allowlist filtering if configured
  if (allowlist && violations.length > 0) {
    let allNew = [];
    let allKnown = [];
    for (const category of ['any-type', 'console-log', 'file-size']) {
      const categoryViolations = violations.filter(v => v.startsWith(`[${category}]`));
      const { newViolations, knownDebt, fixedEntries } = applyAllowlist(categoryViolations, category);
      allNew.push(...newViolations);
      allKnown.push(...knownDebt);
      shrinkAllowlist(category, fixedEntries);
    }
    // Include non-categorized violations as-is
    const categorized = new Set([...allNew, ...allKnown]);
    const uncategorized = violations.filter(v => !categorized.has(v));
    allNew.push(...uncategorized);

    if (allNew.length > 0) {
      const details = [...allNew];
      if (allKnown.length > 0) details.push(`(${allKnown.length} known debt items in allowlist — not blocking)`);
      return { name: layerName, status: 'fail', details };
    }
    if (allKnown.length > 0) {
      return { name: layerName, status: 'pass', details: [`${allKnown.length} known debt items in allowlist (no new violations)`] };
    }
  }

  if (violations.length > 0) {
    return { name: layerName, status: 'fail', details: violations };
  }

  return {
    name: layerName,
    status: 'pass',
    details: [
      `Checked ${productionFiles.length} production file(s) — no Richmond checklist violations`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Layer 2.5: NLP — Semantic identifier near-miss detection (optional)
// ---------------------------------------------------------------------------
// Runs between Critique and Code (nlp-code-analysis spec). Uses spaCy word
// vectors when installed (local, CPU-only); a deterministic lexical fallback
// otherwise. Advisory: findings are warnings, never a hard fail.

async function runLayer2_5_NLP(targetFiles) {
  const layerName = 'NLP Near-Miss (Layer 2.5)';
  try {
    const { findNearMisses, spacyAvailable } = await import('./nlp-analyzer.mjs');
    const sourceFiles = targetFiles.filter(f => /\.(mjs|js|ts|tsx|jsx)$/.test(f) && fs.existsSync(f));
    if (sourceFiles.length === 0) {
      return { name: layerName, status: 'pass', details: ['No source files to analyze'] };
    }
    const engine = spacyAvailable() ? 'spaCy (local)' : 'lexical fallback (spaCy not available)';
    const inputs = sourceFiles.map(file => ({ file: rel(file), source: fs.readFileSync(file, 'utf8') }));
    const findings = findNearMisses(inputs);
    if (findings.length === 0) {
      return { name: layerName, status: 'pass', details: [`Scanned ${sourceFiles.length} file(s) via ${engine} — no near-miss identifiers`] };
    }
    return {
      name: layerName,
      status: 'warn',
      details: findings.map(f => `${f.file}: \`${f.accessed}\` — did you mean \`${f.suggestion}\`? (edit distance: ${f.editDistance}, similarity: ${f.similarity})`),
    };
  } catch (e) {
    return { name: layerName, status: 'pass', details: [`skipped (${e.message})`] };
  }
}

// ---------------------------------------------------------------------------
// Layer 3: Code — Defeat Test Patterns + AST Analysis
// ---------------------------------------------------------------------------

async function runLayer3(targetFiles) {
  const layerName = 'Code (Defeat Patterns + AST)';
  const issues = [];

  // Pattern E (text-based — needs no compiler): SILENT DEFAULT FALLBACKS.
  // The NaN-Fallback-Disaster class: a computed value silently defaulted to
  // zero/empty hides upstream failure instead of surfacing it. Two rules:
  //   E1: <computation-call>(…) || 0  /  ?? 0   — computed value zeroed on failure
  //   E2: catch { return 0 | '' | [] }          — error swallowed into an empty default
  const SILENT_FALLBACK_CALL_RE = /\b(?:parse|compute|calc\w*|total|sum|score|count|rate|avg|average|price|amount|estimate)\w*\s*\([^)\n]*\)\s*(?:\|\||\?\?)\s*0\b/;
  const SILENT_CATCH_DEFAULT_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+(?:0|''|""|\[\s*\])\s*;?\s*\}/;
  const allSourceFiles = targetFiles.filter(
    (f) => !isTestFile(f) && /\.(ts|tsx|mjs|js|jsx)$/.test(f) && fs.existsSync(f),
  );
  for (const filePath of allSourceFiles) {
    const relPath = rel(filePath);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      const code = line.split('//')[0];
      if (SILENT_FALLBACK_CALL_RE.test(code)) {
        issues.push(`[silent-fallback] ${relPath}:${idx + 1} — computed value silently defaulted to 0 (surface the failure instead)`);
      }
      if (SILENT_CATCH_DEFAULT_RE.test(code)) {
        issues.push(`[silent-fallback] ${relPath}:${idx + 1} — catch returns an empty default (error swallowed; log or rethrow)`);
      }
    });
  }

  let ts;
  try {
    const requireFn = createRequire(import.meta.url);
    ts = requireFn(path.join(LINGUAFLOW_ROOT, 'node_modules', 'typescript'));
  } catch (e) {
    if (issues.length > 0) {
      return { name: layerName, status: 'fail', details: issues };
    }
    return {
      name: layerName,
      status: 'warn',
      details: [`TypeScript compiler not available for AST analysis: ${e.message}`],
    };
  }

  const productionFiles = targetFiles.filter(
    (f) => !isTestFile(f) && (f.endsWith('.ts') || f.endsWith('.tsx')),
  );

  for (const filePath of productionFiles) {
    if (!fs.existsSync(filePath)) continue;
    const relPath = rel(filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse AST
    let sourceFile;
    try {
      sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
      );
    } catch {
      issues.push(`[ast-parse] ${relPath} — failed to parse AST`);
      continue;
    }

    // AST walk helper
    function walk(node, visitor) {
      visitor(node);
      ts.forEachChild(node, (child) => walk(child, visitor));
    }

    // Pattern A: Detect `as any` type assertions (AST-level)
    walk(sourceFile, (node) => {
      if (
        node.kind === ts.SyntaxKind.AsExpression &&
        node.type &&
        node.type.kind === ts.SyntaxKind.AnyKeyword
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push(`[as-any] ${relPath}:${line + 1} — \`as any\` type assertion`);
      }
    });

    // Pattern B: Detect @ts-ignore without explanation
    walk(sourceFile, (node) => {
      if (
        node.kind === ts.SyntaxKind.SingleLineCommentTrivia ||
        node.kind === ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        return; // handled via text scan below
      }
    });

    // Scan comments for @ts-ignore
    const tsIgnoreMatches = content.matchAll(/\/\/\s*@ts-ignore(?!:)/gm);
    for (const match of tsIgnoreMatches) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      issues.push(
        `[ts-ignore] ${relPath}:${lineNum} — @ts-ignore without explanation comment`,
      );
    }

    // Pattern C: Detect hardcoded magic strings (URL patterns in src — heuristic)
    // Look for hardcoded http:// or https:// in non-constant, non-comment lines
    const urlLines = content.split('\n');
    urlLines.forEach((line, idx) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      // Skip import statements and test files
      if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) return;
      const codeBeforeComment = line.split('//')[0];
      // Flag hardcoded non-localhost URLs that are not in constants files
      if (
        /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(codeBeforeComment) &&
        !filePath.includes('/constants/') &&
        !filePath.includes('culturalContextData') &&
        !filePath.includes('updateService')
      ) {
        issues.push(
          `[hardcoded-url] ${relPath}:${idx + 1} — hardcoded URL (move to constants)`,
        );
      }
    });

    // Pattern D: Detect functions with too many parameters (> 5) as complexity signal
    walk(sourceFile, (node) => {
      if (
        (node.kind === ts.SyntaxKind.FunctionDeclaration ||
          node.kind === ts.SyntaxKind.ArrowFunction ||
          node.kind === ts.SyntaxKind.FunctionExpression) &&
        node.parameters &&
        node.parameters.length > 5
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push(
          `[too-many-params] ${relPath}:${line + 1} — function has ${node.parameters.length} parameters (consider an options object)`,
        );
      }
    });
  }

  if (issues.length > 0) {
    return { name: layerName, status: 'fail', details: issues };
  }

  return {
    name: layerName,
    status: 'pass',
    details: [
      `AST-analysed ${productionFiles.length} production file(s) — no defeat patterns found`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Layer 4: Statistics — File Size Deltas, Coverage Presence
// ---------------------------------------------------------------------------

async function runLayer4(targetFiles) {
  const layerName = 'Statistics (Size Deltas + Coverage)';
  const stats = [];

  const newFiles = [];
  const modifiedFiles = [];

  // Determine new vs modified via git
  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const relToProject = path.relative(PROJECT_ROOT, filePath);
      const result = execSync(`git log --oneline -1 -- "${relToProject}"`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (result === '') {
        newFiles.push(filePath);
      } else {
        modifiedFiles.push(filePath);
      }
    } catch {
      modifiedFiles.push(filePath);
    }
  }

  stats.push(`New files: ${newFiles.length}`);
  stats.push(`Modified files: ${modifiedFiles.length}`);

  // File size deltas for modified files
  const sizeDeltaDetails = [];
  for (const filePath of modifiedFiles) {
    if (!fs.existsSync(filePath)) continue;
    const relToProject = path.relative(PROJECT_ROOT, filePath);
    try {
      const prevContent = execSync(
        `git show HEAD~1:"${relToProject}" 2>/dev/null`,
        {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      const prevLines = prevContent.split('\n').length;
      const currLines = readLines(filePath).length;
      const delta = currLines - prevLines;
      const sign = delta >= 0 ? '+' : '';
      sizeDeltaDetails.push(
        `  ${rel(filePath)}: ${prevLines} → ${currLines} lines (${sign}${delta})`,
      );
    } catch {
      const currLines = readLines(filePath).length;
      sizeDeltaDetails.push(`  ${rel(filePath)}: ${currLines} lines (new or delta unavailable)`);
    }
  }

  if (sizeDeltaDetails.length > 0) {
    stats.push('Size deltas:');
    stats.push(...sizeDeltaDetails);
  }

  // Test coverage presence: for each changed production file, check if a test exists
  const productionFiles = targetFiles.filter(
    (f) => !isTestFile(f) && (f.endsWith('.ts') || f.endsWith('.tsx')),
  );
  const missingTests = [];

  for (const filePath of productionFiles) {
    const base = path.basename(filePath, path.extname(filePath));
    const dir = path.dirname(filePath);

    // Look for test files: base.test.ts, base.test.tsx, __tests__/base.test.ts, etc.
    const testCandidates = [
      path.join(dir, `${base}.test.ts`),
      path.join(dir, `${base}.test.tsx`),
      path.join(dir, '__tests__', `${base}.test.ts`),
      path.join(dir, '__tests__', `${base}.test.tsx`),
    ];

    // Also check in LinguaFlow/__tests__ tree
    const lfTests = [
      path.join(LINGUAFLOW_ROOT, '__tests__', `${base}.test.ts`),
      path.join(LINGUAFLOW_ROOT, '__tests__', `${base}.test.tsx`),
    ];

    const hasTest = [...testCandidates, ...lfTests].some((t) => fs.existsSync(t));
    if (!hasTest) {
      missingTests.push(`  ${rel(filePath)} — no test file found`);
    }
  }

  if (missingTests.length > 0) {
    stats.push(`Files without test coverage (${missingTests.length}/${productionFiles.length}):`);
    stats.push(...missingTests);
  } else if (productionFiles.length > 0) {
    stats.push(`All ${productionFiles.length} production file(s) have associated test files`);
  }

  // Overall summary
  const totalFiles = targetFiles.length;
  stats.unshift(`Total files analysed: ${totalFiles}`);

  // Layer 4 always passes (it's informational)
  return { name: layerName, status: 'pass', details: stats };
}

// ---------------------------------------------------------------------------
// Layer 5: CLI Guards — Side Effect Safety for .mjs Scripts
// ---------------------------------------------------------------------------

async function runLayer5_CLIGuards() {
  const layerName = 'CLI Guards (Side Effect Safety)';
  const violations = [];

  // Scan all .mjs files in agents/ directory
  const agentsDir = __dirname;
  const mjsFiles = collectFiles(agentsDir, (f) => f.endsWith('.mjs'));

  // Allowlist: pure CLI tools that don't export functions (no guard needed)
  const allowlistFile = path.join(agentsDir, 'cli-guard-allowlist.json');
  let allowedFiles = [];
  if (fs.existsSync(allowlistFile)) {
    try {
      allowedFiles = JSON.parse(fs.readFileSync(allowlistFile, 'utf8'));
    } catch { /* ignore parse errors */ }
  }

  for (const filePath of mjsFiles) {
    const relPath = path.relative(agentsDir, filePath);

    // Skip allowlisted files
    if (allowedFiles.includes(relPath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    // Check for ES module exports (must be at start of line or after semicolon)
    // Matches: export function, export const, export class, export default, export {
    const lines = content.split('\n');
    const hasExports = lines.some(line => {
      const trimmed = line.trimStart();
      return /^export\s+(function|const|let|var|class|default|async\s+function|\{)/.test(trimmed);
    });
    if (!hasExports) continue; // Pure CLI tool — no risk of import side effects

    // Check for CLI routing patterns: top-level destructuring of process.argv
    // e.g. `const [,, cmd, ...args] = process.argv;` or `const args = process.argv.slice(2);`
    // These indicate the script has a CLI entry point that parses arguments at module level.
    // process.argv used inside function bodies (like load-config.mjs reading --project-dir)
    // is legitimate library behavior and doesn't need a guard.
    const hasCLIRouting = /^(?:const|let|var)\s+.*=\s*process\.argv/m.test(content);
    if (!hasCLIRouting) continue; // No CLI routing — safe

    // Check for __isMainModule guard wrapping the CLI routing
    // Pattern: process.argv usage should only appear inside an __isMainModule guard
    // or inside a function definition (not at top level)
    const hasGuard = /__isMainModule/.test(content);
    if (hasGuard) continue; // Properly guarded

    violations.push(
      `${relPath}: has exports AND unguarded process.argv CLI routing. ` +
      `Wrap CLI code in: if (__isMainModule) { ... }`
    );
  }

  if (violations.length > 0) {
    return {
      name: layerName,
      status: 'fail',
      details: [
        `${violations.length} script(s) have unguarded CLI side effects:`,
        ...violations.map(v => `  ${v}`),
      ],
    };
  }

  return {
    name: layerName,
    status: 'pass',
    details: [`Scanned ${mjsFiles.length} .mjs files — all CLI entry points properly guarded`],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Layer 6: Portfolio Integrity — the commit-time half of the fail-closed guard
//
// env-guard.mjs denies at runtime anything it cannot positively identify as a
// permissive tier. That protects the customer's data but only tells you at the
// moment an agent is already blocked. This layer catches the same mistake at
// commit time — a forgotten `tier`, a client project with no client, a secret
// pasted where a variable NAME belongs — so the failure surfaces in review
// rather than in production.
// Spec: openspec/changes/business-os/specs/portfolio-registry.md REQ-003
// ---------------------------------------------------------------------------

// Commands that reach a real environment WITHOUT passing env-guard. An agent
// that writes one of these into a task description has routed around the
// boundary — not maliciously, just by doing what a shell-shaped task says. The
// guard can only protect calls that go through it.
const DIRECT_DEPLOY_RE = /\b(?:supabase\s+db\s+(?:push|reset)|vercel\s+(?:--prod|deploy\s+--prod)|npx\s+supabase\s+db\s+(?:push|reset))\b/i;

/** Scan queued task descriptions for commands that bypass env-guard. */
function scanTasksForGuardBypass(projectDir) {
  const queueDir = path.join(projectDir, 'tasks', 'queue');
  if (!fs.existsSync(queueDir)) return [];
  const hits = [];
  for (const f of fs.readdirSync(queueDir)) {
    if (!f.endsWith('.json')) continue;
    let task;
    try { task = JSON.parse(fs.readFileSync(path.join(queueDir, f), 'utf8')); } catch { continue; }
    if (task && task.status === 'completed') continue;
    const text = [task && task.title, task && task.description].filter(Boolean).join(' ');
    const m = DIRECT_DEPLOY_RE.exec(text);
    if (m) hits.push(`${f}: task instructs "${m[0]}" directly — route it through env-guard / deploy-runner instead`);
  }
  return hits;
}

async function runLayer6_Portfolio() {
  const layerName = 'Portfolio Integrity';
  const portfolioPath = process.env.PORTFOLIO_PATH || path.join(__dirname, '..', 'portfolio.json');

  if (!fs.existsSync(portfolioPath)) {
    // Not every consuming project keeps a portfolio; absence is not a failure.
    return { name: layerName, status: 'pass', details: ['No portfolio.json — skipped'] };
  }

  let mod;
  try {
    mod = await import('./portfolio.mjs');
  } catch (err) {
    return { name: layerName, status: 'fail', details: [`Could not load portfolio.mjs: ${err.message}`] };
  }

  let doc;
  try {
    doc = mod.load(portfolioPath);
  } catch (err) {
    return { name: layerName, status: 'fail', details: [err.message] };
  }

  const errors = mod.validate(doc);
  if (errors.length) {
    return {
      name: layerName,
      status: 'fail',
      details: [`portfolio.json has ${errors.length} problem(s):`, ...errors.map((e) => `  - ${e}`)],
    };
  }

  const bypass = scanTasksForGuardBypass(path.join(__dirname, '..'));
  if (bypass.length) {
    return {
      name: layerName,
      status: 'fail',
      details: [`${bypass.length} queued task(s) bypass env-guard:`, ...bypass.map((b) => `  - ${b}`)],
    };
  }

  const s = mod.status(doc);
  const details = [
    `${s.projects} project(s) — ${s.byOwner.client} client, ${s.byOwner.self} internal`,
    `${s.environments} environment(s): ${Object.entries(s.byTier).map(([t, n]) => `${t}=${n}`).join(' ')}`,
    'no queued task bypasses env-guard',
  ];
  if (s.missingPath.length) {
    details.push(`WARN: path missing on disk for: ${s.missingPath.join(', ')}`);
    return { name: layerName, status: 'warn', details };
  }
  return { name: layerName, status: 'pass', details };
}

async function main() {
  try { logCapabilityUsage('defeatTests', process.env.AGENT || 'system', process.env.TASK_ID || 'unknown', 'four-layer-validate.mjs', 'run'); } catch {}

  const targetFiles = await resolveTargetFiles();

  const [layer1, layer2, layer2_5, layer3, layer4, layer5, layer6] = await Promise.all([
    runLayer1(targetFiles),
    runLayer2(targetFiles),
    runLayer2_5_NLP(targetFiles),
    runLayer3(targetFiles),
    runLayer4(targetFiles),
    runLayer5_CLIGuards(),
    runLayer6_Portfolio(),
  ]);

  const layers = [layer1, layer2, layer2_5, layer3, layer4, layer5, layer6];
  const passed = layers.every((l) => l.status === 'pass' || l.status === 'warn');

  const report = { passed, layers };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    // Human-readable output
    const statusIcon = { pass: '✓', fail: '✗', warn: '!' };
    console.log('\nFour-Layer Validation Report');
    console.log('='.repeat(50));
    for (const layer of layers) {
      const icon = statusIcon[layer.status] || '?';
      console.log(`\n[${icon}] ${layer.name} (${layer.status.toUpperCase()})`);
      for (const detail of layer.details) {
        console.log(`    ${detail}`);
      }
    }
    console.log('\n' + '='.repeat(50));
    console.log(`Overall: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log('');
  }

  process.exit(passed ? 0 : 1);
}

const __isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (__isMainModule) {
main().catch((err) => {
  const report = {
    passed: false,
    layers: [{ name: 'Error', status: 'fail', details: [String(err)] }],
  };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.error('Fatal error:', err);
  }
  process.exit(1);
});
}
