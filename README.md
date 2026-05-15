# Werkstatt-Terminkalender

Cloud-fähiges Terminkalender-System für eine Kfz-Werkstatt (z. B. **Fast Cars Autohaus**, Berlin). Enthält:

- Kundenverwaltung inkl. Fahrzeuge & Servicehistorie
- Dienstleistungskatalog (vorbefüllt mit den Leistungen von Fast Cars)
- Terminkalender (Tag / Woche / Monat) mit CRUD & Status-Workflow
- Mehrstufige Terminübersicht mit Filtern (Datum, Status, Suche)
- Druckbare Auftragszettel / Terminbestätigungen
- Mitarbeiterverwaltung mit Rollen (Admin / Mitarbeiter)
- Login mit JWT
- Automatische Erinnerungen 24 h vor Termin per **E-Mail**, **SMS (Twilio)** und **WhatsApp (Twilio)**
- **KI-Fahrzeugschein-Scan**: Foto hochladen → OpenAI/Claude liest automatisch Halter, Kennzeichen, Marke, Modell, VIN, HSN/TSN usw. und legt Kunde + Fahrzeug direkt an
- Kompakter **Kunde+Fahrzeug-Picker** direkt im Terminformular (Suche, Inline-Anlage, Scan)
- **Kapazitätsmanagement**: Bühnen/Arbeitsplätze + individuelle Arbeitszeiten, Pausen, Abwesenheiten und Skills pro Mitarbeiter
- **Verfügbarkeits-Engine**: Freie Slots werden automatisch aus Öffnungszeiten × Bühnen × Mitarbeitern × bestehenden Terminen berechnet (15-Min-Raster)
- **Online-Buchung** per öffentlicher API mit API-Keys – inkl. fertigem **WordPress-Widget** (iFrame oder JavaScript-Embed)
- **Telefon-KI-fähig**: Gleiche Public-API funktioniert für Synthflow / Retell / Vapi (Function-Calling)
- Konfigurierbarer Buchungs-Modus (sofort/manuell/smart mit Neukunden-Filter)

## Tech-Stack

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`), JWT, Nodemailer, Twilio, node-cron
- **Frontend:** React + Vite + Tailwind CSS + React Router + date-fns

## Repository auf GitHub

Das Projekt ist für Git/GitHub vorbereitet (Root-**`.gitignore`**, **`.gitattributes`**, keine Secrets im Repo).

**Erstmalig pushen:**

```bash
cd "/Pfad/zum/Werkstatt-Termin"
git init
git add .
git status    # kurz prüfen: keine .env / .env.docker / node_modules
git commit -m "Initial: Werkstatt-Terminplaner"
git branch -M main
git remote add origin https://github.com/DEIN-USER/DEIN-REPO.git
git push -u origin main
```

**Was nicht ins Repo gehört:** `backend/.env`, `.env.docker`, `.env.deploy`, Datenbankdateien unter `backend/data/` (außer `.gitkeep`). Vorlagen ohne Geheimnisse: `backend/.env.example`, `.env.docker.example`, `.env.deploy.example`.

Optional: Unter GitHub → **Actions** Secrets für automatisches Deploy wie in `docker/DEPLOY-DIGITALOCEAN.md` beschrieben.

---

## Produktion mit Docker (Server / DigitalOcean)

Auf dem Server im geklonten Repository:

```bash
chmod +x start.sh
./start.sh              # installiert: .env.docker (falls fehlt), Build, docker compose up -d
./start.sh wizard-hinweis   # Einrichtungs-URL aus den Logs
./start.sh logs         # Backend-Logs
./start.sh stop         # Container stoppen (Daten-Volumes bleiben)
```

Alternativ aus dem Projektroot: `npm run docker:up` (ruft `start.sh` auf).

**Deploy nach DigitalOcean vom Laptop:** interaktiv **`npm run deploy:wizard`** / **`./deploy-wizard.sh`** (fragt SSH + komplette `.env`), oder **`npm run deploy:do`** / **`./deploy-to-do.sh`** mit vorgefüllter `.env.deploy` (siehe `docker/DEPLOY-DIGITALOCEAN.md`).

Details, Wizard und GitHub-Deploy: **`docker/DEPLOY-DIGITALOCEAN.md`**.

---

## Schnellstart

```bash
# 1. Abhängigkeiten in beiden Projekten installieren
npm run install:all

# 2. Backend-Konfiguration kopieren
cp backend/.env.example backend/.env
# -> JWT_SECRET setzen, optional SMTP/Twilio-Daten eintragen

# 3. Seed-Daten (Leistungen + Beispiel-Mitarbeiter) laden
npm run seed

# 4. Beide Prozesse starten (Backend :4000, Frontend :5173)
npm run dev
```

Anschließend `http://localhost:5173` öffnen (Backend läuft auf Port **4100**, anpassbar in `backend/.env`).

**Erststart-Login:**

```
E-Mail:   admin@werkstatt.local
Passwort: admin123
```

Bitte **nach dem ersten Login** über *Mitarbeiter → Bearbeiten* ein neues Passwort vergeben.

---

## Wichtige `.env`-Einstellungen

| Variable | Bedeutung |
|---|---|
| `JWT_SECRET` | Beliebiger langer Zufallswert – **Pflicht in Produktion** |
| `FRONTEND_URL` | URL des Frontends (CORS), Komma-separiert möglich |
| `REMINDER_HOURS_BEFORE` | Wie viele Stunden vor dem Termin erinnert wird (Standard 24) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | E-Mail-Versand (ohne diese → Dry-Run im Log) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Für SMS & WhatsApp |
| `TWILIO_FROM_NUMBER` | Absender-Rufnummer für SMS |
| `TWILIO_WHATSAPP_FROM` | Z. B. `whatsapp:+14155238886` (Sandbox) |

Wenn keine SMTP/Twilio-Daten gesetzt sind, werden Erinnerungen lediglich ins Log geschrieben (nützlich zum Entwickeln).

> **Twilio für SMS/WhatsApp** ist optional. Das Paket wird nur geladen, wenn Credentials vorhanden sind. Zum Aktivieren:
> ```bash
> cd backend && npm install twilio
> ```

---

## Deployment (Cloud)

### Docker (z. B. DigitalOcean Droplet)

Im Repository enthalten: **`docker-compose.yml`** (Nginx + Frontend-Build + Backend), siehe **`docker/DEPLOY-DIGITALOCEAN.md`**.

```bash
cp .env.docker.example .env.docker
# .env.docker bearbeiten: JWT_SECRET, FRONTEND_URL=https://…
docker compose up -d --build
```

- Port **80** (anpassbar: `HTTP_PORT=8080 docker compose up -d`).
- Persistentes Volume für SQLite und Termin-Medien unter `/app/data` im Backend-Container.

**GitHub → DigitalOcean (automatisch):** Workflow `.github/workflows/deploy-digitalocean.yml` (rsync + optional `.env.docker` aus Repository Secrets). **Einmaliger Wizard** unter `/einrichtung` schreibt `runtime.config.json` ins Volume (bleibt bei Deploys erhalten). Details: `docker/DEPLOY-DIGITALOCEAN.md`.

### Ohne Docker (klassisch)

1. **Backend** auf einem Node-Host laufen lassen (z. B. Fly.io, Render, Railway, eigener VPS).
   - Datenbank liegt in `backend/data/werkstatt.sqlite` → als persistenten Volume einbinden.
   - Start: `npm start` (Port über `PORT` env).
2. **Frontend** statisch bauen:
   ```bash
   npm run build --prefix frontend
   ```
   Die Ausgabe (`frontend/dist`) via Nginx / Vercel / Netlify hosten und unter der gleichen Domain wie die API **reverse-proxyen** (`/api` → Backend), analog zur mitgelieferten `docker/nginx/default.conf`.
3. HTTPS verwenden und `JWT_SECRET` stark wählen.

---

## API-Überblick

| Ressource | Routen |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/register` |
| Kunden | `GET/POST/PUT/DELETE /api/customers` |
| Fahrzeuge | `GET/POST/PUT/DELETE /api/vehicles` |
| Leistungen | `GET/POST/PUT/DELETE /api/services` |
| Mitarbeiter | `GET/PUT/DELETE /api/employees` |
| Termine | `GET/POST/PUT/DELETE /api/appointments`, `PATCH /api/appointments/:id/status`, `GET /api/appointments/stats/overview` |
| Erinnerungen | `GET /api/reminders`, `POST /api/reminders/appointment/:id`, `POST /api/reminders/run-now` |
| Einstellungen | `GET /api/settings`, `PUT /api/settings` (Admin) |
| KI-Scan | `POST /api/ai/scan-vehicle-registration`, `POST /api/ai/scan-and-import` |
| Bühnen | `GET/POST/PUT/DELETE /api/bays` |
| Werkstatt-Zeiten | `GET/PUT /api/workshop/hours`, `GET/POST/DELETE /api/workshop/closures` |
| MA-Verfügbarkeit | `GET/PUT /api/employees/:id/schedule`, `…/absences`, `…/skills` |
| Kapazität | `GET /api/availability?date=&service_ids=` |
| API-Keys | `GET/POST/PATCH/DELETE /api/api-keys` (Admin) |

Alle internen Routen (außer Login) erfordern `Authorization: Bearer <jwt>`.

### Öffentliche API (für WordPress & Telefon-KI)

Authentifizierung per Header `X-API-Key: wk_live_…` (Keys in *Einstellungen → API-Zugänge* erzeugen).

| Methode | Route | Zweck |
|---|---|---|
| `GET` | `/api/public/workshop` | Werkstatt-Infos + Öffnungszeiten |
| `GET` | `/api/public/services` | Alle online buchbaren Leistungen |
| `GET` | `/api/public/availability?date=&service_ids=` | Freie Slots |
| `POST` | `/api/public/bookings` | Termin verbindlich anlegen |
| `GET` | `/api/public/bookings/:ref` | Status einer Buchung |
| `DELETE` | `/api/public/bookings/:ref` | Stornieren |

### WordPress-Einbindung

```html
<div id="werkstatt-termin"></div>
<script src="https://ihre-werkstatt.de/widget/widget.js"
        data-key="wk_live_XXXX"
        data-api="https://ihre-werkstatt.de/api/public"
        data-height="780"></script>
```

Alternativ als iFrame:

```html
<iframe src="https://ihre-werkstatt.de/widget/embed.html?api_key=wk_live_XXXX"
        width="100%" height="780"></iframe>
```

### Kapazitäts-Modell

Ein Termin belegt **gleichzeitig** eine Bühne **und** einen Mitarbeiter:

| Bühnen | Mitarbeiter | Parallel möglich | Kapazität/Tag (9h) |
|---|---|---|---|
| 1 | 1 | 1 | 9 h |
| 2 | 1 | 1 (Engpass: MA) | 9 h |
| 2 | 2 | 2 | 18 h |
| 3 | 2 | 2 (Engpass: MA) | 18 h |

Leistungen können einen bestimmten **Bühnentyp** und **Skills** voraussetzen (z. B. EV-Service → `ev_hebebuehne` + `hv`).

---

## Datenbank-Schema (SQLite)

- `users` – Mitarbeiter inkl. Rolle
- `customers` – Kunden
- `vehicles` – Fahrzeuge pro Kunde
- `services` – Dienstleistungskatalog
- `appointments` – Termine (Status: `geplant`, `bestaetigt`, `in_arbeit`, `abgeschlossen`, `storniert`; Source: `intern`, `online`, `telefon_ki`, `api`)
- `appointment_services` – Leistungen pro Termin
- `reminders` – geplante/gesendete Erinnerungen je Kanal
- `bays` – Bühnen & Arbeitsplätze
- `workshop_hours` / `workshop_closures` – Öffnungszeiten und Schließtage
- `employee_schedules` / `employee_absences` / `employee_skills` – individuelle Verfügbarkeit
- `api_keys` – externe Zugangsschlüssel für Public-API (bcrypt-gehashed)

Das Schema wird beim Start automatisch angelegt (`backend/src/db.js`).

---

## Entwicklungs-Tipps

- Erinnerungen manuell auslösen: `POST /api/reminders/run-now`
- Health-Check: `GET /api/health`
- Im Frontend: Browser-Konsole zeigt API-Fehler in Klartext an.

## Lizenz

Intern / privat.
