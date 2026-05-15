import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { STATUS_LABELS, apiAbsoluteUrl } from '../lib/api';

export default function PublicAppointmentStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(apiAbsoluteUrl(`/api/public/appointment-status/${encodeURIComponent(token || '')}`))
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setErr(j.error || 'Fehler'); return; }
        setData(j);
      })
      .catch(() => setErr('Netzwerkfehler'));
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="font-bold text-lg text-red-800">{err}</h1>
          <p className="text-sm text-slate-600 mt-2">Bitte prüfen Sie den Link aus der E-Mail oder dem Schreiben der Werkstatt.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">
        Lädt…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🚗</div>
          <h1 className="text-xl font-bold">Ihr Werkstatt-Termin</h1>
          <p className="text-slate-400 text-sm mt-1">Auftragsnummer #{data.id}</p>
        </div>

        <div className="bg-white text-slate-900 rounded-2xl shadow-xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <span className="text-slate-500 text-sm">Status</span>
            <span className="font-semibold px-3 py-1 rounded-full bg-brand-100 text-brand-900">
              {STATUS_LABELS[data.status] || data.status}
            </span>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-500">Termin</div>
            <div className="font-medium">
              {format(parseISO(data.start_time), "EEEE, d. MMMM yyyy · HH:mm 'Uhr'", { locale: de })}
            </div>
            <div className="text-sm text-slate-600">
              bis {format(parseISO(data.end_time), 'HH:mm', { locale: de })} Uhr
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-500">Fahrzeug</div>
            <div className="font-mono font-semibold text-lg">{data.vehicle?.license_plate}</div>
            <div className="text-sm">{data.vehicle?.brand} {data.vehicle?.model}</div>
          </div>
          {data.title && (
            <div>
              <div className="text-xs uppercase text-slate-500">Leistung</div>
              <div className="text-sm">{data.title}</div>
            </div>
          )}
          <div className="text-xs text-slate-500 pt-2 border-t">
            Hinweis: Diese Seite zeigt nur den aktuellen Status. Persönliche Daten werden nicht veröffentlicht.
          </div>
        </div>
      </div>
    </div>
  );
}
