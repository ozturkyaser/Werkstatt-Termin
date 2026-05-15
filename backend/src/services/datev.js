/**
 * DATEV-Export (EXTF Format, Version 700 – "Buchungsstapel")
 *
 * Erzeugt eine DATEV-konforme CSV-Datei für den Import in DATEV Rechnungswesen
 * oder DATEV Unternehmen online. Unterstützt:
 *   - Erlös-Buchungen aus Rechnungen (+ Stornos mit Minus, + Gutschriften)
 *   - Aufwands-Buchungen aus Ausgaben (nach Kategorie)
 *
 * Referenzen:
 *   - DATEV "Schnittstellen-Entwicklungsleitfaden" (öffentlich)
 *   - Format: EXTF Version 7.00 Buchungsstapel (Format-Kategorie 21)
 *
 * Wichtig: DATEV erwartet CP1252 (ANSI / Windows-1252), CRLF-Zeilenenden,
 * Dezimaltrennzeichen Komma, Datumsformat TTMM (jahreslos) für Belegdatum.
 */
import db from '../db.js';
import { getSetting } from './settings.js';
import iconv from 'iconv-lite';

// Standard-Kontenrahmen (die gebräuchlichsten Sachkonten für Werkstätten)
export const ACCOUNT_PRESETS = {
  skr03: {
    // Erlöse
    erloese_19: '8400',
    erloese_7:  '8300',
    erloese_0:  '8200',
    // Debitoren-Sammelkonto (meist ungenutzt – wir buchen direkt gegen Kasse/Bank)
    debitoren_sammel: '1200',
    kasse: '1000',
    bank:  '1200',
    // Aufwandskonten (Ausgaben-Kategorien → SKR03)
    aufwand_default:       '4980', // Sonstiger Aufwand
    aufwand_ersatzteile:   '3400', // Wareneingang 19%
    aufwand_verbrauch:     '3980', // Verbrauchsmaterial
    aufwand_werkzeug:      '4985', // Werkzeuge und Kleingeräte
    aufwand_miete:         '4210', // Miete
    aufwand_strom:         '4240', // Gas/Strom/Wasser
    aufwand_versicherung:  '4360', // Versicherungen
    aufwand_marketing:     '4600', // Werbekosten
    aufwand_buero:         '4930', // Bürobedarf
    aufwand_fahrzeug:      '4530', // Laufende Kfz-Kosten
    // Vorsteuer
    vorsteuer_19: '1576',
    vorsteuer_7:  '1571',
    // USt
    ust_19: '1776',
    ust_7:  '1771',
  },
  skr04: {
    erloese_19: '4400',
    erloese_7:  '4300',
    erloese_0:  '4200',
    debitoren_sammel: '1200',
    kasse: '1600',
    bank:  '1800',
    aufwand_default:       '6990',
    aufwand_ersatzteile:   '5400',
    aufwand_verbrauch:     '6845',
    aufwand_werkzeug:      '6845',
    aufwand_miete:         '6310',
    aufwand_strom:         '6325',
    aufwand_versicherung:  '6400',
    aufwand_marketing:     '6600',
    aufwand_buero:         '6815',
    aufwand_fahrzeug:      '6530',
    vorsteuer_19: '1406',
    vorsteuer_7:  '1401',
    ust_19: '3806',
    ust_7:  '3801',
  },
};

// Mapping: Ausgaben-Kategorien → interner Aufwand-Typ
const CATEGORY_MAP = {
  'ersatzteile': 'aufwand_ersatzteile',
  'verbrauchsmaterial': 'aufwand_verbrauch',
  'werkzeug': 'aufwand_werkzeug',
  'miete': 'aufwand_miete',
  'strom/wasser': 'aufwand_strom',
  'strom': 'aufwand_strom',
  'versicherung': 'aufwand_versicherung',
  'marketing': 'aufwand_marketing',
  'bürobedarf': 'aufwand_buero',
  'buerobedarf': 'aufwand_buero',
  'fahrzeugkosten': 'aufwand_fahrzeug',
};

function mapAufwandskonto(accounts, categoryName) {
  if (!categoryName) return accounts.aufwand_default;
  const key = CATEGORY_MAP[categoryName.toLowerCase()];
  return (key && accounts[key]) || accounts.aufwand_default;
}

// --- Formatierung ---
function formatAmount(n) {
  // DATEV erwartet positiven Betrag mit Komma; Vorzeichen über Soll/Haben-Kennzeichen
  const abs = Math.abs(Number(n) || 0);
  return abs.toFixed(2).replace('.', ',');
}
function sollHabenKz(amount, defaultSoll) {
  // defaultSoll: true wenn normalerweise Soll-Buchung (z.B. Aufwand, Debitor)
  const positive = (Number(amount) || 0) >= 0;
  if (defaultSoll) return positive ? 'S' : 'H';
  return positive ? 'H' : 'S';
}
function formatBelegdatum(yyyyMmDd) {
  // DATEV-Format: TTMM (nur Tag + Monat, Jahr ergibt sich aus Wirtschaftsjahr)
  if (!yyyyMmDd) return '';
  const [_, m, d] = yyyyMmDd.split('-');
  return `${d}${m}`;
}
function formatDateYYYYMMDD(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function formatTimestamp() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}000`;
}

// Ein Feldwert DATEV-kompatibel quoten (Texte "" , Zahlen ohne Quotes)
function q(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}
function n(v) {
  // Numerisches Feld: Leer wenn null, sonst Zahl
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

// --- Header-Zeile 1 (Meta) ---
function buildHeaderMeta({ from, to, beraternummer, mandantennummer, wjBeginn, bezeichnung }) {
  // EXTF-Header: 32 Felder
  const createdAt = formatTimestamp();
  const fields = [
    q('EXTF'),           // 1  DATEV-Kennzeichen
    n(700),              // 2  Versionsnummer
    n(21),               // 3  Format-Kategorie (21 = Buchungsstapel)
    q('Buchungsstapel'), // 4  Formatname
    n(7),                // 5  Formatversion
    n(createdAt),        // 6  Erzeugt am (YYYYMMDDHHMMSSFFF000)
    '',                  // 7  Importiert von (leer beim Export)
    q('RE'),             // 8  Herkunft-Kennzeichen (RE = Rechnungswesen)
    q('Werkstatt'),      // 9  Exportiert von
    '',                  // 10 Importiert von
    n(beraternummer),    // 11 Beraternummer
    n(mandantennummer),  // 12 Mandantennummer
    n(wjBeginn),         // 13 Wirtschaftsjahr-Beginn (YYYYMMDD)
    n(4),                // 14 Sachkontenlänge
    n(from),             // 15 Datum von (YYYYMMDD)
    n(to),               // 16 Datum bis (YYYYMMDD)
    q(bezeichnung || 'Werkstatt-Export'), // 17 Bezeichnung
    '',                  // 18 Diktatkürzel
    n(1),                // 19 Buchungstyp (1=Finanzbuchführung)
    n(0),                // 20 Rechnungslegungszweck (0=unabhängig)
    n(0),                // 21 Festschreibung (0=nicht festgeschrieben)
    q('EUR'),            // 22 WKZ
    '', '', '', '',       // 23-26 reserviert
    '', '', '', '',       // 27-30 reserviert
    '', '',              // 31-32 reserviert
  ];
  return fields.join(';');
}

// --- Header-Zeile 2 (Spaltennamen, exakt wie in DATEV V7.00 Buchungsstapel) ---
const COLUMN_HEADERS = [
  'Umsatz (ohne Soll-/Haben-Kz)','Soll-/Haben-Kennzeichen','WKZ Umsatz','Kurs','Basisumsatz','WKZ Basisumsatz',
  'Konto','Gegenkonto (ohne BU-Schlüssel)','BU-Schlüssel','Belegdatum','Belegfeld 1','Belegfeld 2','Skonto',
  'Buchungstext','Postensperre','Diverse Adressnummer','Geschäftspartnerbank','Sachverhalt','Zinssperre',
  'Beleglink','Beleginfo - Art 1','Beleginfo - Inhalt 1','Beleginfo - Art 2','Beleginfo - Inhalt 2',
  'Beleginfo - Art 3','Beleginfo - Inhalt 3','Beleginfo - Art 4','Beleginfo - Inhalt 4',
  'Beleginfo - Art 5','Beleginfo - Inhalt 5','Beleginfo - Art 6','Beleginfo - Inhalt 6',
  'Beleginfo - Art 7','Beleginfo - Inhalt 7','Beleginfo - Art 8','Beleginfo - Inhalt 8',
];

function buildColumnHeader() {
  return COLUMN_HEADERS.map(q).join(';');
}

// --- Einzelne Buchungszeile ---
function buildBookingLine({
  umsatz, sollHaben, konto, gegenkonto, bu = '', belegdatum, belegfeld1, buchungstext,
}) {
  // 36 Felder – unbenutzte leer
  const fields = [
    formatAmount(umsatz),  // 1  Umsatz
    q(sollHaben),          // 2  S/H
    q('EUR'),              // 3  WKZ
    '',                    // 4  Kurs
    '',                    // 5  Basisumsatz
    '',                    // 6  WKZ Basisumsatz
    n(konto),              // 7  Konto
    n(gegenkonto),         // 8  Gegenkonto
    q(bu),                 // 9  BU-Schlüssel
    n(belegdatum),         // 10 Belegdatum TTMM
    q(belegfeld1),         // 11 Belegfeld 1 (Rechnungsnummer)
    '',                    // 12 Belegfeld 2
    '',                    // 13 Skonto
    q(truncate(buchungstext, 60)), // 14 Buchungstext
    '',                    // 15 Postensperre
    '',                    // 16 Diverse Adressnummer
    '',                    // 17 Geschäftspartnerbank
    '',                    // 18 Sachverhalt
    '',                    // 19 Zinssperre
    '',                    // 20 Beleglink
    '','','','','','','','','','','','','','','','','', // 21-36 Beleginfos (paarweise Art/Inhalt)
  ];
  return fields.join(';');
}

function truncate(s, len) {
  if (!s) return '';
  const str = String(s).replace(/[\r\n]+/g, ' ');
  return str.length > len ? str.slice(0, len) : str;
}

// --- Buchungen generieren ---

// Erlöse aus Rechnungen (rechnung, storno, gutschrift)
function fetchInvoiceBookings(fromISO, toISO) {
  return db.prepare(
    `SELECT d.id, d.doc_number, d.type, d.issue_date, d.subtotal_net, d.tax_amount, d.total_gross,
            d.tax_rate, d.customer_id,
            c.first_name, c.last_name
       FROM documents d
       LEFT JOIN customers c ON c.id = d.customer_id
       WHERE d.type IN ('rechnung','storno','gutschrift')
         AND d.issue_date >= ? AND d.issue_date <= ?
       ORDER BY d.issue_date, d.id`
  ).all(fromISO, toISO);
}

// Ausgaben
function fetchExpenseBookings(fromISO, toISO) {
  return db.prepare(
    `SELECT e.*, c.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.expense_date >= ? AND e.expense_date <= ?
       ORDER BY e.expense_date, e.id`
  ).all(fromISO, toISO);
}

function pickErloeseKonto(accounts, taxRate) {
  const r = Number(taxRate) || 0;
  if (r >= 19) return accounts.erloese_19;
  if (r >= 7) return accounts.erloese_7;
  return accounts.erloese_0;
}

/**
 * Hauptfunktion: erstellt einen DATEV-Buchungsstapel als CP1252-Buffer.
 *
 * Opts:
 *   from, to           – ISO-Datum "YYYY-MM-DD"
 *   what               – 'all' | 'income' | 'expenses'
 *   beraternummer      – DATEV-Beraternr.
 *   mandantennummer    – DATEV-Mandantennr.
 *   kontenrahmen       – 'skr03' | 'skr04'
 *   gegenkonto_bank    – Sachkonto für Bank (Standard 1200/1800)
 *   bezeichnung        – Header-Bezeichnung
 *   encoding           – 'cp1252' (default) | 'utf8'
 */
export function buildBuchungsstapel(opts) {
  const {
    from, to, what = 'all',
    beraternummer, mandantennummer,
    kontenrahmen = 'skr03',
    bezeichnung,
    encoding = 'cp1252',
    custom_accounts,
  } = opts;

  if (!from || !to) throw new Error('from und to sind Pflicht');
  if (!beraternummer || !mandantennummer)
    throw new Error('Berater- und Mandantennummer müssen in den Einstellungen hinterlegt sein');

  const accounts = { ...(ACCOUNT_PRESETS[kontenrahmen] || ACCOUNT_PRESETS.skr03), ...(custom_accounts || {}) };

  const fromStripped = from.replace(/-/g, '');
  const toStripped = to.replace(/-/g, '');
  const wjBeginn = from.slice(0, 4) + '0101';

  const lines = [];
  lines.push(buildHeaderMeta({
    from: fromStripped, to: toStripped,
    beraternummer, mandantennummer, wjBeginn,
    bezeichnung,
  }));
  lines.push(buildColumnHeader());

  let count = 0;
  let sumIncome = 0;
  let sumExpenses = 0;

  // --- Einnahmen (Rechnungen) ---
  if (what === 'all' || what === 'income') {
    const invoices = fetchInvoiceBookings(from, to);
    for (const inv of invoices) {
      const sign = inv.type === 'storno' ? -1 : 1;
      const gross = sign * Number(inv.total_gross || 0);
      const konto = accounts.bank; // Zahlungseingang auf Bank
      const gegen = pickErloeseKonto(accounts, inv.tax_rate);
      const bu = ''; // BU-Schlüssel weggelassen → DATEV bildet Automatikkonto-Steuer (0=keine Automatik) oder manuell
      // Für korrekte Besteuerung: wenn der Erlöskonto ein SKR-Automatik-Konto ist (8400,4400 etc.), erkennt DATEV die Steuer automatisch.
      const customer = `${inv.first_name || ''} ${inv.last_name || ''}`.trim() || 'Kunde';
      const text = `${inv.doc_number} ${customer}`;

      lines.push(buildBookingLine({
        umsatz: gross,
        sollHaben: gross >= 0 ? 'S' : 'H', // Positive Einnahme: Bank im Soll, Erlös im Haben
        konto,
        gegenkonto: gegen,
        bu,
        belegdatum: formatBelegdatum(inv.issue_date),
        belegfeld1: inv.doc_number,
        buchungstext: text,
      }));
      count++;
      sumIncome += gross;
    }
  }

  // --- Ausgaben ---
  if (what === 'all' || what === 'expenses') {
    const expenses = fetchExpenseBookings(from, to);
    for (const ex of expenses) {
      const gross = Number(ex.amount_gross || 0);
      const aufwand = mapAufwandskonto(accounts, ex.category_name);
      const text = `${ex.vendor ? ex.vendor + ' – ' : ''}${ex.description || ''}`;

      // Aufwand im Soll, Bank/Kasse im Haben
      const gegen = ex.payment_method === 'bar' ? accounts.kasse : accounts.bank;

      lines.push(buildBookingLine({
        umsatz: gross,
        sollHaben: 'S',
        konto: aufwand,
        gegenkonto: gegen,
        bu: '',
        belegdatum: formatBelegdatum(ex.expense_date),
        belegfeld1: ex.invoice_number || `EXP-${ex.id}`,
        buchungstext: text,
      }));
      count++;
      sumExpenses += gross;
    }
  }

  const csv = lines.join('\r\n') + '\r\n';
  const buffer = encoding === 'utf8'
    ? Buffer.from('\uFEFF' + csv, 'utf8')
    : iconv.encode(csv, 'win1252');

  return {
    buffer,
    stats: {
      lines: count,
      income_gross: Math.round(sumIncome * 100) / 100,
      expenses_gross: Math.round(sumExpenses * 100) / 100,
      encoding,
      range: { from, to },
      kontenrahmen,
    },
  };
}

// --- Vorschau (keine Datei, nur JSON) ---
export function previewBookings(opts) {
  const { from, to, what = 'all', kontenrahmen = 'skr03', custom_accounts } = opts;
  const accounts = { ...(ACCOUNT_PRESETS[kontenrahmen] || ACCOUNT_PRESETS.skr03), ...(custom_accounts || {}) };

  const preview = [];
  if (what === 'all' || what === 'income') {
    for (const inv of fetchInvoiceBookings(from, to)) {
      const sign = inv.type === 'storno' ? -1 : 1;
      const gross = sign * Number(inv.total_gross || 0);
      preview.push({
        source: inv.type,
        date: inv.issue_date,
        beleg: inv.doc_number,
        text: `${inv.doc_number} ${(inv.first_name || '') + ' ' + (inv.last_name || '')}`.trim(),
        konto: accounts.bank,
        gegenkonto: pickErloeseKonto(accounts, inv.tax_rate),
        amount: gross,
        sh: gross >= 0 ? 'S' : 'H',
      });
    }
  }
  if (what === 'all' || what === 'expenses') {
    for (const ex of fetchExpenseBookings(from, to)) {
      preview.push({
        source: 'expense',
        date: ex.expense_date,
        beleg: ex.invoice_number || `EXP-${ex.id}`,
        text: `${ex.vendor || ''} – ${ex.description || ''}`.trim(),
        konto: mapAufwandskonto(accounts, ex.category_name),
        gegenkonto: ex.payment_method === 'bar' ? accounts.kasse : accounts.bank,
        amount: Number(ex.amount_gross || 0),
        sh: 'S',
      });
    }
  }
  return preview;
}

// Konfig aus Settings laden
export function loadDatevConfig() {
  return {
    beraternummer: getSetting('datev_beraternummer') || '',
    mandantennummer: getSetting('datev_mandantennummer') || '',
    kontenrahmen: getSetting('datev_kontenrahmen') || 'skr03',
    bezeichnung: getSetting('datev_bezeichnung') || 'Werkstatt-Export',
    encoding: getSetting('datev_encoding') || 'cp1252',
    custom_accounts: safeJson(getSetting('datev_custom_accounts')) || null,
  };
}

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
