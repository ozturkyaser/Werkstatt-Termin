import { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import Modal from '../components/Modal';
import { api, formatCurrency } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function Accounting() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('overview');
  const [year, setYear] = useState(new Date().getFullYear());
  const [overview, setOverview] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [datevOpen, setDatevOpen] = useState(false);

  const loadOverview = useCallback(() => {
    api.get(`/expenses/stats/overview?year=${year}`).then(setOverview);
  }, [year]);

  const loadExpenses = useCallback(() => {
    const p = new URLSearchParams();
    if (filterFrom) p.set('from', filterFrom);
    if (filterTo) p.set('to', filterTo);
    if (filterCat) p.set('category_id', filterCat);
    if (q) p.set('q', q);
    api.get(`/expenses?${p.toString()}`).then(setExpenses);
  }, [filterFrom, filterTo, filterCat, q]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => {
    api.get('/expenses/categories').then(setCategories);
  }, []);

  function downloadCsv() {
    const token = localStorage.getItem('werkstatt_token');
    fetch(`/api/expenses/export/csv?year=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ausgaben-${year}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function del(id) {
    if (!confirm('Wirklich löschen?')) return;
    await api.del(`/expenses/${id}`);
    loadExpenses();
    loadOverview();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Buchhaltung</h1>
          <p className="text-slate-500 text-sm">Einnahmen, Ausgaben und Auswertungen.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'overview' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => setTab('overview')}
            >
              Übersicht
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'expenses' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => setTab('expenses')}
            >
              Ausgaben
            </button>
          </div>
          <select
            className="input text-sm w-auto"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[0, 1, 2].map((d) => {
              const y = new Date().getFullYear() - d;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          {isAdmin && (
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setDatevOpen(true)}
              title="Buchungsstapel für DATEV exportieren"
            >
              🧾 DATEV-Export
            </button>
          )}
        </div>
      </div>

      {tab === 'overview' && <Overview overview={overview} />}
      {tab === 'expenses' && (
        <ExpensesList
          expenses={expenses}
          categories={categories}
          isAdmin={isAdmin}
          q={q} setQ={setQ}
          filterFrom={filterFrom} setFilterFrom={setFilterFrom}
          filterTo={filterTo} setFilterTo={setFilterTo}
          filterCat={filterCat} setFilterCat={setFilterCat}
          onNew={() => setEditing({})}
          onEdit={(e) => setEditing(e)}
          onDelete={del}
          onExport={downloadCsv}
        />
      )}

      {datevOpen && isAdmin && (
        <DatevExportDialog year={year} onClose={() => setDatevOpen(false)} />
      )}

      {editing && isAdmin && (
        <ExpenseEditor
          initial={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadExpenses();
            loadOverview();
          }}
        />
      )}
    </div>
  );
}

// ========== Übersicht ==========

function Overview({ overview }) {
  if (!overview) return <div className="card p-8 text-center text-slate-500">Lädt…</div>;

  const monthRows = MONTHS_SHORT.map((name, idx) => {
    const month = `${overview.year}-${String(idx + 1).padStart(2, '0')}`;
    const inc = overview.income_months.find((r) => r.month === month);
    const exp = overview.expense_months.find((r) => r.month === month);
    return {
      name,
      Einnahmen: round(inc?.gross || 0),
      Ausgaben: round(exp?.gross || 0),
      Gewinn: round((inc?.gross || 0) - (exp?.gross || 0)),
    };
  });

  const totals = overview.totals;
  const pieData = (overview.by_category || []).map((c) => ({
    name: c.name || 'Ohne',
    value: round(c.gross),
    color: c.color || '#64748b',
  }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Einnahmen (brutto)" value={formatCurrency(totals.income.gross)} color="text-emerald-700" />
        <Kpi label="Ausgaben (brutto)" value={formatCurrency(totals.expenses.gross)} color="text-rose-700" />
        <Kpi
          label="Gewinn (netto)"
          value={formatCurrency(totals.profit_net)}
          color={totals.profit_net >= 0 ? 'text-emerald-700' : 'text-rose-700'}
        />
        <Kpi
          label="Offene Rechnungen"
          value={formatCurrency(overview.open_invoices.open_gross)}
          sub={`${overview.open_invoices.open_count} Posten`}
          color="text-amber-700"
        />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Einnahmen vs. Ausgaben pro Monat</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit=" €" />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="Einnahmen" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Ausgaben" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Ausgaben nach Kategorie</h3>
          {pieData.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Noch keine Ausgaben.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={(p) => `${p.name} (${Math.round((p.value / pieData.reduce((s, x) => s + x.value, 0)) * 100)}%)`}
                  labelLine={false}
                >
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Monatsdetails</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Monat</th>
                <th className="text-right py-1">Einnahmen</th>
                <th className="text-right py-1">Ausgaben</th>
                <th className="text-right py-1">Gewinn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthRows.map((r) => (
                <tr key={r.name}>
                  <td className="py-1.5 font-medium">{r.name}</td>
                  <td className="py-1.5 text-right text-emerald-700 tabular-nums">{formatCurrency(r.Einnahmen)}</td>
                  <td className="py-1.5 text-right text-rose-700 tabular-nums">{formatCurrency(r.Ausgaben)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${r.Gewinn >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(r.Gewinn)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2">
              <tr>
                <td className="py-2 font-semibold">Gesamt</td>
                <td className="py-2 text-right text-emerald-700 font-bold tabular-nums">{formatCurrency(monthRows.reduce((s, r) => s + r.Einnahmen, 0))}</td>
                <td className="py-2 text-right text-rose-700 font-bold tabular-nums">{formatCurrency(monthRows.reduce((s, r) => s + r.Ausgaben, 0))}</td>
                <td className="py-2 text-right font-bold tabular-nums">{formatCurrency(monthRows.reduce((s, r) => s + r.Gewinn, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

// ========== Ausgabenliste ==========

function ExpensesList({
  expenses, categories, isAdmin,
  q, setQ, filterFrom, setFilterFrom, filterTo, setFilterTo, filterCat, setFilterCat,
  onNew, onEdit, onDelete, onExport,
}) {
  const total = expenses.reduce((s, e) => s + (e.amount_gross || 0), 0);
  return (
    <>
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <input className="input text-sm flex-1 min-w-[160px]" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input type="date" className="input text-sm w-auto" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        <span className="text-slate-400 text-sm">bis</span>
        <input type="date" className="input text-sm w-auto" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        <select className="input text-sm w-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn-ghost text-sm" onClick={onExport}>⬇ CSV</button>
        {isAdmin && (
          <button className="btn-primary text-sm" onClick={onNew}>+ Ausgabe</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Datum</th>
              <th className="text-left px-4 py-2">Kategorie</th>
              <th className="text-left px-4 py-2">Lieferant</th>
              <th className="text-left px-4 py-2">Beschreibung</th>
              <th className="text-right px-4 py-2">Netto</th>
              <th className="text-right px-4 py-2">MwSt</th>
              <th className="text-right px-4 py-2">Brutto</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">{e.expense_date}</td>
                <td className="px-4 py-2">
                  {e.category_name && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: (e.category_color || '#64748b') + '22', color: e.category_color || '#64748b' }}
                    >
                      {e.category_name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{e.vendor || '—'}</td>
                <td className="px-4 py-2">{e.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(e.amount_net)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">{formatCurrency(e.tax_amount)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatCurrency(e.amount_gross)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {isAdmin && (
                    <>
                      <button className="btn-ghost text-xs" onClick={() => onEdit(e)}>✏️</button>
                      <button className="btn-ghost text-xs text-rose-700" onClick={() => onDelete(e.id)}>🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">Keine Ausgaben im Filter.</td></tr>
            )}
          </tbody>
          {expenses.length > 0 && (
            <tfoot className="border-t-2 bg-slate-50">
              <tr>
                <td colSpan={6} className="px-4 py-2 font-semibold text-right">Summe:</td>
                <td className="px-4 py-2 text-right font-bold tabular-nums">{formatCurrency(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

// ========== Editor ==========

function ExpenseEditor({ initial, categories, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [f, setF] = useState(
    isEdit
      ? { ...initial }
      : {
          expense_date: new Date().toISOString().slice(0, 10),
          category_id: null,
          vendor: '',
          description: '',
          amount_net: 0,
          tax_rate: 19,
          payment_method: 'ueberweisung',
          invoice_number: '',
          notes: '',
        }
  );
  const [saving, setSaving] = useState(false);

  const net = Number(f.amount_net) || 0;
  const rate = Number(f.tax_rate) || 0;
  const gross = round(net * (1 + rate / 100));

  async function save() {
    if (!f.description) return alert('Beschreibung fehlt');
    if (!f.expense_date) return alert('Datum fehlt');
    setSaving(true);
    try {
      const body = {
        expense_date: f.expense_date,
        category_id: f.category_id ? Number(f.category_id) : null,
        vendor: f.vendor || null,
        description: f.description,
        amount_net: Number(f.amount_net) || 0,
        tax_rate: Number(f.tax_rate) || 0,
        payment_method: f.payment_method,
        invoice_number: f.invoice_number || null,
        notes: f.notes || null,
      };
      if (isEdit) await api.put(`/expenses/${initial.id}`, body);
      else await api.post('/expenses', body);
      onSaved();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={isEdit ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">Datum *</label>
            <input
              type="date"
              className="input text-sm w-full"
              value={f.expense_date}
              onChange={(e) => setF({ ...f, expense_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">Kategorie</label>
            <select
              className="input text-sm w-full"
              value={f.category_id || ''}
              onChange={(e) => setF({ ...f, category_id: e.target.value || null })}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs uppercase font-semibold text-slate-500">Lieferant</label>
          <input
            className="input text-sm w-full"
            value={f.vendor || ''}
            onChange={(e) => setF({ ...f, vendor: e.target.value })}
            placeholder="z.B. ATU"
          />
        </div>
        <div>
          <label className="text-xs uppercase font-semibold text-slate-500">Beschreibung *</label>
          <input
            className="input text-sm w-full"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder="z.B. Bremsbeläge VW Golf"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">Netto</label>
            <input
              type="number"
              step="0.01"
              className="input text-sm w-full text-right"
              value={f.amount_net}
              onChange={(e) => setF({ ...f, amount_net: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">MwSt. %</label>
            <input
              type="number"
              step="0.1"
              className="input text-sm w-full text-right"
              value={f.tax_rate}
              onChange={(e) => setF({ ...f, tax_rate: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">Brutto</label>
            <div className="input text-sm w-full text-right bg-slate-50 font-medium">{formatCurrency(gross)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">Zahlart</label>
            <select
              className="input text-sm w-full"
              value={f.payment_method}
              onChange={(e) => setF({ ...f, payment_method: e.target.value })}
            >
              <option value="ueberweisung">Überweisung</option>
              <option value="bar">Bar</option>
              <option value="karte">Karte</option>
              <option value="paypal">PayPal</option>
              <option value="lastschrift">Lastschrift</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase font-semibold text-slate-500">Rechnungsnr.</label>
            <input
              className="input text-sm w-full"
              value={f.invoice_number || ''}
              onChange={(e) => setF({ ...f, invoice_number: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase font-semibold text-slate-500">Notiz</label>
          <textarea
            className="input text-sm w-full h-20"
            value={f.notes || ''}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Speichert…' : isEdit ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color || ''}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------------- DATEV-Export-Dialog ----------------

function DatevExportDialog({ year, onClose }) {
  const [config, setConfig] = useState(null);
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [what, setWhat] = useState('all');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get('/datev/config').then(setConfig).catch(() => setConfig({}));
  }, []);

  const ready = config?.beraternummer && config?.mandantennummer;

  function setQuickRange(kind) {
    const y = new Date(from).getFullYear() || year;
    if (kind === 'year') { setFrom(`${y}-01-01`); setTo(`${y}-12-31`); }
    if (kind === 'q1') { setFrom(`${y}-01-01`); setTo(`${y}-03-31`); }
    if (kind === 'q2') { setFrom(`${y}-04-01`); setTo(`${y}-06-30`); }
    if (kind === 'q3') { setFrom(`${y}-07-01`); setTo(`${y}-09-30`); }
    if (kind === 'q4') { setFrom(`${y}-10-01`); setTo(`${y}-12-31`); }
    if (kind === 'last-month') {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      const yr = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0');
      const last = new Date(yr, d.getMonth() + 1, 0).getDate();
      setFrom(`${yr}-${m}-01`); setTo(`${yr}-${m}-${last}`);
    }
  }

  async function doPreview() {
    setLoading(true); setMsg(null);
    try {
      const res = await api.post('/datev/preview', { from, to, what });
      setPreview(res);
    } catch (e) { setMsg({ type: 'err', text: e.message || 'Fehler' }); }
    finally { setLoading(false); }
  }

  async function doExport() {
    setLoading(true); setMsg(null);
    try {
      const token = localStorage.getItem('werkstatt_token');
      const r = await fetch('/api/datev/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ from, to, what }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Export fehlgeschlagen');
      }
      const stats = safeParseHeader(r.headers.get('X-Datev-Stats'));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EXTF_Buchungsstapel_${from.replace(/-/g,'')}-${to.replace(/-/g,'')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: 'ok', text: `Exportiert: ${stats?.lines || 0} Buchungen` });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setLoading(false); }
  }

  return (
    <Modal open onClose={onClose} title="🧾 DATEV-Export – Buchungsstapel">
      <div className="space-y-5">
        {!ready && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded p-3">
            ⚠️ Bitte zuerst unter <strong>Einstellungen → DATEV</strong> die Berater- und Mandantennummer hinterlegen.
          </div>
        )}

        <div className="text-sm text-slate-600">
          Kontenrahmen: <strong>{(config?.kontenrahmen || 'skr03').toUpperCase()}</strong>
          {' · '}Kodierung: <strong>{config?.encoding === 'utf8' ? 'UTF-8' : 'ANSI (CP1252)'}</strong>
          {' · '}Mandant: <strong>{config?.mandantennummer || '—'}</strong>
        </div>

        {/* Zeitraum */}
        <div>
          <label className="label">Zeitraum</label>
          <div className="flex gap-2 mb-2 flex-wrap">
            <QuickBtn onClick={() => setQuickRange('year')}>Gesamtes Jahr</QuickBtn>
            <QuickBtn onClick={() => setQuickRange('q1')}>Q1</QuickBtn>
            <QuickBtn onClick={() => setQuickRange('q2')}>Q2</QuickBtn>
            <QuickBtn onClick={() => setQuickRange('q3')}>Q3</QuickBtn>
            <QuickBtn onClick={() => setQuickRange('q4')}>Q4</QuickBtn>
            <QuickBtn onClick={() => setQuickRange('last-month')}>Letzter Monat</QuickBtn>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {/* Inhalt */}
        <div>
          <label className="label">Enthaltene Buchungen</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all', label: 'Alles (Einnahmen + Ausgaben)' },
              { id: 'income', label: 'Nur Einnahmen (Rechnungen)' },
              { id: 'expenses', label: 'Nur Ausgaben' },
            ].map((o) => (
              <button key={o.id} type="button"
                className={`px-3 py-1.5 text-sm rounded border ${
                  what === o.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300 text-slate-700'
                }`}
                onClick={() => setWhat(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={doPreview} disabled={loading || !ready}>
            {loading ? 'Lädt…' : '👁 Vorschau'}
          </button>
          <button className="btn-primary" onClick={doExport} disabled={loading || !ready}>
            {loading ? 'Exportiere…' : '⬇ Exportieren'}
          </button>
        </div>

        {preview && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between p-3 bg-slate-50 border-b text-sm">
              <span><strong>{preview.count}</strong> Buchungen</span>
              <span>Summe: <strong>{formatCurrency(preview.sum || 0)}</strong></span>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-500">
                    <th className="p-2">Datum</th>
                    <th className="p-2">Beleg</th>
                    <th className="p-2">Konto</th>
                    <th className="p-2">Gegen</th>
                    <th className="p-2 text-right">Betrag</th>
                    <th className="p-2">S/H</th>
                    <th className="p-2">Text</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 whitespace-nowrap">{r.date}</td>
                      <td className="p-2 font-mono">{r.beleg}</td>
                      <td className="p-2 font-mono">{r.konto}</td>
                      <td className="p-2 font-mono">{r.gegenkonto}</td>
                      <td className="p-2 text-right">{formatCurrency(r.amount)}</td>
                      <td className="p-2">{r.sh}</td>
                      <td className="p-2 truncate max-w-[200px]">{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {msg && (
          <div className={`text-sm rounded-lg px-3 py-2 border ${
            msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>{msg.text}</div>
        )}

        <div className="text-xs text-slate-500 border-t pt-3">
          Das Format ist <strong>EXTF-Buchungsstapel Version 7.00</strong> – direkt importierbar in DATEV Rechnungswesen
          und DATEV Unternehmen online.
        </div>
      </div>
    </Modal>
  );
}

function QuickBtn({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1 text-xs rounded border bg-white hover:bg-slate-50 text-slate-700">
      {children}
    </button>
  );
}

function safeParseHeader(h) {
  try { return h ? JSON.parse(h) : null; } catch { return null; }
}
