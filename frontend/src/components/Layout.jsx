import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/kalender', label: 'Terminkalender', icon: '📅' },
  { to: '/termine', label: 'Termine', icon: '🗂️' },
  { to: '/kunden', label: 'Kunden', icon: '👥' },
  { to: '/fahrzeuge', label: 'Fahrzeuge', icon: '🚗' },
  { to: '/reifen-lager', label: 'Reifen-Lager', icon: '🛞' },
  { to: '/lager', label: 'Teile-Lager', icon: '📦' },
  { to: '/leistungen', label: 'Leistungen', icon: '🔧' },
  { to: '/checklisten', label: 'Checklisten', icon: '📋', adminOnly: true },
  { to: '/integrationen', label: 'Webhooks', icon: '🔔', adminOnly: true },
  { to: '/audit', label: 'Aktivitätsprotokoll', icon: '📜', adminOnly: true },
  { to: '/dokumente', label: 'Dokumente', icon: '📄' },
  { to: '/buchhaltung', label: 'Buchhaltung', icon: '💶', adminOnly: true },
  { to: '/buehnen', label: 'Bühnen', icon: '🏗️', adminOnly: true },
  { to: '/werkstatt', label: 'Werkstatt-Zeiten', icon: '🕑', adminOnly: true },
  { to: '/mitarbeiter', label: 'Mitarbeiter', icon: '👷', adminOnly: true },
  { to: '/einstellungen', label: 'Einstellungen', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] bg-slate-50">
      <aside className="bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔧</span>
            <div>
              <div className="font-bold text-lg leading-tight">Fast Cars</div>
              <div className="text-xs text-slate-400">Werkstatt-Termine</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.filter((n) => !n.adminOnly || user?.role === 'admin').map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-brand-600 text-white font-semibold shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="text-lg">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-sm font-medium">{user?.full_name}</div>
          <div className="text-xs text-slate-400 mb-3 capitalize">{user?.role}</div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full text-sm py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
          >
            Abmelden
          </button>
        </div>
      </aside>

      <main className="overflow-auto">
        <div className="px-8 py-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
