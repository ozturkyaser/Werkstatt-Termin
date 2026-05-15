import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { api, STATUS_LABELS, formatCurrency } from '../lib/api';
import UtilizationPanel from '../components/UtilizationPanel';

const REFRESH_MS = 30_000;

export default function Dashboard() {
  const [tab, setTab] = useState('live');
  const [live, setLive] = useState(null);
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [statsDays, setStatsDays] = useState(30);
  const [loadingLive, setLoadingLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [now, setNow] = useState(new Date());
  const refreshRef = useRef(null);

  const loadLive = useCallback(async () => {
    setLoadingLive(true);
    try {
      const [l, p] = await Promise.all([
        api.get('/dashboard/live'),
        api.get('/appointments/pending/list').catch(() => []),
      ]);
      setLive(l);
      setPending(p);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLive(false);
    }
  }, []);

  const loadStats = useCallback(async (days) => {
    try {
      const s = await api.get(`/dashboard/stats?days=${days}`);
      setStats(s);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadLive();
    loadStats(statsDays);
  }, [loadLive, loadStats, statsDays]);

  // Auto-Refresh im Live-Tab + Uhr tickt jede Sekunde
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (tab === 'live') {
      refreshRef.current = setInterval(loadLive, REFRESH_MS);
    }
    return () => refreshRef.current && clearInterval(refreshRef.current);
  }, [tab, loadLive]);

  async function setStatus(id, status) {
    await api.patch(`/appointments/${id}/status`, { status });
    loadLive();
  }

  async function confirmPending(id) {
    await api.patch(`/appointments/${id}/confirm`);
    setPending((p) => p.filter((x) => x.id !== id));
    loadLive();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Werkstatt-Cockpit</h1>
          <p className="text-slate-500">
            {format(now, "EEEE, d. MMMM yyyy 'um' HH:mm:ss 'Uhr'", { locale: de })}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'live' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => setTab('live')}
            >
              Live-Betrieb
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'utilization' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => setTab('utilization')}
            >
              Auslastung
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'stats' ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}
              onClick={() => setTab('stats')}
            >
              Statistik
            </button>
          </div>
          {tab === 'live' && (
            <button
              className="btn-ghost text-sm"
              onClick={loadLive}
              disabled={loadingLive}
              title="Jetzt aktualisieren"
            >
              {loadingLive ? 'Lädt…' : '↻ Aktualisieren'}
            </button>
          )}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card p-5 border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-amber-900">
              ⏳ {pending.length} Online-Buchung{pending.length === 1 ? '' : 'en'} wartet auf Bestätigung
            </h2>
          </div>
          <div className="divide-y divide-amber-200">
            {pending.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">
                    {a.first_name} {a.last_name}
                    <span className="text-slate-500 font-normal ml-2">
                      · {a.license_plate} · {format(parseISO(a.start_time), "EEE d. MMM HH:mm", { locale: de })}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Quelle: {a.source} · {a.phone || a.email || '—'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/termine/${a.id}`} className="btn-ghost text-xs">Details</Link>
                  <button className="btn-primary text-xs" onClick={() => confirmPending(a.id)}>Bestätigen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'live' && (
        <LiveView live={live} now={now} onStatus={setStatus} lastUpdate={lastUpdate} />
      )}
      {tab === 'utilization' && <UtilizationPanel />}
      {tab === 'stats' && (
        <StatsView stats={stats} days={statsDays} onDaysChange={setStatsDays} />
      )}
    </div>
  );
}

// ==================== LIVE-VIEW ====================

function LiveView({ live, now, onStatus, lastUpdate }) {
  if (!live) return <div className="card p-8 text-center text-slate-500">Lädt Live-Daten…</div>;

  const kpis = live.today;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Heute gesamt" value={kpis.total} color="slate" />
        <KPI label="In Arbeit" value={kpis.in_progress} color="blue" />
        <KPI label="Geplant / Offen" value={kpis.upcoming} color="amber" />
        <KPI label="Abgeschlossen" value={kpis.done} color="emerald" />
        <KPI label="Umsatz geplant" value={formatCurrency(kpis.revenue_planned)} color="violet" small />
      </div>

      <div>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-lg font-semibold">Bühnen & Warteschlange</h2>
          {lastUpdate && (
            <div className="text-xs text-slate-400">
              Stand: {format(lastUpdate, 'HH:mm:ss')} · auto-refresh alle 30s
            </div>
          )}
        </div>
        {live.bays.length === 0 ? (
          <div className="card p-6 text-center text-slate-500">
            Keine Bühnen angelegt.{' '}
            <Link to="/buehnen" className="text-primary-700 underline">Jetzt einrichten</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {live.bays.map((b) => (
              <BayCard key={b.bay_id || b.id || 'none'} bay={b} now={now} onStatus={onStatus} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Mitarbeiter heute</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Mitarbeiter</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Aktueller Auftrag</th>
                <th className="text-right px-4 py-2">Offen</th>
                <th className="text-right px-4 py-2">Fertig</th>
                <th className="text-right px-4 py-2">Heute gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {live.employees.length === 0 && (
                <tr><td colSpan={6} className="text-center py-6 text-slate-500">Keine Mitarbeiter hinterlegt.</td></tr>
              )}
              {live.employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  <td className="px-4 py-2">
                    <EmployeeBadge status={e.status} reason={e.status_reason} />
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {e.current_appointment_id ? (
                      <Link to={`/termine/${e.current_appointment_id}`} className="text-primary-700 hover:underline">
                        {e.current_customer} · {e.current_vehicle}
                      </Link>
                    ) : e.next_at ? (
                      <span className="text-slate-400">Nächster um {format(parseISO(e.next_at), 'HH:mm')}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{e.total_today - e.done_today - e.in_progress}</td>
                  <td className="px-4 py-2 text-right">{e.done_today}</td>
                  <td className="px-4 py-2 text-right font-semibold">{e.total_today}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function BayCard({ bay, now, onStatus }) {
  const cur = bay.current;
  const isBusy = !!cur;

  // Restzeit berechnen
  let remainText = null;
  let progress = 0;
  if (cur) {
    const start = cur.actual_start_time ? parseISO(cur.actual_start_time) : parseISO(cur.start_time);
    const plannedEnd = parseISO(cur.end_time);
    const plannedMin = Math.max(1, differenceInMinutes(plannedEnd, parseISO(cur.start_time)));
    const elapsedMin = Math.max(0, differenceInMinutes(now, start));
    progress = Math.min(100, Math.round((elapsedMin / plannedMin) * 100));
    const remain = differenceInMinutes(plannedEnd, now);
    remainText = remain >= 0 ? `noch ca. ${remain} Min.` : `${Math.abs(remain)} Min. überzogen`;
  }

  return (
    <div className={`card p-4 ${isBusy ? 'border-blue-300' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold">{bay.name}</div>
          <div className="text-xs text-slate-400">{typeLabel(bay.type)}</div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isBusy ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {isBusy ? 'Belegt' : 'Frei'}
        </span>
      </div>

      {cur ? (
        <div className="space-y-2 mb-3">
          <Link to={`/termine/${cur.id}`} className="block hover:bg-slate-50 -mx-1 p-1 rounded">
            <div className="font-medium">
              {cur.customer}
              <span className="text-slate-400 font-normal ml-2">
                {cur.vehicle} · {cur.license_plate}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {cur.services.join(' · ') || 'Ohne Leistung'}
              {cur.employee && <> · 👤 {cur.employee}</>}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {format(parseISO(cur.start_time), 'HH:mm')} – {format(parseISO(cur.end_time), 'HH:mm')}
              {remainText && <span className="ml-2 font-medium text-blue-700">{remainText}</span>}
            </div>
          </Link>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${progress > 100 ? 'bg-rose-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs flex-1" onClick={() => onStatus(cur.id, 'abgeschlossen')}>
              ✓ Fertig
            </button>
            <Link to={`/termine/${cur.id}`} className="btn-ghost text-xs">
              Details
            </Link>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-400 italic mb-3">Keine Arbeit aktiv.</div>
      )}

      <div className="border-t pt-3">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
          Warteschlange ({bay.queue?.length || 0})
          {bay.done > 0 && <span className="ml-2 text-emerald-600">· {bay.done} fertig</span>}
        </div>
        {!bay.queue?.length ? (
          <div className="text-xs text-slate-400">Keine weiteren Termine heute.</div>
        ) : (
          <ul className="space-y-1">
            {bay.queue.slice(0, 4).map((q) => (
              <li key={q.id} className="flex items-center justify-between text-sm">
                <Link to={`/termine/${q.id}`} className="flex-1 truncate hover:underline">
                  <span className="tabular-nums text-slate-500 mr-2">
                    {format(parseISO(q.start_time), 'HH:mm')}
                  </span>
                  <span className="font-medium">{q.customer}</span>
                  <span className="text-slate-400"> · {q.license_plate}</span>
                </Link>
                <button
                  className="btn-ghost text-xs ml-2"
                  onClick={() => onStatus(q.id, 'in_arbeit')}
                  title="Jetzt starten"
                >
                  ▶ Start
                </button>
              </li>
            ))}
            {bay.queue.length > 4 && (
              <li className="text-xs text-slate-400">+ {bay.queue.length - 4} weitere…</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmployeeBadge({ status, reason }) {
  const map = {
    arbeit: 'bg-blue-100 text-blue-800',
    wartet: 'bg-amber-100 text-amber-800',
    frei: 'bg-emerald-100 text-emerald-800',
    abwesend: 'bg-rose-100 text-rose-800',
    nicht_geplant: 'bg-slate-100 text-slate-600',
  };
  const labels = {
    arbeit: 'Arbeitet',
    wartet: 'Wartet',
    frei: 'Frei',
    abwesend: 'Abwesend',
    nicht_geplant: 'Nicht im Dienst',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-slate-100'}`} title={reason || ''}>
      {labels[status] || status}
    </span>
  );
}

function KPI({ label, value, color = 'slate', small = false }) {
  const colors = {
    slate: 'text-slate-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
    violet: 'text-violet-700',
    rose: 'text-rose-700',
  };
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase">{label}</div>
      <div className={`${small ? 'text-xl' : 'text-3xl'} font-bold mt-1 ${colors[color]}`}>{value}</div>
    </div>
  );
}

function typeLabel(t) {
  return (
    {
      hebebuehne: 'Hebebühne',
      ev_hebebuehne: 'E-Hebebühne',
      platz: 'Arbeitsplatz',
      spezial: 'Spezial',
    }[t] || t
  );
}

// ==================== STATS-VIEW ====================

function StatsView({ stats, days, onDaysChange }) {
  if (!stats) return <div className="card p-8 text-center text-slate-500">Lädt Statistiken…</div>;

  const deltaColor =
    stats.avg_delta_minutes > 5 ? 'text-rose-700' : stats.avg_delta_minutes < -5 ? 'text-emerald-700' : 'text-slate-700';

  const maxPerDay = Math.max(1, ...stats.per_day.map((d) => d.completed));

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Auswertung letzte {days} Tage</h2>
        <select
          className="input text-sm w-auto"
          value={days}
          onChange={(e) => onDaysChange(Number(e.target.value))}
        >
          <option value={7}>7 Tage</option>
          <option value={30}>30 Tage</option>
          <option value={90}>90 Tage</option>
          <option value={180}>180 Tage</option>
          <option value={365}>1 Jahr</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Abgeschlossen" value={stats.completed_total} color="emerald" />
        <KPI label="Umsatz" value={formatCurrency(stats.revenue_total)} color="violet" small />
        <KPI
          label="Ø Plandauer"
          value={stats.avg_planned_minutes ? `${stats.avg_planned_minutes} Min.` : '—'}
          color="slate"
          small
        />
        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase">Ø Ist-Dauer</div>
          <div className={`text-xl font-bold mt-1 ${deltaColor}`}>
            {stats.avg_actual_minutes ? `${stats.avg_actual_minutes} Min.` : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {stats.tracked_count > 0
              ? `${stats.avg_delta_minutes > 0 ? '+' : ''}${stats.avg_delta_minutes} Min. vs. Plan (${stats.tracked_count} getrackt)`
              : 'Noch keine Ist-Zeiten vorhanden'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Bühnen-Auslastung</h3>
          {stats.bay_usage.length === 0 ? (
            <div className="text-sm text-slate-500">Keine Bühnen-Daten vorhanden.</div>
          ) : (
            <ul className="space-y-2">
              {stats.bay_usage.map((b) => {
                const max = Math.max(1, ...stats.bay_usage.map((x) => x.total_hours));
                const pct = Math.round((b.total_hours / max) * 100);
                return (
                  <li key={b.bay_id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-slate-500">
                        {b.completed} Aufträge · {b.total_hours} h
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-3">Mitarbeiter-Leistung</h3>
          {stats.employees.length === 0 ? (
            <div className="text-sm text-slate-500">Noch keine abgeschlossenen Aufträge.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left py-1">Mitarbeiter</th>
                  <th className="text-right py-1">Fertig</th>
                  <th className="text-right py-1">Ø Dauer</th>
                  <th className="text-right py-1">Umsatz</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.employees.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5 font-medium">{e.name}</td>
                    <td className="py-1.5 text-right">{e.completed}</td>
                    <td className="py-1.5 text-right">{e.avg_minutes} Min.</td>
                    <td className="py-1.5 text-right">{formatCurrency(e.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">Abgeschlossene Aufträge pro Tag</h3>
        {stats.per_day.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Daten.</div>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {stats.per_day.map((d) => {
              const h = Math.max(4, Math.round((d.completed / maxPerDay) * 100));
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-primary-500 hover:bg-primary-600 rounded-t transition-all"
                    style={{ height: `${h}%` }}
                    title={`${d.day}: ${d.completed} Aufträge · ${formatCurrency(d.revenue || 0)}`}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between mt-2 text-[10px] text-slate-400">
          {stats.per_day.length > 0 && (
            <>
              <span>{stats.per_day[0].day}</span>
              <span>{stats.per_day[stats.per_day.length - 1].day}</span>
            </>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">Top-Leistungen</h3>
        {stats.top_services.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Daten.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Leistung</th>
                <th className="text-left py-1">Kategorie</th>
                <th className="text-right py-1">Anzahl</th>
                <th className="text-right py-1">Ø Plandauer</th>
                <th className="text-right py-1">Umsatz</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.top_services.map((s, i) => (
                <tr key={i}>
                  <td className="py-1.5 font-medium">{s.name}</td>
                  <td className="py-1.5 text-slate-500">{s.category || '—'}</td>
                  <td className="py-1.5 text-right">{s.count}</td>
                  <td className="py-1.5 text-right">{s.avg_planned_minutes} Min.</td>
                  <td className="py-1.5 text-right">{formatCurrency(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">Status-Verteilung</h3>
        <div className="flex flex-wrap gap-2">
          {stats.status_distribution.length === 0 && (
            <span className="text-sm text-slate-500">Keine Termine im Zeitraum.</span>
          )}
          {stats.status_distribution.map((s) => (
            <span key={s.status} className={`badge-${s.status}`}>
              {STATUS_LABELS[s.status] || s.status}: {s.c}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
