import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import VehicleForm from '../components/VehicleForm';

export default function Vehicles() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get(`/vehicles${qs}`).then(setRows);
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fahrzeuge</h1>
          <p className="text-slate-500 text-sm">Alle Kundenfahrzeuge mit Historie.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Fahrzeug anlegen</button>
      </div>

      <input className="input max-w-md" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Suche nach Kennzeichen, Marke, VIN…" />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Kennzeichen</th>
              <th className="text-left px-4 py-3">Fahrzeug</th>
              <th className="text-left px-4 py-3">Halter</th>
              <th className="text-right px-4 py-3">Km-Stand</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold">
                  <Link to={`/fahrzeuge/${v.id}`} className="text-brand-700 hover:underline">
                    {v.license_plate}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {v.brand} {v.model} {v.year && <span className="text-slate-400">({v.year})</span>}
                </td>
                <td className="px-4 py-3">{v.first_name} {v.last_name}</td>
                <td className="px-4 py-3 text-right">
                  {v.mileage ? `${v.mileage.toLocaleString('de-DE')} km` : '–'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/fahrzeuge/${v.id}`} className="text-brand-600 hover:underline">Details</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                Keine Fahrzeuge gefunden.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Fahrzeug anlegen">
        <VehicleForm onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }} />
      </Modal>
    </div>
  );
}
