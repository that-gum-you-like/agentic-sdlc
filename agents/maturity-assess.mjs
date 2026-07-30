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

// --- Evidence ---
//
// Evidence records carry their own polarity. The renderer used to infer it by
// testing each line for the substring 'No ', which reported the *positive*
// findings "No dependency vulnerabilities possible (zero attack surface)" and
// "No critical/high vulnerabilities in dependencies" as failures, and fed the
// same mistake into the Top-3 recommendations (which once opened with the
// passing line "CI/CD: GitHub Actions"). The check that runs already knows the
// answer, so it records it.

/** Passing finding. */
const pass = (text) => ({ text, ok: true });
/** Failing finding — a real gap. */
const fail = (text) => ({ text, ok: false });
/** Informational — neither credit nor gap (e.g. partial credit with a caveat). */
const info = (text) => ({ text, ok: null });

export function evidenceText(e) {
  return typeof e === 'string' ? e : e.text;
}

/** @returns {boolean|null} true=pass, false=gap, null=informational */
export function evidenceOk(e) {
  if (typeof e !== 'string') return e.ok;
  // Legacy plain-string evidence (possible from an external consumer): fall
  // back to the old substring heuristic rather than silently calling it a pass.
  return !(e.includes('No ') || e.includes('stale') || e.includes('Vulnerabilities') || e.includes('non-deterministic'));
}

export function evidenceIcon(e) {
  const ok = evidenceOk(e);
  return ok === null ? '•' : ok ? '✅' : '❌';
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

/**
 * Content scan, in Node, without shelling out.
 *
 * These scans used to run `grep -rl "pat" <flags> . --include="*.js" …`, which
 * was broken twice over on this host:
 *   1. `grep` here is **ugrep**, not GNU grep, and its --include/--exclude
 *      semantics differ — the flags were silently ignored.
 *   2. Every --include sat AFTER the `.` path operand, so even GNU grep would
 *      have stopped treating them as options.
 * Net effect: the "filtered" whole-tree scans searched every file of every
 * type, matched "pino" inside a sympy test and "sentry" inside a pygments
 * lexer under .venv/, and awarded Observability a fake 5.0/5 for a logging
 * library and an error tracker this repo does not contain. They were also slow
 * enough to blow runCmd's 10s timeout under parallel load, which — since a
 * timeout is indistinguishable from no-match — made the score vary with
 * machine load.
 *
 * A framework meant to grade arbitrary projects on arbitrary hosts cannot
 * depend on which grep is installed, so this does the walk itself.
 *
 * @param {RegExp} pattern
 * @param {{exts?: string[], roots?: string[], skipSelf?: boolean}} opts
 * @returns {string|null} first matching repo-relative path, or null
 */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__',
  'dist', 'build', '.next', 'coverage', 'vendor',
  // Generated output, not source: pm/ holds ledgers, reports and a multi-MB
  // RAG index whose indexed prose matched 'pino'.
  'pm',
  // A test that merely mentions a tool is not evidence that tool is wired up.
  '__tests__', 'tests',
]);

export function scanForPattern(pattern, { exts = [], roots = ['.'], skipSelf = true } = {}) {
  const matchesExt = (name) => exts.length === 0 || exts.some(e => name.endsWith(e));
  let found = null;

  function walk(abs, rel) {
    if (found) return;
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(abs, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
      } else if (entry.isFile() && matchesExt(entry.name)) {
        // The scanner must not measure itself: every search term appears
        // verbatim in this file's own source.
        if (skipSelf && entry.name === 'maturity-assess.mjs') continue;
        try {
          if (pattern.test(readFileSync(join(abs, entry.name), 'utf8'))) {
            found = rel ? `${rel}/${entry.name}` : entry.name;
            return;
          }
        } catch { /* unreadable/binary — skip */ }
      }
    }
  }

  for (const root of roots) {
    if (found) break;
    const abs = join(PROJECT_DIR, root === '.' ? '' : root);
    if (!existsSync(abs)) continue;
    walk(abs, root === '.' ? '' : root);
  }
  return found;
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
  if (hasClaudeMd || hasCursorRules) { score += 1; evidence.push(pass(`Rules file: ${hasClaudeMd ? 'CLAUDE.md' : '.cursorrules'}`)); }
  else evidence.push(fail('No rules file (CLAUDE.md or .cursorrules)'));

  // Level 2: Test command configured
  const pkg = readFile('package.json');
  const hasTestScript = pkg && JSON.parse(pkg).scripts?.test;
  if (hasTestScript) { score += 0.5; evidence.push(pass(`Test script: ${hasTestScript}`)); }

  // Level 3: Task queue + agents
  const hasTaskQueue = fileExists('tasks/queue');
  const hasAgents = fileExists('agents/project.json');
  const hasDomains = fileExists('agents/domains.json');
  if (hasTaskQueue && hasAgents) { score += 1; evidence.push(pass('Task queue + agent config present')); }
  if (hasDomains) { score += 0.5; evidence.push(pass('Domain routing configured')); }

  // Level 4 (Autonomous): quality gates
  const hasDefeatTests = fileExists('agents/four-layer-validate.mjs') || runCmd('grep -rl "defeat" agents/ 2>/dev/null')?.length > 0;
  if (hasDefeatTests) { score += 0.5; evidence.push(pass('Defeat tests / validation pipeline present')); }

  // Level 5: Memory system
  // Guarded: this used to readdirSync unconditionally and crash the whole
  // assessment with ENOENT on any project that has no agents/ directory —
  // i.e. exactly the greenfield projects the assessor is meant to grade.
  const agentsDir = join(PROJECT_DIR, 'agents');
  const hasMemory = existsSync(agentsDir) && readdirSync(agentsDir).some(d => {
    try { return existsSync(join(agentsDir, d, 'memory', 'core.json')); } catch { return false; }
  });
  if (hasMemory) { score += 0.5; evidence.push(pass('Agent memory system present')); }

  // Level 6: Behavior tests + pattern hunt
  const hasBehaviorTests = fileExists('agents/test-behavior.mjs');
  const hasPatternHunt = fileExists('agents/pattern-hunt.mjs');
  if (hasBehaviorTests && hasPatternHunt) { score += 0.5; evidence.push(pass('Behavior tests + pattern hunt present')); }

  // OpenSpec governance
  const hasOpenspec = fileExists('openspec/changes') || fileExists('openspec/specs');
  if (hasOpenspec) { score += 0.5; evidence.push(pass('OpenSpec governance in use')); }

  return { dimension: 'SDLC Process', score: Math.min(score, 5), evidence };
}

function assessTesting() {
  const evidence = [];
  let score = 0;

  // Test files exist
  const testCount = countFiles('.', f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'));
  const srcCount = countFiles('.', f => (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.py')) && !f.includes('.test.') && !f.includes('.spec.'));
  const ratio = srcCount > 0 ? testCount / srcCount : 0;

  if (testCount > 0) { score += 1; evidence.push(pass(`${testCount} test files found (ratio: ${ratio.toFixed(2)} test/src)`)); }
  else evidence.push(fail('No test files found'));

  if (ratio >= 0.5) { score += 1; evidence.push(pass('Good test-to-source ratio (≥0.5)')); }
  else if (ratio >= 0.2) { score += 0.5; evidence.push(pass('Moderate test-to-source ratio')); }

  // CI runs tests
  const ciConfig = readFile('.github/workflows/test.yml') || readFile('.github/workflows/ci.yml');
  if (ciConfig && ciConfig.includes('test')) { score += 1; evidence.push(pass('CI runs tests on push/PR')); }
  else evidence.push(fail('No CI test pipeline detected'));

  // Defeat tests / static analysis
  const hasFourLayer = fileExists('agents/four-layer-validate.mjs');
  const hasLint = readFile('package.json')?.includes('"lint"');
  if (hasFourLayer) { score += 1; evidence.push(pass('Four-layer validation pipeline present')); }
  else evidence.push(fail('No four-layer validation pipeline'));
  if (hasLint) { score += 0.5; evidence.push(pass('Linting configured')); }
  else evidence.push(fail('No linter configured'));

  // E2E tests
  // Matched on filenames only, which missed a browser-test runner that happens
  // not to have "e2e"/"playwright" in its name — so also look for a driver
  // reference inside agents/ (e.g. agents/browser-user-test.mjs).
  const hasE2E = fileExists('e2e') || fileExists('tests/e2e')
    || countFiles('.', f => f.includes('e2e') || f.includes('playwright') || f.includes('cypress')) > 0
    || !!runCmd('grep -rlie "playwright\\|cypress\\|puppeteer" agents/ 2>/dev/null');
  if (hasE2E) { score += 0.5; evidence.push(pass('E2E test infrastructure detected')); }
  else evidence.push(fail('No E2E test infrastructure (e2e/, playwright, or cypress)'));

  return { dimension: 'Testing & Quality', score: Math.min(score, 5), evidence };
}

export function assessDeployment() {
  const evidence = [];
  let score = 0;

  // CI/CD exists
  const hasGHA = fileExists('.github/workflows');
  const hasGitlabCI = fileExists('.gitlab-ci.yml');
  const hasJenkinsfile = fileExists('Jenkinsfile');
  if (hasGHA || hasGitlabCI || hasJenkinsfile) { score += 1; evidence.push(pass(`CI/CD: ${hasGHA ? 'GitHub Actions' : hasGitlabCI ? 'GitLab CI' : 'Jenkins'}`)); }
  else evidence.push(fail('No CI/CD pipeline detected'));

  // Deploy pipeline. The original probe encoded one idiom — a shell script or
  // an npm script — as though it were the only one, and so reported "No deploy
  // script found" for a repo whose approval-gated deploy runner and
  // deploy-reconcile timer demonstrably run every hour.
  const hasDeployScript = fileExists('scripts/deploy.sh') || fileExists('deploy.sh')
    || (readFile('package.json')?.includes('"deploy"'))
    || fileExists('agents/deploy-runner.mjs')                 // framework-owned runner
    || (readFile('agents/project.json')?.includes('"deploy"')); // project deploy block
  if (hasDeployScript) { score += 1; evidence.push(pass('Deploy script/command exists')); }
  else evidence.push(fail('No deploy script found'));

  // Containerization
  const hasDocker = fileExists('Dockerfile') || fileExists('docker-compose.yml');
  if (hasDocker) { score += 1; evidence.push(pass('Containerization (Dockerfile/docker-compose)')); }
  else evidence.push(fail('No containerized release artifact (Dockerfile/docker-compose)'));

  // DORA: Deployment frequency from git log
  const recentDeploys = runCmd('git log --oneline --since="30 days ago" --grep="deploy\\|release\\|ship" 2>/dev/null');
  const deployCount = recentDeploys ? recentDeploys.split('\n').filter(l => l.trim()).length : 0;
  if (deployCount >= 20) { score += 1; evidence.push(pass(`DORA Deploy Frequency: ${deployCount}/month (elite)`)); }
  else if (deployCount >= 4) { score += 0.5; evidence.push(pass(`DORA Deploy Frequency: ${deployCount}/month (high)`)); }
  else evidence.push(fail(`DORA Deploy Frequency: ${deployCount}/month`));

  // Rollback docs
  const hasRollback = runCmd('grep -rl "rollback" docs/ 2>/dev/null || grep -rl "rollback" CLAUDE.md 2>/dev/null');
  if (hasRollback) { score += 0.5; evidence.push(pass('Rollback procedures documented')); }
  else evidence.push(fail('No rollback procedures documented'));

  return { dimension: 'Deployment & Release', score: Math.min(score, 5), evidence };
}

function assessObservability() {
  const evidence = [];
  let score = 0;

  // Logging
  const hasStructuredLogs = scanForPattern(/\b(winston|pino|bunyan|structlog|logrus)\b/, { exts: ['.json', '.ts', '.js', '.mjs'] });
  if (hasStructuredLogs) { score += 1; evidence.push(pass('Structured logging library detected')); }
  else evidence.push(fail('No structured logging library (winston/pino/bunyan/structlog/logrus)'));

  // Error tracking
  const hasSentry = scanForPattern(/\b(sentry|bugsnag|rollbar|datadog)\b/i, { exts: ['.json', '.ts', '.js', '.mjs', '.env'] });
  if (hasSentry) { score += 1; evidence.push(pass('Error tracking service configured')); }
  else evidence.push(fail('No error-tracking service (sentry/bugsnag/rollbar/datadog)'));

  // Health endpoints
  const hasHealthCheck = scanForPattern(/\b(health|healthz|readyz|livez)\b/, { exts: ['.ts', '.js', '.mjs', '.py'] });
  if (hasHealthCheck) { score += 1; evidence.push(pass('Health check endpoints detected')); }
  else evidence.push(fail('No health-check endpoint detected'));

  // Performance ledger (SDLC-specific)
  const hasLedger = fileExists('pm/model-performance.jsonl');
  const hasCostLog = fileExists('agents/cost-log.json');
  if (hasLedger || hasCostLog) { score += 1; evidence.push(pass('Performance/cost tracking present')); }
  else evidence.push(fail('No performance/cost ledger (pm/model-performance.jsonl or agents/cost-log.json)'));

  // Alerting
  const hasAlerting = scanForPattern(/\b(alert|pagerduty|opsgenie|notification)\b/i, { exts: ['.md', '.mjs', '.json'], roots: ['agents', 'docs'] });
  if (hasAlerting) { score += 1; evidence.push(pass('Alerting/notification system configured')); }
  else evidence.push(fail('No alerting/notification system configured'));

  if (score === 0) evidence.push(fail('No observability infrastructure detected'));

  return { dimension: 'Observability', score: Math.min(score, 5), evidence };
}

function assessSecurity() {
  const evidence = [];
  let score = 0;

  // No hardcoded secrets
  const hasEnvExample = fileExists('.env.example') || fileExists('.env.template');
  if (hasEnvExample) { score += 1; evidence.push(pass('.env.example exists (secrets documented)')); }

  // .gitignore covers sensitive files
  const gitignore = readFile('.gitignore') || '';
  const ignoresEnv = gitignore.includes('.env');
  if (ignoresEnv) { score += 0.5; evidence.push(pass('.gitignore excludes .env files')); }

  // Dependency audit — check if zero-dep first
  const pkg = readFile('package.json');
  let isZeroDep = false;
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      isZeroDep = Object.keys(parsed.dependencies || {}).length === 0 && Object.keys(parsed.devDependencies || {}).length === 0;
    } catch {}
  }

  if (isZeroDep) {
    score += 1.5;
    evidence.push(pass('Zero dependencies — no supply chain attack surface'));
  } else {
    const auditResult = runCmd('npm audit --json 2>/dev/null');
    if (auditResult) {
      try {
        const audit = JSON.parse(auditResult);
        const vulns = audit.metadata?.vulnerabilities || {};
        const critical = vulns.critical || 0;
        const high = vulns.high || 0;
        if (critical === 0 && high === 0) { score += 1.5; evidence.push(pass('No critical/high vulnerabilities in dependencies')); }
        else evidence.push(fail(`Vulnerabilities: ${critical} critical, ${high} high`));
      } catch { evidence.push(fail('npm audit ran but output unparseable')); }
    } else {
      const hasLockfile = fileExists('package-lock.json') || fileExists('yarn.lock') || fileExists('pnpm-lock.yaml');
      if (hasLockfile) { score += 0.5; evidence.push(pass('Lock file present (dependency pinning)')); }
      else evidence.push(fail('No lock file found'));
    }
  }

  // Auth patterns
  const hasAuth = scanForPattern(/\bauth\b|jwt|oauth|session|cookie/i, { exts: ['.ts', '.js', '.mjs', '.py'] });
  if (hasAuth) { score += 0.5; evidence.push(pass('Authentication patterns detected')); }
  else evidence.push(info('No authentication surface in this repo (nothing to authenticate)'));

  // OWASP awareness in review
  const hasSecurityReview = scanForPattern(/\b(OWASP|XSS|injection|CSRF)\b/, { exts: ['.md', '.mjs'], roots: ['agents', 'docs'] }) || scanForPattern(/\b(OWASP|XSS|injection|CSRF)\b/, { exts: ['CLAUDE.md'] });
  if (hasSecurityReview) { score += 1; evidence.push(pass('Security review patterns in agent/doc config')); }
  else evidence.push(fail('No security review patterns in agent/doc config'));

  // Same rubric inversion as Dependency Health: the zero-dependency branch
  // awards 1.5 where the has-dependencies branch can award 2.0 (npm audit +
  // lock file), so a repo with no supply chain at all tops out at 4.5 while
  // one with 50 audited deps can reach 5.0. Stated rather than silently
  // corrected — changing it moves the headline number on a judgement call.
  if (isZeroDep) {
    evidence.push(info('Dimension caps at 4.5/5 for zero-dependency repos — the remaining 0.5 requires an auditable dependency set'));
  }

  if (score === 0) evidence.push(fail('No security practices detected'));

  return { dimension: 'Security Posture', score: Math.min(score, 5), evidence };
}

function assessDependencyHealth() {
  const evidence = [];
  let score = 0;

  const pkg = readFile('package.json');
  if (!pkg) {
    // Check for other package managers
    if (fileExists('requirements.txt') || fileExists('Cargo.toml') || fileExists('go.mod')) {
      evidence.push(info('Non-Node project — dependency check limited'));
      score = 2; // Assume baseline
    } else {
      evidence.push(fail('No package manifest found'));
      return { dimension: 'Dependency Health', score: 0, evidence };
    }
  }

  // Check for intentional zero-dependency design
  let parsedPkg;
  try { parsedPkg = JSON.parse(pkg); } catch { parsedPkg = {}; }
  const depCount = Object.keys(parsedPkg.dependencies || {}).length;
  const devDepCount = Object.keys(parsedPkg.devDependencies || {}).length;
  const isZeroDep = depCount === 0 && devDepCount === 0;

  if (isZeroDep) {
    // Zero-dependency is a deliberate architectural choice for portability
    score = 3;
    evidence.push(pass('Zero-dependency by design — maximum portability (git clone + node)'));
    evidence.push(pass('No dependency vulnerabilities possible (zero attack surface)'));
    evidence.push(pass('No lock file needed (nothing to lock)'));

    // Bonus: check if engines are specified (good practice even for zero-dep)
    if (parsedPkg.engines?.node) {
      score += 0.5;
      evidence.push(pass(`Node engine requirement specified: ${parsedPkg.engines.node}`));
    }

    // Bonus: package.json is well-formed
    if (parsedPkg.name && parsedPkg.version && parsedPkg.type === 'module') {
      score += 0.5;
      evidence.push(pass('Well-formed manifest (name, version, type:module)'));
    }

    // Be explicit that this branch tops out at 4.0/5 rather than leaving the
    // missing point unexplained. Arguably an inversion in the rubric — a repo
    // with zero dependencies carries strictly less dependency risk than one
    // whose 50 deps merely happen to be current, yet only the latter can score
    // 5.0. Flagged rather than silently "corrected": changing it would move the
    // headline number on a judgement call, which is Bryce's to make.
    evidence.push(info('Dimension caps at 4.0/5 for zero-dependency repos — the remaining point requires dependencies to keep current'));

    return { dimension: 'Dependency Health', score: Math.min(score, 5), evidence };
  }

  // Standard dependency health checks for projects with deps
  const hasLock = fileExists('package-lock.json') || fileExists('yarn.lock') || fileExists('pnpm-lock.yaml');
  if (hasLock) { score += 1; evidence.push(pass('Lock file committed')); }
  else evidence.push(fail('No lock file — builds are non-deterministic'));

  // Last dependency update
  const lastDepCommit = runCmd('git log --oneline -1 --diff-filter=M -- "package.json" 2>/dev/null');
  if (lastDepCommit) {
    const dateStr = runCmd('git log -1 --format=%ci --diff-filter=M -- "package.json" 2>/dev/null');
    const days = daysSince(dateStr);
    if (days < 30) { score += 1.5; evidence.push(pass(`Dependencies updated ${days} days ago (recent)`)); }
    else if (days < 90) { score += 1; evidence.push(pass(`Dependencies updated ${days} days ago`)); }
    else { score += 0.5; evidence.push(info(`Dependencies last updated ${days} days ago (stale)`)); }
  }

  // Outdated packages
  const outdated = runCmd('npm outdated --json 2>/dev/null');
  if (outdated) {
    try {
      const pkgs = JSON.parse(outdated);
      const count = Object.keys(pkgs).length;
      if (count === 0) { score += 1.5; evidence.push(pass('All dependencies up to date')); }
      else if (count < 5) { score += 1; evidence.push(pass(`${count} outdated packages`)); }
      else { score += 0.5; evidence.push(info(`${count} outdated packages (needs attention)`)); }
    } catch { /* empty output = all current */ score += 1; evidence.push(pass('Dependencies appear current')); }
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
    evidence.push(pass(`README.md exists (${readme.split('\n').length} lines)`));
    if (readme.includes('## ') && readme.split('## ').length >= 4) { score += 0.5; evidence.push(pass('README has multiple sections')); }
  } else evidence.push(fail('No README.md'));

  // Onboarding
  const hasOnboarding = fileExists('ONBOARDING.md') || fileExists('docs/getting-started.md') || fileExists('CONTRIBUTING.md');
  if (hasOnboarding) { score += 1; evidence.push(pass('Onboarding/contributing guide exists')); }

  // Architecture docs
  const hasArchDocs = fileExists('docs/') && readdirSync(join(PROJECT_DIR, 'docs')).length >= 3;
  if (hasArchDocs) { score += 1; evidence.push(pass(`docs/ directory with ${readdirSync(join(PROJECT_DIR, 'docs')).length} files`)); }

  // API docs or ADRs
  const hasADRs = fileExists('docs/adr') || fileExists('adr/') || runCmd('grep -rl "ADR\\|Architecture Decision" docs/ 2>/dev/null');
  if (hasADRs) { score += 0.5; evidence.push(pass('Architecture decision records detected')); }

  // Glossary
  const hasGlossary = scanForPattern(/glossary/i, { exts: ['.md'] });
  if (hasGlossary) { score += 0.5; evidence.push(pass('Glossary exists')); }

  // Troubleshooting
  const hasTroubleshooting = fileExists('docs/troubleshooting.md') || scanForPattern(/troubleshooting/i, { exts: ['.md'] });
  if (hasTroubleshooting) { score += 0.5; evidence.push(pass('Troubleshooting guide exists')); }

  return { dimension: 'Documentation', score: Math.min(score, 5), evidence };
}

function assessOperationalReadiness() {
  const evidence = [];
  let score = 0;

  // Budget/cost controls
  const hasBudget = fileExists('agents/budget.json');
  if (hasBudget) { score += 1; evidence.push(pass('Budget controls configured (agents/budget.json)')); }

  // Model manager / cost tracking
  const hasModelManager = fileExists('agents/model-manager.mjs');
  const hasCostTracker = fileExists('agents/cost-tracker.mjs');
  if (hasModelManager) { score += 1; evidence.push(pass('Model manager for token budget monitoring')); }
  if (hasCostTracker) { score += 0.5; evidence.push(pass('Cost tracking enabled')); }

  // Notification/alerting
  const hasNotify = fileExists('agents/notify.mjs');
  if (hasNotify) { score += 0.5; evidence.push(pass('Notification system configured')); }

  // Backup/recovery
  const hasMemoryBackup = fileExists('agents/rem-sleep.mjs');
  if (hasMemoryBackup) { score += 0.5; evidence.push(pass('Memory consolidation (REM sleep) for data preservation')); }

  // Conservation mode / circuit breakers
  const budget = readFile('agents/budget.json');
  if (budget?.includes('conservationMode')) { score += 0.5; evidence.push(pass('Conservation mode available')); }
  if (budget?.includes('fallbackChain')) { score += 0.5; evidence.push(pass('Fallback chains configured for resilience')); }

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
      if (hasCrossProvider) { score += 0.5; evidence.push(pass('Cross-provider fallback chains (3+ models)')); }
    } catch {}
  }

  if (score === 0) evidence.push(fail('No operational readiness infrastructure detected'));

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
    // Only actual gaps can be recommendations. The previous keyword filter let
    // passing lines through, so the top recommendation was sometimes a success.
    const gaps = r.evidence.filter(e => evidenceOk(e) === false).map(evidenceText);
    console.log(`${i + 1}. **${r.dimension}** (${r.score.toFixed(1)}/5): ${gaps[0] || 'Room for improvement'}`);
  }

  // Detailed findings
  console.log(`\n## Detailed Findings\n`);
  for (const r of results) {
    console.log(`### ${r.dimension} — ${r.score.toFixed(1)}/5`);
    for (const e of r.evidence) {
      console.log(`  ${evidenceIcon(e)} ${evidenceText(e)}`);
    }
    console.log('');
  }
}

// This module now exports helpers, so the CLI must not fire on import
// (CLAUDE.md rule 9; enforced by four-layer Layer 5).
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  run();
}
