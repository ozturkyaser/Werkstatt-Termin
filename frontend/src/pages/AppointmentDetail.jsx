import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { api, apiAbsoluteUrl, formatCurrency, STATUS_LABELS } from '../lib/api';
import Modal from '../components/Modal';
import AppointmentForm from '../components/AppointmentForm';
import WorkLogPanel from '../components/WorkLogPanel';
import HandoverPanel from '../components/HandoverPanel';
import AppointmentMaterialLabor from '../components/AppointmentMaterialLabor';
import AppointmentPhotos from '../components/AppointmentPhotos';

export default function AppointmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [a, setA] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.get(`/appointments/${id}`).then(setA);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function updateStatus(status) {
    await api.patch(`/appointments/${id}/status`, { status });
    load();
  }
  async function remove() {
    if (!confirm('Termin wirklich löschen?')) return;
    await api.del(`/appointments/${id}`);
    navigate('/termine');
  }

  if (!a) return <div>Lädt…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/termine" className="text-sm text-slate-500 hover:underline">
            ← Zurück zur Liste
          </Link>
          <h1 className="text-2xl font-bold">
            Termin #{a.id} · {a.first_name} {a.last_name}
          </h1>
          <p className="text-slate-500">
            {format(parseISO(a.start_time), "EEEE, d. MMMM yyyy · HH:mm 'Uhr'", { locale: de })}
            {' – '}
            {format(parseISO(a.end_time), 'HH:mm', { locale: de })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`badge-${a.status} text-base px-3 py-1`}>{STATUS_LABELS[a.status]}</span>
          <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
          <a href={`/termin/${a.id}/drucken`} target="_blank" rel="noreferrer"
             className="btn-secondary">🖨️ Drucken</a>
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                const doc = await api.post(`/documents/from-appointment/${a.id}`, { type: 'rechnung' });
                const token = localStorage.getItem('werkstatt_token');
                const w = window.open('', '_blank');
                const html = await (await fetch(apiAbsoluteUrl(`/api/documents/${doc.id}/print`), { headers: { Authorization: `Bearer ${token}` } })).text();
                w.document.open(); w.document.write(html); w.document.close();
              } catch (e) { alert('Fehler: ' + e.message); }
            }}
          >📄 Rechnung</button>
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                const doc = await api.post(`/documents/from-appointment/${a.id}`, { type: 'angebot' });
                const token = localStorage.getItem('werkstatt_token');
                const w = window.open('', '_blank');
                const html = await (await fetch(apiAbsoluteUrl(`/api/documents/${doc.id}/print`), { headers: { Authorization: `Bearer ${token}` } })).text();
                w.document.open(); w.document.write(html); w.document.close();
              } catch (e) { alert('Fehler: ' + e.message); }
            }}
          >📝 Angebot</button>
          <button className="btn-danger" onClick={remove}>Löschen</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['geplant','bestaetigt','in_arbeit','abgeschlossen','storniert'].map((s) => (
          <button key={s}
            disabled={s === a.status}
            onClick={() => updateStatus(s)}
            className={`btn-ghost text-sm ${s === a.status ? 'ring-2 ring-brand-400' : ''}`}>
            → {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Kunde</h2>
          <div className="space-y-1 text-sm">
            <div className="font-medium">
              <Link to={`/kunden/${a.customer_id}`} className="hover:underline text-brand-700">
                {a.first_name} {a.last_name}
              </Link>
            </div>
            {a.customer_phone && <div>📞 {a.customer_phone}</div>}
            {a.customer_email && <div>✉ {a.customer_email}</div>}
            {a.customer_whatsapp && <div>💬 WhatsApp: {a.customer_whatsapp}</div>}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Fahrzeug</h2>
          <div className="space-y-1 text-sm">
            <div>
              <Link to={`/fahrzeuge/${a.vehicle_id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                {a.license_plate}
              </Link>
            </div>
            <div>{a.brand} {a.model} {a.year ? `(${a.year})` : ''}</div>
            {a.vin && <div className="text-slate-500">VIN: {a.vin}</div>}
            {a.mileage_at_service && <div>Km-Stand beim Service: {a.mileage_at_service.toLocaleString('de-DE')} km</div>}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Leistungen</h2>
        {a.services.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Leistungen hinterlegt.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-2">Leistung</th>
                <th className="text-right py-2">Anzahl</th>
                <th className="text-right py-2">Dauer</th>
                <th className="text-right py-2">Preis</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {a.services.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.name}</td>
                  <td className="text-right">{s.quantity}</td>
                  <td className="text-right">{s.duration_minutes} Min</td>
                  <td className="text-right">{formatCurrency(s.price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr>
                <td colSpan="3" className="pt-3 text-right">Summe</td>
                <td className="pt-3 text-right">{formatCurrency(a.total_price)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {a.notes && (
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Notizen</h2>
          <p className="text-sm whitespace-pre-wrap">{a.notes}</p>
        </div>
      )}

      <AppointmentMaterialLabor appointment={a} onChange={load} />

      <AppointmentPhotos appointmentId={Number(id)} onChange={load} />

      <WorkLogPanel appointment={a} onChange={load} />

      <HandoverPanel appointment={a} onChange={load} />

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Erinnerungen</h2>
        {a.reminders.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Erinnerungen geplant.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-2">Kanal</th>
                <th className="text-left py-2">Empfänger</th>
                <th className="text-left py-2">Geplant</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {a.reminders.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 capitalize">{r.channel}</td>
                  <td className="py-2">{r.recipient || '–'}</td>
                  <td className="py-2">
                    {format(parseISO(r.scheduled_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  <td className="py-2 capitalize">{r.status}
                    {r.last_error && <div className="text-xs text-red-600">{r.last_error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} wide title={`Termin #${a.id} bearbeiten`}>
        <AppointmentForm initial={a}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
          onDelete={() => { setEditing(false); remove(); }} />
      </Modal>
    </div>
  );
}
