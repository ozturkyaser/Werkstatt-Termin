import db from '../db.js';

const SLOT_MIN = 15;  // Slot-Raster in Minuten

// ---------- Zeit-Utilities (alles in Minuten-seit-Mitternacht) ----------

function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
function fromMin(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function dateISO(year, month, day, hhmm = '00:00') {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${hhmm}:00`;
}
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}
function jsWeekday(dateStr) {
  // 0=Mo .. 6=So (gemäß unserem Schema)
  const d = new Date(`${dateStr}T00:00:00`);
  return (d.getDay() + 6) % 7;
}
function minutesBetween(aISO, bISO) {
  return Math.round((new Date(bISO) - new Date(aISO)) / 60000);
}

// ---------- Interval-Mengen ----------

function subtractIntervals(base, blocks) {
  // base: [[s,e],...] sortiert, blocks: [[s,e],...]
  let result = base.map((x) => [...x]);
  for (const [bs, be] of blocks) {
    const next = [];
    for (const [s, e] of result) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, Math.min(bs, e)]);
      if (be < e) next.push([Math.max(be, s), e]);
    }
    result = next;
  }
  return result.filter(([s, e]) => e - s >= SLOT_MIN);
}

// ---------- Hauptfunktion: Verfügbarkeit für einen Tag ----------

/**
 * Für einen gegebenen Tag und eine Liste von Leistungen die passenden Slots finden.
 *
 * @param {Object} opts
 * @param {string} opts.date             "YYYY-MM-DD"
 * @param {number[]} opts.service_ids    Gewählte Leistungen
 * @param {number} [opts.duration_min]   Optional eigene Dauer (statt aus Leistungen zu rechnen)
 * @param {number} [opts.appointmentId]  Für Bearbeitung: diesen Termin ignorieren
 * @returns {{slots: Array, day: Object, services: Array}}
 */
export function findAvailability({ date, service_ids = [], duration_min, appointmentId = null }) {
  // 1) Leistungen laden (Dauer, Puffer, benötigter Bühnentyp, Skills)
  let services = [];
  if (service_ids.length) {
    const placeholders = service_ids.map(() => '?').join(',');
    services = db.prepare(`SELECT * FROM services WHERE id IN (${placeholders})`).all(...service_ids);
  }

  const totalDuration = duration_min
    || services.reduce((s, x) => s + (x.duration_minutes || 0), 0)
    || 60;
  const totalBuffer = services.reduce((s, x) => s + (x.buffer_minutes || 0), 0);
  const slotLen = totalDuration + totalBuffer; // Minuten, die ein Termin blockiert

  // Benötigter Bühnentyp (nimmt den "striktesten" aus den Leistungen)
  const bayTypes = services.map((s) => s.required_bay_type).filter(Boolean);
  const requiredBayType = bayTypes[0] || null;

  // Benötigte Skills (Vereinigung)
  const requiredSkills = new Set();
  for (const s of services) {
    try {
      const arr = s.required_skills ? JSON.parse(s.required_skills) : [];
      for (const k of arr) requiredSkills.add(k);
    } catch { /* ignore */ }
  }

  // 2) Öffnungszeiten des Tages
  const wd = jsWeekday(date);
  const wh = db.prepare('SELECT * FROM workshop_hours WHERE weekday = ?').get(wd);
  const closure = db.prepare('SELECT * FROM workshop_closures WHERE date = ?').get(date);

  const day = {
    date,
    weekday: wd,
    closed: Boolean(closure) || !wh || wh.closed === 1 || !wh.open_time,
    closure_reason: closure?.reason || null,
    open_time: wh?.open_time || null,
    close_time: wh?.close_time || null,
  };
  if (day.closed) {
    return { slots: [], day, services, requiredBayType, requiredSkills: [...requiredSkills] };
  }

  const openM = toMin(wh.open_time);
  const closeM = toMin(wh.close_time);

  // 3) Passende Bühnen
  let bays = db.prepare('SELECT * FROM bays WHERE active = 1 ORDER BY sort_order, id').all();
  if (requiredBayType) {
    bays = bays.filter((b) => b.type === requiredBayType);
  }

  // 4) Mitarbeiter (aktiv + mit Schedule an diesem Wochentag + keine Absenz)
  let employees = db.prepare(
    `SELECT u.id, u.full_name,
            s.start_time AS s_start, s.end_time AS s_end,
            s.break_start, s.break_end
     FROM users u
     JOIN employee_schedules s ON s.employee_id = u.id AND s.weekday = ?
     WHERE u.active = 1`
  ).all(wd);

  const absent = db.prepare(
    `SELECT employee_id FROM employee_absences
     WHERE ? BETWEEN from_date AND to_date`
  ).all(date).map((r) => r.employee_id);
  const absentSet = new Set(absent);

  employees = employees.filter((e) => !absentSet.has(e.id));

  // Skill-Filter
  if (requiredSkills.size) {
    const allSkills = db.prepare('SELECT employee_id, skill FROM employee_skills').all();
    const byEmp = new Map();
    for (const r of allSkills) {
      if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, new Set());
      byEmp.get(r.employee_id).add(r.skill);
    }
    employees = employees.filter((e) => {
      const s = byEmp.get(e.id) || new Set();
      for (const need of requiredSkills) if (!s.has(need)) return false;
      return true;
    });
  }

  // 5) Bestehende Termine des Tages laden (außer der zu bearbeitende)
  const dayStart = dateISO(...Object.values(parseDate(date)), '00:00');
  const dayEnd = dateISO(...Object.values(parseDate(date)), '23:59');
  let existing = db.prepare(
    `SELECT id, start_time, end_time, bay_id, employee_id, status
     FROM appointments
     WHERE start_time < ? AND end_time > ?
       AND status != 'storniert'`
  ).all(dayEnd, dayStart);
  if (appointmentId) existing = existing.filter((a) => a.id !== appointmentId);

  // Termine in Minuten-Intervalle pro Bühne / Mitarbeiter aggregieren
  const bayBlocks = new Map();   // bay_id -> [[s,e]]
  const empBlocks = new Map();   // emp_id -> [[s,e]]
  for (const a of existing) {
    const sMin = Math.max(0, toMinFromISO(a.start_time, date));
    const eMin = Math.min(24 * 60, toMinFromISO(a.end_time, date));
    if (eMin <= sMin) continue;
    if (a.bay_id) {
      if (!bayBlocks.has(a.bay_id)) bayBlocks.set(a.bay_id, []);
      bayBlocks.get(a.bay_id).push([sMin, eMin]);
    }
    if (a.employee_id) {
      if (!empBlocks.has(a.employee_id)) empBlocks.set(a.employee_id, []);
      empBlocks.get(a.employee_id).push([sMin, eMin]);
    }
  }

  // 6) Freie Zeitfenster pro Ressource berechnen
  const bayFree = new Map();
  for (const b of bays) {
    const base = [[openM, closeM]];
    const free = subtractIntervals(base, bayBlocks.get(b.id) || []);
    bayFree.set(b.id, free);
  }

  const empFree = new Map();
  for (const e of employees) {
    const schedStart = Math.max(openM, toMin(e.s_start));
    const schedEnd = Math.min(closeM, toMin(e.s_end));
    let base = schedEnd > schedStart ? [[schedStart, schedEnd]] : [];
    if (e.break_start && e.break_end) {
      base = subtractIntervals(base, [[toMin(e.break_start), toMin(e.break_end)]]);
    }
    const free = subtractIntervals(base, empBlocks.get(e.id) || []);
    empFree.set(e.id, free);
  }

  // 7) Slot-Raster: an jedem SLOT_MIN-Schritt prüfen, ob Termin-Dauer + Puffer in
  //    mindestens einer (Bühne, Mitarbeiter)-Kombi Platz hat.
  const slots = [];
  for (let t = openM; t + slotLen <= closeM; t += SLOT_MIN) {
    const candidates = [];
    // Mitarbeiter mit durchgehend freiem Intervall [t, t+slotLen]
    const freeEmps = employees.filter((e) => hasFreeWindow(empFree.get(e.id), t, t + slotLen));
    // Bühnen mit durchgehend freiem Intervall
    const freeBays = bays.filter((b) => hasFreeWindow(bayFree.get(b.id), t, t + slotLen));
    if (freeEmps.length && freeBays.length) {
      candidates.push({ employee: freeEmps[0], bay: freeBays[0] });
      slots.push({
        start_time: dateISO(...Object.values(parseDate(date)), fromMin(t)),
        end_time: dateISO(...Object.values(parseDate(date)), fromMin(t + slotLen)),
        duration_minutes: totalDuration,
        buffer_minutes: totalBuffer,
        suggested_employee: { id: freeEmps[0].id, name: freeEmps[0].full_name },
        suggested_bay: { id: freeBays[0].id, name: freeBays[0].name },
        available_employees: freeEmps.length,
        available_bays: freeBays.length,
      });
    }
  }

  return {
    slots,
    day,
    services,
    requiredBayType,
    requiredSkills: [...requiredSkills],
    resources: {
      bays: bays.length,
      employees: employees.length,
      theoretical_capacity_minutes: Math.min(bays.length, employees.length) * (closeM - openM),
    },
  };
}

function hasFreeWindow(freeIntervals, s, e) {
  if (!freeIntervals) return false;
  return freeIntervals.some(([fs, fe]) => fs <= s && fe >= e);
}

function toMinFromISO(iso, expectedDate) {
  const d = new Date(iso);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const dayISO = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if (dayISO < expectedDate) return 0;
  if (dayISO > expectedDate) return 24 * 60;
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Prüft, ob ein konkreter Slot (Start, Ende, Bühne, Mitarbeiter) verfügbar ist.
 * Genutzt bei Neu-/Umbuchung, um Konflikte zu verhindern.
 */
export function checkSlotFree({ start_time, end_time, bay_id, employee_id, appointmentId = null }) {
  const params = [start_time, end_time];
  const conflictBase =
    `FROM appointments
     WHERE status != 'storniert'
       AND end_time > ? AND start_time < ?`;

  if (bay_id) {
    const rows = db.prepare(`SELECT id ${conflictBase} AND bay_id = ?`)
      .all(...params, bay_id)
      .filter((r) => r.id !== appointmentId);
    if (rows.length) return { ok: false, reason: 'Bühne ist in diesem Zeitraum belegt' };
  }
  if (employee_id) {
    const rows = db.prepare(`SELECT id ${conflictBase} AND employee_id = ?`)
      .all(...params, employee_id)
      .filter((r) => r.id !== appointmentId);
    if (rows.length) return { ok: false, reason: 'Mitarbeiter ist in diesem Zeitraum belegt' };
  }
  return { ok: true };
}
