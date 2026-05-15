import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  Cell,
} from 'recharts';
import { api } from '../lib/api';

const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function UtilizationPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState('bays'); // 'bays' | 'employees'
  const [selectedId, setSelectedId] = useState(null); // für Detail-Verlauf

  useEffect(() => {
    setLoading(true);
    api
      .get(`/dashboard/utilization?days=${days}`)
      .then((d) => {
        setData(d);
        setSelectedId(null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const resources = data ? (mode === 'bays' ? data.bays : data.employees) : [];

  const barData = useMemo(
    () =>
      resources.map((r) => ({
        name: r.name,
        pct: r.utilization_pct,
        used_h: Math.round((r.used_minutes / 60) * 10) / 10,
        avail_h: Math.round((r.available_minutes / 60) * 10) / 10,
        appointments: r.appointments,
        id: r.id,
      })),
    [resources]
  );

  // Farbe nach Auslastung (ampelartig)
  function barColor(pct) {
    if (pct >= 85) return '#dc2626'; // rot – überlastet
    if (pct >= 65) return '#f59e0b'; // amber – gut ausgelastet
    if (pct >= 35) return '#10b981'; // grün – gesund
    return '#94a3b8'; // slate – unterausgelastet
  }

  const selected = selectedId ? resources.find((r) => r.id === selectedId) : null;

  // Daten für Tagesverlauf
  const dailySeries = useMemo(() => {
    if (selected) return selected.daily;
    return data?.daily_totals || [];
  }, [selected, data]);

  const dailyForChart = dailySeries.map((d) => ({
    day: d.date.slice(5), // MM-DD
    Auslastung: d.pct,
    genutzt: Math.round(d.used_minutes / 60 * 10) / 10,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Auslastung</h2>
          <p className="text-xs text-slate-500">
            {data ? `${data.from} bis ${data.to} · ${Math.round(data.total_open_minutes / 60)} h Werkstatt-Öffnung` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              className={`px-3 py-1 text-sm rounded-md ${mode === 'bays' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => { setMode('bays'); setSelectedId(null); }}
            >
              🏗️ Bühnen
            </button>
            <button
              className={`px-3 py-1 text-sm rounded-md ${mode === 'employees' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => { setMode('employees'); setSelectedId(null); }}
            >
              👥 Mitarbeiter
            </button>
          </div>
          <select
            className="input text-sm w-auto"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 Tage</option>
            <option value={14}>14 Tage</option>
            <option value={30}>30 Tage</option>
            <option value={60}>60 Tage</option>
            <option value={90}>90 Tage</option>
          </select>
        </div>
      </div>

      {loading && <div className="card p-6 text-center text-slate-500">Lädt Auslastung…</div>}

      {!loading && data && (
        <>
          {/* --- KPI-Zeile für schnellen Überblick --- */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniKpi
              label={mode === 'bays' ? 'Aktive Bühnen' : 'Aktive Mitarbeiter'}
              value={resources.length}
            />
            <MiniKpi
              label="Ø Auslastung"
              value={
                resources.length
                  ? Math.round(
                      (resources.reduce((s, r) => s + r.utilization_pct, 0) / resources.length) * 10
                    ) / 10 + ' %'
                  : '—'
              }
              color={avgColor(resources)}
            />
            <MiniKpi
              label="Spitzenreiter"
              value={topResource(resources)}
              sub={topPct(resources)}
            />
            <MiniKpi
              label="Untergenutzt"
              value={lowResource(resources)}
              sub={lowPct(resources)}
            />
          </div>

          {/* --- Hauptchart: Balken pro Bühne/Mitarbeiter --- */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">
                Auslastung pro {mode === 'bays' ? 'Bühne' : 'Mitarbeiter'}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ColorDot c="#94a3b8" /> &lt;35%
                <ColorDot c="#10b981" /> 35–65%
                <ColorDot c="#f59e0b" /> 65–85%
                <ColorDot c="#dc2626" /> &gt;85%
              </div>
            </div>
            {barData.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">
                Keine {mode === 'bays' ? 'Bühnen' : 'Mitarbeiter'} mit Plan hinterlegt.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 42)}>
                <BarChart data={barData} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} unit=" %" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip content={<UtilTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar
                    dataKey="pct"
                    radius={[0, 6, 6, 0]}
                    onClick={(e) => setSelectedId(e.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {barData.map((b) => (
                      <Cell key={b.id} fill={barColor(b.pct)} stroke={selectedId === b.id ? '#0f172a' : 'transparent'} strokeWidth={2} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="text-xs text-slate-400 mt-1">
              Tipp: Klicke auf einen Balken für den Tagesverlauf dieser Ressource.
            </div>
          </div>

          {/* --- Zeitreihe --- */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">
                {selected ? `Tagesverlauf: ${selected.name}` : 'Gesamt-Auslastung pro Tag'}
              </h3>
              {selected && (
                <button className="btn-ghost text-xs" onClick={() => setSelectedId(null)}>
                  ← Zurück zur Gesamtansicht
                </button>
              )}
            </div>
            {dailyForChart.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">Keine Daten.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyForChart} margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="pct" domain={[0, 100]} unit=" %" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="h" orientation="right" unit=" h" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="Auslastung"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="h"
                    type="monotone"
                    dataKey="genutzt"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* --- Heatmap Wochentag × Stunde --- */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Wann ist am meisten los?</h3>
              <div className="text-xs text-slate-500">Aufträge pro Wochentag × Stunde</div>
            </div>
            <Heatmap heatmap={data.heatmap} />
          </div>

          {/* --- Tabelle --- */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">{mode === 'bays' ? 'Bühne' : 'Mitarbeiter'}</th>
                  <th className="text-right px-4 py-2">Verfügbar</th>
                  <th className="text-right px-4 py-2">Genutzt</th>
                  <th className="text-right px-4 py-2">Aufträge</th>
                  <th className="text-right px-4 py-2">Auslastung</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resources.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${selectedId === r.id ? 'bg-primary-50' : ''}`}
                  >
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {Math.round(r.available_minutes / 60)} h
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {Math.round(r.used_minutes / 60)} h
                    </td>
                    <td className="px-4 py-2 text-right">{r.appointments}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <span
                            className="block h-full"
                            style={{
                              width: `${Math.min(100, r.utilization_pct)}%`,
                              background: barColor(r.utilization_pct),
                            }}
                          />
                        </span>
                        <span className="tabular-nums font-medium w-14 text-right">
                          {r.utilization_pct} %
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
                {resources.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-500">
                      Keine Daten.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============ Helpers ============

function MiniKpi({ label, value, sub, color }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className="text-lg font-bold mt-0.5" style={color ? { color } : {}}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function ColorDot({ c }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full ml-2 mr-1" style={{ background: c }} />;
}

function avgColor(list) {
  if (!list.length) return undefined;
  const avg = list.reduce((s, r) => s + r.utilization_pct, 0) / list.length;
  if (avg >= 85) return '#dc2626';
  if (avg >= 65) return '#d97706';
  if (avg >= 35) return '#059669';
  return '#64748b';
}
function topResource(list) {
  if (!list.length) return '—';
  const t = [...list].sort((a, b) => b.utilization_pct - a.utilization_pct)[0];
  return t.name;
}
function topPct(list) {
  if (!list.length) return '';
  const t = [...list].sort((a, b) => b.utilization_pct - a.utilization_pct)[0];
  return `${t.utilization_pct} % · ${Math.round(t.used_minutes / 60)} h`;
}
function lowResource(list) {
  const filtered = list.filter((r) => r.available_minutes > 0);
  if (!filtered.length) return '—';
  const t = [...filtered].sort((a, b) => a.utilization_pct - b.utilization_pct)[0];
  return t.name;
}
function lowPct(list) {
  const filtered = list.filter((r) => r.available_minutes > 0);
  if (!filtered.length) return '';
  const t = [...filtered].sort((a, b) => a.utilization_pct - b.utilization_pct)[0];
  return `${t.utilization_pct} % · nur ${t.appointments} Aufträge`;
}

function UtilTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border rounded-lg shadow-sm px-3 py-2 text-xs">
      <div className="font-semibold mb-0.5">{d.name}</div>
      <div>
        Auslastung: <span className="font-medium">{d.pct} %</span>
      </div>
      <div>Genutzt: {d.used_h} h / {d.avail_h} h</div>
      <div>Aufträge: {d.appointments}</div>
    </div>
  );
}

function Heatmap({ heatmap }) {
  // max Wert für Skalierung
  const max = Math.max(1, ...heatmap.flat().map((c) => c.count));
  // Stunden mit Aktivität ermitteln → nur relevantes Fenster anzeigen
  const activeHours = HOURS.filter((h) => heatmap.some((row) => row[h].count > 0));
  const minH = activeHours.length ? Math.max(6, activeHours[0] - 1) : 7;
  const maxH = activeHours.length ? Math.min(22, activeHours[activeHours.length - 1] + 1) : 19;
  const hours = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="w-8"></th>
            {hours.map((h) => (
              <th key={h} className="px-1 pb-1 font-normal text-slate-500 text-center">
                {String(h).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS_SHORT.map((wd, wdIdx) => (
            <tr key={wd}>
              <td className="pr-2 text-slate-500 font-medium">{wd}</td>
              {hours.map((h) => {
                const cell = heatmap[wdIdx][h];
                const intensity = cell.count / max;
                const bg =
                  cell.count === 0
                    ? '#f1f5f9'
                    : `rgba(37, 99, 235, ${0.15 + intensity * 0.75})`;
                return (
                  <td key={h} className="p-0.5">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center font-medium text-[10px]"
                      style={{ background: bg, color: intensity > 0.5 ? '#fff' : '#0f172a' }}
                      title={`${wd} ${String(h).padStart(2, '0')}:00 – ${cell.count} Aufträge, ${Math.round(cell.minutes)} Min.`}
                    >
                      {cell.count || ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
        <span>weniger</span>
        <div className="flex">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((i) => (
            <div
              key={i}
              className="w-5 h-3"
              style={{ background: `rgba(37, 99, 235, ${0.15 + i * 0.75})` }}
            />
          ))}
        </div>
        <span>mehr</span>
      </div>
    </div>
  );
}
