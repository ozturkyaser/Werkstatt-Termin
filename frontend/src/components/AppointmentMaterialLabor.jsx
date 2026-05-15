import { useCallback, useEffect, useState } from 'react';
import { api, formatCurrency } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

export default function AppointmentMaterialLabor({ appointment, onChange }) {
  const { user } = useAuth();
  const id = appointment?.id;
  const [parts, setParts] = useState([]);
  const [labor, setLabor] = useState([]);
  const [pf, setPf] = useState({ part_number: '', description: '', quantity: 1, unit_price: 0, supplier: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [p, l] = await Promise.all([
      api.get(`/appointments/${id}/parts`),
      api.get(`/appointments/${id}/labor`),
    ]);
    setParts(p);
    setLabor(l);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const statusUrl = appointment?.public_status_token
    ? `${window.location.origin}/status/${appointment.public_status_token}`
    : '';

  async function addPart(e) {
    e.preventDefault();
    if (!pf.description.trim()) return;
    setBusy(true);
    try {
      await api.post(`/appointments/${id}/parts`, {
        part_number: pf.part_number || null,
        description: pf.description.trim(),
        quantity: Number(pf.quantity) || 1,
        unit_price: Number(pf.unit_price) || 0,
        supplier: pf.supplier || null,
      });
      setPf({ part_number: '', description: '', quantity: 1, unit_price: 0, supplier: '' });
      load();
      onChange?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function delPart(pid) {
    if (!confirm('Position löschen?')) return;
    await api.del(`/appointments/${id}/parts/${pid}`);
    load();
    onChange?.();
  }

  async function startLabor() {
    setBusy(true);
    try {
      await api.post(`/appointments/${id}/labor/start`, {});
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopLabor() {
    setBusy(true);
    try {
      await api.post(`/appointments/${id}/labor/stop`, {});
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function rotateLink() {
    if (!confirm('Neuer Link? Der alte Kunden-Link funktioniert danach nicht mehr.')) return;
    setBusy(true);
    try {
      const r = await api.post(`/appointments/${id}/regenerate-public-link`, {});
      await navigator.clipboard.writeText(`${window.location.origin}${r.customer_status_path}`);
      alert('Neuer Link wurde erzeugt und in die Zwischenablage kopiert.');
      onChange?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const openLabor = labor.filter((x) => !x.ended_at);
  const myOpen = openLabor.find((x) => x.user_id === user?.id);
  const partsSum = parts.reduce((s, x) => s + (Number(x.quantity) || 0) * (Number(x.unit_price) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-semibold mb-2">🔗 Kunden-Status (ohne Login)</h2>
        <p className="text-sm text-slate-500 mb-3">
          Teilen Sie diesen Link mit dem Kunden – er sieht nur Status, Terminzeit und Fahrzeug (keine internen Daten).
        </p>
        {statusUrl ? (
          <div className="flex flex-wrap gap-2 items-center">
            <input readOnly className="input flex-1 min-w-[200px] text-sm font-mono" value={statusUrl} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-secondary" onClick={() => { navigator.clipboard.writeText(statusUrl); alert('Link kopiert.'); }}>
              Kopieren
            </button>
            {user?.role === 'admin' && (
              <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={rotateLink}>
                Neuen Link erzeugen
              </button>
            )}
          </div>
        ) : (
          <div className="text-sm text-amber-700">Kein Status-Token – bitte Termin speichern oder Seite neu laden.</div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">📦 Ersatzteile & Material</h2>
        <form onSubmit={addPart} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-4 text-sm">
          <input className="input md:col-span-1" placeholder="Te-Nr." value={pf.part_number} onChange={(e) => setPf({ ...pf, part_number: e.target.value })} />
          <input className="input md:col-span-2" placeholder="Bezeichnung *" required value={pf.description} onChange={(e) => setPf({ ...pf, description: e.target.value })} />
          <input className="input" type="number" step="0.01" placeholder="Menge" value={pf.quantity} onChange={(e) => setPf({ ...pf, quantity: e.target.value })} />
          <input className="input" type="number" step="0.01" placeholder="EP €" value={pf.unit_price} onChange={(e) => setPf({ ...pf, unit_price: e.target.value })} />
          <input className="input" placeholder="Lieferant" value={pf.supplier} onChange={(e) => setPf({ ...pf, supplier: e.target.value })} />
          <button type="submit" className="btn-primary md:col-span-6 justify-self-start" disabled={busy}>+ Position</button>
        </form>
        {parts.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Teile erfasst.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase border-b">
                <tr>
                  <th className="text-left py-2">Te-Nr.</th>
                  <th className="text-left py-2">Bezeichnung</th>
                  <th className="text-right py-2">Menge</th>
                  <th className="text-right py-2">EP</th>
                  <th className="text-right py-2">Summe</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {parts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 font-mono text-xs">{p.part_number || '–'}</td>
                    <td className="py-2">{p.description}</td>
                    <td className="py-2 text-right">{p.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(p.unit_price)}</td>
                    <td className="py-2 text-right">{formatCurrency(p.quantity * p.unit_price)}</td>
                    <td className="py-2 text-right">
                      <button type="button" className="text-red-600 text-xs hover:underline" onClick={() => delPart(p.id)}>Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t">
                  <td colSpan="4" className="py-2 text-right">Teile gesamt</td>
                  <td className="py-2 text-right">{formatCurrency(partsSum)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-2">⏱️ Arbeitszeit auf diesem Auftrag</h2>
        <p className="text-sm text-slate-500 mb-3">Start/Stopp für Ihren Benutzer – mehrere Einträge möglich (z. B. für Nachkalkulation).</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {!myOpen ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={startLabor}>▶ Zeit starten</button>
          ) : (
            <button type="button" className="btn-secondary" disabled={busy} onClick={stopLabor}>■ Zeit beenden</button>
          )}
          {myOpen && (
            <span className="text-sm text-amber-800 self-center">Läuft seit {format(parseISO(myOpen.started_at), 'HH:mm', { locale: de })} Uhr</span>
          )}
        </div>
        {labor.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Zeiten.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase border-b">
              <tr>
                <th className="text-left py-2">Mitarbeiter</th>
                <th className="text-left py-2">Start</th>
                <th className="text-left py-2">Ende</th>
                <th className="text-right py-2">Minuten</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {labor.map((x) => {
                let mins = '–';
                if (x.ended_at) {
                  mins = String(Math.round((new Date(x.ended_at) - new Date(x.started_at)) / 60000));
                }
                return (
                  <tr key={x.id}>
                    <td className="py-2">{x.user_name}</td>
                    <td className="py-2">{format(parseISO(x.started_at), 'dd.MM. HH:mm', { locale: de })}</td>
                    <td className="py-2">{x.ended_at ? format(parseISO(x.ended_at), 'dd.MM. HH:mm', { locale: de }) : <span className="text-amber-700">läuft…</span>}</td>
                    <td className="py-2 text-right">{mins}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
