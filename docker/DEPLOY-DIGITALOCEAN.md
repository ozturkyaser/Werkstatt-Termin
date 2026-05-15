# Deployment auf DigitalOcean (Docker)

## Ersteinrichtungs-Wizard (einmalig)

1. **`chmod +x start.sh && ./start.sh`** (legt bei Bedarf `.env.docker` an, baut Images, startet den Stack).
2. **`./start.sh wizard-hinweis`** oder `docker compose logs backend` – URL mit **`/einrichtung?token=`** verwenden.
3. Wizard ausfüllen → speichert **`runtime.config.json`** unter `/app/data` (Volume `werkstatt_data`). Bleibt bei **GitHub-Deploys** erhalten.
4. Optional **`PUBLIC_APP_URL`** in `.env.docker` für vollständigen Link im Log.
5. **Live-Deploys** (eine Option): **Git push** + Workflow *Deploy DigitalOcean*, oder lokal **`./deploy-wizard.sh`** / **`./deploy-to-do.sh`** (siehe unten).

---

## Deploy vom eigenen Rechner (`deploy-to-do.sh` / **Wizard**)

### Interaktiver Wizard (empfohlen)

```bash
chmod +x deploy-wizard.sh
./deploy-wizard.sh
# oder: npm run deploy:wizard
```

Der Wizard fragt **SSH** (Server, User, **SSH-Key oder Passwort**) und alle relevanten **Produktions-Variablen** (URL, JWT, Werkstatt, SMTP, Twilio). Anschließend wird automatisch **`deploy-to-do.sh`** ausgeführt (rsync + `.env.docker` auf den Server + `docker compose`).

- **Passwort-SSH** erfordert **`sshpass`** (`brew install hudochenkov/sshpass/sshpass`). Auf manchen Droplets ist nur Key-Login möglich – dann Option „SSH-Key“ wählen.
- Das SSH-Passwort wird **nicht** in `.env.deploy` geschrieben, nur für den einen Lauf exportiert.

### Manuell (`deploy-to-do.sh`)

```bash
cp .env.deploy.example .env.deploy
nano .env.deploy
chmod +x deploy-to-do.sh
./deploy-to-do.sh
```

- **Nur Code:** in `.env.deploy` kein `JWT_SECRET`/`FRONTEND_URL` → Server-`.env.docker` und `runtime.config.json` im Volume bleiben unverändert.
- **Inkl. `.env.docker`:** `JWT_SECRET` + `FRONTEND_URL` in `.env.deploy` (optional SMTP/Twilio) → Befüllung aus `docker/env.ci.template`, Upload als `.env.docker`.
- **Lokale Datei:** `DEPLOY_USE_LOCAL_ENV_DOCKER=1` in `.env.deploy` und lokale **`.env.docker`** nutzen.

**`.env.deploy`** steht in `.gitignore` — nicht committen.

---

## Variante A: Droplet mit Docker Compose (empfohlen)

1. **Droplet** anlegen (z. B. Ubuntu 24.04, 1–2 GB RAM), optional **Docker 1-Click**-Image wählen.
2. Per SSH einloggen, **Docker** + **Docker Compose Plugin** installieren (falls nicht vorhanden):
   - [DigitalOcean: Docker auf Ubuntu](https://docs.digitalocean.com/products/droplets/how-to/install-docker/)
3. Repository auf den Server klonen (oder Release-Zip entpacken).
4. **Umgebung:** Wizard nutzen (ohne `.env.docker`) **oder** `cp .env.docker.example .env.docker` und Werte setzen.
5. Start (Standard: **web** + **backend**):

   ```bash
   chmod +x start.sh && ./start.sh
   ```

   Alternativ: `docker compose up -d --build`

   **Ein Container** (Nginx + Frontend-Build + Backend im selben Image — Login & `/api` wie im Standard-Stack):

   ```bash
   chmod +x start.sh && ./start.sh install-one
   ```

   Dateien: `docker-compose.one.yml`, `Dockerfile` (Repo-Root). Logs: `./start.sh logs-one`, Wizard: `./start.sh wizard-hinweis-one`.
6. **Firewall (UFW)**: Port 80 (und 443, falls du TLS vor dem Container terminierst) öffnen.
7. **HTTPS**: entweder
   - einen **Load Balancer** mit Zertifikat davor, oder
   - **Caddy** / **Nginx** auf dem Host als TLS-Reverse-Proxy vor Port 80 des Stacks, oder
   - nur intern + **Cloudflare** „Full (strict)“.

### Persistenz

Volume `werkstatt_data`: SQLite, **`runtime.config.json`** (Wizard), Setup-Marker, `appointment-media` unter `/app/data`.

### Leistungskatalog / Demo-Daten (optional)

```bash
docker compose exec backend node src/seed.js
```

(Ein-Container-Stack: `docker compose -f docker-compose.one.yml exec app bash -lc 'cd /app/backend && node src/seed.js'`.)

### Port ändern

In `.env` auf dem Host (nicht in `.env.docker`) oder beim Start:

```bash
HTTP_PORT=8080 docker compose up -d
```

`HTTP_PORT` mappt Host-Port → Container 80 (Nginx).

---

## Variante B: DigitalOcean App Platform

Nutze das **Root-`Dockerfile`** (All-in-One: Nginx + Frontend-Build + Backend). In der App‑Komponente **Docker** wählen oder `dockerfile_path: Dockerfile` setzen; öffentlicher HTTP‑Port **8080** wie in der Oberfläche üblich.

App Platform unterstützt alternativ **zwei** Services per `docker-compose.yml` – bei nur **einer** Komponente ist das **Root‑Dockerfile** der passende Weg.

Für wenig Oberflächen-Fricke mit Volumes/Skripting: weiter **Droplet + Compose** wie oben.

---

## Öffentliches Widget / WordPress

`data-api` auf dieselbe öffentliche Basis-URL setzen, z. B.:

```html
data-api="https://ihre-domain.de/api/public"
```

Die App liefert `/api` und `/widget` über denselben Host (Nginx proxy).

---

## Automatisches Deployment & „Einstellungen“ (GitHub Actions)

DigitalOcean selbst hat **keinen** direkten Import der App-internen *Einstellungen* aus dem Werkstatt-Tool. Üblich ist: **Produktions-Variablen als GitHub Repository Secrets** pflegen; bei jedem Deploy schreibt der Workflow die Datei **`.env.docker`** auf den Droplet (gleiche Variablen wie lokal `backend/.env` / `.env.docker`).

### Ablauf

1. Repo auf GitHub pushen (dieses Repository oder ein Fork).
2. Unter **Settings → Secrets and variables → Actions** folgende Secrets setzen (mindestens die **Pflicht**-Zeilen):

| Secret | Pflicht | Bedeutung |
|--------|---------|-----------|
| `DO_HOST` | ja | Droplet-IP oder Hostname |
| `DO_SSH_USER` | ja | SSH-Benutzer (z. B. `root` oder `deploy`) |
| `DO_SSH_PRIVATE_KEY` | ja | Privater SSH-Key (kompletter PEM-Inhalt, inkl. `BEGIN`/`END`) |
| `DO_APP_DIR` | nein | Installationspfad auf dem Server (Standard: `/opt/werkstatt-termin`) |
| `DO_JWT_SECRET` | für Env-Sync | Lang, zufällig – **muss** gesetzt sein, damit `.env.docker` erzeugt wird |
| `DO_FRONTEND_URL` | für Env-Sync | Öffentliche URL, z. B. `https://termin.example.de` (ohne Slash am Ende) |
| `DO_WORKSHOP_NAME` | nein | u. a. für E-Mail-Fußzeilen |
| `DO_WORKSHOP_ADDRESS` | nein | |
| `DO_WORKSHOP_PHONE` | nein | |
| `DO_WORKSHOP_EMAIL` | nein | |
| `DO_SMTP_HOST` … `DO_SMTP_FROM` | nein | wie `backend/.env.example` |
| `DO_SMTP_PORT` / `DO_SMTP_SECURE` | nein | Standard 587 / false |
| `DO_TWILIO_*` | nein | optional SMS/WhatsApp |

3. Auf dem Droplet muss der SSH-User **Docker** ausführen dürfen (`usermod -aG docker <user>` und neu einloggen).
4. Workflow **„Deploy DigitalOcean“** läuft bei **Push auf `main`** oder manuell unter **Actions → Deploy DigitalOcean → Run workflow**.

Was passiert:

- `rsync` kopiert den Code (ohne `node_modules`, ohne `.env.docker` im Zielbaum).
- **`runtime.config.json`** liegt im Docker-Volume (`/app/data`) und wird durch den Workflow **nicht** überschrieben – Wizard-Einstellungen bleiben erhalten.
- Sind **`DO_JWT_SECRET`** und **`DO_FRONTEND_URL`** gesetzt, wird aus `docker/env.ci.template` eine **`.env.docker`** erzeugt und per `scp` auf den Droplet gelegt (überschreibt die alte Produktions-`.env.docker`).
- Anschließend: `docker compose up -d --build` im Zielverzeichnis.

**Ohne** `DO_JWT_SECRET` / `DO_FRONTEND_URL`: nur Code-Update, **bestehende** `.env.docker` auf dem Server bleibt unverändert.

### Branch anpassen

Standard ist `main`. Für einen anderen Branch in `.github/workflows/deploy-digitalocean.yml` unter `on.push.branches` ändern.

### Hinweis zu „DigitalOcean Einstellungen“

Im **DigitalOcean-Dashboard** (Droplet, Firewall, Load Balancer) legst du nur Infrastruktur fest (Ports, IPs, TLS). App-Konfiguration: **einmal** über den **Wizard** (`runtime.config.json` im Volume) und/oder **GitHub Secrets** (überschreibt bei Deploy `.env.docker`). Die Datei `runtime.config.json` im Volume hat für vorhandene Keys Vorrang vor reinen Container-Umgebungsvariablen (siehe `backend/src/loadRuntimeConfig.js`).
