#!/usr/bin/env node
/**
 * checkout-doctor — container-mount section (RS-REQ-064).
 *
 * Inspects running `hermes-*` Docker containers and reports any whose Mounts
 * include the human home, an ancestor, or a live checkout with RW: true.
 * Read-only; docker missing or no containers is a note, never a failure.
 * (Other doctor sections are added by RS-301.)
 */
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exposureReason, discoverCheckouts } from './hermes-config-guard.mjs';

export const CONTAINER_FIX = 'stop and recreate with a dedicated workspace (~/.hermes/workspaces/<project>), docker_mount_cwd_to_workspace: false';

/** Default docker runner: returns parsed `docker inspect` JSON for running hermes-* containers; throws if docker is unavailable. */
export function dockerRunner() {
  const ids = execFileSync('docker', ['ps', '--filter', 'name=hermes-', '--format', '{{.ID}}'], { encoding: 'utf8', timeout: 10000 }).split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', timeout: 10000 }));
}

/**
 * @param {{run?: () => object[], home?: string, checkouts?: string[]}} opts  run is injectable
 * @returns {{containers: string[], exposed: Array<{container: string, name: string, source: string, destination: string, reason: string, fix: string}>, notes: string[]}}
 */
export function checkContainerMounts({ run = dockerRunner, home = homedir(), checkouts = discoverCheckouts(home) } = {}) {
  let inspected;
  try { inspected = run(); } catch (e) { return { containers: [], exposed: [], notes: [`docker unavailable: ${String(e.message).split('\n')[0]}`] }; }
  const list = Array.isArray(inspected) ? inspected : [];
  if (!list.length) return { containers: [], exposed: [], notes: ['no hermes containers running'] };
  const exposed = [];
  for (const c of list) {
    for (const m of c.Mounts || []) {
      if (!m.RW || !m.Source) continue;
      const reason = exposureReason(m.Source, { home, checkouts });
      if (reason) exposed.push({ container: String(c.Id || '').slice(0, 12), name: String(c.Name || '').replace(/^\//, ''), source: m.Source, destination: m.Destination, reason, fix: CONTAINER_FIX });
    }
  }
  const containers = list.map(c => String(c.Id || '').slice(0, 12)).sort();
  return { containers, exposed, notes: [] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = checkContainerMounts();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ containerMounts: r }, null, 2));
  else {
    for (const n of r.notes) console.log(`checkout-doctor: ${n}`);
    for (const e of r.exposed) console.error(`FAIL ${e.name} (${e.container}) mounts ${e.source} -> ${e.destination} rw (${e.reason}); ${e.fix}`);
    if (!r.exposed.length && !r.notes.length) console.log('checkout-doctor: container mounts clean');
  }
  process.exit(r.exposed.length ? 1 : 0);
}
