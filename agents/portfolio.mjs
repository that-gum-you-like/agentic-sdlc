#!/usr/bin/env node
/**
 * portfolio.mjs — the roster of projects, clients, and their environments.
 *
 *   node agents/portfolio.mjs list [--json]
 *   node agents/portfolio.mjs show <name>
 *   node agents/portfolio.mjs add <name> --owner self|client [--client X] [--stage S] ...
 *   node agents/portfolio.mjs set <name> <key> <value>
 *   node agents/portfolio.mjs status            # read-only report, writes nothing
 *   node agents/portfolio.mjs validate          # exit 0 conforming, 1 otherwise
 *
 * Source of truth: portfolio.json at the REPO ROOT — versioned in git, because
 * `pm/` is gitignored and the roster must survive a machine rebuild. Contains
 * NO credential values; environments name credential VARIABLES only.
 *
 * Spec: openspec/changes/business-os/specs/portfolio-registry.md (REQ-001..005)
 * Supersedes level-6-autonomous-activation T-103/T-104 (`projects.json`).
 *
 * Zero npm dependencies. Exports every verb for tests; CLI is __isMainModule
 * guarded per non-negotiable rule #9.
 */

import fs from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const REPO_ROOT = resolve(__dirname, '..');
export const PORTFOLIO_PATH = process.env.PORTFOLIO_PATH || join(REPO_ROOT, 'portfolio.json');

export const OWNERS = Object.freeze(['self', 'client']);
export const STAGES = Object.freeze(['idea', 'design', 'build', 'live', 'maintenance', 'parked']);
export const TIERS = Object.freeze(['scratch', 'internal-production', 'customer-production']);
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}$/;
const VAR_RE = /^[A-Z][A-Z0-9_]*$/;

const SETTABLE = Object.freeze([
  'description', 'owner', 'client', 'repo', 'path', 'liveUrl', 'stage', 'enabled', 'cadence',
]);

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/** Read the portfolio. Throws a named error rather than a stack trace. */
export function load(path = PORTFOLIO_PATH) {
  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`portfolio not found at ${path}`);
    throw new Error(`portfolio unreadable at ${path}: ${err.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new Error(`portfolio is not valid JSON (${path}): ${err.message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('portfolio must be a JSON object');
  }
  if (!Array.isArray(doc.projects)) {
    throw new Error('portfolio must have a "projects" array');
  }
  return doc;
}

function save(doc, path = PORTFOLIO_PATH) {
  fs.writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Validation — the commit-time half of the fail-closed guarantee (REQ-003)
// ---------------------------------------------------------------------------

/** @returns {string[]} human-readable problems; empty means conforming. */
export function validate(doc) {
  const errors = [];
  const push = (p, m) => errors.push(`${p}: ${m}`);

  if (doc.version !== 1) push('portfolio', `unsupported version ${JSON.stringify(doc.version)} (expected 1)`);

  const seen = new Set();
  for (const [i, p] of (doc.projects || []).entries()) {
    const at = p && p.name ? `project "${p.name}"` : `projects[${i}]`;
    if (!p || typeof p !== 'object') { push(at, 'must be an object'); continue; }

    if (!p.name) push(at, 'missing required field "name"');
    else if (!NAME_RE.test(p.name)) push(at, `name "${p.name}" must be kebab-case (^[a-z0-9][a-z0-9-]{0,38}$)`);
    else if (seen.has(p.name)) push(at, `duplicate name "${p.name}"`);
    if (p.name) seen.add(p.name);

    if (!p.owner) push(at, 'missing required field "owner"');
    else if (!OWNERS.includes(p.owner)) push(at, `owner "${p.owner}" must be one of ${OWNERS.join(', ')}`);
    if (p.owner === 'client' && !(typeof p.client === 'string' && p.client.trim())) {
      push(at, 'owner is "client" so a non-empty "client" name is required');
    }

    if (!p.stage) push(at, 'missing required field "stage"');
    else if (!STAGES.includes(p.stage)) push(at, `stage "${p.stage}" must be one of ${STAGES.join(', ')}`);

    if (p.enabled !== undefined && typeof p.enabled !== 'boolean') push(at, '"enabled" must be a boolean');

    if (p.environments !== undefined) {
      if (!Array.isArray(p.environments)) { push(at, '"environments" must be an array'); continue; }
      const envSeen = new Set();
      for (const [j, e] of p.environments.entries()) {
        const eat = `${at} env ${e && e.name ? `"${e.name}"` : `[${j}]`}`;
        if (!e || typeof e !== 'object') { push(eat, 'must be an object'); continue; }
        if (!e.name) push(eat, 'missing required field "name"');
        else if (envSeen.has(e.name)) push(eat, `duplicate environment name "${e.name}"`);
        if (e.name) envSeen.add(e.name);

        // The single most important check in this file. No default tier exists:
        // env-guard denies on anything it cannot positively identify, and this
        // is what stops a forgotten tier reaching runtime in the first place.
        if (e.tier === undefined || e.tier === null || e.tier === '') {
          push(eat, 'missing required field "tier" — there is no default; add scratch | internal-production | customer-production');
        } else if (!TIERS.includes(e.tier)) {
          push(eat, `tier "${e.tier}" is not recognized (exact match required — case variants are rejected); use one of ${TIERS.join(', ')}`);
        }

        if (e.credentialVars !== undefined) {
          if (!Array.isArray(e.credentialVars)) push(eat, '"credentialVars" must be an array');
          else for (const v of e.credentialVars) {
            if (typeof v !== 'string' || !VAR_RE.test(v)) {
              push(eat, `credentialVars entry ${JSON.stringify(v)} must be a variable NAME (^[A-Z][A-Z0-9_]*$), never a value`);
            }
          }
        }
        if (e.agentWritable !== undefined && typeof e.agentWritable !== 'boolean') push(eat, '"agentWritable" must be a boolean');
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

export function list(doc) {
  return (doc.projects || []).map((p) => ({
    name: p.name,
    owner: p.owner,
    client: p.client || null,
    stage: p.stage,
    enabled: Boolean(p.enabled),
    environments: (p.environments || []).map((e) => ({ name: e.name, tier: e.tier })),
  }));
}

export function show(doc, name) {
  const p = (doc.projects || []).find((x) => x.name === name);
  if (!p) throw new Error(`no such project "${name}"`);
  return p;
}

export function add(doc, project) {
  if (!project || !project.name) throw new Error('add requires a project name');
  if ((doc.projects || []).some((p) => p.name === project.name)) {
    throw new Error(`project "${project.name}" already exists — use set to modify it`);
  }
  const next = { ...doc, projects: [...(doc.projects || []), project] };
  const errors = validate(next);
  if (errors.length) throw new Error(`refusing to add — ${errors.join('; ')}`);
  return next;
}

export function set(doc, name, key, value) {
  if (!SETTABLE.includes(key)) {
    throw new Error(`"${key}" is not settable; one of ${SETTABLE.join(', ')}`);
  }
  const idx = (doc.projects || []).findIndex((p) => p.name === name);
  if (idx === -1) throw new Error(`no such project "${name}"`);
  let v = value;
  if (key === 'enabled') {
    if (v === 'true' || v === true) v = true;
    else if (v === 'false' || v === false) v = false;
    else throw new Error('"enabled" must be true or false');
  }
  const projects = doc.projects.map((p, i) => (i === idx ? { ...p, [key]: v } : p));
  const next = { ...doc, projects };
  const errors = validate(next);
  if (errors.length) throw new Error(`refusing to set — ${errors.join('; ')}`);
  return next;
}

export function status(doc) {
  const projects = doc.projects || [];
  const envs = projects.flatMap((p) => p.environments || []);
  const byTier = Object.fromEntries(TIERS.map((t) => [t, envs.filter((e) => e.tier === t).length]));
  return {
    projects: projects.length,
    byOwner: {
      self: projects.filter((p) => p.owner === 'self').length,
      client: projects.filter((p) => p.owner === 'client').length,
    },
    clients: [...new Set(projects.filter((p) => p.owner === 'client').map((p) => p.client))].sort(),
    drainEnabled: projects.filter((p) => p.enabled).length,
    environments: envs.length,
    byTier,
    untiered: envs.filter((e) => !TIERS.includes(e.tier)).length,
    missingPath: projects.filter((p) => p.path && p.stage !== 'parked' && !fs.existsSync(p.path)).map((p) => p.name),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export function main(argv) {
  const [verb, ...rest] = argv;
  const flags = parseFlags(rest);

  if (!verb || verb === 'help' || flags.help) {
    console.log('usage: portfolio.mjs list [--json] | show <name> | add <name> --owner … | set <name> <key> <value> | status | validate');
    return 0;
  }

  if (verb === 'validate') {
    let doc;
    try { doc = load(); } catch (err) { console.error(`✖ ${err.message}`); return 1; }
    const errors = validate(doc);
    if (errors.length) {
      console.error(`✖ portfolio.json has ${errors.length} problem(s):`);
      for (const e of errors) console.error(`  - ${e}`);
      return 1;
    }
    console.log(`✅ portfolio.json is valid — ${doc.projects.length} project(s)`);
    return 0;
  }

  let doc;
  try { doc = load(); } catch (err) { console.error(`✖ ${err.message}`); return 1; }

  try {
    switch (verb) {
      case 'list': {
        const rows = list(doc);
        if (flags.json) { console.log(JSON.stringify(rows, null, 2)); return 0; }
        if (!rows.length) { console.log('(portfolio is empty)'); return 0; }
        const w = Math.max(...rows.map((r) => r.name.length), 4);
        console.log(`${'NAME'.padEnd(w)}  ${'OWNER'.padEnd(7)} ${'STAGE'.padEnd(12)} DRAIN  ENVIRONMENTS`);
        for (const r of rows) {
          const owner = r.owner === 'client' ? `client` : 'self';
          const envs = r.environments.map((e) => `${e.name}:${e.tier}`).join(' ') || '—';
          const who = r.client ? ` (${r.client})` : '';
          console.log(`${r.name.padEnd(w)}  ${owner.padEnd(7)} ${String(r.stage).padEnd(12)} ${r.enabled ? 'on ' : 'off'}    ${envs}${who}`);
        }
        return 0;
      }
      case 'show': {
        const name = rest.find((a) => !a.startsWith('--'));
        console.log(JSON.stringify(show(doc, name), null, 2));
        return 0;
      }
      case 'add': {
        const name = rest.find((a) => !a.startsWith('--'));
        const project = {
          name,
          owner: flags.owner || 'self',
          stage: flags.stage || 'idea',
        };
        for (const k of ['description', 'client', 'repo', 'path', 'liveUrl', 'cadence']) {
          if (flags[k]) project[k] = flags[k];
        }
        if (flags.enabled !== undefined) project.enabled = flags.enabled === 'true' || flags.enabled === true;
        save(add(doc, project));
        console.log(`✅ added ${name}`);
        return 0;
      }
      case 'set': {
        const positional = rest.filter((a) => !a.startsWith('--'));
        const [name, key, ...valueParts] = positional;
        save(set(doc, name, key, valueParts.join(' ')));
        console.log(`✅ ${name}.${key} = ${valueParts.join(' ')}`);
        return 0;
      }
      case 'status': {
        // Read-only by contract: this branch must never write.
        console.log(JSON.stringify(status(doc), null, 2));
        return 0;
      }
      default:
        console.error(`unknown verb "${verb}"`);
        return 1;
    }
  } catch (err) {
    console.error(`✖ ${err.message}`);
    return 1;
  }
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  process.exit(main(process.argv.slice(2)));
}
