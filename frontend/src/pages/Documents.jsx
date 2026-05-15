import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiAbsoluteUrl, formatCurrency } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import DocumentEditor from '../components/DocumentEditor';

const TYPE_LABELS = {
  angebot: 'Angebot',
  rechnung: 'Rechnung',
  storno: 'Storno',
  gutschrift: 'Gutschrift',
};

const STATUS_BADGE = {
  entwurf: 'bg-slate-100 text-slate-700',
  offen: 'bg-amber-100 text-amber-800',
  teilweise_bezahlt: 'bg-blue-100 text-blue-800',
  bezahlt: 'bg-emerald-100 text-emerald-800',
  storniert: 'bg-rose-100 text-rose-800',
  angenommen: 'bg-violet-100 text-violet-800',
  abgelehnt: 'bg-slate-100 text-slate-600',
};

export default function Documents() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(null); // {type: 'rechnung'} | {id: X} | null

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (filterType) p.set('type', filterType);
    if (filterStatus) p.set('status', filterStatus);
    if (q) p.set('q', q);
    api.get(`/documents?${p.toString()}`).then(setRows);
  }, [filterType, filterStatus, q]);

  useEffect(() => { load(); }, [load]);

  function printDoc(id) {
    const token = localStorage.getItem('werkstatt_token');
    const w = window.open('', '_blank');
    fetch(apiAbsoluteUrl(`/api/documents/${id}/print`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.text())
      .then((html) => {
        w.document.open();
        w.document.write(html);
        w.document.close();
      });
  }

  async function del(id) {
    if (!confirm('Wirklich löschen?')) return;
    try {
      await api.del(`/documents/${id}`);
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function markPaid(id, gross) {
    await api.put(`/documents/${id}`, {
      status: 'bezahlt',
      paid_amount: gross,
      payment_date: new Date().toISOString().slice(0, 10),
    });
    load();
  }

  async function storno(id) {
    if (!confirm('Rechnung stornieren? Es wird automatisch eine Stornorechnung erstellt.')) return;
    await api.post(`/documents/${id}/storno`);
    load();
  }

  async function convert(id) {
    if (!confirm('Angebot in Rechnung umwandeln?')) return;
    await api.post(`/documents/${id}/convert-to-invoice`);
    load();
  }

  // Summen in aktueller Ansicht
  const totals = rows.reduce(
    (acc, r) => {
      acc.count++;
      acc.gross += r.total_gross || 0;
      if (r.status === 'offen' || r.status === 'teilweise_bezahlt') {
        acc.open_gross += (r.total_gross || 0) - (r.paid_amount || 0);
        acc.open_count++;
      }
      return acc;
    },
    { count: 0, gross: 0, open_gross: 0, open_count: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dokumente</h1>
          <p className="text-slate-500 text-sm">Angebote, Rechnungen, Stornos und Gutschriften.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setCreating({ type: 'angebot' })}>
              + Angebot
            </button>
            <button className="btn-primary" onClick={() => setCreating({ type: 'rechnung' })}>
              + Rechnung
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Gefiltert" value={totals.count} />
        <Kpi label="Gesamt brutto" value={formatCurrency(totals.gross)} />
        <Kpi label="Offene Posten" value={formatCurrency(totals.open_gross)} color="text-amber-700" />
        <Kpi label="Offene Rechnungen" value={totals.open_count} color="text-amber-700" />
      </div>

      {/* Filter */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <input
          className="input text-sm flex-1 min-w-[180px]"
          placeholder="Nummer oder Kunde suchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input text-sm w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Alle Typen</option>
          <option value="angebot">Angebote</option>
          <option value="rechnung">Rechnungen</option>
          <option value="storno">Stornos</option>
          <option value="gutschrift">Gutschriften</option>
        </select>
        <select className="input text-sm w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Alle Status</option>
          <option value="entwurf">Entwurf</option>
          <option value="offen">Offen</option>
          <option value="teilweise_bezahlt">Teilweise bezahlt</option>
          <option value="bezahlt">Bezahlt</option>
          <option value="storniert">Storniert</option>
          <option value="angenommen">Angenommen</option>
          <option value="abgelehnt">Abgelehnt</option>
        </select>
      </div>

      {/* Tabelle */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nummer</th>
              <th className="text-left px-4 py-2">Typ</th>
              <th className="text-left px-4 py-2">Datum</th>
              <th className="text-left px-4 py-2">Kunde</th>
              <th className="text-left px-4 py-2">Fahrzeug</th>
              <th className="text-right px-4 py-2">Brutto</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">
                  <button className="hover:underline" onClick={() => setCreating({ id: r.id })}>
                    {r.doc_number}
                  </button>
                </td>
                <td className="px-4 py-2">{TYPE_LABELS[r.type]}</td>
                <td className="px-4 py-2 text-slate-600">{r.issue_date}</td>
                <td className="px-4 py-2">{r.first_name} {r.last_name}</td>
                <td className="px-4 py-2 text-slate-500 text-xs">{r.license_plate || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.total_gross)}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[r.status] || 'bg-slate-100'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs" onClick={() => printDoc(r.id)} title="Drucken">🖨️</button>
                  {isAdmin && r.type === 'rechnung' && r.status === 'offen' && (
                    <button className="btn-ghost text-xs text-emerald-700" onClick={() => markPaid(r.id, r.total_gross)}>
                      ✓ Bezahlt
                    </button>
                  )}
                  {isAdmin && r.type === 'rechnung' && r.status !== 'storniert' && (
                    <button className="btn-ghost text-xs text-rose-700" onClick={() => storno(r.id)}>
                      Storno
                    </button>
                  )}
                  {isAdmin && r.type === 'angebot' && (
                    <button className="btn-ghost text-xs text-blue-700" onClick={() => convert(r.id)}>
                      → Rechnung
                    </button>
                  )}
                  {isAdmin && r.type !== 'rechnung' && (
                    <button className="btn-ghost text-xs text-rose-700" onClick={() => del(r.id)}>🗑</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-500">Keine Dokumente gefunden.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <DocumentEditor
          initial={creating}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); load(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color || ''}`}>{value}</div>
    </div>
  );
}
