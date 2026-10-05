#!/bin/sh
# The .deb or .rpm of rmk-server (feature 085), end to end, as root inside a machine booted with
# systemd (CI runs it in Ubuntu, Debian and Fedora containers). Installs the older package, sets the
# instance up, upgrades to the newer one (data kept, service restarted on the new files), removes it
# (service gone, data kept), and installs again (the kept data used).
#   test-linux-package.sh <older .deb or .rpm> <newer .deb or .rpm>
set -eu

old=$1
new=$2
step() { printf '✓ %s\n' "$*"; }
fail() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}
status() { curl -s -o /dev/null -w '%{http_code}' "$1" || true; }
wait_for() { # URL CODE
  i=0
  while [ "$i" -lt 90 ]; do
    [ "$(status "$1")" = "$2" ] && return 0
    i=$((i + 1))
    sleep 1
  done
  fail "$1 didn't answer $2 (last: $(status "$1"))"
}
health=http://127.0.0.1:7650/api/health

case $old in
  *.deb)
    install() { DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$1" >/tmp/pkg.log 2>&1 || { cat /tmp/pkg.log; fail "apt-get install $1"; }; }
    remove() { DEBIAN_FRONTEND=noninteractive apt-get remove -y -q rmk-server >/tmp/pkg.log 2>&1 || { cat /tmp/pkg.log; fail "apt-get remove"; }; }
    purge() { DEBIAN_FRONTEND=noninteractive apt-get purge -y -q rmk-server >/tmp/pkg.log 2>&1 || { cat /tmp/pkg.log; fail "apt-get purge"; }; }
    ;;
  *.rpm)
    install() { dnf install -y -q "$1" >/tmp/pkg.log 2>&1 || { cat /tmp/pkg.log; fail "dnf install $1"; }; }
    remove() { dnf remove -y -q rmk-server >/tmp/pkg.log 2>&1 || { cat /tmp/pkg.log; fail "dnf remove"; }; }
    purge() { remove; }
    ;;
  *) fail "give two .deb or two .rpm files" ;;
esac
pid() { systemctl show rmk-server -p MainPID --value; }

# Install: the service, running as rmk-server, enabled, waiting for the setup.
install "$old"
grep -q "Ronne AI Marketplace is running as a service" /tmp/pkg.log || fail "postinstall didn't install the service: $(cat /tmp/pkg.log)"
[ "$(readlink -f /usr/bin/rmk-server)" = /opt/rmk-server/bin/rmk-server ] || fail "/usr/bin/rmk-server isn't the package's"
systemctl is-enabled --quiet rmk-server || fail "not enabled"
[ "$(stat -c %U "/proc/$(pid)")" = rmk-server ] || fail "not running as rmk-server"
grep -q -- "/opt/rmk-server/node/bin/node /opt/rmk-server/lib/" /etc/systemd/system/rmk-server.service ||
  fail "the unit doesn't run the package's Node and rmk-server"
[ "$(status $health)" = 503 ] || fail "not 503 before setup"
step "install $(basename "$old"): a service running as rmk-server from /opt/rmk-server, 503 before setup"

# The setup, then the upgrade: same data, the service restarted on the new version.
DATABASE_URL=file:/var/lib/rmk-server/ronne.db RONNE_ROOT_EMAIL=root@example.com RONNE_ROOT_NAME=Root \
  RONNE_ROOT_PASSWORD=Correct-horse-42! rmk-server setup --yes >/dev/null
wait_for $health 200
before=$(pid)
install "$new"
grep -q "Restarted the rmk-server service" /tmp/pkg.log || fail "postinstall didn't restart the service: $(cat /tmp/pkg.log)"
wait_for $health 200
[ "$(pid)" != "$before" ] || fail "the service wasn't restarted"
version=$(rmk-server --version | head -1)
rmk-server service status | grep -q "Version:   $version" || fail "status doesn't show $version"
step "upgrade to $(basename "$new"): restarted on $version, still set up (200)"

# Removal: the service and its account go, the data stays.
remove
! systemctl is-active --quiet rmk-server || fail "still running after removal"
[ ! -e /etc/systemd/system/rmk-server.service ] || fail "the unit stayed"
! id rmk-server >/dev/null 2>&1 || fail "the account stayed"
[ ! -e /usr/bin/rmk-server ] || fail "/usr/bin/rmk-server stayed"
[ -f /var/lib/rmk-server/ronne.db ] || fail "the database went"
[ -f /etc/rmk-server/env ] || fail "the settings went"
step "remove: service, account and program gone; data and settings kept"

# Installing again uses the kept data.
install "$new"
wait_for $health 200
step "install again: the kept data is used (200)"

# A purge keeps the data too, and says how to delete it.
purge
grep -q "sudo rm -rf /var/lib/rmk-server" /tmp/pkg.log || fail "no word on the kept data: $(cat /tmp/pkg.log)"
[ -f /var/lib/rmk-server/ronne.db ] || fail "the database went"
step "purge (or dnf remove): data kept, and how to delete it said"
