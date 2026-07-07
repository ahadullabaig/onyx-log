import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { dbRun, dbGet, dbAll, dbReady } from './db.js';

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

// Serve uploaded bills statically
app.use('/uploads', express.static(UPLOADS_DIR));

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

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const [expiryStr, signature] = token.split('.');
    if (!expiryStr || !signature) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || expiry < Date.now()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (!sessionSecret) {
      return res.status(500).json({ error: 'Auth system uninitialized' });
    }

    const expectedSig = crypto
      .createHmac('sha256', sessionSecret)
      .update(expiryStr)
      .digest('hex');

    if (signature !== expectedSig) {
      return res.status(401).json({ error: 'Invalid token signature' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const configuredPassword = process.env.ACCESS_PASSWORD || 'onyx250';

  if (!process.env.ACCESS_PASSWORD) {
    console.warn('WARNING: ACCESS_PASSWORD environment variable not set. Using default: onyx250');
  }

  if (password === configuredPassword) {
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

// Sync odometer helper
async function syncOdometer(loggedOdo) {
  const status = await dbGet('SELECT current_odometer FROM bike_status WHERE id = 1');
  if (status && loggedOdo > status.current_odometer) {
    await dbRun('UPDATE bike_status SET current_odometer = ? WHERE id = 1', [loggedOdo]);
  }
}

// ---------------- API ENDPOINTS ----------------

// Get status and cost analytics
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const status = await dbGet('SELECT * FROM bike_status WHERE id = 1');
    const fuelStats = await dbGet('SELECT SUM(total_cost) as total_fuel, COUNT(*) as count FROM fuel_logs');
    const maintStats = await dbGet('SELECT SUM(cost) as total_maint, COUNT(*) as count FROM maintenance_logs');

    // Average fuel economy (km/L) using the full-to-full method — consistent with
    // the per-entry calculation in the Fuel Log UI. Only distance/liters between
    // consecutive FULL fill-ups count; liters from partial fills in between are
    // carried into the next full-to-full segment.
    const fuelLogs = await dbAll('SELECT odometer, liters, full_tank FROM fuel_logs ORDER BY odometer ASC');
    let avgMileage = 0;
    let segDistance = 0;
    let segLiters = 0;
    let lastFullIdx = -1;

    for (let i = 0; i < fuelLogs.length; i++) {
      if (fuelLogs[i].full_tank === 1) {
        if (lastFullIdx !== -1) {
          const distance = fuelLogs[i].odometer - fuelLogs[lastFullIdx].odometer;
          let liters = 0;
          for (let k = lastFullIdx + 1; k <= i; k++) {
            liters += fuelLogs[k].liters;
          }
          if (distance > 0 && liters > 0) {
            segDistance += distance;
            segLiters += liters;
          }
        }
        lastFullIdx = i;
      }
    }

    if (segLiters > 0) {
      avgMileage = segDistance / segLiters;
    }

    res.json({
      currentOdometer: status?.current_odometer || 0,
      lastChainCleanOdometer: status?.last_chain_clean_odometer || 0,
      totalFuelCost: fuelStats?.total_fuel || 0,
      totalMaintenanceCost: maintStats?.total_maint || 0,
      fuelEntriesCount: fuelStats?.count || 0,
      maintenanceEntriesCount: maintStats?.count || 0,
      averageMileage: avgMileage
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update odometer manually or clean chain
app.post('/api/odometer', requireAuth, async (req, res) => {
  const { currentOdometer, lastChainCleanOdometer } = req.body;
  try {
    if (currentOdometer !== undefined) {
      await dbRun('UPDATE bike_status SET current_odometer = ? WHERE id = 1', [currentOdometer]);
    }
    if (lastChainCleanOdometer !== undefined) {
      await dbRun('UPDATE bike_status SET last_chain_clean_odometer = ? WHERE id = 1', [lastChainCleanOdometer]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fuel Logs endpoints
app.get('/api/fuel', requireAuth, async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM fuel_logs ORDER BY odometer DESC, date DESC');
    res.json(logs);
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
  // Range check: odometer/cost may be 0; liters and price must be positive
  if (odometer < 0 || totalCost < 0 || liters <= 0 || pricePerLiter <= 0) {
    return res.status(400).json({ error: 'Liters and price must be greater than 0; odometer and cost cannot be negative' });
  }

  try {
    const result = await dbRun(
      'INSERT INTO fuel_logs (date, odometer, liters, price_per_liter, total_cost, full_tank) VALUES (?, ?, ?, ?, ?, ?)',
      [date, odometer, liters, pricePerLiter, totalCost, fullTank ? 1 : 0]
    );
    await syncOdometer(odometer);
    res.json({ id: result.id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/fuel/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM fuel_logs WHERE id = ?', [req.params.id]);
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

  if (!date || !odometer || !category) {
    return res.status(400).json({ error: 'Date, odometer, and category are required' });
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

    // Sync primary odometer
    await syncOdometer(odometer);

    // Specific logic for Chain Maintenance: automatically update last chain clean odometer
    if (category === 'Chain Maintenance') {
      const status = await dbGet('SELECT last_chain_clean_odometer FROM bike_status WHERE id = 1');
      if (!status || odometer > status.last_chain_clean_odometer) {
        await dbRun('UPDATE bike_status SET last_chain_clean_odometer = ? WHERE id = 1', [odometer]);
      }
    }

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
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calculatedTasks = tasks.map(task => {
      let dueInKm = null;
      let dueInDays = null;
      let nextDueOdo = null;
      let nextDueDate = null;
      let isConfigured = task.last_done_date !== null && task.last_done_odometer !== null;

      if (isConfigured) {
        if (task.interval_km !== null) {
          nextDueOdo = task.last_done_odometer + task.interval_km;
          dueInKm = nextDueOdo - currentOdo;
        }
        if (task.interval_months !== null) {
          const d = new Date(task.last_done_date);
          d.setMonth(d.getMonth() + task.interval_months);
          d.setHours(0, 0, 0, 0);
          nextDueDate = d.toISOString().split('T')[0];
          const diffTime = d.getTime() - today.getTime();
          dueInDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }

      let consumedPercent = 0;
      if (isConfigured) {
        let pctKm = 0;
        if (task.interval_km !== null) {
          const runDistance = currentOdo - task.last_done_odometer;
          pctKm = (runDistance / task.interval_km) * 100;
          pctKm = Math.max(0, Math.min(100, pctKm));
        }

        let pctDays = 0;
        if (task.interval_months !== null) {
          const dStart = new Date(task.last_done_date);
          const dEnd = new Date(nextDueDate);
          const totalDays = Math.ceil((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));
          const elapsedDays = totalDays - dueInDays;
          pctDays = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
          pctDays = Math.max(0, Math.min(100, pctDays));
        }

        consumedPercent = Math.round(Math.max(pctKm, pctDays));
      }

      let taskStatus = 'Unconfigured';
      if (isConfigured) {
        const isOverdue = (dueInKm !== null && dueInKm <= 0) || (dueInDays !== null && dueInDays <= 0);
        
        let isDueSoon = false;
        if (!isOverdue) {
          const kmThreshold = task.interval_km && task.interval_km >= 2000 ? 500 : 100;
          const mileageDueSoon = dueInKm !== null && dueInKm <= kmThreshold;
          const timeDueSoon = dueInDays !== null && dueInDays <= 30;
          isDueSoon = mileageDueSoon || timeDueSoon;
        }

        if (isOverdue) {
          taskStatus = 'Overdue';
        } else if (isDueSoon) {
          taskStatus = 'Due Soon';
        } else {
          taskStatus = 'Upcoming';
        }
      }

      return {
        ...task,
        dueInKm,
        dueInDays,
        nextDueOdo,
        nextDueDate,
        status: taskStatus,
        consumedPercent
      };
    });

    const statusOrder = { 'Overdue': 0, 'Due Soon': 1, 'Unconfigured': 2, 'Upcoming': 3 };
    calculatedTasks.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.task_name.localeCompare(b.task_name);
    });

    res.json({
      currentOdometer: currentOdo,
      tasks: calculatedTasks
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
  try {
    const result = await dbRun(
      'INSERT INTO maintenance_planner (task_name, interval_km, interval_months, last_done_date, last_done_odometer, is_custom) VALUES (?, ?, ?, ?, ?, 1)',
      [
        taskName,
        intervalKm ? parseInt(intervalKm, 10) : null,
        intervalMonths ? parseInt(intervalMonths, 10) : null,
        lastDoneDate || null,
        lastDoneOdometer != null ? parseInt(lastDoneOdometer, 10) : null
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
  try {
    await dbRun(
      'UPDATE maintenance_planner SET task_name = ?, interval_km = ?, interval_months = ?, last_done_date = ?, last_done_odometer = ? WHERE id = ?',
      [
        taskName,
        intervalKm ? parseInt(intervalKm, 10) : null,
        intervalMonths ? parseInt(intervalMonths, 10) : null,
        lastDoneDate || null,
        lastDoneOdometer != null ? parseInt(lastDoneOdometer, 10) : null,
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
  try {
    await dbRun(
      'UPDATE maintenance_planner SET last_done_date = ?, last_done_odometer = ? WHERE id = ?',
      [completionDate, parseInt(completionOdometer, 10), req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/planner/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM maintenance_planner WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
});
