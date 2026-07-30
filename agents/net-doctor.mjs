#!/usr/bin/env node
/**
 * Net Doctor — egress diagnostic for the IPv6-blackhole failure mode.
 *
 * On hosts where the resolver returns AAAA records for a hostname but the
 * machine has no working IPv6 default route, IPv6-preferring HTTP stacks
 * (e.g. Python httpx/httpcore/anyio) try the AAAA address first, fail
 * instantly with ENETUNREACH, and surface that as "provider is down" even
 * though IPv4 works fine. This module detects that condition (and a few
 * related DNS/connectivity failure modes) without any dependencies.
 *
 * Contract (relied on by agents/health-check.mjs — do not rename/reshape):
 *   export async function checkEgress({ timeoutMs, hosts } = {})
 *     -> { ok: boolean, findings: Finding[], checkedAt: string (ISO) }
 *   export const DEFAULT_HOSTS
 *
 *   Finding = { id, severity: 'critical'|'warn'|'info', summary, detail, remedy }
 *
 * `ok` is true only when there are zero 'critical' findings.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/net-doctor.mjs        # human-readable report, exit 0/1
 *   import { checkEgress } from './net-doctor.mjs';  # programmatic use
 */

import { resolve4 as dnsResolve4, resolve6 as dnsResolve6, lookup as dnsLookup } from 'node:dns/promises';
import { getServers as dnsGetServers } from 'node:dns';
import { createConnection } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export const DEFAULT_HOSTS = ['openrouter.ai', 'api.telegram.org'];

const REMEDY_PREFLIGHT = 'Run `sudo bash scripts/network-preflight.sh` to fix IPv4 precedence and switch DNS to reliable resolvers.';

// ---------------------------------------------------------------------------
// Timeout guard — every probe call runs through this so a hung DNS server or
// a black-holed connect attempt can never hang the overall run.
// ---------------------------------------------------------------------------

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Default (real) probes. Each is individually replaceable via the `probes`
// option so tests can run fully hermetic against fakes.
// ---------------------------------------------------------------------------

function defaultTcpConnect(host, port, { family, timeoutMs = 5000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const socket = createConnection({ host, port, family });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`tcp connect to ${host}:${port} (family ${family}) timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolvePromise(true);
    });
    socket.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });
  });
}

async function defaultIpv6DefaultRoute() {
  try {
    const { stdout } = await execFileAsync('ip', ['-6', 'route', 'show', 'default']);
    return stdout.trim().length > 0;
  } catch (err) {
    if (err && err.code === 'ENOENT') return null; // `ip` not present: unknown, not a crash
    return null; // any other failure (no permission, weird platform): treat as unknown
  }
}

async function defaultActiveResolvers() {
  return dnsGetServers();
}

/**
 * Address-selection order as an actual client will see it.
 *
 * Deliberately dns.lookup() and NOT dns.resolve4/6: lookup() goes through
 * getaddrinfo, so it honours /etc/gai.conf and the RFC 6724 precedence table,
 * which is exactly the mechanism the remedy manipulates. resolve4/resolve6
 * query DNS directly and bypass address selection entirely, so they can never
 * tell us whether IPv4 precedence took effect. `verbatim: true` stops Node
 * reordering the result behind our back.
 *
 * @returns {Promise<Array<{address: string, family: number}>>}
 */
async function defaultLookupOrdered(host) {
  return dnsLookup(host, { all: true, verbatim: true });
}

const DEFAULT_PROBES = {
  resolve4: dnsResolve4,
  resolve6: dnsResolve6,
  tcpConnect: defaultTcpConnect,
  ipv6DefaultRoute: defaultIpv6DefaultRoute,
  activeResolvers: defaultActiveResolvers,
  lookupOrdered: defaultLookupOrdered,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRfc1918(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Best-effort array-of-strings coercion so a probe returning garbage never crashes decision logic. */
function asList(v) {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Per-host checks
// ---------------------------------------------------------------------------

async function checkHost(host, { timeoutMs, probes }) {
  const findings = [];

  let ips4 = null;
  let err4 = null;
  try {
    ips4 = await withTimeout(probes.resolve4(host), timeoutMs, `resolve4(${host})`);
  } catch (e) {
    err4 = e;
  }

  let ips6 = null;
  let err6 = null;
  try {
    ips6 = await withTimeout(probes.resolve6(host), timeoutMs, `resolve6(${host})`);
  } catch (e) {
    err6 = e;
  }

  const has4 = asList(ips4).length > 0;
  const has6 = asList(ips6).length > 0;

  if (!has4 && !has6) {
    findings.push({
      id: 'dns-unresolved',
      severity: 'critical',
      summary: `${host} could not be resolved (no A or AAAA records)`,
      detail: `resolve4 error: ${err4 ? err4.message : 'no records'}; resolve6 error: ${err6 ? err6.message : 'no records'}`,
      remedy: 'Check DNS resolver connectivity. If the active resolver is a flaky router, run scripts/network-preflight.sh.',
    });
    return findings;
  }

  if (has4) {
    let v4ok = false;
    try {
      v4ok = await withTimeout(probes.tcpConnect(host, 443, { family: 4, timeoutMs }), timeoutMs, `tcp4(${host})`);
    } catch {
      v4ok = false;
    }
    if (!v4ok) {
      findings.push({
        id: 'ipv4-unreachable',
        severity: 'critical',
        summary: `${host} resolved via IPv4 (${ips4.join(', ')}) but a TCP connect to port 443 failed`,
        detail: `A: ${ips4.join(', ')}`,
        remedy: 'Check firewall/network egress rules for outbound HTTPS (port 443).',
      });
    }
  }

  if (has6) {
    let routeOk = null;
    try {
      routeOk = await withTimeout(probes.ipv6DefaultRoute(), timeoutMs, 'ipv6DefaultRoute()');
    } catch {
      routeOk = null; // unknown — fall through to a direct connect attempt
    }

    if (routeOk === false) {
      // No IPv6 default route. Whether that actually breaks anything depends
      // on address SELECTION: the failure is "a client tries the AAAA address
      // first and dies with ENETUNREACH", not "AAAA records exist". Once
      // /etc/gai.conf gives IPv4 precedence, getaddrinfo hands back the A
      // record first and nothing ever attempts IPv6 — the host is fine.
      //
      // Checking the route alone made this finding un-clearable: applying the
      // documented remedy left it reporting critical forever, which would pin
      // health-check at 'down' and train everyone to ignore the alert. So ask
      // getaddrinfo what a real client would actually try first.
      let first = null;
      let lookupErr = null;
      try {
        const ordered = asList(await withTimeout(probes.lookupOrdered(host), timeoutMs, `lookupOrdered(${host})`));
        first = ordered[0] || null;
      } catch (e) {
        lookupErr = e;
      }

      if (first && first.family === 4) {
        findings.push({
          id: 'ipv6-unroutable-mitigated',
          severity: 'info',
          summary: `${host} publishes AAAA records and this host has no IPv6 route, but IPv4 precedence is in effect`,
          detail: `getaddrinfo returns ${first.address} (IPv4) first, so clients never attempt the unreachable AAAA address. AAAA: ${ips6.join(', ')}`,
          remedy: 'None needed. Keep the IPv4 precedence rule in /etc/gai.conf in place.',
        });
      } else if (first && first.family === 6) {
        findings.push({
          id: 'ipv6-blackhole',
          severity: 'critical',
          summary: `${host} resolves AAAA records (${ips6.join(', ')}) but this host has no IPv6 default route`,
          detail: `getaddrinfo returns ${first.address} (IPv6) first, so IPv6-preferring HTTP stacks will try it, fail instantly (ENETUNREACH), and misreport this as the remote service being down.`,
          remedy: REMEDY_PREFLIGHT,
        });
      } else {
        // Couldn't establish selection order. Report it as a warning rather
        // than a critical: "we can't tell" must not masquerade as "it's broken".
        findings.push({
          id: 'ipv6-order-unknown',
          severity: 'warn',
          summary: `${host} publishes AAAA records and this host has no IPv6 route; address-selection order could not be determined`,
          detail: lookupErr ? lookupErr.message : 'getaddrinfo returned no addresses',
          remedy: `Check manually with \`getent ahosts ${host}\` — an IPv4 address on the first line means egress is fine.`,
        });
      }
    } else {
      // Route present (or its presence is unknown) — verify with a direct connect.
      let v6ok = false;
      try {
        v6ok = await withTimeout(probes.tcpConnect(host, 443, { family: 6, timeoutMs }), timeoutMs, `tcp6(${host})`);
      } catch {
        v6ok = false;
      }
      if (!v6ok) {
        findings.push({
          id: 'ipv6-blackhole',
          severity: 'critical',
          summary: `${host} resolves AAAA records (${ips6.join(', ')}) but a direct IPv6 connect to port 443 failed`,
          detail: `IPv6 default route reported as: ${routeOk === null ? 'unknown' : 'present'}`,
          remedy: REMEDY_PREFLIGHT,
        });
      }
    }
  }

  return findings;
}

async function checkResolvers({ timeoutMs, probes }) {
  let resolvers = [];
  try {
    resolvers = asList(await withTimeout(probes.activeResolvers(), timeoutMs, 'activeResolvers()'));
  } catch {
    return null; // can't determine active resolvers — not a finding, just unknown
  }
  const rfc1918 = resolvers.filter(isRfc1918);
  if (rfc1918.length === 0) return null;
  return {
    id: 'dns-resolver-local',
    severity: 'warn',
    summary: `Active DNS resolver(s) include a private (RFC1918) address: ${rfc1918.join(', ')}`,
    detail: `All active resolvers: ${resolvers.join(', ') || '(none reported)'}`,
    remedy: 'Point resolution at reliable public resolvers ahead of the router: run scripts/network-preflight.sh (adds 1.1.1.1 / 9.9.9.9).',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the egress diagnostic.
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] hard timeout per individual probe call
 * @param {string[]} [opts.hosts] hosts to check (defaults to DEFAULT_HOSTS)
 * @param {object} [opts.probes] override any of resolve4/resolve6/tcpConnect/
 *   ipv6DefaultRoute/activeResolvers — used by tests to run hermetically.
 * @returns {Promise<{ok: boolean, findings: object[], checkedAt: string}>}
 */
export async function checkEgress({ timeoutMs = 5000, hosts = DEFAULT_HOSTS, probes: probeOverrides = {} } = {}) {
  const probes = { ...DEFAULT_PROBES, ...probeOverrides };
  const findings = [];

  for (const host of hosts) {
    try {
      const hostFindings = await checkHost(host, { timeoutMs, probes });
      findings.push(...hostFindings);
    } catch (e) {
      // A probe throwing unexpectedly must never take down the whole run,
      // and must never prevent the remaining hosts from being checked.
      findings.push({
        id: 'dns-unresolved',
        severity: 'critical',
        summary: `${host}: egress check failed unexpectedly`,
        detail: e && e.message ? e.message : String(e),
        remedy: 'Re-run node agents/net-doctor.mjs; if this persists, check DNS/network manually.',
      });
    }
  }

  const resolverFinding = await checkResolvers({ timeoutMs, probes });
  if (resolverFinding) findings.push(resolverFinding);

  const ok = !findings.some((f) => f.severity === 'critical');
  return { ok, findings, checkedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const result = await checkEgress();

  console.log(`Net Doctor: ${result.ok ? 'OK' : 'PROBLEMS FOUND'} (${result.checkedAt})`);
  if (result.findings.length === 0) {
    console.log('  No findings — egress looks healthy.');
  }
  for (const f of result.findings) {
    console.log(`  [${f.severity}] ${f.id}: ${f.summary}`);
    console.log(`    detail: ${f.detail}`);
    console.log(`    remedy: ${f.remedy}`);
  }

  process.exit(result.ok ? 0 : 1);
}
