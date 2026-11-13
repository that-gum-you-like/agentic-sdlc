/**
 * Shared ownership helpers (RS-REQ-040/043 invariant: doctor and update share one helper).
 * Read-only: nothing here modifies the filesystem or escalates privilege.
 * Node stdlib only.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function currentUid() {
  if (process.env.SDLC_TEST_UID) return Number(process.env.SDLC_TEST_UID);
  return process.getuid?.() ?? -1;
}

/** uid -> user name via /etc/passwd (no shelling out); falls back to the number. */
export function ownerName(uid, passwdText) {
  try {
    const text = passwdText ?? readFileSync('/etc/passwd', 'utf8');
    for (const line of text.split('\n')) {
      const p = line.split(':');
      if (p.length > 2 && Number(p[2]) === uid) return p[0];
    }
  } catch { /* no passwd: fall through */ }
  return String(uid);
}

/** The exact command a human can run (never run by the framework). */
export function chownCommand(path, user) {
  return `sudo chown -R ${user}:${user} ${shellQuote(path)}`;
}

function shellQuote(p) { return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`; }

/**
 * Walk `root` and report entries not owned by `uid`, plus entries that could not be read.
 * `.git/objects` internals and node_modules are not descended into (their top directory is still checked).
 * `fs` is injectable: { lstat(path) -> {uid,isDirectory()}, readdir(path) -> string[] }.
 */
export function findForeignPaths(root, { uid = currentUid(), fs = { lstat: lstatSync, readdir: readdirSync }, skipDirs = ['node_modules'] } = {}) {
  const foreign = [];
  const unreadable = [];
  const walk = dir => {
    let names;
    try { names = fs.readdir(dir); } catch (e) { unreadable.push({ path: relative(root, dir) || '.', error: e.code || String(e) }); return; }
    for (const name of names) {
      const full = join(dir, name);
      let st;
      try { st = fs.lstat(full); } catch (e) { unreadable.push({ path: relative(root, full), error: e.code || String(e) }); continue; }
      const rel = relative(root, full);
      let isForeign = false;
      if (st.uid !== uid) { foreign.push({ path: rel, uid: st.uid, dir: st.isDirectory() }); isForeign = true; }
      if (!st.isDirectory()) continue;
      if (skipDirs.includes(name) || rel === join('.git', 'objects')) continue;
      if (isForeign && st.isDirectory()) continue; // report the topmost foreign dir, not each child
      walk(full);
    }
  };
  walk(root);
  return { foreign, unreadable };
}

/** Is a single path (or its nearest existing parent) foreign-owned? Returns uid or null. */
export function foreignOwnerOf(path, { uid = currentUid(), lstat = lstatSync } = {}) {
  let p = path;
  for (let i = 0; i < 64; i++) {
    try { const st = lstat(p); return st.uid !== uid ? st.uid : null; } catch { /* try parent */ }
    const parent = join(p, '..');
    if (parent === p) return null;
    p = parent;
  }
  return null;
}
