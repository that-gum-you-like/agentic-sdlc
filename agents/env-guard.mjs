#!/usr/bin/env node
/**
 * env-guard.mjs — the boundary between an autonomous agent and a real database.
 *
 *   node agents/env-guard.mjs check <project> <environment> <operation> [--approval <sha8>]
 *
 * GOVERNING PRINCIPLE: a guard that can be defeated by an omission is
 * decoration. Every path that cannot POSITIVELY identify the environment as
 * `scratch` or `internal-production` denies. There is no default tier, no
 * case-folding, no prefix matching, and no inference from an environment's
 * name, from `agentWritable`, or from how the project was bootstrapped.
 *
 * checkAccess NEVER THROWS. Every failure — missing file, unparseable JSON,
 * unknown project, unknown environment, absent tier, bad operation — is a
 * returned denial, because a thrown exception in a caller's try/catch is one
 * `catch {}` away from being treated as success.
 *
 * Decision table (spec: specs/environment-tiering.md REQ-003):
 *
 *   tier                  | read           | write / migrate / deploy
 *   ----------------------+----------------+--------------------------------
 *   scratch               | allow          | allow
 *   internal-production   | allow          | allow + notify (recorded)
 *   customer-production   | allow + record | DENY unless a fresh, single-use,
 *                         |                | sha-bound approval is presented
 *   absent/unknown/bad    | DENY           | DENY
 *
 * Spec: openspec/changes/business-os/specs/environment-tiering.md REQ-001..005
 * Zero npm dependencies. CLI guarded per rule #9.
 */

import fs from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as portfolio from './portfolio.mjs';
// REQ-004: reuse the proven parser rather than restating the regex. A second
// copy is a second thing to get wrong, and they drift silently.
import { parseApprovalCommand } from './deploy-runner.mjs';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export { parseApprovalCommand };

export const OPERATIONS = Object.freeze(['read', 'write', 'migrate', 'deploy']);
const MUTATING = Object.freeze(['write', 'migrate', 'deploy']);
const TIER_SCRATCH = 'scratch';
const TIER_INTERNAL = 'internal-production';
const TIER_CUSTOMER = 'customer-production';

/** Shape every return takes. `allowed` is false unless explicitly earned. */
function deny(reason, extra = {}) {
  return { allowed: false, tier: null, reason, requiresApproval: false, notify: null, ...extra };
}
function allow(tier, reason, extra = {}) {
  return { allowed: true, tier, reason, requiresApproval: false, notify: null, ...extra };
}

/**
 * Decide whether an operation against a project environment is permitted.
 *
 * @param {object} args
 * @param {string} args.project      portfolio project name
 * @param {string} args.environment  environment name within that project
 * @param {string} args.operation    read | write | migrate | deploy
 * @param {string} [args.approval]   an 8-char sha the caller claims is approved
 * @param {string} [args.portfolioPath]
 * @returns {{allowed:boolean,tier:string|null,reason:string,requiresApproval:boolean,notify:object|null}}
 */
export function checkAccess(args) {
  try {
    // Destructuring in the signature would throw on an explicit null, because
    // a default parameter only fires for undefined. The never-throws invariant
    // has to hold for the sloppiest caller, so normalize inside the try.
    const { project, environment, operation, approval, portfolioPath } =
      (args && typeof args === 'object') ? args : {};
    // --- operation first: an unrecognized verb denies even on scratch, because
    // we cannot reason about a permission we do not understand.
    if (typeof operation !== 'string' || !OPERATIONS.includes(operation)) {
      return deny(`invalid operation ${JSON.stringify(operation ?? null)} — expected one of ${OPERATIONS.join(', ')}`);
    }
    if (typeof project !== 'string' || !project.trim()) {
      return deny(`invalid project ${JSON.stringify(project ?? null)}`);
    }
    if (typeof environment !== 'string' || !environment.trim()) {
      return deny(`invalid environment ${JSON.stringify(environment ?? null)}`);
    }

    // --- load: distinguish "not found" from "unparseable" so an operator can
    // tell a missing ledger from a corrupted one.
    let doc;
    try {
      doc = portfolio.load(portfolioPath || process.env.PORTFOLIO_PATH || join(__dirname, '..', 'portfolio.json'));
    } catch (err) {
      return deny(`portfolio unavailable — ${err.message}`);
    }

    const proj = (doc.projects || []).find((p) => p && p.name === project);
    if (!proj) {
      return deny(`unknown project "${project}" — a project absent from the portfolio has no known tier`);
    }

    const envs = Array.isArray(proj.environments) ? proj.environments : [];
    const env = envs.find((e) => e && e.name === environment);
    if (!env) {
      return deny(`unknown environment "${environment}" for project "${project}"`);
    }

    // --- tier: the whole point. Exact match only.
    const tier = env.tier;
    if (tier === undefined || tier === null || tier === '') {
      return deny(`environment "${environment}" of "${project}" has no tier — there is no default; access is denied until one is set`);
    }
    if (typeof tier !== 'string' || ![TIER_SCRATCH, TIER_INTERNAL, TIER_CUSTOMER].includes(tier)) {
      return deny(`environment "${environment}" of "${project}" has unrecognized tier ${JSON.stringify(tier)} — matching is exact, so case variants and near-misses are denied`);
    }

    const mutating = MUTATING.includes(operation);

    // --- scratch: free.
    if (tier === TIER_SCRATCH) {
      if (mutating && env.agentWritable === false) {
        return deny(`environment "${environment}" of "${project}" is marked agentWritable:false`, { tier });
      }
      return allow(tier, `${operation} permitted on scratch environment`);
    }

    // --- internal production: writes allowed but recorded.
    if (tier === TIER_INTERNAL) {
      if (!mutating) return allow(tier, 'read permitted on internal-production');
      if (env.agentWritable === false) {
        return deny(`environment "${environment}" of "${project}" is internal-production and marked agentWritable:false`, { tier });
      }
      return allow(tier, `${operation} permitted on internal-production — recorded`, {
        notify: { level: 'record', project, environment, operation, tier },
      });
    }

    // --- customer production: reads are recorded, mutations need approval.
    if (!mutating) {
      return allow(tier, 'read permitted on customer-production — recorded', {
        notify: { level: 'record', project, environment, operation, tier },
      });
    }

    const verdict = verifyApproval({ project: proj, approval });
    if (!verdict.ok) {
      return deny(
        `${operation} on customer-production environment "${environment}" of "${project}" requires approval — ${verdict.reason}`,
        { tier, requiresApproval: true, notify: { level: 'denied', project, environment, operation, tier } },
      );
    }
    return allow(tier, `${operation} on customer-production approved (${verdict.sha8})`, {
      notify: { level: 'approved', project, environment, operation, tier, sha8: verdict.sha8 },
    });
  } catch (err) {
    // Unreachable by design. If it is reached, deny — never let an unexpected
    // error become a permissive result.
    return deny(`guard error — ${err && err.message ? err.message : String(err)}`);
  }
}

/**
 * Verify a sha-bound, single-use approval token for a project.
 * Reuses deploy-runner's on-disk convention: pm/.deploy-approved-<sha8>, with
 * pm/.deploy-consumed-<sha8> marking one that has already been spent.
 */
export function verifyApproval({ project, approval, now = new Date() }) {
  if (!approval) return { ok: false, reason: 'no approval presented' };

  // Accept either a bare sha8 or a full "APPROVE <sha8>" message.
  let sha8 = null;
  if (typeof approval === 'string') {
    const parsed = parseApprovalCommand(approval);
    if (parsed) {
      if (parsed.action !== 'approve') return { ok: false, reason: 'presented token is a rejection' };
      sha8 = parsed.sha8;
    } else if (/^[0-9a-f]{8}$/i.test(approval.trim())) {
      sha8 = approval.trim().toLowerCase();
    }
  } else if (approval && typeof approval === 'object' && typeof approval.sha8 === 'string') {
    sha8 = /^[0-9a-f]{8}$/i.test(approval.sha8) ? approval.sha8.toLowerCase() : null;
  }
  if (!sha8) return { ok: false, reason: 'approval is not a valid 8-character sha' };

  const projectPath = project && project.path;
  if (!projectPath) return { ok: false, reason: 'project has no path, so its approval tokens cannot be located' };

  const pmDir = join(projectPath, 'pm');
  const approved = join(pmDir, `.deploy-approved-${sha8}`);
  const consumed = join(pmDir, `.deploy-consumed-${sha8}`);

  if (!fs.existsSync(approved)) {
    return { ok: false, reason: `no approval token on disk for ${sha8}`, sha8 };
  }
  if (fs.existsSync(consumed)) {
    return { ok: false, reason: `approval ${sha8} was already used — tokens are single-use`, sha8 };
  }
  return { ok: true, sha8, tokenPath: approved, consumedPath: consumed, at: now.toISOString() };
}

/** Spend a verified approval so it cannot be replayed. */
export function consumeApproval(verdict) {
  if (!verdict || !verdict.ok || !verdict.consumedPath) return false;
  try {
    fs.mkdirSync(dirname(verdict.consumedPath), { recursive: true });
    fs.writeFileSync(verdict.consumedPath, `${verdict.at}\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Emit the record for a decision, if it carries one.
 *
 * Deliberately SEPARATE from checkAccess: the decision must be a pure function
 * of the ledger, so that a broken notifier can never influence whether access
 * was granted. Best-effort by contract — a failed send is logged, never thrown,
 * and never upgrades a denial to an allow.
 *
 * @returns {boolean} true if something was delivered.
 */
export function recordAccess(result, { notifyFn } = {}) {
  if (!result || !result.notify) return false;
  const n = result.notify;
  const verdict = result.allowed ? 'ALLOWED' : 'DENIED';
  const headline = n.level === 'denied'
    ? `\u26d4 env-guard DENIED ${n.operation} on ${n.project}/${n.environment}`
    : `\u{1f512} env-guard ${verdict} ${n.operation} on ${n.project}/${n.environment}`;
  const message = [
    headline,
    `tier: ${n.tier}`,
    n.sha8 ? `approval: ${n.sha8}` : null,
    result.reason,
  ].filter(Boolean).join('\n');

  try {
    if (notifyFn) return Boolean(notifyFn(message, n));
    // Lazy import: notify.mjs reads project config at module load, which we do
    // not want to pay for (or fail on) in the common allow-and-move-on path.
    const req = createRequire(import.meta.url);
    const notify = req('./notify.mjs');
    const trigger = n.level === 'denied' ? 'highSeverityFailure' : 'deployComplete';
    return Boolean(notify.triggerNotification(trigger, message));
  } catch (err) {
    console.error(`[env-guard] record failed (non-fatal): ${err && err.message ? err.message : err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function main(argv) {
  const [verb, project, environment, operation] = argv;
  if (verb !== 'check' || !project) {
    console.log('usage: env-guard.mjs check <project> <environment> <operation> [--approval <sha8>]');
    return 2;
  }
  const i = argv.indexOf('--approval');
  const approval = i >= 0 ? argv[i + 1] : undefined;
  const r = checkAccess({ project, environment, operation, approval });
  recordAccess(r);
  console.log(JSON.stringify(r, null, 2));
  return r.allowed ? 0 : 1;
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  process.exit(main(process.argv.slice(2)));
}
