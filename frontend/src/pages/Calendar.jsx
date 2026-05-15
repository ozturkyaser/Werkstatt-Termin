import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks,
  endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth,
  parseISO, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { api, STATUS_LABELS } from '../lib/api';
import Modal from '../components/Modal';
import AppointmentForm from '../components/AppointmentForm';

const VIEWS = { day: 'Tag', week: 'Woche', month: 'Monat' };
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00–18:00

export default function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [editing, setEditing] = useState(null); // full object or { defaultStart, prefillLicensePlate }
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    const raw = searchParams.get('kennzeichen') || '';
    let kz = raw;
    try {
      kz = decodeURIComponent(raw);
    } catch { /* bleibt raw */ }
    setEditing({ defaultStart: new Date(), prefillLicensePlate: kz.trim() });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const range = useMemo(() => {
    if (view === 'day') {
      return { start: anchor, end: addDays(anchor, 1) };
    }
    if (view === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return { start: s, end: addDays(s, 7) };
    }
    const s = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const e = addDays(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }), 1);
    return { start: s, end: e };
  }, [view, anchor]);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/appointments?from=${range.start.toISOString()}&to=${range.end.toISOString()}`)
      .then(setAppointments)
      .finally(() => setLoading(false));
  }, [range.start, range.end]);

  useEffect(() => { load(); }, [load]);

  function prev() {
    setAnchor((a) =>
      view === 'day' ? addDays(a, -1)
      : view === 'week' ? addWeeks(a, -1)
      : addMonths(a, -1)
    );
  }
  function next() {
    setAnchor((a) =>
      view === 'day' ? addDays(a, 1)
      : view === 'week' ? addWeeks(a, 1)
      : addMonths(a, 1)
    );
  }

  function openCreate(at) {
    setEditing({ defaultStart: at || new Date() });
  }
  async function openEdit(id) {
    const full = await api.get(`/appointments/${id}`);
    setEditing(full);
  }

  async function deleteAppointment() {
    if (!editing?.id) return;
    if (!confirm('Termin wirklich löschen?')) return;
    await api.del(`/appointments/${editing.id}`);
    setEditing(null);
    load();
  }

  const title = useMemo(() => {
    if (view === 'day') return format(anchor, "EEEE, d. MMMM yyyy", { locale: de });
    if (view === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = addDays(s, 6);
      return `${format(s, 'd. MMM', { locale: de })} – ${format(e, 'd. MMM yyyy', { locale: de })}`;
    }
    return format(anchor, 'MMMM yyyy', { locale: de });
  }, [view, anchor]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold">Terminkalender</h1>
          <p className="text-slate-500 text-sm">{title}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border overflow-hidden">
            {Object.entries(VIEWS).map(([k, v]) => (
              <button key={k}
                onClick={() => setView(k)}
                className={`px-3 py-1.5 text-sm ${
                  view === k ? 'bg-brand-600 text-white' : 'bg-white hover:bg-slate-50'
                }`}>
                {v}
              </button>
            ))}
          </div>
          <button className="btn-secondary" onClick={prev}>←</button>
          <button className="btn-secondary" onClick={() => setAnchor(startOfDay(new Date()))}>
            Heute
          </button>
          <button className="btn-secondary" onClick={next}>→</button>
          <button className="btn-primary" onClick={() => openCreate(anchor)}>+ Neuer Termin</button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Lädt…</div>}

      {view === 'month' && (
        <MonthView anchor={anchor} appointments={appointments} onDayClick={(d) => { setAnchor(d); setView('day'); }} onEdit={openEdit} />
      )}
      {view === 'week' && (
        <WeekView anchor={anchor} appointments={appointments}
          onSlotClick={openCreate} onEdit={openEdit} />
      )}
      {view === 'day' && (
        <DayView anchor={anchor} appointments={appointments}
          onSlotClick={openCreate} onEdit={openEdit} />
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        wide
        title={editing?.id ? `Termin #${editing.id} bearbeiten` : 'Neuen Termin anlegen'}
      >
        {editing && (
          <AppointmentForm
            initial={editing.id ? editing : null}
            defaultStart={editing.defaultStart}
            prefillLicensePlate={editing.prefillLicensePlate || ''}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }}
            onDelete={editing.id ? deleteAppointment : null}
          />
        )}
      </Modal>
    </div>
  );
}

function MonthView({ anchor, appointments, onDayClick, onEdit }) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDay = (d) => appointments.filter((a) => isSameDay(parseISO(a.start_time), d));

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 text-xs font-semibold text-slate-500 bg-slate-50 border-b">
        {['Mo','Di','Mi','Do','Fr','Sa','So'].map((w) => (
          <div key={w} className="px-3 py-2">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = byDay(d);
          const sameMonth = isSameMonth(d, anchor);
          return (
            <div key={i}
              onClick={() => onDayClick(d)}
              className={`min-h-[110px] border-b border-r p-2 cursor-pointer hover:bg-slate-50 ${
                sameMonth ? '' : 'bg-slate-50/50 text-slate-400'
              }`}>
              <div className="text-sm font-medium">{format(d, 'd')}</div>
              <div className="space-y-1 mt-1">
                {list.slice(0, 3).map((a) => (
                  <div key={a.id}
                    onClick={(e) => { e.stopPropagation(); onEdit(a.id); }}
                    className={`text-xs px-1.5 py-0.5 rounded truncate ${eventClass(a.status)}`}>
                    {format(parseISO(a.start_time), 'HH:mm')} {a.last_name}
                  </div>
                ))}
                {list.length > 3 && (
                  <div className="text-xs text-slate-500">+{list.length - 3} weitere</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ anchor, appointments, onSlotClick, onEdit }) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="card overflow-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-slate-50">
          <div></div>
          {days.map((d) => (
            <div key={d} className="px-2 py-2 text-sm border-l">
              <div className="font-semibold">
                {format(d, 'EEE', { locale: de })}
              </div>
              <div className="text-slate-500">{format(d, 'd. MMM', { locale: de })}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          <div>
            {HOURS.map((h) => (
              <div key={h} className="h-16 text-right pr-2 text-xs text-slate-400 border-b">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d} day={d} appointments={appointments}
              onSlotClick={onSlotClick} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayView({ anchor, appointments, onSlotClick, onEdit }) {
  return (
    <div className="card overflow-auto">
      <div className="grid grid-cols-[60px_1fr]">
        <div>
          {HOURS.map((h) => (
            <div key={h} className="h-20 text-right pr-2 text-xs text-slate-400 border-b">
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        <DayColumn day={anchor} appointments={appointments}
          onSlotClick={onSlotClick} onEdit={onEdit} tall />
      </div>
    </div>
  );
}

function DayColumn({ day, appointments, onSlotClick, onEdit, tall = false }) {
  const slotHeight = tall ? 80 : 64;
  const dayStart = startOfDay(day);
  const events = appointments
    .filter((a) => isSameDay(parseISO(a.start_time), day))
    .map((a) => {
      const s = parseISO(a.start_time);
      const e = parseISO(a.end_time);
      const startHour = s.getHours() + s.getMinutes() / 60;
      const endHour = e.getHours() + e.getMinutes() / 60;
      const top = (startHour - HOURS[0]) * slotHeight;
      const height = Math.max(20, (endHour - startHour) * slotHeight);
      return { a, top, height };
    });

  return (
    <div className="relative border-l">
      {HOURS.map((h) => (
        <div key={h}
          onClick={() => {
            const d = new Date(dayStart); d.setHours(h); d.setMinutes(0);
            onSlotClick(d);
          }}
          className="border-b hover:bg-slate-50 cursor-pointer"
          style={{ height: slotHeight }}
        />
      ))}
      {events.map(({ a, top, height }) => (
        <div key={a.id}
          onClick={() => onEdit(a.id)}
          style={{ top, height }}
          className={`absolute left-1 right-1 rounded-md px-2 py-1 text-xs cursor-pointer shadow-sm border-l-4 overflow-hidden ${eventClass(a.status)}`}>
          <div className="font-semibold truncate">
            {format(parseISO(a.start_time), 'HH:mm')} {a.last_name}
          </div>
          <div className="truncate opacity-80">
            {a.license_plate} · {a.title || STATUS_LABELS[a.status]}
          </div>
        </div>
      ))}
    </div>
  );
}

function eventClass(status) {
  switch (status) {
    case 'bestaetigt':   return 'bg-blue-100 text-blue-900 border-blue-500 hover:bg-blue-200';
    case 'in_arbeit':    return 'bg-amber-100 text-amber-900 border-amber-500 hover:bg-amber-200';
    case 'abgeschlossen':return 'bg-emerald-100 text-emerald-900 border-emerald-500 hover:bg-emerald-200';
    case 'storniert':    return 'bg-red-100 text-red-800 border-red-500 line-through hover:bg-red-200';
    default:             return 'bg-slate-100 text-slate-800 border-slate-400 hover:bg-slate-200';
  }
}
