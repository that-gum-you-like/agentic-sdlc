/**
 * sentinel/lockfile-diff — read a package-lock.json change as a security diff.
 *
 * openspec: supply-chain-security-program (SCS-REQ-001)
 *
 * A lockfile diff normally reads as noise, which is exactly what makes it a
 * good hiding place. The signals this looks for are the ones that cannot have
 * an innocent explanation:
 *
 *   * an integrity hash that changed while the version did NOT — the tarball
 *     behind a fixed version was replaced
 *   * a `resolved` URL pointing somewhere other than the official registry
 *   * a package that newly gained an install script (npm's most reliable RCE)
 *
 * The comparison core is pure: hand it two parsed lockfiles and it works, with
 * no git, no filesystem, and no network.
 */

import { execFileSync } from 'child_process';

const OFFICIAL_REGISTRY = /^https:\/\/registry\.npmjs\.org\//;

/** Parse a lockfile's `packages` map into name → entry. Tolerates v1 and v3. */
export function parseLockfile(text) {
  if (!text) return null;
  let json;
  try { json = JSON.parse(text); } catch { return null; }

  // Lockfile v2/v3: `packages` keyed by path ("node_modules/foo").
  if (json.packages && typeof json.packages === 'object') {
    const out = new Map();
    for (const [key, entry] of Object.entries(json.packages)) {
      if (!key) continue; // "" is the root project, not a dependency
      const name = key.replace(/^(.*\/)?node_modules\//, '');
      out.set(key, { name, ...entry });
    }
    return out;
  }

  // Lockfile v1: nested `dependencies`.
  if (json.dependencies && typeof json.dependencies === 'object') {
    const out = new Map();
    const walk = (deps, prefix) => {
      for (const [name, entry] of Object.entries(deps)) {
        const key = `${prefix}node_modules/${name}`;
        out.set(key, { name, ...entry });
        if (entry.dependencies) walk(entry.dependencies, `${key}/`);
      }
    };
    walk(json.dependencies, '');
    return out;
  }

  return new Map();
}

/** Leading integer of a semver string, or null when it isn't parseable. */
function majorOf(version) {
  const m = /^\D*(\d+)\./.exec(String(version || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Compare two parsed lockfiles.
 *
 * @param {Map|null} prev  previous lockfile (null = no baseline yet)
 * @param {Map|null} next  current lockfile
 * @param {object} [opts]
 * @param {boolean} [opts.packageJsonChanged] did package.json change in the same range?
 * @returns {{ findings: Array, added: string[], baseline: boolean }}
 */
export function diffLockfiles(prev, next, { repo = 'unknown', packageJsonChanged = false } = {}) {
  const findings = [];
  const added = [];

  if (!next) return { findings, added, baseline: true };

  // No previous lockfile: record a baseline instead of reporting every existing
  // package as new. A first run that emits 800 findings teaches the reader to
  // ignore the tool.
  if (!prev) {
    return { findings, added: [...next.keys()], baseline: true };
  }

  for (const [key, entry] of next) {
    const before = prev.get(key);

    if (!before) {
      added.push(key);
      if (entry.hasInstallScript) {
        findings.push({
          scanner: 'lockfile-diff', severity: 'high', repo, subject: entry.name,
          summary: `new dependency ${entry.name} runs an install script`,
          detail: `${key} was added and declares hasInstallScript. Install scripts are npm's most reliable remote-code-execution path.`,
          evidence: [`${key}@${entry.version}`],
          remedy: `Review the install script before the next npm install, or set ignore-scripts and allowlist it.`,
          source: 'tool',
        });
      }
      if (entry.resolved && !OFFICIAL_REGISTRY.test(entry.resolved)) {
        findings.push({
          scanner: 'lockfile-diff', severity: 'high', repo, subject: entry.name,
          summary: `new dependency ${entry.name} resolves off the official registry`,
          detail: `resolved = ${entry.resolved}`,
          evidence: [`${key}@${entry.version}`, entry.resolved],
          remedy: 'Confirm this source is intended; an unofficial resolved URL can serve a different tarball.',
          source: 'tool',
        });
      }
      continue;
    }

    // The signal that has no innocent explanation: same version, different
    // tarball. A published version is immutable by contract.
    if (before.version === entry.version
        && before.integrity && entry.integrity
        && before.integrity !== entry.integrity) {
      findings.push({
        scanner: 'lockfile-diff', severity: 'high', repo, subject: entry.name,
        summary: `integrity hash changed for ${entry.name}@${entry.version} without a version change`,
        detail: `A published version is immutable, so the tarball behind this fixed version was replaced.\n  was: ${before.integrity}\n  now: ${entry.integrity}`,
        evidence: [`${key}@${entry.version}`, `was ${before.integrity}`, `now ${entry.integrity}`],
        remedy: 'Do not install. Verify against the registry and treat as compromise until explained.',
        source: 'tool',
      });
    }

    if (before.resolved !== entry.resolved && entry.resolved && !OFFICIAL_REGISTRY.test(entry.resolved)) {
      findings.push({
        scanner: 'lockfile-diff', severity: 'high', repo, subject: entry.name,
        summary: `${entry.name} now resolves off the official registry`,
        detail: `was: ${before.resolved || '(none)'}\nnow: ${entry.resolved}`,
        evidence: [key, `now ${entry.resolved}`],
        remedy: 'Confirm the source change was intended.',
        source: 'tool',
      });
    }

    if (!before.hasInstallScript && entry.hasInstallScript) {
      findings.push({
        scanner: 'lockfile-diff', severity: 'high', repo, subject: entry.name,
        summary: `${entry.name} gained an install script`,
        detail: `${key} did not run an install script before and now does.`,
        evidence: [`${key}@${entry.version}`],
        remedy: 'Read the added script before the next install.',
        source: 'tool',
      });
    }

    const beforeMajor = majorOf(before.version);
    const nextMajor = majorOf(entry.version);
    if (beforeMajor !== null && nextMajor !== null && nextMajor > beforeMajor && !packageJsonChanged) {
      findings.push({
        scanner: 'lockfile-diff', severity: 'medium', repo, subject: entry.name,
        summary: `${entry.name} jumped a major version with no package.json change`,
        detail: `${before.version} → ${entry.version}, but package.json was not touched in this range.`,
        evidence: [`${key}: ${before.version} → ${entry.version}`],
        remedy: 'Confirm the upgrade was intentional rather than a resolution shift.',
        source: 'tool',
      });
    }
  }

  return { findings, added, baseline: false };
}

/** Read a file at a git revision; null when it does not exist there. */
function gitShow(repoPath, ref, filePath, execFn) {
  const exec = execFn || ((args) => execFileSync('git', args, {
    cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  }));
  try { return exec(['show', `${ref}:${filePath}`]); } catch { return null; }
}

/**
 * Scan one repo's lockfile change since a commit.
 *
 * @returns {{ findings: Array, added: string[], baseline: boolean, head: string|null }}
 */
export function scanRepo({ repo, path, sinceCommit, execFn, readFn }) {
  const exec = execFn || ((args) => execFileSync('git', args, {
    cwd: path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  }));

  let head = null;
  try { head = exec(['rev-parse', 'HEAD']).trim(); } catch { /* not a git repo */ }

  const nextText = readFn ? readFn() : gitShow(path, 'HEAD', 'package-lock.json', exec);
  const next = parseLockfile(nextText);
  if (!next) return { findings: [], added: [], baseline: true, head };

  if (!sinceCommit) return { findings: [], added: [...next.keys()], baseline: true, head };

  const prev = parseLockfile(gitShow(path, sinceCommit, 'package-lock.json', exec));

  let packageJsonChanged = false;
  try {
    packageJsonChanged = exec(['diff', '--name-only', `${sinceCommit}..HEAD`, '--', 'package.json'])
      .trim().length > 0;
  } catch { /* leave false — a missing range should not suppress findings */ }

  const result = diffLockfiles(prev, next, { repo, packageJsonChanged });
  return { ...result, head };
}
