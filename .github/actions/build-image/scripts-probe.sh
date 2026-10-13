#!/usr/bin/env bash
# Runs the image's commands the way the documentation gives them (`docker compose exec web pnpm run
# …`, here `docker exec`): setup with SQLite, then the incident commands (feature 098):
# revoke-access makes a token answer 401, and rotate-secret writes a new secret the server uses at
# once; then backup and restore (099). Run from the repository root:  .github/actions/build-image/scripts-probe.sh ronne-web:ci
set -euo pipefail

image="${1:?usage: scripts-probe.sh <image>}"
name=ronne-ci-scripts
port=3010
url="http://127.0.0.1:$port"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then docker logs "$name" 2>&1 | tail -n 80 || true; fi
  # -v: the image's /app/data is an anonymous volume when none is named; it goes with its container.
  docker rm -f -v "$name" "$name-restore" >/dev/null 2>&1 || true
  docker volume rm "$name-restored" >/dev/null 2>&1 || true
  rm -rf "${handoff:-}"
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
  # Captured, not piped: `grep -q` stops reading at its match, and under pipefail the writer's
  # broken pipe would fail the step.
  out=$(docker exec "$name" pnpm run backup --keep 1)
  echo "$out" >&2
  grep -q "Wrote /app/data/backups/ronne-backup-" <<<"$out" || fail "backup didn't write to /app/data/backups"
  sleep 1.1
done
archives=$(docker exec "$name" ls /app/data/backups)
echo "$archives" | grep -Eqx 'ronne-backup-[0-9]{8}-[0-9]{6}\.tar' && [ "$(echo "$archives" | wc -l)" -eq 1 ] ||
  fail "after two backups with --keep 1, backups/ holds: $archives"
[ "$(docker exec "$name" stat -c %a "/app/data/backups/$archives")" = 600 ] || fail "the archive isn't mode 0600"
echo "OK: pnpm run backup --keep 1, twice: one archive, mode 0600"

# Restore (099), as the runbook does it: the archive copied out, the container gone, then
# `pnpm run restore` in a new container on a new volume (docker compose run --rm web … in
# compose), and the instance started on that volume. As the server probe checks: a token made
# before the backup works, one revoked before it stays revoked, the account and a stored file are
# the same.
sign_in() {
  curl -s -X POST "$url/api/v1/auth/token" -H 'content-type: application/json' \
    -d "{\"email\":\"root@example.com\",\"password\":\"$password\",\"name\":\"$1\"}" |
    sed -n 's/.*"token":"\(rmk_[^"]*\)".*/\1/p'
}
me() { curl -s -H "authorization: Bearer $1" "$url/api/v1/me"; }
kept=$(sign_in kept)
dropped=$(sign_in dropped)
[ -n "$kept" ] && [ -n "$dropped" ] || fail "sign-in before the backup returned no token"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "authorization: Bearer $dropped" "$url/api/v1/auth/token")" -lt 300 ] ||
  fail "revoking a token before the backup failed"
me_before=$(me "$kept")
docker exec "$name" sh -c 'mkdir -p /app/data/storage/probe && head -c 307200 /dev/urandom > /app/data/storage/probe/restore-check.bin'
sum_before=$(docker exec "$name" sha256sum /app/data/storage/probe/restore-check.bin | cut -d' ' -f1)
docker exec "$name" pnpm run backup --out /app/data/restore-source >/dev/null
source_archive=$(docker exec "$name" ls /app/data/restore-source)
handoff=$(mktemp -d)
docker cp "$name:/app/data/restore-source/$source_archive" "$handoff/in.tar"
# docker cp writes it as root inside the volume: readable by the node user only if the mode lets it.
chmod 644 "$handoff/in.tar"
docker rm -f -v "$name" >/dev/null
docker volume create "$name-restored" >/dev/null
docker create --name "$name-restore" -v "$name-restored:/app/data" "$image" \
  pnpm run restore /app/data/in.tar --with-settings --database-url file:/app/data/ronne.db --yes >/dev/null
docker cp "$handoff/in.tar" "$name-restore:/app/data/in.tar"
out=$(docker start -a "$name-restore")
echo "$out" >&2
grep -q "Restored " <<<"$out" || fail "pnpm run restore didn't restore"
docker rm "$name-restore" >/dev/null
docker run -d --name "$name" -p "127.0.0.1:$port:3000" -v "$name-restored:/app/data" "$image" >/dev/null
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/health")" = 200 ] && break
  sleep 1
done
[ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/health")" = 200 ] || fail "the restored instance isn't 200"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $kept" "$url/api/v1/me")" = 200 ] ||
  fail "after the restore the token made before the backup isn't accepted"
[ "$(me "$kept")" = "$me_before" ] || fail "after the restore /api/v1/me answers another account"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $dropped" "$url/api/v1/me")" = 401 ] ||
  fail "the token revoked before the backup works after the restore"
[ "$(docker exec "$name" sha256sum /app/data/storage/probe/restore-check.bin | cut -d' ' -f1)" = "$sum_before" ] ||
  fail "the stored file came back different"
echo "OK: backup, pnpm run restore on a new volume, start: 200, the token works, the revoked one doesn't, the account and the stored file are the same"
