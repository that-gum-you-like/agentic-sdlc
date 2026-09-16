#!/usr/bin/env bash
#
# security-toolchain-install — install the pinned scanner binaries sentinel
# shells out to (openspec: supply-chain-security-program, SCS-REQ-016).
#
# A security scanner is itself a downloaded binary, so this script is
# deliberately paranoid and deliberately boring:
#   * versions are PINNED here, never "latest"
#   * every artifact is verified against the publisher's checksum file BEFORE
#     it is made executable
#   * the verified hash is then recorded in agents/sentinel/toolchain.json, and
#     re-installs must reproduce it (trust-on-first-use lock)
#   * nothing auto-updates — an upgrade is a deliberate, reviewed edit here
#
# Usage:
#   scripts/security-toolchain-install.sh            # install / verify
#   scripts/security-toolchain-install.sh --check    # verify only, no writes
#
# Note: semgrep is intentionally NOT installed. It ships no release binary
# (pip-only) and `--config auto` fetches rules from the semgrep registry, which
# would put code patterns on a third-party service and break the offline rule.
# sentinel's sast.mjs implements its rules natively instead.

set -euo pipefail

OSV_VERSION="2.6.0"
SYFT_VERSION="1.51.1"
GRYPE_VERSION="0.118.0"
GITLEAKS_VERSION="8.30.1"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${SENTINEL_BIN_DIR:-$HOME/.local/bin/sentinel}"
MANIFEST="$REPO_DIR/agents/sentinel/toolchain.json"
OSV_DB_DIR="${SENTINEL_OSV_DB_DIR:-$HOME/.local/share/sentinel/osv-db}"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

# Absolute paths: Homebrew shadows several system tools on this host and the
# failures are SILENT. Never rely on PATH order for these.
CURL=/usr/bin/curl
SHA256SUM=/usr/bin/sha256sum
TAR=/usr/bin/tar
for t in "$CURL" "$SHA256SUM" "$TAR"; do
  [[ -x "$t" ]] || { echo "FATAL: required tool missing: $t" >&2; exit 1; }
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log()  { printf '  %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# fetch <url> <dest>
fetch() {
  "$CURL" -sSfL --max-time 180 --retry 2 -o "$2" "$1" \
    || fail "download failed: $1"
}

# verify <file> <expected-sha256>
verify() {
  local actual
  actual="$("$SHA256SUM" "$1" | cut -d' ' -f1)"
  [[ "$actual" == "$2" ]] || fail "checksum mismatch for $1
    expected $2
    actual   $actual
  Refusing to install. This is either a corrupted download or a compromised artifact."
  printf '%s' "$actual"
}

# expected_hash <tool> <version> — previously locked hash, or empty
expected_hash() {
  [[ -f "$MANIFEST" ]] || return 0
  /usr/bin/jq -r --arg t "$1" --arg v "$2" \
    '.tools[$t] // {} | select(.version == $v) | .sha256 // empty' "$MANIFEST" 2>/dev/null || true
}

declare -A RESULT_PATH RESULT_SHA RESULT_VERSION

# install_tool <name> <version> <asset-url> <checksums-url> <checksum-grep> <archive|raw> [path-in-archive]
install_tool() {
  local name="$1" version="$2" asset_url="$3" sums_url="$4" grep_for="$5" kind="$6" inner="${7:-$1}"
  log "$name $version"

  local asset="$WORK/$name.asset" sums="$WORK/$name.sums"
  fetch "$asset_url" "$asset"
  fetch "$sums_url" "$sums"

  # The publisher's checksum file is the source of truth on first install.
  local want
  want="$(grep -E "$grep_for" "$sums" | head -1 | awk '{print $1}')"
  [[ -n "$want" ]] || fail "$name: no checksum line matching /$grep_for/ in $sums_url"

  local got
  got="$(verify "$asset" "$want")"

  # Trust-on-first-use: once locked, a re-install must reproduce the same hash.
  local locked
  locked="$(expected_hash "$name" "$version")"
  if [[ -n "$locked" && "$locked" != "$got" ]]; then
    fail "$name $version hash changed since it was locked
    locked $locked
    now    $got
  A published artifact changed under a fixed version. Treat as compromise until proven otherwise."
  fi

  local dest="$BIN_DIR/$name"
  if [[ "$CHECK_ONLY" -eq 0 ]]; then
    if [[ "$kind" == "archive" ]]; then
      "$TAR" -xzf "$asset" -C "$WORK" "$inner"
      install -m 0755 "$WORK/$inner" "$dest"
    else
      install -m 0755 "$asset" "$dest"
    fi
    log "  → $dest"
  fi

  RESULT_PATH["$name"]="$dest"
  RESULT_SHA["$name"]="$got"
  RESULT_VERSION["$name"]="$version"
  log "  sha256 $got  ✓"
}

echo "sentinel toolchain $([[ $CHECK_ONLY -eq 1 ]] && echo '(check only)' || echo "→ $BIN_DIR")"
[[ "$CHECK_ONLY" -eq 0 ]] && mkdir -p "$BIN_DIR"

install_tool osv-scanner "$OSV_VERSION" \
  "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_amd64" \
  "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_SHA256SUMS" \
  'osv-scanner_linux_amd64$' raw

install_tool syft "$SYFT_VERSION" \
  "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_amd64.tar.gz" \
  "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_checksums.txt" \
  "syft_${SYFT_VERSION}_linux_amd64.tar.gz$" archive syft

install_tool grype "$GRYPE_VERSION" \
  "https://github.com/anchore/grype/releases/download/v${GRYPE_VERSION}/grype_${GRYPE_VERSION}_linux_amd64.tar.gz" \
  "https://github.com/anchore/grype/releases/download/v${GRYPE_VERSION}/grype_${GRYPE_VERSION}_checksums.txt" \
  "grype_${GRYPE_VERSION}_linux_amd64.tar.gz$" archive grype

install_tool gitleaks "$GITLEAKS_VERSION" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_checksums.txt" \
  "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz$" archive gitleaks

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "✅ all artifacts match their published checksums (nothing written)"
  exit 0
fi

# --- offline OSV database ------------------------------------------------
# osv-scanner --offline needs a local database. Record the fetch date so a
# stale database becomes a finding rather than a silent blind spot.
mkdir -p "$OSV_DB_DIR"
log "OSV database → $OSV_DB_DIR"

# Seeding needs a real lockfile to walk, and osv-scanner exits NON-ZERO when it
# finds vulnerabilities — which is the normal case. So success is judged by
# whether the database actually landed, never by the exit code.
SEED_TARGET=""
for candidate in "$HOME/personal-website" "$HOME/nels-workshop" "$HOME/tally"; do
  [[ -f "$candidate/package-lock.json" ]] && { SEED_TARGET="$candidate"; break; }
done

OSV_DB_FETCHED=""
if [[ -n "$SEED_TARGET" ]]; then
  "$BIN_DIR/osv-scanner" scan source --offline --download-offline-databases \
      --local-db-path "$OSV_DB_DIR" "$SEED_TARGET" >/dev/null 2>&1 || true
  if [[ -n "$(find "$OSV_DB_DIR" -name '*.zip' -o -name '*.db' -o -type d -name 'osv-scalibr' 2>/dev/null | head -1)" ]]; then
    OSV_DB_FETCHED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "  seeded ($(du -sh "$OSV_DB_DIR" 2>/dev/null | cut -f1)) from $(basename "$SEED_TARGET")"
  else
    log "  ⚠ database did not land — sentinel will report this as a finding"
  fi
else
  log "  ⚠ no lockfile repo available to seed from — sentinel will report staleness"
fi

# --- manifest ------------------------------------------------------------
{
  printf '{\n'
  printf '  "_comment": "Generated by scripts/security-toolchain-install.sh. Absolute paths only — PATH is not trustworthy on this host. Hashes are a trust-on-first-use lock; a mismatch on re-install is treated as compromise.",\n'
  printf '  "generatedAt": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "osvDbPath": "%s",\n' "$OSV_DB_DIR"
  printf '  "osvDbFetchedAt": "%s",\n' "$OSV_DB_FETCHED"
  printf '  "tools": {\n'
  first=1
  for name in osv-scanner syft grype gitleaks; do
    [[ $first -eq 0 ]] && printf ',\n'
    first=0
    printf '    "%s": { "path": "%s", "version": "%s", "sha256": "%s" }' \
      "$name" "${RESULT_PATH[$name]}" "${RESULT_VERSION[$name]}" "${RESULT_SHA[$name]}"
  done
  printf '\n  }\n}\n'
} > "$MANIFEST"

echo "✅ toolchain installed; manifest at $MANIFEST"
