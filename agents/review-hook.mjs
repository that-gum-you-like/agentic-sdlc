#!/usr/bin/env node
/**
 * Git post-commit hook that triggers the reviewer agent to review commits.
 *
 * Usage:
 *   node review-hook.mjs install     # Symlink this script as .git/hooks/post-commit
 *   node review-hook.mjs run         # Manually trigger review on the latest commit
 *   node review-hook.mjs run --commit <sha>  # Review a specific commit
 *
 * The reviewer agent is identified by looking for an agent with the "reviewer"
 * role in the project's agents/budget.json, or by the --reviewer flag.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, symlinkSync, unlinkSync, chmodSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

function findReviewerAgent(config) {
  // Check --reviewer CLI flag first
  const reviewerIdx = process.argv.indexOf('--reviewer');
  if (reviewerIdx !== -1 && process.argv[reviewerIdx + 1]) {
    return process.argv[reviewerIdx + 1];
  }

  // Look in budget.json for an agent with role "reviewer" or tier "support"
  if (existsSync(config.budgetPath)) {
    const budget = JSON.parse(readFileSync(config.budgetPath, 'utf8'));
    const agents = budget.agents || {};
    for (const [name, meta] of Object.entries(agents)) {
      if (meta.role === 'reviewer' || meta.role === 'code-reviewer') {
        return name;
      }
    }
  }

  // Fall back: look for an agent directory with "review" in its checklist
  for (const agent of config.agents || []) {
    const slug = typeof agent === 'string' ? agent : agent.name || agent.slug;
    if (!slug) continue;
    const checklistPath = resolve(config.agentsDir, slug, 'checklist.md');
    if (existsSync(checklistPath)) {
      return slug;
    }
  }

  return null;
}

function loadChecklist(config, reviewerName) {
  // Try agent-specific checklist first
  const agentChecklist = resolve(config.agentsDir, reviewerName, 'checklist.md');
  if (existsSync(agentChecklist)) {
    return parseChecklist(readFileSync(agentChecklist, 'utf8'));
  }

  // Try the template checklist
  const templateChecklist = resolve(__dirname, 'templates', 'checklist.md.template');
  if (existsSync(templateChecklist)) {
    return parseChecklist(readFileSync(templateChecklist, 'utf8'));
  }

  // Default checklist
  return [
    { id: 'tests', label: 'Tests included or updated', pattern: /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/i },
    { id: 'small-files', label: 'No file exceeds 300 lines', pattern: null },
    { id: 'no-console', label: 'No console.log left in production code', pattern: /console\.log/i },
    { id: 'no-any', label: 'No untyped any usage', pattern: /:\s*any\b/ },
    { id: 'atomic-commit', label: 'Commit is focused on one concern', pattern: null },
    { id: 'no-secrets', label: 'No secrets or credentials committed', pattern: /(password|secret|api_key|token)\s*[:=]\s*['"][^'"]+/i },
    { id: 'docs-updated', label: 'Relevant documentation updated', pattern: null },
    { id: 'error-handling', label: 'Error cases handled (no silent failures)', pattern: /catch\s*\(\s*\)\s*\{?\s*\}/ },
  ];
}

function parseChecklist(markdownContent) {
  const items = [];
  const lines = markdownContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^[-*]\s+\[[ x]?\]\s+(.+)/i);
    if (match) {
      const label = match[1].trim();
      items.push({ id: label.toLowerCase().replace(/\s+/g, '-').slice(0, 40), label, pattern: null });
    }
  }
  if (items.length === 0) {
    // Fallback: treat every non-empty, non-heading line as a checklist item
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        items.push({ id: trimmed.toLowerCase().replace(/\s+/g, '-').slice(0, 40), label: trimmed, pattern: null });
      }
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Review logic
// ---------------------------------------------------------------------------

function reviewCommit(config, reviewerName, commitSha) {
  const diff = git(`diff ${commitSha}~1 ${commitSha}`);
  const message = git(`log -1 --pretty=%B ${commitSha}`);
  const changedFiles = git(`diff --name-only ${commitSha}~1 ${commitSha}`).split('\n').filter(Boolean);
  const author = git(`log -1 --pretty=%an ${commitSha}`);
  const shortSha = commitSha.slice(0, 8);

  const checklist = loadChecklist(config, reviewerName);

  console.log(`\n========================================`);
  console.log(`  Review: ${shortSha} by ${author}`);
  console.log(`  Message: ${message.split('\n')[0]}`);
  console.log(`  Files changed: ${changedFiles.length}`);
  console.log(`  Reviewer: ${reviewerName}`);
  console.log(`========================================\n`);

  const results = [];

  for (const item of checklist) {
    let status = 'pass'; // default pass for items without patterns
    let note = '';

    if (item.pattern) {
      const matches = diff.match(new RegExp(item.pattern.source, item.pattern.flags + 'g'));
      if (matches && matches.length > 0) {
        status = 'warn';
        note = `${matches.length} occurrence(s) found in diff`;
      }
    }

    // Special checks based on well-known item IDs
    if (item.id === 'tests' || item.id === 'tests-included-or-updated') {
      const hasTestFile = changedFiles.some(f => /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(f));
      if (!hasTestFile) {
        status = 'warn';
        note = 'No test files in this commit';
      }
    }

    if (item.id === 'small-files' || item.id === 'no-file-exceeds-300-lines') {
      for (const f of changedFiles) {
        try {
          const fullPath = resolve(config.projectDir, f);
          if (existsSync(fullPath)) {
            const lineCount = readFileSync(fullPath, 'utf8').split('\n').length;
            if (lineCount > 300) {
              status = 'warn';
              note = `${f} is ${lineCount} lines`;
              break;
            }
          }
        } catch { /* file may have been deleted */ }
      }
    }

    if (item.id === 'atomic-commit' || item.id === 'commit-is-focused-on-one-concern') {
      if (changedFiles.length > 15) {
        status = 'warn';
        note = `${changedFiles.length} files changed — may not be atomic`;
      }
    }

    results.push({ ...item, status, note });
  }

  // Print results
  let hasFailures = false;
  let hasWarnings = false;

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
    if (r.status === 'fail') hasFailures = true;
    if (r.status === 'warn') hasWarnings = true;

    const noteStr = r.note ? ` — ${r.note}` : '';
    console.log(`  [${icon}] ${r.label}${noteStr}`);
  }

  console.log('');

  // Overall verdict
  if (hasFailures) {
    console.log('  VERDICT: FAIL — issues must be addressed before merge\n');
    return 'fail';
  } else if (hasWarnings) {
    console.log('  VERDICT: WARN — review the warnings above\n');
    return 'warn';
  } else {
    console.log('  VERDICT: PASS — all checks passed\n');
    return 'pass';
  }
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function install() {
  const gitDir = git('rev-parse --git-dir');
  const hookDir = resolve(gitDir, 'hooks');
  const hookPath = resolve(hookDir, 'post-commit');

  // Remove existing hook/symlink if present
  if (existsSync(hookPath)) {
    unlinkSync(hookPath);
    console.log(`Removed existing post-commit hook at ${hookPath}`);
  }

  symlinkSync(__filename, hookPath);
  chmodSync(hookPath, '755');
  console.log(`Installed post-commit hook:`);
  console.log(`  ${hookPath} -> ${__filename}`);
  console.log(`\nThe reviewer agent will now review every commit automatically.`);
}

function run() {
  const config = loadConfig();
  const reviewerName = findReviewerAgent(config);

  if (!reviewerName) {
    console.error('ERROR: Could not find a reviewer agent.');
    console.error('Either configure one in agents/budget.json with role "reviewer",');
    console.error('or specify one with --reviewer <name>');
    process.exit(1);
  }

  // Determine which commit to review
  let commitSha;
  const commitIdx = process.argv.indexOf('--commit');
  if (commitIdx !== -1 && process.argv[commitIdx + 1]) {
    commitSha = git(`rev-parse ${process.argv[commitIdx + 1]}`);
  } else {
    commitSha = git('rev-parse HEAD');
  }

  const verdict = reviewCommit(config, reviewerName, commitSha);
  process.exit(verdict === 'fail' ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const subcommand = process.argv[2];

switch (subcommand) {
  case 'install':
    install();
    break;
  case 'run':
    run();
    break;
  default:
    // When invoked as a git hook, there's no subcommand — just run
    if (process.argv.length <= 2 || !['install', 'run'].includes(subcommand)) {
      run();
    }
    break;
}
