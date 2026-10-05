#!/usr/bin/env bash
# Runs scripts/install/install.sh --yes on a local image (feature 081): a fresh install under dash,
# a rerun under bash, a domain with Caddy's internal CA, then back to this computer with 7650 busy.
# Run from the repository root:  .github/actions/build-image/install-probe.sh ronne-web:ci
set -euo pipefail

image="${1:?usage: install-probe.sh <image>}"
root=$(mktemp -d)
dir="$root/ronne"
export RONNE_INSTALL_COMPOSE_URL="file://$PWD/compose.yaml" RONNE_INSTALL_IMAGE="$image"
listener=""

cleanup() {
  status=$?
  [ -z "$listener" ] || kill "$listener" 2>/dev/null || true
  if [ -f "$dir/compose.yaml" ]; then
    if [ "$status" -ne 0 ]; then (cd "$dir" && docker compose logs --no-color proxy web | tail -n 80) || true; fi
    (cd "$dir" && docker compose down -v --remove-orphans >/dev/null 2>&1) || true
  fi
  rm -rf "$root"
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "FAILED: $*"
  [ ! -f "$dir/.env" ] || { echo "--- .env"; cat "$dir/.env"; }
  exit 1
}
ok() { echo "OK: $*"; }

# expect_env "KEY=VALUE …": .env has exactly these lines, in any order.
expect_env() {
  [ "$(sort "$dir/.env")" = "$(printf '%s\n' "$@" | sort)" ] || fail ".env should be: $*"
  ok ".env is: $*"
}

answers_setup() { curl -s "$@" | grep -q setup_required; }

# 1. A fresh install on this computer, under dash: HTTP on 7650, bound to 127.0.0.1 (security audit
#    DEP-1): this computer reaches it, the network doesn't.
local_env="PUBLIC_URL=http://localhost:7650 RONNE_PORT=127.0.0.1:7650 RONNE_HTTPS_PORT=127.0.0.1:7651"
dash scripts/install/install.sh --yes --mode local --dir "$dir"
expect_env "RONNE_IMAGE=$image" $local_env
answers_setup http://localhost:7650/api/health || fail "http://localhost:7650 doesn't answer setup_required"
ok "fresh install answers on 7650"
address=$(hostname -I | awk '{print $1}')
[ -n "$address" ] || fail "this runner has no network address to check 7650 on"
if curl -s --max-time 5 -o /dev/null "http://$address:7650/api/health"; then
  fail "7650 answers on $address: the setup is open to the network"
fi
ok "7650 doesn't answer on the network address ($address)"
[ -d "$dir/certs" ] || fail "certs/ wasn't created"

# 2. A rerun under bash keeps everything: its own ports don't count as busy.
bash scripts/install/install.sh --yes --dir "$dir"
expect_env "RONNE_IMAGE=$image" $local_env
answers_setup http://localhost:7650/api/health || fail "the rerun doesn't answer on 7650"
ok "rerun keeps 7650"

# 3. A server with a domain. RONNE_TLS=internal is set by hand first (the script keeps other
#    lines): Let's Encrypt can't reach a CI runner.
echo "RONNE_TLS=internal" >>"$dir/.env"
bash scripts/install/install.sh --yes --mode server --domain localhost --email ops@example.com --dir "$dir"
expect_env "RONNE_IMAGE=$image" RONNE_TLS=internal RONNE_DOMAIN=localhost RONNE_PORT=80 \
  RONNE_HTTPS_PORT=443 RONNE_ACME_EMAIL=ops@example.com
answers_setup -k https://localhost/api/health || fail "https://localhost doesn't answer setup_required"
[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/health)" = 308 ] ||
  fail "http://localhost doesn't redirect"
ok "a domain serves HTTPS and redirects HTTP"

# 4. Back to this computer while something else holds 7650: the next free pair.
python3 -m http.server 7650 --bind 127.0.0.1 >/dev/null 2>&1 &
listener=$!
sleep 1
dash scripts/install/install.sh --yes --mode local --dir "$dir"
expect_env "RONNE_IMAGE=$image" RONNE_TLS=internal PUBLIC_URL=http://localhost:7652 \
  RONNE_PORT=127.0.0.1:7652 RONNE_HTTPS_PORT=127.0.0.1:7653
answers_setup http://localhost:7652/api/health || fail "http://localhost:7652 doesn't answer setup_required"
ok "a busy 7650 moves the install to 7652"

# 5. Without Docker on PATH: its message and exit 1.
if out=$(PATH=/nonexistent "$(command -v dash)" scripts/install/install.sh --yes --dir "$root/other" 2>&1); then
  fail "it ran without Docker"
fi
case "$out" in *"Docker isn't installed"*) ok "no Docker stops with its message" ;; *) fail "no Docker: $out" ;; esac
