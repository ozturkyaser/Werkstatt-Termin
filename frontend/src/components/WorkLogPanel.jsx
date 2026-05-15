import { useEffect, useState } from 'react';
import { api, apiAbsoluteUrl, getToken } from '../lib/api';
import WorkLogStart from './WorkLogStart';
import WorkLogFinish from './WorkLogFinish';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

export default function WorkLogPanel({ appointment, onChange }) {
  const [wl, setWl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get(`/work-logs/by-appointment/${appointment.id}`);
      setWl(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (appointment?.id) load();
  }, [appointment?.id]);

  if (loading) return <div className="card p-5 text-sm text-slate-500">Lädt Arbeitsprotokoll…</div>;

  const started = !!wl?.started_at;
  const ended = !!wl?.ended_at;

  function openPrint() {
    const token = getToken();
    const w = window.open('', '_blank');
    fetch(apiAbsoluteUrl(`/api/work-logs/print/${appointment.id}`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.text())
      .then((html) => { w.document.open(); w.document.write(html); w.document.close(); });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">🛠️ Arbeitsprotokoll</h2>
        <div className="flex gap-2">
          {!started && (
            <button className="btn-primary" onClick={() => setStartOpen(true)}>▶ Arbeit starten</button>
          )}
          {started && !ended && (
            <>
              <button className="btn-secondary" onClick={() => setStartOpen(true)}>Start bearbeiten</button>
              <button className="btn-primary" onClick={() => setFinishOpen(true)}>🏁 Arbeit abschließen</button>
            </>
          )}
          {ended && (
            <>
              <button className="btn-secondary" onClick={openPrint}>🖨️ Protokoll drucken</button>
            </>
          )}
        </div>
      </div>

      {!started && (
        <div className="text-sm text-slate-500">
          Noch nicht gestartet. Der Mitarbeiter fotografiert bei Start das Kennzeichen – die KI erkennt es, das System startet dann den Auftrag.
        </div>
      )}

      {started && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <InfoBlock title="Start">
            <div>Zeit: {format(parseISO(wl.started_at), "d. MMM yyyy HH:mm", { locale: de })} Uhr</div>
            <div>Kennzeichen: <span className="font-mono">{wl.start_plate_input || wl.start_plate_ai || '–'}</span>
              {wl.start_plate_match === 1 && <span className="text-green-600 ml-1">✓</span>}
              {wl.start_plate_match === 0 && <span className="text-red-600 ml-1">✗</span>}
            </div>
            <div>KM: {wl.start_mileage || '–'}</div>
            {wl.start_photo && <img src={wl.start_photo} alt="Start" className="mt-2 rounded border max-h-32" />}
          </InfoBlock>

          <InfoBlock title={ended ? 'Ende' : 'Ende (noch offen)'}>
            {ended ? (
              <>
                <div>Zeit: {format(parseISO(wl.ended_at), "d. MMM yyyy HH:mm", { locale: de })} Uhr</div>
                <div>Kennzeichen: <span className="font-mono">{wl.end_plate_input || wl.end_plate_ai || '–'}</span>
                  {wl.end_plate_match === 1 && <span className="text-green-600 ml-1">✓</span>}
                  {wl.end_plate_match === 0 && <span className="text-red-600 ml-1">✗</span>}
                </div>
                <div>KM: {wl.end_mileage || '–'}</div>
                <div>Status: <ChecklistBadge s={wl.checklist_status} /></div>
                {wl.end_photo && <img src={wl.end_photo} alt="Ende" className="mt-2 rounded border max-h-32" />}
              </>
            ) : (
              <div className="text-slate-500">Auftrag läuft.</div>
            )}
          </InfoBlock>
        </div>
      )}

      {ended && wl.notes && (
        <div className="mt-4 text-sm bg-slate-50 border rounded p-3 whitespace-pre-wrap">
          <div className="font-medium mb-1">Anmerkungen</div>
          {wl.notes}
        </div>
      )}

      {ended && wl.results?.length > 0 && (
        <div className="mt-4">
          <div className="font-medium text-sm mb-2">Checkliste ({wl.results.length} Punkte)</div>
          <div className="text-xs grid grid-cols-2 gap-1">
            {wl.results.slice(0, 12).map((r) => (
              <div key={r.id} className="flex items-center gap-1 text-slate-700">
                <span>{statusIcon(r.status)}</span>
                <span className="truncate">{r.item_label}</span>
              </div>
            ))}
            {wl.results.length > 12 && (
              <div className="text-xs text-slate-500">+ {wl.results.length - 12} weitere…</div>
            )}
          </div>
        </div>
      )}

      {ended && wl.signature_data && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs text-slate-500 mb-1">Digital unterschrieben:</div>
          <img src={wl.signature_data} alt="Unterschrift" className="max-w-[240px] border rounded bg-white" />
          {wl.signature_name && <div className="text-xs mt-1">{wl.signature_name}</div>}
        </div>
      )}

      <WorkLogStart
        open={startOpen}
        onClose={() => setStartOpen(false)}
        appointment={appointment}
        onStarted={() => { load(); onChange?.(); }}
      />
      <WorkLogFinish
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        appointment={appointment}
        onFinished={() => { load(); onChange?.(); }}
      />
    </div>
  );
}

function InfoBlock({ title, children }) {
  return (
    <div className="border rounded-lg p-3 bg-slate-50/50">
      <div className="text-xs uppercase font-semibold text-slate-500 mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ChecklistBadge({ s }) {
  const map = {
    ok: ['bg-green-100 text-green-700', '✓ Alles i.O.'],
    maengel: ['bg-red-100 text-red-700', '⚠ Mängel'],
    nicht_freigegeben: ['bg-amber-100 text-amber-700', 'Nicht freigegeben'],
    offen: ['bg-slate-100 text-slate-600', 'offen'],
  };
  const [cls, label] = map[s] || ['bg-slate-100 text-slate-600', s];
  return <span className={`inline-block px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span>;
}
function statusIcon(s) {
  if (s === 'ok') return '✅';
  if (s === 'nicht_ok') return '❌';
  if (s === 'nicht_relevant') return '➖';
  return '⬜';
}
