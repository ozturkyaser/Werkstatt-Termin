# Werkstatt-Terminplaner – Ausführliches Handbuch

**Version 1.0** · Stand 2026

---

## Inhaltsverzeichnis

1. [Einführung & Überblick](#1-einführung--überblick)
2. [Systemarchitektur](#2-systemarchitektur)
3. [Installation & Setup](#3-installation--setup)
4. [Erstanmeldung & Rollen](#4-erstanmeldung--rollen)
5. [Die Benutzeroberfläche](#5-die-benutzeroberfläche)
6. [Dashboard](#6-dashboard)
7. [Kalender](#7-kalender)
8. [Terminverwaltung](#8-terminverwaltung)
9. [Kunden & Fahrzeuge](#9-kunden--fahrzeuge)
10. [Service-Katalog (Dienstleistungen)](#10-service-katalog-dienstleistungen)
11. [Dokumente (Angebot · Rechnung · Storno)](#11-dokumente-angebot--rechnung--storno)
12. [Buchhaltung](#12-buchhaltung)
13. [Mitarbeiter, Bühnen & Werkstatt-Zeiten](#13-mitarbeiter-bühnen--werkstatt-zeiten)
14. [Einstellungen](#14-einstellungen)
15. [KI-Fahrzeugschein-Scan](#15-ki-fahrzeugschein-scan)
16. [Online-Buchung & WordPress-Einbindung](#16-online-buchung--wordpress-einbindung)
17. [Schnittstellen / API für externe Systeme](#17-schnittstellen--api-für-externe-systeme)
18. [Telefon-KI-Integration](#18-telefon-ki-integration)
19. [CSV-Import & Export](#19-csv-import--export)
20. [Demo-Daten & Reset](#20-demo-daten--reset)
21. [Erinnerungen (E-Mail, SMS, WhatsApp)](#21-erinnerungen-e-mail-sms-whatsapp)
22. [DATEV-Anbindung](#22-datev-anbindung)
23. [Digitales Arbeitsprotokoll (Kennzeichen-KI, Checkliste, Unterschrift)](#23-digitales-arbeitsprotokoll)
24. [Typische Arbeitsabläufe](#24-typische-arbeitsabläufe)
25. [Sicherheit, Backup, DSGVO](#25-sicherheit-backup-dsgvo)
26. [Troubleshooting / FAQ](#26-troubleshooting--faq)
27. [Glossar](#27-glossar)
28. [Reifen-Einlagerung und Saison-E-Mails](#28-reifen-einlagerung-und-saison-e-mails)

---

## 1. Einführung & Überblick

Der **Werkstatt-Terminplaner** ist ein vollständiges Verwaltungssystem für Kfz-Werkstätten. Er kombiniert
in einer Oberfläche alles, was eine moderne Werkstatt täglich braucht:

- **Terminverwaltung** mit Kalender, Ressourcen (Mitarbeiter + Bühnen) und automatischer Puffer-Planung
- **Kunden- und Fahrzeugstamm** mit Historie und Service-Timeline
- **Service-Katalog** mit 140 vordefinierten Leistungen, Kategorien und Komplexitätsstufen
- **Dokumente**: Angebote, Rechnungen, Stornos, Gutschriften mit druckbarer PDF-Ansicht
- **Buchhaltung**: Einnahmen- und Ausgabenverwaltung mit Monatsübersichten und Charts
- **DATEV-Export**: EXTF-Buchungsstapel (SKR03/SKR04) direkt importierbar beim Steuerberater
- **Online-Terminbuchung** über WordPress-Widget oder iFrame – 24/7 ohne Anruf
- **KI-Funktionen**: Fahrzeugschein scannen, Telefon-KI-Schnittstelle für Termin-Entgegennahme
- **Erinnerungen** per E-Mail, SMS und WhatsApp, automatisiert
- **Dashboard** mit Live-Betrieb, Statistiken und Auslastungs-Heatmap
- **Digitales Arbeitsprotokoll** mit Kennzeichen-KI, Checklisten und digitaler Unterschrift des Mitarbeiters

### Für wen ist es gedacht?

- Inhaber-geführte Einzel-Werkstätten (1–3 Mitarbeiter, 1–4 Bühnen)
- Mittelgroße Kfz-Betriebe (5–20 Mitarbeiter, mehrere Standorte)
- Spezialwerkstätten (Karosserie, EV, Reifen, Klima)
- Freie Werkstätten mit Online-Terminbuchung

### Was es ersetzt

- Papier-Terminbuch und Excel-Tabellen
- Mehrere parallele Tools für Termine / Rechnungen / Buchhaltung
- Manuelle Erinnerungsanrufe
- Separate Plattformen für Online-Terminbuchung

---

## 2. Systemarchitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    KUNDEN & KANÄLE                          │
│  Werkstatt-Team   Telefon-KI   WordPress-Widget   Kunde     │
│       │              │               │               │      │
└───────┼──────────────┼───────────────┼───────────────┼──────┘
        │              │               │               │
        ▼              ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│           FRONTEND (React + Vite + TailwindCSS)             │
│  Kalender · Dashboard · Dokumente · Buchhaltung · Stammdaten │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST / JSON
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Node.js + Express)                    │
│  Auth · Termine · Kunden · Rechnungen · KI · Public API     │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   ┌──────────┐      ┌────────────┐     ┌─────────────┐
   │ SQLite   │      │ Mailer     │     │ OpenAI /    │
   │ Datenbank│      │ Twilio SMS │     │ Anthropic   │
   │ (Datei)  │      │ WhatsApp   │     │ (KI-Scan)   │
   └──────────┘      └────────────┘     └─────────────┘
```

### Technologie-Stack

| Komponente | Technologie | Warum |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | Schnell, modern, exzellente Dev-Experience |
| Backend | Node.js + Express | Weit verbreitet, einfach zu hosten |
| Datenbank | SQLite (better-sqlite3) | Keine Server-Installation nötig, eine Datei zum Backup |
| Authentifizierung | JWT + bcrypt | Sicherer Passwort-Hash, tokenbasierte Sessions |
| Charts | Recharts | Interaktive Diagramme für Dashboard |
| Erinnerungen | Nodemailer + Twilio | E-Mail, SMS, WhatsApp |
| KI-Vision | OpenAI GPT-4o / Claude | Fahrzeugschein-Scan |
| Scheduler | node-cron | Automatische Reminder-Jobs |

### Verzeichnisstruktur

```
Werkstatt Termin/
├── backend/
│   ├── src/
│   │   ├── index.js              (Express-Server, Routen-Registrierung)
│   │   ├── db.js                 (SQLite-Schema & Migrationen)
│   │   ├── auth.js               (JWT, bcrypt)
│   │   ├── middleware/auth.js
│   │   ├── routes/               (REST-Endpunkte)
│   │   │   ├── auth.js
│   │   │   ├── customers.js
│   │   │   ├── vehicles.js
│   │   │   ├── appointments.js
│   │   │   ├── services.js       (inkl. CSV-Export/Import)
│   │   │   ├── documents.js      (Rechnungen, Angebote, Storno)
│   │   │   ├── expenses.js       (Buchhaltung)
│   │   │   ├── dashboard.js      (Live, Stats, Auslastung)
│   │   │   ├── employees.js
│   │   │   ├── bays.js
│   │   │   ├── workshop.js
│   │   │   ├── reminders.js
│   │   │   ├── settings.js
│   │   │   ├── ai.js             (KI-Fahrzeugschein)
│   │   │   ├── apikeys.js
│   │   │   ├── public.js         (externe API + WordPress)
│   │   │   └── admin.js          (Seed, Reset, Katalog-Import)
│   │   ├── services/             (Business-Logik)
│   │   │   ├── availability.js   (Slot-Berechnung)
│   │   │   ├── reminders.js      (Cron-Jobs)
│   │   │   └── ai.js
│   │   └── seeds/
│   │       └── service-catalog.json  (140 Leistungen)
│   ├── data/
│   │   └── werkstatt.sqlite      (Datenbank-Datei)
│   └── .env
└── frontend/
    └── src/
        ├── App.jsx               (Routing)
        ├── context/AuthContext.jsx
        ├── lib/api.js            (API-Client)
        ├── components/           (wiederverwendbare UI-Teile)
        └── pages/                (Seiten pro Route)
```

---

## 3. Installation & Setup

### Voraussetzungen

- **Node.js** 18 oder höher
- **npm** 9 oder höher
- Optional: eigene Domain und SSL-Zertifikat für Produktion

### Installation

```bash
git clone <repo-url> werkstatt-termin
cd werkstatt-termin
npm install                    # Root-Deps
npm install --prefix backend
npm install --prefix frontend
```

### Konfiguration

`backend/.env` anlegen (siehe `.env.example`):

```env
PORT=4100
JWT_SECRET=bitte-ein-langes-zufallswort
DATA_DIR=./data

# Werkstatt-Stammdaten (erscheinen auf Dokumenten)
WORKSHOP_NAME=Meine Autowerkstatt GmbH
WORKSHOP_ADDRESS=Musterstraße 12, 10115 Berlin
WORKSHOP_PHONE=030 12345678
WORKSHOP_EMAIL=info@werkstatt.de

# E-Mail-Versand (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Meine Werkstatt <info@werkstatt.de>"

# SMS & WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### Starten

```bash
# Backend (Terminal 1)
cd backend && node src/index.js
# → läuft auf http://localhost:4100

# Frontend (Terminal 2)
cd frontend && npm run dev
# → läuft auf http://localhost:5173
```

Im Browser öffnen: **http://localhost:5173**

### Produktions-Deployment

Empfohlen:
- Frontend als statischer Build (`npm run build` → `dist/`)
- Backend hinter einem Reverse Proxy (Nginx oder Caddy) mit SSL
- Process Manager: `pm2` oder `systemd`

---

## 4. Erstanmeldung & Rollen

### Initialer Admin-Account

Beim ersten Start wird automatisch ein Admin-Account angelegt:

| Feld | Wert |
|---|---|
| E-Mail | `admin@werkstatt.local` |
| Passwort | `admin123` |

> **Unbedingt nach dem ersten Login ändern!**

### Rollen

| Rolle | Kann |
|---|---|
| **Admin** | Alles: Stammdaten anlegen/löschen, Einstellungen, Rechnungen, Buchhaltung, Benutzer verwalten |
| **Mitarbeiter** | Termine anlegen/bearbeiten, Kunden/Fahrzeuge anlegen, Status ändern, Erinnerungen versenden. **Keine** Einstellungen, **keine** Buchhaltung |

### Weitere Benutzer anlegen

`Mitarbeiter → + Neuer Mitarbeiter`. Jeder Mitarbeiter ist automatisch auch ein Login-Account für das System.

---

## 5. Die Benutzeroberfläche

### Layout

- **Linke Seitenleiste**: Hauptnavigation mit Icon und Label
- **Obere Leiste**: Angemeldeter Benutzer, Rolle, Logout
- **Hauptbereich**: Die aktive Seite

### Navigation im Überblick

| Menüpunkt | Zweck |
|---|---|
| 📊 Dashboard | Tagesübersicht & Statistiken |
| 📅 Kalender | Drag-and-Drop-Terminplanung |
| 🗂️ Termine | Tabellenansicht aller Termine |
| 👥 Kunden | Kundenstamm |
| 🚗 Fahrzeuge | Fahrzeugstamm |
| 🔧 Leistungen | Service-Katalog |
| 📄 Dokumente | Angebote, Rechnungen, Stornos |
| 💶 Buchhaltung | Einnahmen / Ausgaben |
| 🏗️ Bühnen | Arbeitsplatz-Verwaltung |
| 🕑 Werkstatt-Zeiten | Öffnungs- und Schließzeiten |
| 👷 Mitarbeiter | Team-Verwaltung |
| ⚙️ Einstellungen | Konfiguration |

---

## 6. Dashboard

Das Dashboard hat drei Tabs: **Live-Betrieb**, **Statistik**, **Auslastung**.

### 6.1 Live-Betrieb

Echtzeitansicht des aktuellen Werkstatt-Tages.

**KPIs oben:**
- Termine heute gesamt
- In Arbeit
- Geplant (noch offen)
- Abgeschlossen
- Umsatz heute

**Bühnen-Status:**
Für jede Bühne wird angezeigt:
- Was wird gerade bearbeitet (Kunde, Fahrzeug, Leistung)
- Die Warteschlange für den Rest des Tages
- Wie viele Aufträge schon fertig sind

**Mitarbeiter-Status:**
- 🟢 **Arbeitet gerade** an einem konkreten Auftrag
- 🟡 **Wartet** (kein aktueller Auftrag, aber plangemäß da)
- 🔵 **Frei** (weitere Aufträge an diesem Tag)
- 🟠 **Abwesend** (Urlaub, krank)
- ⚪ **Nicht eingeteilt** (hat heute keinen Dienst)

**Banner für Online-Buchungen**: Wenn Kunden online gebucht haben und noch bestätigt werden müssen, erscheint oben ein Hinweis mit direktem "Bestätigen"-Button.

### 6.2 Statistik

Historische Auswertung (7, 14, 30, 60, 90 Tage).

- Abgeschlossene Termine gesamt
- Umsatz
- Durchschnittliche geplante vs. tatsächliche Dauer (wichtig für Planungsqualität!)
- Top-Leistungen
- Termine pro Tag (Balkendiagramm)
- Status-Verteilung
- Mitarbeiter-Performance

### 6.3 Auslastung (dynamische Visualisierung)

Der Herzstück-Tab für Werkstattleiter.

**Ressourcen-Switch**: Bühnen ⇄ Mitarbeiter

**Zeitraum**: 7, 14, 30, 60, 90 Tage

**Visualisierungen:**
1. **KPI-Zeile**: Aktive Ressourcen, Ø Auslastung in %, Top/Flop
2. **Balkendiagramm**: Auslastung pro Bühne/Mitarbeiter, farbcodiert
   - Grau = unter 40%
   - Grün = 40–70% (optimal)
   - Bernstein = 70–90%
   - Rot = über 90% (Überlastung)
   - **Klick auf Balken** → zeigt die tägliche Trend-Linie für diese Ressource
3. **Linien-Diagramm**: Tägliche Auslastung über den Zeitraum
4. **Heatmap (7×24)**: Wochentag × Stunde, zeigt Spitzenzeiten
5. **Detail-Tabelle**: Verfügbare/genutzte Minuten, Terminanzahl, % pro Ressource

So erkennst du sofort:
- Welche Bühne läuft über? → Bühne dazu kaufen?
- Welcher Mitarbeiter ist unter-/überlastet?
- Wann sind die Peak-Zeiten? → Personalplanung optimieren

---

## 7. Kalender

Der Kalender ist die tägliche Arbeitsfläche.

### Ansichten

- **Tag**: Alle Termine eines Tages, Spalte pro Mitarbeiter oder Bühne
- **Woche**: 7-Tages-Übersicht
- **Monat**: Komprimierte Sicht

### Einen Termin erstellen

1. **Klick in einen freien Slot** → Termin-Dialog öffnet sich
2. Kunde wählen (oder **inline neu anlegen**)
3. Fahrzeug wählen (oder **inline neu anlegen**, oder per KI-Fahrzeugschein-Scan)
4. Leistungen auswählen → System berechnet automatisch Dauer + Puffer
5. Mitarbeiter / Bühne zuweisen (oder automatischen Vorschlag nehmen)
6. Speichern

### Termin verschieben / ändern

- **Drag-and-Drop** verschiebt Termine
- Größe ziehen ändert die Dauer
- Klick öffnet Details

### Farbschema

Jede Leistungs-Kategorie hat eine eigene Farbe (aus dem Katalog):
- Blau: Inspektion
- Grün: Öl & Flüssigkeiten
- Rot: Bremsen
- Orange: Reifen
- Violett: Fahrwerk
- Gelb: Elektrik
- …

So erkennt man sofort auf einen Blick, welche Arbeiten wann anstehen.

---

## 8. Terminverwaltung

### Termin-Status

| Status | Bedeutung |
|---|---|
| **Geplant** | Noch nicht final bestätigt (z.B. Online-Buchung, wartet auf Freigabe) |
| **Bestätigt** | Fest eingeplant |
| **In Arbeit** | Mechaniker hat begonnen (→ Ist-Startzeit wird gesetzt) |
| **Abgeschlossen** | Fertig (→ Ist-Endzeit wird gesetzt, Rechnung kann erstellt werden) |
| **Storniert** | Abgesagt, Slot wird frei |

Das **Aufzeichnen von Ist-Zeiten** (automatisch beim Statuswechsel) ermöglicht später die Auswertung:
*War die geplante Dauer realistisch? Wo verlieren wir Zeit?*

### Einen Termin detailliert betrachten

Die Termin-Detailseite zeigt:
- Kunde + Fahrzeug (anklickbar zu Stammdaten)
- Leistungen mit Einzelpreisen
- Mitarbeiter & Bühne
- Geplante Zeit vs. tatsächliche Zeit
- Notizen (intern und für Kunden)
- Erinnerungen (gesendet / geplant)

**Aktionen aus der Detail-Ansicht:**
- ✏️ Bearbeiten
- 🖨️ Werkstatt-Auftrag drucken (Laufzettel für den Mechaniker)
- 📄 Rechnung erstellen (→ zieht automatisch alle Leistungen in eine neue Rechnung)
- 📝 Angebot erstellen
- 🗑️ Löschen

### Werkstatt-Druck (Laufzettel)

Unter `/termin/:id/drucken` öffnet sich eine druckfreundliche Version:
- Kunde + Fahrzeug-Daten
- Liste aller Arbeiten mit Dauer-Schätzung
- Notizen
- Unterschriftsfelder für Übergabe und Abholung

---

## 9. Kunden & Fahrzeuge

### Kundenstamm

Pro Kunde werden gespeichert:
- Name, E-Mail, Telefon, WhatsApp-Nummer
- Adresse
- Notizen
- **Erinnerungs-Präferenzen** pro Kanal (E-Mail, SMS, WhatsApp)

Die Kunden-Detailseite zeigt:
- Alle Fahrzeuge des Kunden
- Alle Termine (chronologisch)
- Alle Dokumente (Rechnungen, Angebote)
- Gesamt-Umsatz

### Fahrzeugstamm

Pro Fahrzeug:
- Kennzeichen, Marke, Modell, Baujahr
- Kraftstoff (Benzin / Diesel / Hybrid / Elektro)
- Farbe, Kilometerstand
- FIN (Fahrzeug-Identifikationsnummer)
- HU-/AU-Daten
- Verknüpfung zu einem oder mehreren Kunden (z.B. Firmenwagen)

Die Fahrzeug-Detailseite zeigt die **komplette Service-Historie** mit allen Reparaturen und Inspektionen.

### Inline-Anlage bei Terminerstellung

Beim Neuanlegen eines Termins musst du nicht vorher Kunde/Fahrzeug anlegen – beides geht direkt im Termin-Dialog:

- **Neuer Kunde**: Minimal Name + Telefon reichen, Rest kann später ergänzt werden
- **Neues Fahrzeug**: Kennzeichen + Marke + Modell reicht
- **Oder**: KI-Fahrzeugschein-Scan (siehe Kapitel 15) – Kunde und Fahrzeug werden in einem Schritt angelegt

---

## 10. Service-Katalog (Dienstleistungen)

Der Katalog enthält **140 vorgefertigte Leistungen in 16 Kategorien**, basierend auf einem professionellen Werkstatt-Standard.

### Kategorien

| Kategorie | Anzahl | Typische Leistungen |
|---|---|---|
| Motor | 20 | Zahnriemen, DPF, Turbo, AGR |
| Fahrwerk & Lenkung | 15 | Stoßdämpfer, Querlenker, Radlager |
| Öl & Flüssigkeiten | 13 | Ölwechsel, Getriebeöl, Kühlmittel |
| Bremsen | 11 | Beläge, Scheiben, Sattel, Schlauch |
| Reifen & Räder | 10 | Wechsel, Montage, RDKS, Einlagerung |
| Zusatz & Komfort | 10 | Aufbereitung, Marderschutz, Standheizung |
| Elektrik & Elektronik | 9 | Batterie, Lichtmaschine, Codierung |
| Inspektion & Wartung | 8 | Kleine/Große Inspektion, Winter-Check |
| Karosserie & Smart Repair | 7 | Dellen, Lack, AHK |
| Beleuchtung | 6 | Glühbirnen, LED, Xenon |
| Klimaanlage & Heizung | 6 | Kältemittel, Desinfektion, Kompressor |
| Scheiben & Glas | 6 | Steinschlag, Scheibentausch |
| Diagnose & Fehlersuche | 5 | Standard-Diagnose, Elektrik, CAN |
| HU / AU & Prüfungen | 5 | TÜV-Vorbereitung, AU, Oldtimer |
| Saisonservice | 5 | Reifenwechsel-Express, Klima-Check |
| Getriebe & Antrieb | 4 | Kupplung, DSG, Differential |

### Datenfelder pro Leistung

| Feld | Beschreibung |
|---|---|
| **Code** | Interner Kurzcode (z.B. `BRE-05`) |
| **Name** | Anzeigename |
| **Kategorie** | Gruppierung + Farbe |
| **Beschreibung** | Umfang der Arbeit |
| **Dauer min/max** | Realistische Arbeitszeit-Spanne |
| **Puffer vor** | Zeit für Annahme, Schadensdoku |
| **Puffer nach** | Zeit für Probefahrt, Wäsche, Übergabe |
| **Komplexität** | 1–4 (beeinflusst Online-Buchbarkeit) |
| **Hebebühne** | Ob eine benötigt wird |
| **Skills** | Benötigte Qualifikation (z.B. HV-Schein, HU) |
| **Farbe** | HEX-Code für Kalender-Darstellung |
| **Online buchbar** | Automatisch abgeleitet: K1–K2 ja, K3–K4 nein |
| **Preis** | Werkstatt-individuell, wird bei Import behalten |

### Komplexitäts-Skala

| Stufe | Bedeutung | Online buchbar? |
|---|---|---|
| **1 – Einfach** | Ölwechsel, Birnenwechsel, Reifendruck | ✅ automatisch |
| **2 – Mittel** | Bremsen, Klimaservice, Batterie | ✅ automatisch |
| **3 – Komplex** | Stoßdämpfer, Kupplung, Turbo | ⚠️ nur mit Bestätigung |
| **4 – Sehr komplex** | Steuerkette, Einspritzdüsen | ⚠️ nur mit Bestätigung |

### Import / Export

- **CSV-Export**: `Leistungen → ⬇ CSV-Export` – lädt alle Leistungen mit allen Feldern
- **CSV-Import mit Mapping**: siehe [Kapitel 19](#19-csv-import--export)
- **Standard-Katalog laden**: `Einstellungen → Daten & Demo → Service-Katalog laden`
  - "Ergänzen": nur neue Einträge anlegen, bestehende Preise behalten
  - "Frisch laden": ungenutzte alte Einträge löschen, belegte deaktivieren

---

## 11. Dokumente (Angebot · Rechnung · Storno)

### Dokumenttypen

| Typ | Zweck | Prefix | Typische Status |
|---|---|---|---|
| **Angebot** | Unverbindliche Preisauskunft | `AN-2026-0001` | Entwurf → Offen → Angenommen / Abgelehnt |
| **Rechnung** | Verbindliche Forderung | `RE-2026-0001` | Offen → Teilweise bezahlt → Bezahlt |
| **Storno** | Rechnungs-Rückbuchung | `ST-2026-0001` | Immer "Storniert" mit negativen Werten |
| **Gutschrift** | Rückzahlung | `GS-2026-0001` | Entwurf → Offen → Bezahlt |

**Nummernkreise** laufen pro Jahr pro Typ, formatiert als `<TYP>-<JAHR>-<NNNN>` (vierstellig, führende Nullen).

### Dokument erstellen

**Drei Wege:**

1. **Aus dem Termin heraus**:
   - Termindetail öffnen → Button "📄 Rechnung" oder "📝 Angebot"
   - Alle Leistungen werden automatisch übernommen
   - Kunde + Fahrzeug ebenfalls
   - Nummer wird vergeben, Druckansicht öffnet sich sofort

2. **Manuell über Dokumente-Seite**:
   - `Dokumente → + Rechnung` oder `+ Angebot`
   - Kunde wählen (mit Suchfeld)
   - Fahrzeug zuordnen (optional)
   - Positionen: Leistung aus Katalog wählen ODER freie Position eingeben
   - Menge, Einheit, Einzelpreis, Rabatt % anpassen
   - Live-Berechnung Netto / MwSt / Brutto

3. **Angebot → Rechnung umwandeln**:
   - Im Dokumente-Listing auf `→ Rechnung` beim Angebot klicken
   - Erstellt eine neue Rechnung mit denselben Positionen
   - Angebot wird auf "Angenommen" gesetzt
   - Beide Dokumente sind über `related_document_id` verknüpft

### Dokument stornieren

Nur Rechnungen können storniert werden.

- Im Listing `Storno`-Button klicken
- System erstellt automatisch eine Stornorechnung mit **negativen** Beträgen
- Ursprüngliche Rechnung bekommt Status "Storniert"
- Beide sind verlinkt

### Druckansicht / PDF

- Jedes Dokument hat eine **HTML-Druckansicht** unter `/api/documents/:id/print`
- Button 🖨️ öffnet sie in einem neuen Tab
- "Drucken"-Button in der Ansicht → Browser-Druckdialog → **"Als PDF speichern"** möglich
- Druckansicht enthält:
  - Werkstatt-Briefkopf (aus `.env`-Einstellungen)
  - Kunden- und Fahrzeugadresse
  - Positionstabelle
  - Netto / MwSt / Brutto-Summen
  - Zahlungshinweis oder Angebots-Gültigkeit
  - Status-Badge (farbig)

### Zahlungen erfassen

- In der Liste: Button ✓ **Bezahlt** setzt Status und Zahlungsdatum
- Im Editor: Feld "Bezahlter Betrag" und "Zahlungsdatum" manuell setzen
- Teilzahlungen möglich über Status "Teilweise bezahlt" und Feld `paid_amount`

### Filter und Suche

Die Dokumentliste lässt sich filtern nach:
- Typ (Angebot / Rechnung / Storno / Gutschrift)
- Status (Offen / Bezahlt / Storniert / …)
- Zeitraum
- Volltextsuche (Nummer, Kundenname)

KPIs oben zeigen immer die Summen der aktuell gefilterten Liste:
- Anzahl
- Gesamt brutto
- Offene Posten (nicht bezahlt)
- Offene Rechnungen (Anzahl)

---

## 12. Buchhaltung

Unter **Buchhaltung** (nur Admin) verwaltest du Ausgaben und siehst die Gesamt-Finanzlage.

### 12.1 Tab "Übersicht"

**KPIs**:
- Einnahmen (brutto) – aus allen Rechnungen + Gutschriften - Stornos des gewählten Jahres
- Ausgaben (brutto) – aus allen Ausgaben
- **Gewinn (netto)** – Differenz
- Offene Rechnungen – Summe der unbezahlten Brutto-Beträge

**Diagramme**:

1. **Balkendiagramm**: Einnahmen (grün) vs. Ausgaben (rot) pro Monat des Jahres
2. **Kreisdiagramm**: Ausgaben nach Kategorie mit Prozentanteilen
3. **Monatstabelle**: Pro Monat Einnahmen, Ausgaben, Gewinn + Jahressummen

### 12.2 Tab "Ausgaben"

Vollständige CRUD-Verwaltung.

**Pro Ausgabe**:
- Datum
- Kategorie (10 vordefinierte: Ersatzteile, Werkzeug, Miete, Strom/Wasser, Versicherung, Marketing, Bürobedarf, Fahrzeugkosten, Verbrauchsmaterial, Sonstiges)
- Lieferant
- Beschreibung
- Netto-Betrag + MwSt-Satz → **Brutto wird automatisch berechnet**
- Zahlungsart (Überweisung / Bar / Karte / PayPal / Lastschrift)
- Rechnungsnummer des Lieferanten
- Notiz

**Filter**: Zeitraum, Kategorie, Volltextsuche

**CSV-Export**: Mit einem Klick alle Ausgaben des Jahres als Excel-kompatible CSV

### Wie Einnahmen erfasst werden

Einnahmen werden **nicht** separat erfasst – sie ergeben sich automatisch aus den **bezahlten Rechnungen**. Das ist die saubere Lösung, weil:
- Jede Rechnung hat ihre eigene Nummer
- Status "Bezahlt" = Einnahme
- Storno hat negative Summen → reduziert den Umsatz automatisch

### 12.3 DATEV-Export

Oben rechts auf der Buchhaltung-Seite findest du den Button **🧾 DATEV-Export**.
Damit erzeugst du einen DATEV-Buchungsstapel (EXTF 7.00) für deinen Steuerberater –
Einnahmen und Ausgaben werden automatisch auf die passenden Sachkonten gebucht.

→ Vollständige Beschreibung siehe [Kapitel 22 – DATEV-Anbindung](#22-datev-anbindung).

---

## 13. Mitarbeiter, Bühnen & Werkstatt-Zeiten

### 13.1 Mitarbeiter

Jeder Mitarbeiter ist:
- Ein Account mit E-Mail + Passwort (Login-fähig)
- Eine Ressource, die im Kalender eingeplant werden kann

**Stammdaten**:
- Name, E-Mail, Telefon, Rolle (Admin / Mitarbeiter)
- Aktiv / Inaktiv (inaktive erscheinen nicht mehr im Kalender)

**Dienstplan** (pro Wochentag):
- Anfangs- und Endzeit
- Mittagspause (Start / Ende)

**Qualifikationen (Skills)**: z.B. `hv` (Hochvolt), `hu` (HU-Prüfer), `karosserie`, `diagnose`, `klima`, `getriebe`. 
→ Wird im System geprüft: eine Leistung mit Skill `hv` kann nur einem Mitarbeiter mit diesem Skill zugeordnet werden.

**Abwesenheiten**: Urlaub, Krankheit – System blockt automatisch die Verfügbarkeit in diesem Zeitraum.

### 13.2 Bühnen (Arbeitsplätze)

**Typen**:
- `hebebuehne` – normale Hebebühne
- `ev_hebebuehne` – für Elektroautos (mit HV-Absicherung)
- `platz` – Arbeitsplatz ohne Bühne (z.B. für Diagnose)
- `spezial` – Lackierkabine, Reifen-Station etc.

Pro Bühne:
- Name, Beschreibung
- Typ (für Leistungs-Kompatibilität)
- Aktiv / Inaktiv
- Reihenfolge (Sortierung im Kalender)

Eine Leistung kann einen **bestimmten Bühnentyp erfordern** (z.B. "Bremsen VA" braucht eine Hebebühne).

### 13.3 Werkstatt-Zeiten

**Öffnungszeiten** pro Wochentag:
- Offen (Start / Ende)
- Oder komplett geschlossen (So, Feiertage)

**Schließzeiten**: Einzelne Tage (Betriebsferien, Feiertage) – das System blockiert diese für Terminbuchungen.

Diese Zeiten werden auch vom WordPress-Widget genutzt, damit Kunden nur verfügbare Slots angeboten bekommen.

---

## 14. Einstellungen

Unter `/einstellungen` (nur Admin) gibt es fünf Tabs:

### 14.1 🤖 KI (Fahrzeugschein-Scan)

- Provider wählen: **OpenAI GPT-4o** oder **Anthropic Claude**
- Modell wählen
- API-Key eintragen (wird verschlüsselt gespeichert)
- Sprache der Antwort (Standard: Deutsch)

### 14.2 📅 Online-Buchung

- Buchungs-Modus:
  - **auto**: Alle Online-Buchungen sind sofort bestätigt
  - **pending**: Alle Online-Buchungen brauchen manuelle Bestätigung
  - **smart**: Komplexität ≤ 2 automatisch, darüber Bestätigung (Standard)
- Minimale Vorlaufzeit (z.B. 2 Stunden)
- Maximale Vorlaufzeit (z.B. 60 Tage)
- Erlaubte Leistungs-Kategorien für Online-Buchung

### 14.3 🔑 API-Zugänge

Für externe Systeme (z.B. Telefon-KI, Mobile App, WordPress):
- API-Key erstellen mit **Scopes** (Rechten):
  - `appointments:read` / `appointments:write`
  - `customers:read` / `customers:write`
  - `services:read`
  - `availability:read`
- Key wird **nur einmal angezeigt** beim Erstellen – sicher aufbewahren!
- Keys können jederzeit widerrufen werden

### 14.4 ☎️ Telefon-KI

Konfiguration für die Anbindung an:
- Synthflow
- Retell AI
- Vapi
- OpenAI Realtime
- Eigene Integration

Hier werden:
- Webhook-URLs hinterlegt
- Sprach-Einstellungen (Deutsch, Stimme, Tempo)
- Verhalten (soll direkt buchen oder nur vormerken?)

### 14.5 🧾 DATEV

Konfiguration der DATEV-Schnittstelle (Berater-/Mandantennummer, Kontenrahmen,
Sachkonten-Zuordnung). Details siehe [Kap. 22](#22-datev-anbindung).

### 14.6 🗄 Daten & Demo

- **Aktueller Datenbestand**: Anzahl aller Datensätze pro Tabelle
- **Service-Katalog laden**: 140 Standard-Leistungen aus Excel/JSON importieren
- **Demo-Daten laden**: komplette Werkstatt mit Kunden, Fahrzeugen, Terminen, Rechnungen, Ausgaben
- **Alles löschen (Reset)**: mit Sicherheitsabfrage, zwei Modi:
  - *Transaktionsdaten*: Kunden/Termine/Dokumente weg, Katalog + Einstellungen bleiben
  - *Vollständig*: alles weg außer Benutzer-Accounts und Einstellungen

---

## 15. KI-Fahrzeugschein-Scan

Ein Highlight des Systems: Ein Foto oder Scan des Fahrzeugscheins wird hochgeladen, die KI extrahiert alle relevanten Daten und legt Kunde + Fahrzeug in einem Schritt an.

### Ablauf

1. Im Termin-Dialog **"Fahrzeugschein scannen"** klicken
2. Foto oder PDF hochladen
3. KI analysiert Dokument (Dauer: 3–10 Sekunden)
4. Extrahierte Daten werden in einem Bestätigungsdialog angezeigt:
   - **Halter**: Name, Adresse
   - **Fahrzeug**: Kennzeichen, Marke, Modell, Baujahr, FIN, Hubraum, Leistung, Kraftstoff
5. Nutzer kann Daten korrigieren und bestätigen
6. System legt an:
   - Neuen Kunden (falls noch nicht vorhanden)
   - Neues Fahrzeug
7. Termin-Dialog wird mit den Daten vorausgefüllt

### Welche Formate werden erkannt

- Deutscher Fahrzeugschein Teil I (Zulassungsbescheinigung)
- Lesbare Handyfotos
- Gescannte PDFs
- Auch teils verdeckte oder schräge Scans

### Kosten

- Pro Scan ca. 0,5–2 Cent (abhängig vom gewählten Modell)
- Zahlung läuft über den eigenen OpenAI-/Anthropic-Account der Werkstatt

### Datenschutz

- Scan wird nur einmal an die KI geschickt
- **Nicht** auf Servern der Werkstatt gespeichert (nur die extrahierten Daten)
- Keine personenbezogenen Daten werden zur Modell-Trainings-Verbesserung verwendet (wenn Provider das unterstützt, z.B. OpenAI API mit "zero retention")

---

## 16. Online-Buchung & WordPress-Einbindung

### Varianten

| Variante | Vorteil | Einsatz |
|---|---|---|
| **iFrame** | Einfachst, CSS isoliert | Eigene Webseite, WordPress |
| **JavaScript-Widget** | Responsiver, anpassbar | Alle Webseiten |
| **Direktlink** | Kein Einbau nötig | Social Media, Visitenkarten |

### iFrame-Variante

Einfachster Einbau. Code in die WordPress-Seite einfügen:

```html
<iframe
  src="https://werkstatt.deine-domain.de/embed/booking"
  width="100%"
  height="900"
  frameborder="0"
  style="border: none; max-width: 800px;"
></iframe>
```

### JavaScript-Widget

Moderner, passt sich besser in die Seite ein:

```html
<div id="werkstatt-buchung"></div>
<script src="https://werkstatt.deine-domain.de/widget.js"
        data-target="werkstatt-buchung"
        data-theme="light"></script>
```

### Buchungsfluss für Kunden

1. Leistung wählen (nur online-buchbare werden angezeigt)
2. Fahrzeug-Daten eingeben
3. Datum auswählen (Kalender zeigt nur Öffnungstage)
4. Uhrzeit wählen (nur noch verfügbare Slots)
5. Kontaktdaten eingeben
6. Buchung absenden

**Im System** erscheint der Termin:
- bei **auto**-Modus sofort als "Bestätigt"
- bei **pending**/**smart**-Modus im Dashboard als Banner "Bestätigung nötig"
- Mit Kennzeichnung `source: 'online'`

---

## 17. Schnittstellen / API für externe Systeme

Das System bietet eine REST-API für externe Integrationen.

### Authentifizierung

Interne UI: JWT-Token (Login)
Externe Systeme: **API-Key** im Header:

```
Authorization: Bearer wk_live_XXXXXXXXXXXXX
```

### Öffentliche Endpunkte (mit API-Key)

| Endpunkt | Zweck |
|---|---|
| `GET /api/public/services` | Liste buchbarer Leistungen |
| `GET /api/public/availability?service_ids=...&date=...` | Verfügbare Slots |
| `POST /api/public/appointments` | Termin anlegen (z.B. durch Telefon-KI) |
| `GET /api/public/appointments/:id` | Termin abfragen |
| `POST /api/public/customers/search` | Kunde per Telefon/Name suchen |

### Interne API (mit JWT)

Alle Module haben einen REST-Endpunkt. Beispielhaft:

```
GET    /api/customers
POST   /api/customers
PUT    /api/customers/:id
DELETE /api/customers/:id
GET    /api/customers/:id (inkl. Fahrzeuge, Termine, Dokumente)

GET    /api/appointments?from=...&to=...
POST   /api/appointments
PATCH  /api/appointments/:id/status

GET    /api/dashboard/live
GET    /api/dashboard/stats?days=30
GET    /api/dashboard/utilization?days=30

POST   /api/documents
POST   /api/documents/:id/storno
POST   /api/documents/:id/convert-to-invoice
POST   /api/documents/from-appointment/:appointmentId

GET    /api/expenses/stats/overview?year=2026
```

Komplette OpenAPI-Spezifikation auf Anfrage.

### Webhooks

In Einstellungen kannst du konfigurieren, dass bei bestimmten Events HTTP-POSTs rausgehen:
- `appointment.created`
- `appointment.confirmed`
- `appointment.cancelled`
- `invoice.paid`

Das ist die Basis für Zapier-/Make-Automatisierung.

---

## 18. Telefon-KI-Integration

Ein Alleinstellungsmerkmal: Der Anschluss einer **KI-Telefonassistentin**, die rund um die Uhr Anrufe entgegennimmt und Termine vereinbart.

### Funktionsweise

```
Kunde ruft Werkstatt-Nummer an
  │
  ▼
KI-Assistentin (Synthflow/Retell/Vapi)
  │  1. begrüßt, fragt Anliegen
  │  2. fragt Fahrzeug-Details und Leistung
  │  3. schlägt Terminzeiten vor (fragt unsere API)
  │  4. bestätigt den Termin (trägt über unsere API ein)
  ▼
Werkstatt-System: Termin erscheint mit source: 'telefon'
```

### Vorteile

- **24/7 erreichbar**, auch nachts, Sonntag
- **Keine verpassten Anrufe** mehr → keine verlorenen Kunden
- Deutsch, Englisch, Türkisch – alle gängigen Sprachen
- Kosten: ca. 0,10–0,30 € pro Minute (statt Personal)
- **Nahtlos ins System**: Der Termin steht im Kalender, als käme er von einem Mitarbeiter

### Einrichtung

1. Bei einem Anbieter (Synthflow etc.) einen Agenten konfigurieren
2. In Werkstatt-System: Einstellungen → Telefon-KI → Daten hinterlegen
3. API-Key für den externen Zugriff erstellen
4. Nummer zum Agenten portieren oder Weiterleitung einrichten

---

## 19. CSV-Import & Export

### Export

- `Leistungen → ⬇ CSV-Export` → Alle Leistungen mit allen Feldern
- `Buchhaltung → ⬇ CSV` → Alle Ausgaben des gewählten Jahres
- `Dokumente → Export` → Rechnungsliste (geplant)

Die Dateien sind **Excel-kompatibel** (Semikolon, UTF-8 mit BOM).

### Import (mit Feld-Mapping)

Der CSV-Import-Dialog ist flexibel und robust:

1. **Datei hochladen** – erkennt automatisch `;` oder `,` als Trennzeichen
2. **Automatisches Mapping**: Spalten wie "Name", "Bezeichnung", "Kategorie" etc. werden automatisch erkannt
3. **Manuelles Mapping**: Falls nötig, jede Spalte einem Zielfeld zuweisen
4. **Vorschau**: Erste 10 Zeilen als die System sie interpretieren würde
5. **Importmodus wählen**:
   - *Upsert*: bestehende (Name/Code) aktualisieren, neue anlegen
   - *Nur neue*: bestehende überspringen
6. **Importieren** → detaillierter Bericht: *X angelegt, Y aktualisiert, Z übersprungen, N Fehler*

### Unterstützte Aliase beim Auto-Mapping

| Zielfeld | Erkannte Spalten-Namen |
|---|---|
| `name` | Name, Bezeichnung, Leistung, Title |
| `category` | Kategorie, Category, Gruppe |
| `description` | Beschreibung, Description, Info, Umfang |
| `duration_min_minutes` | Arbeitszeit min, Min-Zeit |
| `duration_max_minutes` | Arbeitszeit max, Max-Zeit, Dauer |
| `buffer_before_minutes` | Puffer vor, Vor |
| `buffer_after_minutes` | Puffer nach, Nach |
| `complexity` | Komplexität, Complexity |
| `color` | Farbe, Color, HEX |
| `price` | Preis, Price, Betrag |
| `required_bay_type` | Bühne, Hebebühne, Bay-Type |
| `online_bookable` | Online, Buchbar, Online-Buchung |
| `notes` | Hinweise, Bemerkung, Notes |

### Werte-Konvertierung

- `price` akzeptiert sowohl `123.45` als auch `123,45`
- Boolean-Felder (`active`, `online_bookable`) akzeptieren: `1/0`, `true/false`, `ja/nein`, `yes/no`, `wahr/falsch`
- `required_skills` akzeptiert Komma-, Pipe-getrennt oder JSON-Array

---

## 20. Demo-Daten & Reset

### Demo-Daten

Zum Testen oder Vorführen bei Kunden:

- **15 Kunden** mit realistischen Namen, Adressen, Telefonnummern
- **20 Fahrzeuge** verschiedener Marken
- **~60 Termine**:
  - 40 abgeschlossene (der letzten 60 Tage, mit realistischen Ist-Zeiten)
  - Heutiger Betrieb (einer in Arbeit, mehrere geplant)
  - 15 zukünftige Termine
- **~35 Rechnungen/Angebote** mit 70% bezahlt, 30% offen
- **~35 Ausgaben** über 4 Monate verteilt, alle Kategorien
- **3 zusätzliche Mitarbeiter** mit Dienstplänen

So siehst du sofort, wie das System mit "echten" Daten aussieht.

### Reset

Zwei Modi:
- **Transaktionsdaten löschen**: Kunden, Fahrzeuge, Termine, Dokumente, Ausgaben weg. Katalog, Bühnen, Mitarbeiter, Einstellungen bleiben.
- **Vollständig**: zusätzlich Katalog, Bühnen, API-Keys, Mitarbeiter-Dienstpläne. Nur Benutzer-Accounts und Einstellungen bleiben.

**Sicherheitsabfrage**: Das Wort `RESET` muss eingetippt werden.

---

## 21. Erinnerungen (E-Mail, SMS, WhatsApp)

### Was wird erinnert?

- **24h vor Termin**: Erinnerung mit Bestätigung
- **2h vor Termin**: Letzte Erinnerung (optional)
- **Nach Termin**: Danke-Nachricht mit Link zur Bewertung (optional)

### Kanäle pro Kunde

Jeder Kunde hat individuelle Präferenzen:
- ☑ E-Mail
- ☑ SMS
- ☑ WhatsApp
- ☐ Keine (opt-out)

### Technische Basis

- **E-Mail**: SMTP (Gmail, SendGrid, Amazon SES, eigener Mailserver)
- **SMS** + **WhatsApp**: Twilio
- Kosten:
  - E-Mail: gratis (bei eigenem SMTP)
  - SMS: ca. 8 Cent/Nachricht in DE
  - WhatsApp: ca. 5 Cent/Nachricht (günstiger!)

### Zustellung

- Jobs laufen alle 15 Minuten via `node-cron`
- Status pro Erinnerung wird gespeichert:
  - `pending` (geplant)
  - `sent` (erfolgreich zugestellt)
  - `failed` (Fehler, z.B. falsche Nummer)
- Logs sind im System einsehbar

### Text-Templates

Alle Texte sind **anpassbar** (`Einstellungen → Erinnerungen`):

Beispiel (Standard):
> Hallo Herr Schmidt, wir erinnern Sie an Ihren Termin morgen um 10:00 in unserer Werkstatt für: Bremsenservice (vorn). Ihr Fahrzeug: B-AB 1234. Ihre Werkstatt, 030 12345678.

---

## 22. DATEV-Anbindung

Der Werkstatt-Terminplaner erzeugt einen vollständigen **DATEV-Buchungsstapel
(Format EXTF Version 7.00)** – genau das Format, das DATEV Rechnungswesen,
DATEV Kanzlei-Rechnungswesen und DATEV Unternehmen online beim Import erwarten.

Der Steuerberater liest die Datei ein, und alle Buchungen (Einnahmen aus
Rechnungen + Ausgaben) sind sofort verbucht.

### 22.1 Was wird exportiert?

| Quelle | Buchung | Standard-Konten (SKR03) |
|---|---|---|
| **Rechnung** (bezahlt) | Bank → Erlöse 19% | 1200 → 8400 |
| **Rechnung** (steuerfrei) | Bank → Erlöse 0% | 1200 → 8200 |
| **Storno** | negative Buchung auf gleiche Konten | 1200 → 8400 (−) |
| **Gutschrift** | wie Storno | 1200 → 8400 (−) |
| **Ausgabe "Ersatzteile"** | Wareneingang → Bank/Kasse | 3400 → 1200/1000 |
| **Ausgabe "Miete"** | Miete-Aufwand → Bank | 4210 → 1200 |
| **Ausgabe "Strom/Wasser"** | → 4240 → 1200 | |
| **Ausgabe "Versicherung"** | → 4360 → 1200 | |
| **Ausgabe "Werkzeug"** | → 4985 → 1200 | |
| **Ausgabe "Marketing"** | → 4600 → 1200 | |
| **Ausgabe "Bürobedarf"** | → 4930 → 1200 | |
| **Ausgabe "Kfz-Kosten"** | → 4530 → 1200 | |
| **Ausgabe "Verbrauchsmaterial"** | → 3980 → 1200 | |
| **Ausgabe "Sonstiges"** | → 4980 → 1200 | |

Die Steuer-Automatik übernehmen die **SKR-Automatik-Konten** (8400, 4400 etc.) – DATEV
rechnet die Umsatzsteuer automatisch daraus.

### 22.2 Einmalige Einrichtung

1. Steuerberater nach **Beraternummer** (7-stellig) und **Mandantennummer** fragen
2. Im System: **Einstellungen → 🧾 DATEV**
3. Beide Nummern eintragen
4. **Kontenrahmen** wählen: SKR 03 (Standard in Deutschland) oder SKR 04
5. **Kodierung**:
   - *ANSI / Windows-1252* → DATEV Rechnungswesen (klassisch)
   - *UTF-8 mit BOM* → DATEV Unternehmen online (moderner)
6. Optional: **Sachkonten anpassen** (manche Kanzleien nutzen individuelle Konten)
7. Speichern

### 22.3 Export durchführen

1. Menü **Buchhaltung → 🧾 DATEV-Export**
2. Zeitraum wählen:
   - Quick-Buttons: *Gesamtes Jahr*, *Q1–Q4*, *Letzter Monat*
   - Oder manuell: Von – Bis
3. Inhalt wählen:
   - *Alles* (Einnahmen + Ausgaben)
   - *Nur Einnahmen* (z.B. für Umsatzsteuer-Voranmeldung)
   - *Nur Ausgaben*
4. **👁 Vorschau** klicken → zeigt alle Buchungen, die generiert werden
5. Wenn alles passt: **⬇ Exportieren** → CSV wird heruntergeladen

Dateiname: `EXTF_Buchungsstapel_YYYYMMDD-YYYYMMDD.csv`

### 22.4 Datei an den Steuerberater schicken

**Variante A – DATEV Rechnungswesen**: CSV per E-Mail oder Cloud an den Steuerberater.
Er importiert über *"Datei → Importieren → EXTF-Stapel"*.

**Variante B – DATEV Unternehmen online**:
Kanzlei ist mit euch digital verbunden → CSV direkt in den Upload-Ordner ziehen.

**Variante C – Selbst importieren** (wenn ihr Mandant im DATEV Kanzlei-Rechnungswesen seid).

### 22.5 Kontenplan individuell anpassen

Jede Kanzlei hat minimale Abweichungen. Im DATEV-Einstellungen-Tab unter
**"Sachkonten-Zuordnung → Anpassen"** können individuelle Konten eingetragen werden:

- Erlöse 19% / 7% / 0%
- Bank / Kasse
- Aufwand pro Kategorie (Ersatzteile, Werkzeug, Miete, …)

Leer gelassene Felder nutzen den Standard aus dem gewählten Kontenrahmen.

### 22.6 Häufige Fragen zur DATEV-Anbindung

**F: Muss ich für den Export das Wirtschaftsjahr kennen?**  
A: Nein. Das System nimmt automatisch den 1. Januar des Jahres aus dem Export-Zeitraum als
Wirtschaftsjahr-Beginn.

**F: Werden Debitoren (Kunden als Einzelkonten) angelegt?**  
A: Im Moment wird direkt gegen Bank/Erlöskonto gebucht. Das ist die typische Vorgehensweise
für Kleinunternehmen und freie Werkstätten. Wenn die Kanzlei **echte Debitoren** möchte
(10000–69999), ist das über eine Erweiterung in der `datev.js` konfigurierbar.

**F: Wie mit Teilzahlungen umgehen?**  
A: Aktuell werden Rechnungen mit dem vollen Rechnungsbetrag gebucht.
Teilzahlungen über längeren Zeitraum solltet ihr mit dem Steuerberater abstimmen
(Forderungsbuchung statt Bank-Buchung).

**F: Wird die Umsatzsteuer richtig gebucht?**  
A: Ja. Durch die Verwendung der Automatik-Konten (8400 für 19%, 8300 für 7% in SKR03)
bildet DATEV beim Import automatisch die USt-Aufteilung. Kein BU-Schlüssel erforderlich.

**F: Funktioniert es auch mit steuerfreien Leistungen?**  
A: Ja. Rechnungen mit 0% MwSt. werden auf das steuerfreie Erlöskonto (8200 / 4200) gebucht.

**F: Was ist mit Bareinnahmen?**  
A: Aktuell werden alle Rechnungen gegen "Bank" gebucht. Wer viele Bareinnahmen hat,
sollte das mit der Kanzlei absprechen – hier lohnt sich evtl. eine eigene Zahlart
mit Konto-Mapping.

**F: Wie oft sollte ich exportieren?**  
A: Empfehlung: **monatlich** (jeweils zum Monatsanfang den Vormonat). So bleibt die
Buchhaltung immer aktuell.

---

## 23. Digitales Arbeits- und Übergabeprotokoll

Das System kennt **zwei komplementäre Protokolle** zu jedem Termin:

| Protokoll           | Wer bestätigt? | Wann?                                    |
|---------------------|----------------|------------------------------------------|
| **Arbeitsprotokoll** | Mitarbeiter    | Vor Arbeitsbeginn + nach Arbeitsende     |
| **Übergabeprotokoll** | Kunde         | Beim Abholen des Fahrzeugs              |

Das Arbeitsprotokoll ersetzt den handschriftlichen Arbeitsschein. Das Übergabeprotokoll
ist der rechtssichere Nachweis, dass der Kunde sein Fahrzeug, Schlüssel und Papiere
ordnungsgemäß zurückbekommen und die Reparatur akzeptiert hat.

### 23.1 Warum ein digitales Protokoll?

- **Nachweis** gegenüber Kunde und Versicherung, dass Arbeiten ordnungsgemäß ausgeführt wurden
- **Qualitätssicherung**: Standardisierte Prüfpunkte pro Leistung verhindern Vergessenes
- **Zeiterfassung**: Echte Arbeitszeit (Start/Ende) wird automatisch ins Dashboard übernommen
- **Transparenz** gegenüber dem Kunden: Ausdruck aller Prüfpunkte + Fotos + Unterschrift
- **Kennzeichen-Abgleich**: Sicherstellung, dass das richtige Fahrzeug bearbeitet wird

### 23.2 Der Ablauf in 3 Schritten

#### Schritt 1 – Arbeit starten

1. Mitarbeiter öffnet den Termin unter `Termine → #xxx`
2. Im Bereich **🛠️ Arbeitsprotokoll** klickt er auf „▶ Arbeit starten"
3. Er fotografiert das Kennzeichen mit Handy/Tablet (Rück-Kamera)
4. Die **KI liest das Kennzeichen automatisch** aus und vergleicht es mit dem Termin:
   - ✓ Grün = Kennzeichen stimmt überein → sicher, richtiges Fahrzeug
   - ✗ Rot = Abweichung → Mitarbeiter muss bestätigen oder korrigieren
5. Kilometerstand eintragen (wird automatisch ins Fahrzeug übernommen)
6. „▶ Arbeit starten" → Termin-Status springt auf **In Arbeit**, Startzeit wird gestempelt

**Fallback ohne Kamera**: Kennzeichen kann auch manuell eingegeben werden – zum Beispiel in
Werkstätten mit nur einem Desktop-PC.

#### Schritt 2 – Arbeit abschließen

Wenn die Reparatur fertig ist, klickt der Mitarbeiter auf „🏁 Arbeit abschließen".
Es erscheint ein dreistufiger Dialog:

**A) Kennzeichen + Kilometerstand am Ende**
Optionales zweites Foto des Kennzeichens als Beweis. Neuer KM-Stand.

**B) Prüf-Checkliste**
Das System zeigt automatisch **alle zur Leistung passenden Checklisten** an – zum Beispiel:
- Bei einer Bremsenreparatur → „Bremsen-Prüfung" (8 Punkte)
- Bei einem Ölwechsel → „Öl- und Flüssigkeiten-Kontrolle" (9 Punkte)
- Plus eine globale „Übergabe an Kunde"-Liste

Für jeden Prüfpunkt kann der Mitarbeiter wählen:
- **✓ OK** – Alles in Ordnung
- **✗ Nicht OK** – Pflicht-Notiz, was gefunden wurde
- **n/a** – Nicht relevant (z.B. HV-Prüfung bei Benzinern)

Bei Pflicht-Prüfpunkten ohne Status erscheint eine Warnung. Der Admin kann das
notfalls durch „Trotzdem abschließen" übersteuern.

**Freitext / Messwert-Felder** stehen zur Verfügung (z.B. Batteriespannung in Volt, Reifenprofil
in mm).

**Anmerkungen** als freier Arbeitsbericht: „Zusätzlich Scheibenwischer wegen Schlieren getauscht"

**C) Unterschrift**
Der Mitarbeiter unterschreibt per Finger auf dem Tablet oder mit der Maus. Name
in Druckschrift dazu. Erst dann lässt sich der Auftrag abschließen.

Nach dem Speichern:
- Der Termin-Status springt auf **Abgeschlossen**
- Der Endzeit-Stempel wird gesetzt (fließt ins Dashboard → Auslastung)
- Das komplette Protokoll ist als **druckbares PDF/HTML** verfügbar

### 23.3 Das fertige Protokoll

Unter „🖨️ Protokoll drucken" erhält man ein vollständiges Arbeitsprotokoll mit:

- Kopf: Werkstatt, Protokoll-Nr. (WP-00123), Datum
- Auftragsdaten: Kunde, Kennzeichen, Fahrzeug, FIN, Leistungen, Mitarbeiter
- Zeitstempel-Tabelle: Start/Ende, KM-Stände, Kennzeichen-Abgleich
- Fotos vom Start- und End-Kennzeichen
- Vollständige Checkliste mit Status, Messwerten, Mängel-Notizen
- Arbeitsbericht des Mitarbeiters
- Digitale Unterschrift mit Name und Datum
- Gesamt-Bewertung (OK / Mängel / Nicht freigegeben)

Das kann dem Kunden als PDF per E-Mail geschickt oder ausgedruckt werden.

### 23.4 Checklisten pflegen

Admins verwalten die Checklisten unter `📋 Checklisten` (nur Admin sichtbar).

**Drei Scope-Typen:**

| Scope          | Beispiel                | Wird angezeigt bei                                 |
|----------------|-------------------------|----------------------------------------------------|
| **Pro Kategorie** | „Bremsen-Prüfung"    | Jedem Termin mit Leistung in Kategorie *Bremsen*   |
| **Pro Leistung**  | „HV-System-Check"    | Nur bei der konkreten Leistung                     |
| **Global**        | „Übergabe an Kunde"  | Immer (bei jedem Termin)                           |

**Standard-Vorlagen** einmalig laden:
`Checklisten → „📥 Standard-Vorlagen laden"`

Dann sind 10 bewährte Checklisten aktiv:

- Bremsen-Prüfung (8 Punkte, u.a. Bremsflüssigkeit, Probefahrt, Drehmoment)
- Öl- & Flüssigkeiten-Kontrolle (9 Punkte)
- Reifen-Service (8 Punkte, Profiltiefe, RDKS, Auswuchtung)
- Elektrik-Prüfung (5 Punkte, Batteriespannung, Fehlerspeicher)
- Inspektion – Sicht-/Funktionsprüfung (11 Punkte)
- Klimaanlagen-Service (6 Punkte, Kältemittel gewogen, Dichtheit)
- Fahrwerks-Kontrolle (7 Punkte)
- HU/AU-Vorbereitung (7 Punkte)
- Karosserie-Arbeit – Abschluss (4 Punkte)
- Übergabe an Kunde (5 Punkte, global)

**Prüfpunkt-Typen:**

- **Abhaken** – reines Ja/Nein
- **Text** – Freitext-Messwert (z.B. „12,8 V")
- **Zahl** – numerischer Wert

Jeder Prüfpunkt hat ein *Pflicht*-Flag. Pflichtpunkte müssen vor dem Abschluss
beantwortet sein (kann nur von Admin übersteuert werden).

### 23.5 KI-Kennzeichenerkennung

Die Kennzeichenerkennung läuft über denselben KI-Provider wie der Fahrzeugschein-Scan
(OpenAI oder Anthropic, konfiguriert unter `Einstellungen → KI`).

**Wie es funktioniert:**

1. Foto wird an den konfigurierten KI-Vision-Dienst geschickt
2. KI extrahiert das Kennzeichen im Format „B-AB 1234"
3. Der Server vergleicht mit dem erwarteten Fahrzeug-Kennzeichen
4. Tolerant gegen Kamera-Unschärfe (Levenshtein-Distanz ≤ 1)
5. Bei Treffer: grüne Bestätigung, bei Abweichung: rote Warnung

**Datenschutz:**
Das Foto wird nur für die Erkennung übertragen; die Antwort enthält nur den Text.
Die Fotos selbst werden lokal in der Werkstatt-Datenbank gespeichert (Verzeichnis
`backend/data/worklog-photos/`).

**Kosten:**
Eine Kennzeichen-Erkennung kostet typischerweise 0,1–0,3 Cent bei GPT-4o-mini.

### 23.6 Auswirkungen auf andere Bereiche

- **Termin-Status**: Wird automatisch auf *in_arbeit* und später *abgeschlossen* gesetzt
- **Dashboard – Auslastung**: Die echten Start/Ende-Zeiten fließen in die Arbeitszeit-Statistik
- **Fahrzeug-KM**: Der neueste Kilometerstand wird automatisch ins Fahrzeug übernommen
- **Kunden-Historie**: Protokoll-PDF ist jederzeit über den Termin erreichbar

### 23.7 FAQ zum Arbeitsprotokoll

**Kann ich das Protokoll nachträglich korrigieren?**
Admins können unter `Work-Log → löschen` das Protokoll zurücksetzen. Danach kann der
Mitarbeiter neu starten. Die Unterschrift wird ebenfalls zurückgesetzt.

**Was wenn der Kunde die Arbeit nicht abnehmen will?**
Status „Mängel" im Protokoll setzen, Mangelbeschreibung in den Prüfpunkt-Notizen
und im Arbeitsbericht dokumentieren. Protokoll drucken und beide unterschreiben lassen.

**Kann ich eigene Checklisten erstellen?**
Ja, beliebig viele. Unter `Checklisten → + Neue Checkliste`. Jede Werkstatt kann
ihre eigenen Standards hinterlegen (z.B. Hersteller-spezifische Prüfungen für Tesla).

**Funktioniert das offline?**
Nein, die KI-Erkennung benötigt Internet. Manuell eingegebene Kennzeichen sowie
die Checkliste/Unterschrift funktionieren aber auch ohne Internet, sobald der
Browser die Seite geladen hat.

**Welche Hardware brauche ich?**
Ein Tablet oder Smartphone mit Kamera (Android/iOS). Alternativ ein Desktop-PC
mit angeschlossener Webcam. Die Signatur geht auch per Maus.

**Wie lange werden die Fotos gespeichert?**
So lange wie der Termin. Beim Löschen eines Termins werden die Fotos mit entfernt.
Regelmäßiges Backup empfohlen (siehe Kapitel 25).

### 23.8 Übergabeprotokoll (Fahrzeug-Auslieferung an den Kunden)

Wenn die Arbeit abgeschlossen ist und der Kunde sein Fahrzeug abholt, wird das
Übergabeprotokoll erstellt. Es ist der rechtssichere Nachweis für:

- **Schlüssel-Rückgabe** (Anzahl muss mit Annahme übereinstimmen)
- **Herausgabe der Fahrzeugpapiere** (Fahrzeugschein, TÜV-Bescheinigung, Service-Heft …)
- **Zubehör/persönliche Gegenstände** (Reserverad, Warndreieck, Radio-Code, Handy-Ladekabel …)
- **Kundenabnahme der Arbeit** („ich habe die Reparatur gesehen und akzeptiert")
- **Eventuelle Beanstandungen** (wenn der Kunde etwas bemängelt → Vorbehalt)
- **Zufriedenheit** (5-Sterne-Bewertung)

#### 23.8.1 So wird das Protokoll geführt

Im Termin-Detail erscheint nach dem Arbeitsprotokoll automatisch der Bereich
**🤝 Fahrzeug-Übergabe**. Der Mitarbeiter klickt auf „✍ Übergabeprotokoll starten".

Der Assistent führt durch **4 Schritte**:

**Schritt 1 – Schlüssel & Papiere**

- 🔑 Anzahl Schlüssel (Standard 1, bis zu 5)
- 🛣 Kilometerstand bei Übergabe
- 📄 Fahrzeugpapiere (Fahrzeugschein voreingestellt, erweiterbar)
- 🎒 Zubehör und persönliche Gegenstände

**Schritt 2 – Checkliste**

Das System zeigt automatisch passende Übergabe-Checklisten. Standard-Vorlagen:

- **Fahrzeug-Übergabe an Kunde** (9 Punkte, global – immer)
  - Schlüssel vollständig · Fahrzeugschein erhalten · Zubehör zurück ·
    Fahrzeug sauber/unbeschädigt · KM-Stand · Tank · Rechnung · Arbeiten erklärt ·
    Sichtkontrolle OK
- **Übergabe nach Reifenservice** (4 Punkte: Alte Reifen, Einlagerung, 50-km-Nachziehen, Luftdruck)
- **Übergabe nach Bremsenarbeit** (3 Punkte: Einfahr-Hinweis, Probefahrt, Garantie)
- **Übergabe nach Inspektion/Ölwechsel** (4 Punkte: Scheckheft, nächster Service, Anzeige zurückgesetzt, Empfehlungen)
- **Übergabe nach HU/AU** (3 Punkte: TÜV-Bescheinigung, neue Plakette, Prüfbericht erklärt)
- **Übergabe nach Klimaservice** (2 Punkte: Leistung getestet, Filter-Intervall)

Pro Punkt kann der Kunde ✓ Bestätigt / ✗ Nicht OK (Pflicht-Notiz) / n/a wählen.

**Schritt 3 – Feedback**

- Zufriedenheit (1-5 Sterne)
- Freie Anmerkung/Lob des Kunden
- Beanstandungen (falls etwas reklamiert wird)
- Interne Notizen (nicht auf dem Kunden-Ausdruck)
- **Status**: „Ohne Beanstandung übergeben" / „Unter Vorbehalt" / „Abnahme verweigert"

Wenn in der Checkliste auch nur 1 „Nicht OK" erfasst wurde, setzt das System automatisch
auf **„Unter Vorbehalt"** – das schützt die Werkstatt vor späteren Reklamationen.

**Schritt 4 – Unterschrift**

- **Kunde unterschreibt** per Finger/Stift auf dem Tablet (Pflicht)
- Name in Druckschrift
- **Werkstatt gegenzeichnet** (optional, aber empfohlen)
- Rechtshinweis wird oberhalb des Signaturfelds angezeigt:
  > Mit Ihrer Unterschrift bestätigen Sie die Entgegennahme des Fahrzeugs, der
  > N Schlüssel, der aufgeführten Papiere und die Durchführung der Arbeiten zu Ihrer Zufriedenheit.

#### 23.8.2 Das gedruckte Protokoll (UP-00123)

Das PDF/HTML-Dokument enthält alles beweistauglich:

- Status-Banner oben (grün/orange/rot je nach Abnahme)
- Kunden- und Fahrzeugdaten inklusive FIN + ausgeführte Arbeiten
- Tabelle: Schlüssel-Anzahl, Papiere, Zubehör
- Komplette Checkliste mit jedem bestätigten Punkt
- Zufriedenheit als Sterne
- Anmerkungen + Beanstandungen (hervorgehoben)
- **Zwei Unterschriftenfelder** nebeneinander (Kunde + Werkstatt)
- Rechtstext zur Entgegennahme

Der Ausdruck kann dem Kunden per E-Mail zugesandt oder als Papier mitgegeben werden.

#### 23.8.3 Warum das wichtig ist – Praxisbeispiele

**Beispiel 1 – „Ich habe nur einen Schlüssel bekommen, obwohl ich zwei abgegeben habe."**
→ Protokoll zeigt: Kunde hat 2 bestätigt und unterschrieben. Fall erledigt.

**Beispiel 2 – „Die Bremse ist nach 3 Wochen wieder kaputt, das ist Gewährleistung!"**
→ Protokoll zeigt: Kunde hat „Einfahr-Hinweis erhalten" und „Probefahrt OK" bestätigt.
   Werkstatt hat alle Prüfpunkte dokumentiert. Fall eindeutig.

**Beispiel 3 – „Im Kofferraum war mein neues Navi, das ist jetzt weg!"**
→ Protokoll zeigt: Kunde hat „Zubehör/persönliche Gegenstände zurückerhalten" bestätigt.
   Oder im Protokoll steht das Navi explizit drin. Haftung geklärt.

**Beispiel 4 – „Ich habe das Fahrzeug so nicht angenommen, das war ein Mangel!"**
→ Protokoll zeigt „Unter Vorbehalt" + Beanstandungen im Klartext. Keine spätere Streitfrage.

**Beispiel 5 – Versicherungsfall nach Auslieferung**
→ Protokoll mit KM-Stand + Fahrzeug-Zustand zum Übergabezeitpunkt ist eindeutiger Beleg.

#### 23.8.4 Beziehung zu Arbeits- und Übergabeprotokoll

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│ 1. Kennzeichen  │ →   │ 2. Arbeit läuft  │ →   │ 3. Übergabe       │
│    Start-Foto   │     │    Checkliste    │     │    Kunden-        │
│    KI-Erkennung │     │    Mitarbeiter-  │     │    Unterschrift   │
│    KM-Start     │     │    Unterschrift  │     │    Schlüssel ✓    │
│                 │     │                  │     │    Papiere ✓      │
│ Mitarbeiter     │     │ Mitarbeiter      │     │ Kunde             │
└─────────────────┘     └──────────────────┘     └───────────────────┘
```

Beide Protokolle sind miteinander verknüpft über die Termin-ID. Aus jedem Termin kann
man jederzeit beide PDFs abrufen und z.B. zusammen an den Kunden mailen.

---

## 24. Typische Arbeitsabläufe

### 24.1 Ein Kunde ruft an und möchte einen Termin

1. Mitarbeiter öffnet **Kalender**
2. Klick auf freien Slot
3. Kundensuche (per Telefon / Name) – Kunde ist schon im System
4. Fahrzeug wählen
5. Leistung auswählen (z.B. "Ölwechsel")
6. Vorgeschlagener Slot passt → Speichern
7. Erinnerung wird automatisch eingeplant
8. ☎️ Dauer: **< 30 Sekunden**

### 24.2 Neukunde bringt Fahrzeug vorbei (Walk-in)

1. Mitarbeiter öffnet Kalender, Klick auf "Jetzt"
2. Klick auf "Neuer Kunde inline"
3. Fahrzeugschein fotografieren → **KI-Scan** → alle Daten vorausgefüllt
4. Leistungen auswählen
5. Speichern, Status sofort auf "In Arbeit"
6. ☎️ Dauer: **< 2 Minuten**

### 24.3 Tagesabschluss

1. **Dashboard → Live-Betrieb** öffnen
2. Alle erledigten Termine auf "Abgeschlossen" setzen
3. Bei jedem: "📄 Rechnung" klicken → fertige Rechnung öffnet sich
4. Rechnung drucken (PDF) oder an Kunde mailen
5. Nach Zahlungseingang: Status "Bezahlt" setzen
6. ☎️ Dauer: **~5 Min für 10 Termine**

### 24.4 Monatsabschluss

1. **Buchhaltung → Übersicht**, Jahr wählen
2. Belege der letzten Woche eintragen (Tab "Ausgaben")
3. Monats-Balkendiagramm checken: Gewinn? Überraschungen?
4. **🧾 DATEV-Export** klicken → *Letzter Monat* → CSV herunterladen
5. Datei an den Steuerberater schicken (oder direkt in DATEV Unternehmen online hochladen)
6. Fertig – Buchhaltung ist für den Monat abgeschlossen
7. ☎️ Dauer: **~10 Minuten**

### 24.5 Kundenauswertung

1. **Kunden → Kundenname** klicken
2. Service-Historie ansehen
3. Alle Rechnungen auf einen Blick
4. Gesamt-Umsatz sichtbar
5. Nächster Wartungs-Vorschlag möglich (geplantes Feature)

---

## 25. Sicherheit, Backup, DSGVO

### Sicherheit

- **Passwörter**: bcrypt mit 10 Runden (State-of-the-Art)
- **Sessions**: JWT mit 7 Tagen Gültigkeit, kann jederzeit widerrufen werden
- **API-Keys**: mit Scopes, jederzeit widerrufbar
- **Rollenprüfung** auf jedem Admin-Endpunkt
- **CORS** konfigurierbar (in Produktion auf die eigene Domain beschränken!)
- **Rate-Limiting** auf Login-Endpunkt (empfohlen für Produktion)

### Backup

Die gesamte Datenbank ist **eine einzige Datei**: `backend/data/werkstatt.sqlite`.

Empfohlenes Backup-Setup:
- Täglich per Cron → Kopie in einen anderen Ordner
- Wöchentlich → verschlüsselt zu S3 / Backblaze / Nextcloud
- Vor jedem größeren Update → manuelles Backup

```bash
cp backend/data/werkstatt.sqlite \
   /backups/werkstatt-$(date +%Y%m%d).sqlite
```

### DSGVO

Das System unterstützt:
- **Auskunft**: Alle Kundendaten auf der Detailseite einsehbar, per Klick exportierbar
- **Löschung**: Kunde löschen setzt auf "gelöscht" (für Historie) ODER hartes Löschen
- **Auftragsverarbeitung**:
  - OpenAI / Anthropic: AVV verfügbar, "zero retention" möglich
  - Twilio: AVV verfügbar
- **Datenminimierung**: Kein unnötiger Datenabruf, keine Telemetrie
- **Verschlüsselung**: SSL pflicht in Produktion, Daten verschlüsselt in Transit. Database-at-rest Verschlüsselung optional über Dateisystem.

---

## 26. Troubleshooting / FAQ

### Ich kann mich nicht einloggen

- `admin@werkstatt.local` + `admin123`
- Falls geändert und vergessen: Backend-Shell
  ```
  cd backend
  node -e "
  import('bcryptjs').then(b => {
    import('better-sqlite3').then(d => {
      const db = new d.default('./data/werkstatt.sqlite');
      const hash = b.default.hashSync('neuespasswort', 10);
      db.prepare('UPDATE users SET password_hash=? WHERE role=\"admin\"').run(hash);
    });
  });
  "
  ```

### Der Kalender ist langsam

- Beim Jahresüberblick >5000 Termine kann es dauern → besser Monatsansicht nutzen
- Lösung langfristig: Server-seitige Paginierung (geplant)

### Erinnerungen werden nicht verschickt

- Prüfen: läuft das Backend? (cron läuft nur im Backend-Prozess)
- SMTP-Credentials korrekt? Test per `Einstellungen → Test-Mail senden`
- Twilio-Guthaben vorhanden?
- Kunde hat Kanal aktiviert?

### Die Datenbank ist voll

SQLite skaliert problemlos auf ca. 100 GB. Die typische Werkstatt erzeugt pro Jahr ca. 50 MB.
→ **Kein praktisches Problem.** Wenn doch mal: Migration auf PostgreSQL ist möglich.

### Ich will mehrere Standorte betreiben

Aktuell ist das System **single-tenant** (eine Werkstatt pro Installation). Für mehrere Standorte:
- Separate Instanzen (eine DB pro Standort) – empfohlen
- Multi-Tenancy in Zukunft möglich

### Das KI-Scannen funktioniert nicht

- API-Key korrekt? (Test über OpenAI Playground)
- Guthaben im OpenAI-Account?
- Datei-Größe < 20 MB?
- Format: JPG, PNG, PDF erlaubt

---

## 27. Glossar

| Begriff | Bedeutung |
|---|---|
| **AVV** | Auftragsverarbeitungsvertrag (DSGVO) |
| **API-Key** | Schlüssel für externe Systeme, um mit der API zu sprechen |
| **Bay / Bühne** | Arbeitsplatz in der Werkstatt (Hebebühne, Platz, etc.) |
| **Bruto / Netto** | Netto = ohne MwSt., Brutto = mit MwSt. |
| **Cron** | Zeitgesteuerte Hintergrund-Jobs (hier: Erinnerungs-Versand) |
| **FIN** | Fahrzeug-Identifikationsnummer (17-stellig) |
| **HEX** | Farbcode wie `#E53935` |
| **HV** | Hochvolt (Elektroauto-Qualifikation) |
| **HU / AU** | Hauptuntersuchung / Abgasuntersuchung (TÜV) |
| **JSON** | Datenformat für API-Kommunikation |
| **JWT** | JSON Web Token, für Benutzer-Sessions |
| **Komplexität** | 1–4, beeinflusst ob online buchbar oder mit Bestätigung |
| **KV** | Kostenvoranschlag (= Angebot) |
| **Puffer vor/nach** | Zeit für Annahme/Übergabe vor bzw. nach der eigentlichen Arbeit |
| **RDKS** | Reifendruck-Kontrollsystem |
| **Scope** | Rechte-Umfang eines API-Keys |
| **Seeding** | Befüllen der DB mit Beispiel-Daten |
| **SMTP** | Protokoll zum E-Mail-Versand |
| **Storno** | Rückbuchung einer Rechnung |
| **Upsert** | Update-or-Insert (vorhandene aktualisieren, neue anlegen) |
| **Widget** | Einbettbares UI-Element (hier: Online-Buchung für WordPress) |

---

## 28. Reifen-Einlagerung und Saison-E-Mails

### Überblick

Unter **Reifen-Lager** erfassen Sie pro Kunde und Fahrzeug, ob ein **Winter-** oder **Sommer-Komplettradsatz** bei Ihnen eingelagert ist (Lagerort, Menge, Datum). Kunden benötigen eine **E-Mail-Adresse** im Stamm.

### Automatische E-Mails

Ein täglicher Job im Backend prüft den Kalender:

- Ist die Funktion unter **Einstellungen → Reifen & Abrechnung** aktiviert?
- Liegt der aktuelle Tag im konfigurierten **Monat** (Standard: Oktober für Winter, März für Sommer) und innerhalb der ersten **X Tage** des Monats?
- Dann wird pro aktivem Lagereintrag mit passendem `lagertyp` und noch nicht gesendetem Jahres-Stempel eine **Erinnerungs-E-Mail** mit Link zur Online-Buchung verschickt.

Ohne funktionierendes **SMTP** werden keine Mails versendet und der Jahres-Stempel **nicht** gesetzt (erneuter Versuch im selben Jahr bleibt möglich, sobald SMTP steht).

### Termin-Fotos

Auf der **Termin-Detailseite** können Sie **Auftragsfotos** (z. B. Annahme/Vorschaden) erfassen; die Dateien liegen serverseitig im Datenverzeichnis und sind nur für angemeldete Nutzer abrufbar.

### Teile-Lager

Die Seite **Teile-Lager** führt einen einfachen **Bestand** mit Mindestmenge; Pflege ist Administratoren vorbehalten.

---

## Anhang A: Datenbank-Schema (vereinfacht)

```
users              - Login-Accounts (Admin, Mitarbeiter)
customers          - Kundenstamm
vehicles           - Fahrzeuge (mit customer_id)
services           - Dienstleistungs-Katalog
bays               - Arbeitsplätze / Bühnen
workshop_hours     - Öffnungszeiten pro Wochentag
workshop_closures  - Einzelne Schließtage
employee_schedules - Dienstpläne pro Mitarbeiter
employee_absences  - Abwesenheiten
employee_skills    - Qualifikationen

appointments       - Termine
  ├── appointment_services (m:n)
  └── reminders    - geplante/gesendete Erinnerungen

documents          - Angebote, Rechnungen, Stornos, Gutschriften
  └── document_items
document_counters  - Nummernkreise pro Jahr+Typ

expenses           - Ausgaben
expense_categories - Kategorien

api_keys           - Externe Zugänge
settings           - globale Einstellungen (Key-Value)

tire_storage       - Reifen-Einlagerung (Kunde, Fahrzeug, Lagertyp, Saison-Mail-Jahr)
inventory_items    - Teile-Lager (SKU, Bestand, Mindestbestand)
appointment_media  - Fotos/Dokumente zu Terminen
```

---

## Anhang B: Kennzahlen (Zielwerte für Werkstätten)

| KPI | Optimal | Kritisch |
|---|---|---|
| **Ø Auslastung Bühne** | 70–85 % | < 50 % oder > 95 % |
| **Ø Auslastung Mitarbeiter** | 75–85 % | < 60 % oder > 95 % |
| **Abweichung Plan vs. Ist** | ± 10 % | > 25 % → Planung verbessern |
| **Rechnungs-Inkasso-Dauer** | < 14 Tage | > 30 Tage |
| **Offene Forderungen** | < 5 % des Monatsumsatzes | > 15 % |
| **Stornoquote** | < 5 % | > 10 % |
| **Online-Buchungsanteil** | 20–50 % (wächst) | Werkstatt-individuell |

Diese Kennzahlen sind jederzeit im Dashboard einsehbar.

---

**Ende des Handbuchs**

Bei Fragen: Support-Team / Inhaber kontaktieren.

*Werkstatt-Terminplaner · Version 1.0 · 2026*
