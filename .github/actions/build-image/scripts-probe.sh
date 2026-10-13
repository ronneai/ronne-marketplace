#!/usr/bin/env bash
# Runs the image's commands the way the documentation gives them (`docker compose exec web pnpm run
# …`, here `docker exec`): setup with SQLite, then the incident commands (feature 098):
# revoke-access makes a token answer 401, and rotate-secret writes a new secret the server uses at
# once; then backup (099). Run from the repository root:  .github/actions/build-image/scripts-probe.sh ronne-web:ci
set -euo pipefail

image="${1:?usage: scripts-probe.sh <image>}"
name=ronne-ci-scripts
port=3010
url="http://127.0.0.1:$port"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then docker logs "$name" 2>&1 | tail -n 80 || true; fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

fail() { echo "FAILED: $*"; exit 1; }

docker run -d --name "$name" -p "127.0.0.1:$port:3000" "$image" >/dev/null
for _ in $(seq 1 60); do
  curl -s "$url/api/health" | grep -q setup_required && break
  sleep 1
done
curl -s "$url/api/health" | grep -q setup_required || fail "the container didn't answer setup_required"
echo "OK: started in setup mode"

password='Correct-horse-42!'
docker exec \
  -e DATABASE_URL=file:/app/data/ronne.db \
  -e PUBLIC_URL="$url" \
  -e RONNE_ROOT_EMAIL=root@example.com \
  -e RONNE_ROOT_NAME=Root \
  -e RONNE_ROOT_PASSWORD="$password" \
  "$name" pnpm run setup --yes
[ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/health")" = 200 ] || fail "not 200 after setup"
echo "OK: pnpm run setup --yes"

token=$(curl -s -X POST "$url/api/v1/auth/token" -H 'content-type: application/json' \
  -d "{\"email\":\"root@example.com\",\"password\":\"$password\",\"name\":\"probe\"}" |
  sed -n 's/.*"token":"\(rmk_[^"]*\)".*/\1/p')
[ -n "$token" ] || fail "sign-in returned no token"
me() { curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $token" "$url/api/v1/me"; }
[ "$(me)" = 200 ] || fail "the new token isn't accepted"

docker exec "$name" pnpm run revoke-access --everyone --yes | tee /dev/stderr |
  grep -q "revoked 1 access token" || fail "revoke-access didn't revoke the token"
[ "$(me)" = 401 ] || fail "after revoke-access the token isn't refused"
echo "OK: pnpm run revoke-access --everyone --yes, and the token now gets 401"

secret() { docker exec "$name" sh -c 'grep "^AUTH_SECRET=" /app/data/.env'; }
before=$(secret)
docker exec "$name" pnpm run rotate-secret --yes | tee /dev/stderr |
  grep -q "uses the new secret from its next request" || fail "rotate-secret didn't say it's in use"
[ "$(secret)" != "$before" ] || fail "rotate-secret left AUTH_SECRET as it was"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/health")" = 200 ] || fail "not 200 after rotate-secret"
echo "OK: pnpm run rotate-secret --yes"

# Backups (099): on the volume, in /app/data/backups, mode 0600; --keep 1 leaves the newest.
for _ in 1 2; do
  docker exec "$name" pnpm run backup --keep 1 | tee /dev/stderr |
    grep -q "Wrote /app/data/backups/ronne-backup-" || fail "backup didn't write to /app/data/backups"
  sleep 1.1
done
archives=$(docker exec "$name" ls /app/data/backups)
echo "$archives" | grep -Eqx 'ronne-backup-[0-9]{8}-[0-9]{6}\.tar' && [ "$(echo "$archives" | wc -l)" -eq 1 ] ||
  fail "after two backups with --keep 1, backups/ holds: $archives"
[ "$(docker exec "$name" stat -c %a "/app/data/backups/$archives")" = 600 ] || fail "the archive isn't mode 0600"
echo "OK: pnpm run backup --keep 1, twice: one archive, mode 0600"
