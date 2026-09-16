/**
 * sentinel/mcp-inventory — treat every MCP server as a dependency.
 *
 * openspec: supply-chain-security-program (SCS-REQ-007)
 *
 * An MCP server is arbitrary code with tool-call reach into an agent that can
 * write files and run commands. It arrives with less ceremony than an npm
 * dependency and is covered by no lockfile, no SBOM, and no audit.
 *
 * Tool descriptions are part of the attack surface — a server that changes what
 * a tool CLAIMS to do is the tool-poisoning pattern, and it changes agent
 * behaviour without changing a single line of the agent's own code. Reading
 * live descriptions would mean executing each server, which this scanner will
 * not do; it hashes the server's entrypoint instead, which is an honest offline
 * proxy for "is this the same server it was yesterday".
 *
 * Invariant: environment VALUES are never recorded or reported. Server configs
 * routinely hold API keys, and a security report that quotes the secret is the
 * leak.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function hashContent(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

/** Absolute path of a server's entrypoint, when it can be determined statically. */
export function entrypointOf(config) {
  const args = config.args || [];
  const fileArg = args.find(a => typeof a === 'string' && /\.(mjs|js|cjs|py|ts)$/.test(a));
  return fileArg || null;
}

/**
 * Inventory every configured MCP server.
 *
 * @returns {{ servers: Array, errors: Array }}
 */
export function inventory({ home = homedir(), existsFn, readFn, readdirFn, statFn } = {}) {
  const exists = existsFn || ((p) => existsSync(p));
  const read = readFn || ((p) => readFileSync(p, 'utf8'));
  const readdir = readdirFn || ((p) => readdirSync(p));
  const stat = statFn || ((p) => statSync(p));

  const servers = [];
  const errors = [];

  const record = (name, config, source, extra = {}) => {
    const entrypoint = entrypointOf(config || {});
    let entrypointHash = null;
    let entrypointExists = null;

    if (entrypoint) {
      entrypointExists = exists(entrypoint);
      if (entrypointExists) {
        try { entrypointHash = hashContent(read(entrypoint)); }
        catch (err) { errors.push(`${name}: entrypoint unreadable (${err.message})`); }
      }
    }

    servers.push({
      name,
      source,
      transport: (config && config.type) || (config && config.url ? 'http' : 'unknown'),
      command: (config && config.command) || null,
      // Names only. Values are secrets by default and are never recorded.
      envKeys: Object.keys((config && config.env) || {}).sort(),
      url: (config && config.url) || null,
      entrypoint,
      entrypointExists,
      entrypointHash,
      ...extra,
    });
  };

  // 1. Global + project-scoped servers in ~/.claude.json
  const claudeJson = join(home, '.claude.json');
  if (exists(claudeJson)) {
    try {
      const cfg = JSON.parse(read(claudeJson));
      for (const [name, config] of Object.entries(cfg.mcpServers || {})) {
        record(name, config, 'user:.claude.json');
      }
      for (const [projectPath, project] of Object.entries(cfg.projects || {})) {
        for (const [name, config] of Object.entries((project && project.mcpServers) || {})) {
          record(name, config, `project:${projectPath}`);
        }
      }
    } catch (err) {
      errors.push(`.claude.json unreadable: ${err.message}`);
    }
  }

  // 2. Servers vendored under ~/.claude/mcp-servers/
  const serversDir = join(home, '.claude', 'mcp-servers');
  if (exists(serversDir)) {
    let names = [];
    try { names = readdir(serversDir); } catch (err) { errors.push(`mcp-servers unreadable: ${err.message}`); }
    for (const name of names) {
      const dir = join(serversDir, name);
      try { if (!stat(dir).isDirectory()) continue; } catch { continue; }

      // Hash the whole tracked surface, not just one file: a vendored server is
      // a directory of code, any of which runs.
      let hash = null;
      const pkgPath = join(dir, 'package.json');
      let version = null;
      if (exists(pkgPath)) {
        try {
          const pkg = JSON.parse(read(pkgPath));
          version = pkg.version || null;
          const main = pkg.main || 'server.mjs';
          const mainPath = join(dir, main);
          if (exists(mainPath)) hash = hashContent(read(mainPath));
        } catch (err) { errors.push(`${name}: package.json unreadable (${err.message})`); }
      }
      servers.push({
        name, source: 'vendored:~/.claude/mcp-servers', transport: 'stdio',
        command: null, envKeys: [], url: null,
        entrypoint: dir, entrypointExists: true, entrypointHash: hash, version,
      });
    }
  }

  // 3. Installed plugins — same reach, different packaging.
  const pluginsPath = join(home, '.claude', 'plugins', 'installed_plugins.json');
  if (exists(pluginsPath)) {
    try {
      const data = JSON.parse(read(pluginsPath));
      for (const [name, installs] of Object.entries(data.plugins || {})) {
        for (const inst of (Array.isArray(installs) ? installs : [installs])) {
          servers.push({
            name, source: 'plugin', transport: 'plugin', command: null, envKeys: [], url: null,
            entrypoint: inst.installPath || null, entrypointExists: null,
            entrypointHash: inst.gitCommitSha ? inst.gitCommitSha.slice(0, 16) : null,
            version: inst.version || null,
            pinned: Boolean(inst.gitCommitSha),
          });
        }
      }
    } catch (err) {
      errors.push(`installed_plugins.json unreadable: ${err.message}`);
    }
  }

  return { servers, errors };
}

/**
 * Compare the inventory against the recorded baseline.
 *
 * @param {Array} servers    from inventory()
 * @param {object} baseline  { servers: { name: { entrypointHash, version, ... } } }
 */
export function auditMcp(servers, baseline, { repo = 'mcp', errors = [] } = {}) {
  const findings = [];
  const known = (baseline && baseline.servers) || {};
  const isFirstRun = Object.keys(known).length === 0;

  for (const s of servers) {
    const id = `${s.source}:${s.name}`;
    const before = known[id];

    if (!before) {
      if (!isFirstRun) {
        findings.push({
          scanner: 'mcp-inventory', severity: 'medium', repo, subject: s.name,
          summary: `new MCP server configured: ${s.name}`,
          detail: `Source: ${s.source}. Transport: ${s.transport}. An MCP server is arbitrary code with tool-call reach into an agent that can write files and run commands.`,
          evidence: [id, s.entrypoint || '(no static entrypoint)'],
          remedy: 'Confirm this server was added deliberately, then baseline it.',
          source: 'tool',
        });
      }
      continue;
    }

    // The tool-poisoning signal: same server, different code.
    if (before.entrypointHash && s.entrypointHash && before.entrypointHash !== s.entrypointHash) {
      findings.push({
        scanner: 'mcp-inventory', severity: 'high', repo, subject: s.name,
        summary: `MCP server code changed: ${s.name}`,
        detail: `The entrypoint for ${s.name} changed. A server that alters what its tools do — or what they claim to do — changes agent behaviour without any change to the agent.\n  was: ${before.entrypointHash}\n  now: ${s.entrypointHash}`,
        evidence: [id, `${before.entrypointHash} → ${s.entrypointHash}`],
        remedy: 'Diff the server against its previous version before letting agents use it again.',
        source: 'tool',
      });
    }

    // A config that gained env keys gained capability or credentials.
    const newKeys = (s.envKeys || []).filter(k => !(before.envKeys || []).includes(k));
    if (newKeys.length) {
      findings.push({
        scanner: 'mcp-inventory', severity: 'medium', repo, subject: s.name,
        summary: `MCP server ${s.name} gained environment keys: ${newKeys.join(', ')}`,
        detail: 'New environment keys usually mean new credentials or new reach. (Values are deliberately not recorded.)',
        evidence: [id, ...newKeys],
        remedy: 'Confirm the added configuration is intended.',
        source: 'tool',
      });
    }
  }

  // A server that disappears is worth a line too — silent removal of a
  // security-relevant component should not be invisible.
  for (const id of Object.keys(known)) {
    if (!servers.some(s => `${s.source}:${s.name}` === id)) {
      findings.push({
        scanner: 'mcp-inventory', severity: 'low', repo, subject: id,
        summary: `MCP server no longer configured: ${id}`,
        detail: 'Recorded previously, absent now.',
        evidence: [id],
        remedy: 'If this was intentional, re-baseline. If not, find out who removed it.',
        source: 'tool',
      });
    }
  }

  for (const err of errors) {
    findings.push({
      scanner: 'mcp-inventory', severity: 'medium', repo, subject: 'mcp-config',
      summary: 'MCP configuration could not be fully read',
      detail: err,
      evidence: [err],
      remedy: 'Fix the unreadable config — an unreadable config is an unscanned one.',
      source: 'tool',
    });
  }

  return { findings, isFirstRun };
}

/** Shape the inventory for storage as the next baseline. */
export function toBaseline(servers) {
  const out = { servers: {} };
  for (const s of servers) {
    out.servers[`${s.source}:${s.name}`] = {
      entrypointHash: s.entrypointHash, version: s.version || null,
      envKeys: s.envKeys || [], transport: s.transport,
    };
  }
  return out;
}
