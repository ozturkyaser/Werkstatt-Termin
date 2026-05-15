import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Modal from '../components/Modal';

const LAGERTYPEN = [
  { id: 'winter', label: 'Winter-Komplettradsatz (eingelagert)' },
  { id: 'sommer', label: 'Sommer-Komplettradsatz (eingelagert)' },
];

export default function TireStorage() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('active');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const q = filter === 'all' ? '' : `?active=${filter === 'active' ? '1' : '0'}`;
    return api.get(`/tire-storage${q}`).then(setRows);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveForm(ev, form) {
    ev.preventDefault();
    setSaving(true);
    try {
      const body = {
        customer_id: Number(form.customer_id),
        vehicle_id: Number(form.vehicle_id),
        lagertyp: form.lagertyp,
        lagerort: form.lagerort || null,
        quantity: Number(form.quantity) || 4,
        einlagerdatum: form.einlagerdatum,
        bemerkung: form.bemerkung || null,
        active: form.active !== false,
      };
      if (modal?.id) {
        await api.put(`/tire-storage/${modal.id}`, { ...body, active: form.active });
      } else {
        await api.post('/tire-storage', body);
      }
      setModal(null);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await api.del(`/tire-storage/${id}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reifen-Einlagerung</h1>
          <p className="text-slate-500 text-sm max-w-2xl">
            Erfassen Sie, welches Radset pro Fahrzeug bei Ihnen liegt. Für aktive Einträge mit E-Mail-Adresse
            verschickt das System in den konfigurierten Monaten automatisch Saison-Hinweise (siehe Einstellungen → Reifen).
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModal({})}>+ Einlagerung erfassen</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-slate-600">Anzeige:</span>
        {[
          { id: 'active', label: 'Nur aktiv' },
          { id: 'inactive', label: 'Nur ausgebucht' },
          { id: 'all', label: 'Alle' },
        ].map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setFilter(o.id)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${
              filter === o.id ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Kunde</th>
              <th className="text-left px-4 py-3">Fahrzeug</th>
              <th className="text-left px-4 py-3">Lagertyp</th>
              <th className="text-left px-4 py-3">Lagerort</th>
              <th className="text-right px-4 py-3">Menge</th>
              <th className="text-left px-4 py-3">Einlagerung</th>
              <th className="text-center px-4 py-3">Winter-Mail</th>
              <th className="text-center px-4 py-3">Sommer-Mail</th>
              <th className="text-center px-4 py-3">Aktiv</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/kunden/${t.customer_id}`} className="text-brand-700 hover:underline">
                    {t.first_name} {t.last_name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/fahrzeuge/${t.vehicle_id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {t.license_plate}
                  </Link>
                  <div className="text-xs text-slate-500">{t.brand} {t.model}</div>
                </td>
                <td className="px-4 py-3 capitalize">{t.lagertyp}</td>
                <td className="px-4 py-3">{t.lagerort || '–'}</td>
                <td className="px-4 py-3 text-right">{t.quantity}</td>
                <td className="px-4 py-3">{t.einlagerdatum || '–'}</td>
                <td className="px-4 py-3 text-center text-xs">{t.last_winter_reminder_year ?? '–'}</td>
                <td className="px-4 py-3 text-center text-xs">{t.last_summer_reminder_year ?? '–'}</td>
                <td className="px-4 py-3 text-center">{t.active ? '✓' : '–'}</td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <button type="button" className="text-brand-600 hover:underline" onClick={() => setModal({ ...t })}>Bearbeiten</button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => remove(t.id)}>Löschen</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan="10" className="px-4 py-8 text-center text-slate-500">Keine Einträge.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.id ? `Einlagerung #${modal.id}` : 'Neue Reifen-Einlagerung'}
        wide
      >
        {modal && (
          <TireStorageForm
            initial={modal}
            saving={saving}
            onCancel={() => setModal(null)}
            onSubmit={saveForm}
          />
        )}
      </Modal>
    </div>
  );
}

function TireStorageForm({ initial, saving, onCancel, onSubmit }) {
  const isEdit = Boolean(initial.id);
  const [customerQ, setCustomerQ] = useState('');
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(() => ({
    customer_id: initial.customer_id || '',
    vehicle_id: initial.vehicle_id || '',
    lagertyp: initial.lagertyp || 'winter',
    lagerort: initial.lagerort || '',
    quantity: initial.quantity ?? 4,
    einlagerdatum: initial.einlagerdatum || new Date().toISOString().slice(0, 10),
    bemerkung: initial.bemerkung || '',
    active: initial.active !== 0 && initial.active !== false,
  }));

  useEffect(() => {
    const t = setTimeout(() => {
      if (!customerQ.trim()) {
        setCustomers([]);
        return;
      }
      api.get(`/customers?search=${encodeURIComponent(customerQ)}`).then(setCustomers);
    }, 250);
    return () => clearTimeout(t);
  }, [customerQ]);

  useEffect(() => {
    if (!form.customer_id) {
      setVehicles([]);
      return;
    }
    api.get(`/vehicles?customer_id=${form.customer_id}`).then(setVehicles);
  }, [form.customer_id]);

  function pickCustomer(c) {
    setForm((f) => ({ ...f, customer_id: c.id, vehicle_id: '' }));
    setCustomerQ(`${c.first_name} ${c.last_name}`);
    setCustomers([]);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => onSubmit(e, { ...form, active: form.active })}
    >
      {!isEdit && (
        <div>
          <label className="label">Kunde suchen</label>
          <input
            className="input"
            value={customerQ}
            onChange={(e) => setCustomerQ(e.target.value)}
            placeholder="Name, E-Mail oder Telefon…"
          />
          {customers.length > 0 && (
            <ul className="mt-1 border rounded-lg bg-white max-h-40 overflow-auto text-sm shadow">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50"
                    onClick={() => pickCustomer(c)}
                  >
                    {c.first_name} {c.last_name}
                    {c.email && <span className="text-slate-500"> · {c.email}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isEdit && (
        <p className="text-sm text-slate-600">
          Kunde und Fahrzeug sind fest mit dem Datensatz verknüpft. Bei falschem Fahrzeug bitte Eintrag löschen und neu anlegen.
        </p>
      )}

      <div>
        <label className="label">Fahrzeug</label>
        <select
          className="input"
          required
          disabled={isEdit}
          value={form.vehicle_id}
          onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
        >
          <option value="">— Fahrzeug wählen —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.license_plate} · {v.brand} {v.model}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Was lagern Sie?</label>
        <select
          className="input"
          value={form.lagertyp}
          onChange={(e) => setForm((f) => ({ ...f, lagertyp: e.target.value }))}
        >
          {LAGERTYPEN.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">
          „Winter“ = Kunde hat Winterräder bei Ihnen → im Herbst E-Mail zum Radwechsel. „Sommer“ = Sommerräder eingelagert → im Frühjahr Hinweis.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Lagerort / Regal</label>
          <input className="input" value={form.lagerort} onChange={(e) => setForm((f) => ({ ...f, lagerort: e.target.value }))} placeholder="z. B. Halle B / Rack 12" />
        </div>
        <div>
          <label className="label">Anzahl Räder</label>
          <input type="number" min="1" max="8" className="input" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
        </div>
      </div>

      <div>
        <label className="label">Einlagerdatum</label>
        <input type="date" className="input" value={form.einlagerdatum} onChange={(e) => setForm((f) => ({ ...f, einlagerdatum: e.target.value }))} />
      </div>

      <div>
        <label className="label">Bemerkung</label>
        <textarea className="input min-h-[80px]" value={form.bemerkung} onChange={(e) => setForm((f) => ({ ...f, bemerkung: e.target.value }))} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        Aktiv (Radsatz befindet sich bei uns)
      </label>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
        <button type="submit" className="btn-primary" disabled={saving || !form.vehicle_id}>
          {saving ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}
