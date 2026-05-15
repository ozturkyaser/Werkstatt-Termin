import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function AuditLog() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');

  useEffect(() => {
    if (authLoading || user?.role !== 'admin') return;
    setLoading(true);
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    api.get(`/audit-logs${q}`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [entityType, authLoading, user?.role]);

  if (authLoading) return <div className="p-8 text-slate-500">Lädt…</div>;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Aktivitätsprotokoll</h1>
        <p className="text-slate-500 text-sm">Änderungen an Terminen und sicherheitsrelevante Aktionen (nur Admin).</p>
      </div>

      <div className="flex gap-2 items-center">
        <label className="text-sm">Entität</label>
        <select className="input w-48" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">Alle</option>
          <option value="appointment">Termin</option>
        </select>
      </div>

      {loading ? <div className="text-slate-500">Lädt…</div> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="text-left py-2 px-2">Zeit</th>
                <th className="text-left py-2 px-2">Benutzer</th>
                <th className="text-left py-2 px-2">Aktion</th>
                <th className="text-left py-2 px-2">Objekt</th>
                <th className="text-left py-2 px-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-2 px-2 whitespace-nowrap text-slate-600">
                    {format(parseISO(r.created_at), 'dd.MM.yyyy HH:mm:ss', { locale: de })}
                  </td>
                  <td className="py-2 px-2">{r.user_name || r.user_email || '–'}</td>
                  <td className="py-2 px-2 font-mono text-xs">{r.action}</td>
                  <td className="py-2 px-2">
                    {r.entity_type === 'appointment' && r.entity_id ? (
                      <Link className="text-brand-700 hover:underline" to={`/termine/${r.entity_id}`}>
                        Termin #{r.entity_id}
                      </Link>
                    ) : (
                      `${r.entity_type || ''} ${r.entity_id || ''}`
                    )}
                  </td>
                  <td className="py-2 px-2 max-w-xs truncate text-xs text-slate-600" title={JSON.stringify(r.payload)}>
                    {r.payload ? JSON.stringify(r.payload) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-6 text-slate-500 text-center">Noch keine Einträge.</div>}
        </div>
      )}
    </div>
  );
}
