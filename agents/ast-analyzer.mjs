#!/usr/bin/env node
/**
 * AST Analyzer — Semantic analysis using TypeScript compiler API.
 *
 * Analyses:
 *   1. Unused exports  — exports not imported anywhere in the project
 *   2. Circular deps   — import cycles detected via DFS
 *   3. Dead code       — functions defined but never called or exported
 *
 * Usage:
 *   node agents/ast-analyzer.mjs [--path <dir>] [--json]
 *
 * Defaults to LinguaFlow/src/ if no --path given.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _config = loadConfig();
const projectRoot = _config.projectDir;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let targetPath = path.join(_config.appPath, 'src');
let jsonMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--path' && args[i + 1]) {
    targetPath = path.resolve(args[++i]);
  } else if (args[i] === '--json') {
    jsonMode = true;
  }
}

// ---------------------------------------------------------------------------
// Load typescript from LinguaFlow/node_modules
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const tsModulePath = path.join(_config.appPath, 'node_modules', 'typescript');
const ts = require(tsModulePath);

// ---------------------------------------------------------------------------
// Collect all .ts / .tsx files under targetPath
// ---------------------------------------------------------------------------
function collectFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and __tests__ directories for speed
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...collectFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const allFiles = collectFiles(targetPath);

if (allFiles.length === 0) {
  const out = { error: `No TypeScript files found under: ${targetPath}` };
  if (jsonMode) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.error(out.error);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Create TypeScript program
// ---------------------------------------------------------------------------
const compilerOptions = {
  allowJs: false,
  jsx: ts.JsxEmit.ReactNative,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2020,
  noEmit: true,
  skipLibCheck: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  strict: false,
};

const program = ts.createProgram(allFiles, compilerOptions);
const checker = program.getTypeChecker();

// ---------------------------------------------------------------------------
// Helper: resolve a module specifier to an absolute file path
// ---------------------------------------------------------------------------
function resolveImport(fromFile, specifier) {
  // Only resolve relative imports — skip npm packages and path aliases
  if (!specifier.startsWith('.')) return null;

  const dir = path.dirname(fromFile);
  const candidates = [
    specifier,
    specifier + '.ts',
    specifier + '.tsx',
    specifier + '/index.ts',
    specifier + '/index.tsx',
  ];

  for (const candidate of candidates) {
    const full = path.resolve(dir, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build import graph: Map<file, Set<importedFile>>
// Also build: exportMap: Map<file, Set<exportName>>
//             importedNames: Map<file, Map<importedFile, Set<name>>>
// ---------------------------------------------------------------------------
const importGraph = new Map();  // file -> Set<file>
const exportMap = new Map();    // file -> Set<exportName>
const importedNames = new Map();// file -> Map<importedFile, Set<name>> (for unused-export)

for (const sourceFile of program.getSourceFiles()) {
  const filePath = sourceFile.fileName;
  if (!allFiles.includes(filePath)) continue;

  const imports = new Set();
  const exports = new Set();
  const inboundNames = new Map(); // importedFile -> Set<name>

  function visit(node) {
    // -----------------------------------------------------------------------
    // Import declarations: import { X } from './foo'
    // -----------------------------------------------------------------------
    if (ts.isImportDeclaration(node)) {
      const moduleSpec = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpec)) {
        const resolved = resolveImport(filePath, moduleSpec.text);
        if (resolved) {
          imports.add(resolved);

          // Collect imported names
          const names = new Set();
          if (node.importClause) {
            const clause = node.importClause;
            // default import
            if (clause.name) names.add('default');
            if (clause.namedBindings) {
              if (ts.isNamedImports(clause.namedBindings)) {
                for (const el of clause.namedBindings.elements) {
                  // el.propertyName is the original name if aliased
                  const originalName = el.propertyName ? el.propertyName.text : el.name.text;
                  names.add(originalName);
                }
              } else if (ts.isNamespaceImport(clause.namedBindings)) {
                // import * as X — marks ALL exports as used
                names.add('*');
              }
            }
          }
          if (!inboundNames.has(resolved)) inboundNames.set(resolved, new Set());
          for (const n of names) inboundNames.get(resolved).add(n);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Export declarations
    // -----------------------------------------------------------------------
    // export { X, Y }  or  export { X } from './foo'
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exports.add(el.name.text);
        }
      } else if (!node.exportClause) {
        // export * from './foo' — we skip tracking this as named export
        exports.add('*re-export*');
      }
    }

    // export function foo() {}
    if (ts.isFunctionDeclaration(node) && node.name) {
      const mods = ts.getCombinedModifierFlags(node);
      if (mods & ts.ModifierFlags.Export) exports.add(node.name.text);
    }

    // export class Foo {}
    if (ts.isClassDeclaration(node) && node.name) {
      const mods = ts.getCombinedModifierFlags(node);
      if (mods & ts.ModifierFlags.Export) exports.add(node.name.text);
    }

    // export const foo = ...  / export let / export var
    if (ts.isVariableStatement(node)) {
      const mods = ts.getCombinedModifierFlags(node);
      if (mods & ts.ModifierFlags.Export) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) exports.add(decl.name.text);
          else if (ts.isObjectBindingPattern(decl.name) || ts.isArrayBindingPattern(decl.name)) {
            // destructured export — walk binding elements
            for (const el of decl.name.elements) {
              if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
                exports.add(el.name.text);
              }
            }
          }
        }
      }
    }

    // export type Foo = ...
    if (ts.isTypeAliasDeclaration(node)) {
      const mods = ts.getCombinedModifierFlags(node);
      if (mods & ts.ModifierFlags.Export) exports.add(node.name.text);
    }

    // export interface Foo {}
    if (ts.isInterfaceDeclaration(node)) {
      const mods = ts.getCombinedModifierFlags(node);
      if (mods & ts.ModifierFlags.Export) exports.add(node.name.text);
    }

    // export enum Foo {}
    if (ts.isEnumDeclaration(node)) {
      const mods = ts.getCombinedModifierFlags(node);
      if (mods & ts.ModifierFlags.Export) exports.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  importGraph.set(filePath, imports);
  exportMap.set(filePath, exports);
  importedNames.set(filePath, inboundNames);
}

// ---------------------------------------------------------------------------
// Analysis 1: Unused Exports
// For each file, check each export name — is it imported by name in any other file?
// ---------------------------------------------------------------------------
function findUnusedExports() {
  const results = [];

  // Build reverse map: file -> set of files that import it
  const importedBy = new Map(); // file -> Map<name, Set<importingFile>>

  for (const [importer, byFile] of importedNames) {
    for (const [imported, names] of byFile) {
      if (!importedBy.has(imported)) importedBy.set(imported, new Map());
      const nameMap = importedBy.get(imported);
      for (const name of names) {
        if (!nameMap.has(name)) nameMap.set(name, new Set());
        nameMap.get(name).add(importer);
      }
    }
  }

  for (const [file, exports] of exportMap) {
    const nameMap = importedBy.get(file) || new Map();
    const unusedNames = [];

    for (const exportName of exports) {
      // Skip internal markers and 'default' (used implicitly by many things)
      if (exportName === '*re-export*') continue;

      // If any file does "import * as X from this", treat all exports as used
      if (nameMap.has('*')) continue;

      if (!nameMap.has(exportName)) {
        unusedNames.push(exportName);
      }
    }

    if (unusedNames.length > 0) {
      results.push({
        file: path.relative(projectRoot, file),
        unusedExports: unusedNames,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Analysis 2: Circular Dependencies
// DFS on importGraph to find cycles.
// ---------------------------------------------------------------------------
function findCircularDeps() {
  const cycles = [];
  const visited = new Set();
  const stack = new Set();
  const stackArr = [];

  function dfs(node) {
    if (stack.has(node)) {
      // Found a cycle — extract the cycle portion
      const cycleStart = stackArr.indexOf(node);
      const cycle = stackArr.slice(cycleStart).map(f => path.relative(projectRoot, f));
      cycle.push(path.relative(projectRoot, node)); // close the loop
      cycles.push(cycle);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    stackArr.push(node);

    const neighbors = importGraph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (importGraph.has(neighbor)) {
        dfs(neighbor);
      }
    }

    stack.delete(node);
    stackArr.pop();
  }

  for (const file of importGraph.keys()) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  // Deduplicate cycles (same cycle can appear starting from different nodes)
  const seen = new Set();
  const unique = [];
  for (const cycle of cycles) {
    // Normalize: sort the non-closing elements and join
    const normalized = [...cycle].slice(0, -1).sort().join('|');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(cycle);
    }
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Analysis 3: Dead Code (functions defined but never called or exported)
// ---------------------------------------------------------------------------
function findDeadCode() {
  const results = [];

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;
    if (!allFiles.includes(filePath)) continue;

    const fileExports = exportMap.get(filePath) || new Set();
    const deadFunctions = [];

    // Collect all top-level function names
    const topLevelFunctions = new Map(); // name -> node

    for (const stmt of sourceFile.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        topLevelFunctions.set(stmt.name.text, stmt);
      }
      // const foo = () => {}  or  const foo = function() {}
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            topLevelFunctions.set(decl.name.text, decl);
          }
        }
      }
    }

    if (topLevelFunctions.size === 0) continue;

    // Collect all call sites within the file
    const calledNames = new Set();

    function findCalls(node) {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isIdentifier(expr)) {
          calledNames.add(expr.text);
        } else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
          // method calls on objects — track object names too
          calledNames.add(expr.name.text);
        }
      }
      // Track identifier references (variable uses)
      if (ts.isIdentifier(node) && !ts.isDeclaration(node.parent)) {
        calledNames.add(node.text);
      }
      ts.forEachChild(node, findCalls);
    }

    findCalls(sourceFile);

    for (const [name] of topLevelFunctions) {
      const isExported = fileExports.has(name);
      const isCalled = calledNames.has(name);

      if (!isExported && !isCalled) {
        deadFunctions.push(name);
      }
    }

    if (deadFunctions.length > 0) {
      results.push({
        file: path.relative(projectRoot, filePath),
        deadFunctions,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Run all analyses
// ---------------------------------------------------------------------------
const unusedExports = findUnusedExports();
const circularDeps = findCircularDeps();
const deadCode = findDeadCode();

const summary = {
  analyzedFiles: allFiles.length,
  targetPath: path.relative(projectRoot, targetPath) || targetPath,
  unusedExports: {
    count: unusedExports.reduce((acc, r) => acc + r.unusedExports.length, 0),
    files: unusedExports.length,
    details: unusedExports,
  },
  circularDependencies: {
    count: circularDeps.length,
    cycles: circularDeps,
  },
  deadCode: {
    count: deadCode.reduce((acc, r) => acc + r.deadFunctions.length, 0),
    files: deadCode.length,
    details: deadCode,
  },
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (jsonMode) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('='.repeat(70));
  console.log('AST Analyzer — Semantic Analysis Report');
  console.log('='.repeat(70));
  console.log(`Target path : ${summary.targetPath}`);
  console.log(`Files analyzed: ${summary.analyzedFiles}`);
  console.log('');

  // --- Circular Dependencies ---
  console.log('-'.repeat(70));
  console.log(`CIRCULAR DEPENDENCIES (${summary.circularDependencies.count} cycles)`);
  console.log('-'.repeat(70));
  if (circularDeps.length === 0) {
    console.log('  None detected.');
  } else {
    for (const cycle of circularDeps) {
      console.log('  Cycle: ' + cycle.join(' -> '));
    }
  }
  console.log('');

  // --- Unused Exports ---
  console.log('-'.repeat(70));
  console.log(`UNUSED EXPORTS (${summary.unusedExports.count} exports across ${summary.unusedExports.files} files)`);
  console.log('-'.repeat(70));
  if (unusedExports.length === 0) {
    console.log('  None detected.');
  } else {
    for (const { file, unusedExports: names } of unusedExports) {
      console.log(`  ${file}`);
      for (const name of names) {
        console.log(`    - ${name}`);
      }
    }
  }
  console.log('');

  // --- Dead Code ---
  console.log('-'.repeat(70));
  console.log(`DEAD CODE (${summary.deadCode.count} functions across ${summary.deadCode.files} files)`);
  console.log('-'.repeat(70));
  if (deadCode.length === 0) {
    console.log('  None detected.');
  } else {
    for (const { file, deadFunctions } of deadCode) {
      console.log(`  ${file}`);
      for (const fn of deadFunctions) {
        console.log(`    - ${fn}()`);
      }
    }
  }
  console.log('');

  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`  Circular dependency cycles : ${summary.circularDependencies.count}`);
  console.log(`  Unused exports             : ${summary.unusedExports.count}`);
  console.log(`  Dead code functions        : ${summary.deadCode.count}`);
  console.log('');
}
