import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { api, formatCurrency, STATUS_LABELS } from '../lib/api';
import CustomerVehiclePicker from './CustomerVehiclePicker';

const CHANNELS = [
  { id: 'email', label: 'E-Mail' },
  { id: 'sms', label: 'SMS' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'internal', label: 'Intern' },
];

function toLocalInput(isoOrLocal) {
  if (!isoOrLocal) return '';
  const d = typeof isoOrLocal === 'string' ? parseISO(isoOrLocal) : isoOrLocal;
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export default function AppointmentForm({ initial, defaultStart, prefillLicensePlate = '', onSaved, onCancel, onDelete }) {
  const editing = Boolean(initial?.id);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [bays, setBays] = useState([]);
  const [showSlots, setShowSlots] = useState(false);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [form, setForm] = useState(() => ({
    customer_id: initial?.customer_id || '',
    vehicle_id: initial?.vehicle_id || '',
    employee_id: initial?.employee_id || '',
    bay_id: initial?.bay_id || '',
    start_time: toLocalInput(initial?.start_time || defaultStart || new Date()),
    end_time: toLocalInput(initial?.end_time || ''),
    status: initial?.status || 'geplant',
    title: initial?.title || '',
    notes: initial?.notes || '',
    mileage_at_service: initial?.mileage_at_service || '',
    services: initial?.services?.map((s) => ({
      service_id: s.service_id, quantity: s.quantity || 1,
    })) || [],
    reminder_channels: initial?.reminders
      ? [...new Set(initial.reminders.filter((r) => r.status === 'geplant').map((r) => r.channel))]
      : ['email'],
  }));

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/services').then(setServices);
    api.get('/employees').then((e) => setEmployees(e.filter((u) => u.active)));
    api.get('/bays').then((b) => setBays(b.filter((x) => x.active)));
  }, []);

  async function loadSlots() {
    const date = (form.start_time || toLocalInput(new Date())).slice(0, 10);
    setSlotsLoading(true);
    try {
      const serviceIds = form.services.map((s) => s.service_id).join(',');
      const params = new URLSearchParams({ date });
      if (serviceIds) params.set('service_ids', serviceIds);
      if (editing) params.set('appointment_id', initial.id);
      const r = await api.get(`/availability?${params}`);
      setSlots(r.slots || []);
      setShowSlots(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSlotsLoading(false);
    }
  }

  function applySlot(slot) {
    setForm((f) => ({
      ...f,
      start_time: toLocalInput(slot.start_time),
      end_time: toLocalInput(slot.end_time),
      bay_id: slot.suggested_bay?.id || f.bay_id,
      employee_id: slot.suggested_employee?.id || f.employee_id,
    }));
    setShowSlots(false);
  }

  const totals = useMemo(() => {
    let price = 0, duration = 0;
    for (const row of form.services) {
      const svc = services.find((s) => s.id === Number(row.service_id));
      if (!svc) continue;
      price += svc.price * (row.quantity || 1);
      duration += svc.duration_minutes * (row.quantity || 1);
    }
    return { price, duration };
  }, [form.services, services]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleChannel(id) {
    setForm((f) => ({
      ...f,
      reminder_channels: f.reminder_channels.includes(id)
        ? f.reminder_channels.filter((x) => x !== id)
        : [...f.reminder_channels, id],
    }));
  }

  function addService(id) {
    if (!id) return;
    setForm((f) => ({
      ...f,
      services: f.services.some((s) => s.service_id === Number(id))
        ? f.services
        : [...f.services, { service_id: Number(id), quantity: 1 }],
    }));
  }

  function removeService(id) {
    setForm((f) => ({
      ...f,
      services: f.services.filter((s) => s.service_id !== id),
    }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.customer_id || !form.vehicle_id) {
      setError('Bitte zuerst einen Kunden und ein Fahrzeug auswählen oder anlegen.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        vehicle_id: Number(form.vehicle_id),
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        bay_id: form.bay_id ? Number(form.bay_id) : null,
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        status: form.status,
        title: form.title,
        notes: form.notes,
        mileage_at_service: form.mileage_at_service ? Number(form.mileage_at_service) : null,
        services: form.services,
        reminder_channels: form.reminder_channels,
      };
      const saved = editing
        ? await api.put(`/appointments/${initial.id}`, payload)
        : await api.post('/appointments', payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label className="label">Kunde & Fahrzeug *</label>
        <CustomerVehiclePicker
          customerId={form.customer_id}
          vehicleId={form.vehicle_id}
          prefillLicensePlate={!editing ? prefillLicensePlate : ''}
          onChange={({ customerId, vehicleId }) => {
            setForm((f) => ({ ...f, customer_id: customerId || '', vehicle_id: vehicleId || '' }));
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center justify-between">
            <label className="label !mb-0">Start *</label>
            <button type="button" onClick={loadSlots} disabled={slotsLoading}
              className="text-xs text-brand-600 hover:underline">
              {slotsLoading ? 'Lade…' : '📅 Freie Slots zeigen'}
            </button>
          </div>
          <input type="datetime-local" className="input mt-1" required
            value={form.start_time}
            onChange={(e) => update('start_time', e.target.value)} />
        </div>
        <div>
          <label className="label">Ende (optional)</label>
          <input type="datetime-local" className="input"
            value={form.end_time}
            onChange={(e) => update('end_time', e.target.value)} />
          <div className="text-xs text-slate-500 mt-1">
            {totals.duration
              ? `Auto-Dauer: ${totals.duration} Min`
              : 'Bei leerem Feld: Dauer aus Leistungen (Standard 60 Min)'}
          </div>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status}
            onChange={(e) => update('status', e.target.value)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {showSlots && (
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">
              Freie Slots am {(form.start_time || '').slice(0,10)}
              <span className="text-slate-500 ml-2">({slots.length} verfügbar)</span>
            </div>
            <button type="button" onClick={() => setShowSlots(false)} className="text-slate-400 hover:text-slate-700">×</button>
          </div>
          {slots.length === 0 ? (
            <div className="text-sm text-slate-500">
              Keine freien Slots. Wähle ein anderes Datum oder passe Bühnen/Mitarbeiter-Verfügbarkeit an.
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {slots.map((s) => (
                <button key={s.start_time} type="button" onClick={() => applySlot(s)}
                  className="px-2 py-1.5 text-sm rounded border bg-white hover:bg-brand-50 hover:border-brand-500 text-left"
                  title={`${s.suggested_bay?.name} · ${s.suggested_employee?.name}`}>
                  <div className="font-medium">{s.start_time.slice(11,16)}</div>
                  <div className="text-[10px] text-slate-500 truncate">{s.suggested_bay?.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Mitarbeiter</label>
          <select className="input" value={form.employee_id}
            onChange={(e) => update('employee_id', e.target.value)}>
            <option value="">— beliebig —</option>
            {employees.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Bühne</label>
          <select className="input" value={form.bay_id}
            onChange={(e) => update('bay_id', e.target.value)}>
            <option value="">— beliebig —</option>
            {bays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Titel</label>
          <input className="input" value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="z.B. Inspektion + Ölwechsel" />
        </div>
      </div>

      <div>
        <label className="label">Leistungen</label>
        <div className="flex gap-2 mb-2">
          <select className="input flex-1"
            onChange={(e) => { addService(e.target.value); e.target.value = ''; }}
            defaultValue="">
            <option value="">+ Leistung hinzufügen…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.category ? `[${s.category}] ` : ''}{s.name} · {formatCurrency(s.price)} · {s.duration_minutes} Min
              </option>
            ))}
          </select>
        </div>
        {form.services.length === 0 ? (
          <div className="text-sm text-slate-500 italic">Keine Leistungen ausgewählt</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Leistung</th>
                  <th className="px-3 py-2 w-20">Anzahl</th>
                  <th className="text-right px-3 py-2 w-24">Dauer</th>
                  <th className="text-right px-3 py-2 w-28">Preis</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.services.map((row) => {
                  const svc = services.find((s) => s.id === row.service_id);
                  if (!svc) return null;
                  return (
                    <tr key={row.service_id}>
                      <td className="px-3 py-2">{svc.name}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" className="input py-1"
                          value={row.quantity}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            services: f.services.map((s) =>
                              s.service_id === row.service_id
                                ? { ...s, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : s
                            ),
                          }))} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {svc.duration_minutes * row.quantity} Min
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(svc.price * row.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeService(row.service_id)}
                          className="text-red-500 hover:text-red-700">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan="2">Gesamt</td>
                  <td className="px-3 py-2 text-right">{totals.duration} Min</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totals.price)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Km-Stand bei Service</label>
          <input type="number" className="input" value={form.mileage_at_service}
            onChange={(e) => update('mileage_at_service', e.target.value)} />
        </div>
        <div>
          <label className="label">Erinnerungen senden via</label>
          <div className="flex flex-wrap gap-2 pt-1">
            {CHANNELS.map((c) => (
              <label key={c.id}
                className={`cursor-pointer border rounded-lg px-3 py-1.5 text-sm ${
                  form.reminder_channels.includes(c.id)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}>
                <input type="checkbox" className="hidden"
                  checked={form.reminder_channels.includes(c.id)}
                  onChange={() => toggleChannel(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="label">Notizen</label>
        <textarea className="input min-h-[80px]" value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Interne Bemerkungen, besondere Hinweise zum Fahrzeug…" />
      </div>

      <div className="flex items-center gap-2 pt-4 border-t">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Speichern…' : editing ? 'Änderungen speichern' : 'Termin anlegen'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
        {editing && onDelete && (
          <button type="button" className="btn-danger ml-auto" onClick={onDelete}>
            Termin löschen
          </button>
        )}
      </div>
    </form>
  );
}
