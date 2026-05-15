import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get(`/customers${qs}`).then(setRows);
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kunden</h1>
          <p className="text-slate-500 text-sm">Kundenverwaltung inkl. Kontaktdaten & Fahrzeuge.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Neuer Kunde</button>
      </div>

      <input className="input max-w-md" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Suche nach Name, E-Mail, Telefon…" />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Telefon</th>
              <th className="text-left px-4 py-3">E-Mail</th>
              <th className="text-left px-4 py-3">Adresse</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/kunden/${c.id}`} className="text-brand-700 hover:underline">
                    {c.last_name}, {c.first_name}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.phone || '–'}</td>
                <td className="px-4 py-3">{c.email || '–'}</td>
                <td className="px-4 py-3 text-slate-600">{c.address || '–'}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/kunden/${c.id}`} className="text-brand-600 hover:underline">Details</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                Keine Kunden gefunden.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Neuen Kunden anlegen">
        <CustomerForm onSaved={() => { setCreating(false); load(); }}
          onCancel={() => setCreating(false)} />
      </Modal>
    </div>
  );
}

export function CustomerForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name || '',
    last_name: initial?.last_name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    whatsapp: initial?.whatsapp || '',
    address: initial?.address || '',
    notes: initial?.notes || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = initial
        ? await api.put(`/customers/${initial.id}`, form)
        : await api.post('/customers', form);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  return (
    <form onSubmit={save} className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Vorname *</label>
          <input className="input" required value={form.first_name}
            onChange={(e) => upd('first_name', e.target.value)} /></div>
        <div><label className="label">Nachname *</label>
          <input className="input" required value={form.last_name}
            onChange={(e) => upd('last_name', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Telefon</label>
          <input className="input" value={form.phone}
            onChange={(e) => upd('phone', e.target.value)} /></div>
        <div><label className="label">WhatsApp (falls abweichend)</label>
          <input className="input" value={form.whatsapp}
            onChange={(e) => upd('whatsapp', e.target.value)}
            placeholder="+49…" /></div>
      </div>
      <div><label className="label">E-Mail</label>
        <input type="email" className="input" value={form.email}
          onChange={(e) => upd('email', e.target.value)} /></div>
      <div><label className="label">Adresse</label>
        <input className="input" value={form.address}
          onChange={(e) => upd('address', e.target.value)} /></div>
      <div><label className="label">Notizen</label>
        <textarea className="input" value={form.notes}
          onChange={(e) => upd('notes', e.target.value)} /></div>

      <div className="flex gap-2 pt-2 border-t">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
