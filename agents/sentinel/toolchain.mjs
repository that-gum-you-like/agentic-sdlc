/**
 * sentinel/toolchain — resolve the pinned scanner binaries, loudly.
 *
 * openspec: supply-chain-security-program (SCS-REQ-016)
 *
 * Every external scanner is invoked by an ABSOLUTE path recorded at install
 * time by scripts/security-toolchain-install.sh. Never by bare command name:
 * on this host Homebrew shadows several system tools and the failures are
 * SILENT, and a silently-wrong security scanner is worse than an absent one.
 *
 * A missing tool is a HIGH finding, not a warning and not a skip. The whole
 * point of this layer is that gaps are visible.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const MANIFEST_PATH = resolve(__dirname, 'toolchain.json');

/** Tools sentinel shells out to, and what is lost when one is missing. */
export const REQUIRED_TOOLS = {
  'osv-scanner': 'CVE matching against the offline OSV database',
  syft: 'SBOM generation',
  grype: 'vulnerability matching over the SBOM',
  gitleaks: 'secret scanning across working trees and git history',
};

/** How old the OSV database may get before it is itself a finding. */
export const OSV_DB_MAX_AGE_DAYS = 7;

/**
 * Load the toolchain manifest.
 * @returns {{ ok: boolean, manifest: object|null, error: string|null }}
 */
export function loadManifest({ readFn, existsFn } = {}) {
  const read = readFn || ((p) => readFileSync(p, 'utf8'));
  const exists = existsFn || ((p) => existsSync(p));

  if (!exists(MANIFEST_PATH)) {
    return {
      ok: false,
      manifest: null,
      error: 'toolchain manifest missing — run scripts/security-toolchain-install.sh',
    };
  }
  try {
    return { ok: true, manifest: JSON.parse(read(MANIFEST_PATH)), error: null };
  } catch (err) {
    return { ok: false, manifest: null, error: `toolchain manifest unreadable: ${err.message}` };
  }
}

/**
 * Verify every required tool is present and executable, and that the offline
 * OSV database is fresh enough to be trusted.
 *
 * Pure apart from the injected probes, so the whole thing tests hermetically.
 *
 * @returns {{ ok: boolean, tools: Record<string,string>, findings: Array }}
 *   `tools` maps name → absolute path, for the scanners to invoke.
 */
export function preflight({ manifest, existsFn, statFn, now = new Date() } = {}) {
  const findings = [];
  const tools = {};

  const loaded = manifest ? { ok: true, manifest, error: null } : loadManifest();
  if (!loaded.ok) {
    return {
      ok: false,
      tools,
      findings: [{
        scanner: 'toolchain',
        severity: 'high',
        subject: 'toolchain manifest',
        summary: 'sentinel toolchain is not installed',
        detail: loaded.error,
        evidence: [MANIFEST_PATH],
        remedy: 'Run scripts/security-toolchain-install.sh',
        source: 'tool',
      }],
    };
  }

  const exists = existsFn || ((p) => existsSync(p));
  const stat = statFn || ((p) => statSync(p));
  const declared = loaded.manifest.tools || {};

  for (const [name, purpose] of Object.entries(REQUIRED_TOOLS)) {
    const entry = declared[name];
    const path = entry && entry.path;

    if (!path || !exists(path)) {
      findings.push({
        scanner: 'toolchain',
        severity: 'high',
        subject: name,
        summary: `scanner unavailable: ${name}`,
        detail: `${purpose} cannot run. Declared path: ${path || '(none)'}`,
        evidence: [MANIFEST_PATH],
        remedy: 'Run scripts/security-toolchain-install.sh',
        source: 'tool',
      });
      continue;
    }

    // Present but not executable is the same blind spot as absent, and much
    // easier to miss.
    let executable = false;
    try {
      executable = (stat(path).mode & 0o111) !== 0;
    } catch { /* falls through to the finding below */ }

    if (!executable) {
      findings.push({
        scanner: 'toolchain',
        severity: 'high',
        subject: name,
        summary: `scanner not executable: ${name}`,
        detail: `${path} exists but is not executable, so ${purpose} would silently not run.`,
        evidence: [path],
        remedy: `chmod +x ${path}`,
        source: 'tool',
      });
      continue;
    }

    tools[name] = path;
  }

  // A stale vulnerability database reports "no known CVEs" with total
  // confidence and no basis. Treat age as a first-class finding.
  const fetchedAt = loaded.manifest.osvDbFetchedAt;
  if (!fetchedAt) {
    findings.push({
      scanner: 'toolchain',
      severity: 'medium',
      subject: 'osv-database',
      summary: 'offline OSV database was never seeded',
      detail: 'CVE results cannot be trusted until the database is downloaded.',
      evidence: [MANIFEST_PATH],
      remedy: 'Run scripts/security-toolchain-install.sh',
      source: 'tool',
    });
  } else {
    const ageDays = (now.getTime() - new Date(fetchedAt).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays)) {
      findings.push({
        scanner: 'toolchain',
        severity: 'medium',
        subject: 'osv-database',
        summary: 'offline OSV database timestamp is unreadable',
        detail: `osvDbFetchedAt = ${JSON.stringify(fetchedAt)}`,
        evidence: [MANIFEST_PATH],
        remedy: 'Re-run scripts/security-toolchain-install.sh',
        source: 'tool',
      });
    } else if (ageDays > OSV_DB_MAX_AGE_DAYS) {
      findings.push({
        scanner: 'toolchain',
        severity: 'medium',
        subject: 'osv-database',
        summary: `offline OSV database is ${Math.floor(ageDays)} days old`,
        detail: `Older than the ${OSV_DB_MAX_AGE_DAYS}-day threshold, so recent CVEs will not be matched.`,
        evidence: [MANIFEST_PATH],
        remedy: 'Re-run scripts/security-toolchain-install.sh to refresh the database',
        source: 'tool',
      });
    }
  }

  const missingRequired = findings.some(f => f.severity === 'high');
  return { ok: !missingRequired, tools, findings, osvDbPath: loaded.manifest.osvDbPath || null };
}
