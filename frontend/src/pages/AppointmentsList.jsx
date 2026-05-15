import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { api, formatCurrency, STATUS_LABELS } from '../lib/api';
import Modal from '../components/Modal';
import AppointmentForm from '../components/AppointmentForm';

export default function AppointmentsList() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ status: '', search: '', from: '', to: '' });
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.from) params.set('from', new Date(filters.from).toISOString());
    if (filters.to) params.set('to', new Date(filters.to).toISOString());
    api.get(`/appointments?${params}`)
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filters.status, filters.from, filters.to]);

  const filtered = useMemo(() => {
    if (!filters.search) return rows;
    const q = filters.search.toLowerCase();
    return rows.filter((r) =>
      `${r.first_name} ${r.last_name} ${r.license_plate} ${r.brand} ${r.model} ${r.title || ''}`
        .toLowerCase().includes(q)
    );
  }, [rows, filters.search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alle Termine</h1>
          <p className="text-slate-500 text-sm">Übersicht aller Werkstatttermine mit Filtern.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Neuer Termin</button>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Suche</label>
          <input className="input" value={filters.search}
            placeholder="Name, Kennzeichen, Marke…"
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Alle</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Von</label>
          <input type="date" className="input" value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </div>
        <div>
          <label className="label">Bis</label>
          <input type="date" className="input" value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Datum</th>
              <th className="text-left px-4 py-3">Kunde</th>
              <th className="text-left px-4 py-3">Fahrzeug</th>
              <th className="text-left px-4 py-3">Mitarbeiter</th>
              <th className="text-right px-4 py-3">Preis</th>
              <th className="text-left px-4 py-3">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div>{format(parseISO(a.start_time), 'dd.MM.yyyy', { locale: de })}</div>
                  <div className="text-xs text-slate-500">
                    {format(parseISO(a.start_time), 'HH:mm', { locale: de })} Uhr
                  </div>
                </td>
                <td className="px-4 py-3">{a.first_name} {a.last_name}</td>
                <td className="px-4 py-3">
                  <span className="font-mono font-medium">{a.license_plate}</span>
                  <span className="text-slate-500 ml-2">{a.brand} {a.model}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{a.employee_name || '–'}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(a.total_price)}</td>
                <td className="px-4 py-3"><span className={`badge-${a.status}`}>{STATUS_LABELS[a.status]}</span></td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/termine/${a.id}`} className="text-brand-600 hover:underline">Details</Link>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                Keine Termine gefunden.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} wide title="Neuen Termin anlegen">
        <AppointmentForm onCancel={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); }} />
      </Modal>
    </div>
  );
}
