#!/usr/bin/env bash
# Starts compose.yaml on a local image and checks the Caddy proxy in front of it (feature 080):
# plain HTTP with no settings, then HTTPS from Caddy's internal CA, then HTTPS from certificate files.
# Run from the repository root:  .github/actions/build-image/compose-probe.sh ronne-web:ci
set -euo pipefail

export RONNE_IMAGE="${1:?usage: compose-probe.sh <image>}"
project=ronne-ci-compose
compose=(docker compose -p "$project" -f compose.yaml)

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then "${compose[@]}" logs --no-color proxy web | tail -n 80 || true; fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf certs
  exit "$status"
}
trap cleanup EXIT

# Retries a probe for up to 60 s: the proxy answers 502 until web has started.
retry() {
  local what=$1
  shift
  for _ in $(seq 1 60); do
    if out=$("$@" 2>&1); then echo "OK: $what"; return 0; fi
    sleep 1
  done
  echo "FAILED: $what. Last output: $out"
  return 1
}

health_says_setup() { curl -s "$@" | grep -q setup_required; }

redirects_to_https() {
  [ "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:7650/api/health)" = \
    "308 https://localhost/api/health" ]
}

# Created before the first `up`: on Linux, Docker creates a missing bind-mount folder as root, and
# this user couldn't write the certificate into it later.
mkdir -p certs

# 1. No settings: HTTP on 7650, and web isn't published.
"${compose[@]}" up -d --quiet-pull
retry "http://localhost:7650 answers setup_required" health_says_setup http://localhost:7650/api/health
# `docker compose port` exits 0 even when nothing is published, so read the published ports.
published=$("${compose[@]}" ps web --format '{{range .Publishers}}{{.PublishedPort}} {{end}}')
if [ -n "${published//[0 ]/}" ]; then
  echo "FAILED: web publishes host port(s): $published"
  exit 1
fi
echo "OK: web has no published port"

# 2. A domain with Caddy's internal CA. -k: the CA isn't trusted here.
export RONNE_DOMAIN=localhost RONNE_TLS=internal
"${compose[@]}" up -d
retry "https://localhost:7651 answers setup_required (internal CA)" \
  health_says_setup -k https://localhost:7651/api/health
retry "http://localhost:7650 redirects to HTTPS" redirects_to_https

# 3. A domain with certificate files: Caddy must serve exactly this certificate.
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost \
  -keyout certs/key.pem -out certs/cert.pem
chmod 644 certs/key.pem # Caddy runs as root in its image, but keep the check independent of that
export RONNE_TLS=files
"${compose[@]}" up -d
retry "https://localhost:7651 answers setup_required (certificate files)" \
  health_says_setup --cacert certs/cert.pem https://localhost:7651/api/health
