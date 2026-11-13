/**
 * Stable node path for generated systemd units.
 *
 * Homebrew resolves `process.execPath` to the version-pinned Cellar path
 * (/home/linuxbrew/.linuxbrew/Cellar/node/25.6.1/bin/node), which vanishes on the next
 * `brew upgrade node` and silently breaks every unit that embedded it. The prefix's
 * `bin/node` symlink survives upgrades, so prefer it when it resolves to the same binary.
 * Node stdlib only.
 */
import { existsSync, realpathSync } from 'node:fs';

const CELLAR = /^(.*)\/Cellar\/node(?:@[^/]+)?\/[^/]+\/bin\/node$/;

export function stableNodePath(execPath = process.execPath, { exists = existsSync, real = realpathSync } = {}) {
  const m = CELLAR.exec(execPath);
  if (!m) return execPath;
  const candidate = `${m[1]}/bin/node`;
  try {
    if (exists(candidate) && real(candidate) === real(execPath)) return candidate;
  } catch { /* fall through to the pinned path: never invent one */ }
  return execPath;
}
