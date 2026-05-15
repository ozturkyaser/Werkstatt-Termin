import { useEffect, useState } from 'react';
import Modal from './Modal';
import SignaturePad from './SignaturePad';
import { api } from '../lib/api';

export default function HandoverDialog({ open, onClose, appointment, onSaved }) {
  const [step, setStep] = useState(1); // 1 Inhalte · 2 Checkliste · 3 Zufriedenheit · 4 Unterschrift
  const [templates, setTemplates] = useState([]);
  const [existing, setExisting] = useState(null);

  // Form-State
  const [keysCount, setKeysCount] = useState(1);
  const [documents, setDocuments] = useState('Fahrzeugschein (ZB I)');
  const [accessories, setAccessories] = useState('');
  const [endMileage, setEndMileage] = useState('');
  const [results, setResults] = useState({});
  const [satisfaction, setSatisfaction] = useState(5);
  const [customerFeedback, setCustomerFeedback] = useState('');
  const [complaints, setComplaints] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('uebergeben');
  const [customerSignature, setCustomerSignature] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [employeeSignature, setEmployeeSignature] = useState(null);
  const [employeeName, setEmployeeName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !appointment?.id) return;
    setStep(1);

    Promise.all([
      api.get(`/handovers/checklists/${appointment.id}`),
      api.get(`/handovers/by-appointment/${appointment.id}`).catch(() => null),
    ]).then(([tpl, ex]) => {
      setTemplates(tpl);
      setExisting(ex);
      if (ex) {
        setKeysCount(ex.keys_count ?? 1);
        setDocuments(ex.documents_returned || 'Fahrzeugschein (ZB I)');
        setAccessories(ex.accessories_returned || '');
        setEndMileage(ex.end_mileage || '');
        setSatisfaction(ex.customer_satisfaction ?? 5);
        setCustomerFeedback(ex.customer_feedback || '');
        setComplaints(ex.complaints || '');
        setNotes(ex.notes || '');
        setStatus(ex.status || 'uebergeben');
        setCustomerSignature(ex.customer_signature || null);
        setCustomerName(ex.customer_signature_name || '');
        setEmployeeSignature(ex.employee_signature || null);
        setEmployeeName(ex.employee_signature_name || '');
        const r = {};
        (ex.results || []).forEach((row) => {
          r[row.item_id] = { status: row.status, note: row.note, text_value: row.text_value };
        });
        setResults(r);
      } else {
        // Default: Kundenname vorschlagen
        setCustomerName(`${appointment.first_name || ''} ${appointment.last_name || ''}`.trim());
        setEndMileage(appointment.mileage_at_service || '');
      }
    });
  }, [open, appointment?.id]);

  function setItem(itemId, patch) {
    setResults((r) => ({ ...r, [itemId]: { ...r[itemId], ...patch } }));
  }

  const allItems = templates.flatMap((t) => t.items);
  const handled = allItems.filter((i) => results[i.id]?.status && results[i.id]?.status !== 'offen').length;
  const nichtOks = allItems.filter((i) => results[i.id]?.status === 'nicht_ok').length;

  async function save(final = false) {
    if (final && !customerSignature) {
      alert('Kunden-Unterschrift fehlt.');
      return;
    }
    setSaving(true);
    try {
      const checklist = Object.entries(results).map(([item_id, v]) => ({
        item_id: Number(item_id),
        status: v.status || 'offen',
        text_value: v.text_value || null,
        note: v.note || null,
      }));
      const effectiveStatus = nichtOks > 0 && status === 'uebergeben' ? 'unter_vorbehalt' : status;

      await api.post(`/handovers/save/${appointment.id}`, {
        end_mileage: endMileage ? Number(endMileage) : null,
        keys_count: keysCount ? Number(keysCount) : null,
        documents_returned: documents || null,
        accessories_returned: accessories || null,
        customer_feedback: customerFeedback || null,
        customer_satisfaction: satisfaction ? Number(satisfaction) : null,
        complaints: complaints || null,
        notes: notes || null,
        status: effectiveStatus,
        customer_signature: customerSignature,
        customer_signature_name: customerName,
        employee_signature: employeeSignature,
        employee_signature_name: employeeName,
        checklist,
        final,
      });
      onSaved?.();
      if (final) onClose?.();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={`Fahrzeug-Übergabe · Termin #${appointment?.id}`}>
      <div className="flex items-center gap-2 mb-4 text-sm overflow-x-auto">
        <StepInd nr={1} active={step === 1} done={step > 1} onClick={() => setStep(1)}>Schlüssel & Papiere</StepInd>
        <Line />
        <StepInd nr={2} active={step === 2} done={step > 2} onClick={() => setStep(2)}>Checkliste ({handled}/{allItems.length})</StepInd>
        <Line />
        <StepInd nr={3} active={step === 3} done={step > 3} onClick={() => setStep(3)}>Feedback</StepInd>
        <Line />
        <StepInd nr={4} active={step === 4} onClick={() => setStep(4)}>Unterschrift</StepInd>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <div><b>Kunde:</b> {appointment?.first_name} {appointment?.last_name}</div>
            <div><b>Fahrzeug:</b> {appointment?.license_plate} · {appointment?.brand} {appointment?.model}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">🔑 Anzahl Schlüssel</label>
              <input type="number" className="input" value={keysCount} min="0" max="5"
                     onChange={(e) => setKeysCount(e.target.value)} />
              <div className="text-xs text-slate-500 mt-1">Wichtig: wie viele Schlüssel hat der Kunde erhalten?</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">🛣 Kilometerstand bei Übergabe</label>
              <input type="number" className="input" value={endMileage}
                     onChange={(e) => setEndMileage(e.target.value)} placeholder="z.B. 125420" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">📄 Fahrzeugpapiere</label>
            <input className="input" value={documents} onChange={(e) => setDocuments(e.target.value)}
                   placeholder="Fahrzeugschein, TÜV-Bescheinigung, Serviceheft …" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">🎒 Zubehör / Persönliche Gegenstände</label>
            <input className="input" value={accessories} onChange={(e) => setAccessories(e.target.value)}
                   placeholder="z.B. Reserverad, Warndreieck, Radio-Code, Handy-Kabel …" />
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
              Keine Übergabe-Checklisten konfiguriert.
              Admin kann sie unter <b>Checklisten → + Neue Checkliste → Gültigkeitsbereich „Übergabe"</b> anlegen
              oder Standard-Vorlagen laden.
            </div>
          ) : templates.map((tpl) => (
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
                          <SBtn val="ok" cur={cur.status} onClick={() => setItem(it.id, { status: 'ok' })} color="green">✓ Bestätigt</SBtn>
                          <SBtn val="nicht_ok" cur={cur.status} onClick={() => setItem(it.id, { status: 'nicht_ok' })} color="red">✗ Nicht OK</SBtn>
                          <SBtn val="nicht_relevant" cur={cur.status} onClick={() => setItem(it.id, { status: 'nicht_relevant' })} color="slate">n/a</SBtn>
                        </div>
                      </div>
                      {it.input_type !== 'check' && (
                        <input className="input mt-2 text-sm"
                               type={it.input_type === 'number' ? 'number' : 'text'}
                               placeholder="Wert / Notiz"
                               value={cur.text_value || ''}
                               onChange={(e) => setItem(it.id, { text_value: e.target.value })} />
                      )}
                      {cur.status === 'nicht_ok' && (
                        <textarea className="input mt-2 text-sm" rows={2}
                                  placeholder="Anmerkung des Kunden"
                                  value={cur.note || ''}
                                  onChange={(e) => setItem(it.id, { note: e.target.value })} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>← Zurück</button>
            <button className="btn-primary" onClick={() => setStep(3)}>Weiter zum Feedback →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Kunden-Zufriedenheit</label>
            <div className="flex gap-1 text-3xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setSatisfaction(n)}
                  className={`w-10 h-10 rounded ${n <= satisfaction ? 'text-amber-400' : 'text-slate-300'} hover:scale-110 transition`}>
                  ★
                </button>
              ))}
              <span className="text-sm self-center ml-3 text-slate-500">{satisfaction} von 5</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">💬 Anmerkungen / Lob des Kunden</label>
            <textarea className="input" rows={2} value={customerFeedback}
                      onChange={(e) => setCustomerFeedback(e.target.value)}
                      placeholder="Alles super, Termin pünktlich eingehalten." />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">⚠ Beanstandungen / Mängel</label>
            <textarea className="input" rows={2} value={complaints}
                      onChange={(e) => setComplaints(e.target.value)}
                      placeholder="Leer lassen, falls alles in Ordnung. Bei Eintrag wird Status auf unter Vorbehalt gesetzt." />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">📝 Interne Notizen (nur Werkstatt)</label>
            <textarea className="input" rows={2} value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Wird nicht auf dem Kunden-Protokoll gedruckt" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Abnahme-Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="uebergeben">✓ Ohne Beanstandung übergeben</option>
              <option value="unter_vorbehalt">⚠ Unter Vorbehalt übergeben</option>
              <option value="verweigert">✗ Abnahme verweigert</option>
            </select>
            {nichtOks > 0 && status === 'uebergeben' && (
              <div className="text-xs text-amber-700 mt-1">
                Hinweis: {nichtOks} Mangel erfasst – Status wird beim Speichern automatisch auf „unter Vorbehalt" gesetzt.
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(2)}>← Zurück</button>
            <button className="btn-primary" onClick={() => setStep(4)}>Weiter zur Unterschrift →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="text-sm bg-slate-50 rounded p-3 border">
            <div className="font-medium mb-1">Bestätigung durch den Kunden:</div>
            <div className="text-xs text-slate-600">
              Mit Ihrer Unterschrift bestätigen Sie die Entgegennahme des Fahrzeugs, der {keysCount || 0} Schlüssel,
              der aufgeführten Papiere und die Durchführung der Arbeiten zu Ihrer Zufriedenheit
              {complaints ? ' – unter Vorbehalt der oben genannten Beanstandungen' : ''}.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Unterschrift Kunde *</label>
            <SignaturePad onChange={setCustomerSignature} />
            <input className="input mt-2" placeholder="Name des Unterzeichnenden"
                   value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Unterschrift Werkstatt (gegenzeichnen)</label>
            <SignaturePad onChange={setEmployeeSignature} />
            <input className="input mt-2" placeholder="Name Mitarbeiter"
                   value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
          </div>

          <div className="flex justify-between items-center pt-3 border-t">
            <button className="btn-ghost" onClick={() => setStep(3)}>← Zurück</button>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => save(false)}>
                Zwischenspeichern
              </button>
              <button className="btn-primary" disabled={saving || !customerSignature} onClick={() => save(true)}>
                {saving ? 'Speichert…' : '✓ Übergabe abschließen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StepInd({ nr, active, done, onClick, children }) {
  const cls = done ? 'text-green-600 bg-green-50' : active ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500';
  return (
    <button type="button" className={`flex items-center gap-2 px-2 py-1 rounded transition ${cls}`} onClick={onClick}>
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-semibold">{done ? '✓' : nr}</span>
      <span className="hidden md:inline whitespace-nowrap">{children}</span>
    </button>
  );
}
function Line() { return <div className="h-px flex-1 bg-slate-200 min-w-[10px]" />; }
function SBtn({ val, cur, onClick, color, children }) {
  const colors = {
    green: cur === val ? 'bg-green-600 text-white' : 'text-green-700 border-green-300 hover:bg-green-50',
    red: cur === val ? 'bg-red-600 text-white' : 'text-red-700 border-red-300 hover:bg-red-50',
    slate: cur === val ? 'bg-slate-600 text-white' : 'text-slate-600 border-slate-300 hover:bg-slate-50',
  };
  return (
    <button type="button" className={`border rounded px-2 py-1 text-xs ${colors[color]}`} onClick={onClick}>
      {children}
    </button>
  );
}
