/**
 * sentinel/semver-lite — just enough semver to decide "is this version affected".
 *
 * openspec: supply-chain-security-program (SCS-REQ-040)
 *
 * Deliberately dependency-free. agentic-sdlc has no lockfile, and that is a
 * security property worth keeping: the repo with the widest blast radius has
 * the smallest supply chain. Adding an npm dependency to the supply-chain
 * scanner would be self-defeating.
 *
 * Handles the range forms GitHub's advisory database actually emits:
 *   "< 1.2.3"   ">= 1.0.0, < 1.2.3"   "= 1.0.0"   "<= 2.0.0"
 */

/** Parse a version into comparable parts. Prerelease sorts below release. */
export function parseVersion(v) {
  const clean = String(v || '').trim().replace(/^[v=]+/, '');
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.*))?$/.exec(clean);
  if (!m) return null;
  return {
    major: Number(m[1] || 0),
    minor: Number(m[2] || 0),
    patch: Number(m[3] || 0),
    pre: m[4] || null,
  };
}

/** -1 | 0 | 1, or null when either side is unparseable. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  if (pa.pre && !pb.pre) return -1;   // 1.0.0-rc < 1.0.0
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre === pb.pre ? 0 : (pa.pre < pb.pre ? -1 : 1);
  return 0;
}

/** Does `version` satisfy a single comparator like "< 1.2.3"? */
export function satisfiesComparator(version, comparator) {
  const m = /^\s*(>=|<=|>|<|=)?\s*(.+?)\s*$/.exec(String(comparator || ''));
  if (!m) return null;
  const op = m[1] || '=';
  const cmp = compareVersions(version, m[2]);
  if (cmp === null) return null;
  switch (op) {
    case '<':  return cmp < 0;
    case '<=': return cmp <= 0;
    case '>':  return cmp > 0;
    case '>=': return cmp >= 0;
    case '=':  return cmp === 0;
    default:   return null;
  }
}

/**
 * Does `version` fall inside a comma-separated range (AND semantics)?
 *
 * Returns null when the range cannot be understood — the caller must treat that
 * as "unknown", never as "not affected". Silently deciding a package is clean
 * because a string did not parse is the exact failure this layer exists to
 * prevent.
 */
export function satisfiesRange(version, range) {
  if (!range) return null;
  const parts = String(range).split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  let result = true;
  for (const part of parts) {
    const ok = satisfiesComparator(version, part);
    if (ok === null) return null;
    result = result && ok;
  }
  return result;
}
