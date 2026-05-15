#!/usr/bin/env bash
# Werkstatt-Termin: Installation & Start unter Docker (z. B. DigitalOcean Droplet).
# Nutzung: ./start.sh   |   ./start.sh install   |   ./start.sh stop   |   ./start.sh logs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
RST='\033[0m'

die() { echo -e "${RED}Fehler:${RST} $*" >&2; exit 1; }
info() { echo -e "${GRN}▶${RST} $*"; }
warn() { echo -e "${YLW}!${RST} $*"; }

compose() {
  if docker compose version &>/dev/null; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    die "Weder 'docker compose' noch 'docker-compose' gefunden. Bitte Docker Compose installieren."
  fi
}

# All-in-One (ein Container: Nginx + Frontend + Backend)
compose_one() {
  if docker compose version &>/dev/null; then
    docker compose -f docker-compose.one.yml "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose -f docker-compose.one.yml "$@"
  else
    die "Weder 'docker compose' noch 'docker-compose' gefunden."
  fi
}

require_docker() {
  command -v docker &>/dev/null || die "Docker ist nicht installiert. Auf Ubuntu z. B.: https://docs.docker.com/engine/install/"
  docker info &>/dev/null || die "Docker-Daemon läuft nicht oder keine Berechtigung. Versuche: sudo usermod -aG docker \"\$USER\" und neu einloggen."
}

ensure_env_docker() {
  if [[ -f .env.docker ]]; then
    info ".env.docker existiert bereits — wird nicht überschrieben."
    return
  fi
  if [[ -f .env.docker.example ]]; then
    cp .env.docker.example .env.docker
    info ".env.docker aus .env.docker.example erzeugt (bitte bei Bedarf anpassen oder Wizard nutzen)."
  else
    warn ".env.docker.example fehlt — Wizard kann trotzdem genutzt werden (siehe Logs)."
  fi
}

cmd_install() {
  require_docker
  ensure_env_docker

  info "Docker-Images bauen …"
  compose build --pull

  info "Container starten …"
  compose up -d --remove-orphans

  sleep 2
  echo ""
  info "Status:"
  compose ps
  echo ""
  info "Backend-Log (Hinweis auf Einrichtungs-Wizard, falls erster Start):"
  echo "────────────────────────────────────────"
  compose logs backend --tail 40 2>/dev/null || true
  echo "────────────────────────────────────────"
  echo ""
  HTTP_PORT="${HTTP_PORT:-80}"
  local_ip=""
  if command -v hostname &>/dev/null; then
    local_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -z "$local_ip" ]]; then
    local_ip="localhost"
  fi
  echo -e "${GRN}Fertig.${RST} Web-UI: ${YLW}http://${local_ip}:${HTTP_PORT}${RST}"
  echo "  (oder deine Domain, falls DNS/TLS davor liegt)"
  echo ""
  echo "Nächste Schritte:"
  echo "  • Ersteinrichtung: ./start.sh wizard-hinweis   (oder: docker compose logs backend | grep einrichtung)"
  echo "  • Logs verfolgen:  ./start.sh logs"
  echo "  • Stoppen:         ./start.sh stop"
}

cmd_install_one() {
  require_docker
  ensure_env_docker

  info "All-in-One-Image bauen (ein Container: Web + API) …"
  compose_one build --pull

  info "Container starten …"
  compose_one up -d --remove-orphans

  sleep 2
  echo ""
  info "Status:"
  compose_one ps
  echo ""
  info "App-Log (Wizard-Hinweis bei erstem Start):"
  echo "────────────────────────────────────────"
  compose_one logs app --tail 50 2>/dev/null || true
  echo "────────────────────────────────────────"
  echo ""
  HTTP_PORT="${HTTP_PORT:-80}"
  local_ip=""
  if command -v hostname &>/dev/null; then
    local_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -z "$local_ip" ]]; then
    local_ip="localhost"
  fi
  echo -e "${GRN}Fertig (All-in-One).${RST} Web-UI: ${YLW}http://${local_ip}:${HTTP_PORT}${RST}"
  echo ""
  echo "Nächste Schritte:"
  echo "  • ./start.sh wizard-hinweis-one   (Einrichtungs-URL)"
  echo "  • ./start.sh logs-one"
  echo "  • ./start.sh stop-one"
}

cmd_stop() {
  require_docker
  info "Container stoppen …"
  compose down
}

cmd_stop_one() {
  require_docker
  info "All-in-One-Container stoppen …"
  compose_one down
}

cmd_logs() {
  require_docker
  compose logs -f backend
}

cmd_logs_one() {
  require_docker
  compose_one logs -f app
}

cmd_wizard_hint() {
  require_docker
  echo "Suche nach Einrichtungs-URL im Backend-Log …"
  compose logs backend 2>/dev/null | grep -iE 'einrichtung|ersteinrichtung|setup-token|/einrichtung' || warn "Kein passender Log-Eintrag — ggf. Einrichtung schon abgeschlossen. Roh-Log: docker compose logs backend --tail 80"
}

cmd_wizard_hint_one() {
  require_docker
  echo "Suche nach Einrichtungs-URL im All-in-One-Log …"
  compose_one logs app 2>/dev/null | grep -iE 'einrichtung|ersteinrichtung|setup-token|/einrichtung' || warn "Kein passender Log-Eintrag — ggf. Einrichtung schon abgeschlossen. Roh-Log: docker compose -f docker-compose.one.yml logs app --tail 80"
}

cmd_help() {
  cat <<EOF
Werkstatt-Termin – Start / Installation (Docker)

  ./start.sh              Installation + Start (Standard)
  ./start.sh install      dasselbe
  ./start.sh stop         Container stoppen (Volumes bleiben)
  ./start.sh logs         Backend-Logs folgen (Strg+C beenden)
  ./start.sh wizard-hinweis  Einrichtungs-URL aus Logs filtern
  ./start.sh help         diese Hilfe

All-in-One (ein Container, Nginx + API + UI):
  ./start.sh install-one      bauen & starten (docker-compose.one.yml)
  ./start.sh stop-one         stoppen
  ./start.sh logs-one         Logs (Service app)
  ./start.sh wizard-hinweis-one

Umgebung:
  HTTP_PORT=8080 ./start.sh    Web auf Host-Port 8080 (Standard: 80)

Voraussetzungen: Docker + Docker Compose Plugin, Ausführung im Projektroot (wo docker-compose.yml liegt).
EOF
}

main() {
  case "${1:-install}" in
    install|start) cmd_install ;;
    install-one|start-one) cmd_install_one ;;
    stop)          cmd_stop ;;
    stop-one)      cmd_stop_one ;;
    logs)          cmd_logs ;;
    logs-one)      cmd_logs_one ;;
    wizard-hinweis) cmd_wizard_hint ;;
    wizard-hinweis-one) cmd_wizard_hint_one ;;
    help|-h|--help) cmd_help ;;
    *) die "Unbekannter Befehl: ${1:-} — ./start.sh help" ;;
  esac
}

main "$@"
