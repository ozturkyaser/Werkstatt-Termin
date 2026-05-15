import { Router } from 'express';
import dayjs from 'dayjs';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ========== /api/dashboard/live  (aktueller Betrieb) ==========

router.get('/live', (_req, res) => {
  const now = dayjs();
  const nowISO = now.format('YYYY-MM-DDTHH:mm:ss');
  const dayStart = now.startOf('day').format('YYYY-MM-DDTHH:mm:ss');
  const dayEnd = now.endOf('day').format('YYYY-MM-DDTHH:mm:ss');

  // --- Alle Bühnen mit heutigen Terminen ---
  const bays = db.prepare('SELECT * FROM bays WHERE active = 1 ORDER BY sort_order, id').all();
  const todaysAppts = db.prepare(
    `SELECT a.id, a.bay_id, a.employee_id, a.start_time, a.end_time, a.status,
            a.actual_start_time, a.actual_end_time, a.total_price,
            a.confirmation_status, a.source, a.title,
            c.first_name, c.last_name, c.phone,
            v.license_plate, v.brand, v.model,
            u.full_name AS employee_name
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN users u ON u.id = a.employee_id
     WHERE a.start_time >= ? AND a.start_time <= ?
       AND a.status != 'storniert'
     ORDER BY a.start_time`
  ).all(dayStart, dayEnd);

  // Aggregat pro Bühne: laufender Auftrag + Warteschlange
  const byBay = new Map(bays.map((b) => [b.id, { ...b, current: null, queue: [], done: 0 }]));
  const unassigned = { current: null, queue: [], done: 0, bay_id: null, name: 'Ohne Bühne' };

  for (const a of todaysAppts) {
    const target = a.bay_id ? byBay.get(a.bay_id) : unassigned;
    if (!target) continue;

    // Services dieses Termins (Namen einsammeln, kurz)
    const svcs = db.prepare(
      `SELECT s.name FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id
       WHERE asv.appointment_id = ?`
    ).all(a.id).map((x) => x.name);

    const entry = {
      id: a.id,
      start_time: a.start_time,
      end_time: a.end_time,
      actual_start_time: a.actual_start_time,
      actual_end_time: a.actual_end_time,
      status: a.status,
      confirmation_status: a.confirmation_status,
      source: a.source,
      title: a.title,
      customer: `${a.first_name} ${a.last_name}`,
      customer_phone: a.phone,
      vehicle: `${a.brand || ''} ${a.model || ''}`.trim() || '—',
      license_plate: a.license_plate,
      services: svcs,
      employee: a.employee_name || null,
      employee_id: a.employee_id,
      total_price: a.total_price,
    };

    if (a.status === 'abgeschlossen') {
      target.done += 1;
      continue;
    }
    if (a.status === 'in_arbeit') {
      target.current = entry;
      continue;
    }
    // Sonst (geplant / bestätigt) → in Queue, sortiert nach Startzeit
    target.queue.push(entry);
  }

  // --- Mitarbeiter-Status heute ---
  const employees = db.prepare(
    `SELECT id, full_name FROM users WHERE active = 1 AND role IN ('admin','mitarbeiter') ORDER BY full_name`
  ).all();

  const weekday = (now.day() + 6) % 7;
  const scheduled = new Set(
    db.prepare('SELECT employee_id FROM employee_schedules WHERE weekday = ?').all(weekday).map((r) => r.employee_id)
  );
  const absent = new Set(
    db.prepare(
      `SELECT employee_id FROM employee_absences WHERE ? BETWEEN from_date AND to_date`
    ).all(now.format('YYYY-MM-DD')).map((r) => r.employee_id)
  );

  const empStats = employees.map((e) => {
    const todaysForEmp = todaysAppts.filter((a) => a.employee_id === e.id);
    const current = todaysForEmp.find((a) => a.status === 'in_arbeit');
    const next = todaysForEmp
      .filter((a) => a.status === 'geplant' || a.status === 'bestaetigt')
      .sort((x, y) => x.start_time.localeCompare(y.start_time))[0];

    let status = 'frei';
    let statusReason = null;
    if (absent.has(e.id)) { status = 'abwesend'; statusReason = 'Abwesend'; }
    else if (!scheduled.has(e.id)) { status = 'nicht_geplant'; statusReason = 'Nicht im Dienst'; }
    else if (current) { status = 'arbeit'; statusReason = 'Arbeitet gerade'; }
    else if (next) { status = 'wartet'; statusReason = `Nächster Termin ${next.start_time.slice(11,16)}`; }

    return {
      id: e.id,
      name: e.full_name,
      status,
      status_reason: statusReason,
      current_appointment_id: current?.id || null,
      current_customer: current ? `${current.first_name} ${current.last_name}` : null,
      current_vehicle: current ? current.license_plate : null,
      next_at: next?.start_time || null,
      total_today: todaysForEmp.filter((a) => a.status !== 'storniert').length,
      done_today: todaysForEmp.filter((a) => a.status === 'abgeschlossen').length,
      in_progress: todaysForEmp.filter((a) => a.status === 'in_arbeit').length,
    };
  });

  // --- Gesamt-KPIs heute ---
  const todayTotals = {
    total: todaysAppts.length,
    done: todaysAppts.filter((a) => a.status === 'abgeschlossen').length,
    in_progress: todaysAppts.filter((a) => a.status === 'in_arbeit').length,
    upcoming: todaysAppts.filter((a) => a.status === 'geplant' || a.status === 'bestaetigt').length,
    revenue_done: todaysAppts
      .filter((a) => a.status === 'abgeschlossen')
      .reduce((sum, a) => sum + (a.total_price || 0), 0),
    revenue_planned: todaysAppts
      .filter((a) => a.status !== 'storniert')
      .reduce((sum, a) => sum + (a.total_price || 0), 0),
  };

  res.json({
    server_time: nowISO,
    today: todayTotals,
    bays: [...byBay.values(), ...(unassigned.current || unassigned.queue.length || unassigned.done ? [unassigned] : [])],
    employees: empStats,
  });
});

// ========== /api/dashboard/stats  (historische Auswertungen) ==========

router.get('/stats', (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const fromISO = dayjs().subtract(days, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ss');

  // --- Abgeschlossene Aufträge mit Ist/Soll-Vergleich ---
  const completed = db.prepare(
    `SELECT a.id, a.start_time, a.end_time, a.actual_start_time, a.actual_end_time,
            a.total_price, a.bay_id, a.employee_id
     FROM appointments a
     WHERE a.status = 'abgeschlossen' AND a.start_time >= ?`
  ).all(fromISO);

  function minutes(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b) - new Date(a)) / 60000);
  }

  let plannedSum = 0, actualSum = 0, countWithActual = 0;
  for (const a of completed) {
    plannedSum += minutes(a.start_time, a.end_time) || 0;
    const actual = minutes(a.actual_start_time, a.actual_end_time);
    if (actual !== null && actual > 0) {
      actualSum += actual;
      countWithActual += 1;
    }
  }
  const avgPlanned = completed.length ? Math.round(plannedSum / completed.length) : 0;
  const avgActual = countWithActual ? Math.round(actualSum / countWithActual) : 0;
  const delta = avgActual && avgPlanned ? avgActual - avgPlanned : 0;

  // --- Auslastung pro Bühne ---
  const bays = db.prepare('SELECT id, name FROM bays WHERE active = 1 ORDER BY sort_order, id').all();
  const bayUsage = bays.map((b) => {
    const rows = db.prepare(
      `SELECT COUNT(*) AS c,
              SUM((julianday(end_time) - julianday(start_time)) * 24 * 60) AS planned_min,
              SUM(
                CASE WHEN actual_start_time IS NOT NULL AND actual_end_time IS NOT NULL
                  THEN (julianday(actual_end_time) - julianday(actual_start_time)) * 24 * 60
                  ELSE (julianday(end_time) - julianday(start_time)) * 24 * 60
                END
              ) AS total_min
       FROM appointments
       WHERE bay_id = ? AND status = 'abgeschlossen' AND start_time >= ?`
    ).get(b.id, fromISO);
    return {
      bay_id: b.id,
      name: b.name,
      completed: rows.c || 0,
      total_hours: Math.round((rows.total_min || 0) / 60 * 10) / 10,
    };
  });

  // --- Mitarbeiter-Top-Liste ---
  const empTop = db.prepare(
    `SELECT u.id, u.full_name,
            COUNT(*) AS completed,
            SUM(a.total_price) AS revenue,
            AVG(CASE WHEN a.actual_start_time IS NOT NULL AND a.actual_end_time IS NOT NULL
                THEN (julianday(a.actual_end_time) - julianday(a.actual_start_time)) * 24 * 60
                ELSE (julianday(a.end_time) - julianday(a.start_time)) * 24 * 60
            END) AS avg_min
     FROM appointments a
     JOIN users u ON u.id = a.employee_id
     WHERE a.status = 'abgeschlossen' AND a.start_time >= ?
     GROUP BY u.id
     ORDER BY completed DESC`
  ).all(fromISO);

  // --- Top-Leistungen (nach Anzahl) ---
  const topServices = db.prepare(
    `SELECT s.name, s.category, COUNT(*) AS c,
            AVG(asv.duration_minutes) AS avg_planned_min,
            SUM(asv.price * asv.quantity) AS revenue
     FROM appointment_services asv
     JOIN appointments a ON a.id = asv.appointment_id
     JOIN services s ON s.id = asv.service_id
     WHERE a.status = 'abgeschlossen' AND a.start_time >= ?
     GROUP BY s.id
     ORDER BY c DESC
     LIMIT 10`
  ).all(fromISO);

  // --- Aufträge pro Tag (für kleinen Chart) ---
  const perDay = db.prepare(
    `SELECT date(start_time) AS day,
            COUNT(*) AS completed,
            SUM(total_price) AS revenue
     FROM appointments
     WHERE status = 'abgeschlossen' AND start_time >= ?
     GROUP BY day
     ORDER BY day`
  ).all(fromISO);

  // --- Status-Verteilung ---
  const statusDist = db.prepare(
    `SELECT status, COUNT(*) AS c
     FROM appointments
     WHERE start_time >= ?
     GROUP BY status`
  ).all(fromISO);

  res.json({
    days,
    completed_total: completed.length,
    revenue_total: completed.reduce((s, a) => s + (a.total_price || 0), 0),
    avg_planned_minutes: avgPlanned,
    avg_actual_minutes: avgActual,
    avg_delta_minutes: delta,
    tracked_count: countWithActual,
    bay_usage: bayUsage,
    employees: empTop.map((e) => ({
      id: e.id,
      name: e.full_name,
      completed: e.completed,
      revenue: Math.round((e.revenue || 0) * 100) / 100,
      avg_minutes: Math.round(e.avg_min || 0),
    })),
    top_services: topServices.map((s) => ({
      name: s.name,
      category: s.category,
      count: s.c,
      avg_planned_minutes: Math.round(s.avg_planned_min || 0),
      revenue: Math.round((s.revenue || 0) * 100) / 100,
    })),
    per_day: perDay,
    status_distribution: statusDist,
  });
});

// ========== /api/dashboard/utilization  (dynamische Auslastung) ==========

router.get('/utilization', (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const from = dayjs().subtract(days - 1, 'day').startOf('day');
  const to = dayjs().endOf('day');
  const fromISO = from.format('YYYY-MM-DDTHH:mm:ss');
  const toISO = to.format('YYYY-MM-DDTHH:mm:ss');

  // --- Werkstatt-Öffnung pro Wochentag (Mo=0 ... So=6) ---
  const hoursRows = db.prepare('SELECT * FROM workshop_hours').all();
  const openMap = new Map();
  for (const r of hoursRows) {
    openMap.set(r.weekday, { open: r.open_time, close: r.close_time, closed: !!r.closed });
  }
  function minutesForOpenDay(wd) {
    const e = openMap.get(wd);
    if (!e || e.closed || !e.open || !e.close) return 0;
    return hhmmToMin(e.close) - hhmmToMin(e.open);
  }

  // --- Schließungen im Zeitraum ---
  const closures = new Set(
    db.prepare('SELECT date FROM workshop_closures WHERE date BETWEEN ? AND ?').all(
      from.format('YYYY-MM-DD'),
      to.format('YYYY-MM-DD')
    ).map((r) => r.date)
  );

  // --- Alle Tage im Zeitraum (iterieren) ---
  const allDays = [];
  let cur = from.clone();
  while (cur.isBefore(to) || cur.isSame(to, 'day')) {
    const wd = (cur.day() + 6) % 7;
    const dateStr = cur.format('YYYY-MM-DD');
    const open = closures.has(dateStr) ? 0 : minutesForOpenDay(wd);
    allDays.push({ date: dateStr, weekday: wd, open_minutes: open });
    cur = cur.add(1, 'day');
  }
  const totalOpenMinutes = allDays.reduce((s, d) => s + d.open_minutes, 0);

  // --- Termine im Zeitraum laden ---
  const appts = db.prepare(
    `SELECT a.id, a.bay_id, a.employee_id, a.start_time, a.end_time, a.status,
            a.actual_start_time, a.actual_end_time
     FROM appointments a
     WHERE a.start_time >= ? AND a.start_time <= ?
       AND a.status != 'storniert'`
  ).all(fromISO, toISO);

  function apptMinutes(a) {
    // Ist-Zeit bevorzugen, sonst Plan
    if (a.actual_start_time && a.actual_end_time) {
      const m = diffMin(a.actual_start_time, a.actual_end_time);
      if (m > 0) return m;
    }
    return Math.max(0, diffMin(a.start_time, a.end_time));
  }

  // --- Bühnen ---
  const bays = db.prepare('SELECT id, name, type FROM bays WHERE active = 1 ORDER BY sort_order, id').all();
  const bayAgg = new Map(
    bays.map((b) => [b.id, { id: b.id, name: b.name, type: b.type, used_minutes: 0, appointments: 0 }])
  );
  const bayDaily = new Map(bays.map((b) => [b.id, {}]));
  for (const a of appts) {
    if (!a.bay_id || !bayAgg.has(a.bay_id)) continue;
    const mins = apptMinutes(a);
    bayAgg.get(a.bay_id).used_minutes += mins;
    bayAgg.get(a.bay_id).appointments += 1;
    const day = a.start_time.slice(0, 10);
    const map = bayDaily.get(a.bay_id);
    map[day] = (map[day] || 0) + mins;
  }

  const bayResult = bays.map((b) => {
    const agg = bayAgg.get(b.id);
    const util = totalOpenMinutes ? agg.used_minutes / totalOpenMinutes : 0;
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      used_minutes: Math.round(agg.used_minutes),
      available_minutes: totalOpenMinutes,
      appointments: agg.appointments,
      utilization_pct: Math.round(util * 1000) / 10,
      daily: allDays.map((d) => {
        const used = bayDaily.get(b.id)[d.date] || 0;
        return {
          date: d.date,
          used_minutes: Math.round(used),
          available_minutes: d.open_minutes,
          pct: d.open_minutes ? Math.round((used / d.open_minutes) * 1000) / 10 : 0,
        };
      }),
    };
  });

  // --- Mitarbeiter ---
  const employees = db.prepare(
    `SELECT id, full_name FROM users WHERE active = 1 AND role IN ('admin','mitarbeiter') ORDER BY full_name`
  ).all();
  const schedules = db.prepare('SELECT * FROM employee_schedules').all();
  const schedMap = new Map(); // employee_id → wd → {start,end,break_start,break_end}
  for (const s of schedules) {
    if (!schedMap.has(s.employee_id)) schedMap.set(s.employee_id, {});
    schedMap.get(s.employee_id)[s.weekday] = s;
  }
  const absences = db.prepare('SELECT * FROM employee_absences').all();

  function empAvailableMinutes(empId, dateStr, weekday, openMin) {
    if (!openMin) return 0;
    // Abwesenheit?
    const absent = absences.some(
      (a) => a.employee_id === empId && dateStr >= a.from_date && dateStr <= a.to_date
    );
    if (absent) return 0;
    const sched = schedMap.get(empId)?.[weekday];
    if (!sched) return 0;
    let mins = hhmmToMin(sched.end_time) - hhmmToMin(sched.start_time);
    if (sched.break_start && sched.break_end) {
      mins -= Math.max(0, hhmmToMin(sched.break_end) - hhmmToMin(sched.break_start));
    }
    return Math.max(0, mins);
  }

  const empAgg = new Map(
    employees.map((e) => [e.id, { id: e.id, name: e.full_name, used_minutes: 0, appointments: 0 }])
  );
  const empDaily = new Map(employees.map((e) => [e.id, {}]));
  for (const a of appts) {
    if (!a.employee_id || !empAgg.has(a.employee_id)) continue;
    const mins = apptMinutes(a);
    empAgg.get(a.employee_id).used_minutes += mins;
    empAgg.get(a.employee_id).appointments += 1;
    const day = a.start_time.slice(0, 10);
    const map = empDaily.get(a.employee_id);
    map[day] = (map[day] || 0) + mins;
  }

  const empResult = employees.map((e) => {
    const agg = empAgg.get(e.id);
    const dailyAvail = allDays.map((d) => ({
      ...d,
      emp_available: empAvailableMinutes(e.id, d.date, d.weekday, d.open_minutes),
    }));
    const totalAvail = dailyAvail.reduce((s, d) => s + d.emp_available, 0);
    return {
      id: e.id,
      name: e.full_name,
      used_minutes: Math.round(agg.used_minutes),
      available_minutes: totalAvail,
      appointments: agg.appointments,
      utilization_pct: totalAvail ? Math.round((agg.used_minutes / totalAvail) * 1000) / 10 : 0,
      daily: dailyAvail.map((d) => {
        const used = empDaily.get(e.id)[d.date] || 0;
        return {
          date: d.date,
          used_minutes: Math.round(used),
          available_minutes: d.emp_available,
          pct: d.emp_available ? Math.round((used / d.emp_available) * 1000) / 10 : 0,
        };
      }),
    };
  });

  // --- Heatmap: Wochentag × Stunde (Aufträge, Minuten) ---
  // 7×24 Raster. Termine auf Stunden-Slots zerlegen.
  const heatmap = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, minutes: 0 }))
  );
  for (const a of appts) {
    const s = new Date(a.start_time);
    const e = new Date(a.end_time);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    let t = new Date(s);
    while (t < e) {
      const nextHour = new Date(t);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const chunkEnd = nextHour > e ? e : nextHour;
      const mins = Math.max(0, Math.round((chunkEnd - t) / 60000));
      const wd = (t.getDay() + 6) % 7;
      const h = t.getHours();
      heatmap[wd][h].minutes += mins;
      if (t.getTime() === s.getTime()) heatmap[wd][h].count += 1; // nur im Start-Slot zählen
      t = nextHour;
    }
  }

  // --- Zeitreihe pro Tag (Gesamt-Auslastung Werkstatt) ---
  const dailyTotals = allDays.map((d) => {
    const used = appts
      .filter((a) => a.start_time.slice(0, 10) === d.date)
      .reduce((s, a) => s + apptMinutes(a), 0);
    return {
      date: d.date,
      used_minutes: Math.round(used),
      available_minutes: d.open_minutes,
      pct: d.open_minutes ? Math.round((used / d.open_minutes) * 1000) / 10 : 0,
    };
  });

  res.json({
    days,
    from: from.format('YYYY-MM-DD'),
    to: to.format('YYYY-MM-DD'),
    total_open_minutes: totalOpenMinutes,
    bays: bayResult,
    employees: empResult,
    daily_totals: dailyTotals,
    heatmap,
  });
});

function hhmmToMin(s) {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function diffMin(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

export default router;
