import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get('/inventory').then(setRows), []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(ev, body, id) {
    ev.preventDefault();
    setSaving(true);
    try {
      if (id) await api.put(`/inventory/${id}`, body);
      else await api.post('/inventory', body);
      setModal(null);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('Artikel wirklich löschen?')) return;
    await api.del(`/inventory/${id}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lager / Teile</h1>
          <p className="text-slate-500 text-sm">Mindestbestände im Blick – Bearbeiten nur für Administratoren.</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn-primary" onClick={() => setModal({})}>+ Artikel</button>
        )}
      </div>

      {!isAdmin && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-amber-900 text-sm">
          Sie sehen den Bestand. Zum Anlegen oder Ändern von Artikeln ist die Rolle Administrator nötig.
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-left px-4 py-3">Bezeichnung</th>
              <th className="text-right px-4 py-3">Bestand</th>
              <th className="text-right px-4 py-3">Mindest</th>
              <th className="text-left px-4 py-3">Einheit</th>
              <th className="text-left px-4 py-3">Notiz</th>
              {isAdmin && <th className="text-right px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const low = Number(r.quantity) < Number(r.min_quantity || 0);
              return (
                <tr key={r.id} className={low ? 'bg-amber-50/80' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-3 font-mono text-xs">{r.sku || '–'}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-right">{r.quantity}</td>
                  <td className="px-4 py-3 text-right">{r.min_quantity}</td>
                  <td className="px-4 py-3">{r.unit}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.notes || ''}>{r.notes || '–'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      <button type="button" className="text-brand-600 hover:underline" onClick={() => setModal({ ...r })}>Bearbeiten</button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => remove(r.id)}>Löschen</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-slate-500">Noch keine Artikel.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.id ? 'Artikel bearbeiten' : 'Neuer Lagerartikel'}>
        {modal && isAdmin && (
          <InventoryForm
            initial={modal}
            saving={saving}
            onCancel={() => setModal(null)}
            onSubmit={save}
          />
        )}
      </Modal>
    </div>
  );
}

function InventoryForm({ initial, saving, onCancel, onSubmit }) {
  const [form, setForm] = useState({
    sku: initial.sku || '',
    name: initial.name || '',
    quantity: initial.quantity ?? 0,
    min_quantity: initial.min_quantity ?? 0,
    unit: initial.unit || 'Stk',
    notes: initial.notes || '',
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) =>
        onSubmit(
          e,
          {
            sku: form.sku || null,
            name: form.name,
            quantity: Number(form.quantity),
            min_quantity: Number(form.min_quantity),
            unit: form.unit,
            notes: form.notes || null,
          },
          initial.id
        )
      }
    >
      <div>
        <label className="label">Bezeichnung *</label>
        <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">SKU / Artikelnr.</label>
          <input className="input" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
        </div>
        <div>
          <label className="label">Einheit</label>
          <input className="input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Bestand</label>
          <input type="number" className="input" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
        </div>
        <div>
          <label className="label">Mindestbestand</label>
          <input type="number" className="input" value={form.min_quantity} onChange={(e) => setForm((f) => ({ ...f, min_quantity: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">Notiz</label>
        <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
        <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>{saving ? 'Speichere…' : 'Speichern'}</button>
      </div>
    </form>
  );
}
