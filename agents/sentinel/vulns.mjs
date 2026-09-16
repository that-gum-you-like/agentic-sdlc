/**
 * sentinel/vulns — SBOM generation and offline CVE matching.
 *
 * openspec: supply-chain-security-program (SCS-REQ-005)
 *
 * The offline half of vulnerability detection. `advisory-feed.mjs` covers
 * what is fresh; this covers what is known, exhaustively, with no network at
 * all — so a broken egress path degrades coverage instead of removing it.
 *
 * SBOMs are written to disk and NEVER uploaded. An SBOM is a complete map of
 * what we run and what version of it; handing that to a third party is the
 * thing the whole privacy stance exists to refuse, and it is also precisely
 * what a commercial SCA service requires.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/** CVSS base score → our severity vocabulary. */
export function severityFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'medium';   // unknown is not "low"
  if (n >= 7.0) return 'high';
  if (n >= 4.0) return 'medium';
  return 'low';
}

/**
 * Generate a CycloneDX SBOM for a repo.
 * The SBOM is evidence, written locally, and is never transmitted.
 */
export function generateSbom({ repo, path, syftPath, outDir, execFn, writeFn, mkdirFn }) {
  const exec = execFn || ((file, args) => execFileSync(file, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, timeout: 600_000,
  }));
  const write = writeFn || ((p, c) => writeFileSync(p, c));
  const mkdir = mkdirFn || ((p) => mkdirSync(p, { recursive: true }));

  try {
    mkdir(outDir);
    const sbom = exec(syftPath, [`dir:${path}`, '-o', 'cyclonedx-json', '-q']);
    const sbomPath = join(outDir, `${repo}.cyclonedx.json`);
    write(sbomPath, sbom);
    return { ok: true, sbomPath, bytes: sbom.length };
  } catch (err) {
    return { ok: false, error: err.message || 'syft failed', sbomPath: null };
  }
}

/** Parse osv-scanner JSON into findings. */
export function parseOsvResults(json, { repo = 'unknown' } = {}) {
  const findings = [];
  let packagesScanned = 0;

  for (const result of (json && json.results) || []) {
    for (const pkg of result.packages || []) {
      packagesScanned++;
      const name = (pkg.package && pkg.package.name) || 'unknown';
      const version = (pkg.package && pkg.package.version) || 'unknown';

      // `groups` carries the max severity per cluster of aliased advisories,
      // which is what should drive the report; the vulnerability list gives ids.
      const maxScore = Math.max(
        ...(pkg.groups || []).map(g => Number(g.max_severity)).filter(Number.isFinite),
        -1,
      );

      const ids = (pkg.vulnerabilities || []).map(v => v.id).filter(Boolean);
      if (!ids.length) continue;

      const summaries = (pkg.vulnerabilities || [])
        .map(v => v.summary).filter(Boolean).slice(0, 2);

      findings.push({
        scanner: 'vulns',
        severity: maxScore >= 0 ? severityFromScore(maxScore) : 'medium',
        repo,
        subject: name,
        summary: `${name}@${version} — ${ids.length} known vulnerabilit${ids.length === 1 ? 'y' : 'ies'}${maxScore >= 0 ? ` (max CVSS ${maxScore})` : ''}`,
        detail: [
          summaries.join(' / ') || '(no summary in the local database)',
          `Advisories: ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ` (+${ids.length - 8} more)` : ''}`,
          (result.source && result.source.path) ? `Source: ${result.source.path}` : null,
        ].filter(Boolean).join('\n'),
        evidence: [
          `${name}@${version} in ${repo}`,
          ...ids.slice(0, 5).map(id => `https://osv.dev/${id}`),
        ],
        remedy: `Check for a fixed release of ${name} and upgrade.`,
        source: 'tool',
        advisoryIds: ids,
      });
    }
  }

  return { findings, packagesScanned };
}

/**
 * Run the offline CVE scan for one repo.
 *
 * osv-scanner exits 1 when it FINDS vulnerabilities, which is the common case;
 * treating that as failure would silently drop every real result.
 */
export function scanRepoVulns({
  repo, path, osvPath, dbPath, execFn, readFn, existsFn,
}) {
  const exec = execFn || ((file, args) => execFileSync(file, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, timeout: 900_000,
  }));
  const exists = existsFn || ((p) => existsSync(p));

  if (!exists(path)) {
    return { findings: [], skipped: `repo path not found: ${path}` };
  }

  let raw;
  try {
    raw = exec(osvPath, [
      'scan', 'source',
      '--offline',
      '--offline-vulnerabilities',
      '--local-db-path', dbPath,
      '--format', 'json',
      path,
    ]);
  } catch (err) {
    const code = err && typeof err.status === 'number' ? err.status : null;
    // 1 = vulnerabilities found. Anything else is a real failure.
    if (code === 1 && err.stdout) {
      raw = err.stdout;
    } else {
      return {
        findings: [{
          scanner: 'vulns', severity: 'medium', repo, subject: 'osv-scanner',
          summary: `offline CVE scan failed for ${repo}`,
          detail: `${err.message}\nThis repo was NOT checked against the offline vulnerability database on this run.`,
          evidence: [path, String(err.message).slice(0, 200)],
          remedy: 'Re-run scripts/security-toolchain-install.sh, then re-run the scan.',
          source: 'tool',
        }],
        skipped: null,
      };
    }
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      findings: [{
        scanner: 'vulns', severity: 'medium', repo, subject: 'osv-scanner',
        summary: `offline CVE output unparseable for ${repo}`,
        detail: err.message,
        evidence: [path],
        remedy: 'Check the osv-scanner version against agents/sentinel/toolchain.json.',
        source: 'tool',
      }],
      skipped: null,
    };
  }

  return { ...parseOsvResults(json, { repo }), skipped: null };
}
