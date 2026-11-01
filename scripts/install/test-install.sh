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

# --- The setup code (161) ----------------------------------------------------------------------
check "setup_link puts the code in the fragment" "http://localhost:7650/setup#code=0KQ2M-ABCDE" \
  "$(setup_link http://localhost:7650 0KQ2M-ABCDE)"
check "setup_link with a trailing slash" "https://r.example.com/setup#code=X" "$(setup_link https://r.example.com/ X)"
printf '#!/bin/sh\necho "Setup code: 0KQ2M-ABCDE-FGHJK-MNPQR-STVWX-Y"\necho "Open http://localhost:7650/setup and enter it."\n' >"$work/code-ok"
printf '#!/bin/sh\necho "✗ This instance is already set up, so there'"'"'s no setup code." >&2\nexit 1\n' >"$work/code-done"
chmod +x "$work/code-ok" "$work/code-done"
check "setup_code reads the code setup-code prints" "0KQ2M-ABCDE-FGHJK-MNPQR-STVWX-Y" "$(setup_code "$work/code-ok")"
check "setup_code is empty once set up" "" "$(setup_code "$work/code-done")"
check "setup_code is empty when the command is missing" "" "$(setup_code "$work/missing-command")"
MODE=server YES=1
check "show_setup prints the code and where to enter it" \
  "Open https://r.example.com/setup and enter the setup code: 7KQ2M|Only you have it: it's in the server's log too, and rmk-server setup-code prints it again." \
  "$(show_setup https://r.example.com 7KQ2M "rmk-server setup-code" | tr '\n' '|' | sed 's/|$//')"
check "show_setup says nothing without a code" "" "$(show_setup https://r.example.com "" x)"
# What it opens: on this computer the page with the code filled in, with a domain the address, and
# the address when there's no code.
opened_by() { # opened_by MODE URL CODE: the address show_setup opens
  (
    MODE=$1
    YES=0
    open_browser() { printf '%s' "$1"; }
    show_setup "$2" "$3" x | sed -n '$p' | sed 's/^.*\(http[^ ]*\)$/\1/'
  )
}
check "show_setup on this computer opens the page with the code" \
  "http://localhost:7650/setup#code=7KQ2M" "$(opened_by local http://localhost:7650 7KQ2M)"
check "show_setup with a domain opens the address" "https://r.example.com" \
  "$(opened_by server https://r.example.com 7KQ2M)"
check "show_setup without a code opens the address" "http://localhost:7650" \
  "$(opened_by local http://localhost:7650 "")"
MODE="" YES=0

# The package path's end (085): `rmk-server setup-code`, through sudo when not root, then the code.
nbin="$work/nbin"
mkdir -p "$nbin"
printf '#!/bin/sh\nprintf "SUDO %%s\\n" "$*" >>"$NLOG"; exec "$@"\n' >"$nbin/sudo"
printf '#!/bin/sh\nprintf "APT %%s\\n" "$*" >>"$NLOG"\n' >"$nbin/apt-get"
printf '#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift 2;; *) url=$1; shift;; esac; done\ncase "$url" in */checksums.txt) printf "abc  %%s\\n" "$PKG" >"$out";; *) : >"$out";; esac\n' >"$nbin/curl"
printf '#!/bin/sh\nprintf "RMK %%s\\n" "$*" >>"$NLOG"\n[ -n "$FAKE_CODE" ] || exit 1\nprintf "Setup code: %%s\\n" "$FAKE_CODE"\n' >"$nbin/rmk-server"
chmod +x "$nbin"/*
native_end() { # native_end CODE: native_install's output with fakes, and what it ran
  (
    export PATH="$nbin:$PATH" NLOG="$work/native.log" FAKE_CODE=$1 PKG=rmk-server_0.3.0-1_amd64.deb
    : >"$NLOG"
    uname() { case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; esac }
    native_target() { echo "deb amd64"; }
    glibc_version() { echo 2.36; }
    sha256_of() { echo abc; }
    confirm() { return 0; }
    wait_healthy() { return 0; }
    id() { echo 1000; }
    opened=""
    open_browser() { printf 'OPENED %s\n' "$1"; }
    YES=0 DOMAIN="" RONNE_INSTALL_VERSION=0.3.0 RONNE_INSTALL_RELEASE_URL=https://example.invalid
    native_install 2>&1
    cat "$NLOG"
  )
}
holds() { case "$out" in *"$1"*) echo yes ;; *) echo "no: $out" ;; esac }
out=$(native_end 1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0)
check "the package path asks rmk-server for the code, through sudo" yes "$(holds "SUDO rmk-server setup-code")"
check "the package path prints the code" yes \
  "$(holds "Open http://localhost:7650/setup and enter the setup code: 1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0")"
check "the package path opens the page with the code" yes \
  "$(holds "OPENED http://localhost:7650/setup#code=1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0")"
out=$(native_end "")
case "$out" in *"setup code"*) msg=yes ;; *) msg=no ;; esac
check "the package path on a set-up instance says nothing of a code" no "$msg"
check "the package path on a set-up instance opens the address" yes "$(holds "OPENED http://localhost:7650")"

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
  "compose exec")
    # `setup-code` in the container (161): the code, or a refusal once set up.
    [ -n "${FAKE_SETUP_CODE:-}" ] || exit 1
    printf 'Setup code: %s\nOpen http://localhost:7650/setup and enter it.\n' "$FAKE_SETUP_CODE"
    ;;
  "compose up")
    [ -z "${FAKE_LOG:-}" ] || printf '%s\n' "$*" >>"$FAKE_LOG"
    exit 0
    ;;
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

# run_fake DIR [OPTIONS]: install.sh --yes --mode local into DIR with the fakes first on PATH; sets
# out, code.
run_fake() {
  fake_dir=$1
  shift
  out=$(PATH="$fakes:$PATH" RONNE_INSTALL_COMPOSE_URL="file://$here/../../compose.yaml" \
    RONNE_INSTALL_IMAGE=ronne-web:test "$SHELL_UNDER_TEST" "$here/install.sh" --yes --mode local --dir "$fake_dir" "$@" 2>&1)
  code=$?
}
says() { case "$out" in *"$1"*) echo yes ;; *) echo "no: $out" ;; esac }

export FAKE_INFO FAKE_COMPOSE FAKE_PS FAKE_BUSY FAKE_SETUP_CODE
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

# A new install prints the setup code the container's setup-code gives (161); a set-up one doesn't.
FAKE_SETUP_CODE=1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0
run_fake "$work/code1"
check "a new install succeeds" 0 "$code"
check "a new install prints the setup code and where to enter it" yes \
  "$(says "Open http://localhost:7650/setup and enter the setup code: 1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0")"
check "a new install says how to see the code again" yes "$(says "docker compose exec web pnpm run setup-code")"
FAKE_SETUP_CODE=""
run_fake "$work/code1"
check "a set-up instance's rerun succeeds" 0 "$code"
case "$out" in *"setup code"*) msg=yes ;; *) msg=no ;; esac
check "a set-up instance's rerun says nothing of a setup code" no "$msg"
case "$out" in *"anyone who can reach it"*) msg=yes ;; *) msg=no ;; esac
check "no install says anyone can set it up" no "$msg"

# --- The security scanner (156) ------------------------------------------------------------------
envline() { grep "^$2=" "$1/.env" | tail -n 1; }
hex64() { case "$1" in *[!0-9a-f]*) echo no ;; *) [ "${#1}" = 64 ] && echo yes || echo no ;; esac }

DIR="$work/sc"
mkdir -p "$DIR"
: >"$DIR/.env"
check "scanner_now: nothing is no" no "$(scanner_now)"
env_set COMPOSE_PROFILES postgres,scanner
check "scanner_now: scanner is yes" yes "$(scanner_now)"
env_set COMPOSE_PROFILES scanner-semantic,scanner
check "scanner_now: scanner-semantic is semantic" semantic "$(scanner_now)"
env_set COMPOSE_PROFILES postgres,scanner,mysql,scanner-semantic
check "profiles_without_scanner keeps the others" postgres,mysql "$(profiles_without_scanner)"
env_set COMPOSE_PROFILES scanner
check "profiles_without_scanner: only the scanner's leaves none" "" "$(profiles_without_scanner)"
check "random_key is 64 hex characters" yes "$(hex64 "$(random_key)")"
check "random_key differs each time" yes "$([ "$(random_key)" != "$(random_key)" ] && echo yes || echo no)"

RONNE_VERSION=0.3.0
: >"$DIR/.env"
printf 'COMPOSE_PROFILES=postgres\n' >"$DIR/.env"
write_scanner yes
check "write_scanner yes: the profiles keep the person's" postgres,scanner "$(env_get COMPOSE_PROFILES)"
check "write_scanner yes: the static address" http://proxy:8081 "$(env_get RONNE_SKILL_SCANNER_URL)"
check "write_scanner yes: no semantic address" "" "$(env_get RONNE_SKILL_SCANNER_SEMANTIC_URL)"
check "write_scanner yes: a scan key" yes "$(hex64 "$(env_get RONNE_SCAN_KEY)")"
check "write_scanner yes: the image's version" v0.3.0 "$(env_get RONNE_SCANNER_REF)"
key1=$(env_get RONNE_SCAN_KEY)
write_scanner semantic
check "write_scanner semantic: both profiles" postgres,scanner,scanner-semantic "$(env_get COMPOSE_PROFILES)"
check "write_scanner semantic: both addresses" "http://proxy:8081 http://proxy:8082" "$(env_get RONNE_SKILL_SCANNER_URL) $(env_get RONNE_SKILL_SCANNER_SEMANTIC_URL)"
check "write_scanner keeps the scan key on a rerun" "$key1" "$(env_get RONNE_SCAN_KEY)"
env_set RONNE_SCAN_KEY "not-a-key*"
write_scanner yes
check "write_scanner replaces a key that isn't 64 hex characters" yes "$(hex64 "$(env_get RONNE_SCAN_KEY)")"
# 64 characters that aren't all hex: a "*" would be read by Caddy as a wildcard.
env_set RONNE_SCAN_KEY "$(printf '%064d' 0 | tr 0 '*')"
write_scanner yes
check "write_scanner replaces a 64-character key with a wildcard in it" yes "$(hex64 "$(env_get RONNE_SCAN_KEY)")"
write_scanner no
check "write_scanner no: the person's profiles stay" postgres "$(env_get COMPOSE_PROFILES)"
check "write_scanner no: the addresses go" "" "$(env_get RONNE_SKILL_SCANNER_URL)$(env_get RONNE_SKILL_SCANNER_SEMANTIC_URL)"
env_set RONNE_SKILL_SCANNER_URL http://127.0.0.1:7670
write_scanner no 2>/dev/null
check "write_scanner no keeps the person's own scanner address" http://127.0.0.1:7670 "$(env_get RONNE_SKILL_SCANNER_URL)"
write_scanner yes 2>/dev/null
check "write_scanner yes keeps the person's own scanner address" http://127.0.0.1:7670 "$(env_get RONNE_SKILL_SCANNER_URL)"
RONNE_VERSION="@RONNE_VERSION@"
write_scanner yes 2>/dev/null
check "a repository copy builds the scanner from main" main "$(env_get RONNE_SCANNER_REF)"

# .env as a person may have saved it: quoted values and Windows line endings (Compose reads both).
printf 'COMPOSE_PROFILES="postgres,scanner"\r\nRONNE_SKILL_SCANNER_URL=http://proxy:8081\r\nQ='"'"'single'"'"'\r\n' >"$DIR/.env"
check "env_get drops the quotes around a value" postgres,scanner "$(env_get COMPOSE_PROFILES)"
check "env_get drops a trailing carriage return" http://proxy:8081 "$(env_get RONNE_SKILL_SCANNER_URL)"
check "env_get drops single quotes" single "$(env_get Q)"
check "scanner_now reads a quoted value with a CR" yes "$(scanner_now)"
printf 'COMPOSE_PROFILES=postgres,scanner  # my profiles\nURL=http://x/#frag\nQ="a # b"\n' >"$DIR/.env"
check "env_get drops an inline comment on an unquoted value" postgres,scanner "$(env_get COMPOSE_PROFILES)"
check "env_get keeps a # with no space before it" "http://x/#frag" "$(env_get URL)"
check "env_get keeps a # inside quotes" "a # b" "$(env_get Q)"
check "scanner_now reads a value with an inline comment" yes "$(scanner_now)"
keep_dir=$DIR
DIR="$work/sc-quotes"
mkdir -p "$DIR"
printf 'A="scanner" # x\nB='"'"'scanner'"'"'   # y\nC="a # b" #c\nD="it'"'"'s"\nE='"'"'say "hi"'"'"' # z\nF="a"b"\nG="open\nH=""  # empty\n' >"$DIR/.env"
check "env_get: a quoted value followed by a comment" scanner "$(env_get A)"
check "env_get: single quotes followed by spaces and a comment" scanner "$(env_get B)"
check "env_get: a # inside quotes, then a comment" "a # b" "$(env_get C)"
check "env_get: a quote of the other kind inside" "it's" "$(env_get D)"
check "env_get: double quotes inside single quotes" 'say "hi"' "$(env_get E)"
check "env_get: a value with a quote inside and no closing quote pair" 'a"b' "$(env_get F)"
check "env_get: an opening quote with no closing one is kept" '"open' "$(env_get G)"
check "env_get: an empty quoted value with a comment" "" "$(env_get H)"
printf 'T="a"\t# c\nU="a" # "b"\nW='"'"'a'"'"'b'"'"'\nX="a"\t  \n' >"$DIR/.env"
check "env_get: a tab between the closing quote and the comment" a "$(env_get T)"
check "env_get: a quote inside the comment doesn't end the value early" a "$(env_get U)"
check "env_get: single quotes with one inside fall back to the outer pair" "a'b" "$(env_get W)"
check "env_get: only whitespace after the closing quote" a "$(env_get X)"
printf 'COMPOSE_PROFILES="scanner" # x\n' >"$DIR/.env"
check "scanner_now reads a quoted value followed by a comment" yes "$(scanner_now)"
DIR=$keep_dir
RONNE_VERSION=0.3.0
write_scanner semantic
check "write_scanner on a quoted .env writes a line Compose can read" \
  "COMPOSE_PROFILES=postgres,scanner,scanner-semantic" "$(grep '^COMPOSE_PROFILES=' "$DIR/.env")"
check "write_scanner counts a CRLF address as ours" http://proxy:8081 "$(env_get RONNE_SKILL_SCANNER_URL)"
RONNE_VERSION="@RONNE_VERSION@"
# The file holding the key is private from the first byte, and the umask is put back.
mv() {
  case "$1" in "$DIR"/.env.tmp.*) tmp_mode=$(stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1") ;; esac
  command mv "$@"
}
umask 022
before=$(umask)
env_set SECRET_TEST x
unset -f mv
check "env_set's temporary file is mode 600" 600 "$tmp_mode"
check "env_set puts the umask back" "$before" "$(umask)"
# The scanner's image carries the ref, so an upgrade builds the new one.
check "the scanner image is tagged with the ref" yes \
  "$(grep -q 'image: ronne-skillspector:${RONNE_SCANNER_REF:-main}' "$here/../../compose.yaml" && echo yes || echo no)"

# --build: a copy of the script that isn't a release builds the scanner from `main`, which moves; a
# release, whose ref is a tag, and a run without the scanner don't.
export FAKE_LOG="$work/compose.log"
build_of() { # build_of DIR [OPTIONS] (a release if RELEASE_AS is set): the `compose up` line
  : >"$FAKE_LOG"
  if [ -n "${RELEASE_AS:-}" ]; then
    sed "s/@RONNE_VERSION@/$RELEASE_AS/" "$here/install.sh" >"$work/release-install.sh"
    out=$(PATH="$fakes:$PATH" RONNE_INSTALL_COMPOSE_URL="file://$here/../../compose.yaml" \
      RONNE_INSTALL_IMAGE=ronne-web:test "$SHELL_UNDER_TEST" "$work/release-install.sh" --yes --mode local --dir "$@" 2>&1)
  else
    run_fake "$@"
  fi
  cat "$FAKE_LOG"
}
check "a non-release run with the scanner builds it" "compose up -d --quiet-pull --build" "$(build_of "$work/b1" --scanner yes)"
check "a non-release run without the scanner doesn't" "compose up -d --quiet-pull" "$(build_of "$work/b2" --scanner no)"
check "a release run with the scanner doesn't force a build" "compose up -d --quiet-pull" \
  "$(RELEASE_AS=0.3.0 build_of "$work/b3" --scanner yes)"
check "a release pins the scanner's ref" RONNE_SCANNER_REF=v0.3.0 "$(envline "$work/b3" RONNE_SCANNER_REF)"
unset FAKE_LOG

# Whole runs: --scanner, the rerun that keeps the answer, and a refusal of a bad value.
run_fake "$work/s1" --scanner yes
check "--scanner yes succeeds" 0 "$code"
check "--scanner yes writes the profile and the static address" \
  "COMPOSE_PROFILES=scanner RONNE_SKILL_SCANNER_URL=http://proxy:8081" \
  "$(envline "$work/s1" COMPOSE_PROFILES) $(envline "$work/s1" RONNE_SKILL_SCANNER_URL)"
check "--scanner yes writes no semantic address" "" "$(envline "$work/s1" RONNE_SKILL_SCANNER_SEMANTIC_URL)"
check "--scanner yes writes a scan key" yes "$(hex64 "$(envline "$work/s1" RONNE_SCAN_KEY | sed 's/^RONNE_SCAN_KEY=//')")"
check "--scanner yes says the first start builds it" yes "$(says "builds the scanner")"
check "--scanner yes says where to turn scanning on" yes "$(says "Admin > Settings > Security scan")"
check ".env stays private with a key in it" 600 "$(stat -c %a "$work/s1/.env" 2>/dev/null || stat -f %Lp "$work/s1/.env")"
key_s1=$(envline "$work/s1" RONNE_SCAN_KEY)
run_fake "$work/s1"
check "a --yes rerun keeps the scanner and its key" "$key_s1 scanner" \
  "$(envline "$work/s1" RONNE_SCAN_KEY) $(envline "$work/s1" COMPOSE_PROFILES | sed 's/^COMPOSE_PROFILES=//')"
run_fake "$work/s1" --scanner semantic
check "--scanner semantic adds the second service" \
  "COMPOSE_PROFILES=scanner,scanner-semantic RONNE_SKILL_SCANNER_SEMANTIC_URL=http://proxy:8082" \
  "$(envline "$work/s1" COMPOSE_PROFILES) $(envline "$work/s1" RONNE_SKILL_SCANNER_SEMANTIC_URL)"
run_fake "$work/s1" --scanner no
check "--scanner no removes the profile, the addresses and says nothing of the scanner" \
  "" "$(envline "$work/s1" COMPOSE_PROFILES)$(envline "$work/s1" RONNE_SKILL_SCANNER_URL)$(envline "$work/s1" RONNE_SKILL_SCANNER_SEMANTIC_URL)"
case "$out" in *"security scanner"*) msg=yes ;; *) msg=no ;; esac
check "--scanner no doesn't mention the scanner" no "$msg"
run_fake "$work/s2"
check "--yes alone installs without the scanner" "0 " \
  "$code $(envline "$work/s2" COMPOSE_PROFILES)"
run_fake "$work/s3" --scanner maybe
check "a bad --scanner exits 1" 1 "$code"
check "a bad --scanner says so" yes "$(says "--scanner is no, yes or semantic")"

[ "$failures" = 0 ] || {
  printf '%s failed\n' "$failures"
  exit 1
}
printf 'all passed\n'
