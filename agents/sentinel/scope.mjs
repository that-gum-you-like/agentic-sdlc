/**
 * sentinel/scope — what gets scanned, and how much a finding there matters.
 *
 * openspec: supply-chain-security-program (SCS-REQ-009)
 *
 * Severity is weighted by BLAST RADIUS, not by dependency count. The two
 * disagree sharply here: peach-shaker-5000 carries 857 transitive packages and
 * ships to nobody yet; agentic-sdlc carries none and is executed by agents with
 * shell access. Sorting by count would rank this backwards.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCOPE_PATH = resolve(__dirname, 'scope.json');

export const SEVERITIES = ['low', 'medium', 'high'];

/** Expand a leading `~` against the real home directory. */
export function expandHome(p, home = homedir()) {
  return p.startsWith('~/') ? join(home, p.slice(2)) : p;
}

/** Load scope.json. */
export function loadScope({ readFn } = {}) {
  const read = readFn || ((p) => readFileSync(p, 'utf8'));
  return JSON.parse(read(SCOPE_PATH));
}

/**
 * Resolve the repos that actually exist on this host.
 *
 * A repo declared in scope.json but absent is reported rather than skipped —
 * silently scanning less than you think you are is the whole failure mode this
 * layer exists to prevent.
 *
 * @returns {{ repos: Array, missing: Array, extraManifests: string[] }}
 */
export function resolveRepos({ scope, existsFn, home = homedir() } = {}) {
  const s = scope || loadScope();
  const exists = existsFn || ((p) => existsSync(p));

  const repos = [];
  const missing = [];

  for (const entry of s.repos || []) {
    const path = expandHome(entry.path, home);
    const resolved = {
      name: entry.name,
      path,
      tier: entry.tier,
      why: entry.why,
      readOnly: entry.readOnly === true,
      hasLockfile: exists(join(path, 'package-lock.json')),
    };
    if (exists(path)) repos.push(resolved);
    else missing.push(resolved);
  }

  const extraManifests = (s.extraManifests || [])
    .map(p => expandHome(p, home))
    .filter(p => exists(p));

  return { repos, missing, extraManifests };
}

/**
 * Tier for a repo name. A repo nobody classified is treated as tier 3 and
 * flagged, so new repos surface instead of quietly inheriting a default.
 */
export function tierFor(repoName, scope) {
  const entry = (scope.repos || []).find(r => r.name === repoName);
  return entry ? { tier: entry.tier, classified: true } : { tier: 3, classified: false };
}

/**
 * Adjust a finding's severity for the repo it was found in.
 *
 * Tier 1 escalates medium → high: the same vulnerable package matters more in
 * the repo holding a customer's production data.
 *
 * Tier 3 may de-escalate high → medium, but NEVER for a protected class.
 * A leaked credential or an arbitrary-code-execution path is not less serious
 * because it lives in a personal project — the credential is just as valid and
 * the code runs on the same machine.
 *
 * @param {string} severity  'low' | 'medium' | 'high'
 * @param {number} tier
 * @param {string} scanner   used to check protected classes
 * @returns {string} adjusted severity
 */
export function weighSeverity(severity, tier, scanner, scope) {
  if (!SEVERITIES.includes(severity)) return severity;
  const protectedClasses = (scope && scope.protectedClasses) || [];

  if (protectedClasses.includes(scanner)) return severity;

  if (tier === 1 && severity === 'medium') return 'high';
  if (tier === 3 && severity === 'high') return 'medium';
  return severity;
}

/** Apply weighting across a batch of findings, recording what changed and why. */
export function weighFindings(findings, scope) {
  return findings.map((f) => {
    const { tier, classified } = tierFor(f.repo, scope);
    const weighed = weighSeverity(f.severity, tier, f.scanner, scope);
    if (weighed === f.severity) return { ...f, tier, classified };
    return {
      ...f,
      tier,
      classified,
      severity: weighed,
      originalSeverity: f.severity,
      weightedBecause: tier === 1
        ? `escalated: ${f.repo} is tier 1 (blast radius)`
        : `de-escalated: ${f.repo} is tier 3`,
    };
  });
}
