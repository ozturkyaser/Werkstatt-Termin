import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { api, formatCurrency, STATUS_LABELS } from '../lib/api';

export default function AppointmentPrint() {
  const { id } = useParams();
  const [a, setA] = useState(null);

  useEffect(() => {
    api.get(`/appointments/${id}`).then((data) => {
      setA(data);
      setTimeout(() => window.print(), 300);
    });
  }, [id]);

  if (!a) return <div className="p-8">Lädt…</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 print-container bg-white text-slate-900">
      <div className="flex justify-between items-start border-b pb-4 mb-6">
        <div>
          <div className="text-2xl font-bold">Fast Cars Autohaus</div>
          <div className="text-sm text-slate-600">Wittestr. 26A · 13509 Berlin-Wittenau</div>
          <div className="text-sm text-slate-600">Tel: 030 40244 15 · info@fastcars.de</div>
        </div>
        <div className="text-right">
          <div className="font-semibold">Auftragszettel</div>
          <div className="text-sm">Termin-Nr. {a.id}</div>
          <div className="text-sm text-slate-500">
            Erstellt am {format(parseISO(a.created_at), 'dd.MM.yyyy', { locale: de })}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-lg font-semibold">
          {format(parseISO(a.start_time), "EEEE, d. MMMM yyyy", { locale: de })}
        </div>
        <div className="text-slate-700">
          {format(parseISO(a.start_time), "HH:mm 'Uhr'", { locale: de })}
          {' – '}
          {format(parseISO(a.end_time), "HH:mm 'Uhr'", { locale: de })}
          <span className="ml-3 text-sm">Status: {STATUS_LABELS[a.status]}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs font-bold uppercase text-slate-500 mb-1">Kunde</div>
          <div className="font-medium">{a.first_name} {a.last_name}</div>
          {a.customer_phone && <div className="text-sm">Tel: {a.customer_phone}</div>}
          {a.customer_email && <div className="text-sm">E-Mail: {a.customer_email}</div>}
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-slate-500 mb-1">Fahrzeug</div>
          <div className="font-mono font-semibold text-lg">{a.license_plate}</div>
          <div>{a.brand} {a.model} {a.year ? `(${a.year})` : ''}</div>
          {a.vin && <div className="text-sm text-slate-600">VIN: {a.vin}</div>}
          {a.mileage_at_service && <div className="text-sm">Km-Stand: {a.mileage_at_service.toLocaleString('de-DE')} km</div>}
        </div>
      </div>

      {a.employee_name && (
        <div className="mb-4">
          <span className="text-xs font-bold uppercase text-slate-500">Bearbeiter:</span>{' '}
          <span>{a.employee_name}</span>
        </div>
      )}

      <table className="w-full text-sm border-t border-b mb-4">
        <thead>
          <tr className="text-xs uppercase text-slate-500">
            <th className="text-left py-2">Leistung</th>
            <th className="text-right py-2 w-20">Anzahl</th>
            <th className="text-right py-2 w-24">Dauer</th>
            <th className="text-right py-2 w-28">Preis</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {a.services.map((s) => (
            <tr key={s.id}>
              <td className="py-2">{s.name}</td>
              <td className="py-2 text-right">{s.quantity}</td>
              <td className="py-2 text-right">{s.duration_minutes} Min</td>
              <td className="py-2 text-right">{formatCurrency(s.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan="3" className="py-3 text-right">Gesamt</td>
            <td className="py-3 text-right">{formatCurrency(a.total_price)}</td>
          </tr>
        </tfoot>
      </table>

      {a.notes && (
        <div className="mb-4">
          <div className="text-xs font-bold uppercase text-slate-500 mb-1">Notizen</div>
          <p className="text-sm whitespace-pre-wrap">{a.notes}</p>
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-8">
        <div>
          <div className="border-t pt-2 text-xs text-slate-500">Unterschrift Kunde</div>
        </div>
        <div>
          <div className="border-t pt-2 text-xs text-slate-500">Unterschrift Werkstatt</div>
        </div>
      </div>

      <button onClick={() => window.print()} className="btn-primary mt-6 no-print">
        Jetzt drucken
      </button>
    </div>
  );
}
