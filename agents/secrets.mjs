#!/usr/bin/env node
/**
 * Resolve credentials from a self-hosted VaultWarden via the `bw` CLI,
 * falling back to process.env / .env files.
 *
 * Usage (CLI):
 *   node agents/secrets.mjs get <NAME>
 *
 * Output:
 *   The credential value is written to stdout on success (exit 0).
 *   On failure (not found anywhere) exits 1 with a message on stderr.
 *
 * Values are NEVER logged or written to disk in plain view.
 * Warning messages name the source but never the value.
 *
 * Exported API:
 *   getCredential(name)  →  string|null
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Session state  (in-memory only — never written to disk)
// ---------------------------------------------------------------------------
let _sessionKey = null;
let _sessionExpiresAt = 0;

/** Return the session TTL in seconds. Read at runtime so env changes take effect. */
function ttlSeconds() {
  return parseInt(process.env.BW_SESSION_TTL ?? '3600', 10);
}

// ---------------------------------------------------------------------------
// env / .env resolution  (mirrors model-manager.mjs resolveProviderKey)
// ---------------------------------------------------------------------------

/** Candidate .env file paths in priority order. */
function envFilePaths() {
  return [
    join(process.cwd(), '.env'),
    join(homedir(), '.hermes-drain', '.env'),
    join(homedir(), '.hermes', '.env'),
  ].filter(Boolean);
}

/** Escape a string for use in a regex literal. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a value from process.env first, then from .env files.
 * Caches into process.env on success.
 * @param {string} name
 * @returns {string|null}
 */
function resolveFromEnv(name) {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  for (const path of envFilePaths()) {
    try {
      if (!existsSync(path)) continue;
      const m = readFileSync(path, 'utf8').match(new RegExp(`^${escapeRegex(name)}=(.+)$`, 'm'));
      if (!m) continue;
      const val = m[1].trim().replace(/^["']|["']$/g, '');
      if (!val) continue;
      process.env[name] = val; // cache for the rest of this run
      return val;
    } catch {
      continue; // unreadable file is not an error
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// VaultWarden via `bw` CLI
// ---------------------------------------------------------------------------

/** Check whether the `bw` binary exists on PATH. */
function hasBw() {
  try {
    execFileSync('bw', ['--version'], { encoding: 'utf8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Overridable clock — lets tests advance time without sleep. */
function _now() {
  return Date.now();
}

/** Open a fresh VaultWarden session via unlock or login. */
function refreshSession() {
  // Try unlock first (already logged in, just needs master password)
  try {
    const out = execFileSync('bw', ['unlock', '--passwordenv', 'BW_PASSPHRASE', '--raw'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    _sessionKey = out.trim();
    _sessionExpiresAt = _now() + (ttlSeconds() * 1000);
    return _sessionKey;
  } catch {
    // Not in a logged-in state — try login with API key
    try {
      const out = execFileSync('bw', ['login', '--apikey', '--raw'], {
        encoding: 'utf8',
        timeout: 15000,
      });
      _sessionKey = out.trim();
      _sessionExpiresAt = _now() + (ttlSeconds() * 1000);
      return _sessionKey;
    } catch {
      return null;
    }
  }
}

/** Return the current session key, refreshing if expired or absent. */
function getSession() {
  if (_sessionKey && _now() < _sessionExpiresAt) return _sessionKey;
  return refreshSession();
}

/**
 * Fetch a credential from VaultWarden by item name.
 * @param {string} name
 * @returns {string|null}
 */
function getFromVault(name) {
  if (!hasBw()) return null;
  const session = getSession();
  if (!session) return null;

  try {
    // `bw get password <name>` returns just the password string on stdout.
    const out = execFileSync('bw', ['get', 'password', name, '--session', session], {
      encoding: 'utf8',
      timeout: 15000,
    });
    const val = out.trim();
    return val || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Resolve a credential: try VaultWarden via `bw` CLI, fall back to env/.env.
 *
 * @param {string} name  — credential name (e.g. "OPENROUTER_API_KEY")
 * @returns {string|null}
 */
export function getCredential(name) {
  if (!name || !name.trim()) return null;
  name = name.trim();

  // 1. Try VaultWarden via bw CLI
  if (hasBw()) {
    const val = getFromVault(name);
    if (val) {
      console.warn('[secrets] resolved from VaultWarden'); // value NEVER included
      return val;
    }
    // VaultWarden was reachable but didn't have the item — still warn and fall through
    console.warn(`[secrets] VaultWarden unavailable for ${name}, falling back to env`);
  }

  // 2. Fall back to env / .env files
  const val = resolveFromEnv(name);
  if (val) {
    console.warn(`[secrets] resolved ${name} from environment`);
    return val;
  }

  console.error(`[secrets] ${name} not found anywhere`);
  return null;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const args = process.argv.slice(2);
  if (args[0] !== 'get' || !args[1]) {
    console.error('Usage: node agents/secrets.mjs get <NAME>');
    process.exit(1);
  }

  const val = getCredential(args[1]);
  if (val) {
    process.stdout.write(val + '\n');
  } else {
    process.exit(1);
  }
}