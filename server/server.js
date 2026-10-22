import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { dbRun, dbGet, dbAll, dbReady } from './db.js';
import { computeFuelEconomy } from './fuelEconomy.js';
import { computePlannerTasks } from './planner.js';
import { isValidOdometer, refreshOdometer } from './odometer.js';
import { scheduleBackups } from './backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Setup uploads directory
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded bills statically, but only to authenticated clients. The token
// arrives as a query param (?token=) because <img>/<iframe> cannot set headers.
// requireAuthStatic / verifyToken are hoisted function declarations (defined below).
app.use('/uploads', requireAuthStatic, express.static(UPLOADS_DIR));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const fileExt = path.extname(file.originalname);
    const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, and PDF files are allowed'));
    }
  }
});

// --- Auth Helpers & Middleware ---
let sessionSecret;

// Constant-time string comparison (hash both to a fixed length first so inputs
// of differing length don't leak via timingSafeEqual's length requirement).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Verify a session token. Returns { ok: true } or { ok: false, status, error }.
// Shared by the API middleware and the /uploads static guard.
function verifyToken(token) {
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication token required' };
  }
  const [expiryStr, signature] = token.split('.');
  if (!expiryStr || !signature) {
    return { ok: false, status: 401, error: 'Invalid token format' };
  }
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || expiry < Date.now()) {
    return { ok: false, status: 401, error: 'Session expired' };
  }
  if (!sessionSecret) {
    return { ok: false, status: 500, error: 'Auth system uninitialized' };
  }
  const expectedSig = crypto
    .createHmac('sha256', sessionSecret)
    .update(expiryStr)
    .digest('hex');
  if (!safeEqual(signature, expectedSig)) {
    return { ok: false, status: 401, error: 'Invalid token signature' };
  }
  return { ok: true };
}

function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  const result = verifyToken(token);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  next();
}

// Static-asset guard: accepts the token from the Authorization header or a
// ?token= query param (used by <img>/<iframe> loads of /uploads).
function requireAuthStatic(req, res, next) {
  const token = req.query.token || req.headers['authorization']?.split(' ')[1];
  const result = verifyToken(token);
  if (!result.ok) {
    return res.status(result.status).send(result.error);
  }
  next();
}

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const configuredPassword = process.env.ACCESS_PASSWORD || 'onyx250';

  if (!process.env.ACCESS_PASSWORD) {
    console.warn('WARNING: ACCESS_PASSWORD environment variable not set. Using default: onyx250');
  }

  if (safeEqual(password, configuredPassword)) {
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    if (!sessionSecret) {
      return res.status(500).json({ error: 'Server auth secret not ready' });
    }
    const signature = crypto
      .createHmac('sha256', sessionSecret)
      .update(expiry.toString())
      .digest('hex');
    const token = `${expiry}.${signature}`;
    return res.json({ token });
  } else {
    return res.status(401).json({ error: 'Incorrect password' });
  }
});

// File upload endpoint
app.post('/api/upload', requireAuth, upload.single('bill'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const relativePath = `/uploads/${req.file.filename}`;
  res.json({ filePath: relativePath });
});

// Remove an uploaded receipt that was never attached to a saved log (avoids
// orphaned files). basename() keeps the target strictly inside UPLOADS_DIR.
app.delete('/api/upload/:filename', requireAuth, (req, res) => {
  const fullPath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  if (fullPath.startsWith(UPLOADS_DIR) && fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
  res.json({ success: true });
});

const INVALID_ODOMETER = 'Odometer must be a whole number of km, 0 or more';

// ---------------- API ENDPOINTS ----------------

// Get status and cost analytics
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const status = await dbGet('SELECT * FROM bike_status WHERE id = 1');
    const fuelStats = await dbGet('SELECT SUM(total_cost) as total_fuel, COUNT(*) as count FROM fuel_logs');
    const maintStats = await dbGet('SELECT SUM(cost) as total_maint, COUNT(*) as count FROM maintenance_logs');

    // Average fuel economy (km/L) via the shared helper, supporting exact
    // full-to-full segments or span distance fallback when only partials exist.
    const fuelLogs = await dbAll('SELECT id, odometer, liters, full_tank FROM fuel_logs');
    const { average: avgMileage, isEstimated: isEstimatedMileage } = computeFuelEconomy(fuelLogs);

    res.json({
      currentOdometer: status?.current_odometer || 0,
      totalFuelCost: fuelStats?.total_fuel || 0,
      totalMaintenanceCost: maintStats?.total_maint || 0,
      fuelEntriesCount: fuelStats?.count || 0,
      maintenanceEntriesCount: maintStats?.count || 0,
      averageMileage: avgMileage,
      isEstimatedMileage: isEstimatedMileage || false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update odometer manually
app.post('/api/odometer', requireAuth, async (req, res) => {
  const { currentOdometer } = req.body;
  if (!isValidOdometer(currentOdometer)) {
    return res.status(400).json({ error: INVALID_ODOMETER });
  }
  try {
    await dbRun('UPDATE bike_status SET manual_odometer = ? WHERE id = 1', [currentOdometer]);
    await refreshOdometer();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fuel Logs endpoints
app.get('/api/fuel', requireAuth, async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM fuel_logs ORDER BY odometer DESC, date DESC');
    // Attach per-entry mileage and partial accumulation metadata (single source of truth)
    const { mileageById, metaById } = computeFuelEconomy(logs);
    const withMileage = logs.map(log => {
      const meta = metaById?.get(log.id) || {};
      return {
        ...log,
        mileage: mileageById.get(log.id) ?? null,
        isEstimated: meta.isEstimated ?? false,
        carriedLiters: meta.carriedLiters ?? null
      };
    });
    res.json(withMileage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fuel', requireAuth, async (req, res) => {
  const { date, odometer, liters, pricePerLiter, totalCost, fullTank } = req.body;
  
  // Presence check (== null catches null/undefined but allows a valid 0 odometer)
  if (date == null || odometer == null || liters == null || pricePerLiter == null || totalCost == null) {
    return res.status(400).json({ error: 'All fuel parameters are required' });
  }
  if (!isValidOdometer(odometer)) {
    return res.status(400).json({ error: INVALID_ODOMETER });
  }
  // Range check: cost may be 0; liters and price must be positive
  if (totalCost < 0 || liters <= 0 || pricePerLiter <= 0) {
    return res.status(400).json({ error: 'Liters and price must be greater than 0; cost cannot be negative' });
  }

  try {
    const result = await dbRun(
      'INSERT INTO fuel_logs (date, odometer, liters, price_per_liter, total_cost, full_tank) VALUES (?, ?, ?, ?, ?, ?)',
      [date, odometer, liters, pricePerLiter, totalCost, fullTank ? 1 : 0]
    );
    await refreshOdometer();
    res.json({ id: result.id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/fuel/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM fuel_logs WHERE id = ?', [req.params.id]);
    await refreshOdometer();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Maintenance Logs endpoints
app.get('/api/maintenance', requireAuth, async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM maintenance_logs ORDER BY odometer DESC, date DESC');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/maintenance', requireAuth, async (req, res) => {
  const { date, odometer, category, cost, isDiy, description, billPath } = req.body;

  if (!date || odometer == null || !category) {
    return res.status(400).json({ error: 'Date, odometer, and category are required' });
  }
  if (!isValidOdometer(odometer)) {
    return res.status(400).json({ error: INVALID_ODOMETER });
  }

  // Only accept a receipt path that points at a file directly inside /uploads.
  if (billPath && !/^\/uploads\/[\w.-]+$/.test(billPath)) {
    return res.status(400).json({ error: 'Invalid receipt path' });
  }

  try {
    const result = await dbRun(
      'INSERT INTO maintenance_logs (date, odometer, category, cost, is_diy, description, bill_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [date, odometer, category, cost || 0, isDiy ? 1 : 0, description || '', billPath || null]
    );

    await refreshOdometer();

    res.json({ id: result.id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/maintenance/:id', requireAuth, async (req, res) => {
  try {
    // Delete linked receipt if present. Resolve strictly inside UPLOADS_DIR via
    // basename() so a crafted bill_path (e.g. "/uploads/../../etc/x") can never
    // point fs.unlinkSync outside the uploads folder.
    const log = await dbGet('SELECT bill_path FROM maintenance_logs WHERE id = ?', [req.params.id]);
    if (log && log.bill_path) {
      const fullPath = path.join(UPLOADS_DIR, path.basename(log.bill_path));
      if (fullPath.startsWith(UPLOADS_DIR) && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await dbRun('DELETE FROM maintenance_logs WHERE id = ?', [req.params.id]);
    await refreshOdometer();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Maintenance Planner endpoints ---

app.get('/api/planner', requireAuth, async (req, res) => {
  try {
    const status = await dbGet('SELECT current_odometer FROM bike_status WHERE id = 1');
    const currentOdo = status?.current_odometer || 0;
    const tasks = await dbAll('SELECT * FROM maintenance_planner');

    // Due dates, statuses and consumed-life percentages (single source of truth)
    res.json({
      currentOdometer: currentOdo,
      tasks: computePlannerTasks(tasks, currentOdo)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planner', requireAuth, async (req, res) => {
  const { taskName, intervalKm, intervalMonths, lastDoneDate, lastDoneOdometer } = req.body;
  if (!taskName) {
    return res.status(400).json({ error: 'Task name is required' });
  }
  if (intervalKm == null && intervalMonths == null) {
    return res.status(400).json({ error: 'At least one interval (km or months) must be specified' });
  }
  if (lastDoneOdometer != null && !isValidOdometer(lastDoneOdometer)) {
    return res.status(400).json({ error: INVALID_ODOMETER });
  }
  try {
    const result = await dbRun(
      'INSERT INTO maintenance_planner (task_name, interval_km, interval_months, last_done_date, last_done_odometer, is_custom) VALUES (?, ?, ?, ?, ?, 1)',
      [
        taskName,
        intervalKm ? parseInt(intervalKm, 10) : null,
        intervalMonths ? parseInt(intervalMonths, 10) : null,
        lastDoneDate || null,
        lastDoneOdometer ?? null
      ]
    );
    res.json({ id: result.id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/planner/:id', requireAuth, async (req, res) => {
  const { taskName, intervalKm, intervalMonths, lastDoneDate, lastDoneOdometer } = req.body;
  if (!taskName) {
    return res.status(400).json({ error: 'Task name is required' });
  }
  if (lastDoneOdometer != null && !isValidOdometer(lastDoneOdometer)) {
    return res.status(400).json({ error: INVALID_ODOMETER });
  }
  try {
    await dbRun(
      'UPDATE maintenance_planner SET task_name = ?, interval_km = ?, interval_months = ?, last_done_date = ?, last_done_odometer = ? WHERE id = ?',
      [
        taskName,
        intervalKm ? parseInt(intervalKm, 10) : null,
        intervalMonths ? parseInt(intervalMonths, 10) : null,
        lastDoneDate || null,
        lastDoneOdometer ?? null,
        req.params.id
      ]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planner/:id/complete', requireAuth, async (req, res) => {
  const { completionDate, completionOdometer } = req.body;
  if (!completionDate || completionOdometer == null) {
    return res.status(400).json({ error: 'Completion date and odometer are required' });
  }
  if (!isValidOdometer(completionOdometer)) {
    return res.status(400).json({ error: INVALID_ODOMETER });
  }
  try {
    await dbRun(
      'UPDATE maintenance_planner SET last_done_date = ?, last_done_odometer = ? WHERE id = ?',
      [completionDate, completionOdometer, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/planner/:id', requireAuth, async (req, res) => {
  try {
    // Only user-defined tasks are deletable; factory defaults are protected
    // (mirrors the UI, which hides delete for them).
    const result = await dbRun('DELETE FROM maintenance_planner WHERE id = ? AND is_custom = 1', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Task not found or is a protected factory default' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Unmatched API routes return JSON 404 (not the SPA's index.html), so clients
// always get a parseable error for a bad endpoint.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve frontend build in production
const frontendBuildPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Server is running. Frontend build not detected.');
  });
}

// Global error handler
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || 'Something went wrong on the server' });
});

// Start Server only after the database schema is ready (avoids startup race)
dbReady.then(async () => {
  try {
    const status = await dbGet('SELECT session_secret FROM bike_status WHERE id = 1');
    sessionSecret = status?.session_secret;
    if (!sessionSecret) {
      console.error('CRITICAL: No session secret found in database.');
    }
  } catch (err) {
    console.error('Failed to load session secret from database:', err);
  }

  scheduleBackups();

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
});
