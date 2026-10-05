#!/bin/sh
# Unit tests for install.sh's helpers (feature 081), run under dash and bash:
#   dash scripts/install/test-install.sh && bash scripts/install/test-install.sh
# The script is loaded without its last line, so main doesn't run.
here=$(cd "$(dirname "$0")" && pwd)
# The shell running this file, to run install.sh under the same one.
SHELL_UNDER_TEST=$(ps -o comm= -p $$ 2>/dev/null || echo sh)
SHELL_UNDER_TEST=${SHELL_UNDER_TEST##*/}
SHELL_UNDER_TEST=${SHELL_UNDER_TEST#-}
SHELL_UNDER_TEST=$(command -v "$SHELL_UNDER_TEST")
lib=$(mktemp)
work=$(mktemp -d)
trap 'rm -rf "$lib" "$work"' EXIT
sed '$d' "$here/install.sh" >"$lib"
# shellcheck source=/dev/null
. "$lib"

failures=0
check() { # check NAME EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then
    printf 'ok   %s\n' "$1"
  else
    printf 'FAIL %s: expected [%s], got [%s]\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}

for c in "0.4.0 0.3.0 1" "0.3.0 0.4.0 -1" "1.0.0 1.0.0 0" "1.0.0-rc.1 1.0.0 -1" "1.0.0 1.0.0-rc.1 1" \
  "1.0.0-rc.2 1.0.0-rc.1 1" "0.10.0 0.9.9 1" "5.5.0 2.23.1 1" "2.23.0 2.23.1 -1"; do
  set -- $c
  check "version_cmp $1 $2" "$3" "$(version_cmp "$1" "$2")"
done

for d in ronne.example.com localhost a.b.co xn--bcher-kva.example; do
  check "valid_domain $d" yes "$(valid_domain "$d" && echo yes || echo no)"
done
for d in nodot 'bad_domain!' -x.example.com example.com. "a b.com" ""; do
  check "invalid domain [$d]" no "$(valid_domain "$d" && echo yes || echo no)"
done
# --- This computer binds 127.0.0.1 (security audit DEP-1) ------------------------------------
check "local_bind 7650" 127.0.0.1:7650 "$(local_bind 7650)"
check "local_bind 7652" 127.0.0.1:7652 "$(local_bind 7652)"
check "local_bind keeps an address set on purpose" 0.0.0.0:7650 "$(local_bind 0.0.0.0:7650)"
check "local_bind keeps 127.0.0.1" 127.0.0.1:7650 "$(local_bind 127.0.0.1:7650)"
check "local_public_url empty" http://localhost:7650 "$(local_public_url "" 7650)"
check "local_public_url follows the port" http://localhost:7652 "$(local_public_url http://localhost:7650 7652)"
check "local_public_url from an address" http://localhost:7650 "$(local_public_url "" 127.0.0.1:7650)"
check "local_public_url keeps the person's own" https://ronne.example.com "$(local_public_url https://ronne.example.com 7650)"
RUNNING=1 OLD_PORT=127.0.0.1:7650 OLD_HTTPS_PORT=127.0.0.1:7651
check "port_ours: its own port, written with an address" yes "$(port_ours 7650 && echo yes || echo no)"
check "port_ours: its own HTTPS port" yes "$(port_ours 7651 && echo yes || echo no)"
check "port_ours: another port" no "$(port_ours 7652 && echo yes || echo no)"
RUNNING=0 OLD_PORT='' OLD_HTTPS_PORT=

# --- Without Docker (085) ----------------------------------------------------------------------
osr="$work/os-release"
for c in "ubuntu|debian|x86_64|deb amd64" "debian||aarch64|deb arm64" "linuxmint|ubuntu debian|x86_64|deb amd64" \
  "fedora||x86_64|rpm x86_64" "rocky|rhel centos fedora|aarch64|rpm aarch64" "almalinux|rhel|arm64|rpm aarch64"; do
  id=${c%%|*}
  rest=${c#*|}
  like=${rest%%|*}
  rest=${rest#*|}
  machine=${rest%%|*}
  want=${rest#*|}
  printf 'NAME="x"\nID=%s\nID_LIKE="%s"\n' "$id" "$like" >"$osr"
  check "native_target $id ($like) $machine" "$want" "$(native_target "$osr" "$machine")"
done
printf 'ID=alpine\n' >"$osr"
check "native_target alpine: none" no "$(native_target "$osr" x86_64 >/dev/null && echo yes || echo no)"
printf 'ID=ubuntu\n' >"$osr"
check "native_target riscv64: none" no "$(native_target "$osr" riscv64 >/dev/null && echo yes || echo no)"
check "native_target with no os-release: none" no "$(native_target "$work/missing" x86_64 >/dev/null && echo yes || echo no)"
check "package_file deb" rmk-server_0.3.0-1_amd64.deb "$(package_file 0.3.0 deb amd64)"
check "package_file rpm" rmk-server-0.3.0-1.aarch64.rpm "$(package_file 0.3.0 rpm aarch64)"
check "package_file pre-release" "rmk-server_1.0.0~rc.1-1_arm64.deb" "$(package_file 1.0.0-rc.1 deb arm64)"
check "glibc 2.35 is new enough" 1 "$(version_cmp 2.35 2.34)"
check "glibc 2.31 is too old" -1 "$(version_cmp 2.31 2.34)"

check "valid_email" yes "$(valid_email ops@example.com && echo yes || echo no)"
check "invalid email" no "$(valid_email 'not an email' && echo yes || echo no)"

DIR="$work"
printf 'CUSTOM=1\nRONNE_PORT=7660\n' >"$DIR/.env"
env_set RONNE_PORT ""
env_set RONNE_IMAGE ronneai/marketplace:0.3.0
env_set RONNE_DOMAIN x.example.com
env_set RONNE_DOMAIN y.example.com
check "env_set keeps other lines and replaces keys" \
  "CUSTOM=1 RONNE_IMAGE=ronneai/marketplace:0.3.0 RONNE_DOMAIN=y.example.com" "$(tr '\n' ' ' <"$DIR/.env" | sed 's/ $//')"
check "env_get" y.example.com "$(env_get RONNE_DOMAIN)"
check "env_get missing" "" "$(env_get RONNE_TLS)"

RONNE_VERSION="@RONNE_VERSION@"
check "a repository copy isn't a release" no "$(is_release && echo yes || echo no)"
RONNE_VERSION="0.3.0"
check "a written-in version is a release" yes "$(is_release && echo yes || echo no)"

out=$(PATH=/nonexistent "$SHELL_UNDER_TEST" "$here/install.sh" --yes --dir "$work/x" 2>&1)
check "no docker exits 1" 1 "$?"
case "$out" in *"Docker isn't installed"*) msg=yes ;; *) msg=no ;; esac
check "no docker says so" yes "$msg"
out=$("$SHELL_UNDER_TEST" "$here/install.sh" --mode moon 2>&1)
check "a bad --mode exits 1" 1 "$?"
out=$("$SHELL_UNDER_TEST" "$here/install.sh" --dir 2>&1)
check "a flag without its value exits 1" 1 "$?"

# --- The whole script with a fake docker and curl on PATH -----------------------------------------
# Each answers what the test sets in FAKE_* (FAKE_BUSY: ports that answer, as if in use), so the Docker messages and the legacy rerun run with no
# Docker and no network. The fake curl answers the health check and the port probes, and hands
# everything else (the file:// download of compose.yaml) to the real curl.
fakes="$work/fakes"
mkdir -p "$fakes"
real_curl=$(command -v curl)
cat >"$fakes/docker" <<'FAKE'
#!/bin/sh
case "$1 ${2:-}" in
  "info "*)
    [ "$FAKE_INFO" = ok ] && exit 0
    printf '%s\n' "$FAKE_INFO" >&2
    exit 1
    ;;
  "compose version")
    [ -n "$FAKE_COMPOSE" ] || exit 1
    printf '%s\n' "$FAKE_COMPOSE"
    ;;
  "compose ls") printf '[]\n' ;;
  "compose ps") printf '%s\n' "${FAKE_PS:-}" ;;
  "compose up") exit 0 ;;
  *) exit 1 ;;
esac
FAKE
cat >"$fakes/curl" <<FAKE
#!/bin/sh
for arg in "\$@"; do
  case "\$arg" in
    */api/health) printf 503 && exit 0 ;;
    http://127.0.0.1:*)
      port=\${arg#http://127.0.0.1:}
      port=\${port%%/*}
      case " \$FAKE_BUSY " in *" \$port "*) exit 0 ;; esac
      exit 7
      ;;
  esac
done
exec "$real_curl" "\$@"
FAKE
chmod +x "$fakes/docker" "$fakes/curl"

# run_fake DIR: install.sh --yes --mode local into DIR with the fakes first on PATH; sets out, code.
run_fake() {
  out=$(PATH="$fakes:$PATH" RONNE_INSTALL_COMPOSE_URL="file://$here/../../compose.yaml" \
    RONNE_INSTALL_IMAGE=ronne-web:test "$SHELL_UNDER_TEST" "$here/install.sh" --yes --mode local --dir "$1" 2>&1)
  code=$?
}
says() { case "$out" in *"$1"*) echo yes ;; *) echo "no: $out" ;; esac }

export FAKE_INFO FAKE_COMPOSE FAKE_PS FAKE_BUSY
FAKE_INFO="Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?"
FAKE_COMPOSE=5.5.0
run_fake "$work/d1"
check "a stopped daemon exits 1" 1 "$code"
check "a stopped daemon says so" yes "$(says "it isn't running")"

FAKE_INFO="permission denied while trying to connect to the Docker daemon socket"
run_fake "$work/d2"
check "no access to the socket exits 1" 1 "$code"
check "no access to the socket names the docker group" yes "$(says "docker group")"

FAKE_INFO=ok
FAKE_COMPOSE=2.20.3
run_fake "$work/d3"
check "an old Compose exits 1" 1 "$code"
check "an old Compose names the minimum" yes "$(says "Compose 2.20.3 is too old: Ronne needs 2.23.1")"

FAKE_COMPOSE=""
run_fake "$work/d4"
check "no Compose v2 exits 1" 1 "$code"
check "no Compose v2 says so" yes "$(says "Docker Compose v2 isn't available")"

# A legacy install: a compose.yaml from before the proxy, its old stack running on 3000, no .env.
# Port 3000 is the old stack's own, so the rerun keeps it instead of moving to 7650.
FAKE_COMPOSE=5.5.0
FAKE_PS=0123456789ab
FAKE_BUSY=3000
mkdir -p "$work/legacy"
printf 'name: ronne-marketplace\nservices:\n  web:\n    ports:\n      - "${RONNE_PORT:-3000}:3000"\n' \
  >"$work/legacy/compose.yaml"
run_fake "$work/legacy"
check "a legacy rerun succeeds" 0 "$code"
# Bound to 127.0.0.1, this computer only (security audit DEP-1), with the address that goes with it.
check "a legacy rerun keeps port 3000, on 127.0.0.1" \
  "RONNE_IMAGE=ronne-web:test RONNE_PORT=127.0.0.1:3000 RONNE_HTTPS_PORT=127.0.0.1:7651 PUBLIC_URL=http://localhost:3000" \
  "$(tr '\n' ' ' <"$work/legacy/.env" | sed 's/ $//')"
check "a legacy rerun says so" yes "$(says "keeping http://localhost:3000")"
check "a legacy rerun gets the proxy's compose.yaml" yes \
  "$(grep -q '^  proxy:' "$work/legacy/compose.yaml" && echo yes || echo no)"
FAKE_PS=""
FAKE_BUSY=""

[ "$failures" = 0 ] || {
  printf '%s failed\n' "$failures"
  exit 1
}
printf 'all passed\n'
