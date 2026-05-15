import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const EVENT_HELP = `Kommagetrennte Events, oder * für alle. Beispiele:
appointment.created, appointment.updated, appointment.status_changed, appointment.deleted, webhook.test`;

export default function Integrations() {
  const { user, loading: authLoading } = useAuth();
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ url: '', description: '', secret: '', events: 'appointment.status_changed', active: true });
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api.get('/webhooks').then(setHooks).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (authLoading || user?.role !== 'admin') return;
    load();
  }, [authLoading, user?.role]);

  if (authLoading) return <div className="p-8 text-slate-500">Lädt…</div>;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  async function addHook(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/webhooks', form);
      setForm({ url: '', description: '', secret: '', events: 'appointment.status_changed', active: true });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('Webhook löschen?')) return;
    await api.del(`/webhooks/${id}`);
    load();
  }

  async function test(id) {
    try {
      await api.post(`/webhooks/${id}/test`, {});
      alert('Test wurde ausgelöst (asynchron). Prüfen Sie Ihren Server-Log bzw. Ziel-URL.');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-slate-500 text-sm">
          Benachrichtigen Sie externe Systeme (z. B. KI-Telefon, Zapier, eigenes CRM), wenn sich etwas an einem Termin ändert.
          Optional: gemeinsames Geheimnis – Signatur im Header <code className="bg-slate-100 px-1 rounded">X-Webhook-Signature: sha256=…</code> (HMAC über den JSON-Body).
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Neuer Webhook</h2>
        <form onSubmit={addHook} className="space-y-3">
          <div>
            <label className="label">Ziel-URL *</label>
            <input className="input" required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/hooks/werkstatt" />
          </div>
          <div>
            <label className="label">Bezeichnung</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Geheimnis (optional)</label>
            <input className="input" type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })}
              placeholder="Für HMAC-Signatur" autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Events</label>
            <input className="input font-mono text-sm" value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} />
            <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{EVENT_HELP}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Aktiv
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Speichert…' : 'Webhook anlegen'}</button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Eingerichtete Webhooks</h2>
        {loading ? <div className="text-slate-500">Lädt…</div> : hooks.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Webhooks.</p>
        ) : (
          <ul className="divide-y">
            {hooks.map((h) => (
              <li key={h.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-sm break-all">{h.url}</div>
                  <div className="text-xs text-slate-500">{h.description || '–'} · Events: {h.events} · {h.active ? 'aktiv' : 'inaktiv'}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => test(h.id)}>Test</button>
                  <button type="button" className="btn-danger text-xs" onClick={() => remove(h.id)}>Löschen</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
