import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiAbsoluteUrl } from '../lib/api';

function randomHexSecret(len = 48) {
  const a = new Uint8Array(len / 2);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function SetupWizard() {
  const [params] = useSearchParams();
  const [tokenInput, setTokenInput] = useState(() => params.get('token') || '');
  const [status, setStatus] = useState(null);
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    const q = tokenInput.trim() ? `?token=${encodeURIComponent(tokenInput.trim())}` : '';
    const r = await fetch(apiAbsoluteUrl(`/api/setup/status${q}`));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStatus(null);
      setError(data.error || 'Status konnte nicht geladen werden');
      return;
    }
    setStatus(data);
    if (data.fields) {
      setFields(data.fields);
      setValues((prev) => {
        const next = { ...prev };
        for (const f of data.fields) {
          if (next[f.key] === undefined) next[f.key] = '';
        }
        return next;
      });
    }
  }, [tokenInput]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const core = fields.filter((f) => ['JWT_SECRET', 'JWT_EXPIRES_IN', 'FRONTEND_URL'].includes(f.key));
    const workshop = fields.filter((f) => f.key.startsWith('WORKSHOP'));
    const remind = fields.filter((f) => f.key === 'REMINDER_HOURS_BEFORE');
    const smtp = fields.filter((f) => f.key.startsWith('SMTP'));
    const twilio = fields.filter((f) => f.key.startsWith('TWILIO'));
    return { core, workshop, remind, smtp, twilio };
  }, [fields]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await fetch(apiAbsoluteUrl('/api/setup/finish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim(), values }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      setDoneMsg(data.message || 'Gespeichert.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (doneMsg) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-900 p-4">
        <div className="max-w-lg card p-8 space-y-4">
          <h1 className="text-xl font-bold text-green-700">Einrichtung abgeschlossen</h1>
          <p className="text-slate-600 text-sm whitespace-pre-wrap">{doneMsg}</p>
          <Link to="/login" className="btn-primary inline-block text-center w-full">Zur Anmeldung</Link>
        </div>
      </div>
    );
  }

  if (status && status.setupRequired === false) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-900 p-4">
        <div className="max-w-lg card p-8 space-y-4 text-center">
          <p className="text-slate-600">Die Einrichtung ist bereits abgeschlossen.</p>
          <Link to="/login" className="btn-primary inline-block">Zur Anmeldung</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-800 p-4 py-10">
      <div className="max-w-2xl mx-auto card p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Server-Einrichtung</h1>
          <p className="text-sm text-slate-500 mt-1">
            Einmalig alle Umgebungsvariablen erfassen. Der Einmal-Token steht in den Server-Logs beim ersten Start
            (Zeile mit <code className="bg-slate-100 px-1 rounded">/einrichtung?token=</code>).
          </p>
        </div>

        <div>
          <label className="label">Einrichtungs-Token</label>
          <input
            className="input font-mono text-sm"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Token aus den Logs einfügen"
          />
          <button type="button" className="btn-secondary text-sm mt-2" onClick={load}>Prüfen</button>
        </div>

        {status?.needToken && (
          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            Bitte den Token aus den Docker-/Server-Logs eintragen und „Prüfen“ wählen.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        {status?.fields && (
          <form onSubmit={submit} className="space-y-8">
            <FieldGroup title="Sicherheit & URL" fields={grouped.core} values={values} setValues={setValues} />
            <FieldGroup title="Werkstatt (Erinnerungen & E-Mails)" fields={grouped.workshop} values={values} setValues={setValues} />
            <FieldGroup title="Erinnerungen" fields={grouped.remind} values={values} setValues={setValues} />
            <FieldGroup title="SMTP (optional)" fields={grouped.smtp} values={values} setValues={setValues} />
            <FieldGroup title="Twilio SMS/WhatsApp (optional)" fields={grouped.twilio} values={values} setValues={setValues} />

            <div className="flex gap-3 pt-4 border-t">
              <button type="submit" className="btn-primary" disabled={saving || !tokenInput.trim()}>
                {saving ? 'Speichere…' : 'Konfiguration speichern'}
              </button>
              <Link to="/login" className="btn-secondary inline-flex items-center justify-center px-4 py-2 rounded-lg">Abbrechen</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldGroup({ title, fields, values, setValues }) {
  if (!fields.length) return null;
  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-slate-800 border-b pb-1">{title}</h2>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="label">
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </label>
            {f.hint && <p className="text-xs text-slate-500 mb-1">{f.hint}</p>}
            <div className="flex gap-2">
              <input
                type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                className="input flex-1"
                required={f.required}
                minLength={f.minLength}
                placeholder={f.placeholder || ''}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.key === 'JWT_SECRET' && (
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-sm"
                  onClick={() => setValues((v) => ({ ...v, JWT_SECRET: randomHexSecret(48) }))}
                >
                  Zufall
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
