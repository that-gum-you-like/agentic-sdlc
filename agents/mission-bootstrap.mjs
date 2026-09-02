#!/usr/bin/env node
/**
 * mission-bootstrap.mjs
 * Agentic SDLC Framework — one command from project idea to drain-ready repo
 * (openspec: mission-intake).
 *
 * Everything MECHANICAL about starting a mission, made deterministic so the
 * LLM mission agent never re-derives (and fumbles) the ceremony: repo, clone,
 * scaffold, OpenRouter ladders, notifications + approval-gated deploy config,
 * Vercel link, initial push, scheduled drain/review jobs on collision-free
 * minutes, deploy-reconcile registration, timer install.
 *
 * The two live incidents this encodes permanently:
 *   - setup.mjs defaults budget.json to Claude models → rewritten to the
 *     framework's OpenRouter ladders (hermes-pilot, 2026-07-26)
 *   - jobs on :0/:15/:30/:45 race the framework's own timers for the
 *     host-global mutex → per-name hashed minute offsets (2026-07-26)
 *
 * Usage:
 *   node agents/mission-bootstrap.mjs <kebab-name> [--description "…"]
 *                                     [--no-deploy] [--dry-run]
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { load as loadPortfolio, add as addPortfolioEntry } from './portfolio.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRAMEWORK_REPO = resolve(__dirname, '..');

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

export const GH_OWNER = 'that-gum-you-like';
export const VERCEL_TEAM_SLUG = 'that-gum-you-likes-projects';
// Missions ship on subdomains of Bryce's domain (Cloudflare DNS with a
// wildcard *.brycewadley.com → cname.vercel-dns.com record, DNS-only).
// Override/disable per run with --domain <base> / --no-domain.
export const MISSION_BASE_DOMAIN = 'brycewadley.com';

/** Production home for a mission when the base domain is in play. */
export function missionDomainFor(name, baseDomain = MISSION_BASE_DOMAIN) {
  return `${name}.${baseDomain}`;
}

/**
 * argv for attaching a domain to the project linked in cwd.
 *
 * Exactly ONE argument after `add`. `vercel domains add --help` on CLI 50.23.2
 * documents `domains add domain project`, but passing the project rejects at
 * runtime with "expects one argument" — the project comes from the .vercel
 * link in cwd. Extracted so the arity is testable: the original two-arg form
 * failed on every single run and nobody noticed, because the caller treats a
 * domain attach as best-effort and falls back to the vercel.app URL.
 */
export function vercelDomainAddArgs(sub) {
  return ['domains', 'add', sub];
}

// ---------------------------------------------------------------------------
// Environment pair + portfolio registration (wireframe-gate REQ-003, T-601)
// ---------------------------------------------------------------------------

/**
 * The two environments a bootstrapped mission is born with (REQ-003): staging
 * on the scratch tier, production on internal-production. A mission is NEVER
 * born customer-production — that tier is a hand edit to portfolio.json,
 * reviewed and dated, never a bootstrap output.
 */
export const MISSION_ENVIRONMENTS = Object.freeze([
  { name: 'staging', tier: 'scratch', agentWritable: true },
  { name: 'production', tier: 'internal-production', agentWritable: false, defaultDeploy: true },
]);

/**
 * The portfolio project entry a fresh mission registers as. By default a
 * mission is owned by the framework operator (`owner: self`); with
 * `--client <name>` the entry is marked `owner: client` with the client's name
 * (REQ-004). Client ownership never changes the environment pair — a mission
 * is still born staging (scratch) + production (internal-production), never
 * customer-production.
 */
export function buildPortfolioEntry(name, { description = '', client = '' } = {}) {
  return {
    name,
    description,
    owner: client ? 'client' : 'self',
    ...(client ? { client } : {}),
    stage: 'idea',
    enabled: true,
    environments: MISSION_ENVIRONMENTS.map((e) => ({ ...e })),
  };
}

/**
 * Register (or re-confirm) a mission in the portfolio. Idempotent: a second
 * run finds the name already present and changes nothing — no duplicate entry,
 * no re-provision (REQ-003). The write goes through portfolio.mjs `add`,
 * which rejects the entry if it would fail portfolio schema validation.
 *
 * @returns {{ doc: object, status: 'added' | 'exists' }}
 */
export function registerInPortfolio(doc, name, opts = {}) {
  const entry = buildPortfolioEntry(name, opts);
  if ((doc.projects || []).some((p) => p.name === name)) {
    return { doc, status: 'exists' };
  }
  return { doc: addPortfolioEntry(doc, entry), status: 'added' };
}

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** Mission names become repo, Vercel project, and clone-dir names. */
export function validateName(name) {
  return /^[a-z][a-z0-9-]{1,38}$/.test(name || '') && !name.includes('--') && !name.endsWith('-');
}

/** Vercel's stable team-scoped production alias (bare <name>.vercel.app may be foreign-owned — hermes-pilot was). */
export function smokeUrlFor(name) {
  return `https://${name}-${VERCEL_TEAM_SLUG}.vercel.app`;
}

/**
 * Deterministic per-name minute offsets that NEVER land on :0/:15/:30/:45
 * (the framework's own drain/kanban/model-manager minutes).
 * Returns { drain: "a,b,c,d", review: "e,f,g" } cron minute lists.
 */
export function cronMinutesFor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const drainBase = (h % 13) + 1;            // 1..13 — never 0 or 15
  const reviewBase = ((h >>> 4) % 13) + 1;   // >>> — a signed shift goes negative for hashes ≥ 2^31
  const drain = [0, 15, 30, 45].map(m => m + drainBase);
  const review = [4, 24, 44].map(m => (m + reviewBase) % 60);
  const banned = new Set([0, 15, 30, 45]);
  return {
    drain: drain.filter(m => !banned.has(m % 60)).map(m => m % 60).sort((a, b) => a - b).join(','),
    review: review.filter(m => !banned.has(m)).sort((a, b) => a - b).join(','),
  };
}

/** Patch a setup.mjs-generated project.json for mission operation. */
export function patchProjectJson(project, { name, deploy = true }) {
  const p = { ...project };
  p.notification = {
    ...(p.notification || {}),
    provider: 'telegram',
    desktop: true,
    triggers: {
      ...((p.notification || {}).triggers || {}),
      deployComplete: true,
      deployFailed: true,
      deployRolledBack: true,
      blocker: true,
      highSeverityFailure: true,
    },
  };
  p.llm = { ...(p.llm || {}), defaultProvider: 'openrouter' };
  p.doneChecklist = ['tests', 'commit', 'push', 'deploy', 'verify', 'notify'];
  p.deploy = {
    enabled: deploy,
    deployCmd: 'vercel --prod --yes',
    rollbackCmd: 'vercel rollback --yes',
    baseBranch: 'main',
    approval: 'telegram',
    verifyTests: true,
    cooldownSeconds: 600,
    verify: { smokeUrl: smokeUrlFor(name), expectStatus: 200, timeoutSeconds: 90 },
  };
  return p;
}

/** OpenRouter-only ladders copied from the framework budget (pilot lesson). */
export function rewriteBudgetLadders(budget, frameworkBudget) {
  const dev = frameworkBudget.agents['sdlc-developer'] || {};
  const rev = frameworkBudget.agents['sdlc-reviewer'] || {};
  const out = { ...budget, emergencyFallbackModel: frameworkBudget.emergencyFallbackModel || 'deepseek/deepseek-v4-flash' };
  out.agents = { ...budget.agents };
  for (const [agentName, cfg] of Object.entries(out.agents)) {
    const ref = /review/i.test(agentName) ? rev : dev;
    out.agents[agentName] = {
      ...cfg,
      model: ref.model,
      provider: 'openrouter',
      fallbackChain: [...(ref.fallbackChain || [])],
      modelPreferences: { ...(ref.modelPreferences || {}) },
    };
  }
  return out;
}

/** The two per-project schedule entries. */
export function buildCronJobs(name, home = homedir()) {
  const { drain, review } = cronMinutesFor(name);
  return [
    {
      name: `${name}-drain`,
      cron: `${drain} * * * *`,
      script: `/usr/bin/env SDLC_REPO=${home}/${name} ${home}/agentic-sdlc/agents/hermes-drain.sh`,
      description: `Autonomous drain for ${name} (mission-bootstrap)`,
      session: 'isolated',
    },
    {
      name: `${name}-review`,
      cron: `${review} * * * *`,
      script: `/usr/bin/env SDLC_PROJECT_DIR=${home}/${name} node ${home}/agentic-sdlc/agents/pr-auto-review.mjs`,
      description: `PR auto-review for ${name} (mission-bootstrap)`,
      session: 'isolated',
    },
  ];
}

// ---------------------------------------------------------------------------
// Steps (side-effecting; every one idempotent and dry-run aware)
// ---------------------------------------------------------------------------

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

export async function bootstrap({ name, description = '', deploy = true, dryRun = false, domain = MISSION_BASE_DOMAIN, home = homedir(), portfolioPath = join(FRAMEWORK_REPO, 'portfolio.json'), client = '', log = (m) => console.log(`[mission-bootstrap] ${m}`) }) {
  if (!validateName(name)) {
    throw new Error(`invalid mission name "${name}" — kebab-case, 2-39 chars, [a-z0-9-], no leading digit/dash`);
  }
  const projectDir = join(home, name);
  const plan = [];
  const step = (desc, fn) => { plan.push(desc); if (!dryRun) fn(); log(`${dryRun ? 'PLAN' : 'DONE'}: ${desc}`); };

  // 1-2. Repo + clone
  step(`repo: gh repo create ${GH_OWNER}/${name} --private (skip if exists)`, () => {
    try { sh('gh', ['repo', 'view', `${GH_OWNER}/${name}`]); } catch {
      sh('gh', ['repo', 'create', `${GH_OWNER}/${name}`, '--private',
        ...(description ? ['--description', description.slice(0, 200)] : [])]);
    }
  });
  step(`clone: ${projectDir} (skip if present)`, () => {
    if (!existsSync(join(projectDir, '.git'))) {
      sh('git', ['clone', `https://github.com/${GH_OWNER}/${name}`, projectDir]);
    }
  });

  // 3. Framework scaffold
  step('scaffold: setup.mjs --yes (writeIfNotExists — re-run safe)', () => {
    sh('node', [join(FRAMEWORK_REPO, 'setup.mjs'), '--yes'], { cwd: projectDir, timeout: 120_000 });
  });

  // 4. OpenRouter ladders
  step('budget.json: OpenRouter-only ladders (no Claude/Anthropic models)', () => {
    const budgetPath = join(projectDir, 'agents', 'budget.json');
    const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
    const frameworkBudget = JSON.parse(readFileSync(join(FRAMEWORK_REPO, 'agents', 'budget.json'), 'utf8'));
    writeFileSync(budgetPath, JSON.stringify(rewriteBudgetLadders(budget, frameworkBudget), null, 2) + '\n');
  });

  // 5. project.json
  step(`project.json: telegram+desktop notify, deploy ${deploy ? 'ENABLED (telegram approval)' : 'dark'}, smoke ${smokeUrlFor(name)}`, () => {
    const path = join(projectDir, 'agents', 'project.json');
    const project = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify(patchProjectJson(project, { name, deploy }), null, 2) + '\n');
  });

  // 5.5. Portfolio registration — the mission is born with exactly two tiered
  // environments (wireframe-gate REQ-003). --client marks owner: client + a
  // client name (REQ-004) but never touches the tiers. Idempotent: a re-run
  // finds the name already present and changes nothing.
  step(`portfolio: register ${name}${client ? ` — owner client (${client})` : ''} — ${MISSION_ENVIRONMENTS.map((e) => `${e.name} (${e.tier})`).join(' + ')} in ${portfolioPath}`, () => {
    const { doc, status } = registerInPortfolio(loadPortfolio(portfolioPath), name, { description, client });
    if (status === 'added') {
      writeFileSync(portfolioPath, JSON.stringify(doc, null, 2) + '\n');
      log(`  portfolio: ${name} registered${client ? ` for client ${client}` : ''} — staging (scratch) + production (internal-production)`);
    } else {
      log(`  portfolio: ${name} already registered — no change`);
    }
  });

  // 6. gitignore + initial push
  step('gitignore + initial commit + push -u origin main', () => {
    const gi = join(projectDir, '.gitignore');
    const add = ['agents/cost-log.json', 'agents/*/memory/recent.json', 'agents/*/memory/compost.json',
      'node_modules/', 'pm/drain-logs/', 'pm/.deploy-*', 'pm/.last-deploy*', 'pm/.sdlc-*', '.env.local'];
    const existing = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    const missing = add.filter(l => !existing.includes(l));
    if (missing.length) appendFileSync(gi, missing.join('\n') + '\n');
    sh('git', ['add', '-A'], { cwd: projectDir });
    try { sh('git', ['commit', '-m', `chore: bootstrap agentic-sdlc mission "${name}"\n\n${description}`.trim()], { cwd: projectDir }); } catch { /* nothing to commit */ }
    sh('git', ['branch', '-M', 'main'], { cwd: projectDir });
    sh('git', ['push', '-u', 'origin', 'main'], { cwd: projectDir, timeout: 60_000 });
  });

  // 7. Vercel link
  if (deploy) {
    step(`vercel link --yes (team ${VERCEL_TEAM_SLUG})`, () => {
      try { sh('vercel', ['link', '--yes'], { cwd: projectDir, timeout: 90_000 }); } catch (err) {
        // The github-connect sub-step commonly fails for fresh private repos
        // (Vercel app not installed on the repo) — CLI deploys don't need it.
        if (!existsSync(join(projectDir, '.vercel', 'project.json'))) throw err;
      }
    });
  }

  // 7.5. Custom production domain: <name>.<baseDomain>. Best-effort — when the
  // attach succeeds, the smoke URL is upgraded and the verify timeout widened
  // (first-deploy cert issuance); when it fails, the team vercel.app alias
  // from step 5 stays authoritative and the mission still ships.
  if (deploy && domain) {
    const sub = missionDomainFor(name, domain);
    step(`domain: vercel domains add ${sub} ${name} (best-effort; falls back to vercel.app)`, () => {
      try {
        sh('vercel', vercelDomainAddArgs(sub), { cwd: projectDir, timeout: 60_000 });
        const path = join(projectDir, 'agents', 'project.json');
        const project = JSON.parse(readFileSync(path, 'utf8'));
        project.deploy.verify.smokeUrl = `https://${sub}`;
        project.deploy.verify.timeoutSeconds = Math.max(project.deploy.verify.timeoutSeconds || 0, 180);
        writeFileSync(path, JSON.stringify(project, null, 2) + '\n');
        sh('git', ['add', 'agents/project.json'], { cwd: projectDir });
        try { sh('git', ['commit', '-m', `chore: production domain ${sub}`], { cwd: projectDir }); sh('git', ['push'], { cwd: projectDir, timeout: 60_000 }); } catch { /* nothing to commit */ }
        log(`  production domain: https://${sub}`);
      } catch (err) {
        log(`  domain attach failed (${String(err.message).split('\n')[0]}) — keeping ${smokeUrlFor(name)}`);
      }
    });
  }

  // 8-9. Schedule
  step(`cron-schedule.json: ${name}-drain + ${name}-review (minutes ${JSON.stringify(cronMinutesFor(name))})${deploy ? ' + deploy-reconcile registration' : ''}`, () => {
    const schedPath = join(FRAMEWORK_REPO, 'agents', 'cron-schedule.json');
    const sched = JSON.parse(readFileSync(schedPath, 'utf8'));
    const have = new Set(sched.schedules.map(s => s.name));
    for (const job of buildCronJobs(name, home)) {
      if (!have.has(job.name)) sched.schedules.push(job);
    }
    if (deploy) {
      for (const s of sched.schedules) {
        if (s.name === 'deploy-reconcile' && !s.script.includes(`--project-dir ${projectDir}`)) {
          s.script += ` --project-dir ${projectDir}`;
        }
      }
    }
    writeFileSync(schedPath, JSON.stringify(sched, null, 2) + '\n');
  });
  step('scheduler-install.mjs install (regenerate timers)', () => {
    sh('node', [join(FRAMEWORK_REPO, 'agents', 'scheduler-install.mjs'), 'install'], { timeout: 120_000 });
  });

  log('');
  log(`MISSION READY: ${name}`);
  log(`  project:   ${projectDir}`);
  log(`  repo:      https://github.com/${GH_OWNER}/${name}`);
  log(`  environments: ${MISSION_ENVIRONMENTS.map((e) => `${e.name} (${e.tier})`).join(' + ')}${dryRun ? ' — nothing written (dry-run)' : ' — registered in portfolio.json'}`);
  log(`  owner:       ${client ? `client (${client})` : 'self (operator)'}`);
  log(`  smoke URL: ${deploy ? (domain ? `https://${missionDomainFor(name, domain)} (fallback ${smokeUrlFor(name)})` : smokeUrlFor(name)) : '(deploy dark)'}`);
  log(`  next:      author openspec artifacts + seed tasks/queue/*.json in the project,`);
  log(`             git push, then the ${name}-drain timer takes over.`);
  return { projectDir, plan };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (__isMainModule()) {
  const args = process.argv.slice(2);
  const name = args.find(a => !a.startsWith('--'));
  const dIdx = args.indexOf('--description');
  const domIdx = args.indexOf('--domain');
  const clIdx = args.indexOf('--client');
  const opts = {
    name,
    description: dIdx !== -1 ? args[dIdx + 1] : '',
    deploy: !args.includes('--no-deploy'),
    dryRun: args.includes('--dry-run'),
    domain: args.includes('--no-domain') ? null : (domIdx !== -1 ? args[domIdx + 1] : MISSION_BASE_DOMAIN),
    client: clIdx !== -1 ? (args[clIdx + 1] || '') : '',
  };
  if (!name) {
    console.error('Usage: mission-bootstrap.mjs <kebab-name> [--description "…"] [--client "…"] [--domain <base>|--no-domain] [--no-deploy] [--dry-run]');
    process.exit(1);
  }
  bootstrap(opts).catch((err) => {
    console.error(`[mission-bootstrap] FAILED: ${err.message}`);
    process.exit(1);
  });
}
