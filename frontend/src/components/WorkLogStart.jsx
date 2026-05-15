import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from './Modal';
import PhotoCapture from './PhotoCapture';
import { api } from '../lib/api';
import { platesMatch } from '../lib/platesMatch';

export default function WorkLogStart({ open, onClose, appointment, onStarted }) {
  const navigate = useNavigate();
  const [photo, setPhoto] = useState(null);
  const [plateInput, setPlateInput] = useState('');
  const [plateAi, setPlateAi] = useState('');
  const [aiConfidence, setAiConfidence] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [mileage, setMileage] = useState(appointment?.mileage || '');
  const [saving, setSaving] = useState(false);
  const [plateMismatch, setPlateMismatch] = useState(null);

  const expectedPlate = appointment?.license_plate || '';

  useEffect(() => {
    if (!open) {
      setPlateMismatch(null);
      setPhoto(null);
      setPlateInput('');
      setPlateAi('');
      setAiConfidence(null);
      setAiError(null);
      setMileage(appointment?.mileage || '');
    }
  }, [open, appointment?.id]);

  async function runAi(imageDataUrl) {
    setPhoto(imageDataUrl);
    if (!imageDataUrl) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await api.post('/ai/recognize-plate', {
        image: imageDataUrl,
        expected_plate: expectedPlate,
      });
      setPlateAi(res.plate || '');
      setAiConfidence(res.confidence || null);
      if (res.plate && !plateInput) setPlateInput(res.plate);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function save(confirmWrongPlate = false) {
    setSaving(true);
    setPlateMismatch(null);
    try {
      await api.post(`/work-logs/start/${appointment.id}`, {
        photo,
        plate_input: plateInput || null,
        plate_ai: plateAi || null,
        mileage: mileage ? Number(mileage) : null,
        confirm_wrong_plate: confirmWrongPlate,
      });
      onStarted?.();
      onClose?.();
    } catch (e) {
      if (e.status === 409 && e.data?.code === 'PLATE_MISMATCH') {
        setPlateMismatch(e.data);
        return;
      }
      alert('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const entered = (plateInput || plateAi || '').trim();
  const platesOk = entered && expectedPlate
    ? platesMatch(entered, expectedPlate)
    : null;

  return (
    <Modal open={open} onClose={onClose} wide title={`Arbeit starten · Termin #${appointment?.id}`}>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <div><strong>Erwartetes Kennzeichen:</strong> <span className="font-mono font-bold text-blue-900">{expectedPlate || '–'}</span></div>
          <div><strong>Fahrzeug:</strong> {appointment?.brand} {appointment?.model}</div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">1) Kennzeichen-Foto</label>
          <PhotoCapture onCapture={runAi} label="Kennzeichen fotografieren" />
        </div>

        {aiLoading && (
          <div className="text-sm text-slate-500">🤖 KI liest Kennzeichen…</div>
        )}
        {aiError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            KI-Fehler: {aiError} – Kennzeichen bitte manuell eingeben.
          </div>
        )}
        {plateAi && (
          <div className={`text-sm rounded-lg p-3 ${platesOk === true ? 'bg-green-50 border border-green-200' : platesOk === false ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border'}`}>
            KI-Erkennung: <span className="font-mono font-bold text-lg">{plateAi}</span>
            {aiConfidence && <span className="ml-2 text-xs">({aiConfidence})</span>}
            {platesOk === true && <div className="mt-1 text-green-700">✓ Stimmt mit Termin überein</div>}
            {platesOk === false && <div className="mt-1 text-red-700">✗ Weicht vom Termin ab – Start wird ohne Bestätigung blockiert.</div>}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">2) Kennzeichen-Bestätigung / Korrektur</label>
          <input
            type="text"
            value={plateInput}
            onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
            placeholder="z.B. B-AB 1234"
            className="input font-mono text-lg"
          />
          <div className="text-xs text-slate-500 mt-1">
            Kann manuell eingegeben werden, falls keine Kamera verfügbar.
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Kilometerstand beim Start</label>
          <input
            type="number"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            className="input"
            placeholder="z.B. 125340"
          />
        </div>

        {plateMismatch && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm space-y-3">
            <div className="font-semibold text-red-900">Kennzeichen passt nicht zum Auftrag</div>
            <p className="text-red-800">
              Auftrag (Termin) erwartet <span className="font-mono font-bold">{plateMismatch.expected_plate || '–'}</span>,
              erkannt/eingegeben: <span className="font-mono font-bold">{plateMismatch.entered_plate || '–'}</span>.
            </p>
            <p className="text-slate-700">
              Soll <strong>dieser Termin #{appointment?.id}</strong> trotzdem gestartet werden, oder handelt es sich um ein anderes Fahrzeug?
            </p>
            {(plateMismatch.candidates?.length > 0) && (
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase mb-1">Passende Termine im System</div>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {plateMismatch.candidates.map((c) => (
                    <li key={c.id}>
                      <Link to={`/termine/${c.id}`} className="text-brand-700 hover:underline font-mono">
                        #{c.id} {c.license_plate}
                      </Link>
                      <span className="text-slate-600"> · {c.customer_name} · {c.brand} {c.model}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(!plateMismatch.candidates?.length) && (
              <p className="text-slate-600 text-xs">Kein anderer offener Termin mit diesem Kennzeichen gefunden. Sie können einen neuen Termin anlegen.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>
                Ja, trotzdem diesen Auftrag starten
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const p = encodeURIComponent(String(plateMismatch.entered_plate || '').trim());
                  navigate(`/kalender?neu=1&kennzeichen=${p}`);
                  onClose?.();
                }}
              >
                Neuen Termin anlegen (Kennzeichen übernehmen)
              </button>
              <button type="button" className="btn-ghost" onClick={() => setPlateMismatch(null)}>
                Zurück zur Eingabe
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !(plateInput || plateAi) || !!plateMismatch}
            onClick={() => save(false)}
          >
            {saving ? 'Speichert…' : '▶ Arbeit starten'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
