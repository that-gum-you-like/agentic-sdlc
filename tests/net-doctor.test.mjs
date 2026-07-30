#!/usr/bin/env node
/**
 * Tests for agents/net-doctor.mjs
 * Zero deps — uses Node's built-in test runner. Fully hermetic: every probe
 * (resolve4/resolve6/tcpConnect/ipv6DefaultRoute/activeResolvers) is faked,
 * so these assertions never depend on this machine's real DNS/routes/network
 * (CI runs on a different network than the host that motivated this check).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkEgress, DEFAULT_HOSTS } from '../agents/net-doctor.mjs';

function dnsError(host, code = 'ENOTFOUND') {
  const err = new Error(`getaddrinfo ${code} ${host}`);
  err.code = code;
  return err;
}

/** Builds a fake probe set. Any per-host behavior is looked up by hostname. */
function fakeProbes({
  a = {},          // host -> array of IPv4s, or undefined (dns error)
  aaaa = {},       // host -> array of IPv6s, or undefined (dns error)
  v4connect = {},  // host -> boolean (throws if false)
  v6connect = {},  // host -> boolean (throws if false)
  ipv6Route = null, // boolean | null(unknown) | Error to throw
  resolvers = ['1.1.1.1'],
} = {}) {
  return {
    resolve4: async (host) => {
      if (!(host in a) || a[host] === undefined) throw dnsError(host);
      return a[host];
    },
    resolve6: async (host) => {
      if (!(host in aaaa) || aaaa[host] === undefined) throw dnsError(host);
      return aaaa[host];
    },
    tcpConnect: async (host, port, { family }) => {
      const table = family === 6 ? v6connect : v4connect;
      const ok = table[host];
      if (!ok) throw new Error(`ECONNREFUSED/ENETUNREACH ${host}:${port} family ${family}`);
      return true;
    },
    ipv6DefaultRoute: async () => {
      if (ipv6Route instanceof Error) throw ipv6Route;
      return ipv6Route;
    },
    activeResolvers: async () => resolvers,
  };
}

test('DEFAULT_HOSTS is exactly the OpenRouter + Telegram pair', () => {
  assert.deepEqual(DEFAULT_HOSTS, ['openrouter.ai', 'api.telegram.org']);
});

test('the exact blackhole scenario: AAAA present, no v6 route, v4 OK -> single ipv6-blackhole critical', async () => {
  const probes = fakeProbes({
    a: { 'openrouter.ai': ['104.18.20.0'] },
    aaaa: { 'openrouter.ai': ['2606:4700::6812:373'] },
    v4connect: { 'openrouter.ai': true },
    ipv6Route: false,
    resolvers: ['1.1.1.1'],
  });
  const result = await checkEgress({ hosts: ['openrouter.ai'], probes });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, 'ipv6-blackhole');
  assert.equal(result.findings[0].severity, 'critical');
  assert.match(result.findings[0].remedy, /network-preflight\.sh/);
  assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('fully healthy host: A + AAAA resolve, v4 and v6 connect OK, public resolver -> ok:true, zero findings', async () => {
  const probes = fakeProbes({
    a: { 'openrouter.ai': ['104.18.20.0'] },
    aaaa: { 'openrouter.ai': ['2606:4700::6812:373'] },
    v4connect: { 'openrouter.ai': true },
    v6connect: { 'openrouter.ai': true },
    ipv6Route: true,
    resolvers: ['1.1.1.1', '9.9.9.9'],
  });
  const result = await checkEgress({ hosts: ['openrouter.ai'], probes });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('DNS total failure (no A, no AAAA) -> single dns-unresolved critical, no downstream checks attempted', async () => {
  const probes = fakeProbes({
    a: {},
    aaaa: {},
    resolvers: ['1.1.1.1'],
  });
  const result = await checkEgress({ hosts: ['openrouter.ai'], probes });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, 'dns-unresolved');
  assert.equal(result.findings[0].severity, 'critical');
});

test('IPv4 unreachable: A resolves but TCP connect to 443 fails -> ipv4-unreachable critical', async () => {
  const probes = fakeProbes({
    a: { 'openrouter.ai': ['104.18.20.0'] },
    aaaa: {},
    v4connect: { 'openrouter.ai': false },
    resolvers: ['1.1.1.1'],
  });
  const result = await checkEgress({ hosts: ['openrouter.ai'], probes });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.id === 'ipv4-unreachable' && f.severity === 'critical'));
});

test('RFC1918 active resolver produces a warn, and does NOT flip ok to false on an otherwise-healthy host', async () => {
  const probes = fakeProbes({
    a: { 'openrouter.ai': ['104.18.20.0'] },
    aaaa: {},
    v4connect: { 'openrouter.ai': true },
    resolvers: ['192.168.0.1', '205.171.2.65'],
  });
  const result = await checkEgress({ hosts: ['openrouter.ai'], probes });
  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, 'dns-resolver-local');
  assert.equal(result.findings[0].severity, 'warn');
  assert.match(result.findings[0].detail, /192\.168\.0\.1/);
});

test('one host throwing/failing does not prevent the other host from being checked', async () => {
  const probes = {
    resolve4: async (host) => {
      if (host === 'openrouter.ai') throw new Error('boom: simulated crash in probe');
      return ['104.18.20.0'];
    },
    resolve6: async () => {
      throw dnsError('irrelevant');
    },
    tcpConnect: async () => true,
    ipv6DefaultRoute: async () => true,
    activeResolvers: async () => ['1.1.1.1'],
  };
  const result = await checkEgress({ hosts: ['openrouter.ai', 'api.telegram.org'], probes });
  // openrouter.ai: resolve4 throws, resolve6 throws -> dns-unresolved for openrouter.ai
  // api.telegram.org: resolves fine via v4, connects OK -> no finding
  assert.equal(result.ok, false);
  const ids = result.findings.map((f) => f.id);
  assert.ok(ids.includes('dns-unresolved'));
  const onlyOpenRouterFindings = result.findings.every((f) => f.summary.includes('openrouter.ai') || f.id === 'dns-resolver-local');
  assert.ok(onlyOpenRouterFindings, 'api.telegram.org must not have produced a spurious finding');
});

test('ipv6DefaultRoute probe throwing (unknown) falls back to a direct v6 connect attempt', async () => {
  const probes = fakeProbes({
    a: { 'openrouter.ai': ['104.18.20.0'] },
    aaaa: { 'openrouter.ai': ['2606:4700::6812:373'] },
    v4connect: { 'openrouter.ai': true },
    v6connect: { 'openrouter.ai': false },
    ipv6Route: new Error('ip: command not found'),
    resolvers: ['1.1.1.1'],
  });
  const result = await checkEgress({ hosts: ['openrouter.ai'], probes });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.id === 'ipv6-blackhole'));
});

test('timeoutMs is honored: a probe that never resolves still produces a finding rather than hanging', async () => {
  const probes = {
    resolve4: async () => new Promise(() => {}), // never resolves
    resolve6: async () => { throw dnsError('openrouter.ai'); },
    tcpConnect: async () => true,
    ipv6DefaultRoute: async () => true,
    activeResolvers: async () => ['1.1.1.1'],
  };
  const result = await checkEgress({ hosts: ['openrouter.ai'], timeoutMs: 50, probes });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].id, 'dns-unresolved');
});
