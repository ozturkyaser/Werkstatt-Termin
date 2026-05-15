import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Checklists() {
  const [templates, setTemplates] = useState([]);
  const [services, setServices] = useState([]);
  const [editing, setEditing] = useState(null); // Template (neu oder bestehend)
  const [seeding, setSeeding] = useState(false);
  const [stage, setStage] = useState('arbeit');

  async function load() {
    const [t, s] = await Promise.all([
      api.get('/checklists/templates'),
      api.get('/services'),
    ]);
    setTemplates(t);
    setServices(s);
  }
  useEffect(() => { load(); }, []);

  async function seedDefaults(mode) {
    setSeeding(true);
    try {
      const res = await api.post('/checklists/seed-defaults', { mode });
      alert(`✓ ${res.created} Vorlagen angelegt, ${res.skipped} übersprungen${res.cleared ? `, ${res.cleared} gelöscht` : ''}.`);
      load();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setSeeding(false);
    }
  }

  async function remove(id) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    await api.del(`/checklists/templates/${id}`);
    load();
  }

  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))].sort();

  const filtered = templates.filter((t) => (t.stage || 'arbeit') === stage);
  const byScope = {
    global: filtered.filter((t) => t.scope === 'global'),
    category: filtered.filter((t) => t.scope === 'category'),
    service: filtered.filter((t) => t.scope === 'service'),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">📋 Checklisten</h1>
          <p className="text-slate-500 text-sm">
            {stage === 'arbeit'
              ? 'Werden am Ende der Arbeit vom Mitarbeiter abgehakt.'
              : 'Werden bei Fahrzeug-Übergabe vom Kunden bestätigt.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={seeding} onClick={() => seedDefaults('append')}>
            📥 Standard-Vorlagen laden
          </button>
          <button className="btn-primary" onClick={() => setEditing({ scope: 'category', stage, items: [] })}>
            + Neue Checkliste
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        <TabBtn active={stage === 'arbeit'} onClick={() => setStage('arbeit')}>
          🛠️ Arbeits-Checklisten ({templates.filter((t) => (t.stage || 'arbeit') === 'arbeit').length})
        </TabBtn>
        <TabBtn active={stage === 'uebergabe'} onClick={() => setStage('uebergabe')}>
          🤝 Übergabe-Checklisten ({templates.filter((t) => t.stage === 'uebergabe').length})
        </TabBtn>
      </div>

      {templates.length === 0 && (
        <div className="card p-6 text-center">
          <div className="text-slate-500 mb-3">Noch keine Checklisten angelegt.</div>
          <button className="btn-primary" onClick={() => seedDefaults('append')}>
            Standard-Vorlagen importieren (Bremsen, Öl, Reifen, HU, …)
          </button>
        </div>
      )}

      {['category', 'global', 'service'].map((scope) => byScope[scope].length > 0 && (
        <div key={scope} className="card p-4">
          <h2 className="font-semibold mb-3 capitalize">
            {scope === 'category' ? 'Pro Leistungs-Kategorie' : scope === 'global' ? 'Global (immer)' : 'Pro Einzelleistung'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byScope[scope].map((t) => (
              <div key={t.id} className="border rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-slate-500">
                      {t.scope === 'category' ? `Kategorie: ${t.category}` : t.scope === 'service' ? `Leistung: ${t.service_name || '—'}` : 'Global'}
                      {' · '}{t.item_count} Punkte
                      {!t.active && ' · inaktiv'}
                    </div>
                    {t.description && <div className="text-xs text-slate-600 mt-1">{t.description}</div>}
                  </div>
                  <div className="flex gap-1">
                    <button className="text-xs text-blue-700 hover:underline" onClick={async () => {
                      const full = await api.get(`/checklists/templates/${t.id}`);
                      setEditing(full);
                    }}>Bearbeiten</button>
                    <button className="text-xs text-red-700 hover:underline" onClick={() => remove(t.id)}>Löschen</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <TemplateEditor
          template={editing}
          services={services}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
        active ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TemplateEditor({ template, services, categories, onClose, onSaved }) {
  const [data, setData] = useState(() => ({
    name: template?.name || '',
    scope: template?.scope || 'category',
    service_id: template?.service_id || null,
    category: template?.category || '',
    description: template?.description || '',
    stage: template?.stage || 'arbeit',
    active: template?.active !== 0,
    items: template?.items?.length ? template.items.map((i) => ({ ...i })) : [{ label: '', required: 1, input_type: 'check' }],
  }));
  const [saving, setSaving] = useState(false);
  const isNew = !template?.id;

  function setItem(i, patch) {
    setData((d) => ({ ...d, items: d.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  }
  function addItem() {
    setData((d) => ({ ...d, items: [...d.items, { label: '', required: 1, input_type: 'check' }] }));
  }
  function removeItem(i) {
    setData((d) => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  }
  function move(i, dir) {
    setData((d) => {
      const arr = [...d.items];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, items: arr };
    });
  }

  async function save() {
    if (!data.name.trim()) return alert('Name fehlt');
    if (data.scope === 'service' && !data.service_id) return alert('Leistung auswählen');
    if (data.scope === 'category' && !data.category) return alert('Kategorie auswählen');
    const cleanItems = data.items.filter((i) => i.label?.trim());
    if (cleanItems.length === 0) return alert('Mindestens ein Prüfpunkt nötig');

    setSaving(true);
    try {
      const payload = { ...data, items: cleanItems };
      if (isNew) {
        await api.post('/checklists/templates', payload);
      } else {
        await api.put(`/checklists/templates/${template.id}`, payload);
      }
      onSaved();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} wide title={isNew ? 'Neue Checkliste' : `Checkliste bearbeiten – ${template.name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input className="input" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phase</label>
            <select className="input" value={data.stage} onChange={(e) => setData({ ...data, stage: e.target.value })}>
              <option value="arbeit">🛠️ Arbeits-Checkliste (Mitarbeiter)</option>
              <option value="uebergabe">🤝 Übergabe-Checkliste (Kunde)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gültigkeitsbereich</label>
            <select className="input" value={data.scope} onChange={(e) => setData({ ...data, scope: e.target.value })}>
              <option value="category">Pro Kategorie</option>
              <option value="service">Pro Einzelleistung</option>
              <option value="global">Global (immer)</option>
            </select>
          </div>
          {data.scope === 'category' && (
            <div>
              <label className="block text-sm font-medium mb-1">Kategorie *</label>
              <input list="cats" className="input" value={data.category}
                     onChange={(e) => setData({ ...data, category: e.target.value })} />
              <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          )}
          {data.scope === 'service' && (
            <div>
              <label className="block text-sm font-medium mb-1">Leistung *</label>
              <select className="input" value={data.service_id || ''}
                      onChange={(e) => setData({ ...data, service_id: Number(e.target.value) || null })}>
                <option value="">– wählen –</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Beschreibung</label>
            <input className="input" value={data.description || ''} onChange={(e) => setData({ ...data, description: e.target.value })} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Prüfpunkte ({data.items.length})</div>
            <button className="btn-ghost text-sm" onClick={addItem}>+ Punkt hinzufügen</button>
          </div>
          <div className="space-y-2">
            {data.items.map((it, i) => (
              <div key={i} className="flex items-start gap-2 border rounded p-2">
                <div className="flex-col gap-1 flex text-xs">
                  <button className="px-1" onClick={() => move(i, -1)}>↑</button>
                  <button className="px-1" onClick={() => move(i, 1)}>↓</button>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
                  <input className="input md:col-span-5" placeholder="Prüfpunkt"
                         value={it.label || ''} onChange={(e) => setItem(i, { label: e.target.value })} />
                  <input className="input md:col-span-4" placeholder="Hinweis / Sollwert"
                         value={it.hint || ''} onChange={(e) => setItem(i, { hint: e.target.value })} />
                  <select className="input md:col-span-2"
                          value={it.input_type || 'check'} onChange={(e) => setItem(i, { input_type: e.target.value })}>
                    <option value="check">Abhaken</option>
                    <option value="text">Text</option>
                    <option value="number">Zahl</option>
                  </select>
                  <label className="flex items-center gap-1 md:col-span-1 text-xs">
                    <input type="checkbox" checked={!!it.required} onChange={(e) => setItem(i, { required: e.target.checked ? 1 : 0 })} />
                    Pflicht
                  </label>
                </div>
                <button className="text-red-600 text-sm" onClick={() => removeItem(i)}>×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center border-t pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!data.active} onChange={(e) => setData({ ...data, active: e.target.checked })} />
            Aktiv
          </label>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
