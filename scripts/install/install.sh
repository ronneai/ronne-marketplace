#!/bin/sh
# Installs Ronne AI Marketplace with Docker, or upgrades an install (feature 081).
#
#   curl -fsSL https://www.ronne.ai/install.sh | sh
#   (www.ronne.ai redirects to the latest release: https://github.com/ronneai/ronne-marketplace/releases/latest/download/install.sh)
#   curl -fsSL https://www.ronne.ai/install.sh | sh -s -- --yes --mode server --domain ronne.example.com
#
# It writes one folder (~/ronne-marketplace by default) with compose.yaml and .env, starts Ronne
# and opens it in the browser. It never uses sudo and changes nothing outside that folder.
# Everything runs from main, called on the last line, so a download cut short runs nothing.
#
# For tests only: RONNE_INSTALL_COMPOSE_URL (where compose.yaml comes from; file:// works) and
# RONNE_INSTALL_IMAGE (the image written to .env).

# The release this script belongs to. release.yml writes it in; a copy from the repository has the
# placeholder, and then installs compose.yaml from main and the latest image.
RONNE_VERSION="@RONNE_VERSION@"

REPO_RAW="https://raw.githubusercontent.com/ronneai/ronne-marketplace"
COMPOSE_MIN="2.23.1"
PROJECT_NAME="ronne-marketplace"

say() { printf '%s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install or upgrade Ronne AI Marketplace with Docker.

Options:
  --yes             Answer every question with its default or its flag; open no browser
  --mode MODE       local (this computer) or server (a server with a domain)
  --domain NAME     The domain, for --mode server
  --email ADDRESS   Optional email for the certificate authority (expiry notices)
  --dir PATH        The folder to install into (default: ~/ronne-marketplace)
  -h, --help        Show this help
EOF
}

# --- Versions ---------------------------------------------------------------------------------

is_release() {
  case "$RONNE_VERSION" in
    @*) return 1 ;;
    *) return 0 ;;
  esac
}

# Prints -1, 0 or 1 for two versions X.Y.Z[-pre]: numeric parts first, then a release beats its
# pre-releases, then pre-releases compare as text.
version_cmp() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    na = split(a, pa, "-"); nb = split(b, pb, "-")
    split(pa[1], x, "."); split(pb[1], y, ".")
    for (i = 1; i <= 3; i++) {
      if (x[i] + 0 < y[i] + 0) { print -1; exit }
      if (x[i] + 0 > y[i] + 0) { print 1; exit }
    }
    prea = substr(a, length(pa[1]) + 2); preb = substr(b, length(pb[1]) + 2)
    if (prea == preb) { print 0; exit }
    if (prea == "") { print 1; exit }
    if (preb == "") { print -1; exit }
    print (prea < preb) ? -1 : 1
  }'
}

# --- Questions --------------------------------------------------------------------------------

# Questions read the terminal, not stdin: with `curl … | sh`, stdin is the script itself.
has_tty() { (: </dev/tty) 2>/dev/null; }

# ask VAR "Question" DEFAULT: the answer, or the default when it's empty or with --yes.
ask() {
  if [ "$YES" = 1 ]; then
    eval "$1=\$3"
    return
  fi
  if [ -n "$3" ]; then
    printf '%s [%s]: ' "$2" "$3" >/dev/tty
  else
    printf '%s: ' "$2" >/dev/tty
  fi
  IFS= read -r ask_answer </dev/tty || ask_answer=""
  [ -n "$ask_answer" ] || ask_answer="$3"
  eval "$1=\$ask_answer"
}

# confirm "Question": true for yes. The default is yes; --yes answers yes.
confirm() {
  [ "$YES" = 1 ] && return 0
  printf '%s [Y/n]: ' "$1" >/dev/tty
  IFS= read -r confirm_answer </dev/tty || confirm_answer=""
  case "$confirm_answer" in
    "" | y | Y | yes | Yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

valid_domain() {
  [ "$1" = localhost ] && return 0
  printf '%s\n' "$1" | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$'
}

valid_email() {
  printf '%s\n' "$1" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
}

# --- Docker -----------------------------------------------------------------------------------

docker_link() {
  case "$(uname -s)" in
    Darwin) say "Install Docker Desktop (https://docs.docker.com/desktop/setup/install/mac-install/), Rancher Desktop (https://rancherdesktop.io) or Podman Desktop (https://podman-desktop.io), start it, and run this again." ;;
    *) say "Install Docker Engine (https://docs.docker.com/engine/install/) with the Compose plugin, and run this again." ;;
  esac
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    say "Docker isn't installed: Ronne runs in Docker." >&2
    docker_link >&2
    exit 1
  fi
  if ! info_out=$(docker info 2>&1); then
    case "$info_out" in
      *"permission denied"*)
        die "Your user can't reach Docker. Add it to the docker group (sudo usermod -aG docker \"\$USER\", then log out and in), or run this again with sudo."
        ;;
    esac
    say "Docker is installed, but it isn't running (docker info failed). Start Docker and run this again." >&2
    docker_link >&2
    exit 1
  fi
  if ! compose_version=$(docker compose version --short 2>/dev/null); then
    say "Docker Compose v2 isn't available (docker compose version failed). With Podman, turn on Podman Desktop's Docker compatibility." >&2
    docker_link >&2
    exit 1
  fi
  compose_version=${compose_version#v}
  if [ "$(version_cmp "$compose_version" "$COMPOSE_MIN")" = -1 ]; then
    say "Docker Compose $compose_version is too old: Ronne needs $COMPOSE_MIN or later. Update Docker and run this again." >&2
    docker_link >&2
    exit 1
  fi
}

# --- Ports ------------------------------------------------------------------------------------

# A port is free when nothing accepts a connection on it (curl's exit code 7: refused).
port_free() {
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/" >/dev/null 2>&1
  [ $? = 7 ]
}

# Ports this install's proxy already publishes don't count as busy on a rerun.
port_ours() {
  [ "$RUNNING" = 1 ] || return 1
  [ "$1" = "$OLD_PORT" ] || [ "$1" = "$OLD_HTTPS_PORT" ]
}

port_available() { port_ours "$1" || port_free "$1"; }

# --- The folder and .env ----------------------------------------------------------------------

# env_get KEY: the value of KEY in .env, or nothing.
env_get() {
  [ -f "$DIR/.env" ] || return 0
  sed -n "s/^$1=//p" "$DIR/.env" | tail -n 1
}

# env_set KEY VALUE (an empty VALUE removes the line). Other lines are kept as they are.
env_set() {
  env_tmp="$DIR/.env.tmp.$$"
  if [ -f "$DIR/.env" ]; then
    grep -v "^$1=" "$DIR/.env" >"$env_tmp" || true
  else
    : >"$env_tmp"
  fi
  [ -z "$2" ] || printf '%s=%s\n' "$1" "$2" >>"$env_tmp"
  mv "$env_tmp" "$DIR/.env"
}

check_folder() {
  if [ -f "$DIR/compose.yaml" ]; then
    grep -q "^name: $PROJECT_NAME\$" "$DIR/compose.yaml" ||
      die "$DIR has a compose.yaml that isn't Ronne's. Choose another folder with --dir."
    INSTALLED=1
  elif [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    die "$DIR exists and isn't a Ronne install. Choose another folder with --dir."
  fi
}

compose() { (cd "$DIR" && docker compose "$@"); }

# Every install uses the project name ronne-marketplace, so one in another folder would be taken
# over (its containers and volumes). Stop instead.
check_other_install() {
  other=$(docker compose ls --all --format json 2>/dev/null | tr '{' '\n' |
    grep "\"Name\":\"$PROJECT_NAME\"" | sed -n 's/.*"ConfigFiles":"\([^"]*\)".*/\1/p')
  [ -n "$other" ] || return 0
  other=${other%/compose.yaml}
  # Compare real paths: Compose may report one through a symlink (macOS's /var is /private/var).
  if [ -d "$DIR" ] && [ -d "$other" ] && [ "$(cd "$DIR" && pwd -P)" = "$(cd "$other" && pwd -P)" ]; then
    return 0
  fi
  die "Ronne is already installed from $other (Docker project $PROJECT_NAME). Run this again with --dir \"$other\" to upgrade it, or remove it first (cd there, then docker compose down)."
}

# --- DNS --------------------------------------------------------------------------------------

resolve() {
  if command -v getent >/dev/null 2>&1; then
    getent ahosts "$1" 2>/dev/null | awk '{ print $1 }' | sort -u
  elif command -v dscacheutil >/dev/null 2>&1; then
    dscacheutil -q host -a name "$1" 2>/dev/null | awk '/_address:/ { print $2 }'
  elif command -v host >/dev/null 2>&1; then
    host "$1" 2>/dev/null | awk '/has (IPv6 )?address/ { print $NF }'
  fi
}

local_addresses() {
  if command -v ip >/dev/null 2>&1; then
    ip -o addr show 2>/dev/null | awk '{ split($4, a, "/"); print a[1] }'
  elif command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '$1 == "inet" || $1 == "inet6" { split($2, a, "%"); print a[1] }'
  fi
}

# A warning, not a stop: DNS may still be propagating, or the server may be behind NAT.
check_dns() {
  [ "$1" = localhost ] && return 0
  dns_addresses=$(resolve "$1")
  if [ -z "$dns_addresses" ]; then
    warn "$1 doesn't resolve yet. Add an A (and AAAA) record pointing at this server; until it resolves, no certificate can be issued."
    return 0
  fi
  mine=$(local_addresses)
  for address in $dns_addresses; do
    for own in $mine; do
      [ "$address" = "$own" ] && return 0
    done
  done
  warn "$1 resolves to $(printf '%s' "$dns_addresses" | tr '\n' ' ')which isn't an address of this machine. That's fine behind a NAT or a cloud firewall that forwards ports 80 and 443 here; otherwise fix the DNS record."
}

# --- Waiting and opening ----------------------------------------------------------------------

# Any answer through the proxy counts (503 setup_required is expected), except 502: web isn't up.
wait_healthy() {
  i=0
  while [ "$i" -lt 120 ]; do
    if [ "$MODE" = server ]; then
      code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 \
        --resolve "$DOMAIN:$HTTPS_PORT_NUM:127.0.0.1" "https://$DOMAIN:$HTTPS_PORT_NUM/api/health" 2>/dev/null)
    else
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${PORT##*:}/api/health" 2>/dev/null)
    fi
    case "$code" in
      000 | 502 | "") ;;
      *) return 0 ;;
    esac
    sleep 1
    i=$((i + 1))
  done
  return 1
}

open_browser() {
  [ "$YES" = 1 ] && return 0
  case "$(uname -s)" in
    Darwin) open "$1" >/dev/null 2>&1 || true ;;
    *)
      if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$1" >/dev/null 2>&1 || true
      fi
      ;;
  esac
}

# --- Main -------------------------------------------------------------------------------------

main() {
  YES=0
  MODE=""
  DOMAIN=""
  EMAIL=""
  DIR="${HOME:?}/ronne-marketplace"
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes | -y) YES=1 ;;
      --mode | --domain | --email | --dir)
        [ $# -ge 2 ] || die "$1 needs a value."
        case "$1" in
          --mode) MODE="$2" ;;
          --domain) DOMAIN="$2" ;;
          --email) EMAIL="$2" ;;
          --dir) DIR="$2" ;;
        esac
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "Unknown option: $1 (see --help)" ;;
    esac
    shift
  done
  [ -n "$DIR" ] || die "--dir needs a folder."
  case "$MODE" in
    "" | local | server) ;;
    *) die "--mode is local or server, not $MODE." ;;
  esac
  if [ "$YES" = 0 ] && ! has_tty; then
    die "No terminal to ask questions on. Run it from a terminal, or add --yes (with --mode and --domain)."
  fi

  if is_release; then
    say "Ronne AI Marketplace $RONNE_VERSION: install with Docker"
  else
    say "Ronne AI Marketplace (a development copy of the script): install with Docker"
  fi
  check_docker

  INSTALLED=0
  check_folder
  check_other_install
  OLD_PORT=$(env_get RONNE_PORT)
  OLD_HTTPS_PORT=$(env_get RONNE_HTTPS_PORT)
  # A compose.yaml from before the proxy (080) published the app on 3000.
  LEGACY=0
  if [ "$INSTALLED" = 1 ] && grep -q 'RONNE_PORT:-3000' "$DIR/compose.yaml"; then LEGACY=1; fi
  RUNNING=0
  if [ "$INSTALLED" = 1 ] && [ -n "$(compose ps -q 2>/dev/null)" ]; then
    RUNNING=1
    if [ -z "$OLD_PORT" ] && [ "$LEGACY" = 1 ]; then OLD_PORT=3000; fi
    [ -n "$OLD_PORT" ] || OLD_PORT=7650
    [ -n "$OLD_HTTPS_PORT" ] || OLD_HTTPS_PORT=7651
  fi

  # The version: an upgrade asks first, a downgrade is refused.
  IMAGE="${RONNE_INSTALL_IMAGE:-}"
  if [ -z "$IMAGE" ] && is_release; then IMAGE="ronneai/marketplace:$RONNE_VERSION"; fi
  old_image=$(env_get RONNE_IMAGE)
  if [ "$INSTALLED" = 1 ] && is_release && [ -z "${RONNE_INSTALL_IMAGE:-}" ]; then
    case "$old_image" in
      ronneai/marketplace:[0-9]*)
        old_version=${old_image#ronneai/marketplace:}
        case "$(version_cmp "$RONNE_VERSION" "$old_version")" in
          -1) die "$DIR has $old_version, newer than this script's $RONNE_VERSION. Use the newer script." ;;
          1) confirm "Upgrade $old_version → $RONNE_VERSION?" || die "Nothing changed." ;;
          0) say "Already on $RONNE_VERSION: checking the settings and starting it." ;;
        esac
        ;;
      "") confirm "Pin this install to $RONNE_VERSION (it follows latest now)?" || die "Nothing changed." ;;
      *) confirm "Replace the image $old_image with ronneai/marketplace:$RONNE_VERSION?" || die "Nothing changed." ;;
    esac
  fi

  # Where it runs. The answers in .env are the defaults.
  old_domain=$(env_get RONNE_DOMAIN)
  if [ -z "$MODE" ]; then
    default_choice=1
    [ -z "$old_domain" ] || default_choice=2
    if [ "$YES" = 1 ] && [ -n "$DOMAIN" ]; then default_choice=2; fi
    while :; do
      [ "$YES" = 1 ] || say "Where will Ronne run?  1) This computer  2) A server with a domain"
      ask choice "Choose 1 or 2" "$default_choice"
      case "$choice" in
        1) MODE=local && break ;;
        2) MODE=server && break ;;
      esac
      [ "$YES" = 0 ] || die "Choose 1 or 2."
    done
  fi

  if [ "$MODE" = server ]; then
    while :; do
      [ -n "$DOMAIN" ] || ask DOMAIN "The domain (such as ronne.example.com)" "$old_domain"
      valid_domain "$DOMAIN" && break
      [ "$YES" = 0 ] || die "--mode server needs a valid --domain, not \"$DOMAIN\"."
      say "\"$DOMAIN\" isn't a domain name."
      DOMAIN=""
    done
    if [ -z "$EMAIL" ]; then
      ask EMAIL "An email for expiry notices from the certificate authority (optional)" "$(env_get RONNE_ACME_EMAIL)"
    fi
    if [ -n "$EMAIL" ] && ! valid_email "$EMAIL"; then die "\"$EMAIL\" isn't an email address."; fi
    check_dns "$DOMAIN"
    for p in 80 443; do
      port_available "$p" && continue
      say "Port $p is in use on this machine, probably by a web server (nginx, Apache…)." >&2
      say "Ronne needs 80 and 443 to get a certificate. Either stop that server, or run Ronne behind it:" >&2
      say "run this again as \"This computer\", then follow \"Behind your own web server\" in https://github.com/ronneai/ronne-marketplace/blob/main/docs/runbooks/install.md" >&2
      exit 1
    done
    PORT=80
    HTTPS_PORT_NUM=443
  else
    # This computer: 7650 and 7651, or the next free pair up to 7662.
    PORT="${OLD_PORT:-7650}"
    HTTPS_PORT_NUM="${OLD_HTTPS_PORT:-7651}"
    if [ "$LEGACY" = 1 ] && [ -z "$(env_get RONNE_PORT)" ]; then
      PORT=3000
      say "This install was on port 3000 before the proxy: keeping http://localhost:3000 (RONNE_PORT=3000 in .env)."
    fi
    case "$PORT" in
      80 | 443) PORT=7650 && HTTPS_PORT_NUM=7651 ;; # Moving from a server to this computer.
    esac
    case "$PORT" in *:*) ;; *)
      if ! port_available "$PORT" || ! port_available "$HTTPS_PORT_NUM"; then
        busy="$PORT"
        PORT=""
        candidate=7650
        while [ "$candidate" -le 7661 ]; do
          if port_available "$candidate" && port_available $((candidate + 1)); then
            PORT=$candidate
            HTTPS_PORT_NUM=$((candidate + 1))
            break
          fi
          candidate=$((candidate + 2))
        done
        [ -n "$PORT" ] || die "Ports 7650 to 7662 are all in use. Free one, or set RONNE_PORT and RONNE_HTTPS_PORT in $DIR/.env."
        if [ "$YES" = 1 ]; then
          say "Port $busy is in use: using $PORT (and $HTTPS_PORT_NUM for HTTPS) instead."
        else
          confirm "Port $busy is in use. Use $PORT (and $HTTPS_PORT_NUM for HTTPS) instead?" ||
            die "Free port $busy and run this again."
        fi
      fi
      ;;
    esac
  fi

  # Write the folder: compose.yaml from this release, .env with the answers.
  mkdir -p "$DIR" "$DIR/certs" || die "Can't create $DIR."
  if [ -n "${RONNE_INSTALL_COMPOSE_URL:-}" ]; then
    compose_url="$RONNE_INSTALL_COMPOSE_URL"
  elif is_release; then
    compose_url="$REPO_RAW/v$RONNE_VERSION/compose.yaml"
  else
    compose_url="$REPO_RAW/main/compose.yaml"
  fi
  curl -fsSL "$compose_url" -o "$DIR/compose.yaml.tmp.$$" || die "Couldn't download $compose_url."
  grep -q "^name: $PROJECT_NAME\$" "$DIR/compose.yaml.tmp.$$" || die "$compose_url isn't Ronne's compose.yaml."
  mv "$DIR/compose.yaml.tmp.$$" "$DIR/compose.yaml"

  [ -z "$IMAGE" ] || env_set RONNE_IMAGE "$IMAGE"
  if [ "$MODE" = server ]; then
    env_set RONNE_DOMAIN "$DOMAIN"
    env_set RONNE_PORT 80
    env_set RONNE_HTTPS_PORT 443
    env_set RONNE_ACME_EMAIL "$EMAIL"
  else
    env_set RONNE_DOMAIN ""
    env_set RONNE_ACME_EMAIL ""
    if [ "$PORT" = 7650 ]; then env_set RONNE_PORT ""; else env_set RONNE_PORT "$PORT"; fi
    if [ "$HTTPS_PORT_NUM" = 7651 ]; then env_set RONNE_HTTPS_PORT ""; else env_set RONNE_HTTPS_PORT "$HTTPS_PORT_NUM"; fi
  fi
  chmod 600 "$DIR/.env" 2>/dev/null || true
  say "Wrote $DIR/compose.yaml and $DIR/.env"

  # Start, wait, open.
  say "Starting Ronne (the first start downloads the images)…"
  compose up -d --quiet-pull || die "docker compose up failed. See the messages above, and: cd $DIR && docker compose logs"

  if [ "$MODE" = server ]; then
    url="https://$DOMAIN"
  else
    url="http://localhost:${PORT##*:}"
  fi
  public_url=$(env_get PUBLIC_URL)
  [ -z "$public_url" ] || url="$public_url"

  if wait_healthy; then
    say ""
    say "Ronne is running: $url"
    if [ "$INSTALLED" = 0 ]; then
      say "Open it now and finish the setup: until then, anyone who can reach it can set it up."
    fi
    open_browser "$url"
  else
    say "Ronne didn't answer within 120 seconds. See: cd $DIR && docker compose logs" >&2
    [ "$MODE" = local ] || say "With a domain, check that its DNS points here and that ports 80 and 443 are open." >&2
    exit 1
  fi
  say "Folder: $DIR. To upgrade later, run the install command again."
}

main "$@"
