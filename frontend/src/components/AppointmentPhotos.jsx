import { useCallback, useEffect, useState } from 'react';
import PhotoCapture from './PhotoCapture';
import { api, apiAbsoluteUrl, getToken } from '../lib/api';

const KINDS = [
  { id: 'annahme', label: 'Annahme / Vorschaden' },
  { id: 'reparatur', label: 'Reparatur' },
  { id: 'uebergabe', label: 'Übergabe' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

export default function AppointmentPhotos({ appointmentId, onChange }) {
  const [media, setMedia] = useState([]);
  const [kind, setKind] = useState('annahme');
  const [blobs, setBlobs] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    try {
      const rows = await api.get(`/appointments/${appointmentId}/media`);
      setMedia(rows);
      const token = getToken();
      const next = {};
      for (const m of rows) {
        const r = await fetch(apiAbsoluteUrl(`/api/appointments/${appointmentId}/media/${m.id}/raw`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) next[m.id] = URL.createObjectURL(await r.blob());
      }
      setBlobs((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
    return () => {
      setBlobs((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return {};
      });
    };
  }, [load]);

  async function upload(imageDataUrl) {
    if (!imageDataUrl) return;
    await api.post(`/appointments/${appointmentId}/media`, { image: imageDataUrl, kind });
    onChange?.();
    load();
  }

  async function remove(mid) {
    if (!confirm('Foto löschen?')) return;
    await api.del(`/appointments/${appointmentId}/media/${mid}`);
    onChange?.();
    load();
  }

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold">📷 Auftragsfotos (Annahme & Dokumentation)</h2>
      <p className="text-sm text-slate-500">
        Ideal für Vorschäden und Zustand bei Annahme. Bilder sind nur für angemeldete Nutzer sichtbar.
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="label">Kategorie</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <PhotoCapture onCapture={upload} label="Foto hinzufügen" />
        </div>
      </div>
      {loading ? <div className="text-sm text-slate-500">Lädt…</div> : media.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Fotos.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {media.map((m) => (
            <div key={m.id} className="border rounded-lg overflow-hidden bg-slate-50">
              {blobs[m.id] ? (
                <img src={blobs[m.id]} alt="" className="w-full h-28 object-cover" />
              ) : (
                <div className="h-28 flex items-center justify-center text-xs text-slate-400">Lädt…</div>
              )}
              <div className="p-2 text-xs">
                <div className="font-medium capitalize">{m.kind}</div>
                {m.caption && <div className="text-slate-600 truncate">{m.caption}</div>}
                <button type="button" className="text-red-600 mt-1 hover:underline" onClick={() => remove(m.id)}>Löschen</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
