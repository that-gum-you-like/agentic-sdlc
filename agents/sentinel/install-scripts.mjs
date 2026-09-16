/**
 * sentinel/install-scripts — inventory npm's most reliable RCE path.
 *
 * openspec: supply-chain-security-program (SCS-REQ-003)
 *
 * preinstall/install/postinstall/prepare run arbitrary code on `npm install`,
 * with the developer's privileges, before anyone has read a line of the
 * package. This scanner keeps a reviewed allowlist and reports anything off it.
 *
 * Two properties matter more than the detection itself:
 *
 *  1. The first run produces an INVENTORY, not findings. A tool that opens with
 *     800 HIGHs on pre-existing state teaches the reader to ignore it, and then
 *     it protects nothing.
 *  2. The allowlist stores a hash of the script BODY, not just the package
 *     name. An allowlisted package that changes what its install script does is
 *     exactly the account-takeover case, and a name-only allowlist would wave
 *     it straight through.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];

/** Stable short hash of a script body. */
export function hashScript(body) {
  return createHash('sha256').update(String(body)).digest('hex').slice(0, 16);
}

/**
 * Collect install scripts for the packages a lockfile says have them.
 *
 * The lockfile flags WHICH packages run scripts; the on-disk package.json
 * carries WHAT they run. When node_modules is absent we still report the
 * package, marked `bodyKnown: false` — a missing body is a gap to disclose,
 * not a reason to call the package clean.
 *
 * @param {Map} lockEntries  from lockfile-diff.parseLockfile()
 * @returns {Array<{key,name,version,hooks,bodyKnown}>}
 */
export function collectInstallScripts(lockEntries, { repoPath, existsFn, readFn } = {}) {
  const exists = existsFn || ((p) => existsSync(p));
  const read = readFn || ((p) => readFileSync(p, 'utf8'));
  const out = [];

  for (const [key, entry] of lockEntries || []) {
    if (!entry.hasInstallScript) continue;

    const record = { key, name: entry.name, version: entry.version, hooks: {}, bodyKnown: false };
    const pkgJson = join(repoPath || '', key, 'package.json');

    if (exists(pkgJson)) {
      try {
        const scripts = (JSON.parse(read(pkgJson)).scripts) || {};
        for (const hook of INSTALL_HOOKS) {
          if (scripts[hook]) record.hooks[hook] = scripts[hook];
        }
        record.bodyKnown = true;
      } catch { /* unreadable manifest — stays bodyKnown:false and is reported */ }
    }
    out.push(record);
  }
  return out;
}

/** Allowlist key: a package identity independent of where it sits in the tree. */
export function allowKey(name, version) {
  return `${name}@${version}`;
}

/**
 * Compare the collected scripts against the allowlist.
 *
 * @param {Array} collected
 * @param {object} allowlist  { entries: { "name@version": { hooks: {hook: hash} } } }
 * @param {object} [opts]
 * @param {boolean} [opts.baseline] first run — inventory only, no findings
 */
export function auditInstallScripts(collected, allowlist, { repo = 'unknown', baseline = false } = {}) {
  const findings = [];
  const inventory = [];
  const entries = (allowlist && allowlist.entries) || {};

  for (const rec of collected) {
    const key = allowKey(rec.name, rec.version);
    const hooks = Object.fromEntries(
      Object.entries(rec.hooks).map(([hook, body]) => [hook, hashScript(body)]),
    );
    inventory.push({ key, hooks, bodyKnown: rec.bodyKnown, path: rec.key });

    if (baseline) continue;

    const allowed = entries[key];

    if (!allowed) {
      findings.push({
        scanner: 'install-scripts', severity: 'high', repo, subject: rec.name,
        summary: `unreviewed install script: ${key}`,
        detail: rec.bodyKnown
          ? `Runs on npm install: ${Object.entries(rec.hooks).map(([h, b]) => `${h}: ${b}`).join(' | ')}`
          : `${key} declares an install script, but node_modules is not present so its body could not be read.`,
        evidence: [rec.key, ...Object.keys(rec.hooks).map(h => `${h} hook`)],
        remedy: `Read the script, then add ${key} to agents/sentinel/install-script-allowlist.json with its hook hashes.`,
        source: 'tool',
      });
      continue;
    }

    // Allowlisted, but did it change what it does?
    for (const [hook, hash] of Object.entries(hooks)) {
      const known = (allowed.hooks || {})[hook];
      if (known && known !== hash) {
        findings.push({
          scanner: 'install-scripts', severity: 'high', repo, subject: rec.name,
          summary: `allowlisted install script changed: ${key} (${hook})`,
          detail: `The ${hook} hook body changed under an allowlisted version.\n  reviewed: ${known}\n  now:      ${hash}\n  script:   ${rec.hooks[hook]}`,
          evidence: [rec.key, `${hook}: ${known} → ${hash}`],
          remedy: 'Re-read the script. A change here under a fixed version is the account-takeover pattern.',
          source: 'tool',
        });
      } else if (!known) {
        findings.push({
          scanner: 'install-scripts', severity: 'high', repo, subject: rec.name,
          summary: `${key} added a new ${hook} hook`,
          detail: `${hook} was not present when this package was reviewed.`,
          evidence: [rec.key, `new hook: ${hook}`],
          remedy: `Review the new hook and update the allowlist entry for ${key}.`,
          source: 'tool',
        });
      }
    }
  }

  return { findings, inventory, baseline };
}
