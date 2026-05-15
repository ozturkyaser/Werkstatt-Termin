import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from './Modal';
import PhotoCapture from './PhotoCapture';
import SignaturePad from './SignaturePad';
import { api } from '../lib/api';
import { platesMatch } from '../lib/platesMatch';

export default function WorkLogFinish({ open, onClose, appointment, onFinished }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=Kennzeichen, 2=Checkliste, 3=Unterschrift
  const [photo, setPhoto] = useState(null);
  const [plateInput, setPlateInput] = useState('');
  const [plateAi, setPlateAi] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [mileage, setMileage] = useState('');
  const [templates, setTemplates] = useState([]);
  const [results, setResults] = useState({}); // { item_id: { status, note, text_value } }
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState(null);
  const [signatureName, setSignatureName] = useState('');
  const [saving, setSaving] = useState(false);
  const [forceFinish, setForceFinish] = useState(false);
  const [plateMismatch, setPlateMismatch] = useState(null);

  const expectedPlate = appointment?.license_plate || '';
  const enteredPlate = (plateInput || plateAi || '').trim();
  const platesOk = enteredPlate && expectedPlate
    ? platesMatch(enteredPlate, expectedPlate)
    : null;

  useEffect(() => {
    if (!open || !appointment?.id) return;
    setStep(1);
    setResults({});
    setPlateMismatch(null);
    setForceFinish(false);
    api.get(`/work-logs/checklists/${appointment.id}`).then(setTemplates);
  }, [open, appointment?.id]);

  async function runAi(imageDataUrl) {
    setPhoto(imageDataUrl);
    if (!imageDataUrl) return;
    setAiLoading(true);
    try {
      const res = await api.post('/ai/recognize-plate', {
        image: imageDataUrl,
        expected_plate: expectedPlate,
      });
      setPlateAi(res.plate || '');
      if (res.plate && !plateInput) setPlateInput(res.plate);
    } catch (e) {
      /* Manueller Fallback */
    } finally {
      setAiLoading(false);
    }
  }

  function setItem(itemId, patch) {
    setResults((r) => ({ ...r, [itemId]: { ...r[itemId], ...patch } }));
  }

  // Zählung für Fortschrittsanzeige
  const allItems = templates.flatMap((t) => t.items.map((i) => ({ ...i, template: t.name })));
  const handled = allItems.filter((i) => {
    const s = results[i.id]?.status;
    return s && s !== 'offen';
  }).length;
  const requiredOpen = allItems.filter((i) => i.required && (!results[i.id]?.status || results[i.id]?.status === 'offen'));
  const nichtOkCount = allItems.filter((i) => results[i.id]?.status === 'nicht_ok').length;

  async function save(confirmWrongPlate = false) {
    setSaving(true);
    setPlateMismatch(null);
    try {
      const checklist = Object.entries(results).map(([item_id, v]) => ({
        item_id: Number(item_id),
        status: v.status || 'offen',
        text_value: v.text_value || null,
        note: v.note || null,
      }));
      await api.post(`/work-logs/finish/${appointment.id}`, {
        photo,
        plate_input: plateInput || null,
        plate_ai: plateAi || null,
        mileage: mileage ? Number(mileage) : null,
        notes: notes || null,
        signature_data: signature,
        signature_name: signatureName,
        checklist,
        force_finish: forceFinish,
        confirm_wrong_plate: confirmWrongPlate,
      });
      onFinished?.();
      onClose?.();
    } catch (e) {
      if (e.status === 409 && e.data?.code === 'PLATE_MISMATCH') {
        setPlateMismatch(e.data);
        return;
      }
      if (e.data?.missing?.length || e.data?.open_count > 0) {
        if (confirm(`Es sind noch Pflicht-Prüfpunkte offen:\n${(e.data.missing || []).join('\n')}\n\nTrotzdem abschließen?`)) {
          setForceFinish(true);
          setSaving(false);
          setTimeout(() => save(confirmWrongPlate), 0);
          return;
        }
      } else {
        alert('Fehler: ' + e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={`Arbeit abschließen · Termin #${appointment?.id}`}>
      {/* Schritt-Navigation */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <StepIndicator nr={1} active={step === 1} done={step > 1} onClick={() => setStep(1)}>Kennzeichen</StepIndicator>
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator nr={2} active={step === 2} done={step > 2} onClick={() => setStep(2)}>Checkliste ({handled}/{allItems.length})</StepIndicator>
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator nr={3} active={step === 3} onClick={() => setStep(3)}>Unterschrift</StepIndicator>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <div><strong>Fahrzeug-Kennzeichen:</strong> <span className="font-mono font-bold">{expectedPlate}</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Kennzeichen-Foto (optional)</label>
            <PhotoCapture onCapture={runAi} label="Kennzeichen fotografieren" />
          </div>

          {aiLoading && <div className="text-sm text-slate-500">🤖 KI liest Kennzeichen…</div>}
          {plateAi && (
            <div className={`text-sm rounded p-2 ${platesOk === false ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
              KI: <b className="font-mono">{plateAi}</b>
              {platesOk === false && <span className="text-red-700 ml-2">– weicht vom Auftrag ab</span>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Kennzeichen manuell bestätigen</label>
            <input
              type="text"
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              placeholder={expectedPlate}
              className="input font-mono text-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Kilometerstand bei Auftragsende</label>
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className="input"
              placeholder="z.B. 125420"
            />
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setStep(2)}>Weiter zur Checkliste →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <div className="text-sm text-slate-500 bg-slate-50 rounded p-3">
              Keine Checkliste für die gewählten Leistungen hinterlegt.
              Im Menü <b>Einstellungen → Checklisten</b> können welche angelegt werden.
            </div>
          ) : (
            templates.map((tpl) => (
              <div key={tpl.id} className="border rounded-lg">
                <div className="bg-slate-50 px-4 py-2 border-b font-medium text-sm">
                  {tpl.name}
                  {tpl.via && <span className="text-xs text-slate-500 ml-2">({tpl.via})</span>}
                </div>
                <div className="divide-y">
                  {tpl.items.map((it) => {
                    const cur = results[it.id] || {};
                    return (
                      <div key={it.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {it.label}
                              {it.required ? <span className="text-red-500 ml-1">*</span> : null}
                            </div>
                            {it.hint && <div className="text-xs text-slate-500">{it.hint}</div>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <StatusBtn val="ok" cur={cur.status} onClick={() => setItem(it.id, { status: 'ok' })} color="green">✓ OK</StatusBtn>
                            <StatusBtn val="nicht_ok" cur={cur.status} onClick={() => setItem(it.id, { status: 'nicht_ok' })} color="red">✗ Nicht OK</StatusBtn>
                            <StatusBtn val="nicht_relevant" cur={cur.status} onClick={() => setItem(it.id, { status: 'nicht_relevant' })} color="slate">n/a</StatusBtn>
                          </div>
                        </div>
                        {it.input_type !== 'check' && (
                          <input
                            className="input mt-2 text-sm"
                            type={it.input_type === 'number' ? 'number' : 'text'}
                            placeholder="Messwert / Text"
                            value={cur.text_value || ''}
                            onChange={(e) => setItem(it.id, { text_value: e.target.value })}
                          />
                        )}
                        {cur.status === 'nicht_ok' && (
                          <textarea
                            className="input mt-2 text-sm"
                            rows={2}
                            placeholder="Was ist nicht OK? (Pflicht)"
                            value={cur.note || ''}
                            onChange={(e) => setItem(it.id, { note: e.target.value })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Anmerkungen / Arbeitsbericht</label>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Besonderheiten, weitere Empfehlungen, Ersatzteile geliefert etc."
            />
          </div>

          {requiredOpen.length > 0 && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              ⚠ Noch {requiredOpen.length} Pflicht-Prüfpunkt{requiredOpen.length > 1 ? 'e' : ''} offen.
            </div>
          )}
          {nichtOkCount > 0 && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {nichtOkCount} Mangel erfasst – wird im Protokoll als „Mängel" markiert.
            </div>
          )}

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>← Zurück</button>
            <button className="btn-primary" onClick={() => setStep(3)}>Weiter zur Unterschrift →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Unterschrift Mitarbeiter</label>
            <SignaturePad onChange={setSignature} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Name in Druckschrift</label>
            <input
              className="input"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="z.B. Max Mustermann"
            />
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div><b>{handled}</b> von <b>{allItems.length}</b> Prüfpunkten abgearbeitet · <b>{nichtOkCount}</b> Mängel</div>
            {requiredOpen.length > 0 && <div className="text-amber-700 mt-1">⚠ {requiredOpen.length} Pflicht-Punkt{requiredOpen.length > 1 ? 'e' : ''} noch offen</div>}
          </div>

          {plateMismatch && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm space-y-3">
              <div className="font-semibold text-red-900">Kennzeichen passt nicht zum Auftrag</div>
              <p className="text-red-800">
                Termin erwartet <span className="font-mono font-bold">{plateMismatch.expected_plate || '–'}</span>,
                erkannt/eingegeben: <span className="font-mono font-bold">{plateMismatch.entered_plate || '–'}</span>.
              </p>
              {(plateMismatch.candidates?.length > 0) && (
                <ul className="space-y-1 max-h-36 overflow-y-auto text-slate-700">
                  {plateMismatch.candidates.map((c) => (
                    <li key={c.id}>
                      <Link to={`/termine/${c.id}`} className="text-brand-700 hover:underline font-mono">
                        Termin #{c.id} {c.license_plate}
                      </Link>
                      <span> · {c.customer_name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>
                  Ja, trotzdem diesen Auftrag abschließen
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
                  Neuen Termin anlegen
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setPlateMismatch(null); setStep(1); }}>
                  Kennzeichen korrigieren
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(2)}>← Zurück</button>
            <button
              className="btn-primary"
              disabled={saving || !signature || !!plateMismatch}
              onClick={() => save(false)}
            >
              {saving ? 'Speichert…' : '🏁 Auftrag abschließen'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StepIndicator({ nr, active, done, onClick, children }) {
  const base = 'flex items-center gap-2 px-2 py-1 rounded transition';
  const cls = done ? 'text-green-600 bg-green-50' : active ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500';
  return (
    <button type="button" className={`${base} ${cls}`} onClick={onClick}>
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-semibold">
        {done ? '✓' : nr}
      </span>
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function StatusBtn({ val, cur, onClick, color, children }) {
  const colors = {
    green: cur === val ? 'bg-green-600 text-white' : 'text-green-700 border-green-300 hover:bg-green-50',
    red: cur === val ? 'bg-red-600 text-white' : 'text-red-700 border-red-300 hover:bg-red-50',
    slate: cur === val ? 'bg-slate-600 text-white' : 'text-slate-600 border-slate-300 hover:bg-slate-50',
  };
  return (
    <button type="button"
      className={`border rounded px-2 py-1 text-xs ${colors[color]}`}
      onClick={onClick}>
      {children}
    </button>
  );
}
