import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downscaleImage(file, maxDim = 2000, quality = 0.85) {
  if (!file.type.startsWith('image/')) return fileToDataUrl(file);
  const dataUrl = await fileToDataUrl(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Picker für Kunde + Fahrzeug in einem Schritt.
 * Props:
 *  - customerId, vehicleId (aktuelle Auswahl)
 *  - onChange({ customerId, vehicleId, customer, vehicle })
 */
export default function CustomerVehiclePicker({ customerId, vehicleId, onChange, prefillLicensePlate = '' }) {
  const [mode, setMode] = useState('search'); // 'search' | 'create' | 'scanning' | 'review-scan'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [customerVehicles, setCustomerVehicles] = useState([]);
  const [openList, setOpenList] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const fileInputRef = useRef();

  // Kennzeichen aus Deep-Link (z. B. falscher Auftrag → neuer Termin)
  useEffect(() => {
    const kz = (prefillLicensePlate || '').trim();
    if (kz.length < 2 || customerId) return;
    setQuery(kz);
    setOpenList(true);
  }, [prefillLicensePlate, customerId]);

  // Beim Mount: falls schon IDs vorgegeben → laden und anzeigen
  useEffect(() => {
    if (customerId && !selectedCustomer) {
      api.get(`/customers/${customerId}`).then((c) => {
        setSelectedCustomer(c);
        setCustomerVehicles(c.vehicles || []);
        if (vehicleId) {
          const v = (c.vehicles || []).find((x) => x.id === Number(vehicleId));
          if (v) setSelectedVehicle(v);
        }
      });
    }
     
  }, [customerId]);

  // Suche Kunden + Fahrzeuge nach Eingabe
  useEffect(() => {
    if (mode !== 'search' || selectedCustomer) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const [customers, vehicles] = await Promise.all([
        api.get(`/customers?search=${encodeURIComponent(q)}`),
        api.get(`/vehicles?search=${encodeURIComponent(q)}`),
      ]);
      const combined = [
        ...vehicles.slice(0, 8).map((v) => ({
          kind: 'vehicle',
          id: `v-${v.id}`,
          label: `${v.license_plate} · ${v.brand || ''} ${v.model || ''}`.trim(),
          sub: `Halter: ${v.first_name} ${v.last_name}`,
          vehicle: v,
        })),
        ...customers.slice(0, 8).map((c) => ({
          kind: 'customer',
          id: `c-${c.id}`,
          label: `${c.last_name}, ${c.first_name}`,
          sub: [c.phone, c.email].filter(Boolean).join(' · '),
          customer: c,
        })),
      ];
      setResults(combined);
      setOpenList(true);
    }, 200);
    return () => clearTimeout(t);
  }, [query, mode, selectedCustomer]);

  async function pickCustomer(c) {
    const full = await api.get(`/customers/${c.id}`);
    setSelectedCustomer(full);
    setCustomerVehicles(full.vehicles || []);
    setSelectedVehicle((full.vehicles || [])[0] || null);
    setOpenList(false); setQuery('');
    emit(full, (full.vehicles || [])[0] || null);
  }
  async function pickVehicle(v) {
    const full = await api.get(`/customers/${v.customer_id}`);
    setSelectedCustomer(full);
    setCustomerVehicles(full.vehicles || []);
    const vv = full.vehicles.find((x) => x.id === v.id) || v;
    setSelectedVehicle(vv);
    setOpenList(false); setQuery('');
    emit(full, vv);
  }
  function emit(c, v) {
    onChange?.({
      customerId: c?.id || null,
      vehicleId: v?.id || null,
      customer: c,
      vehicle: v,
    });
  }
  function reset() {
    setSelectedCustomer(null); setSelectedVehicle(null);
    setCustomerVehicles([]); setQuery(''); setResults([]); setMode('search');
    setScanInfo(null);
    emit(null, null);
  }

  async function handleScanFile(file) {
    if (!file) return;
    setScanning(true); setError(''); setScanInfo(null);
    try {
      const image = await downscaleImage(file, 2000, 0.85);
      const result = await api.post('/ai/scan-and-import', { image, createIfMissing: true });
      if (result.customer && result.vehicle) {
        const full = await api.get(`/customers/${result.customer.id}`);
        const v = full.vehicles.find((x) => x.id === result.vehicle.id) || result.vehicle;
        setSelectedCustomer(full);
        setCustomerVehicles(full.vehicles || []);
        setSelectedVehicle(v);
        setScanInfo({
          confidence: result.extracted?.confidence,
          wasCreated: result.extracted?.vehicle?.license_plate === v.license_plate,
          raw: result.extracted,
        });
        emit(full, v);
      } else if (result.customer && !result.vehicle) {
        setError('KI konnte Fahrzeugdaten nicht sicher lesen. Bitte manuell anlegen.');
        setScanInfo({ raw: result.extracted });
      } else {
        setError('Keine Halterdaten erkannt – bitte manuell erfassen.');
        setScanInfo({ raw: result.extracted });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ---------- UI ----------

  if (selectedCustomer && selectedVehicle) {
    return (
      <div className="border rounded-lg p-3 bg-brand-50/40 border-brand-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center flex-wrap gap-2">
              <span className="font-mono font-semibold text-lg">{selectedVehicle.license_plate}</span>
              <span className="text-slate-700">{selectedVehicle.brand} {selectedVehicle.model}</span>
              {selectedVehicle.year && <span className="text-slate-400 text-sm">({selectedVehicle.year})</span>}
            </div>
            <div className="text-sm text-slate-700">
              👤 <span className="font-medium">{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
              {selectedCustomer.phone && <span className="text-slate-500"> · {selectedCustomer.phone}</span>}
            </div>
            {scanInfo && (
              <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1 inline-block">
                ✨ KI-Scan erfolgreich {scanInfo.confidence && `(Konfidenz: ${scanInfo.confidence})`}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {customerVehicles.length > 1 && (
              <select className="input py-1 text-xs" value={selectedVehicle.id}
                onChange={(e) => {
                  const v = customerVehicles.find((x) => x.id === Number(e.target.value));
                  setSelectedVehicle(v); emit(selectedCustomer, v);
                }}>
                {customerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.license_plate} · {v.brand} {v.model}</option>
                ))}
              </select>
            )}
            <button type="button" className="btn-ghost text-xs" onClick={reset}>
              Ändern
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedCustomer && !selectedVehicle) {
    return (
      <QuickVehicleForm
        customer={selectedCustomer}
        existing={customerVehicles}
        onCancel={reset}
        onCreated={(v) => { setSelectedVehicle(v); setCustomerVehicles((x) => [...x, v]); emit(selectedCustomer, v); }}
        onPick={(v) => { setSelectedVehicle(v); emit(selectedCustomer, v); }}
      />
    );
  }

  if (mode === 'create') {
    return (
      <QuickCreateBoth
        defaultLicensePlate={(prefillLicensePlate || '').trim()}
        onCancel={() => setMode('search')}
        onCreated={({ customer, vehicle }) => {
          setSelectedCustomer(customer);
          setCustomerVehicles(vehicle ? [vehicle] : []);
          setSelectedVehicle(vehicle || null);
          emit(customer, vehicle || null);
        }}
      />
    );
  }

  // Suchmodus (Default)
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="input"
            placeholder="Kennzeichen, Name, Telefon oder E-Mail suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpenList(true)}
          />
          {openList && results.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 card max-h-72 overflow-auto">
              {results.map((r) => (
                <button type="button" key={r.id}
                  onClick={() => r.kind === 'vehicle' ? pickVehicle(r.vehicle) : pickCustomer(r.customer)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 uppercase w-14">
                      {r.kind === 'vehicle' ? '🚗 KFZ' : '👤 Kunde'}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{r.label}</div>
                      {r.sub && <div className="text-xs text-slate-500">{r.sub}</div>}
                    </div>
                  </div>
                </button>
              ))}
              <button type="button"
                onClick={() => setMode('create')}
                className="w-full text-left px-3 py-2 hover:bg-brand-50 text-brand-700 font-medium text-sm">
                ➕ Neuen Kunden + Fahrzeug anlegen
              </button>
            </div>
          )}
        </div>
        <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setMode('create')}>
          ➕ Neu
        </button>
        <button type="button" className="btn-secondary whitespace-nowrap relative"
          onClick={() => fileInputRef.current?.click()} disabled={scanning}>
          {scanning ? '📷 Scannen…' : '📷 Fahrzeugschein scannen'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
          className="hidden"
          onChange={(e) => handleScanFile(e.target.files?.[0])} />
      </div>

      {error && (
        <div className="mt-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {query.length >= 2 && results.length === 0 && (
        <div className="mt-2 text-sm text-slate-500">
          Nichts gefunden.{' '}
          <button type="button" onClick={() => setMode('create')}
            className="text-brand-600 hover:underline">
            Neu anlegen →
          </button>
        </div>
      )}
      <div className="mt-1 text-xs text-slate-500">
        Tipp: Fahrzeugschein fotografieren – die KI liest alles automatisch aus.
      </div>
    </div>
  );
}

// ----- Inline-Formulare -----

function Field({ label, children, span = 1 }) {
  const col = span === 2 ? 'col-span-2' : '';
  return (
    <div className={col}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function QuickCreateBoth({ onCancel, onCreated, defaultLicensePlate = '' }) {
  const [f, setF] = useState({
    first_name: '', last_name: '', phone: '', email: '', whatsapp: '', address: '',
    license_plate: (defaultLicensePlate || '').toUpperCase(), brand: '', model: '', year: '', vin: '', fuel_type: '', mileage: '', color: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const customer = await api.post('/customers', {
        first_name: f.first_name, last_name: f.last_name,
        phone: f.phone, email: f.email, whatsapp: f.whatsapp, address: f.address,
      });
      let vehicle = null;
      if (f.license_plate) {
        vehicle = await api.post('/vehicles', {
          customer_id: customer.id,
          license_plate: f.license_plate,
          brand: f.brand, model: f.model,
          year: f.year ? Number(f.year) : null,
          vin: f.vin,
          fuel_type: f.fuel_type,
          mileage: f.mileage ? Number(f.mileage) : null,
          color: f.color,
        });
      }
      onCreated({ customer, vehicle });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={save} className="border rounded-lg p-4 bg-slate-50 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">➕ Neuer Kunde & Fahrzeug</h3>
        <button type="button" className="text-slate-400 hover:text-slate-700 text-xl" onClick={onCancel}>×</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Vorname *"><input className="input" required value={f.first_name} onChange={(e) => upd('first_name', e.target.value)} /></Field>
        <Field label="Nachname *"><input className="input" required value={f.last_name} onChange={(e) => upd('last_name', e.target.value)} /></Field>
        <Field label="Telefon"><input className="input" value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></Field>
        <Field label="E-Mail"><input type="email" className="input" value={f.email} onChange={(e) => upd('email', e.target.value)} /></Field>
        <Field label="WhatsApp"><input className="input" value={f.whatsapp} onChange={(e) => upd('whatsapp', e.target.value)} /></Field>
        <Field label="Adresse" span={3}><input className="input" value={f.address} onChange={(e) => upd('address', e.target.value)} /></Field>
      </div>

      <div className="pt-2 border-t text-xs font-semibold text-slate-500 uppercase">Fahrzeug</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Kennzeichen"><input className="input uppercase" value={f.license_plate} onChange={(e) => upd('license_plate', e.target.value.toUpperCase())} /></Field>
        <Field label="Marke"><input className="input" value={f.brand} onChange={(e) => upd('brand', e.target.value)} /></Field>
        <Field label="Modell"><input className="input" value={f.model} onChange={(e) => upd('model', e.target.value)} /></Field>
        <Field label="Baujahr"><input type="number" className="input" value={f.year} onChange={(e) => upd('year', e.target.value)} /></Field>
        <Field label="Kraftstoff">
          <select className="input" value={f.fuel_type} onChange={(e) => upd('fuel_type', e.target.value)}>
            <option value="">–</option><option>Benzin</option><option>Diesel</option>
            <option>Hybrid</option><option>Elektro</option><option>LPG/CNG</option>
          </select>
        </Field>
        <Field label="Km-Stand"><input type="number" className="input" value={f.mileage} onChange={(e) => upd('mileage', e.target.value)} /></Field>
        <Field label="Farbe"><input className="input" value={f.color} onChange={(e) => upd('color', e.target.value)} /></Field>
        <Field label="VIN"><input className="input" value={f.vin} onChange={(e) => upd('vin', e.target.value)} /></Field>
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Speichern…' : 'Anlegen & übernehmen'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}

function QuickVehicleForm({ customer, existing, onCancel, onCreated, onPick }) {
  const [f, setF] = useState({
    license_plate: '', brand: '', model: '', year: '', fuel_type: '', mileage: '', vin: '', color: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const v = await api.post('/vehicles', {
        customer_id: customer.id,
        license_plate: f.license_plate,
        brand: f.brand, model: f.model,
        year: f.year ? Number(f.year) : null,
        vin: f.vin, fuel_type: f.fuel_type,
        mileage: f.mileage ? Number(f.mileage) : null,
        color: f.color,
      });
      onCreated(v);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={save} className="border rounded-lg p-4 bg-slate-50 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">🚗 Fahrzeug für {customer.first_name} {customer.last_name}</h3>
        <button type="button" className="text-slate-400 hover:text-slate-700 text-xl" onClick={onCancel}>×</button>
      </div>

      {existing?.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1">Bestehende Fahrzeuge:</div>
          <div className="flex flex-wrap gap-2">
            {existing.map((v) => (
              <button type="button" key={v.id}
                onClick={() => onPick(v)}
                className="btn-secondary text-xs">
                {v.license_plate} · {v.brand} {v.model}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-500 mt-2">oder neues Fahrzeug erfassen:</div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Kennzeichen *"><input className="input uppercase" required value={f.license_plate} onChange={(e) => upd('license_plate', e.target.value.toUpperCase())} /></Field>
        <Field label="Marke"><input className="input" value={f.brand} onChange={(e) => upd('brand', e.target.value)} /></Field>
        <Field label="Modell"><input className="input" value={f.model} onChange={(e) => upd('model', e.target.value)} /></Field>
        <Field label="Baujahr"><input type="number" className="input" value={f.year} onChange={(e) => upd('year', e.target.value)} /></Field>
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Speichern…' : 'Anlegen'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
