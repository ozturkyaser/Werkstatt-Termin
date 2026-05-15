import './loadRuntimeConfig.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { ensureInitialAdmin } from './db.js';
import setupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import vehicleRoutes from './routes/vehicles.js';
import serviceRoutes from './routes/services.js';
import employeeRoutes from './routes/employees.js';
import appointmentRoutes from './routes/appointments.js';
import reminderRoutes from './routes/reminders.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import baysRoutes from './routes/bays.js';
import workshopRoutes from './routes/workshop.js';
import schedulesRoutes from './routes/schedules.js';
import apiKeysRoutes from './routes/apiKeys.js';
import availabilityRoutes from './routes/availability.js';
import publicRoutes from './routes/public.js';
import dashboardRoutes from './routes/dashboard.js';
import documentRoutes from './routes/documents.js';
import expenseRoutes from './routes/expenses.js';
import adminRoutes from './routes/admin.js';
import datevRoutes from './routes/datev.js';
import workLogRoutes from './routes/workLogs.js';
import checklistRoutes from './routes/checklists.js';
import handoverRoutes from './routes/handovers.js';
import tireStorageRoutes from './routes/tireStorage.js';
import inventoryRoutes from './routes/inventory.js';
import auditRoutes from './routes/audit.js';
import webhooksAdminRoutes from './routes/webhooks.js';
import { startReminderScheduler } from './services/reminders.js';
import { initSetupWizard } from './services/setupWizard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const raw = process.env.FRONTEND_URL;
      if (!raw || !String(raw).trim()) return callback(null, true);
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  })
);

// Das Widget darf von überall eingebettet werden
app.use('/widget', cors({ origin: '*' }), express.static(path.join(__dirname, '../public/widget')));
// Public-API: von überall (z.B. WordPress-Seite) aufrufbar
app.use('/api/public', cors({ origin: '*' }));

app.use(express.json({ limit: '25mb' })); // Bilder für KI-Scan können groß sein

app.use('/api/setup', setupRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    workshop: process.env.WORKSHOP_NAME || 'Fast Cars Autohaus',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/bays', baysRoutes);
app.use('/api/workshop', workshopRoutes);
app.use('/api/employees', schedulesRoutes); // /api/employees/:id/schedule|absences|skills
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/datev', datevRoutes);
app.use('/api/work-logs', workLogRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/handovers', handoverRoutes);
app.use('/api/tire-storage', tireStorageRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/webhooks', webhooksAdminRoutes);

app.use((err, _req, res, _next) => {
  console.error('API-Fehler:', err);
  res.status(500).json({ error: err.message || 'Interner Serverfehler' });
});

const initial = ensureInitialAdmin();
if (initial) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ⚠  Erster Start – Admin-Konto wurde erzeugt:');
  console.log(`     E-Mail:   ${initial.email}`);
  console.log(`     Passwort: ${initial.password}`);
  console.log('     Bitte nach dem ersten Login ändern!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

startReminderScheduler();
initSetupWizard();

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`🚗 Werkstatt-Termin API läuft auf http://localhost:${port}`);
});
