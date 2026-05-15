import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { api, formatCurrency, STATUS_LABELS } from '../lib/api';
import Modal from '../components/Modal';
import VehicleForm from '../components/VehicleForm';

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.get(`/vehicles/${id}`).then(setV);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function remove() {
    if (!confirm('Fahrzeug wirklich löschen?')) return;
    try {
      await api.del(`/vehicles/${id}`);
      navigate('/fahrzeuge');
    } catch (err) { alert(err.message); }
  }

  if (!v) return <div>Lädt…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/fahrzeuge" className="text-sm text-slate-500 hover:underline">← Alle Fahrzeuge</Link>
          <h1 className="text-2xl font-bold">
            <span className="font-mono">{v.license_plate}</span>
            <span className="ml-3 font-normal text-slate-600">{v.brand} {v.model}</span>
          </h1>
          <div className="text-slate-500 text-sm">
            Halter:{' '}
            <Link to={`/kunden/${v.customer_id}`} className="text-brand-700 hover:underline">
              {v.first_name} {v.last_name}
            </Link>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
          <button className="btn-danger" onClick={remove}>Löschen</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Info label="Baujahr" value={v.year} />
        <Info label="Kraftstoff" value={v.fuel_type} />
        <Info label="Farbe" value={v.color} />
        <Info label="Km-Stand" value={v.mileage ? v.mileage.toLocaleString('de-DE') + ' km' : '–'} />
        <Info label="VIN" value={v.vin} className="col-span-2" />
      </div>
      {v.notes && <div className="card p-4 text-sm whitespace-pre-wrap">{v.notes}</div>}

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Service-Historie ({v.history.length})</h2>
        {v.history.length === 0 ? (
          <div className="text-sm text-slate-500">Noch keine Servicehistorie vorhanden.</div>
        ) : (
          <div className="divide-y">
            {v.history.map((h) => (
              <Link key={h.id} to={`/termine/${h.id}`}
                className="flex items-start justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded">
                <div>
                  <div className="font-medium">
                    {format(parseISO(h.start_time), 'dd.MM.yyyy', { locale: de })}
                    {h.mileage_at_service && (
                      <span className="ml-2 text-slate-400 text-sm">
                        ({h.mileage_at_service.toLocaleString('de-DE')} km)
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600">{h.services || '–'}</div>
                  {h.notes && <div className="text-xs text-slate-500 mt-0.5">{h.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{formatCurrency(h.total_price)}</span>
                  <span className={`badge-${h.status}`}>{STATUS_LABELS[h.status]}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Fahrzeug bearbeiten">
        <VehicleForm initial={v} customerId={v.customer_id}
          onSaved={() => { setEditing(false); load(); }}
          onCancel={() => setEditing(false)} />
      </Modal>
    </div>
  );
}

function Info({ label, value, className = '' }) {
  return (
    <div className={`card p-3 ${className}`}>
      <div className="text-xs font-semibold text-slate-500 uppercase">{label}</div>
      <div className="font-medium">{value || '–'}</div>
    </div>
  );
}
