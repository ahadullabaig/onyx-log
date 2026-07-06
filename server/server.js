import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
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

// File upload endpoint
app.post('/api/upload', upload.single('bill'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const relativePath = `/uploads/${req.file.filename}`;
  res.json({ filePath: relativePath });
});

// Remove an uploaded receipt that was never attached to a saved log (avoids
// orphaned files). basename() keeps the target strictly inside UPLOADS_DIR.
app.delete('/api/upload/:filename', (req, res) => {
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
app.get('/api/dashboard', async (req, res) => {
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
app.post('/api/odometer', async (req, res) => {
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
app.get('/api/fuel', async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM fuel_logs ORDER BY odometer DESC, date DESC');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fuel', async (req, res) => {
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

app.delete('/api/fuel/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM fuel_logs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Maintenance Logs endpoints
app.get('/api/maintenance', async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM maintenance_logs ORDER BY odometer DESC, date DESC');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/maintenance', async (req, res) => {
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

app.delete('/api/maintenance/:id', async (req, res) => {
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
dbReady.then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
});
