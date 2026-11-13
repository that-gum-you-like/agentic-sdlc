#!/usr/bin/env node
/**
 * Hermes cron guard — flags enabled gateway cron jobs that cannot work.
 *
 * Gateway cron prompts run through an agent whose terminal is a Docker sandbox:
 * host paths (/home/<user>/...) do not exist there, `cd` fails, and the run is
 * still recorded `ok` (the LLM shrugs it off). That is silent failure. This
 * guard makes it LOUD: exit 1 and list every enabled, agent-driven job whose
 * prompt references a host home path without a `workdir`/`script` that makes it valid.
 * The host-side drain is sdlc-drain-supervisor.service — never a gateway cron job.
 *
 * Usage: node agents/hermes-cron-guard.mjs [path/to/jobs.json]
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_PATH = /(?:\/home\/[A-Za-z0-9_.-]+|~)\/[A-Za-z0-9_.\-/]+/g;

export function findHostPathJobs(jobs) {
  const bad = [];
  for (const j of jobs || []) {
    if (!j || j.enabled === false || j.state === 'paused') continue;
    if (j.no_agent || j.script) continue; // script jobs run on the host, not in the sandbox
    const paths = [...new Set(String(j.prompt || '').match(HOST_PATH) || [])];
    if (paths.length) bad.push({ id: j.id, name: j.name, paths });
  }
  return bad;
}

export function loadJobs(file) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(d) ? d : d.jobs || [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] || join(homedir(), '.hermes/cron/jobs.json');
  const bad = findHostPathJobs(loadJobs(file));
  for (const b of bad) {
    console.error(`FAIL hermes cron ${b.name} (${b.id}) references host paths that do not exist in the Docker sandbox: ${b.paths.join(', ')}`);
    console.error(`  fix: hermes cron pause ${b.id}  (drain runs via sdlc-drain-supervisor.service)`);
  }
  if (!bad.length) console.log('hermes-cron-guard: ok');
  process.exit(bad.length ? 1 : 0);
}
