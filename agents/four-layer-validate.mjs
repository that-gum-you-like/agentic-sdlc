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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

  // Only keep .ts/.tsx files
  return filePaths.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

// ---------------------------------------------------------------------------
// Layer 1: Research — Import Resolution via TypeScript compiler API
// ---------------------------------------------------------------------------

async function runLayer1(targetFiles) {
  const layerName = 'Research (Import Resolution)';
  const details = [];
  const unresolvedImports = [];

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
// Layer 3: Code — Defeat Test Patterns + AST Analysis
// ---------------------------------------------------------------------------

async function runLayer3(targetFiles) {
  const layerName = 'Code (Defeat Patterns + AST)';
  const issues = [];

  let ts;
  try {
    const requireFn = createRequire(import.meta.url);
    ts = requireFn(path.join(LINGUAFLOW_ROOT, 'node_modules', 'typescript'));
  } catch (e) {
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const targetFiles = await resolveTargetFiles();

  const [layer1, layer2, layer3, layer4] = await Promise.all([
    runLayer1(targetFiles),
    runLayer2(targetFiles),
    runLayer3(targetFiles),
    runLayer4(targetFiles),
  ]);

  const layers = [layer1, layer2, layer3, layer4];
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
