# Schnellstart-Guide

**Ziel**: In 30 Minuten vom Download zu einer produktiv nutzbaren Installation.

---

## Voraussetzungen

- **Node.js 18+** (prüfen: `node --version`)
- **npm 9+** (prüfen: `npm --version`)
- Ein moderner Browser (Chrome, Firefox, Edge, Safari)
- Optional: eigener SMTP-Server (Gmail, SendGrid, …) für E-Mail-Erinnerungen
- Optional: Twilio-Account für SMS/WhatsApp
- Optional: OpenAI- oder Anthropic-API-Key für KI-Fahrzeugschein-Scan

---

## 1. Installation (5 Min.)

```bash
# 1. Projekt klonen oder entpacken
cd werkstatt-termin

# 2. Dependencies installieren
npm install
npm install --prefix backend
npm install --prefix frontend
```

---

## 2. Konfiguration (5 Min.)

```bash
cp backend/.env.example backend/.env
```

Datei `backend/.env` in einem Editor öffnen und mindestens folgende Felder setzen:

```env
PORT=4100
JWT_SECRET=<ein langes, zufälliges Wort>
DATA_DIR=./data

# Werkstatt-Daten (erscheinen auf Rechnungen)
WORKSHOP_NAME=Ihre Werkstatt GmbH
WORKSHOP_ADDRESS=Musterstraße 12, 10115 Berlin
WORKSHOP_PHONE=030 12345678
WORKSHOP_EMAIL=info@werkstatt.de
```

> **Tipp für JWT_SECRET**: Öffnet im Terminal: `openssl rand -hex 32`

---

## 3. Start (1 Min.)

**Terminal 1 (Backend):**
```bash
cd backend
node src/index.js
# → läuft auf http://localhost:4100
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
# → läuft auf http://localhost:5173
```

Browser öffnen: **http://localhost:5173**

---

## 4. Erstanmeldung (1 Min.)

| Feld | Wert |
|---|---|
| E-Mail | `admin@werkstatt.local` |
| Passwort | `admin123` |

Nach dem Login unbedingt:
1. Oben rechts auf den Benutzer klicken
2. "Passwort ändern" wählen
3. Neues sicheres Passwort setzen

---

## 5. Katalog & Demo-Daten laden (2 Min.)

Im Menü: **Einstellungen → Daten & Demo**

### Variante A – Produktiv starten
1. Klick auf **🔧 Service-Katalog laden** (140 professionelle Leistungen)
2. Unter `Leistungen` einmal durchgehen, Preise anpassen
3. Unter `Bühnen` eure echten Arbeitsplätze anlegen
4. Unter `Mitarbeiter` echte Mitarbeiter eintragen + Dienstpläne setzen
5. Unter `Werkstatt-Zeiten` echte Öffnungszeiten

### Variante B – Erst testen
1. Klick auf **📦 Demo-Daten laden**
2. ✓ Das System ist voll befüllt mit Kunden, Autos, Terminen
3. Klicke dich durch: Dashboard, Kalender, Kunden, Dokumente
4. Wenn du produktiv starten willst: **⚠️ Alles löschen** → dann Variante A

---

## 6. Basisdaten einrichten (10 Min.)

### 6.1 Mitarbeiter anlegen

Menü: **Mitarbeiter → + Neuer Mitarbeiter**

Für jeden Mitarbeiter:
- Name, E-Mail, Telefon
- Rolle (Mitarbeiter oder Admin)
- **Dienstplan pro Wochentag** (z.B. Mo–Fr 8:00–17:00, Pause 12:00–13:00)
- Skills (falls zutreffend: HV-Schein, HU-Prüfer, …)

### 6.2 Bühnen anlegen

Menü: **Bühnen → + Neue Bühne**

Beispiel:
- Bühne 1: Typ "Hebebühne"
- Bühne 2: Typ "Hebebühne"
- Bühne 3: Typ "EV-Hebebühne" (falls vorhanden)
- Platz 1: Typ "Platz" (für Reifen, Diagnose)

### 6.3 Werkstatt-Zeiten

Menü: **Werkstatt-Zeiten**

Pro Wochentag:
- Von – Bis
- Oder: **geschlossen**

Plus Schließtage (Feiertage, Betriebsferien) → wichtig für Online-Buchung!

---

## 7. E-Mail-Versand einrichten (optional, 3 Min.)

In `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deinewerkstatt@gmail.com
SMTP_PASS=<app-password>
SMTP_FROM="Werkstatt <info@werkstatt.de>"
```

> Für Gmail: "App-Passwort" unter https://myaccount.google.com/apppasswords erstellen.

Backend neu starten, dann im Frontend: **Einstellungen → Test-E-Mail senden**.

---

## 8. KI-Fahrzeugschein aktivieren (optional, 2 Min.)

1. OpenAI-Account erstellen: https://platform.openai.com/
2. API-Key generieren und 5 € Guthaben einzahlen (reicht für ~5.000 Scans)
3. Im System: **Einstellungen → 🤖 KI**
4. Provider: OpenAI, Modell: `gpt-4o`, API-Key einfügen
5. Speichern
6. Im Kalender einen Termin öffnen → "Fahrzeugschein scannen" → Testen mit einem echten Fahrzeugschein-Foto

---

## 9. Online-Buchung auf Website einbinden (optional, 2 Min.)

Einfachste Variante (iFrame):

```html
<iframe
  src="https://IHRE-DOMAIN/embed/booking"
  width="100%"
  height="900"
  frameborder="0"
></iframe>
```

Und in den System-Einstellungen:
- **Einstellungen → Online-Buchung**
- Modus wählen: `auto` / `pending` / `smart` (empfohlen)
- Vorlaufzeit festlegen (z.B. mindestens 2h im Voraus buchbar)

---

## 10. Backup einrichten (MUST HAVE!, 3 Min.)

Die komplette Datenbank ist **eine einzige Datei**: `backend/data/werkstatt.sqlite`.

### Einfaches tägliches Backup

Cron-Eintrag auf Linux/Mac (`crontab -e`):

```cron
0 23 * * * cp /pfad/zu/backend/data/werkstatt.sqlite /pfad/backups/werkstatt-$(date +\%Y\%m\%d).sqlite
```

### Empfehlung
- Backups **außer Haus** speichern (Cloud: S3, Backblaze, Nextcloud)
- Mindestens 30 Tage aufbewahren
- Vor jedem größeren Update manuell sichern

---

## Einsatzbereit! Erste Schritte

1. **Heutigen ersten Termin anlegen**: Kalender → freien Slot klicken
2. **Beobachte das Dashboard**: Live-Betrieb zeigt alles im Überblick
3. **Rechnung erstellen**: Nach Fertigstellung → Termin öffnen → "📄 Rechnung"
4. **Nach einer Woche**: Buchhaltung → erste Ausgaben eintragen

---

## Häufige erste Fragen

**F: Muss ich den Server rund um die Uhr laufen lassen?**  
A: Für produktiven Einsatz ja. Empfehlung: kleiner VPS bei Hetzner/Netcup (~5 €/Monat) mit pm2 oder systemd.

**F: Kann ich das auf einem Mac zu Hause laufen lassen?**  
A: Technisch ja, aber dann ist das System nur erreichbar, wenn der Mac an ist. Nicht empfohlen für echten Betrieb.

**F: Wie aktualisiere ich das System?**  
A: Datenbank sichern, dann `git pull` + `npm install` + Backend neu starten. Schema-Migrationen laufen automatisch.

**F: Funktioniert es ohne Internet?**  
A: Lokal ja. Aber: Erinnerungen, Online-Buchung, KI-Scan, Telefon-KI brauchen Internet.

**F: Kann ich nur Teile nutzen (z.B. nur Kalender, keine Rechnungen)?**  
A: Ja, jedes Modul funktioniert unabhängig. Nicht benötigte Menüpunkte einfach ignorieren.

---

## Support

- **Handbuch**: siehe [HANDBUCH.md](./HANDBUCH.md)
- **Präsentation**: siehe [PRAESENTATION.md](./PRAESENTATION.md)
- **Fehler melden**: [Ticket-System oder E-Mail]
- **Community**: [Forum-Link]

**Viel Erfolg mit dem Werkstatt-Terminplaner! 🚗🔧**
