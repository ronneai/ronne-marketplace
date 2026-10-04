#!/usr/bin/env bash
# `rmk-server service` end to end on a Linux machine with systemd (feature 083): CI runs it on
# GitHub's Ubuntu runner (server-package.yml), and it runs by hand in a container booted with
# systemd. It needs passwordless sudo, rmk-server installed with npm, and CADDY_BIN pointing to a
# Caddy 2.7+ binary that isn't on PATH yet. It changes the machine: run it on a throwaway one.
set -euo pipefail

: "${CADDY_BIN:?CADDY_BIN must point to a caddy binary}"
# sudo resets PATH; keep this one so sudo finds the same rmk-server and Node.
rmk() { sudo env "PATH=$PATH" rmk-server "$@"; }
step() { printf '✓ %s\n' "$*"; }
fail() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}
status() { curl -sk -o /dev/null -w '%{http_code}' "$1" || true; }
# wait_for URL CODE: up to 90 seconds.
wait_for() {
  for _ in $(seq 90); do
    [ "$(status "$1")" = "$2" ] && return 0
    sleep 1
  done
  fail "$1 didn't answer $2 (last: $(status "$1"))"
}
# The account a service's main process runs as.
owner() { stat -c %U "/proc/$(systemctl show "$1" -p MainPID --value)"; }
setting() { sudo grep -E "^$1=" /etc/rmk-server/env | cut -d= -f2- || true; }

cd /
health=http://127.0.0.1:7650/api/health

# Without root it refuses and names sudo.
out=$(rmk-server service install 2>&1) && fail "install without root succeeded"
grep -q "sudo rmk-server service install" <<<"$out" || fail "no sudo hint: $out"
step "without root: refused, naming sudo"

out=$(rmk-server service status) && fail "status before install exited 0"
grep -q "isn't installed" <<<"$out" || fail "status before install: $out"
step "status before install: not installed (exit 4)"

# Install: the account, the folders, the unit, enabled and answering before the setup.
rmk service install
[ "$(status $health)" = 503 ] || fail "not 503 before setup"
systemctl is-enabled --quiet rmk-server || fail "not enabled"
id rmk-server >/dev/null || fail "no rmk-server account"
[ "$(getent passwd rmk-server | cut -d: -f7)" = /usr/sbin/nologin ] || fail "rmk-server can log in"
[ "$(owner rmk-server)" = rmk-server ] ||
  fail "not running as rmk-server"
[ "$(sudo stat -c '%U %a' /var/lib/rmk-server)" = "rmk-server 750" ] || fail "data folder owner or mode"
[ "$(sudo stat -c '%U %a' /etc/rmk-server/env)" = "rmk-server 600" ] || fail "settings owner or mode"
ss -Hltn 'sport = :7650' | grep -q '127.0.0.1:7650' || fail "not on 127.0.0.1:7650"
step "install: running as rmk-server on 127.0.0.1:7650, enabled, 503 before setup"

# status needs no root; it waits for the setup.
out=$(rmk-server service status) || fail "status exited $?"
grep -q "installed, running" <<<"$out" || fail "status: $out"
grep -q "not set up yet" <<<"$out" || fail "status doesn't say it needs the setup: $out"
step "status: installed, running, not set up yet"

# The setup: without sudo it points to sudo (sudo rmk-server setup is checked by migrate below).
out=$(rmk-server setup --yes 2>&1) && fail "setup without root succeeded"
grep -q "sudo rmk-server setup" <<<"$out" || fail "no sudo hint for setup: $out"
# The browser's setup runs inside the service, where systemd keeps /etc read-only but the settings
# file: run the same setup there (the service's mounts, its account) to see it can write the file.
pid=$(systemctl show rmk-server -p MainPID --value)
sudo nsenter -t "$pid" -m -- setpriv --reuid=rmk-server --regid=rmk-server --clear-groups \
  env "PATH=$PATH" HOME=/var/lib/rmk-server RONNE_DATA_DIR=/var/lib/rmk-server \
  RONNE_ENV_FILE=/etc/rmk-server/env DATABASE_URL=file:/var/lib/rmk-server/ronne.db \
  RONNE_ROOT_EMAIL=root@example.com RONNE_ROOT_NAME=Root RONNE_ROOT_PASSWORD=Correct-horse-42! \
  sh -c 'cd / && rmk-server setup --yes' >/dev/null || fail "the setup inside the service's sandbox failed"
sudo grep -q '^DATABASE_URL=' /etc/rmk-server/env || fail "the settings file has no DATABASE_URL"
[ "$(sudo stat -c %U /var/lib/rmk-server/ronne.db)" = rmk-server ] || fail "the database isn't rmk-server's"
wait_for $health 200
token=$(curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' \
  -d '{"email":"root@example.com","password":"Correct-horse-42!","name":"ci"}' \
  http://127.0.0.1:7650/api/v1/auth/token)
[ "$token" = 201 ] || fail "sign-in answered $token"
rmk migrate | grep -qi "nothing to migrate" || fail "sudo rmk-server migrate didn't reach the service's database"
step "setup inside the service's sandbox writes its settings; sudo rmk-server migrate as rmk-server; 200, a token"

# stop, start, restart and logs; and a crash: systemd brings it back.
rmk service stop
[ "$(status $health)" = 000 ] || fail "still answering after stop"
rmk-server service status >/dev/null && fail "status of a stopped service exited 0"
rmk service start
wait_for $health 200
rmk service restart
wait_for $health 200
[ "$(systemctl show rmk-server -p Result --value)" = success ] || fail "a restart counted as a failure"
sudo systemctl kill --signal=SIGKILL rmk-server
sleep 7
wait_for $health 200
[ "$(systemctl show rmk-server -p NRestarts --value)" -ge 1 ] || fail "not restarted after a crash"
timeout 5 sudo env "PATH=$PATH" rmk-server service logs >/tmp/rmk-logs.txt 2>&1 || true
grep -q "Data folder: /var/lib/rmk-server" /tmp/rmk-logs.txt || fail "logs: $(head -c 500 /tmp/rmk-logs.txt)"
step "stop (status exit 3), start, restart (clean), logs; after SIGKILL systemd started it again"

# A taken port stops install before it changes anything.
node -e 'require("node:net").createServer().listen(7790, "127.0.0.1")' &
holder=$!
sleep 1
out=$(rmk service install --port 7790 2>&1) && fail "install on a taken port succeeded"
kill "$holder"
grep -q "port 7790 is in use on 127.0.0.1 by node" <<<"$out" || fail "no port message: $out"
grep -q -- "--port 7650" /etc/systemd/system/rmk-server.service || fail "the unit changed"
step "a taken port: refused"

# --domain: needs Caddy, then serves HTTPS through rmk-server-proxy.
out=$(rmk service install --domain localhost --tls internal 2>&1) && fail "--domain without Caddy succeeded"
grep -q "needs Caddy" <<<"$out" || fail "no Caddy message: $out"
sudo install -m 755 "$CADDY_BIN" /usr/local/bin/caddy
rmk service install --domain localhost --tls internal
wait_for https://localhost/api/health 200
[ "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost/api/health)" = \
  "308 https://localhost/api/health" ] || fail "HTTP doesn't redirect to HTTPS"
[ "$(owner rmk-server-proxy)" = caddy ] ||
  fail "the proxy isn't running as caddy"
[ "$(setting PUBLIC_URL)" = https://localhost ] || fail "PUBLIC_URL is $(setting PUBLIC_URL)"
[ "$(setting TRUST_PROXY)" = true ] || fail "TRUST_PROXY isn't set"
rmk-server service status | grep -q "rmk-server-proxy, running" || fail "status doesn't show the proxy"
step "--domain localhost --tls internal: HTTPS through rmk-server-proxy as caddy, HTTP redirects"

# --tls files: a key kept at root:root 600 works; install only lets caddy's group read it.
certs=/etc/rmk-server-proxy/certs
[ "$(sudo stat -c '%U:%G %a' $certs)" = "root:caddy 750" ] || fail "certs folder owner or mode"
sudo openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout $certs/key.pem -out $certs/cert.pem 2>/dev/null
sudo chmod 600 $certs/key.pem
rmk service install --domain localhost --tls files
sudo cp $certs/cert.pem /tmp/rmk-cert.pem
[ "$(curl -s --cacert /tmp/rmk-cert.pem -o /dev/null -w '%{http_code}' https://localhost/api/health)" = 200 ] ||
  fail "HTTPS with our own certificate didn't answer 200"
[ "$(sudo stat -c '%U:%G %a' $certs/key.pem)" = "root:caddy 640" ] || fail "key.pem isn't root:caddy 640"
step "--tls files: a root:root 600 key became root:caddy 640 and our certificate is served"

# Again without a domain: the proxy and its settings go, the data stays.
rmk service install
! systemctl is-active --quiet rmk-server-proxy || fail "the proxy still runs"
[ ! -e /etc/systemd/system/rmk-server-proxy.service ] || fail "the proxy's unit stayed"
[ -z "$(setting TRUST_PROXY)" ] || fail "TRUST_PROXY stayed"
wait_for $health 200
step "install without --domain: proxy removed, still set up"

# The settings folder is root's: the service's account may rewrite its settings file, and nothing
# else there, so it can't steer root (no service.json of its own, no link swapped in).
as_service() { sudo -u rmk-server env "PATH=$PATH" "$@"; }
[ "$(sudo stat -c '%U:%G %a' /etc/rmk-server)" = "root:root 755" ] || fail "the settings folder isn't root's"
[ "$(sudo stat -c '%U %a' /etc/rmk-server/service.json)" = "root 644" ] || fail "service.json isn't root's"
as_service sh -c 'echo "{}" > /etc/rmk-server/service.json' 2>/dev/null && fail "rmk-server wrote service.json"
as_service ln -s /etc/shadow /etc/rmk-server/evil 2>/dev/null && fail "rmk-server made a link there"
as_service mv /etc/rmk-server/env /etc/rmk-server/env.x 2>/dev/null && fail "rmk-server renamed its settings file"
as_service sh -c 'cat /etc/rmk-server/env >/dev/null && echo "# kept" >> /etc/rmk-server/env' ||
  fail "rmk-server can't rewrite its own settings file"
rmk migrate >/dev/null || fail "migrate failed"
step "the settings folder is root's: rmk-server may only rewrite its own settings file"

# Uninstall: the services and the accounts go, the data and settings stay.
rmk service uninstall
! systemctl is-active --quiet rmk-server || fail "still running"
[ ! -e /etc/systemd/system/rmk-server.service ] || fail "the unit stayed"
! id rmk-server >/dev/null 2>&1 || fail "the account stayed"
sudo test -f /var/lib/rmk-server/ronne.db || fail "the database went"
sudo test -f /etc/rmk-server/env || fail "the settings went"
[ "$(sudo stat -c '%U:%G %a' $certs/key.pem)" = "root:root 640" ] || fail "the kept key's group isn't root's"
step "uninstall: services and accounts removed; data, settings and the key (root:root) kept"

# Installing again uses them: it's still set up.
rmk service install
wait_for $health 200
step "install again: the kept data is used (200)"

# --delete-data asks for the folder's name; a wrong answer changes nothing.
echo nope | rmk service uninstall --delete-data && fail "a wrong name was accepted"
systemctl is-active --quiet rmk-server || fail "a refused uninstall stopped it"
echo rmk-server | rmk service uninstall --delete-data
for path in /var/lib/rmk-server /etc/rmk-server /var/lib/rmk-server-proxy /etc/rmk-server-proxy; do
  sudo test ! -e "$path" || fail "$path stayed"
done
step "uninstall --delete-data: only with the folder's name; everything removed"
