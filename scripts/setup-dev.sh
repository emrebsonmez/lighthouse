#!/usr/bin/env bash
# Lighthouse local developer onboarding — run once after cloning the repo.
# Usage: ./scripts/setup-dev.sh   or: npm run setup

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}→${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# --- .env helpers ---
env_get() {
  local key="$1"
  [[ -f .env ]] || return 1
  local line
  line="$(grep -E "^${key}=" .env 2>/dev/null | head -1 || true)"
  [[ -n "$line" ]] || return 1
  local val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

env_is_empty() {
  local val="${1:-}"
  [[ -z "${val//[[:space:]]/}" ]] && return 0
  [[ "$val" =~ X{3,} ]] && return 0
  return 1
}

env_set() {
  local key="$1" value="$2"
  awk -v k="$key" -v v="$value" '
    BEGIN { found = 0 }
    index($0, k "=") == 1 { print k "=" v; found = 1; next }
    { print }
    END { if (!found) print k "=" v }
  ' .env > .env.tmp && mv .env.tmp .env
}

normalize_e164() {
  local raw="$1"
  local digits="${raw//[^0-9]/}"
  if [[ "$raw" == +* ]]; then
    printf '%s' "$raw"
  elif [[ ${#digits} -eq 10 ]]; then
    printf '+1%s' "$digits"
  elif [[ ${#digits} -eq 11 && "$digits" == 1* ]]; then
    printf '+%s' "$digits"
  else
    printf '%s' "$raw"
  fi
}

prompt_env() {
  local key="$1" prompt="$2" secret="${3:-false}" optional="${4:-false}"
  local current
  current="$(env_get "$key" 2>/dev/null || true)"
  if ! env_is_empty "$current"; then
    return 0
  fi

  while true; do
    if [[ "$secret" == true ]]; then
      read -r -s -p "$prompt: " val
      echo ""
    else
      read -r -p "$prompt: " val
    fi
    val="$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    if [[ "$optional" == true && -z "$val" ]]; then
      return 0
    fi
    if ! env_is_empty "$val"; then
      env_set "$key" "$val"
      ok "$key saved"
      return 0
    fi
    warn "Please enter a value (or Ctrl+C to abort)."
  done
}

prompt_phone_env() {
  local key="$1" prompt="$2"
  local current
  current="$(env_get "$key" 2>/dev/null || true)"
  if ! env_is_empty "$current"; then
    return 0
  fi

  while true; do
    read -r -p "$prompt (E.164, e.g. +15551234567): " val
    val="$(normalize_e164 "$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')")"
    if [[ "$val" =~ ^\+[1-9][0-9]{6,14}$ ]]; then
      env_set "$key" "$val"
      ok "$key saved"
      return 0
    fi
    warn "Use E.164 format: + followed by country code and number."
  done
}

configure_env() {
  [[ -f .env ]] || fail ".env missing"

  local missing=()
  env_is_empty "$(env_get TWILIO_TEST_ACCOUNT_SID 2>/dev/null || true)" && missing+=("Twilio test Account SID")
  env_is_empty "$(env_get TWILIO_TEST_AUTH_TOKEN 2>/dev/null || true)" && missing+=("Twilio test Auth Token")
  if env_is_empty "$(env_get TWILIO_TEST_PHONE_NUMBER 2>/dev/null || true)" \
    && env_is_empty "$(env_get TWILIO_PHONE_NUMBER 2>/dev/null || true)"; then
    missing+=("Twilio phone number")
  fi
  env_is_empty "$(env_get SEED_ADMIN_PHONE 2>/dev/null || true)" && missing+=("your admin phone")

  if [[ ${#missing[@]} -eq 0 ]]; then
    ok ".env configured"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    warn ".env is incomplete (non-interactive shell). Missing: ${missing[*]}"
    warn "Edit .env manually, then run: npm run seed"
    return 1
  fi

  echo ""
  echo "  Configure .env"
  echo "  --------------"
  echo "  Twilio Console → enable Test mode, then copy credentials."
  echo "  Missing: ${missing[*]}"
  echo ""

  prompt_env TWILIO_TEST_ACCOUNT_SID "Twilio test Account SID (AC…)"
  prompt_env TWILIO_TEST_AUTH_TOKEN "Twilio test Auth Token" true

  if env_is_empty "$(env_get TWILIO_TEST_PHONE_NUMBER 2>/dev/null || true)" \
    && env_is_empty "$(env_get TWILIO_PHONE_NUMBER 2>/dev/null || true)"; then
    prompt_phone_env TWILIO_TEST_PHONE_NUMBER "Twilio test sender phone"
  fi

  prompt_phone_env SEED_ADMIN_PHONE "Your phone for seed admin + SMS alerts"

  if env_is_empty "$(env_get SYSTEM_ADMIN_PHONE 2>/dev/null || true)"; then
    local seed_phone
    seed_phone="$(env_get SEED_ADMIN_PHONE 2>/dev/null || true)"
    env_set SYSTEM_ADMIN_PHONE "$seed_phone"
    ok "SYSTEM_ADMIN_PHONE set (same as SEED_ADMIN_PHONE)"
  fi

  ok ".env configured"
  return 0
}

app_base_url() {
  local port
  port="$(env_get PORT 2>/dev/null || true)"
  [[ -z "$port" ]] && port=3000
  printf 'http://localhost:%s' "$port"
}

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  else
    warn "Open in your browser: $url"
  fi
}

start_dev_with_browser() {
  local base urls
  base="$(app_base_url)"
  urls="${base}/debug.html ${base}/subscribe.html"

  info "Starting Lighthouse (Ctrl+C to stop)…"
  npm run dev &
  local dev_pid=$!

  cleanup_dev() {
    kill "$dev_pid" 2>/dev/null || true
    wait "$dev_pid" 2>/dev/null || true
  }
  trap cleanup_dev INT TERM

  info "Waiting for server…"
  local tries=45
  if command -v curl >/dev/null 2>&1; then
    until curl -sf "${base}/health" >/dev/null 2>&1; do
      tries=$((tries - 1))
      kill -0 "$dev_pid" 2>/dev/null || fail "Dev server exited before becoming ready"
      [[ $tries -gt 0 ]] || fail "Server did not respond at ${base}/health"
      sleep 1
    done
  else
    sleep 4
    kill -0 "$dev_pid" 2>/dev/null || fail "Dev server exited before becoming ready"
  fi

  ok "Server ready at ${base}"
  info "Opening browser…"
  for url in $urls; do
    open_url "$url"
  done

  wait "$dev_pid"
  trap - INT TERM
}

offer_start_dev() {
  echo ""
  echo "  App URLs (after dev server starts):"
  echo "    http://localhost:3000/health"
  echo "    http://localhost:3000/subscribe.html"
  echo ""

  if [[ ! -t 0 ]]; then
    echo "  Start when ready: npm run dev"
    return 0
  fi

  local ans
  read -r -p "Start the dev server now? [Y/n]: " ans
  case "$ans" in
    [nN]|[nN][oO])
      echo ""
      echo "  Start later: npm run dev"
      echo "  Optional: npm run poll · npm test · docker compose down"
      echo "  Docs: README.md · docs/runbook.md"
      ;;
    *)
      echo ""
      start_dev_with_browser
      ;;
  esac
}

SKIP_SEED=false
for arg in "$@"; do
  case "$arg" in
    --skip-seed) SKIP_SEED=true ;;
    -h|--help)
      echo "Usage: ./scripts/setup-dev.sh [--skip-seed]"
      echo ""
      echo "Sets up local dev: .env (interactive prompts), npm install, Postgres, migrate, seed."
      echo "Use --skip-seed to skip database seeding."
      exit 0
      ;;
    *) fail "Unknown option: $arg (try --help)" ;;
  esac
done

echo ""
echo "  Lighthouse — developer setup"
echo "  ============================"
echo ""

# --- Prerequisites ---
info "Checking prerequisites…"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 20+: https://nodejs.org/"
command -v npm >/dev/null 2>&1 || fail "npm not found."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
[[ "$NODE_MAJOR" -ge 20 ]] || fail "Node 20+ required (found $(node -v))."

if command -v docker >/dev/null 2>&1; then
  docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Open Docker Desktop and retry."
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    fail "docker compose not available. Update Docker Desktop."
  fi
  ok "Node $(node -v), Docker OK"
else
  fail "Docker not found. Install Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/"
fi

# --- .env ---
if [[ ! -f .env ]]; then
  info "Creating .env from .env.example…"
  cp .env.example .env
  ok ".env created"
else
  ok ".env already exists (not overwritten)"
fi

info "Checking .env…"
configure_env || true

# --- npm ---
info "Installing npm dependencies…"
npm install
ok "Dependencies installed"

# --- Postgres ---
info "Starting Postgres (docker compose)…"
$COMPOSE up -d postgres

info "Waiting for Postgres to accept connections…"
TRIES=30
until $COMPOSE exec -T postgres pg_isready -U postgres -d lighthouse >/dev/null 2>&1; do
  TRIES=$((TRIES - 1))
  [[ $TRIES -gt 0 ]] || fail "Postgres did not become ready. Check: $COMPOSE logs postgres"
  sleep 1
done
ok "Postgres is ready on localhost:5432"

# --- Database schema ---
info "Running database migrations…"
npm run db:migrate
ok "Migrations applied"

# --- Seed ---
if [[ "$SKIP_SEED" == true ]]; then
  warn "Skipping seed (--skip-seed). Run: npm run seed"
elif env_is_empty "$(env_get SEED_ADMIN_PHONE 2>/dev/null || true)"; then
  warn "SEED_ADMIN_PHONE not set — skipping seed. Run setup again or: npm run seed"
else
  info "Seeding Montauk org, properties, and admin user…"
  npm run seed
  ok "Seed complete"
fi

# --- Done ---
echo ""
echo -e "${GREEN}Setup complete.${NC}"
offer_start_dev
