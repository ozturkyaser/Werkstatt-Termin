#!/usr/bin/env bash
# Interaktiver Wizard: SSH-Zugang + Produktions-.env erfassen, anschließend automatisches Deploy.
#
# Nutzung: ./deploy-wizard.sh
#
# SSH-Passwort: erfordert sshpass (macOS: brew install hudochenkov/sshpass/sshpass)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
CYA='\033[0;36m'
RST='\033[0m'

die() { echo -e "${RED}Fehler:${RST} $*" >&2; exit 1; }
info() { echo -e "${GRN}▶${RST} $*"; }
hint() { echo -e "${CYA}ⓘ${RST} $*"; }

echo ""
echo -e "${CYA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
echo -e "  ${GRN}Werkstatt-Termin${RST} – Deploy-Wizard → DigitalOcean-Server"
echo -e "${CYA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
echo ""

# --- SSH ---
read -rp "Server-Adresse (IP oder Hostname, z. B. DigitalOcean Droplet): " DO_HOST
[[ -n "${DO_HOST// }" ]] || die "Server-Adresse darf nicht leer sein."

read -rp "SSH-Benutzer [root]: " DO_SSH_USER
DO_SSH_USER="${DO_SSH_USER:-root}"

echo ""
echo "Wie soll sich SSH anmelden?"
echo "  1) SSH-Key (empfohlen)"
echo "  2) Passwort (benötigt sshpass)"
read -rp "Auswahl [1]: " AUTH_CHOICE
AUTH_CHOICE="${AUTH_CHOICE:-1}"

DO_SSH_USE_PASSWORD=0
DO_SSH_PASSWORD=""
DO_SSH_KEY=""

if [[ "$AUTH_CHOICE" == "2" ]]; then
  command -v sshpass &>/dev/null || die "Für Passwort-Login bitte sshpass installieren: brew install hudochenkov/sshpass/sshpass  (oder apt install sshpass)"
  hint "Hinweis: Manche Server erlauben nur SSH-Keys – dann Abbruch und Option 1 wählen."
  DO_SSH_USE_PASSWORD=1
  read -rsp "SSH-Passwort: " DO_SSH_PASSWORD
  echo ""
  [[ -n "$DO_SSH_PASSWORD" ]] || die "Passwort darf nicht leer sein."
else
  read -rp "Pfad zum privaten SSH-Key [${HOME}/.ssh/id_ed25519]: " KEY_IN
  DO_SSH_KEY="${KEY_IN:-$HOME/.ssh/id_ed25519}"
  [[ -f "$DO_SSH_KEY" ]] || die "Schlüssel nicht gefunden: $DO_SSH_KEY"
fi

read -rp "Installationsordner auf dem Server [/opt/werkstatt-termin]: " DO_APP_DIR_IN
DO_APP_DIR="${DO_APP_DIR_IN:-/opt/werkstatt-termin}"

read -rp "HTTP-Port auf dem Server (Host → Nginx) [80]: " HTTP_PORT_IN
HTTP_PORT="${HTTP_PORT_IN:-80}"

echo ""
echo -e "${CYA}── Produktion (.env.docker für Docker) ──${RST}"

read -rp "Öffentliche App-URL (https://…, ohne / am Ende): " FRONTEND_URL
[[ -n "${FRONTEND_URL// }" ]] || die "FRONTEND_URL ist Pflicht (CORS & Links)."
if [[ ! "$FRONTEND_URL" =~ ^https?:// ]]; then
  die "FRONTEND_URL muss mit http:// oder https:// beginnen."
fi

read -rp "JWT Secret (Enter = automatisch 64 Hex-Zeichen): " JWT_SECRET
if [[ -z "${JWT_SECRET// }" ]]; then
  if command -v openssl &>/dev/null; then
    JWT_SECRET="$(openssl rand -hex 32)"
  else
    JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  fi
  hint "JWT_SECRET generiert (${#JWT_SECRET} Zeichen)."
fi
((${#JWT_SECRET} >= 16)) || die "JWT_SECRET muss mindestens 16 Zeichen haben."

read -rp "JWT gültig [7d]: " JWT_EXPIRES_IN
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-7d}"

read -rp "Optional: PUBLIC_APP_URL (nur für Log-Link; Enter = leer): " PUBLIC_APP_URL

read -rp "Werkstatt-Name [Fast Cars Autohaus]: " WORKSHOP_NAME
WORKSHOP_NAME="${WORKSHOP_NAME:-Fast Cars Autohaus}"

read -rp "Werkstatt-Adresse: " WORKSHOP_ADDRESS
read -rp "Werkstatt-Telefon: " WORKSHOP_PHONE
read -rp "Werkstatt-E-Mail: " WORKSHOP_EMAIL

read -rp "Erinnerung Stunden vor Termin [24]: " REMINDER_HOURS_BEFORE
REMINDER_HOURS_BEFORE="${REMINDER_HOURS_BEFORE:-24}"

echo ""
hint "SMTP (optional, Enter = überspringen)"
read -rp "SMTP_HOST: " SMTP_HOST
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
if [[ -n "${SMTP_HOST// }" ]]; then
  read -rp "SMTP_PORT [587]: " SMTP_PORT_IN
  SMTP_PORT="${SMTP_PORT_IN:-587}"
  read -rp "SMTP_SECURE true/false [false]: " SMTP_SECURE_IN
  SMTP_SECURE="${SMTP_SECURE_IN:-false}"
  read -rp "SMTP_USER: " SMTP_USER
  read -rsp "SMTP_PASS: " SMTP_PASS
  echo ""
  read -rp "SMTP_FROM (z. B. \"Name\" <mail@domain.de>): " SMTP_FROM
fi

echo ""
hint "Twilio SMS/WhatsApp (optional)"
read -rp "TWILIO_ACCOUNT_SID (Enter = überspringen): " TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER=""
TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
if [[ -n "${TWILIO_ACCOUNT_SID// }" ]]; then
  read -rsp "TWILIO_AUTH_TOKEN: " TWILIO_AUTH_TOKEN
  echo ""
  read -rp "TWILIO_FROM_NUMBER (SMS): " TWILIO_FROM_NUMBER
  read -rp "TWILIO_WHATSAPP_FROM [whatsapp:+14155238886]: " TW_WH_IN
  TWILIO_WHATSAPP_FROM="${TW_WH_IN:-whatsapp:+14155238886}"
fi

echo ""
echo -e "${YLW}Zusammenfassung:${RST}"
echo "  Server:     ${DO_SSH_USER}@${DO_HOST}"
echo "  Ziel:       ${DO_APP_DIR}"
echo "  HTTP_PORT:  ${HTTP_PORT}"
echo "  FRONTEND:   ${FRONTEND_URL}"
echo "  JWT:        (${#JWT_SECRET} Zeichen)"
echo "  Auth:       $([[ "$DO_SSH_USE_PASSWORD" == "1" ]] && echo Passwort || echo "SSH-Key ${DO_SSH_KEY}")"
echo ""
read -rp "Jetzt deployen? [j/N]: " CONF
CONF_LC=$(echo "$CONF" | tr '[:upper:]' '[:lower:]')
[[ "$CONF_LC" == "j" || "$CONF_LC" == "y" || "$CONF_LC" == "ja" ]] || { echo "Abgebrochen."; exit 0; }

# .env.deploy ohne Passwort schreiben (bash-sicher quoten)
ENVF="${ROOT}/.env.deploy"
{
  echo "# Generiert von deploy-wizard.sh – nicht committen"
  printf 'DO_HOST=%q\n' "$DO_HOST"
  printf 'DO_SSH_USER=%q\n' "$DO_SSH_USER"
  printf 'DO_APP_DIR=%q\n' "$DO_APP_DIR"
  printf 'HTTP_PORT=%q\n' "$HTTP_PORT"
  printf 'DO_SSH_USE_PASSWORD=%q\n' "$DO_SSH_USE_PASSWORD"
  if [[ "$DO_SSH_USE_PASSWORD" != "1" ]]; then
    printf 'DO_SSH_KEY=%q\n' "$DO_SSH_KEY"
  fi
  printf 'JWT_SECRET=%q\n' "$JWT_SECRET"
  printf 'JWT_EXPIRES_IN=%q\n' "$JWT_EXPIRES_IN"
  printf 'FRONTEND_URL=%q\n' "$FRONTEND_URL"
  if [[ -n "${PUBLIC_APP_URL// }" ]]; then
    printf 'PUBLIC_APP_URL=%q\n' "$PUBLIC_APP_URL"
  fi
  printf 'WORKSHOP_NAME=%q\n' "$WORKSHOP_NAME"
  printf 'WORKSHOP_ADDRESS=%q\n' "$WORKSHOP_ADDRESS"
  printf 'WORKSHOP_PHONE=%q\n' "$WORKSHOP_PHONE"
  printf 'WORKSHOP_EMAIL=%q\n' "$WORKSHOP_EMAIL"
  printf 'REMINDER_HOURS_BEFORE=%q\n' "$REMINDER_HOURS_BEFORE"
  printf 'SMTP_HOST=%q\n' "$SMTP_HOST"
  printf 'SMTP_PORT=%q\n' "$SMTP_PORT"
  printf 'SMTP_SECURE=%q\n' "$SMTP_SECURE"
  printf 'SMTP_USER=%q\n' "$SMTP_USER"
  printf 'SMTP_PASS=%q\n' "$SMTP_PASS"
  printf 'SMTP_FROM=%q\n' "$SMTP_FROM"
  printf 'TWILIO_ACCOUNT_SID=%q\n' "$TWILIO_ACCOUNT_SID"
  printf 'TWILIO_AUTH_TOKEN=%q\n' "$TWILIO_AUTH_TOKEN"
  printf 'TWILIO_FROM_NUMBER=%q\n' "$TWILIO_FROM_NUMBER"
  printf 'TWILIO_WHATSAPP_FROM=%q\n' "$TWILIO_WHATSAPP_FROM"
} > "$ENVF"
chmod 600 "$ENVF"
info ".env.deploy gespeichert (ohne SSH-Passwort)."

export DO_SSH_PASSWORD
export HTTP_PORT

if [[ ! -x "${ROOT}/deploy-to-do.sh" ]]; then
  chmod +x "${ROOT}/deploy-to-do.sh"
fi

"${ROOT}/deploy-to-do.sh"

# Passwort nicht in Subshell-Prozessliste hängen lassen
unset DO_SSH_PASSWORD
unset SSHPASS 2>/dev/null || true

echo ""
hint "Tipp: Erster Aufruf auf dem Server – ggf. Einrichtungs-Wizard im Browser, falls noch keine runtime.config.json."
hint "Die Werte aus diesem Wizard liegen in .env.deploy (Secrets) und wurden als .env.docker auf den Server kopiert."
