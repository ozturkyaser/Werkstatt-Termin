import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { api, formatCurrency, STATUS_LABELS } from '../lib/api';
import Modal from '../components/Modal';
import { CustomerForm } from './Customers';
import VehicleForm from '../components/VehicleForm';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [editing, setEditing] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const load = useCallback(() => {
    api.get(`/customers/${id}`).then(setC);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function remove() {
    if (!confirm('Kunde wirklich löschen?')) return;
    try {
      await api.del(`/customers/${id}`);
      navigate('/kunden');
    } catch (err) {
      alert(err.message);
    }
  }

  if (!c) return <div>Lädt…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/kunden" className="text-sm text-slate-500 hover:underline">← Alle Kunden</Link>
          <h1 className="text-2xl font-bold">{c.first_name} {c.last_name}</h1>
          <div className="text-slate-500 text-sm space-x-3">
            {c.phone && <span>📞 {c.phone}</span>}
            {c.email && <span>✉ {c.email}</span>}
            {c.whatsapp && <span>💬 {c.whatsapp}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
          <button className="btn-danger" onClick={remove}>Löschen</button>
        </div>
      </div>

      {c.address && <div className="card p-4 text-sm">{c.address}</div>}
      {c.notes && <div className="card p-4 text-sm whitespace-pre-wrap">{c.notes}</div>}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Fahrzeuge ({c.vehicles.length})</h2>
          <button className="btn-secondary text-sm" onClick={() => setAddingVehicle(true)}>
            + Fahrzeug hinzufügen
          </button>
        </div>
        {c.vehicles.length === 0 ? (
          <div className="text-sm text-slate-500">Noch keine Fahrzeuge hinterlegt.</div>
        ) : (
          <div className="divide-y">
            {c.vehicles.map((v) => (
              <Link key={v.id} to={`/fahrzeuge/${v.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded">
                <div>
                  <span className="font-mono font-semibold">{v.license_plate}</span>
                  <span className="text-slate-600 ml-3">{v.brand} {v.model}</span>
                  {v.year && <span className="text-slate-400 ml-2">({v.year})</span>}
                </div>
                <div className="text-sm text-slate-500">
                  {v.mileage ? `${v.mileage.toLocaleString('de-DE')} km` : ''}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Termine ({c.appointments.length})</h2>
        {c.appointments.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Termine.</div>
        ) : (
          <div className="divide-y">
            {c.appointments.map((a) => (
              <Link key={a.id} to={`/termine/${a.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded">
                <div>
                  <div className="font-medium">
                    {format(parseISO(a.start_time), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </div>
                  <div className="text-sm text-slate-500">
                    {a.license_plate} · {a.brand} {a.model}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">{formatCurrency(a.total_price)}</span>
                  <span className={`badge-${a.status}`}>{STATUS_LABELS[a.status]}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Kunde bearbeiten">
        <CustomerForm initial={c}
          onSaved={() => { setEditing(false); load(); }}
          onCancel={() => setEditing(false)} />
      </Modal>

      <Modal open={addingVehicle} onClose={() => setAddingVehicle(false)} title="Fahrzeug hinzufügen">
        <VehicleForm customerId={c.id}
          onSaved={() => { setAddingVehicle(false); load(); }}
          onCancel={() => setAddingVehicle(false)} />
      </Modal>
    </div>
  );
}
