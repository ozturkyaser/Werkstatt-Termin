import { useEffect, useState } from 'react';
import { api, getAssetsOrigin, getPublicApiBase } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o)',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    keyHint: 'sk-… (unter platform.openai.com erstellen)',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    keyHint: 'sk-ant-… (unter console.anthropic.com erstellen)',
  },
];

const PHONE_PROVIDERS = [
  { id: 'synthflow', name: 'Synthflow' },
  { id: 'retell', name: 'Retell AI' },
  { id: 'vapi', name: 'Vapi' },
  { id: 'openai_realtime', name: 'OpenAI Realtime' },
  { id: 'custom', name: 'Eigene Integration' },
];

const TABS = [
  { id: 'ai', label: '🤖 KI (Fahrzeugschein)' },
  { id: 'booking', label: '📅 Online-Buchung' },
  { id: 'tires', label: '🛞 Reifen & Abrechnung' },
  { id: 'apikeys', label: '🔑 API-Zugänge' },
  { id: 'phone', label: '☎️ Telefon-KI' },
  { id: 'datev', label: '🧾 DATEV' },
  { id: 'data', label: '🗄 Daten & Demo' },
];

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('ai');
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/settings').then(setData); }, []);
  if (!data) return <div>Lädt…</div>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Einstellungen</h1>
      <p className="text-sm text-slate-500 mb-6">
        Konfiguration von KI-Diensten, Online-Buchung und externen Schnittstellen.
      </p>

      {!isAdmin && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-200 text-amber-900 text-sm">
          Nur Administratoren können Einstellungen ändern. Du siehst die aktuelle Konfiguration.
        </div>
      )}

      <div className="flex gap-1 border-b mb-6">
        {TABS.map((t) => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ai' && <AISettings data={data} setData={setData} isAdmin={isAdmin} />}
      {tab === 'booking' && <BookingSettings data={data} setData={setData} isAdmin={isAdmin} />}
      {tab === 'tires' && <TireSeasonSettings data={data} setData={setData} isAdmin={isAdmin} />}
      {tab === 'apikeys' && <ApiKeys isAdmin={isAdmin} />}
      {tab === 'phone' && <PhoneAI data={data} setData={setData} isAdmin={isAdmin} />}
      {tab === 'datev' && <DatevSettings data={data} setData={setData} isAdmin={isAdmin} />}
      {tab === 'data' && <DataManagement isAdmin={isAdmin} />}
    </div>
  );
}

// ---------------- Daten & Demo ----------------

function DataManagement({ isAdmin }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [mode, setMode] = useState('transactional');

  async function loadStatus() {
    const s = await api.get('/admin/status');
    setStatus(s);
  }
  useEffect(() => { loadStatus(); }, []);

  async function importCatalog(clear) {
    if (clear && !confirm('Katalog frisch laden? Ungenutzte alte Einträge werden entfernt, belegte werden deaktiviert.')) return;
    setBusy('catalog');
    try {
      const r = await api.post('/admin/import-service-catalog', { mode: 'upsert', clear, keepPrices: true });
      alert(
        `Service-Katalog importiert!\n\n` +
        `Gesamt: ${r.total}\n` +
        `Neu angelegt: ${r.created}\n` +
        `Aktualisiert: ${r.updated}\n` +
        `Deaktiviert (alte): ${r.deactivated}\n` +
        `Kategorien: ${r.categories}`
      );
      loadStatus();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  async function seed(wipe) {
    if (wipe && !confirm('Wirklich alle bestehenden Kunden, Fahrzeuge, Termine und Dokumente löschen und durch Demo-Daten ersetzen?')) return;
    setBusy('seed');
    try {
      const r = await api.post('/admin/seed', { wipe });
      alert(
        'Demo-Daten erzeugt!\n' +
        Object.entries(r.created).map(([k, v]) => `  ${k}: ${v}`).join('\n')
      );
      loadStatus();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (confirmText !== 'RESET') {
      alert('Bitte "RESET" in das Feld eintippen, um den Reset zu bestätigen.');
      return;
    }
    setBusy('reset');
    try {
      await api.post('/admin/reset', { confirm: 'RESET', mode });
      alert(`Reset abgeschlossen (Modus: ${mode}).`);
      setConfirmText('');
      loadStatus();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return <div className="card p-4 text-sm text-slate-500">Nur Administratoren können Demo-Daten verwalten.</div>;
  }

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="card p-4">
        <h3 className="font-semibold mb-3">Aktueller Datenbestand</h3>
        {!status ? (
          <div className="text-sm text-slate-500">Lädt…</div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {Object.entries(status).map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs uppercase text-slate-500">{k}</div>
                <div className="text-2xl font-bold">{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service-Katalog */}
      <div className="card p-4 border-emerald-200 bg-emerald-50">
        <h3 className="font-semibold mb-1">🔧 Service-Katalog laden</h3>
        <p className="text-sm text-slate-600 mb-3">
          Importiert den vollständigen Standard-Katalog mit <strong>140 Werkstattleistungen</strong> in 16 Kategorien
          (Inspektion, Bremsen, Motor, Reifen, HU/AU, Klima, Elektrik, Diagnose …) – inkl. Arbeitszeit (Min/Max),
          Puffer vor/nach, Komplexität (1–4), Hebebühne-Anforderung und Kategorie-Farben für den Kalender.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            className="btn-ghost"
            onClick={() => importCatalog(false)}
            disabled={busy === 'catalog'}
          >
            {busy === 'catalog' ? 'Läuft…' : 'Katalog ergänzen (Preise behalten)'}
          </button>
          <button
            className="btn-primary"
            onClick={() => importCatalog(true)}
            disabled={busy === 'catalog'}
          >
            {busy === 'catalog' ? 'Läuft…' : 'Katalog frisch laden'}
          </button>
          <span className="text-xs text-slate-500">
            „Frisch laden" entfernt ungenutzte alte Einträge und deaktiviert solche mit bestehenden Terminen.
          </span>
        </div>
      </div>

      {/* Seed */}
      <div className="card p-4 border-primary-200 bg-primary-50">
        <h3 className="font-semibold mb-1">📦 Demo-Daten laden</h3>
        <p className="text-sm text-slate-600 mb-3">
          Erzeugt 15+ Kunden, 20+ Fahrzeuge, ~60 Termine (abgeschlossen mit Ist-Zeiten + heute aktiv + zukünftige),
          30+ Rechnungen/Angebote und ~35 Ausgaben aus den letzten Monaten. Perfekt, um alle Funktionen zu sehen.
        </p>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={() => seed(false)}
            disabled={busy === 'seed'}
          >
            {busy === 'seed' ? 'Läuft…' : 'Zusätzlich zu bestehenden Daten'}
          </button>
          <button
            className="btn-primary"
            onClick={() => seed(true)}
            disabled={busy === 'seed'}
          >
            {busy === 'seed' ? 'Läuft…' : 'Demo-Daten frisch laden (löscht bestehende)'}
          </button>
        </div>
      </div>

      {/* Reset */}
      <div className="card p-4 border-rose-300 bg-rose-50">
        <h3 className="font-semibold text-rose-900 mb-1">⚠️ Alles löschen (Werkreset)</h3>
        <p className="text-sm text-rose-900 mb-3">
          Entfernt alle Daten unwiderruflich. Einstellungen, Benutzer-Accounts und ggf. Katalogdaten
          bleiben je nach Modus erhalten. <strong>Das kann nicht rückgängig gemacht werden!</strong>
        </p>

        <div className="space-y-2 mb-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              checked={mode === 'transactional'}
              onChange={() => setMode('transactional')}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Transaktionsdaten löschen</div>
              <div className="text-xs text-rose-800">
                Entfernt Kunden, Fahrzeuge, Termine, Dokumente und Ausgaben. Leistungs-Katalog,
                Bühnen, Einstellungen und Benutzer bleiben.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Vollständig (inkl. Katalog)</div>
              <div className="text-xs text-rose-800">
                Wie oben, zusätzlich: Dienstleistungen, Bühnen, API-Keys, Mitarbeiter-Pläne,
                Ausgabenkategorien. Nur Benutzer-Accounts und Einstellungen bleiben.
              </div>
            </div>
          </label>
        </div>

        <div className="flex gap-2 items-center">
          <input
            className="input text-sm flex-1"
            placeholder='Zum Bestätigen "RESET" eintippen'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <button
            className="btn-primary bg-rose-600 hover:bg-rose-700"
            onClick={reset}
            disabled={busy === 'reset' || confirmText !== 'RESET'}
          >
            {busy === 'reset' ? 'Lösche…' : '🗑️ Jetzt löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- KI (Fahrzeugschein-Scan) ----------------

function AISettings({ data, setData, isAdmin }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const current = PROVIDERS.find((p) => p.id === data.ai_provider) || PROVIDERS[0];

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const payload = {
        ai_provider: data.ai_provider,
        ai_model: data.ai_model,
        ai_language: data.ai_language,
      };
      if (data.ai_api_key && !data.ai_api_key.startsWith('****')) payload.ai_api_key = data.ai_api_key;
      const updated = await api.put('/settings', payload);
      setData(updated);
      setMsg({ type: 'ok', text: 'Gespeichert.' });
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }
  const upd = (k, v) => setData((d) => ({ ...d, [k]: v }));

  return (
    <form onSubmit={save} className="card p-6 space-y-4">
      <p className="text-sm text-slate-500">
        Vision-fähiger Anbieter für den Fahrzeugschein-Scan. Bilder werden nicht gespeichert.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Anbieter</label>
          <select className="input" value={data.ai_provider} disabled={!isAdmin}
            onChange={(e) => {
              const p = PROVIDERS.find((x) => x.id === e.target.value);
              upd('ai_provider', e.target.value);
              if (p && !p.models.includes(data.ai_model)) upd('ai_model', p.models[0]);
            }}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Modell</label>
          <input list="ai-models" className="input" value={data.ai_model || ''} disabled={!isAdmin}
            onChange={(e) => upd('ai_model', e.target.value)} />
          <datalist id="ai-models">
            {current.models.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>
      <div>
        <label className="label">API-Key</label>
        <input type="password" className="input font-mono text-xs" disabled={!isAdmin}
          value={data.ai_api_key || ''}
          onChange={(e) => upd('ai_api_key', e.target.value)}
          placeholder={data.ai_api_key_set ? 'Key ist gesetzt – zum Ändern neu eingeben' : current.keyHint} />
          <div className="text-xs text-slate-500 mt-1">
            {data.ai_api_key_set
              ? 'Ein API-Key ist gespeichert. Leer lassen, um den bestehenden Key zu behalten.'
              : current.keyHint}
          </div>
      </div>
      {msg && <Notice msg={msg} />}
      {isAdmin && (
        <div className="pt-3 border-t">
          <button className="btn-primary" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
        </div>
      )}
    </form>
  );
}

// ---------------- Online-Buchung ----------------

function BookingSettings({ data, setData, isAdmin }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const upd = (k, v) => setData((d) => ({ ...d, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const updated = await api.put('/settings', {
        booking_mode: data.booking_mode,
        booking_min_lead_hours: String(data.booking_min_lead_hours || 2),
        booking_max_days_ahead: String(data.booking_max_days_ahead || 60),
      });
      setData(updated);
      setMsg({ type: 'ok', text: 'Gespeichert.' });
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={save} className="card p-6 space-y-4">
      <p className="text-sm text-slate-500">
        Steuert Online-Buchungen über Website-Widget und Telefon-KI. Die Kapazität ergibt sich aus Bühnen × Arbeitszeit × Mitarbeiter.
      </p>
      <div>
        <label className="label">Bestätigungs-Modus</label>
        <div className="space-y-2">
          {[
            { v: 'auto', t: 'Sofort bestätigen', d: 'Online-Buchungen werden automatisch als bestätigt übernommen.' },
            { v: 'pending', t: 'Immer manuell bestätigen', d: 'Alle Online-Buchungen landen zur Kontrolle im Pending-Ordner.' },
            { v: 'smart', t: 'Smart (empfohlen)', d: 'Bestandskunden werden automatisch bestätigt, neue Kunden manuell.' },
          ].map((o) => (
            <label key={o.v} className={`flex gap-3 p-3 border rounded-lg cursor-pointer ${
              data.booking_mode === o.v ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
            }`}>
              <input type="radio" name="bm" disabled={!isAdmin}
                checked={data.booking_mode === o.v}
                onChange={() => upd('booking_mode', o.v)} />
              <div>
                <div className="font-medium">{o.t}</div>
                <div className="text-sm text-slate-500">{o.d}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Mindestvorlauf (Stunden)</label>
          <input type="number" min="0" className="input" disabled={!isAdmin}
            value={data.booking_min_lead_hours || 2}
            onChange={(e) => upd('booking_min_lead_hours', e.target.value)} />
          <div className="text-xs text-slate-500 mt-1">Wie früh vor Termin kann man noch buchen?</div>
        </div>
        <div>
          <label className="label">Max. Vorausbuchung (Tage)</label>
          <input type="number" min="1" className="input" disabled={!isAdmin}
            value={data.booking_max_days_ahead || 60}
            onChange={(e) => upd('booking_max_days_ahead', e.target.value)} />
        </div>
      </div>
      {msg && <Notice msg={msg} />}
      {isAdmin && (
        <div className="pt-3 border-t">
          <button className="btn-primary" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
        </div>
      )}
    </form>
  );
}

// ---------------- Reifen-Saison & Abrechnung ----------------

const MONTHS = [
  { v: '1', t: 'Januar' }, { v: '2', t: 'Februar' }, { v: '3', t: 'März' }, { v: '4', t: 'April' },
  { v: '5', t: 'Mai' }, { v: '6', t: 'Juni' }, { v: '7', t: 'Juli' }, { v: '8', t: 'August' },
  { v: '9', t: 'September' }, { v: '10', t: 'Oktober' }, { v: '11', t: 'November' }, { v: '12', t: 'Dezember' },
];

function TireSeasonSettings({ data, setData, isAdmin }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const upd = (k, v) => setData((d) => ({ ...d, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api.put('/settings', {
        tire_reminder_enabled: String(data.tire_reminder_enabled !== false && data.tire_reminder_enabled !== 'false'),
        tire_mail_winter_month: String(data.tire_mail_winter_month || 10),
        tire_mail_summer_month: String(data.tire_mail_summer_month || 3),
        tire_mail_day_max: String(data.tire_mail_day_max || 7),
        public_booking_base_url: data.public_booking_base_url || '',
        default_labor_rate_net: data.default_labor_rate_net != null ? String(data.default_labor_rate_net) : '',
      });
      setData(updated);
      setMsg({ type: 'ok', text: 'Gespeichert.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const tireOn = data.tire_reminder_enabled !== false && data.tire_reminder_enabled !== 'false';

  return (
    <form onSubmit={save} className="card p-6 space-y-5">
      <p className="text-sm text-slate-500">
        Für jeden aktiven Reifen-Lagereintrag mit gültiger Kunden-E-Mail sendet der Server automatisch Hinweise:
        Winterräder im konfigurierten Herbst-Monat, Sommerräder im Frühjahrs-Monat (nur in den ersten Tagen des Monats, einmal pro Jahr).
        Voraussetzung: SMTP ist korrekt eingerichtet (siehe Server-Umgebung).
      </p>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          disabled={!isAdmin}
          checked={tireOn}
          onChange={(e) => upd('tire_reminder_enabled', e.target.checked ? 'true' : 'false')}
        />
        <span className="text-sm font-medium">Saison-E-Mails für Reifen-Einlagerung aktiv</span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Winter-Hinweis (Monat)</label>
          <select className="input" disabled={!isAdmin} value={String(data.tire_mail_winter_month || 10)} onChange={(e) => upd('tire_mail_winter_month', e.target.value)}>
            {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
          </select>
          <p className="text-xs text-slate-500 mt-1">Typisch Oktober – für Kunden mit eingelagertem Winter-Set.</p>
        </div>
        <div>
          <label className="label">Sommer-Hinweis (Monat)</label>
          <select className="input" disabled={!isAdmin} value={String(data.tire_mail_summer_month || 3)} onChange={(e) => upd('tire_mail_summer_month', e.target.value)}>
            {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
          </select>
          <p className="text-xs text-slate-500 mt-1">Typisch März/April – für eingelagerte Sommer-Kompletträder.</p>
        </div>
        <div>
          <label className="label">Versand nur an den ersten … Tagen</label>
          <input type="number" min="1" max="28" className="input" disabled={!isAdmin} value={data.tire_mail_day_max || 7} onChange={(e) => upd('tire_mail_day_max', e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">Begrenzt Doppel-E-Mails im selben Monat.</p>
        </div>
      </div>

      <div>
        <label className="label">Öffentliche Buchungs-URL (für Link in der E-Mail)</label>
        <input
          className="input"
          disabled={!isAdmin}
          placeholder="https://ihre-domain.de"
          value={data.public_booking_base_url || ''}
          onChange={(e) => upd('public_booking_base_url', e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">Es wird <code className="bg-slate-100 px-1 rounded">/kalender</code> angehängt. Leer lassen = Fallback auf FRONTEND_URL der API.</p>
      </div>

      <div>
        <label className="label">Standard-Stundensatz netto (€/h, optional)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="input max-w-xs"
          disabled={!isAdmin}
          placeholder="z. B. 85"
          value={data.default_labor_rate_net ?? ''}
          onChange={(e) => upd('default_labor_rate_net', e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">Wird für die Arbeitszeit-Zeile genutzt, wenn aus einem Termin eine Rechnung erzeugt wird.</p>
      </div>

      {msg && <Notice msg={msg} />}
      {isAdmin && (
        <div className="pt-3 border-t">
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
        </div>
      )}
    </form>
  );
}

// ---------------- API-Keys & Widget-Einbindung ----------------

function ApiKeys({ isAdmin }) {
  const [keys, setKeys] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [justCreated, setJustCreated] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/api-keys').then(setKeys).catch((e) => setMsg({ type:'err', text:e.message }));
  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    const r = await api.post('/api-keys', { name: newName.trim() });
    setJustCreated(r);
    setNewName(''); setCreating(false);
    load();
  }
  async function toggle(k) {
    await api.patch(`/api-keys/${k.id}`, { active: !k.active });
    load();
  }
  async function remove(k) {
    if (!confirm(`API-Key "${k.name}" wirklich löschen? Widgets, die ihn nutzen, funktionieren danach nicht mehr.`)) return;
    await api.del(`/api-keys/${k.id}`);
    load();
  }

  if (!isAdmin) {
    return <div className="card p-4 text-slate-500 text-sm">Nur Administratoren sehen API-Zugänge.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">API-Zugänge</h2>
            <p className="text-sm text-slate-500">Für WordPress-Widget, Telefon-KI und andere externe Systeme.</p>
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)}>+ Neuer Schlüssel</button>
        </div>

        {creating && (
          <div className="border rounded-lg p-4 mb-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Name / Verwendungszweck</label>
              <input className="input" autoFocus
                placeholder="z.B. WordPress-Widget, Synthflow Telefon-KI…"
                value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={create}>Erzeugen</button>
            <button className="btn-ghost" onClick={() => { setCreating(false); setNewName(''); }}>Abbrechen</button>
          </div>
        )}

        {justCreated && (
          <div className="mb-4 p-4 border-2 border-amber-400 bg-amber-50 rounded-lg">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-semibold text-amber-900">
                  ⚠ Neuer API-Schlüssel erzeugt – jetzt kopieren!
                </div>
                <div className="text-sm text-amber-800 mt-1">
                  Aus Sicherheitsgründen wird dieser Schlüssel nur einmal angezeigt.
                </div>
                <div className="mt-3 font-mono text-sm bg-white border rounded px-3 py-2 break-all select-all">
                  {justCreated.api_key}
                </div>
              </div>
              <button className="btn-ghost ml-4" onClick={() => setJustCreated(null)}>Schließen</button>
            </div>
          </div>
        )}

        {msg && <Notice msg={msg} />}

        {keys.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-6">
            Noch keine API-Zugänge. Erzeuge einen Schlüssel für dein WordPress-Widget oder die Telefon-KI.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500 border-b">
              <tr><th className="text-left py-2">Name</th><th className="text-left">Prefix</th>
                <th className="text-left">Erstellt</th><th className="text-left">Zuletzt benutzt</th>
                <th className="text-left">Status</th><th></th></tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((k) => (
                <tr key={k.id} className={!k.active ? 'opacity-50' : ''}>
                  <td className="py-3">{k.name}</td>
                  <td className="font-mono text-xs">{k.key_prefix}…</td>
                  <td>{new Date(k.created_at).toLocaleDateString('de-DE')}</td>
                  <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString('de-DE') : '—'}</td>
                  <td>{k.active
                    ? <span className="badge badge-green">Aktiv</span>
                    : <span className="badge badge-slate">Deaktiviert</span>}</td>
                  <td className="text-right space-x-2">
                    <button className="btn-ghost text-xs" onClick={() => toggle(k)}>
                      {k.active ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button className="btn-ghost text-xs text-rose-600" onClick={() => remove(k)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-lg mb-2">📦 Einbindung in WordPress & Websites</h2>
        <p className="text-sm text-slate-500 mb-4">
          Die folgenden Snippets binden das Online-Buchungs-Widget ein. Ersetze
          <code className="mx-1">wk_live_XXXX</code> durch deinen API-Schlüssel von oben.
        </p>

        <div className="mb-4">
          <div className="text-sm font-medium mb-1">Variante 1: JavaScript-Embed (empfohlen)</div>
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-3 overflow-x-auto">
{`<div id="werkstatt-termin"></div>
<script src="${getAssetsOrigin()}/widget/widget.js"
        data-key="wk_live_XXXX"
        data-api="${getPublicApiBase()}"
        data-height="780"></script>`}
          </pre>
        </div>

        <div className="mb-4">
          <div className="text-sm font-medium mb-1">Variante 2: iFrame direkt</div>
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-3 overflow-x-auto">
{`<iframe src="${getAssetsOrigin()}/widget/embed.html?api_key=wk_live_XXXX"
        width="100%" height="780" frameborder="0"></iframe>`}
          </pre>
        </div>

        <div className="text-sm text-slate-600">
          <strong>WordPress-Tipp:</strong> Füge das Snippet als "Custom HTML" Block auf einer Seite ein
          (z.B. unter "Termin online buchen"). Alternativ in einem Plugin wie "Insert Headers and Footers".
        </div>
      </div>
    </div>
  );
}

// ---------------- Telefon-KI ----------------

function PhoneAI({ data, setData, isAdmin }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const upd = (k, v) => setData((d) => ({ ...d, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const payload = {
        phone_ai_provider: data.phone_ai_provider,
        phone_ai_enabled: data.phone_ai_enabled,
      };
      if (data.phone_ai_webhook_secret && !data.phone_ai_webhook_secret.startsWith('****')) {
        payload.phone_ai_webhook_secret = data.phone_ai_webhook_secret;
      }
      const updated = await api.put('/settings', payload);
      setData(updated);
      setMsg({ type: 'ok', text: 'Gespeichert.' });
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Telefon-KI-Assistent</h2>
          <p className="text-sm text-slate-500">
            Die Telefon-KI nutzt die gleiche Public-API wie das Website-Widget.
            Lege oben einen eigenen API-Schlüssel an (z.B. "Synthflow Telefon-KI") und hinterlege ihn bei deinem Provider.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Provider</label>
            <select className="input" disabled={!isAdmin}
              value={data.phone_ai_provider || 'synthflow'}
              onChange={(e) => upd('phone_ai_provider', e.target.value)}>
              {PHONE_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Aktiv</label>
            <select className="input" disabled={!isAdmin}
              value={String(data.phone_ai_enabled) === 'true' ? 'true' : 'false'}
              onChange={(e) => upd('phone_ai_enabled', e.target.value)}>
              <option value="false">Deaktiviert</option>
              <option value="true">Aktiv</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Webhook-Secret (optional)</label>
          <input type="password" className="input font-mono text-xs" disabled={!isAdmin}
            value={data.phone_ai_webhook_secret || ''}
            onChange={(e) => upd('phone_ai_webhook_secret', e.target.value)}
            placeholder={data.phone_ai_webhook_secret_set ? '**** gesetzt' : 'Shared secret für eingehende Webhooks'} />
        </div>
        {msg && <Notice msg={msg} />}
        {isAdmin && (
          <div className="pt-3 border-t">
            <button className="btn-primary" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
          </div>
        )}
      </form>

      <div className="card p-6 text-sm space-y-3">
        <h3 className="font-semibold text-slate-800">🛠 Integrations-Leitfaden (Synthflow / Retell / Vapi)</h3>
        <p className="text-slate-600">
          Gib der Telefon-KI folgende Funktionen frei (Tool-Calling). Jede ruft einen Endpunkt mit deinem API-Key auf:
        </p>
        <ol className="list-decimal ml-5 space-y-2 text-slate-700">
          <li><code>get_services()</code> → <code>GET {getPublicApiBase()}/services</code></li>
          <li><code>check_availability(date, service_ids)</code> →
            <code className="ml-1">GET {getPublicApiBase()}/availability?date=&amp;service_ids=</code></li>
          <li><code>create_booking(customer, vehicle, service_ids, start_time)</code> →
            <code className="ml-1">POST {getPublicApiBase()}/bookings</code></li>
        </ol>
        <div className="bg-slate-50 border rounded p-3 text-xs text-slate-600">
          Authentifizierung: Header <code>X-API-Key: wk_live_…</code>
        </div>
      </div>
    </div>
  );
}

function Notice({ msg }) {
  return (
    <div className={`text-sm rounded-lg px-3 py-2 border ${
      msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
    }`}>{msg.text}</div>
  );
}

// ---------------- DATEV ----------------

function DatevSettings({ data, setData, isAdmin }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [presets, setPresets] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => { api.get('/datev/account-presets').then(setPresets).catch(() => {}); }, []);

  const upd = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const customAccounts = (() => {
    try { return data.datev_custom_accounts ? JSON.parse(data.datev_custom_accounts) : {}; }
    catch { return {}; }
  })();

  function setCustomAccount(key, value) {
    const next = { ...customAccounts };
    if (value) next[key] = value; else delete next[key];
    upd('datev_custom_accounts', Object.keys(next).length ? JSON.stringify(next) : '');
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      await api.put('/settings', {
        datev_beraternummer: data.datev_beraternummer || '',
        datev_mandantennummer: data.datev_mandantennummer || '',
        datev_kontenrahmen: data.datev_kontenrahmen || 'skr03',
        datev_bezeichnung: data.datev_bezeichnung || 'Werkstatt-Export',
        datev_encoding: data.datev_encoding || 'cp1252',
        datev_custom_accounts: data.datev_custom_accounts || '',
      });
      setMsg({ type: 'ok', text: 'Gespeichert.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  }

  const activePreset = presets?.[data.datev_kontenrahmen || 'skr03'] || {};
  const ACCOUNT_LABELS = {
    erloese_19: 'Erlöse 19% USt.',
    erloese_7:  'Erlöse 7% USt.',
    erloese_0:  'Erlöse steuerfrei',
    bank: 'Bank',
    kasse: 'Kasse',
    aufwand_default: 'Aufwand (Standard / Sonstiges)',
    aufwand_ersatzteile: 'Aufwand Ersatzteile / Wareneingang',
    aufwand_verbrauch:   'Aufwand Verbrauchsmaterial',
    aufwand_werkzeug:    'Aufwand Werkzeug',
    aufwand_miete:       'Aufwand Miete',
    aufwand_strom:       'Aufwand Strom / Wasser',
    aufwand_versicherung:'Aufwand Versicherung',
    aufwand_marketing:   'Aufwand Marketing',
    aufwand_buero:       'Aufwand Bürobedarf',
    aufwand_fahrzeug:    'Aufwand Kfz-Kosten',
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">🧾 DATEV-Konfiguration</h2>
          <p className="text-sm text-slate-500 mt-1">
            Diese Daten bekommst du von deinem Steuerberater. Sie erscheinen im EXTF-Header jedes Exports.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Beraternummer</label>
            <input className="input" type="text" disabled={!isAdmin}
              value={data.datev_beraternummer || ''}
              onChange={(e) => upd('datev_beraternummer', e.target.value)}
              placeholder="z.B. 1234567" />
            <p className="text-xs text-slate-500 mt-1">7-stellig, vom Steuerberater</p>
          </div>
          <div>
            <label className="label">Mandantennummer</label>
            <input className="input" type="text" disabled={!isAdmin}
              value={data.datev_mandantennummer || ''}
              onChange={(e) => upd('datev_mandantennummer', e.target.value)}
              placeholder="z.B. 12345" />
            <p className="text-xs text-slate-500 mt-1">Eure Mandantennummer</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Kontenrahmen</label>
            <select className="input" disabled={!isAdmin}
              value={data.datev_kontenrahmen || 'skr03'}
              onChange={(e) => upd('datev_kontenrahmen', e.target.value)}>
              <option value="skr03">SKR 03 (Deutschland, meistverbreitet)</option>
              <option value="skr04">SKR 04</option>
            </select>
          </div>
          <div>
            <label className="label">Zeichenkodierung</label>
            <select className="input" disabled={!isAdmin}
              value={data.datev_encoding || 'cp1252'}
              onChange={(e) => upd('datev_encoding', e.target.value)}>
              <option value="cp1252">ANSI / Windows-1252 (DATEV-Standard)</option>
              <option value="utf8">UTF-8 mit BOM (Unternehmen online)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Bezeichnung (Header)</label>
          <input className="input" type="text" disabled={!isAdmin}
            value={data.datev_bezeichnung || ''}
            onChange={(e) => upd('datev_bezeichnung', e.target.value)}
            placeholder="z.B. Werkstatt-Buchungen" />
        </div>

        {msg && <Notice msg={msg} />}
        {isAdmin && (
          <div className="pt-3 border-t">
            <button className="btn-primary" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
          </div>
        )}
      </form>

      {/* Konten-Mapping */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">📘 Sachkonten-Zuordnung</h3>
            <p className="text-xs text-slate-500">Nutze die Standard-Vorgaben des Kontenrahmens oder passe sie individuell an.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setCustomOpen((v) => !v)}>
            {customOpen ? 'Schließen' : 'Anpassen'}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {Object.entries(ACCOUNT_LABELS).map(([key, label]) => (
            <div key={key} className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">{label}</span>
              {customOpen && isAdmin ? (
                <input type="text" className="w-24 text-right font-mono border rounded px-2 py-0.5"
                  placeholder={activePreset[key] || '----'}
                  value={customAccounts[key] || ''}
                  onChange={(e) => setCustomAccount(key, e.target.value.trim())} />
              ) : (
                <span className="font-mono">{customAccounts[key] || activePreset[key] || '—'}</span>
              )}
            </div>
          ))}
        </div>

        {customOpen && (
          <p className="text-xs text-slate-500 border-t pt-3">
            Leer lassen = Standard aus dem Kontenrahmen verwenden.
            Abweichende Konten werden nur beim Export angewendet.
          </p>
        )}
      </div>

      {/* Info-Box */}
      <div className="card p-6 text-sm space-y-3">
        <h3 className="font-semibold text-slate-800">ℹ️ So funktioniert der Export</h3>
        <ul className="list-disc ml-5 space-y-2 text-slate-600">
          <li>
            Im Modul <strong>Buchhaltung → DATEV-Export</strong> wählst du Zeitraum und Inhalt (Einnahmen, Ausgaben, beides).
          </li>
          <li>
            Das System erzeugt einen <strong>EXTF-Buchungsstapel (Version 7.00)</strong> als CSV – direkt importierbar in
            DATEV Rechnungswesen oder DATEV Unternehmen online.
          </li>
          <li>
            <strong>Einnahmen:</strong> Jede bezahlte Rechnung wird gegen das passende Erlöskonto gebucht (19% / 7% / 0%).
            Stornos erzeugen negative Buchungen.
          </li>
          <li>
            <strong>Ausgaben:</strong> werden nach Kategorie auf das zugehörige Aufwandskonto gebucht,
            Gegenkonto ist Bank oder Kasse je nach Zahlart.
          </li>
          <li>
            Vor dem Export kannst du eine <strong>Vorschau</strong> der Buchungssätze ansehen.
          </li>
        </ul>
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-amber-900 text-xs">
          <strong>Hinweis:</strong> Besprich die Konten-Zuordnung einmalig mit deinem Steuerberater.
          Nicht jede Werkstatt nutzt identische Konten.
        </div>
      </div>
    </div>
  );
}
