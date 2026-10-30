#!/usr/bin/env bash
# The security scanner's container (feature 156), checked on the web image that was just built:
# the scanner image builds, its service tests pass inside it, compose.yaml starts it behind the
# proxy's scan key, the scanners have no way to Ronne or (for `scanner`) out, a fixture scan goes
# through the proxy as Ronne sends it, and with no key set the proxy still starts and refuses.
# Run from the repository root:  .github/actions/build-image/scanner-probe.sh ronne-web:ci
set -euo pipefail

export RONNE_IMAGE="${1:?usage: scanner-probe.sh <web image>}"
project=ronne-ci-scanner
scanner=ronne-skillspector:ci
compose=(docker compose -p "$project" -f compose.yaml)
python_in_image=(--entrypoint /app/.venv/bin/python "$scanner" -I)

# The tag compose gives the scanner for this ref, built below: `up --no-build` then never builds
# from GitHub, whose default branch has none of this until it is merged.
export RONNE_SCANNER_REF=ci
export RONNE_PORT=127.0.0.1:7650 RONNE_HTTPS_PORT=127.0.0.1:7651
export COMPOSE_PROFILES=scanner,scanner-semantic
export RONNE_SKILL_SCANNER_URL=http://proxy:8081 RONNE_SKILL_SCANNER_SEMANTIC_URL=http://proxy:8082
RONNE_SCAN_KEY=$(openssl rand -hex 32)
export RONNE_SCAN_KEY

cleanup() {
  status=$?
  docker rm -f "$project-echo" >/dev/null 2>&1 || true
  if [ "$status" -ne 0 ]; then
    "${compose[@]}" logs --no-color proxy scanner scanner-semantic | tail -n 60 || true
  fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

retry() {
  local what=$1
  shift
  for _ in $(seq 1 90); do
    if out=$("$@" 2>&1); then echo "OK: $what"; return 0; fi
    sleep 1
  done
  echo "FAILED: $what. Last output: $out"
  return 1
}
fail() {
  echo "FAILED: $*"
  exit 1
}

# 1. The image builds, and the service's own tests pass in it (read-only, no capabilities, an
# executable /tmp: the tests run scanner stand-ins from it).
docker build -t "$scanner" scripts/skill-scanner
docker run --rm --read-only --tmpfs /tmp:exec --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/scripts/skill-scanner:/t:ro" --entrypoint /app/.venv/bin/python "$scanner" \
  -I -m unittest discover -s /t -p 'test_*.py'
echo "OK: the scanner image builds and its tests pass"

# 2. compose.yaml with both profiles.
"${compose[@]}" up -d --quiet-pull --no-build
healthy() {
  [ "$("${compose[@]}" ps "$1" --format '{{.Health}}')" = healthy ]
}
retry "scanner is healthy" healthy scanner
retry "scanner-semantic is healthy" healthy scanner-semantic
web_answers() { curl -s http://localhost:7650/api/health | grep -q setup_required; }
retry "web answers through the proxy" web_answers

# No published port, in the config (a port on an internal-only network would not even be bound, so
# the running containers alone would not show it) and in the running containers.
"${compose[@]}" config --format json | python3 -c '
import json, sys

services = json.load(sys.stdin)["services"]
bad = [name for name in ("scanner", "scanner-semantic") if services[name].get("ports")]
if bad:
    sys.exit(f"FAILED: {bad} publish ports in the config")
'
published=$("${compose[@]}" ps scanner scanner-semantic --format '{{range .Publishers}}{{.PublishedPort}} {{end}}')
if [ -n "${published//[0[:space:]]/}" ]; then fail "a scanner publishes host port(s): $published"; fi
echo "OK: the scanners publish no port"

# 3. The scan key gate, from a container on the default network (where web is): :8081 and :8082
# answer 403 with JSON for no key, an empty one, a wrong one and a wildcard, and 200 for the key.
gate() { # gate EXPECT_REFUSAL KEY
  docker run --rm --network "${project}_default" "${python_in_image[@]}" -c '
import json, sys, urllib.error, urllib.request

refusal, key = sys.argv[1], sys.argv[2]


def ask(port, headers, data=None):
    request = urllib.request.Request(
        f"http://proxy:{port}/" + ("scan" if data else "health"), data=data, headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


bad = []
for port in (8081, 8082):
    for label, headers in (
        ("no key", {}),
        ("empty key", {"X-Ronne-Scan-Key": ""}),
        ("wrong key", {"X-Ronne-Scan-Key": "0" * 64}),
        ("wildcard", {"X-Ronne-Scan-Key": "*"}),
    ):
        for data in (None, b"{}"):
            status, body = ask(port, headers, data)
            try:
                error = json.loads(body).get("error")
            except ValueError:
                error = None
            if (status, error) != (403, refusal):
                bad.append((port, label, "POST" if data else "GET", status, body[:60]))
    if key:
        status, body = ask(port, {"X-Ronne-Scan-Key": key})
        if status != 200:
            bad.append((port, "the right key", "GET", status, body[:60]))
if bad:
    print("FAILED", *bad, sep="\n  ")
    sys.exit(1)
' "$1" "$2"
}
gate "scan key" "$RONNE_SCAN_KEY"
echo "OK: the scanner ports refuse without the key (403 JSON), and take it"

# 4. Isolation. scanner: only the proxy. scanner-semantic: no web and no scanner.
reach() { # reach SERVICE HOST PORT: prints open or the error
  "${compose[@]}" exec -T "$1" /app/.venv/bin/python -I -c '
import socket, sys
try:
    socket.create_connection((sys.argv[1], int(sys.argv[2])), 3).close()
    print("open")
except Exception as e:
    print(type(e).__name__)
' "$2" "$3"
}
for target in "1.1.1.1 443" "web 3000" "scanner-semantic 8080" "postgres 5432"; do
  # shellcheck disable=SC2086
  [ "$(reach scanner $target)" != open ] || fail "scanner reaches $target"
done
for target in "web 3000" "scanner 8080" "postgres 5432"; do
  # shellcheck disable=SC2086
  [ "$(reach scanner-semantic $target)" != open ] || fail "scanner-semantic reaches $target"
done
[ "$(reach scanner proxy 8081)" = open ] || fail "scanner can't reach the proxy's port"
echo "OK: scanner has no way out or to web; scanner-semantic has none to web or the other scanner"

# 5. A scan as Ronne sends it: from the web container, through the proxy, with the key compose
# gives it. The fixture is the bad skill; its report must come back with a high score.
body=$(python3 - <<'PY'
import base64, json, os

root = "packages/core/src/skill-scan/fixtures/bad-skill"
files = []
for folder, _, names in os.walk(root):
    for name in sorted(names):
        path = os.path.join(folder, name)
        with open(path, "rb") as f:
            files.append(
                {
                    "path": os.path.relpath(path, root),
                    "content": base64.b64encode(f.read()).decode(),
                    "executable": os.access(path, os.X_OK),
                }
            )
print(json.dumps({"files": files, "semantic": False, "timeoutSeconds": 120}))
PY
)
answer=$(printf '%s' "$body" | "${compose[@]}" exec -T web node -e '
let body = "";
process.stdin.on("data", (d) => (body += d)).on("end", async () => {
  const response = await fetch(process.env.RONNE_SKILL_SCANNER_URL + "/scan", {
    method: "POST",
    headers: { "X-Ronne-Scan-Key": process.env.RONNE_SCAN_KEY },
    body,
  });
  console.log(response.status, await response.text());
});
')
status=${answer%% *}
[ "$status" = 200 ] || fail "the fixture scan answered ${answer:0:200}"
printf '%s' "${answer#* }" | python3 -c '
import json, sys

answer = json.load(sys.stdin)
report = json.loads(answer["report"])
score = report["risk_assessment"]["score"]
assert answer["exit"] == 1, answer["exit"]
assert score >= 70, score
print("OK: the bad skill scored", score, "through the proxy, exit", answer["exit"])
'

# 5b. The proxy strips the scan key: with a stand-in on the scanner's network that answers with the
# headers it was given, a request through the proxy's port with the key shows the scanner never sees
# it. Once for each scanner and its port.
echo_headers() { # echo_headers PORT
  docker run --rm --network "${project}_default" "${python_in_image[@]}" -c '
import json, sys, urllib.request

request = urllib.request.Request(
    f"http://proxy:{sys.argv[1]}/echo", headers={"X-Ronne-Scan-Key": sys.argv[2], "X-Probe": "kept"}
)
with urllib.request.urlopen(request, timeout=10) as r:
    seen = json.load(r)
assert seen.get("x-probe") == "kept", seen
assert "x-ronne-scan-key" not in seen, "the scanner was sent the scan key"
assert not any(sys.argv[2] in value for value in seen.values()), "the value of the scan key reached the scanner"
' "$1" "$RONNE_SCAN_KEY"
}
for pair in "scanner scan 8081" "scanner-semantic scan-semantic 8082"; do
  # shellcheck disable=SC2086
  set -- $pair
  "${compose[@]}" stop "$1" >/dev/null
  docker rm -f "$project-echo" >/dev/null 2>&1 || true
  docker run -d --name "$project-echo" --network "${project}_$2" --network-alias "$1" \
    --entrypoint /app/.venv/bin/python "$scanner" -I -c '
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Echo(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({k.lower(): v for k, v in self.headers.items()}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("0.0.0.0", 8080), Echo).serve_forever()
' >/dev/null
  retry "the proxy reaches the stand-in for $1" echo_headers "$3"
  docker rm -f "$project-echo" >/dev/null
  "${compose[@]}" start "$1" >/dev/null
done
echo "OK: the proxy strips the scan key before either scanner sees the request"

# 6. Fails closed: with no key (or one with a "*") the proxy starts, refuses every request, and
# Ronne still answers.
for unusable in "" "ab*cd"; do
  RONNE_SCAN_KEY=$unusable "${compose[@]}" up -d --no-deps --force-recreate proxy
  retry "the proxy answers with the key ${unusable:-unset}" web_answers
  gate "not set up" ""
done
echo "OK: with no key the proxy starts and the scanner ports refuse everything"

# 7. Trivy on the scanner image, as advice: it isn't shipped (docs/policies/dependencies.md), so a
# finding is shown and never fails the run.
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969 \
  image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0 "$scanner" || true
