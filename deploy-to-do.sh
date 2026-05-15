#!/usr/bin/env bash
# Deploy von deinem Rechner auf einen DigitalOcean-Droplet (rsync + docker compose).
#
# Konfiguration: .env.deploy (siehe .env.deploy.example) oder interaktiv: ./deploy-wizard.sh
#
# SSH-Passwort: DO_SSH_USE_PASSWORD=1 und DO_SSH_PASSWORD in der Umgebung (setzt der Wizard).
# Benötigt sshpass: brew install hudochenkov/sshpass/sshpass

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GRN='\033[0;32m'
RST='\033[0m'

die() { echo -e "${RED}Fehler:${RST} $*" >&2; exit 1; }
info() { echo -e "${GRN}▶${RST} $*"; }

if [[ -f .env.deploy ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.deploy
  set +a
fi

DO_HOST="${DO_HOST:-}"
DO_SSH_USER="${DO_SSH_USER:-}"
DO_APP_DIR="${DO_APP_DIR:-/opt/werkstatt-termin}"
DO_SSH_KEY="${DO_SSH_KEY:-${HOME}/.ssh/id_rsa}"
DO_SSH_USE_PASSWORD="${DO_SSH_USE_PASSWORD:-0}"
HTTP_PORT="${HTTP_PORT:-80}"

[[ -n "$DO_HOST" ]] || die "DO_HOST fehlt (.env.deploy oder deploy-wizard.sh)."
[[ -n "$DO_SSH_USER" ]] || die "DO_SSH_USER fehlt."

if [[ "$DO_SSH_USE_PASSWORD" == "1" ]]; then
  command -v sshpass &>/dev/null || die "sshpass fehlt für Passwort-SSH (brew install hudochenkov/sshpass/sshpass)."
  [[ -n "${DO_SSH_PASSWORD:-}" ]] || die "DO_SSH_PASSWORD fehlt (von deploy-wizard gesetzt?)."
  export SSHPASS="$DO_SSH_PASSWORD"
  SSH_REMOTE_OPTS=(-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no)
  RSYNC_E='sshpass -e ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no'
  run_ssh() { sshpass -e ssh "${SSH_REMOTE_OPTS[@]}" "$DO_SSH_USER@$DO_HOST" "$@"; }
  run_scp() { sshpass -e scp "${SSH_REMOTE_OPTS[@]}" "$@"; }
else
  [[ -f "$DO_SSH_KEY" ]] || die "SSH-Key nicht gefunden: $DO_SSH_KEY"
  SSH_REMOTE_OPTS=(-i "$DO_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
  RSYNC_E=$(printf 'ssh -i %q -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' "$DO_SSH_KEY")
  run_ssh() { ssh "${SSH_REMOTE_OPTS[@]}" "$DO_SSH_USER@$DO_HOST" "$@"; }
  run_scp() { scp "${SSH_REMOTE_OPTS[@]}" "$@"; }
fi

command -v rsync &>/dev/null || die "rsync fehlt."
command -v ssh &>/dev/null || die "ssh fehlt."
command -v scp &>/dev/null || die "scp fehlt."

info "Host-Key für $DO_HOST aufnehmen (falls neu) …"
ssh-keyscan -H "$DO_HOST" 2>/dev/null >> "${HOME}/.ssh/known_hosts" || true

TARGET="${DO_SSH_USER}@${DO_HOST}:${DO_APP_DIR}/"

info "Zielverzeichnis auf dem Server …"
run_ssh "mkdir -p '${DO_APP_DIR}'"

SYNC_ENV=0
TMP_ENV="${ROOT}/.env.docker.deploy.tmp"
rm -f "$TMP_ENV"

write_env_from_template() {
  export JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-7d}"
  export REMINDER_HOURS_BEFORE="${REMINDER_HOURS_BEFORE:-24}"
  export PUBLIC_APP_URL="${PUBLIC_APP_URL:-}"
  export WORKSHOP_NAME="${WORKSHOP_NAME:-Fast Cars Autohaus}"
  export WORKSHOP_ADDRESS="${WORKSHOP_ADDRESS:-}"
  export WORKSHOP_PHONE="${WORKSHOP_PHONE:-}"
  export WORKSHOP_EMAIL="${WORKSHOP_EMAIL:-}"
  export SMTP_HOST="${SMTP_HOST:-}"
  export SMTP_PORT="${SMTP_PORT:-587}"
  export SMTP_SECURE="${SMTP_SECURE:-false}"
  export SMTP_USER="${SMTP_USER:-}"
  export SMTP_PASS="${SMTP_PASS:-}"
  export SMTP_FROM="${SMTP_FROM:-}"
  export TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
  export TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
  export TWILIO_FROM_NUMBER="${TWILIO_FROM_NUMBER:-}"
  export TWILIO_WHATSAPP_FROM="${TWILIO_WHATSAPP_FROM:-whatsapp:+14155238886}"
  if command -v envsubst &>/dev/null; then
    envsubst < docker/env.ci.template > "$TMP_ENV"
  else
    python3 <<'PY' > "$TMP_ENV"
import os, re, pathlib
p = pathlib.Path("docker/env.ci.template")
t = p.read_text(encoding="utf-8")
print(re.sub(r"\$\{([^}]+)\}", lambda m: os.environ.get(m.group(1), ""), t))
PY
  fi
}

if [[ "${DEPLOY_USE_LOCAL_ENV_DOCKER:-0}" == "1" ]]; then
  [[ -f .env.docker ]] || die "DEPLOY_USE_LOCAL_ENV_DOCKER=1, aber .env.docker fehlt."
  cp .env.docker "$TMP_ENV"
  SYNC_ENV=1
  info "Verwende lokale .env.docker."
elif [[ -n "${JWT_SECRET:-}" && -n "${FRONTEND_URL:-}" ]]; then
  export JWT_SECRET FRONTEND_URL
  write_env_from_template
  SYNC_ENV=1
  info ".env.docker aus .env.deploy erzeugt und wird hochgeladen."
else
  info "Kein Env-Upload: Server-.env.docker bleibt (JWT/FRONTEND_URL in .env.deploy nach Wizard)."
fi

info "Code per rsync …"
rsync -avz --delete \
  -e "$RSYNC_E" \
  --exclude '.git' \
  --exclude '**/node_modules' \
  --exclude 'frontend/dist' \
  --exclude 'backend/data' \
  --exclude '.env.docker' \
  --exclude '.env' \
  --exclude '.env.deploy' \
  --exclude '.github' \
  --exclude '.env.docker.deploy.tmp' \
  ./ "$TARGET"

if [[ "$SYNC_ENV" == "1" ]]; then
  info ".env.docker auf Server kopieren …"
  run_scp "$TMP_ENV" "${DO_SSH_USER}@${DO_HOST}:${DO_APP_DIR}/.env.docker"
  rm -f "$TMP_ENV"
fi

info "docker compose auf dem Server …"
run_ssh "set -euo pipefail; export HTTP_PORT='${HTTP_PORT}'; cd '${DO_APP_DIR}'; docker compose up -d --build --remove-orphans"

info "Status:"
run_ssh "cd '${DO_APP_DIR}' && docker compose ps" || true

unset SSHPASS 2>/dev/null || true

echo ""
echo -e "${GRN}Deploy abgeschlossen.${RST} http://${DO_HOST}:${HTTP_PORT}/"
