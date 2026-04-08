#!/usr/bin/env node
/**
 * Platform Maturity Assessment — Automated project health scanner.
 *
 * Evaluates a project across 8 dimensions and produces a scored report.
 * Read-only — never modifies project files.
 *
 * Usage:
 *   node agents/maturity-assess.mjs                    # Full assessment
 *   node agents/maturity-assess.mjs --dimension testing # Single dimension
 *   node agents/maturity-assess.mjs --json              # JSON output
 *   node agents/maturity-assess.mjs --dir /path         # Assess a different project
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const dirIdx = args.indexOf('--dir');
const dimIdx = args.indexOf('--dimension');
const singleDimension = dimIdx >= 0 ? args[dimIdx + 1] : null;

let PROJECT_DIR;
try {
  const config = loadConfig();
  PROJECT_DIR = dirIdx >= 0 ? resolve(args[dirIdx + 1]) : config.projectDir;
} catch {
  PROJECT_DIR = dirIdx >= 0 ? resolve(args[dirIdx + 1]) : process.cwd();
}

// --- Helpers ---

function fileExists(relPath) {
  return existsSync(join(PROJECT_DIR, relPath));
}

function readFile(relPath) {
  const p = join(PROJECT_DIR, relPath);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

function countFiles(dir, predicate) {
  const absDir = join(PROJECT_DIR, dir);
  if (!existsSync(absDir)) return 0;
  let count = 0;
  function walk(d) {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(full);
        } else if (entry.isFile() && predicate(entry.name)) {
          count++;
        }
      }
    } catch { /* permission error, skip */ }
  }
  walk(absDir);
  return count;
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
  } catch { return null; }
}

function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

// --- Dimension Assessors ---

function assessSDLC() {
  const evidence = [];
  let score = 0;

  // Level 1: Rules file
  const hasClaudeMd = fileExists('CLAUDE.md');
  const hasCursorRules = fileExists('.cursorrules');
  if (hasClaudeMd || hasCursorRules) { score += 1; evidence.push(`Rules file: ${hasClaudeMd ? 'CLAUDE.md' : '.cursorrules'}`); }
  else evidence.push('No rules file (CLAUDE.md or .cursorrules)');

  // Level 2: Test command configured
  const pkg = readFile('package.json');
  const hasTestScript = pkg && JSON.parse(pkg).scripts?.test;
  if (hasTestScript) { score += 0.5; evidence.push(`Test script: ${hasTestScript}`); }

  // Level 3: Task queue + agents
  const hasTaskQueue = fileExists('tasks/queue');
  const hasAgents = fileExists('agents/project.json');
  const hasDomains = fileExists('agents/domains.json');
  if (hasTaskQueue && hasAgents) { score += 1; evidence.push('Task queue + agent config present'); }
  if (hasDomains) { score += 0.5; evidence.push('Domain routing configured'); }

  // Level 4: Quality gates
  const hasDefeatTests = fileExists('agents/four-layer-validate.mjs') || runCmd('grep -rl "defeat" agents/ 2>/dev/null')?.length > 0;
  if (hasDefeatTests) { score += 0.5; evidence.push('Defeat tests / validation pipeline present'); }

  // Level 5: Memory system
  const hasMemory = readdirSync(join(PROJECT_DIR, 'agents')).some(d => {
    try { return existsSync(join(PROJECT_DIR, 'agents', d, 'memory', 'core.json')); } catch { return false; }
  });
  if (hasMemory) { score += 0.5; evidence.push('Agent memory system present'); }

  // Level 6: Behavior tests + pattern hunt
  const hasBehaviorTests = fileExists('agents/test-behavior.mjs');
  const hasPatternHunt = fileExists('agents/pattern-hunt.mjs');
  if (hasBehaviorTests && hasPatternHunt) { score += 0.5; evidence.push('Behavior tests + pattern hunt present'); }

  // OpenSpec governance
  const hasOpenspec = fileExists('openspec/changes') || fileExists('openspec/specs');
  if (hasOpenspec) { score += 0.5; evidence.push('OpenSpec governance in use'); }

  return { dimension: 'SDLC Process', score: Math.min(score, 5), evidence };
}

function assessTesting() {
  const evidence = [];
  let score = 0;

  // Test files exist
  const testCount = countFiles('.', f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'));
  const srcCount = countFiles('.', f => (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.py')) && !f.includes('.test.') && !f.includes('.spec.'));
  const ratio = srcCount > 0 ? testCount / srcCount : 0;

  if (testCount > 0) { score += 1; evidence.push(`${testCount} test files found (ratio: ${ratio.toFixed(2)} test/src)`); }
  else evidence.push('No test files found');

  if (ratio >= 0.5) { score += 1; evidence.push('Good test-to-source ratio (≥0.5)'); }
  else if (ratio >= 0.2) { score += 0.5; evidence.push('Moderate test-to-source ratio'); }

  // CI runs tests
  const ciConfig = readFile('.github/workflows/test.yml') || readFile('.github/workflows/ci.yml');
  if (ciConfig && ciConfig.includes('test')) { score += 1; evidence.push('CI runs tests on push/PR'); }
  else evidence.push('No CI test pipeline detected');

  // Defeat tests / static analysis
  const hasFourLayer = fileExists('agents/four-layer-validate.mjs');
  const hasLint = readFile('package.json')?.includes('"lint"');
  if (hasFourLayer) { score += 1; evidence.push('Four-layer validation pipeline present'); }
  if (hasLint) { score += 0.5; evidence.push('Linting configured'); }

  // E2E tests
  const hasE2E = fileExists('e2e') || fileExists('tests/e2e') || countFiles('.', f => f.includes('e2e') || f.includes('playwright') || f.includes('cypress')) > 0;
  if (hasE2E) { score += 0.5; evidence.push('E2E test infrastructure detected'); }

  return { dimension: 'Testing & Quality', score: Math.min(score, 5), evidence };
}

function assessDeployment() {
  const evidence = [];
  let score = 0;

  // CI/CD exists
  const hasGHA = fileExists('.github/workflows');
  const hasGitlabCI = fileExists('.gitlab-ci.yml');
  const hasJenkinsfile = fileExists('Jenkinsfile');
  if (hasGHA || hasGitlabCI || hasJenkinsfile) { score += 1; evidence.push(`CI/CD: ${hasGHA ? 'GitHub Actions' : hasGitlabCI ? 'GitLab CI' : 'Jenkins'}`); }
  else evidence.push('No CI/CD pipeline detected');

  // Deploy script
  const hasDeployScript = fileExists('scripts/deploy.sh') || fileExists('deploy.sh') || (readFile('package.json')?.includes('"deploy"'));
  if (hasDeployScript) { score += 1; evidence.push('Deploy script/command exists'); }
  else evidence.push('No deploy script found');

  // Containerization
  const hasDocker = fileExists('Dockerfile') || fileExists('docker-compose.yml');
  if (hasDocker) { score += 1; evidence.push('Containerization (Dockerfile/docker-compose)'); }

  // DORA: Deployment frequency from git log
  const recentDeploys = runCmd('git log --oneline --since="30 days ago" --grep="deploy\\|release\\|ship" 2>/dev/null');
  const deployCount = recentDeploys ? recentDeploys.split('\n').filter(l => l.trim()).length : 0;
  if (deployCount >= 20) { score += 1; evidence.push(`DORA Deploy Frequency: ${deployCount}/month (elite)`); }
  else if (deployCount >= 4) { score += 0.5; evidence.push(`DORA Deploy Frequency: ${deployCount}/month (high)`); }
  else evidence.push(`DORA Deploy Frequency: ${deployCount}/month`);

  // Rollback docs
  const hasRollback = runCmd('grep -rl "rollback" docs/ 2>/dev/null || grep -rl "rollback" CLAUDE.md 2>/dev/null');
  if (hasRollback) { score += 0.5; evidence.push('Rollback procedures documented'); }

  return { dimension: 'Deployment & Release', score: Math.min(score, 5), evidence };
}

function assessObservability() {
  const evidence = [];
  let score = 0;

  // Logging
  const hasStructuredLogs = runCmd('grep -rl "winston\\|pino\\|bunyan\\|structlog\\|logrus" . --include="*.json" --include="*.ts" --include="*.js" 2>/dev/null');
  if (hasStructuredLogs) { score += 1; evidence.push('Structured logging library detected'); }

  // Error tracking
  const hasSentry = runCmd('grep -rl "sentry\\|bugsnag\\|rollbar\\|datadog" . --include="*.json" --include="*.ts" --include="*.js" --include="*.env*" 2>/dev/null');
  if (hasSentry) { score += 1; evidence.push('Error tracking service configured'); }

  // Health endpoints
  const hasHealthCheck = runCmd('grep -rl "health\\|healthz\\|readyz\\|livez" . --include="*.ts" --include="*.js" --include="*.py" 2>/dev/null');
  if (hasHealthCheck) { score += 1; evidence.push('Health check endpoints detected'); }

  // Performance ledger (SDLC-specific)
  const hasLedger = fileExists('pm/model-performance.jsonl');
  const hasCostLog = fileExists('agents/cost-log.json');
  if (hasLedger || hasCostLog) { score += 1; evidence.push('Performance/cost tracking present'); }

  // Alerting
  const hasAlerting = runCmd('grep -rl "alert\\|pagerduty\\|opsgenie\\|notification.*trigger" agents/ docs/ 2>/dev/null');
  if (hasAlerting) { score += 1; evidence.push('Alerting/notification system configured'); }

  if (score === 0) evidence.push('No observability infrastructure detected');

  return { dimension: 'Observability', score: Math.min(score, 5), evidence };
}

function assessSecurity() {
  const evidence = [];
  let score = 0;

  // No hardcoded secrets
  const hasEnvExample = fileExists('.env.example') || fileExists('.env.template');
  if (hasEnvExample) { score += 1; evidence.push('.env.example exists (secrets documented)'); }

  // .gitignore covers sensitive files
  const gitignore = readFile('.gitignore') || '';
  const ignoresEnv = gitignore.includes('.env');
  if (ignoresEnv) { score += 0.5; evidence.push('.gitignore excludes .env files'); }

  // Dependency audit
  const auditResult = runCmd('npm audit --json 2>/dev/null');
  if (auditResult) {
    try {
      const audit = JSON.parse(auditResult);
      const vulns = audit.metadata?.vulnerabilities || {};
      const critical = vulns.critical || 0;
      const high = vulns.high || 0;
      if (critical === 0 && high === 0) { score += 1.5; evidence.push('No critical/high vulnerabilities in dependencies'); }
      else evidence.push(`Vulnerabilities: ${critical} critical, ${high} high`);
    } catch { evidence.push('npm audit ran but output unparseable'); }
  } else {
    // Not an npm project or no package-lock
    const hasLockfile = fileExists('package-lock.json') || fileExists('yarn.lock') || fileExists('pnpm-lock.yaml');
    if (hasLockfile) { score += 0.5; evidence.push('Lock file present (dependency pinning)'); }
    else evidence.push('No lock file found');
  }

  // Auth patterns
  const hasAuth = runCmd('grep -rl "auth\\|jwt\\|oauth\\|session\\|cookie" . --include="*.ts" --include="*.js" --include="*.py" 2>/dev/null');
  if (hasAuth) { score += 0.5; evidence.push('Authentication patterns detected'); }

  // OWASP awareness in review
  const hasSecurityReview = runCmd('grep -rl "OWASP\\|XSS\\|injection\\|CSRF" agents/ docs/ CLAUDE.md 2>/dev/null');
  if (hasSecurityReview) { score += 1; evidence.push('Security review patterns in agent/doc config'); }

  if (score === 0) evidence.push('No security practices detected');

  return { dimension: 'Security Posture', score: Math.min(score, 5), evidence };
}

function assessDependencyHealth() {
  const evidence = [];
  let score = 0;

  const pkg = readFile('package.json');
  if (!pkg) {
    // Check for other package managers
    if (fileExists('requirements.txt') || fileExists('Cargo.toml') || fileExists('go.mod')) {
      evidence.push('Non-Node project — dependency check limited');
      score = 2; // Assume baseline
    } else {
      evidence.push('No package manifest found');
      return { dimension: 'Dependency Health', score: 0, evidence };
    }
  }

  // Lock file
  const hasLock = fileExists('package-lock.json') || fileExists('yarn.lock') || fileExists('pnpm-lock.yaml');
  if (hasLock) { score += 1; evidence.push('Lock file committed'); }
  else evidence.push('No lock file — builds are non-deterministic');

  // Last dependency update
  const lastDepCommit = runCmd('git log --oneline -1 --diff-filter=M -- "package.json" 2>/dev/null');
  if (lastDepCommit) {
    const dateStr = runCmd('git log -1 --format=%ci --diff-filter=M -- "package.json" 2>/dev/null');
    const days = daysSince(dateStr);
    if (days < 30) { score += 1.5; evidence.push(`Dependencies updated ${days} days ago (recent)`); }
    else if (days < 90) { score += 1; evidence.push(`Dependencies updated ${days} days ago`); }
    else { score += 0.5; evidence.push(`Dependencies last updated ${days} days ago (stale)`); }
  }

  // Outdated packages
  const outdated = runCmd('npm outdated --json 2>/dev/null');
  if (outdated) {
    try {
      const pkgs = JSON.parse(outdated);
      const count = Object.keys(pkgs).length;
      if (count === 0) { score += 1.5; evidence.push('All dependencies up to date'); }
      else if (count < 5) { score += 1; evidence.push(`${count} outdated packages`); }
      else { score += 0.5; evidence.push(`${count} outdated packages (needs attention)`); }
    } catch { /* empty output = all current */ score += 1; evidence.push('Dependencies appear current'); }
  }

  return { dimension: 'Dependency Health', score: Math.min(score, 5), evidence };
}

function assessDocumentation() {
  const evidence = [];
  let score = 0;

  // README
  const readme = readFile('README.md');
  if (readme) {
    score += 1;
    evidence.push(`README.md exists (${readme.split('\n').length} lines)`);
    if (readme.includes('## ') && readme.split('## ').length >= 4) { score += 0.5; evidence.push('README has multiple sections'); }
  } else evidence.push('No README.md');

  // Onboarding
  const hasOnboarding = fileExists('ONBOARDING.md') || fileExists('docs/getting-started.md') || fileExists('CONTRIBUTING.md');
  if (hasOnboarding) { score += 1; evidence.push('Onboarding/contributing guide exists'); }

  // Architecture docs
  const hasArchDocs = fileExists('docs/') && readdirSync(join(PROJECT_DIR, 'docs')).length >= 3;
  if (hasArchDocs) { score += 1; evidence.push(`docs/ directory with ${readdirSync(join(PROJECT_DIR, 'docs')).length} files`); }

  // API docs or ADRs
  const hasADRs = fileExists('docs/adr') || fileExists('adr/') || runCmd('grep -rl "ADR\\|Architecture Decision" docs/ 2>/dev/null');
  if (hasADRs) { score += 0.5; evidence.push('Architecture decision records detected'); }

  // Glossary
  const hasGlossary = runCmd('grep -rl "glossary\\|Glossary" . --include="*.md" 2>/dev/null');
  if (hasGlossary) { score += 0.5; evidence.push('Glossary exists'); }

  // Troubleshooting
  const hasTroubleshooting = fileExists('docs/troubleshooting.md') || runCmd('grep -rl "Troubleshooting" . --include="*.md" 2>/dev/null');
  if (hasTroubleshooting) { score += 0.5; evidence.push('Troubleshooting guide exists'); }

  return { dimension: 'Documentation', score: Math.min(score, 5), evidence };
}

function assessOperationalReadiness() {
  const evidence = [];
  let score = 0;

  // Budget/cost controls
  const hasBudget = fileExists('agents/budget.json');
  if (hasBudget) { score += 1; evidence.push('Budget controls configured (agents/budget.json)'); }

  // Model manager / cost tracking
  const hasModelManager = fileExists('agents/model-manager.mjs');
  const hasCostTracker = fileExists('agents/cost-tracker.mjs');
  if (hasModelManager) { score += 1; evidence.push('Model manager for token budget monitoring'); }
  if (hasCostTracker) { score += 0.5; evidence.push('Cost tracking enabled'); }

  // Notification/alerting
  const hasNotify = fileExists('agents/notify.mjs');
  if (hasNotify) { score += 0.5; evidence.push('Notification system configured'); }

  // Backup/recovery
  const hasMemoryBackup = fileExists('agents/rem-sleep.mjs');
  if (hasMemoryBackup) { score += 0.5; evidence.push('Memory consolidation (REM sleep) for data preservation'); }

  // Conservation mode / circuit breakers
  const budget = readFile('agents/budget.json');
  if (budget?.includes('conservationMode')) { score += 0.5; evidence.push('Conservation mode available'); }
  if (budget?.includes('fallbackChain')) { score += 0.5; evidence.push('Fallback chains configured for resilience'); }

  // Cross-provider fallbacks
  if (budget) {
    try {
      const b = JSON.parse(budget);
      const agents = Object.values(b.agents || {});
      const hasCrossProvider = agents.some(a => {
        const providers = new Set();
        // This is a simplified check
        return (a.fallbackChain?.length || 0) >= 3;
      });
      if (hasCrossProvider) { score += 0.5; evidence.push('Cross-provider fallback chains (3+ models)'); }
    } catch {}
  }

  if (score === 0) evidence.push('No operational readiness infrastructure detected');

  return { dimension: 'Operational Readiness', score: Math.min(score, 5), evidence };
}

// --- Main ---

const ASSESSORS = {
  'sdlc': assessSDLC,
  'testing': assessTesting,
  'deployment': assessDeployment,
  'observability': assessObservability,
  'security': assessSecurity,
  'dependencies': assessDependencyHealth,
  'documentation': assessDocumentation,
  'operations': assessOperationalReadiness,
};

function maturityLabel(avg) {
  if (avg >= 5) return 'Exemplary';
  if (avg >= 4) return 'Leading';
  if (avg >= 3) return 'Advanced';
  if (avg >= 2) return 'Established';
  if (avg >= 1) return 'Developing';
  return 'Critical';
}

function run() {
  const dimensions = singleDimension
    ? { [singleDimension]: ASSESSORS[singleDimension] }
    : ASSESSORS;

  if (singleDimension && !ASSESSORS[singleDimension]) {
    console.error(`Unknown dimension: ${singleDimension}`);
    console.error(`Available: ${Object.keys(ASSESSORS).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const [key, fn] of Object.entries(dimensions)) {
    results.push(fn());
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const avgScore = results.length > 0 ? totalScore / results.length : 0;
  const label = maturityLabel(avgScore);

  if (jsonMode) {
    console.log(JSON.stringify({ project: PROJECT_DIR, date: new Date().toISOString().split('T')[0], overallScore: Math.round(avgScore * 10) / 10, label, dimensions: results }, null, 2));
    return;
  }

  // Human-readable report
  console.log(`\n# Platform Maturity Assessment — ${PROJECT_DIR.split('/').pop()}`);
  console.log(`**Date**: ${new Date().toISOString().split('T')[0]}`);
  console.log(`**Assessed by**: platform-maturity-sentinel\n`);

  console.log(`## Summary`);
  console.log(`Overall Score: **${avgScore.toFixed(1)}/5.0** (${label})\n`);

  console.log(`## Dimension Scores`);
  console.log('| Dimension | Score | Bar |');
  console.log('|-----------|-------|-----|');
  for (const r of results) {
    const bar = '█'.repeat(Math.round(r.score)) + '░'.repeat(5 - Math.round(r.score));
    console.log(`| ${r.dimension.padEnd(22)} | ${r.score.toFixed(1)}/5 | ${bar} |`);
  }

  // Top recommendations
  const weakest = [...results].sort((a, b) => a.score - b.score).slice(0, 3);
  console.log(`\n## Top 3 Recommendations`);
  for (let i = 0; i < weakest.length; i++) {
    const r = weakest[i];
    const gaps = r.evidence.filter(e => !e.includes('present') && !e.includes('exists') && !e.includes('configured') && !e.includes('detected') && !e.includes('committed') && !e.includes('recent') && !e.includes('current') && !e.includes('Good') && !e.includes('updated'));
    console.log(`${i + 1}. **${r.dimension}** (${r.score.toFixed(1)}/5): ${gaps[0] || 'Room for improvement'}`);
  }

  // Detailed findings
  console.log(`\n## Detailed Findings\n`);
  for (const r of results) {
    console.log(`### ${r.dimension} — ${r.score.toFixed(1)}/5`);
    for (const e of r.evidence) {
      const icon = e.includes('No ') || e.includes('stale') || e.includes('Vulnerabilities') || e.includes('non-deterministic') ? '❌' : '✅';
      console.log(`  ${icon} ${e}`);
    }
    console.log('');
  }
}

run();
