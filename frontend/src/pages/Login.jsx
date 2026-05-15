import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@werkstatt.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    fetch('/api/setup/open')
      .then((r) => r.json())
      .then((d) => setSetupOpen(Boolean(d.setupRequired)))
      .catch(() => setSetupOpen(false));
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-800 p-4">
      <div className="w-full max-w-md card p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🔧</div>
          <h1 className="text-2xl font-bold">Fast Cars Autohaus</h1>
          <p className="text-slate-500 text-sm">Werkstatt-Terminkalender</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">E-Mail</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Passwort</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {setupOpen && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-3 py-2 space-y-2">
              <p>Der Server wartet auf die <strong>Ersteinrichtung</strong>. Token steht in den Backend-Logs.</p>
              <Link to="/einrichtung" className="text-brand-700 font-medium hover:underline">→ Einrichtungs-Wizard öffnen</Link>
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t text-xs text-slate-500">
          Erststart-Zugang: <code>admin@werkstatt.local</code> / <code>admin123</code>
        </div>
      </div>
    </div>
  );
}
