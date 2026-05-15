import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/Calendar';
import AppointmentsList from './pages/AppointmentsList';
import AppointmentDetail from './pages/AppointmentDetail';
import AppointmentPrint from './pages/AppointmentPrint';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Vehicles from './pages/Vehicles';
import VehicleDetail from './pages/VehicleDetail';
import Services from './pages/Services';
import Employees from './pages/Employees';
import Settings from './pages/Settings';
import Bays from './pages/Bays';
import Workshop from './pages/Workshop';
import Documents from './pages/Documents';
import Accounting from './pages/Accounting';
import Checklists from './pages/Checklists';
import PublicAppointmentStatus from './pages/PublicAppointmentStatus';
import Integrations from './pages/Integrations';
import AuditLog from './pages/AuditLog';
import TireStorage from './pages/TireStorage';
import Inventory from './pages/Inventory';
import SetupWizard from './pages/SetupWizard';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-500">
        Lädt…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/einrichtung" element={<SetupWizard />} />
      <Route path="/status/:token" element={<PublicAppointmentStatus />} />
      <Route path="/termin/:id/drucken" element={
        <Protected><AppointmentPrint /></Protected>
      } />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="kalender" element={<CalendarPage />} />
        <Route path="termine" element={<AppointmentsList />} />
        <Route path="termine/:id" element={<AppointmentDetail />} />
        <Route path="kunden" element={<Customers />} />
        <Route path="kunden/:id" element={<CustomerDetail />} />
        <Route path="fahrzeuge" element={<Vehicles />} />
        <Route path="fahrzeuge/:id" element={<VehicleDetail />} />
        <Route path="leistungen" element={<Services />} />
        <Route path="mitarbeiter" element={<Employees />} />
        <Route path="buehnen" element={<Bays />} />
        <Route path="werkstatt" element={<Workshop />} />
        <Route path="reifen-lager" element={<TireStorage />} />
        <Route path="lager" element={<Inventory />} />
        <Route path="dokumente" element={<Documents />} />
        <Route path="buchhaltung" element={<Accounting />} />
        <Route path="checklisten" element={<Checklists />} />
        <Route path="integrationen" element={<Integrations />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="einstellungen" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
