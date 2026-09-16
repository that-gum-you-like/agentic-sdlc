/**
 * sentinel/advisory-feed — live threat intelligence, matched locally.
 *
 * openspec: supply-chain-security-program (SCS-REQ-040 – SCS-REQ-043)
 *
 * The offline OSV database answers "is there a known CVE" well and "was this
 * package compromised on Tuesday" not at all. Supply-chain incidents surface in
 * advisory feeds and security write-ups days or weeks before they land in a
 * bulk database, and that gap is precisely when the malicious version is still
 * installable.
 *
 * PRIVACY SHAPE — this is the part that matters, and it is not incidental:
 * advisories are pulled BY ECOSYSTEM ("give me every npm advisory since
 * <date>") and matched against our inventory locally, on this machine. Our
 * package list, versions, and dependency graph are never sent anywhere. That
 * is a strictly stronger position than any SCA SaaS, which works by uploading
 * exactly that graph — and it still gets us same-day intelligence.
 *
 * Sources:
 *   * GitHub Security Advisories — per ecosystem, incremental by publish date
 *   * CISA KEV — vulnerabilities known to be exploited in the wild, which
 *     escalate regardless of their CVSS score
 */

import { satisfiesRange } from './semver-lite.mjs';

// Node's fetch trips over Happy Eyeballs on this dual-stack host and times out
// where curl works. Documented trap; disable auto family selection up front.
import net from 'net';
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

export const GITHUB_ADVISORY_API = 'https://api.github.com/advisories';
export const CISA_KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

/** Ecosystems this portfolio actually uses. */
export const ECOSYSTEMS = ['npm', 'pip', 'actions'];

const USER_AGENT = 'sentinel-supply-chain-scanner (agentic-sdlc; local, non-commercial)';

/** Minimal JSON GET with a timeout. Never sends anything about our packages. */
async function getJson(url, { timeoutMs = 30_000, fetchFn } = {}) {
  const doFetch = fetchFn || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull advisories for one ecosystem, published since a date.
 *
 * The query carries an ecosystem and a date — nothing about us.
 */
export async function fetchEcosystemAdvisories(ecosystem, {
  since, maxPages = 5, perPage = 100, fetchFn, timeoutMs,
} = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      ecosystem, per_page: String(perPage), page: String(page), sort: 'published', direction: 'desc',
    });
    if (since) params.set('published', `>${since}`);
    const batch = await getJson(`${GITHUB_ADVISORY_API}?${params}`, { fetchFn, timeoutMs });
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < perPage) break;
  }
  return out;
}

/** Pull the CISA catalogue of vulnerabilities known to be exploited. */
export async function fetchKev({ fetchFn, timeoutMs } = {}) {
  const data = await getJson(CISA_KEV_URL, { fetchFn, timeoutMs });
  const set = new Set();
  for (const v of (data && data.vulnerabilities) || []) {
    if (v.cveID) set.add(v.cveID);
  }
  return set;
}

/** CVE ids carried by an advisory. */
function cvesOf(advisory) {
  const ids = new Set();
  if (advisory.cve_id) ids.add(advisory.cve_id);
  for (const id of advisory.identifiers || []) {
    if (id && id.type === 'CVE' && id.value) ids.add(id.value);
  }
  return [...ids];
}

const SEVERITY_MAP = { critical: 'high', high: 'high', moderate: 'medium', medium: 'medium', low: 'low' };

/**
 * Match pulled advisories against our local inventory.
 *
 * @param {Array} advisories  from fetchEcosystemAdvisories()
 * @param {Array} inventory   [{ ecosystem, name, version, repo }]
 * @param {Set}   kev         CVE ids known to be exploited in the wild
 * @returns {{ findings: Array, unknownRanges: Array }}
 */
export function matchAdvisories(advisories, inventory, kev = new Set()) {
  const findings = [];
  const unknownRanges = [];

  // Index our packages by ecosystem+name so each advisory is one lookup.
  const byName = new Map();
  for (const pkg of inventory) {
    const key = `${pkg.ecosystem}:${pkg.name}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(pkg);
  }

  for (const adv of advisories) {
    for (const vuln of adv.vulnerabilities || []) {
      const pkgInfo = vuln.package || {};
      if (!pkgInfo.name || !pkgInfo.ecosystem) continue;

      const key = `${String(pkgInfo.ecosystem).toLowerCase()}:${pkgInfo.name}`;
      const ours = byName.get(key);
      if (!ours) continue;

      for (const pkg of ours) {
        const affected = satisfiesRange(pkg.version, vuln.vulnerable_version_range);

        if (affected === null) {
          // Could not decide. Report it as unknown — never as "not affected".
          unknownRanges.push({
            repo: pkg.repo, name: pkg.name, version: pkg.version,
            range: vuln.vulnerable_version_range, ghsa: adv.ghsa_id,
          });
          continue;
        }
        if (!affected) continue;

        const cves = cvesOf(adv);
        const exploited = cves.filter(c => kev.has(c));
        const baseSeverity = SEVERITY_MAP[String(adv.severity || '').toLowerCase()] || 'medium';

        findings.push({
          scanner: 'advisory-feed',
          // Known-exploited beats any CVSS score: someone is already using it.
          severity: exploited.length ? 'high' : baseSeverity,
          repo: pkg.repo,
          subject: pkg.name,
          summary: exploited.length
            ? `${pkg.name}@${pkg.version} — ACTIVELY EXPLOITED (${exploited.join(', ')})`
            : `${pkg.name}@${pkg.version} — ${adv.severity} advisory ${adv.ghsa_id}`,
          detail: [
            adv.summary || '(no summary)',
            `Affected range: ${vuln.vulnerable_version_range}`,
            vuln.first_patched_version ? `Fixed in: ${vuln.first_patched_version}` : 'No published fix yet.',
            adv.published_at ? `Published: ${adv.published_at}` : null,
            exploited.length ? `On the CISA known-exploited list: ${exploited.join(', ')}` : null,
          ].filter(Boolean).join('\n'),
          evidence: [
            `${pkg.name}@${pkg.version} in ${pkg.repo}`,
            adv.html_url || `https://github.com/advisories/${adv.ghsa_id}`,
            ...cves,
          ],
          remedy: vuln.first_patched_version
            ? `Upgrade ${pkg.name} to ${vuln.first_patched_version} or later.`
            : `No fix published. Assess exposure and consider removing or pinning away from ${pkg.name}.`,
          source: 'tool',
          publishedAt: adv.published_at || null,
          ghsa: adv.ghsa_id,
        });
      }
    }
  }

  return { findings, unknownRanges };
}

/**
 * Full threat-intel pass.
 *
 * Network failure is reported as a finding, never as silence: "no new
 * advisories" and "could not reach the advisory feed" must never look alike.
 */
export async function scanAdvisories({
  inventory, since, ecosystems = ECOSYSTEMS, fetchFn, timeoutMs, maxPages,
} = {}) {
  const findings = [];
  const evidence = { ecosystems: {}, kevSize: 0, since: since || null, unknownRanges: [] };

  let kev = new Set();
  try {
    kev = await fetchKev({ fetchFn, timeoutMs });
    evidence.kevSize = kev.size;
  } catch (err) {
    findings.push({
      scanner: 'advisory-feed', severity: 'medium', repo: 'host', subject: 'cisa-kev',
      summary: 'could not reach the CISA known-exploited catalogue',
      detail: `${err.message}. Advisories were still matched, but exploited-in-the-wild escalation was unavailable this run.`,
      evidence: [CISA_KEV_URL, err.message],
      remedy: 'Check egress (node agents/net-doctor.mjs) and re-run.',
      source: 'tool',
    });
  }

  const allAdvisories = [];
  for (const eco of ecosystems) {
    try {
      const advisories = await fetchEcosystemAdvisories(eco, { since, fetchFn, timeoutMs, maxPages });
      evidence.ecosystems[eco] = { fetched: advisories.length, ok: true };
      allAdvisories.push(...advisories);
    } catch (err) {
      evidence.ecosystems[eco] = { fetched: 0, ok: false, error: err.message };
      findings.push({
        scanner: 'advisory-feed', severity: 'medium', repo: 'host', subject: `advisory-feed:${eco}`,
        summary: `could not fetch ${eco} advisories`,
        detail: `${err.message}. This ecosystem was NOT checked against live intelligence this run.`,
        evidence: [`${GITHUB_ADVISORY_API}?ecosystem=${eco}`, err.message],
        remedy: 'Check egress and re-run; a feed that silently fails is a blind spot.',
        source: 'tool',
      });
    }
  }

  const matched = matchAdvisories(allAdvisories, inventory || [], kev);
  evidence.unknownRanges = matched.unknownRanges;

  if (matched.unknownRanges.length) {
    findings.push({
      scanner: 'advisory-feed', severity: 'medium', repo: 'host', subject: 'version-ranges',
      summary: `${matched.unknownRanges.length} advisory version range(s) could not be evaluated`,
      detail: matched.unknownRanges.slice(0, 10)
        .map(u => `${u.name}@${u.version} vs "${u.range}" (${u.ghsa})`).join('\n'),
      evidence: matched.unknownRanges.slice(0, 10).map(u => `${u.ghsa}: ${u.range}`),
      remedy: 'Check these by hand. An unparseable range means unknown, not safe.',
      source: 'tool',
    });
  }

  return { findings: [...findings, ...matched.findings], evidence };
}
