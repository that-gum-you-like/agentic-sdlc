#!/usr/bin/env node
/**
 * Tests for sentinel/mcp-inventory.mjs — MCP servers as dependencies.
 * openspec: supply-chain-security-program (SCS-REQ-007)
 *
 * Run: node tests/sentinel-mcp-inventory.test.mjs
 */

import { inventory, auditMcp, toBaseline, entrypointOf, hashContent } from '../agents/sentinel/mcp-inventory.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const HOME = '/home/t';
/** Fake a home directory containing only ~/.claude.json. */
function fakeHome(claudeJson, files = {}) {
  const paths = { [`${HOME}/.claude.json`]: JSON.stringify(claudeJson), ...files };
  return {
    home: HOME,
    existsFn: (p) => Object.prototype.hasOwnProperty.call(paths, p),
    readFn: (p) => {
      if (!(p in paths)) throw new Error(`ENOENT ${p}`);
      return paths[p];
    },
    readdirFn: () => [],
    statFn: () => ({ isDirectory: () => false }),
  };
}

console.log('sentinel mcp-inventory tests');

test('entrypointOf picks the script argument', () => {
  assert(entrypointOf({ command: 'node', args: ['/srv/index.mjs'] }) === '/srv/index.mjs', 'mjs not found');
  assert(entrypointOf({ command: 'x', args: ['--flag'] }) === null, 'should be null with no script');
  assert(entrypointOf({}) === null, 'empty config should be null');
});

test('inventories user-scoped servers and hashes the entrypoint', () => {
  const { servers } = inventory(fakeHome(
    { mcpServers: { foo: { type: 'stdio', command: 'node', args: ['/srv/foo.mjs'] } } },
    { '/srv/foo.mjs': 'console.log(1)' },
  ));
  assert(servers.length === 1, `expected 1 server, got ${servers.length}`);
  assert(servers[0].entrypointHash === hashContent('console.log(1)'), 'entrypoint not hashed');
});

// --- the invariant that matters most here ---
test('environment VALUES are never recorded — only key names', () => {
  const secret = 'sk-super-secret-value-12345';
  const { servers } = inventory(fakeHome({
    mcpServers: { foo: { command: 'node', args: ['/srv/foo.mjs'], env: { API_KEY: secret, URL: 'http://x' } } },
  }, { '/srv/foo.mjs': 'x' }));
  const dumped = JSON.stringify(servers);
  assert(!dumped.includes(secret), 'SECRET LEAKED into the inventory');
  assert(servers[0].envKeys.join(',') === 'API_KEY,URL', `expected sorted key names, got ${servers[0].envKeys}`);
});

test('project-scoped servers are inventoried too', () => {
  const { servers } = inventory(fakeHome({
    mcpServers: {},
    projects: { '/home/t/proj': { mcpServers: { bar: { command: 'node', args: ['/srv/bar.mjs'] } } } },
  }, { '/srv/bar.mjs': 'y' }));
  assert(servers.length === 1 && servers[0].source === 'project:/home/t/proj',
    `expected a project-scoped server, got ${JSON.stringify(servers)}`);
});

test('a missing entrypoint is recorded, not assumed fine', () => {
  const { servers } = inventory(fakeHome({
    mcpServers: { gone: { command: 'node', args: ['/srv/gone.mjs'] } },
  }));
  assert(servers[0].entrypointExists === false, 'must record that the entrypoint is absent');
  assert(servers[0].entrypointHash === null, 'no hash for an absent file');
});

test('an unreadable .claude.json is an error, not a crash', () => {
  const r = inventory({
    home: HOME,
    existsFn: (p) => p === `${HOME}/.claude.json`,
    readFn: () => '{not json',
    readdirFn: () => [], statFn: () => ({ isDirectory: () => false }),
  });
  assert(r.errors.length === 1, `expected 1 error, got ${JSON.stringify(r.errors)}`);
  assert(r.servers.length === 0, 'no servers should be reported');
});

// --- auditing against a baseline ---
const srv = (over = {}) => ({
  name: 'foo', source: 'user:.claude.json', transport: 'stdio',
  envKeys: [], entrypointHash: 'aaaa', ...over,
});

test('first run does not report every existing server as new', () => {
  const { findings, isFirstRun } = auditMcp([srv(), srv({ name: 'bar' })], { servers: {} });
  assert(isFirstRun === true, 'expected first-run mode');
  assert(findings.length === 0, `first run must be quiet, got ${JSON.stringify(findings)}`);
});

test('a newly added server is MEDIUM', () => {
  const baseline = toBaseline([srv()]);
  const { findings } = auditMcp([srv(), srv({ name: 'newcomer' })], baseline);
  const f = findings.find(x => /new MCP server/.test(x.summary));
  assert(f && f.severity === 'medium', `expected a medium new-server finding, got ${JSON.stringify(findings)}`);
  assert(/newcomer/.test(f.summary), 'must name the server');
});

// --- tool poisoning ---
test('changed server code is HIGH (tool poisoning)', () => {
  const baseline = toBaseline([srv({ entrypointHash: 'OLD' })]);
  const { findings } = auditMcp([srv({ entrypointHash: 'NEW' })], baseline);
  const f = findings.find(x => /code changed/.test(x.summary));
  assert(f && f.severity === 'high', `expected a high change finding, got ${JSON.stringify(findings)}`);
  assert(f.evidence.some(e => /OLD → NEW/.test(e)), 'must cite both hashes');
});

test('unchanged servers are silent', () => {
  const baseline = toBaseline([srv()]);
  const { findings } = auditMcp([srv()], baseline);
  assert(findings.length === 0, `expected silence, got ${JSON.stringify(findings)}`);
});

test('a server that gains env keys is flagged', () => {
  const baseline = toBaseline([srv({ envKeys: ['URL'] })]);
  const { findings } = auditMcp([srv({ envKeys: ['URL', 'API_KEY'] })], baseline);
  const f = findings.find(x => /gained environment keys/.test(x.summary));
  assert(f && /API_KEY/.test(f.summary), `expected the new key named, got ${JSON.stringify(findings)}`);
});

test('a removed server is reported at LOW', () => {
  const baseline = toBaseline([srv(), srv({ name: 'vanished' })]);
  const { findings } = auditMcp([srv()], baseline);
  const f = findings.find(x => /no longer configured/.test(x.summary));
  assert(f && f.severity === 'low', `expected a low removal finding, got ${JSON.stringify(findings)}`);
});

test('read errors surface as findings', () => {
  const { findings } = auditMcp([], { servers: { x: {} } }, { errors: ['.claude.json unreadable: boom'] });
  assert(findings.some(f => /could not be fully read/.test(f.summary)), 'unreadable config must be a finding');
});

test('baseline round-trips without carrying secrets', () => {
  const b = toBaseline([srv({ envKeys: ['API_KEY'] })]);
  const dumped = JSON.stringify(b);
  assert(/API_KEY/.test(dumped), 'key names are expected in the baseline');
  assert(b.servers['user:.claude.json:foo'], 'baseline must key by source:name');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
