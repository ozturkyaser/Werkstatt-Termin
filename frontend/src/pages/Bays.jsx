import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const BAY_TYPES = [
  { value: 'hebebuehne', label: 'Hebebühne' },
  { value: 'ev_hebebuehne', label: 'EV-Hebebühne (HV-geeignet)' },
  { value: 'platz', label: 'Arbeitsplatz (keine Hebebühne)' },
  { value: 'spezial', label: 'Spezial-Bühne' },
];

export default function Bays() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [bays, setBays] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/bays').then(setBays).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const save = async (data) => {
    try {
      if (data.id) await api.put(`/bays/${data.id}`, data);
      else await api.post('/bays', data);
      setEditing(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    if (!confirm('Bühne wirklich löschen?')) return;
    try { await api.del(`/bays/${id}`); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bühnen & Arbeitsplätze</h1>
          <p className="text-sm text-slate-500 mt-1">
            Jede aktive Bühne erhöht die Tageskapazität. Ein Termin belegt gleichzeitig eine Bühne und einen Mitarbeiter.
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setEditing({ type: 'hebebuehne', active: 1 })}>
            + Bühne anlegen
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded bg-rose-50 text-rose-700 p-3 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bays.map((b) => (
          <div key={b.id} className={`card ${!b.active && 'opacity-50'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-lg">{b.name}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wide mt-1">
                  {BAY_TYPES.find((t) => t.value === b.type)?.label || b.type}
                </div>
                {b.description && <p className="text-sm text-slate-600 mt-2">{b.description}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => setEditing(b)}>Bearbeiten</button>
                  <button className="btn-ghost text-xs text-rose-600" onClick={() => remove(b.id)}>×</button>
                </div>
              )}
            </div>
            <div className="mt-3">
              <span className={`badge ${b.active ? 'badge-green' : 'badge-slate'}`}>
                {b.active ? 'Aktiv' : 'Inaktiv'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {bays.length === 0 && (
        <div className="card text-center text-slate-500">
          Noch keine Bühnen angelegt. Ohne Bühnen können keine Online-Termine vergeben werden.
        </div>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'Bühne bearbeiten' : 'Neue Bühne'}>
          <BayForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function BayForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial.id,
    name: initial.name || '',
    type: initial.type || 'hebebuehne',
    description: initial.description || '',
    active: initial.active ?? 1,
    sort_order: initial.sort_order ?? 0,
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
      <div>
        <label className="label">Name *</label>
        <input className="input" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div>
        <label className="label">Typ *</label>
        <select className="input" value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {BAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Beschreibung</label>
        <textarea className="input" rows={2} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} />
          <span>Aktiv</span>
        </label>
        <div>
          <label className="label !mb-0 inline-block">Sortierung</label>
          <input type="number" className="input w-20 ml-2 inline-block" value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Abbrechen</button>
        <button type="submit" className="btn-primary">Speichern</button>
      </div>
    </form>
  );
}
