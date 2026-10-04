#!/usr/bin/env bash
# `rmk-server service` end to end on macOS (feature 083): CI runs it on GitHub's macOS runner
# (server-package.yml). It needs passwordless sudo, rmk-server installed with Homebrew's Node (so
# the Homebrew prefix is used and _rmkserver can read the program), and CADDY_BIN pointing to a
# Caddy 2.7+ binary that isn't on PATH yet. It changes the machine: run it on a throwaway one.
set -euo pipefail

: "${CADDY_BIN:?CADDY_BIN must point to a caddy binary}"
prefix=$(brew --prefix)
rmk() { sudo env "PATH=$PATH" rmk-server "$@"; }
step() { printf '✓ %s\n' "$*"; }
fail() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}
status() { curl -sk -o /dev/null -w '%{http_code}' "$1" || true; }
wait_for() {
  for _ in $(seq 90); do
    [ "$(status "$1")" = "$2" ] && return 0
    sleep 1
  done
  fail "$1 didn't answer $2 (last: $(status "$1"))"
}
# The account a launchd job's process runs as.
pid_of() { sudo launchctl print "system/$1" | awk '/^\tpid = /{print $3}'; }
owner() { ps -o user= -p "$(pid_of "$1")" | tr -d ' '; }
setting() { sudo grep -E "^$1=" "$prefix/etc/rmk-server/env" | cut -d= -f2- || true; }

cd /
health=http://127.0.0.1:7650/api/health
data=$prefix/var/rmk-server

out=$(rmk-server service install 2>&1) && fail "install without root succeeded"
grep -q "sudo rmk-server service install" <<<"$out" || fail "no sudo hint: $out"
step "without root: refused, naming sudo"

rmk service install
[ "$(status $health)" = 503 ] || fail "not 503 before setup"
dscl . -read /Users/_rmkserver UserShell | grep -q /usr/bin/false || fail "_rmkserver can log in"
[ "$(owner ai.ronne.rmk-server)" = _rmkserver ] || fail "not running as _rmkserver"
[ "$(sudo stat -f '%Su %Lp' "$data")" = "_rmkserver 750" ] || fail "data folder owner or mode"
[ "$(sudo stat -f '%Su %Lp' "$prefix/etc/rmk-server/env")" = "_rmkserver 600" ] || fail "settings owner or mode"
[ -e /Library/LaunchDaemons/ai.ronne.rmk-server.plist ] || fail "no plist"
grep -q "Ronne AI Marketplace isn't set up yet" /Library/Logs/rmk-server/server.log || fail "nothing in the log"
step "install: a LaunchDaemon running as _rmkserver, data in $data, 503 before setup, logging"

sudo -u _rmkserver env "PATH=$PATH" "RONNE_DATA_DIR=$data" \
  "RONNE_ENV_FILE=$prefix/etc/rmk-server/env" "DATABASE_URL=file:$data/ronne.db" \
  RONNE_ROOT_EMAIL=root@example.com RONNE_ROOT_NAME=Root RONNE_ROOT_PASSWORD=Correct-horse-42! \
  rmk-server setup --yes >/dev/null
wait_for $health 200
token=$(curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' \
  -d '{"email":"root@example.com","password":"Correct-horse-42!","name":"ci"}' \
  http://127.0.0.1:7650/api/v1/auth/token)
[ "$token" = 201 ] || fail "sign-in answered $token"
step "setup: 200 without a restart, and sign-in gives a token"

old=$(pid_of ai.ronne.rmk-server)
sudo kill -9 "$old"
sleep 7
wait_for $health 200
[ "$(pid_of ai.ronne.rmk-server)" != "$old" ] || fail "not restarted after a crash"
step "KeepAlive: after kill -9 launchd started it again"

out=$(rmk service install --domain localhost --tls internal 2>&1) && fail "--domain without Caddy succeeded"
grep -q "needs Caddy" <<<"$out" || fail "no Caddy message: $out"
sudo mkdir -p /usr/local/bin
sudo install -m 755 "$CADDY_BIN" /usr/local/bin/caddy
rmk service install --domain localhost --tls internal
wait_for https://localhost/api/health 200
[ "$(owner ai.ronne.rmk-server-proxy)" = root ] || fail "the proxy isn't running as root"
[ "$(setting PUBLIC_URL)" = https://localhost ] || fail "PUBLIC_URL is $(setting PUBLIC_URL)"
step "--domain localhost --tls internal: HTTPS through ai.ronne.rmk-server-proxy"

rmk service install
[ ! -e /Library/LaunchDaemons/ai.ronne.rmk-server-proxy.plist ] || fail "the proxy's plist stayed"
[ -z "$(setting TRUST_PROXY)" ] || fail "TRUST_PROXY stayed"
wait_for $health 200
step "install without --domain: proxy removed, still set up"

rmk service uninstall
[ ! -e /Library/LaunchDaemons/ai.ronne.rmk-server.plist ] || fail "the plist stayed"
! dscl . -read /Users/_rmkserver >/dev/null 2>&1 || fail "the account stayed"
sudo test -f "$data/ronne.db" || fail "the database went"
step "uninstall: service and account removed, data and settings kept"

# --user: the same data, now as the account running this script.
rmk service install --user
wait_for $health 200
[ "$(owner ai.ronne.rmk-server)" = "$(id -un)" ] || fail "--user isn't running as $(id -un)"
rmk service uninstall
id "$(id -un)" >/dev/null || fail "uninstall removed the signed-in account"
step "--user: runs as $(id -un), and uninstall keeps that account"

echo nope | rmk service uninstall --delete-data && fail "a wrong name was accepted"
echo rmk-server | rmk service uninstall --delete-data
for path in "$data" "$prefix/etc/rmk-server" "$prefix/var/rmk-server-proxy" "$prefix/etc/rmk-server-proxy"; do
  sudo test ! -e "$path" || fail "$path stayed"
done
step "uninstall --delete-data: only with the folder's name; everything removed"
