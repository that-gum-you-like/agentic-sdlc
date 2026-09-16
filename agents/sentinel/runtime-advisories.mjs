/**
 * sentinel/runtime-advisories — the languages, not just the libraries.
 *
 * openspec: supply-chain-security-program (SCS-REQ-043)
 *
 * Added at Bryce's direction: "compromises in the libraries or open source or
 * LANGUAGES we use in all of our tech stacks."
 *
 * Every dependency scanner in this layer looks at packages. None of them looks
 * at the thing executing those packages. A runtime past its end-of-life stops
 * receiving security patches entirely — so it is not that it has known
 * vulnerabilities, it is that nobody is fixing the ones it gets from now on.
 * That is a quieter and worse failure than any single CVE, and no lockfile
 * mentions it.
 *
 * Source: endoflife.date, a public dataset queried BY PRODUCT NAME ("nodejs").
 * Consistent with the privacy shape used throughout: we ask a general question
 * and compare locally, rather than describing our environment to anyone.
 */

import { execFileSync } from 'child_process';
import net from 'net';

if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

export const EOL_API = 'https://endoflife.date/api';

/** Runtimes this portfolio actually executes. */
export const RUNTIMES = [
  { product: 'nodejs', label: 'Node.js', probe: ['node', ['--version']] },
  { product: 'python', label: 'Python', probe: ['/usr/bin/python3', ['--version']] },
];

/** "v25.6.1" / "Python 3.12.3" → "25.6.1" */
export function parseRuntimeVersion(raw) {
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(String(raw || ''));
  return m ? m[1] : null;
}

/** Major.minor cycle key used by endoflife.date ("25", or "3.12" for Python). */
export function cycleOf(version, product) {
  if (!version) return null;
  const parts = version.split('.');
  return product === 'python' ? `${parts[0]}.${parts[1]}` : parts[0];
}

/** Detect an installed runtime version. */
export function detectRuntime(runtime, { execFn } = {}) {
  const exec = execFn || ((file, args) => execFileSync(file, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000,
  }));
  const [file, args] = runtime.probe;
  try {
    return { ok: true, version: parseRuntimeVersion(exec(file, args)) };
  } catch (err) {
    return { ok: false, version: null, error: err.message };
  }
}

async function getJson(url, { fetchFn, timeoutMs = 25_000 } = {}) {
  const doFetch = fetchFn || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/**
 * Judge one runtime version against its release cycle.
 *
 * @param {Array} cycles  endoflife.date payload
 * @param {string} version installed version
 * @param {Date} now
 */
export function assessRuntime(cycles, version, { product, label, now = new Date() } = {}) {
  const findings = [];
  const cycleKey = cycleOf(version, product);
  const cycle = (cycles || []).find(c => String(c.cycle) === cycleKey);

  if (!cycle) {
    findings.push({
      scanner: 'runtime-advisories', severity: 'medium', repo: 'host', subject: label,
      summary: `${label} ${version} is not a recognised release cycle`,
      detail: `No cycle "${cycleKey}" in the upstream release data. An unrecognised runtime cannot be checked for end-of-life or patch level.`,
      evidence: [`${label} ${version}`, `${EOL_API}/${product}.json`],
      remedy: `Confirm what ${label} build this is and whether it still receives security fixes.`,
      source: 'tool',
    });
    return { findings, cycle: null };
  }

  // eol is either a date string or `true`/`false`.
  const eolRaw = cycle.eol;
  let isEol = false;
  let eolDate = null;
  if (eolRaw === true) isEol = true;
  else if (typeof eolRaw === 'string') {
    eolDate = new Date(eolRaw);
    isEol = Number.isFinite(eolDate.getTime()) && eolDate.getTime() < now.getTime();
  }

  if (isEol) {
    findings.push({
      scanner: 'runtime-advisories', severity: 'high', repo: 'host', subject: label,
      summary: `${label} ${version} is past end-of-life${eolDate ? ` (EOL ${eolRaw})` : ''}`,
      detail: [
        `${label} ${cycleKey} no longer receives security updates.`,
        'This is not a single known vulnerability — it means future vulnerabilities in this runtime will never be patched for it.',
        `Everything in the portfolio executes on this runtime.`,
      ].join('\n'),
      evidence: [`${label} ${version}`, `cycle ${cycleKey} EOL ${eolRaw}`, `${EOL_API}/${product}.json`],
      remedy: `Upgrade ${label} to a supported release cycle.`,
      source: 'tool',
    });
  }

  // Behind on patches within a supported cycle.
  if (cycle.latest && cycle.latest !== version) {
    const behind = compareLoose(version, cycle.latest);
    if (behind === -1) {
      findings.push({
        scanner: 'runtime-advisories',
        severity: isEol ? 'high' : 'medium',
        repo: 'host', subject: label,
        summary: `${label} ${version} is behind the latest patch release (${cycle.latest})`,
        detail: `Cycle ${cycleKey} has shipped ${cycle.latest}. Patch releases in a runtime are usually where its security fixes land.`,
        evidence: [`installed ${version}`, `latest ${cycle.latest}`],
        remedy: `Update ${label} to ${cycle.latest}.`,
        source: 'tool',
      });
    }
  }

  return { findings, cycle };
}

/** Loose numeric compare; null when either side is unparseable. */
function compareLoose(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Check every runtime.
 *
 * A runtime that cannot be checked is reported. Not checking and finding
 * nothing must never produce the same output.
 */
export async function scanRuntimes({ runtimes = RUNTIMES, execFn, fetchFn, now = new Date() } = {}) {
  const findings = [];
  const evidence = {};

  for (const runtime of runtimes) {
    const detected = detectRuntime(runtime, { execFn });

    if (!detected.ok || !detected.version) {
      evidence[runtime.product] = { detected: null, ok: false };
      findings.push({
        scanner: 'runtime-advisories', severity: 'low', repo: 'host', subject: runtime.label,
        summary: `${runtime.label} is not installed or could not be detected`,
        detail: detected.error || 'No version string returned.',
        evidence: [runtime.probe.join(' ')],
        remedy: `If ${runtime.label} is in use here, make it detectable so it can be checked.`,
        source: 'tool',
      });
      continue;
    }

    let cycles;
    try {
      cycles = await getJson(`${EOL_API}/${runtime.product}.json`, { fetchFn });
    } catch (err) {
      evidence[runtime.product] = { detected: detected.version, ok: false, error: err.message };
      findings.push({
        scanner: 'runtime-advisories', severity: 'medium', repo: 'host', subject: runtime.label,
        summary: `could not check ${runtime.label} support status`,
        detail: `${err.message}. ${runtime.label} ${detected.version} was NOT checked for end-of-life this run.`,
        evidence: [`${EOL_API}/${runtime.product}.json`, err.message],
        remedy: 'Check egress and re-run.',
        source: 'tool',
      });
      continue;
    }

    const assessed = assessRuntime(cycles, detected.version, { ...runtime, now });
    evidence[runtime.product] = {
      detected: detected.version, ok: true,
      cycle: assessed.cycle ? String(assessed.cycle.cycle) : null,
      eol: assessed.cycle ? assessed.cycle.eol : null,
      latest: assessed.cycle ? assessed.cycle.latest : null,
    };
    findings.push(...assessed.findings);
  }

  return { findings, evidence };
}
