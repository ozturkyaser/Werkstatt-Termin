import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function VehicleForm({ initial, customerId, onSaved, onCancel }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customer_id: initial?.customer_id || customerId || '',
    license_plate: initial?.license_plate || '',
    brand: initial?.brand || '',
    model: initial?.model || '',
    year: initial?.year || '',
    vin: initial?.vin || '',
    mileage: initial?.mileage || '',
    fuel_type: initial?.fuel_type || '',
    color: initial?.color || '',
    notes: initial?.notes || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId) api.get('/customers').then(setCustomers);
  }, [customerId]);

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        customer_id: Number(form.customer_id),
        year: form.year ? Number(form.year) : null,
        mileage: form.mileage ? Number(form.mileage) : null,
      };
      const saved = initial
        ? await api.put(`/vehicles/${initial.id}`, payload)
        : await api.post('/vehicles', payload);
      onSaved?.(saved);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      {!customerId && (
        <div>
          <label className="label">Kunde *</label>
          <select className="input" required value={form.customer_id}
            onChange={(e) => upd('customer_id', e.target.value)}>
            <option value="">Kunde wählen…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Kennzeichen *</label>
          <input className="input uppercase" required value={form.license_plate}
            onChange={(e) => upd('license_plate', e.target.value.toUpperCase())} /></div>
        <div><label className="label">Baujahr</label>
          <input type="number" className="input" value={form.year}
            onChange={(e) => upd('year', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Marke</label>
          <input className="input" value={form.brand}
            onChange={(e) => upd('brand', e.target.value)} /></div>
        <div><label className="label">Modell</label>
          <input className="input" value={form.model}
            onChange={(e) => upd('model', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Kraftstoff</label>
          <select className="input" value={form.fuel_type}
            onChange={(e) => upd('fuel_type', e.target.value)}>
            <option value="">–</option>
            <option>Benzin</option><option>Diesel</option>
            <option>Hybrid</option><option>Elektro</option><option>LPG/CNG</option>
          </select></div>
        <div><label className="label">Farbe</label>
          <input className="input" value={form.color}
            onChange={(e) => upd('color', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Km-Stand</label>
          <input type="number" className="input" value={form.mileage}
            onChange={(e) => upd('mileage', e.target.value)} /></div>
        <div><label className="label">VIN</label>
          <input className="input" value={form.vin}
            onChange={(e) => upd('vin', e.target.value)} /></div>
      </div>
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
