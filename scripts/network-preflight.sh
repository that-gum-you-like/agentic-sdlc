#!/usr/bin/env bash
#
# network-preflight.sh — fix the IPv6-blackhole + flaky-router-DNS failure mode.
#
# WHY THIS EXISTS
#   openrouter.ai and api.telegram.org both publish AAAA records. When this
#   host has no IPv6 default route, glibc's default RFC 6724 precedence table
#   still *prefers* IPv6, so IPv6-preferring HTTP stacks (Python httpx, which
#   the Hermes Telegram adapter uses) try the AAAA address first and fail
#   instantly with ENETUNREACH. That surfaces as
#       telegram.error.NetworkError: httpx.ConnectError: All connection attempts failed
#   which reads as "the provider is down" and is not. Separately, resolving via
#   the router alone produces intermittent
#       [Errno -3] Temporary failure in name resolution
#
#   `node agents/net-doctor.mjs` diagnoses both; this script fixes both.
#
# WHAT IT CHANGES (each applied only if needed, each idempotent + reversible)
#   1. /etc/gai.conf — appends `precedence ::ffff:0:0/96 100`, raising
#      IPv4-mapped destinations above IPv6 so getaddrinfo returns A records
#      first. Deliberately NOT `disable_ipv6`: this is scoped to destination
#      selection, so Tailscale IPv6 (fd7a:115c:a1e0::/48) and link-local
#      traffic keep working.
#   2. systemd-resolved drop-in — puts 1.1.1.1 / 9.9.9.9 ahead of the router.
#      Written as a drop-in, never by editing /etc/resolv.conf, which resolved
#      owns and rewrites.
#
# THIS SCRIPT IS FOR A HUMAN TO RUN. It needs root, and per the framework
# guardrails no agent, cron job, or timer may ever invoke it or any other sudo
# command — an agent hitting a permission error stops and reports. net-doctor
# surfaces this path as text only.
#
# USAGE
#   sudo bash scripts/network-preflight.sh            # apply
#   bash scripts/network-preflight.sh --check         # diagnose, write nothing
#   sudo bash scripts/network-preflight.sh --revert   # restore latest backups
#
set -euo pipefail

GAI_CONF=/etc/gai.conf
RESOLVED_DROPIN_DIR=/etc/systemd/resolved.conf.d
RESOLVED_DROPIN="${RESOLVED_DROPIN_DIR}/10-agentic-sdlc-dns.conf"
MARKER='# agentic-sdlc: prefer IPv4 (no IPv6 default route on this host)'
PRECEDENCE_RULE='precedence ::ffff:0:0/96 100'
PUBLIC_RESOLVERS='1.1.1.1 9.9.9.9'

MODE=apply
case "${1:-}" in
  --check)  MODE=check ;;
  --revert) MODE=revert ;;
  "")       MODE=apply ;;
  *) echo "usage: $0 [--check|--revert]" >&2; exit 2 ;;
esac

info() { printf '  %s\n' "$*"; }
ok()   { printf '  [ok] %s\n' "$*"; }
act()  { printf '  [changed] %s\n' "$*"; }
need() { printf '  [needs fix] %s\n' "$*"; }

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "This mode needs root. Re-run: sudo bash $0 ${1:-}" >&2
    exit 1
  fi
}

# Timestamped backup, taken once per run per file. Never overwrites an existing
# backup, so repeated runs can't clobber the pristine original.
backup_file() {
  local f=$1
  [[ -e "$f" ]] || return 0
  local stamp
  stamp=$(date +%Y%m%d-%H%M%S)
  cp -a "$f" "${f}.bak.${stamp}"
  info "backed up ${f} -> ${f}.bak.${stamp}"
}

latest_backup() {
  local f=$1
  ls -1t "${f}".bak.* 2>/dev/null | head -1 || true
}

# --- state probes (read-only) ----------------------------------------------

has_ipv6_default_route() { [[ -n "$(ip -6 route show default 2>/dev/null)" ]]; }
gai_precedence_applied() { grep -qF "$PRECEDENCE_RULE" "$GAI_CONF" 2>/dev/null; }
resolved_in_use()        { [[ "$(readlink -f /etc/resolv.conf 2>/dev/null)" == *systemd* ]] || grep -q '127.0.0.53' /etc/resolv.conf 2>/dev/null; }
dropin_applied()         { [[ -f "$RESOLVED_DROPIN" ]]; }

# --- report -----------------------------------------------------------------

echo "network-preflight (${MODE})"
echo

problems=0

if has_ipv6_default_route; then
  ok "IPv6 default route present — the blackhole condition does not apply"
  gai_needed=0
else
  if gai_precedence_applied; then
    ok "no IPv6 default route, but ${GAI_CONF} already prefers IPv4"
    gai_needed=0
  else
    need "no IPv6 default route and ${GAI_CONF} has no IPv4 precedence rule"
    info "     -> AAAA-publishing hosts will fail with ENETUNREACH"
    gai_needed=1
    problems=$((problems + 1))
  fi
fi

if dropin_applied; then
  ok "resolver drop-in already present at ${RESOLVED_DROPIN}"
  dns_needed=0
elif resolved_in_use; then
  need "resolution goes through the router only; no public-resolver fallback"
  dns_needed=1
  problems=$((problems + 1))
else
  info "systemd-resolved not in use — skipping the resolver drop-in"
  info "     (add ${PUBLIC_RESOLVERS} to your resolver config by hand if DNS is flaky)"
  dns_needed=0
fi

echo

# --- modes ------------------------------------------------------------------

if [[ $MODE == check ]]; then
  if [[ $problems -eq 0 ]]; then
    echo "Nothing to fix."
    exit 0
  fi
  echo "${problems} item(s) need fixing. Apply with: sudo bash $0"
  exit 1
fi

if [[ $MODE == revert ]]; then
  require_root --revert
  reverted=0

  gai_bak=$(latest_backup "$GAI_CONF")
  if [[ -n "$gai_bak" ]]; then
    cp -a "$gai_bak" "$GAI_CONF"
    act "restored ${GAI_CONF} from ${gai_bak}"
    reverted=$((reverted + 1))
  else
    # No backup means we appended to a file we never had to back up, or nothing
    # was ever applied. Strip our marker block if it's there.
    if gai_precedence_applied; then
      sed -i "\|${MARKER}|,+1d" "$GAI_CONF"
      act "removed the agentic-sdlc precedence block from ${GAI_CONF}"
      reverted=$((reverted + 1))
    fi
  fi

  if [[ -f "$RESOLVED_DROPIN" ]]; then
    rm -f "$RESOLVED_DROPIN"
    act "removed ${RESOLVED_DROPIN}"
    systemctl restart systemd-resolved 2>/dev/null || info "restart systemd-resolved manually"
    reverted=$((reverted + 1))
  fi

  echo
  [[ $reverted -eq 0 ]] && echo "Nothing to revert." || echo "Reverted ${reverted} item(s)."
  exit 0
fi

# apply
if [[ $problems -eq 0 ]]; then
  echo "Nothing to fix."
  exit 0
fi

require_root

if [[ $gai_needed -eq 1 ]]; then
  backup_file "$GAI_CONF"
  printf '\n%s\n%s\n' "$MARKER" "$PRECEDENCE_RULE" >> "$GAI_CONF"
  act "appended IPv4 precedence rule to ${GAI_CONF}"
fi

if [[ $dns_needed -eq 1 ]]; then
  mkdir -p "$RESOLVED_DROPIN_DIR"
  cat > "$RESOLVED_DROPIN" <<EOF
${MARKER}
# Public resolvers ahead of the router, which intermittently returns
# "Temporary failure in name resolution" under load.
[Resolve]
DNS=${PUBLIC_RESOLVERS}
FallbackDNS=8.8.8.8
EOF
  act "wrote ${RESOLVED_DROPIN}"
  if systemctl restart systemd-resolved 2>/dev/null; then
    act "restarted systemd-resolved"
  else
    info "could not restart systemd-resolved — do it manually"
  fi
fi

echo
echo "Done. Verify with:"
echo "  node ~/agentic-sdlc/agents/net-doctor.mjs      # expect: OK"
echo "  tailscale status                               # expect: still connected"
