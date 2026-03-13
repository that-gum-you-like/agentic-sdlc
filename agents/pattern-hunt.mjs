#!/usr/bin/env node
/**
 * pattern-hunt.mjs — Richmond Review Pattern Miner
 *
 * Reads all reviews in agents/richmond/reviews/*.md, extracts flagged issues,
 * groups them by category, identifies recurring patterns (3+ reviews), cross-
 * references with git log for revert/fix commits on the same files, and
 * proposes defeat test descriptions for each recurring pattern.
 *
 * Usage:
 *   node agents/pattern-hunt.mjs          # Human-readable output
 *   node agents/pattern-hunt.mjs --json   # Machine-readable JSON output
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';

// Optional semantic clustering via embeddings
let clusterBySimilarity;
try {
  const si = await import('./semantic-index.mjs');
  clusterBySimilarity = si.clusterBySimilarity;
} catch { clusterBySimilarity = null; }

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = loadConfig();
const AGENTS_DIR = config.agentsDir;
const PROJECT_DIR = config.projectDir;

// Find the reviewer agent's reviews directory
function findReviewsDir() {
  for (const agent of config.agents) {
    const reviewsPath = resolve(AGENTS_DIR, agent, 'reviews');
    if (existsSync(reviewsPath)) return reviewsPath;
  }
  // Fallback to richmond (common name)
  return resolve(AGENTS_DIR, 'richmond', 'reviews');
}
const REVIEWS_DIR = findReviewsDir();
const RECURRENCE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Issue categorization
// ---------------------------------------------------------------------------

/**
 * Maps a raw issue string to a normalized category slug and label.
 * Returns { category, label } where category is a stable key.
 */
function categorizeIssue(issueText) {
  const lower = issueText.toLowerCase();

  if (lower.includes('console.log')) {
    return { category: 'console-log', label: 'console.log in production code' };
  }
  if (lower.includes('`any` type') || lower.includes('any type') || /:\s*any\b/.test(issueText)) {
    return { category: 'any-type', label: '`any` TypeScript type annotation' };
  }
  if (lower.includes('no test') || lower.includes('test files were modified') || lower.includes('missing test')) {
    return { category: 'missing-tests', label: 'Source changed without test coverage' };
  }
  if (lower.includes('secret') || lower.includes('api key') || lower.includes('token') || lower.includes('password')) {
    return { category: 'secrets', label: 'Possible secret or API key in code' };
  }
  if (lower.includes('lines') && (lower.includes('screen') || lower.includes('app/'))) {
    return { category: 'screen-size', label: 'Screen file exceeds 200-line limit' };
  }
  if (lower.includes('lines') && lower.includes('service')) {
    return { category: 'service-size', label: 'Service file exceeds 150-line limit' };
  }
  if (lower.includes('hardcoded') || lower.includes('magic number') || lower.includes('magic string')) {
    return { category: 'hardcoded-values', label: 'Hardcoded values instead of constants' };
  }
  if (lower.includes('error handling') || lower.includes('unhandled') || lower.includes('catch')) {
    return { category: 'error-handling', label: 'Missing or inadequate error handling' };
  }
  if (lower.includes('type') && (lower.includes('missing') || lower.includes('implicit'))) {
    return { category: 'missing-types', label: 'Missing TypeScript type annotation' };
  }

  // Generic fallback — preserve severity tag as category hint
  const severityMatch = issueText.match(/^\[(\w+)\]/);
  const severity = severityMatch ? severityMatch[1] : 'unknown';
  return { category: `other-${severity}`, label: issueText.substring(0, 60).trim() };
}

// ---------------------------------------------------------------------------
// Review parsing
// ---------------------------------------------------------------------------

/**
 * Parses a single review .md file.
 * Returns { commitHash, title, verdict, reviewedAt, issues[] }
 * Each issue: { severity, raw, category, label }
 */
function parseReview(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Extract metadata from header lines
  const titleMatch = content.match(/^## Review: (.+)$/m);
  const commitMatch = content.match(/^\*\*Commit:\*\* ([a-f0-9]+)/m);
  const verdictMatch = content.match(/^\*\*Verdict:\*\* (.+)$/m);
  const reviewedAtMatch = content.match(/_Reviewed by Richmond Avenal at (.+?)_/);

  const title = titleMatch ? titleMatch[1].trim() : 'Unknown';
  const commitHash = commitMatch ? commitMatch[1].trim() : 'unknown';
  const verdict = verdictMatch ? verdictMatch[1].trim() : 'UNKNOWN';
  const reviewedAt = reviewedAtMatch ? reviewedAtMatch[1].trim() : null;

  // Extract issues from the "### Issues Found" section
  const issues = [];
  let inIssuesSection = false;

  for (const line of lines) {
    if (line.trim() === '### Issues Found') {
      inIssuesSection = true;
      continue;
    }
    if (inIssuesSection && line.startsWith('###')) {
      // Next section — stop collecting issues
      break;
    }
    if (!inIssuesSection) continue;

    const trimmed = line.trim();
    // Issue lines look like: "1. [minor] ..." or "1. [major] ..." or "1. [critical] ..."
    const issueMatch = trimmed.match(/^\d+\.\s+(\[(?:critical|major|minor)\].+)$/i);
    if (issueMatch) {
      const raw = issueMatch[1];
      const severityMatch = raw.match(/^\[(critical|major|minor)\]/i);
      const severity = severityMatch ? severityMatch[1].toLowerCase() : 'minor';
      const { category, label } = categorizeIssue(raw);
      issues.push({ severity, raw, category, label });
    }
  }

  return { commitHash, title, verdict, reviewedAt, filePath, issues };
}

/**
 * Reads all review files from REVIEWS_DIR.
 * Returns an array of parsed review objects.
 */
function loadReviews() {
  if (!existsSync(REVIEWS_DIR)) {
    return [];
  }

  const files = readdirSync(REVIEWS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => resolve(REVIEWS_DIR, f));

  return files.map(parseReview);
}

// ---------------------------------------------------------------------------
// Pattern extraction
// ---------------------------------------------------------------------------

/**
 * Groups issues by category across all reviews.
 * Returns a Map: category → { label, count, severity (worst), reviews[], occurrences[] }
 */
function groupByCategory(reviews) {
  const categoryMap = new Map();

  for (const review of reviews) {
    // Track which categories appeared in this review (deduplicate per review)
    const seenInReview = new Set();

    for (const issue of review.issues) {
      const { category, label, severity } = issue;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          label,
          count: 0,
          worstSeverity: 'minor',
          reviews: [],
          occurrences: [],
        });
      }

      const entry = categoryMap.get(category);

      // Count unique reviews this category appears in
      if (!seenInReview.has(category)) {
        seenInReview.add(category);
        entry.count += 1;
        entry.reviews.push({
          commitHash: review.commitHash,
          title: review.title,
          reviewedAt: review.reviewedAt,
        });
      }

      // Track every individual occurrence
      entry.occurrences.push({
        commitHash: review.commitHash,
        title: review.title,
        raw: issue.raw,
        severity,
      });

      // Escalate severity if needed
      const severityRank = { minor: 1, major: 2, critical: 3 };
      if ((severityRank[severity] || 0) > (severityRank[entry.worstSeverity] || 0)) {
        entry.worstSeverity = severity;
      }
    }
  }

  return categoryMap;
}

/**
 * When embeddings are available, merge categories whose labels are semantically
 * similar (cosine >= 0.85) into a single cluster.  The most frequent label
 * becomes the cluster representative.
 *
 * Falls back to identity (no merging) when sentence-transformers isn't installed.
 */
async function semanticMergeCategories(categoryMap) {
  if (!clusterBySimilarity) return categoryMap;

  const entries = Array.from(categoryMap.values());
  if (entries.length < 2) return categoryMap;

  try {
    const labels = entries.map(e => e.label);
    const clusters = await clusterBySimilarity(labels, 0.85);

    // Build merged map
    const merged = new Map();
    for (const cluster of clusters) {
      // Pick representative: highest count
      const members = cluster.map(idx => entries[idx]);
      members.sort((a, b) => b.count - a.count);
      const rep = members[0];

      // Merge all members into the representative
      const combined = { ...rep, occurrences: [...rep.occurrences] };
      for (let i = 1; i < members.length; i++) {
        const m = members[i];
        combined.count += m.count;
        combined.occurrences.push(...m.occurrences);
        combined.reviews.push(...m.reviews);
        // Escalate severity
        const severityRank = { minor: 1, major: 2, critical: 3 };
        if ((severityRank[m.worstSeverity] || 0) > (severityRank[combined.worstSeverity] || 0)) {
          combined.worstSeverity = m.worstSeverity;
        }
      }
      // Update label to include cluster size
      if (members.length > 1) {
        combined.label = `${rep.label} (+${members.length - 1} similar)`;
      }
      merged.set(combined.category, combined);
    }

    return merged;
  } catch {
    // Fallback to original
    return categoryMap;
  }
}

/**
 * Identifies recurring patterns: categories appearing in >= RECURRENCE_THRESHOLD reviews.
 */
function findRecurringPatterns(categoryMap) {
  const patterns = [];
  for (const [, entry] of categoryMap) {
    if (entry.count >= RECURRENCE_THRESHOLD) {
      patterns.push(entry);
    }
  }
  // Sort by count descending
  patterns.sort((a, b) => b.count - a.count);
  return patterns;
}

// ---------------------------------------------------------------------------
// Git log analysis
// ---------------------------------------------------------------------------

/**
 * Runs `git log --oneline -100` and returns an array of commit objects:
 * { hash, message }
 */
function getGitLog() {
  try {
    const output = execSync('git log --oneline -100', {
      encoding: 'utf8',
      cwd: PROJECT_DIR,
    }).trim();

    if (!output) return [];

    return output.split('\n').map(line => {
      const spaceIdx = line.indexOf(' ');
      return {
        hash: line.substring(0, spaceIdx),
        message: line.substring(spaceIdx + 1),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Returns true if a commit message looks like a revert, fix, or hotfix commit.
 */
function isFixOrRevertCommit(message) {
  return /\b(revert|fix|hotfix|bugfix|bug fix|regression|patch)\b/i.test(message);
}

/**
 * For each fix/revert commit in git log, fetches the files it touched.
 * Returns an array of { hash, message, files[] }.
 */
function getFixCommitFiles(gitLog) {
  const fixCommits = gitLog.filter(c => isFixOrRevertCommit(c.message));

  const result = [];
  for (const commit of fixCommits) {
    try {
      const files = execSync(
        `git diff-tree --no-commit-id --name-only -r ${commit.hash}`,
        { encoding: 'utf8', cwd: PROJECT_DIR }
      ).trim().split('\n').filter(Boolean);

      result.push({ ...commit, files });
    } catch {
      // Skip commits that can't be inspected
    }
  }
  return result;
}

/**
 * Cross-references recurring patterns with fix/revert commits.
 * For each pattern, annotates with hotspot files that appear in both reviewed
 * commits and fix commits.
 *
 * Returns the patterns array with an added `hotspotFiles` field.
 */
function annotateWithGitHotspots(patterns, reviews, fixCommits) {
  // Build a set of files touched in reviewed commits
  const reviewCommitHashes = new Set(reviews.map(r => r.commitHash));

  // Build a map: file → count of fix commits touching it
  const fixFileCount = new Map();
  for (const fc of fixCommits) {
    for (const file of fc.files) {
      fixFileCount.set(file, (fixFileCount.get(file) || 0) + 1);
    }
  }

  // Get files from reviewed commits
  const reviewedFiles = new Set();
  for (const hash of reviewCommitHashes) {
    try {
      const files = execSync(
        `git diff-tree --no-commit-id --name-only -r ${hash}`,
        { encoding: 'utf8', cwd: PROJECT_DIR }
      ).trim().split('\n').filter(Boolean);
      for (const f of files) reviewedFiles.add(f);
    } catch {
      // Commit may no longer be accessible
    }
  }

  // Files that appear in both reviewed commits AND fix commits
  const hotspots = [];
  for (const [file, count] of fixFileCount) {
    if (reviewedFiles.has(file)) {
      hotspots.push({ file, fixCount: count });
    }
  }
  hotspots.sort((a, b) => b.fixCount - a.fixCount);

  // Attach top hotspots to each pattern (all patterns share the same pool for now)
  return patterns.map(p => ({
    ...p,
    hotspotFiles: hotspots.slice(0, 5),
  }));
}

// ---------------------------------------------------------------------------
// Defeat test proposal generation
// ---------------------------------------------------------------------------

/**
 * Generates a proposed defeat test description for a recurring pattern.
 */
function proposeDefeatTest(pattern) {
  const appDir = config.appDir;
  const proposals = {
    'console-log': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Scan src/ for console.log calls in production code (non-test files). Maintain an allowlist of pre-existing violations; fail on any new file introducing console.log.',
      suiteName: 'Anti-pattern: no console.log in production src/',
      testName: 'no NEW files introduce console.log calls',
    },
    'any-type': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Scan src/ TypeScript files for `: any` type annotations (excluding comments). Maintain an allowlist; fail on new violations.',
      suiteName: 'Anti-pattern: no `: any` type annotations in production src/',
      testName: 'no NEW files introduce `: any` type annotations',
    },
    'missing-tests': {
      testFile: `${appDir}/__tests__/defeat/coverage-gate.test.ts`,
      description: 'For every src/ or app/ file modified in the last commit, assert a corresponding test file exists in __tests__/. Fail if source-only changes lack test coverage.',
      suiteName: 'Anti-pattern: every source change must have test coverage',
      testName: 'no source files changed without a corresponding test file',
    },
    'secrets': {
      testFile: `${appDir}/__tests__/defeat/secrets-scan.test.ts`,
      description: 'Scan src/ for patterns matching API keys, tokens, passwords, and JWT-like strings committed in plaintext. Zero tolerance — no allowlist.',
      suiteName: 'Anti-pattern: no secrets or API keys in source',
      testName: 'no hardcoded secrets found in src/',
    },
    'screen-size': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Collect all .tsx files under app/ (excluding _layout.tsx). Assert each is under 200 lines. Maintain an allowlist of pre-existing oversized screens; fail if a new screen exceeds the limit or an allowlisted screen grows.',
      suiteName: 'Anti-pattern: screen files must be under 200 lines',
      testName: 'no NEW screen files exceed 200 lines',
    },
    'service-size': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Collect all .ts files under src/services/. Assert each is under 150 lines. Maintain an allowlist of pre-existing oversized services; fail if a new service exceeds the limit or an allowlisted service grows.',
      suiteName: 'Anti-pattern: service files must be under 150 lines',
      testName: 'no NEW service files exceed 150 lines',
    },
    'hardcoded-values': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Scan src/ for hardcoded magic numbers or strings that should be constants (e.g., numeric literals > 9 outside of tests). Flag new violations; maintain allowlist for existing ones.',
      suiteName: 'Anti-pattern: no magic numbers or hardcoded string constants',
      testName: 'no NEW hardcoded magic values in src/',
    },
    'error-handling': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Scan src/services/ for async functions without try/catch or without returning { data, error } shaped results. Fail on new violations.',
      suiteName: 'Anti-pattern: all services must handle errors explicitly',
      testName: 'no NEW service functions silently swallow errors',
    },
    'missing-types': {
      testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
      description: 'Scan src/ TypeScript files for function parameters or return types that are implicitly typed. Fail on new violations; maintain allowlist.',
      suiteName: 'Anti-pattern: no implicit TypeScript types in production src/',
      testName: 'no NEW functions with implicit parameter or return types',
    },
  };

  const known = proposals[pattern.category];
  if (known) return known;

  // Generic fallback
  return {
    testFile: `${appDir}/__tests__/defeat/anti-patterns.test.ts`,
    description: `Scan src/ for the pattern: "${pattern.label}". Track occurrences with an allowlist; fail on new violations.`,
    suiteName: `Anti-pattern: ${pattern.label}`,
    testName: `no NEW instances of "${pattern.label}" in src/`,
  };
}

// ---------------------------------------------------------------------------
// Defeat test code generation
// ---------------------------------------------------------------------------

/**
 * Resolved path to the project's anti-patterns defeat test file.
 * Derived from config so it works for any project, not just LinguaFlow.
 */
function getAntiPatternsTestFile() {
  return resolve(config.appPath, '__tests__/defeat/anti-patterns.test.ts');
}

/**
 * Map from category slug → describe() suite name used in anti-patterns.test.ts.
 * Used to detect whether a test already exists for a given category.
 */
const CATEGORY_SUITE_MARKERS = {
  'any-type':      'Anti-pattern: no `: any` type annotations in production src/',
  'console-log':   'Anti-pattern: no console.log in production src/',
  'service-size':  'Anti-pattern: service files must be under',
  'screen-size':   'Anti-pattern: screen files must be under',
  'missing-tests': 'Anti-pattern: every source change must have test coverage',
  'secrets':       'Anti-pattern: no secrets or API keys in source',
  'hardcoded-values': 'Anti-pattern: no magic numbers or hardcoded string constants',
  'error-handling':   'Anti-pattern: all services must handle errors explicitly',
  'missing-types':    'Anti-pattern: no implicit TypeScript types in production src/',
};

/**
 * Generates the TypeScript source for a new defeat test block.
 * Follows the exact style of the existing tests in anti-patterns.test.ts.
 */
function generateTestBlock(pattern) {
  const { category, label } = pattern;

  // Template variations per category
  if (category === 'error-handling') {
    const constName = 'ERROR_HANDLING_ALLOWLIST';
    return `
// ---------------------------------------------------------------------------
// Auto-generated defeat test — ${label}
// ---------------------------------------------------------------------------

/**
 * Files that already contain async functions without explicit error handling.
 * Do NOT add new entries. Fix the violation instead.
 */
const ${constName} = new Set<string>([
  // Add pre-existing violations here when first running this test
]);

describe('Anti-pattern: all services must handle errors explicitly', () => {
  const servicesDir = path.join(ROOT, 'src', 'services');

  const serviceFiles = collectFiles(servicesDir, (f) => {
    if (isTestFile(f)) return false;
    return f.endsWith('.ts') || f.endsWith('.tsx');
  });

  test('no NEW service functions silently swallow errors', () => {
    /**
     * Flags async functions that do NOT have a try/catch block.
     * This is a heuristic scan — it checks for 'async ' followed by function
     * bodies that lack 'try {' or 'catch'.
     */
    const newViolations: string[] = [];

    for (const filePath of serviceFiles) {
      const relPath = rel(filePath);
      if (${constName}.has(relPath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      // Look for async function declarations without any try/catch in the file
      const hasAsyncFn = /\\basync\\b/.test(content);
      const hasTryCatch = /\\btry\\s*\\{/.test(content);

      if (hasAsyncFn && !hasTryCatch) {
        newViolations.push(relPath);
      }
    }

    expect(newViolations).toEqual(
      [],
      \`Service files with async functions but no try/catch found:\\n\` +
        newViolations.map((v) => \`  • \${v}\`).join('\\n'),
    );
  });

  test('allowlist does not contain phantom entries', () => {
    const phantoms: string[] = [];
    for (const relPath of ${constName}) {
      if (!fs.existsSync(path.join(ROOT, relPath))) {
        phantoms.push(relPath);
      }
    }
    if (phantoms.length > 0) {
      console.warn(
        \`allowlist cleanup: these files no longer exist and can be removed from ${constName}:\\n\` +
          phantoms.map((p) => \`  • \${p}\`).join('\\n'),
      );
    }
  });
});
`;
  }

  if (category === 'missing-types') {
    const constName = 'MISSING_TYPES_ALLOWLIST';
    return `
// ---------------------------------------------------------------------------
// Auto-generated defeat test — ${label}
// ---------------------------------------------------------------------------

/**
 * Files that already have implicit TypeScript types.
 * Do NOT add new entries. Fix the violation instead.
 */
const ${constName} = new Set<string>([
  // Add pre-existing violations here when first running this test
]);

describe('Anti-pattern: no implicit TypeScript types in production src/', () => {
  const srcDir = path.join(ROOT, 'src');

  const tsTsxFiles = collectFiles(srcDir, (f) => {
    if (isTestFile(f)) return false;
    return f.endsWith('.ts') || f.endsWith('.tsx');
  });

  test('no NEW functions with implicit parameter or return types', () => {
    /**
     * Flags function parameters that look like they are missing type annotations.
     * Heuristic: matches '(paramName)' or '(paramName, paramName)' with no ':' type.
     * Excludes arrow functions that are callbacks / short lambdas.
     */
    const newViolations: string[] = [];

    for (const filePath of tsTsxFiles) {
      const relPath = rel(filePath);
      if (${constName}.has(relPath)) continue;

      const fileLines = lines(filePath);
      const violatingLines: number[] = [];

      fileLines.forEach((line, idx) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        // Match function/method params that lack a ':' type annotation
        // e.g. 'function foo(bar)' or '(bar, baz) =>' — but NOT '(bar: string)'
        if (/function\\s+\\w+\\s*\\([^)]*\\)\\s*\\{/.test(line) && !/\\([^)]*:[^)]*\\)/.test(line)) {
          violatingLines.push(idx + 1);
        }
      });

      if (violatingLines.length > 0) {
        newViolations.push(\`\${relPath} (lines: \${violatingLines.join(', ')})\`);
      }
    }

    expect(newViolations).toEqual(
      [],
      \`Files with untyped function parameters found — add explicit TypeScript types:\\n\` +
        newViolations.map((v) => \`  • \${v}\`).join('\\n'),
    );
  });

  test('allowlist does not contain phantom entries', () => {
    const phantoms: string[] = [];
    for (const relPath of ${constName}) {
      if (!fs.existsSync(path.join(ROOT, relPath))) {
        phantoms.push(relPath);
      }
    }
    if (phantoms.length > 0) {
      console.warn(
        \`allowlist cleanup: these files no longer exist and can be removed from ${constName}:\\n\` +
          phantoms.map((p) => \`  • \${p}\`).join('\\n'),
      );
    }
  });
});
`;
  }

  if (category === 'hardcoded-values') {
    const constName = 'HARDCODED_VALUES_ALLOWLIST';
    return `
// ---------------------------------------------------------------------------
// Auto-generated defeat test — ${label}
// ---------------------------------------------------------------------------

/**
 * Files that already contain hardcoded magic values.
 * Do NOT add new entries. Extract to named constants instead.
 */
const ${constName} = new Set<string>([
  // Add pre-existing violations here when first running this test
]);

describe('Anti-pattern: no magic numbers or hardcoded string constants', () => {
  const srcDir = path.join(ROOT, 'src');

  const tsTsxFiles = collectFiles(srcDir, (f) => {
    if (isTestFile(f)) return false;
    return f.endsWith('.ts') || f.endsWith('.tsx');
  });

  test('no NEW hardcoded magic values in src/', () => {
    /**
     * Flags numeric literals > 9 that appear in non-trivial positions.
     * Excludes: CSS-like values (style props), array indices 0/1, common idioms.
     * This is intentionally conservative to avoid false positives.
     */
    const newViolations: string[] = [];

    for (const filePath of tsTsxFiles) {
      const relPath = rel(filePath);
      if (${constName}.has(relPath)) continue;

      const fileLines = lines(filePath);
      const violatingLines: number[] = [];

      fileLines.forEach((line, idx) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        if (trimmed.startsWith('const ') || trimmed.startsWith('export const ')) return;
        const codeBeforeComment = line.split('//')[0];
        // Numeric literals > 9 outside of allowlisted positions
        if (/[^\\w](\\d{2,})[^\\w]/.test(codeBeforeComment)) {
          violatingLines.push(idx + 1);
        }
      });

      if (violatingLines.length > 0) {
        newViolations.push(\`\${relPath} (lines: \${violatingLines.join(', ')})\`);
      }
    }

    expect(newViolations).toEqual(
      [],
      \`New hardcoded magic values found — extract to named constants:\\n\` +
        newViolations.map((v) => \`  • \${v}\`).join('\\n'),
    );
  });

  test('allowlist does not contain phantom entries', () => {
    const phantoms: string[] = [];
    for (const relPath of ${constName}) {
      if (!fs.existsSync(path.join(ROOT, relPath))) {
        phantoms.push(relPath);
      }
    }
    if (phantoms.length > 0) {
      console.warn(
        \`allowlist cleanup: these files no longer exist and can be removed from ${constName}:\\n\` +
          phantoms.map((p) => \`  • \${p}\`).join('\\n'),
      );
    }
  });
});
`;
  }

  // Generic fallback template for unknown categories
  const constName = category.replace(/-/g, '_').toUpperCase() + '_ALLOWLIST';
  const suiteName = `Anti-pattern: ${label}`;
  const testName = `no NEW instances of "${label}" in src/`;

  return `
// ---------------------------------------------------------------------------
// Auto-generated defeat test — ${label}
// ---------------------------------------------------------------------------

/**
 * Files that already contain violations of: ${label}.
 * Do NOT add new entries. Fix the violation instead.
 */
const ${constName} = new Set<string>([
  // Add pre-existing violations here when first running this test
]);

describe('${suiteName}', () => {
  const srcDir = path.join(ROOT, 'src');

  const tsTsxFiles = collectFiles(srcDir, (f) => {
    if (isTestFile(f)) return false;
    return f.endsWith('.ts') || f.endsWith('.tsx');
  });

  test('source tree contains TypeScript files to scan', () => {
    expect(tsTsxFiles.length).toBeGreaterThan(0);
  });

  test('${testName}', () => {
    const newViolations: string[] = [];

    for (const filePath of tsTsxFiles) {
      const relPath = rel(filePath);
      if (${constName}.has(relPath)) continue;

      // TODO: Add pattern-specific detection logic here.
      // This is a generated scaffold — fill in the violation check.
      const fileLines = lines(filePath);
      void fileLines; // suppress unused warning until logic is added
    }

    expect(newViolations).toEqual(
      [],
      \`New violations of "${label}" found:\\n\` +
        newViolations.map((v) => \`  • \${v}\`).join('\\n'),
    );
  });

  test('allowlist does not contain phantom entries', () => {
    const phantoms: string[] = [];
    for (const relPath of ${constName}) {
      if (!fs.existsSync(path.join(ROOT, relPath))) {
        phantoms.push(relPath);
      }
    }
    if (phantoms.length > 0) {
      console.warn(
        \`allowlist cleanup: these files no longer exist and can be removed from ${constName}:\\n\` +
          phantoms.map((p) => \`  • \${p}\`).join('\\n'),
      );
    }
  });
});
`;
}

/**
 * Checks whether a test already exists in the anti-patterns file for the
 * given category by searching for the category's expected describe() string.
 */
function testAlreadyExists(fileContent, category) {
  const marker = CATEGORY_SUITE_MARKERS[category];
  if (marker) {
    return fileContent.includes(marker);
  }
  // For unknown categories, look for the generic label in a describe() call
  return false;
}

/**
 * Auto-generates defeat tests for recurring patterns that don't already have
 * a test in anti-patterns.test.ts. Appends new tests before the final `});`.
 *
 * Returns an array of detail objects describing what was done.
 */
function generateDefeatTests(recurringPatterns, dryRun = false) {
  const antiPatternsTestFile = getAntiPatternsTestFile();

  if (!existsSync(antiPatternsTestFile)) {
    return recurringPatterns.map(p => ({
      pattern: p.category,
      action: 'skipped',
      reason: 'anti-patterns.test.ts not found',
    }));
  }

  const fileContent = readFileSync(antiPatternsTestFile, 'utf8');
  const details = [];
  const newBlocks = [];

  for (const pattern of recurringPatterns) {
    // Only generate tests for patterns targeting anti-patterns.test.ts
    const proposal = pattern.defeatTestProposal;
    if (!proposal.testFile.includes('anti-patterns.test.ts')) {
      details.push({
        pattern: pattern.category,
        action: 'skipped',
        reason: `targets different file: ${proposal.testFile}`,
      });
      continue;
    }

    if (testAlreadyExists(fileContent, pattern.category)) {
      details.push({
        pattern: pattern.category,
        action: 'skipped',
        reason: 'test already exists',
      });
      continue;
    }

    const block = generateTestBlock(pattern);
    newBlocks.push({ pattern, block });
    details.push({
      pattern: pattern.category,
      action: dryRun ? 'would-generate' : 'generated',
      reason: dryRun ? 'dry-run mode — no files written' : 'no existing test for this category',
    });
  }

  if (!dryRun && newBlocks.length > 0) {
    // Append all new blocks at the end of the file (after the final `});`)
    const separator = '\n';
    const appendContent = newBlocks.map(b => b.block).join('\n');
    writeFileSync(antiPatternsTestFile, fileContent + separator + appendContent, 'utf8');
  }

  return details;
}

/**
 * Writes the pattern-hunt-output.json summary file to the project's agents dir.
 */
function writeOutputJson(recurringPatterns, details, dryRun) {
  const outputPath = resolve(config.agentsDir, 'pattern-hunt-output.json');
  const testsGenerated = details.filter(d => d.action === 'generated').length;
  const testsSkipped = details.filter(d => d.action === 'skipped').length;
  const wouldGenerate = details.filter(d => d.action === 'would-generate').length;

  const output = {
    timestamp: new Date().toISOString(),
    dryRun,
    patternsFound: recurringPatterns.length,
    testsGenerated: dryRun ? 0 : testsGenerated,
    testsWouldGenerate: dryRun ? wouldGenerate : undefined,
    testsSkipped: dryRun ? testsSkipped : testsSkipped,
    details,
  };

  // Clean up undefined fields
  if (!dryRun) delete output.testsWouldGenerate;

  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  return { outputPath, testsGenerated: dryRun ? wouldGenerate : testsGenerated, testsSkipped };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatHumanReadable(result) {
  const lines = [];

  lines.push('═'.repeat(60));
  lines.push('  Pattern Hunt — Richmond Review Analysis');
  lines.push(`  Scanned: ${result.totalReviews} reviews  |  Issues: ${result.totalIssues}`);
  lines.push('═'.repeat(60));

  // All categories summary
  lines.push('\n── All Issue Categories ─────────────────────────────────');
  if (result.allCategories.length === 0) {
    lines.push('  No issues found in any review.');
  } else {
    for (const cat of result.allCategories) {
      const recurring = cat.count >= RECURRENCE_THRESHOLD ? ' [RECURRING]' : '';
      lines.push(`  ${cat.count.toString().padStart(3)}x  [${cat.worstSeverity.padEnd(8)}]  ${cat.label}${recurring}`);
    }
  }

  // Recurring patterns
  lines.push('\n── Recurring Patterns (3+ reviews) ─────────────────────');
  if (result.recurringPatterns.length === 0) {
    lines.push('  No recurring patterns found yet.');
  } else {
    for (const p of result.recurringPatterns) {
      lines.push(`\n  Pattern: ${p.label}`);
      lines.push(`  Category: ${p.category}  |  Severity: ${p.worstSeverity}  |  Reviews: ${p.count}`);

      lines.push('  Affected reviews:');
      for (const r of p.reviews) {
        lines.push(`    • ${r.commitHash}  ${r.title.substring(0, 50)}`);
      }

      if (p.hotspotFiles && p.hotspotFiles.length > 0) {
        lines.push('  Git hotspot files (appeared in fix/revert commits):');
        for (const h of p.hotspotFiles) {
          lines.push(`    • ${h.file}  (${h.fixCount} fix commit${h.fixCount !== 1 ? 's' : ''})`);
        }
      }

      const proposal = p.defeatTestProposal;
      lines.push('  Proposed defeat test:');
      lines.push(`    File:  ${proposal.testFile}`);
      lines.push(`    Suite: ${proposal.suiteName}`);
      lines.push(`    Test:  ${proposal.testName}`);
      lines.push(`    Desc:  ${proposal.description}`);
    }
  }

  // Git analysis summary
  lines.push('\n── Git Log Analysis ─────────────────────────────────────');
  lines.push(`  Commits scanned: ${result.gitAnalysis.commitsScanned}`);
  lines.push(`  Fix/revert commits: ${result.gitAnalysis.fixCommitCount}`);
  if (result.gitAnalysis.topHotspotFiles.length > 0) {
    lines.push('  Top hotspot files (most fix commits):');
    for (const h of result.gitAnalysis.topHotspotFiles) {
      lines.push(`    • ${h.file}  (${h.fixCount} fix commit${h.fixCount !== 1 ? 's' : ''})`);
    }
  } else {
    lines.push('  No hotspot files identified.');
  }

  // Test generation summary
  const gen = result.testGeneration;
  if (gen) {
    const modeLabel = gen.dryRun ? 'Defeat Test Generation (DRY RUN)' : 'Defeat Test Generation';
    lines.push(`\n── ${modeLabel} ${'─'.repeat(Math.max(0, 57 - modeLabel.length - 4))}`);
    if (gen.dryRun) {
      lines.push(`  Would generate: ${gen.testsGenerated}  |  Would skip: ${gen.testsSkipped}`);
    } else {
      lines.push(`  Generated: ${gen.testsGenerated}  |  Skipped: ${gen.testsSkipped}  |  Output: ${gen.outputFile}`);
    }
    if (gen.details && gen.details.length > 0) {
      for (const d of gen.details) {
        const icon = d.action === 'generated' ? '+' : d.action === 'would-generate' ? '~' : '–';
        lines.push(`  ${icon}  [${d.action.padEnd(14)}]  ${d.pattern.padEnd(20)}  ${d.reason}`);
      }
    } else {
      lines.push('  No recurring patterns to evaluate for test generation.');
    }
  }

  lines.push('\n' + '═'.repeat(60));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const dryRun = args.includes('--dry-run');

  // Load reviews
  const reviews = loadReviews();

  // Count total issues
  const totalIssues = reviews.reduce((sum, r) => sum + r.issues.length, 0);

  // Group by category (with optional semantic clustering)
  const rawCategoryMap = groupByCategory(reviews);
  const categoryMap = await semanticMergeCategories(rawCategoryMap);

  // All categories sorted by count desc
  const allCategories = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count);

  // Find recurring patterns
  let recurringPatterns = findRecurringPatterns(categoryMap);

  // Git log analysis
  const gitLog = getGitLog();
  const fixCommits = getFixCommitFiles(gitLog);

  // Build top hotspot files globally
  const globalFixFileCount = new Map();
  for (const fc of fixCommits) {
    for (const file of fc.files) {
      globalFixFileCount.set(file, (globalFixFileCount.get(file) || 0) + 1);
    }
  }
  const topHotspotFiles = Array.from(globalFixFileCount.entries())
    .map(([file, fixCount]) => ({ file, fixCount }))
    .sort((a, b) => b.fixCount - a.fixCount)
    .slice(0, 10);

  // Annotate patterns with hotspot data
  recurringPatterns = annotateWithGitHotspots(recurringPatterns, reviews, fixCommits);

  // Attach defeat test proposals
  recurringPatterns = recurringPatterns.map(p => ({
    ...p,
    defeatTestProposal: proposeDefeatTest(p),
  }));

  // Auto-generate defeat tests for recurring patterns not yet covered
  const generationDetails = generateDefeatTests(recurringPatterns, dryRun);
  const { outputPath, testsGenerated, testsSkipped } = writeOutputJson(
    recurringPatterns,
    generationDetails,
    dryRun,
  );

  const result = {
    generatedAt: new Date().toISOString(),
    totalReviews: reviews.length,
    totalIssues,
    recurringThreshold: RECURRENCE_THRESHOLD,
    allCategories: allCategories.map(c => ({
      category: c.category,
      label: c.label,
      count: c.count,
      worstSeverity: c.worstSeverity,
      totalOccurrences: c.occurrences.length,
    })),
    recurringPatterns: recurringPatterns.map(p => ({
      category: p.category,
      label: p.label,
      count: p.count,
      worstSeverity: p.worstSeverity,
      totalOccurrences: p.occurrences.length,
      reviews: p.reviews,
      hotspotFiles: p.hotspotFiles || [],
      defeatTestProposal: p.defeatTestProposal,
    })),
    gitAnalysis: {
      commitsScanned: gitLog.length,
      fixCommitCount: fixCommits.length,
      topHotspotFiles,
    },
    testGeneration: {
      dryRun,
      testsGenerated,
      testsSkipped,
      outputFile: outputPath,
      details: generationDetails,
    },
  };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(formatHumanReadable(result) + '\n');
  }
}

main().catch(err => {
  process.stderr.write(`pattern-hunt error: ${err.message}\n`);
  process.exit(1);
});
