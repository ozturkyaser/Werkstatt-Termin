import { useEffect, useState } from 'react';
import { api, apiAbsoluteUrl, getToken } from '../lib/api';
import HandoverDialog from './HandoverDialog';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

export default function HandoverPanel({ appointment, onChange }) {
  const [h, setH] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get(`/handovers/by-appointment/${appointment.id}`);
      setH(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (appointment?.id) load(); }, [appointment?.id]);

  if (loading) return <div className="card p-5 text-sm text-slate-500">Lädt Übergabeprotokoll…</div>;

  const final = h?.handover_at && h?.customer_signature;

  function openPrint() {
    const token = getToken();
    const w = window.open('', '_blank');
    fetch(apiAbsoluteUrl(`/api/handovers/print/${appointment.id}`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.text())
      .then((html) => { w.document.open(); w.document.write(html); w.document.close(); });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">🤝 Fahrzeug-Übergabe</h2>
        <div className="flex gap-2">
          {!final && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              {h ? 'Übergabe fortsetzen' : '✍ Übergabeprotokoll starten'}
            </button>
          )}
          {final && (
            <>
              <button className="btn-secondary" onClick={() => setOpen(true)}>Bearbeiten</button>
              <button className="btn-secondary" onClick={openPrint}>🖨️ Protokoll drucken</button>
            </>
          )}
        </div>
      </div>

      {!h && (
        <div className="text-sm text-slate-500">
          Noch keine Übergabe erfolgt. Wenn der Kunde sein Fahrzeug abholt, lässt sich hier das digitale Übergabeprotokoll erstellen – mit Bestätigung für Schlüssel, Papiere und durchgeführte Arbeiten.
        </div>
      )}

      {h && (
        <>
          <StatusBanner status={h.status} handoverAt={h.handover_at} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
            <Info label="🔑 Schlüssel">{h.keys_count ?? '–'}</Info>
            <Info label="🛣 KM-Stand">{h.end_mileage ? Number(h.end_mileage).toLocaleString('de-DE') + ' km' : '–'}</Info>
            <Info label="📄 Papiere">{h.documents_returned || '–'}</Info>
            <Info label="🎒 Zubehör">{h.accessories_returned || '–'}</Info>
          </div>

          {h.customer_satisfaction && (
            <div className="mt-3 text-sm">
              Zufriedenheit:
              <span className="text-amber-500 text-lg ml-2">
                {'★'.repeat(h.customer_satisfaction)}{'☆'.repeat(5 - h.customer_satisfaction)}
              </span>
            </div>
          )}

          {h.customer_feedback && (
            <div className="mt-3 text-sm bg-slate-50 border rounded p-3 whitespace-pre-wrap">
              <div className="text-xs font-medium text-slate-500 mb-1">Kunden-Anmerkung</div>
              {h.customer_feedback}
            </div>
          )}

          {h.complaints && (
            <div className="mt-3 text-sm bg-red-50 border border-red-200 rounded p-3 whitespace-pre-wrap">
              <div className="text-xs font-medium text-red-700 mb-1">⚠ Beanstandungen</div>
              {h.complaints}
            </div>
          )}

          {final && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
              <SigBlock label="Kunde" data={h.customer_signature} name={h.customer_signature_name} />
              <SigBlock label="Werkstatt" data={h.employee_signature} name={h.employee_signature_name} />
            </div>
          )}
        </>
      )}

      <HandoverDialog
        open={open}
        onClose={() => setOpen(false)}
        appointment={appointment}
        onSaved={() => { load(); onChange?.(); }}
      />
    </div>
  );
}

function Info({ label, children }) {
  return (
    <div className="border rounded p-2 bg-slate-50/50">
      <div className="text-[11px] uppercase font-semibold text-slate-500">{label}</div>
      <div className="text-sm truncate">{children}</div>
    </div>
  );
}

function StatusBanner({ status, handoverAt }) {
  const map = {
    uebergeben: ['bg-green-100 text-green-800', '✓ Fahrzeug übergeben – ohne Beanstandung'],
    unter_vorbehalt: ['bg-amber-100 text-amber-800', '⚠ Übergeben unter Vorbehalt'],
    verweigert: ['bg-red-100 text-red-800', '✗ Abnahme verweigert'],
    offen: ['bg-slate-100 text-slate-700', 'Protokoll in Vorbereitung'],
  };
  const [cls, label] = map[status] || map.offen;
  return (
    <div className={`${cls} px-3 py-2 rounded text-sm font-medium flex items-center justify-between`}>
      <span>{label}</span>
      {handoverAt && (
        <span className="text-xs font-normal">
          {format(parseISO(handoverAt), "d. MMM yyyy HH:mm", { locale: de })} Uhr
        </span>
      )}
    </div>
  );
}

function SigBlock({ label, data, name }) {
  return (
    <div>
      <div className="text-xs uppercase font-semibold text-slate-500 mb-1">{label}</div>
      {data ? (
        <img src={data} alt={`Unterschrift ${label}`} className="max-h-20 border rounded bg-white" />
      ) : (
        <div className="h-20 border-b border-slate-400" />
      )}
      {name && <div className="text-xs mt-1">{name}</div>}
    </div>
  );
}
