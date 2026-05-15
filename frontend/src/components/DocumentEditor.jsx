import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { api, apiAbsoluteUrl, formatCurrency } from '../lib/api';

const TYPE_LABELS = {
  angebot: 'Angebot',
  rechnung: 'Rechnung',
  storno: 'Stornorechnung',
  gutschrift: 'Gutschrift',
};

export default function DocumentEditor({ initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [doc, setDoc] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    api.get('/customers').then(setCustomers);
    api.get('/services').then(setServices);
  }, []);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      api
        .get(`/documents/${initial.id}`)
        .then((d) => setDoc(d))
        .finally(() => setLoading(false));
    } else {
      setDoc({
        type: initial.type || 'rechnung',
        status: 'entwurf',
        customer_id: null,
        vehicle_id: null,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date:
          initial.type === 'rechnung'
            ? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
            : null,
        tax_rate: 19,
        notes: '',
        items: [
          { description: '', quantity: 1, unit: 'Stk.', unit_price: 0, discount_pct: 0 },
        ],
      });
    }
  }, [initial, isEdit]);

  useEffect(() => {
    if (doc?.customer_id) {
      api.get(`/vehicles?customer_id=${doc.customer_id}`).then(setVehicles);
    } else {
      setVehicles([]);
    }
  }, [doc?.customer_id]);

  const totals = useMemo(() => {
    if (!doc) return { net: 0, tax: 0, gross: 0 };
    const net = (doc.items || []).reduce(
      (s, it) =>
        s +
        (Number(it.quantity) || 0) *
          (Number(it.unit_price) || 0) *
          (1 - (Number(it.discount_pct) || 0) / 100),
      0
    );
    const tax = (net * (Number(doc.tax_rate) || 0)) / 100;
    return { net: round(net), tax: round(tax), gross: round(net + tax) };
  }, [doc]);

  if (loading || !doc) {
    return (
      <Modal open title="Dokument" onClose={onClose} wide>
        <div className="p-8 text-center text-slate-500">Lädt…</div>
      </Modal>
    );
  }

  const customerFiltered = customerSearch
    ? customers.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.email || ''} ${c.phone || ''}`
          .toLowerCase()
          .includes(customerSearch.toLowerCase())
      )
    : customers;

  function setItem(i, patch) {
    setDoc((d) => {
      const items = [...d.items];
      items[i] = { ...items[i], ...patch };
      return { ...d, items };
    });
  }
  function addItem() {
    setDoc((d) => ({
      ...d,
      items: [...d.items, { description: '', quantity: 1, unit: 'Stk.', unit_price: 0, discount_pct: 0 }],
    }));
  }
  function removeItem(i) {
    setDoc((d) => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  }
  function addService(svc) {
    setDoc((d) => ({
      ...d,
      items: [
        ...(d.items || []).filter((x) => x.description || x.unit_price),
        {
          service_id: svc.id,
          description: svc.name,
          quantity: 1,
          unit: 'Stk.',
          unit_price: svc.price,
          discount_pct: 0,
        },
      ],
    }));
  }

  async function save() {
    if (!doc.customer_id) return alert('Bitte Kunde auswählen');
    if (!doc.items?.length) return alert('Bitte mindestens eine Position hinzufügen');
    if (doc.items.some((i) => !i.description)) return alert('Jede Position braucht eine Beschreibung');
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/documents/${initial.id}`, {
          customer_id: doc.customer_id,
          vehicle_id: doc.vehicle_id,
          issue_date: doc.issue_date,
          due_date: doc.due_date,
          notes: doc.notes,
          internal_notes: doc.internal_notes,
          payment_method: doc.payment_method,
          tax_rate: doc.tax_rate,
          items: doc.items,
          status: doc.status,
          paid_amount: doc.paid_amount,
          payment_date: doc.payment_date,
        });
      } else {
        await api.post('/documents', {
          type: doc.type,
          customer_id: doc.customer_id,
          vehicle_id: doc.vehicle_id,
          issue_date: doc.issue_date,
          due_date: doc.due_date,
          notes: doc.notes,
          payment_method: doc.payment_method,
          tax_rate: doc.tax_rate,
          items: doc.items,
          status: doc.status,
        });
      }
      onSaved?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`${isEdit ? 'Bearbeiten' : 'Neu'}: ${TYPE_LABELS[doc.type] || 'Dokument'}${isEdit ? ' ' + doc.doc_number : ''}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">Typ</label>
            <select
              className="input text-sm w-full"
              value={doc.type}
              disabled={isEdit}
              onChange={(e) => setDoc({ ...doc, type: e.target.value })}
            >
              <option value="angebot">Angebot</option>
              <option value="rechnung">Rechnung</option>
              <option value="gutschrift">Gutschrift</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">Status</label>
            <select
              className="input text-sm w-full"
              value={doc.status || 'entwurf'}
              onChange={(e) => setDoc({ ...doc, status: e.target.value })}
            >
              <option value="entwurf">Entwurf</option>
              <option value="offen">Offen</option>
              <option value="teilweise_bezahlt">Teilweise bezahlt</option>
              <option value="bezahlt">Bezahlt</option>
              <option value="angenommen">Angenommen</option>
              <option value="abgelehnt">Abgelehnt</option>
              <option value="storniert">Storniert</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">Datum</label>
            <input
              type="date"
              className="input text-sm w-full"
              value={doc.issue_date || ''}
              onChange={(e) => setDoc({ ...doc, issue_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">Fällig</label>
            <input
              type="date"
              className="input text-sm w-full"
              value={doc.due_date || ''}
              onChange={(e) => setDoc({ ...doc, due_date: e.target.value })}
            />
          </div>
        </div>

        {/* Kunde */}
        <div>
          <label className="text-xs text-slate-500 uppercase font-semibold">Kunde *</label>
          <div className="flex gap-2 mt-1">
            <input
              className="input text-sm flex-1"
              placeholder="Suchen…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
            <select
              className="input text-sm flex-1"
              value={doc.customer_id || ''}
              onChange={(e) => setDoc({ ...doc, customer_id: Number(e.target.value) || null, vehicle_id: null })}
            >
              <option value="">— auswählen —</option>
              {customerFiltered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} {c.phone ? `· ${c.phone}` : ''}
                </option>
              ))}
            </select>
            <select
              className="input text-sm flex-1"
              value={doc.vehicle_id || ''}
              onChange={(e) => setDoc({ ...doc, vehicle_id: Number(e.target.value) || null })}
              disabled={!doc.customer_id}
            >
              <option value="">— kein Fahrzeug —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.license_plate} · {v.brand} {v.model}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Positionen */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs text-slate-500 uppercase font-semibold">Positionen</label>
            <ServiceAdder services={services} onAdd={addService} />
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left px-2 py-1">Beschreibung</th>
                  <th className="w-24 text-right px-2 py-1">Menge</th>
                  <th className="w-20 text-left px-2 py-1">Einh.</th>
                  <th className="w-28 text-right px-2 py-1">Einzel</th>
                  <th className="w-20 text-right px-2 py-1">Rabatt %</th>
                  <th className="w-28 text-right px-2 py-1">Summe</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {doc.items.map((it, i) => {
                  const lineTotal =
                    (Number(it.quantity) || 0) *
                    (Number(it.unit_price) || 0) *
                    (1 - (Number(it.discount_pct) || 0) / 100);
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1">
                        <input
                          className="w-full border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary-500 rounded px-1"
                          value={it.description}
                          onChange={(e) => setItem(i, { description: e.target.value })}
                          placeholder="Leistung oder Artikel"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          className="w-full text-right border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary-500 rounded px-1"
                          value={it.quantity}
                          onChange={(e) => setItem(i, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary-500 rounded px-1"
                          value={it.unit || 'Stk.'}
                          onChange={(e) => setItem(i, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          className="w-full text-right border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary-500 rounded px-1"
                          value={it.unit_price}
                          onChange={(e) => setItem(i, { unit_price: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          className="w-full text-right border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary-500 rounded px-1"
                          value={it.discount_pct || 0}
                          onChange={(e) => setItem(i, { discount_pct: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">
                        {formatCurrency(round(lineTotal))}
                      </td>
                      <td className="px-1 py-1 text-right">
                        <button className="text-rose-600 hover:text-rose-800" onClick={() => removeItem(i)}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn-ghost text-sm mt-2" onClick={addItem}>+ Leere Position</button>
        </div>

        {/* Summen + Notiz */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">Notizen (erscheint auf dem Dokument)</label>
            <textarea
              className="input text-sm w-full h-24"
              value={doc.notes || ''}
              onChange={(e) => setDoc({ ...doc, notes: e.target.value })}
              placeholder="z.B. Zahlungsbedingungen, Hinweise…"
            />
            <label className="text-xs text-slate-500 uppercase font-semibold mt-2 block">MwSt. %</label>
            <input
              type="number"
              step="0.1"
              className="input text-sm w-24"
              value={doc.tax_rate}
              onChange={(e) => setDoc({ ...doc, tax_rate: Number(e.target.value) })}
            />
          </div>
          <div className="card p-4 bg-slate-50">
            <div className="flex justify-between text-sm"><span>Netto:</span><span>{formatCurrency(totals.net)}</span></div>
            <div className="flex justify-between text-sm">
              <span>MwSt. {doc.tax_rate} %:</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold mt-2 pt-2 border-t">
              <span>Summe:</span>
              <span>{formatCurrency(totals.gross)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          {isEdit && (
            <button
              className="btn-ghost"
              onClick={() => {
                const token = localStorage.getItem('werkstatt_token');
                const w = window.open('', '_blank');
                fetch(apiAbsoluteUrl(`/api/documents/${initial.id}/print`), {
                  headers: { Authorization: `Bearer ${token}` },
                })
                  .then((r) => r.text())
                  .then((html) => {
                    w.document.open();
                    w.document.write(html);
                    w.document.close();
                  });
              }}
            >
              🖨️ Drucken / PDF
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Speichert…' : isEdit ? 'Speichern' : 'Anlegen'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ServiceAdder({ services, onAdd }) {
  const [val, setVal] = useState('');
  return (
    <select
      className="input text-sm w-auto"
      value={val}
      onChange={(e) => {
        const svc = services.find((s) => s.id === Number(e.target.value));
        if (svc) onAdd(svc);
        setVal('');
      }}
    >
      <option value="">+ Leistung hinzufügen…</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({formatCurrency(s.price)})
        </option>
      ))}
    </select>
  );
}

function round(n) {
  return Math.round(n * 100) / 100;
}
