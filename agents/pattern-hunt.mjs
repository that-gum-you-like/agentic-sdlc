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

import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';

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
  const proposals = {
    'console-log': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Scan src/ for console.log calls in production code (non-test files). Maintain an allowlist of pre-existing violations; fail on any new file introducing console.log.',
      suiteName: 'Anti-pattern: no console.log in production src/',
      testName: 'no NEW files introduce console.log calls',
    },
    'any-type': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Scan src/ TypeScript files for `: any` type annotations (excluding comments). Maintain an allowlist; fail on new violations.',
      suiteName: 'Anti-pattern: no `: any` type annotations in production src/',
      testName: 'no NEW files introduce `: any` type annotations',
    },
    'missing-tests': {
      testFile: 'LinguaFlow/__tests__/defeat/coverage-gate.test.ts',
      description: 'For every src/ or app/ file modified in the last commit, assert a corresponding test file exists in __tests__/. Fail if source-only changes lack test coverage.',
      suiteName: 'Anti-pattern: every source change must have test coverage',
      testName: 'no source files changed without a corresponding test file',
    },
    'secrets': {
      testFile: 'LinguaFlow/__tests__/defeat/secrets-scan.test.ts',
      description: 'Scan src/ for patterns matching API keys, tokens, passwords, and JWT-like strings committed in plaintext. Zero tolerance — no allowlist.',
      suiteName: 'Anti-pattern: no secrets or API keys in source',
      testName: 'no hardcoded secrets found in src/',
    },
    'screen-size': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Collect all .tsx files under app/ (excluding _layout.tsx). Assert each is under 200 lines. Maintain an allowlist of pre-existing oversized screens; fail if a new screen exceeds the limit or an allowlisted screen grows.',
      suiteName: 'Anti-pattern: screen files must be under 200 lines',
      testName: 'no NEW screen files exceed 200 lines',
    },
    'service-size': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Collect all .ts files under src/services/. Assert each is under 150 lines. Maintain an allowlist of pre-existing oversized services; fail if a new service exceeds the limit or an allowlisted service grows.',
      suiteName: 'Anti-pattern: service files must be under 150 lines',
      testName: 'no NEW service files exceed 150 lines',
    },
    'hardcoded-values': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Scan src/ for hardcoded magic numbers or strings that should be constants (e.g., numeric literals > 9 outside of tests). Flag new violations; maintain allowlist for existing ones.',
      suiteName: 'Anti-pattern: no magic numbers or hardcoded string constants',
      testName: 'no NEW hardcoded magic values in src/',
    },
    'error-handling': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Scan src/services/ for async functions without try/catch or without returning { data, error } shaped results. Fail on new violations.',
      suiteName: 'Anti-pattern: all services must handle errors explicitly',
      testName: 'no NEW service functions silently swallow errors',
    },
    'missing-types': {
      testFile: 'LinguaFlow/__tests__/defeat/anti-patterns.test.ts',
      description: 'Scan src/ TypeScript files for function parameters or return types that are implicitly typed. Fail on new violations; maintain allowlist.',
      suiteName: 'Anti-pattern: no implicit TypeScript types in production src/',
      testName: 'no NEW functions with implicit parameter or return types',
    },
  };

  const known = proposals[pattern.category];
  if (known) return known;

  // Generic fallback
  return {
    testFile: `LinguaFlow/__tests__/defeat/anti-patterns.test.ts`,
    description: `Scan src/ for the pattern: "${pattern.label}". Track occurrences with an allowlist; fail on new violations.`,
    suiteName: `Anti-pattern: ${pattern.label}`,
    testName: `no NEW instances of "${pattern.label}" in src/`,
  };
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

  lines.push('\n' + '═'.repeat(60));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');

  // Load reviews
  const reviews = loadReviews();

  // Count total issues
  const totalIssues = reviews.reduce((sum, r) => sum + r.issues.length, 0);

  // Group by category
  const categoryMap = groupByCategory(reviews);

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
