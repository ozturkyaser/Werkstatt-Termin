import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

export default function Employees() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [planning, setPlanning] = useState(null);

  const load = useCallback(() => {
    api.get('/employees').then(setRows);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div className="card p-6 text-center text-slate-500">
        Nur Administratoren können Mitarbeiter verwalten.
      </div>
    );
  }

  async function deactivate(u) {
    if (!confirm(`${u.full_name} deaktivieren?`)) return;
    await api.del(`/employees/${u.id}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mitarbeiter</h1>
          <p className="text-slate-500 text-sm">Benutzerverwaltung mit Rollen.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Neuer Mitarbeiter</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">E-Mail</th>
              <th className="text-left px-4 py-3">Telefon</th>
              <th className="text-left px-4 py-3">Rolle</th>
              <th className="text-left px-4 py-3">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((u) => (
              <tr key={u.id} className={`hover:bg-slate-50 ${!u.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.phone || '–'}</td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={u.active ? 'text-emerald-700' : 'text-slate-400'}>
                    {u.active ? 'Aktiv' : 'Deaktiviert'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button className="btn-ghost text-sm" onClick={() => setPlanning(u)}>Verfügbarkeit</button>
                  <button className="btn-ghost text-sm" onClick={() => setEditing(u)}>Bearbeiten</button>
                  {u.active && u.id !== user.id && (
                    <button className="btn-ghost text-sm text-red-600" onClick={() => deactivate(u)}>
                      Deaktivieren
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Mitarbeiter anlegen">
        <EmployeeCreateForm onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Mitarbeiter bearbeiten">
        {editing && (
          <EmployeeEditForm initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }} />
        )}
      </Modal>
      <Modal open={!!planning} onClose={() => setPlanning(null)}
        title={planning ? `Verfügbarkeit: ${planning.full_name}` : ''} wide>
        {planning && <EmployeePlanning employee={planning} />}
      </Modal>
    </div>
  );
}

// ============ Verfügbarkeits-Modal ============

const WEEKDAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const SKILL_PRESETS = [
  { id: 'hv', label: 'HV / Elektro' },
  { id: 'hu', label: 'HU/AU' },
  { id: 'karosserie', label: 'Karosserie' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'klima', label: 'Klima' },
  { id: 'getriebe', label: 'Getriebe' },
];

function EmployeePlanning({ employee }) {
  const [tab, setTab] = useState('schedule');
  return (
    <div>
      <div className="flex gap-2 border-b mb-4">
        {[['schedule','Arbeitszeiten'],['skills','Qualifikationen'],['absences','Abwesenheiten']].map(([k,l]) => (
          <button key={k}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'
            }`}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'schedule' && <ScheduleEditor employeeId={employee.id} />}
      {tab === 'skills' && <SkillsEditor employeeId={employee.id} />}
      {tab === 'absences' && <AbsencesEditor employeeId={employee.id} />}
    </div>
  );
}

function ScheduleEditor({ employeeId }) {
  const [schedule, setSchedule] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get(`/employees/${employeeId}/schedule`).then((rows) => {
      const byWd = {};
      for (const r of rows) byWd[r.weekday] = r;
      const full = [];
      for (let wd = 0; wd <= 6; wd++) {
        full.push(byWd[wd] || { weekday: wd, start_time: '', end_time: '', break_start: '', break_end: '', removed: true });
      }
      setSchedule(full);
    });
  }, [employeeId]);

  const updateRow = (wd, patch) => {
    setSchedule((rows) => rows.map((r) => r.weekday === wd ? { ...r, ...patch, removed: false } : r));
  };

  const toggle = (wd) => {
    setSchedule((rows) => rows.map((r) => {
      if (r.weekday !== wd) return r;
      if (r.removed) return { ...r, removed: false, start_time: r.start_time || '09:00', end_time: r.end_time || '18:00' };
      return { ...r, removed: true };
    }));
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await api.put(`/employees/${employeeId}/schedule`, { schedule });
      setMsg('Gespeichert.');
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Reguläre Arbeitszeit pro Wochentag. Optional kann eine Pause definiert werden (wird von Slots ausgeklammert).
      </p>
      {schedule.map((r) => (
        <div key={r.weekday} className="flex items-center gap-2 flex-wrap">
          <div className="w-10 font-medium">{WEEKDAYS[r.weekday]}</div>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={!r.removed} onChange={() => toggle(r.weekday)} />
            <span>arbeitet</span>
          </label>
          {!r.removed && (
            <>
              <input type="time" className="input w-24" value={r.start_time || ''}
                onChange={(e) => updateRow(r.weekday, { start_time: e.target.value })} />
              <span>–</span>
              <input type="time" className="input w-24" value={r.end_time || ''}
                onChange={(e) => updateRow(r.weekday, { end_time: e.target.value })} />
              <span className="text-xs text-slate-500 ml-2">Pause:</span>
              <input type="time" className="input w-24" value={r.break_start || ''}
                onChange={(e) => updateRow(r.weekday, { break_start: e.target.value })} />
              <span>–</span>
              <input type="time" className="input w-24" value={r.break_end || ''}
                onChange={(e) => updateRow(r.weekday, { break_end: e.target.value })} />
            </>
          )}
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-3 border-t items-center">
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function SkillsEditor({ employeeId }) {
  const [current, setCurrent] = useState([]);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/employees/${employeeId}/skills`).then(setCurrent);
  }, [employeeId]);

  const toggle = (s) => {
    setCurrent((c) => c.includes(s) ? c.filter((x) => x !== s) : [...c, s]);
  };
  const addCustom = () => {
    const s = custom.trim().toLowerCase();
    if (s && !current.includes(s)) setCurrent([...current, s]);
    setCustom('');
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/employees/${employeeId}/skills`, { skills: current });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Qualifikationen bestimmen, welcher Mitarbeiter für welche Leistungen eingeplant werden kann.
      </p>
      <div className="flex flex-wrap gap-2">
        {SKILL_PRESETS.map((s) => (
          <button key={s.id} onClick={() => toggle(s.id)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              current.includes(s.id) ? 'bg-brand-600 text-white' : 'bg-slate-100 hover:bg-slate-200'
            }`}>
            {s.label}
          </button>
        ))}
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 uppercase mb-2">Eigene Skills</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {current.filter((s) => !SKILL_PRESETS.find((p) => p.id === s)).map((s) => (
            <span key={s} className="px-3 py-1 bg-slate-100 rounded-full text-sm flex items-center gap-2">
              {s}
              <button onClick={() => toggle(s)} className="text-slate-400 hover:text-rose-600">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="Neue Qualifikation…"
            value={custom} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} />
          <button className="btn-ghost" onClick={addCustom}>Hinzufügen</button>
        </div>
      </div>
      <div className="flex justify-end pt-3 border-t">
        <button className="btn-primary" onClick={save} disabled={saving}>Speichern</button>
      </div>
    </div>
  );
}

function AbsencesEditor({ employeeId }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ from_date: '', to_date: '', type: 'urlaub', reason: '' });

  const load = () => api.get(`/employees/${employeeId}/absences`).then(setRows);
  useEffect(() => { load(); }, [employeeId]);

  const add = async (e) => {
    e.preventDefault();
    await api.post(`/employees/${employeeId}/absences`, form);
    setForm({ from_date: '', to_date: '', type: 'urlaub', reason: '' });
    load();
  };
  const remove = async (id) => {
    await api.del(`/employees/${employeeId}/absences/${id}`);
    load();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid grid-cols-2 gap-3">
        <div><label className="label">Von *</label>
          <input type="date" className="input" required value={form.from_date}
            onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
        <div><label className="label">Bis *</label>
          <input type="date" className="input" required value={form.to_date}
            onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
        <div><label className="label">Art</label>
          <select className="input" value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="urlaub">Urlaub</option>
            <option value="krank">Krank</option>
            <option value="fortbildung">Fortbildung</option>
            <option value="sonstiges">Sonstiges</option>
          </select></div>
        <div><label className="label">Bemerkung</label>
          <input className="input" value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        <div className="col-span-2 flex justify-end">
          <button className="btn-primary">Eintrag anlegen</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">Keine Abwesenheiten eingetragen.</div>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex justify-between">
              <div>
                <span className="capitalize font-medium">{r.type}</span>
                <span className="text-slate-600 mx-2">·</span>
                <span>{r.from_date} – {r.to_date}</span>
                {r.reason && <span className="text-slate-500 ml-2">({r.reason})</span>}
              </div>
              <button className="btn-ghost text-sm text-rose-600" onClick={() => remove(r.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmployeeCreateForm({ onSaved, onCancel }) {
  const [f, setF] = useState({ email: '', password: '', full_name: '', role: 'mitarbeiter', phone: '' });
  const [err, setErr] = useState('');
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    try {
      await api.post('/auth/register', f);
      onSaved?.();
    } catch (er) { setErr(er.message); }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
      <div><label className="label">Voller Name *</label>
        <input className="input" required value={f.full_name} onChange={(e) => upd('full_name', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">E-Mail *</label>
          <input type="email" className="input" required value={f.email}
            onChange={(e) => upd('email', e.target.value)} /></div>
        <div><label className="label">Telefon</label>
          <input className="input" value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Passwort *</label>
          <input type="password" className="input" required minLength={6}
            value={f.password} onChange={(e) => upd('password', e.target.value)} /></div>
        <div><label className="label">Rolle</label>
          <select className="input" value={f.role} onChange={(e) => upd('role', e.target.value)}>
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="admin">Administrator</option>
          </select></div>
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <button type="submit" className="btn-primary">Anlegen</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}

function EmployeeEditForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState({
    full_name: initial.full_name, role: initial.role, phone: initial.phone || '',
    active: initial.active, password: '',
  });
  const [err, setErr] = useState('');
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...f };
      if (!payload.password) delete payload.password;
      await api.put(`/employees/${initial.id}`, payload);
      onSaved?.();
    } catch (er) { setErr(er.message); }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
      <div><label className="label">Voller Name</label>
        <input className="input" value={f.full_name} onChange={(e) => upd('full_name', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Telefon</label>
          <input className="input" value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></div>
        <div><label className="label">Rolle</label>
          <select className="input" value={f.role} onChange={(e) => upd('role', e.target.value)}>
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="admin">Administrator</option>
          </select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Neues Passwort (optional)</label>
          <input type="password" className="input" value={f.password}
            onChange={(e) => upd('password', e.target.value)} placeholder="unverändert lassen"/></div>
        <div><label className="label">Status</label>
          <select className="input" value={f.active} onChange={(e) => upd('active', Number(e.target.value))}>
            <option value={1}>Aktiv</option>
            <option value={0}>Deaktiviert</option>
          </select></div>
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <button type="submit" className="btn-primary">Speichern</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
