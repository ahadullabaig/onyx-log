import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'database.db');

// Ensure database file directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Resolves once the connection is open AND the schema has been initialized,
// so callers (server.js, test_db.js) can await readiness instead of racing.
let markReady;
export const dbReady = new Promise((resolve) => { markReady = resolve; });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
    markReady(); // unblock callers; queries will surface their own errors
  } else {
    console.log('Connected to SQLite database at:', DB_PATH);
    initializeDatabase().then(markReady);
  }
});

// Wrap sqlite3 queries in Promises for cleaner async/await usage
export const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        console.error('SQL Error (run):', err);
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

export const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('SQL Error (get):', err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

export const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('SQL Error (all):', err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Factory planner tasks: [name, interval_km, interval_months]. Intervals follow
// the KTM 250 Duke (2024+) owner's manual service schedule; chain lube, brake
// pads, discs, battery, fork oil and chain kit are common-practice intervals.
const FACTORY_TASKS = [
  ['Chain Clean & Lube', 500, 1],
  ['Engine Oil & Oil Filter', 7500, 12],
  ['Brake Pad Inspection', 5000, 6],
  ['Brake Disc Inspection', 10000, 12],
  ['Battery Inspection', 10000, 12],
  ['Air Filter Replacement', 7500, null],
  ['Spark Plug Replacement', 15000, null],
  ['Valve Clearance Check', 15000, null],
  ['Bearing Play Check (Steering, Swingarm, Wheels)', 7500, null],
  ['Fork Dust Boot Cleaning', 7500, null],
  ['Brake Fluid Replacement', null, 24],
  ['Coolant Replacement', null, 48],
  ['Fork Oil Replacement', 30000, 36],
  ['Drive Chain & Sprocket Replacement', 25000, null]
];

// Earlier factory defaults corrected in place. A row is only upgraded while it
// still has the old name and intervals, so user-edited tasks are left alone;
// completion baselines are always kept.
const FACTORY_TASK_UPGRADES = [
  { from: ['Coolant Replacement', null, 24], to: ['Coolant Replacement', null, 48] },
  { from: ['Air Filter Inspection', 7500, 12], to: ['Air Filter Replacement', 7500, null] },
  { from: ['Spark Plug Inspection', 15000, 24], to: ['Spark Plug Replacement', 15000, null] }
];

// Factory tasks introduced after the first release, added to existing databases.
const ADDED_FACTORY_TASKS = [
  'Valve Clearance Check',
  'Bearing Play Check (Steering, Swingarm, Wheels)',
  'Fork Dust Boot Cleaning'
];

async function initializeDatabase() {
  try {
    // Create tables
    await dbRun(`
      CREATE TABLE IF NOT EXISTS bike_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_odometer INTEGER DEFAULT 0,
        session_secret TEXT
      )
    `);

    // Schema migration: add session_secret column to existing databases if missing
    const columns = await dbAll('PRAGMA table_info(bike_status)');
    const hasSecret = columns.some(col => col.name === 'session_secret');
    if (!hasSecret) {
      await dbRun('ALTER TABLE bike_status ADD COLUMN session_secret TEXT');
      console.log('Added session_secret column to bike_status.');
    }

    await dbRun(`
      CREATE TABLE IF NOT EXISTS fuel_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        odometer INTEGER NOT NULL,
        liters REAL NOT NULL,
        price_per_liter REAL NOT NULL,
        total_cost REAL NOT NULL,
        full_tank INTEGER DEFAULT 1
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS maintenance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        odometer INTEGER NOT NULL,
        category TEXT NOT NULL,
        cost REAL DEFAULT 0,
        is_diy INTEGER DEFAULT 0,
        description TEXT,
        bill_path TEXT
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS maintenance_planner (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_name TEXT NOT NULL,
        interval_km INTEGER,
        interval_months INTEGER,
        last_done_date TEXT,
        last_done_odometer INTEGER,
        is_custom INTEGER DEFAULT 0
      )
    `);

    // Pre-populate factory default tasks if table is empty
    const plannerCount = await dbGet('SELECT COUNT(*) as count FROM maintenance_planner');
    if (plannerCount && plannerCount.count === 0) {
      for (const [name, km, months] of FACTORY_TASKS) {
        await dbRun(
          'INSERT INTO maintenance_planner (task_name, interval_km, interval_months, last_done_date, last_done_odometer, is_custom) VALUES (?, ?, ?, NULL, NULL, 0)',
          [name, km, months]
        );
      }
      console.log('Pre-populated maintenance_planner with factory default tasks.');
    }

    // Bring factory tasks in existing databases in line with the KTM schedule.
    // Idempotent: upgrades match only the old values, inserts skip existing names.
    for (const { from, to } of FACTORY_TASK_UPGRADES) {
      const upgrade = await dbRun(
        `UPDATE maintenance_planner SET task_name = ?, interval_km = ?, interval_months = ?
         WHERE is_custom = 0 AND task_name = ? AND interval_km IS ? AND interval_months IS ?`,
        [...to, ...from]
      );
      if (upgrade.changes > 0) {
        console.log(`Updated factory task to the KTM schedule: ${to[0]}.`);
      }
    }
    for (const name of ADDED_FACTORY_TASKS) {
      const [, km, months] = FACTORY_TASKS.find(([taskName]) => taskName === name);
      const added = await dbRun(
        `INSERT INTO maintenance_planner (task_name, interval_km, interval_months, last_done_date, last_done_odometer, is_custom)
         SELECT ?, ?, ?, NULL, NULL, 0
         WHERE NOT EXISTS (SELECT 1 FROM maintenance_planner WHERE task_name = ?)`,
        [name, km, months, name]
      );
      if (added.changes > 0) {
        console.log(`Added factory task: ${name}.`);
      }
    }

    // Retire the factory "Tyre Inspection" task from databases that were seeded
    // with it. Idempotent, and scoped to is_custom = 0 so a user who later
    // re-adds it as a custom task keeps their copy.
    const tyreCleanup = await dbRun("DELETE FROM maintenance_planner WHERE task_name = 'Tyre Inspection' AND is_custom = 0");
    if (tyreCleanup.changes > 0) {
      console.log('Removed retired factory task: Tyre Inspection.');
    }

    // Pre-populate single bike_status row if not present
    let status = await dbGet('SELECT * FROM bike_status WHERE id = 1');
    if (!status) {
      const secret = crypto.randomBytes(32).toString('hex');
      await dbRun('INSERT INTO bike_status (id, current_odometer, session_secret) VALUES (1, 0, ?)', [secret]);
      console.log('Database initialized with default bike status and session secret.');
    } else {
      if (!status.session_secret) {
        const secret = crypto.randomBytes(32).toString('hex');
        await dbRun('UPDATE bike_status SET session_secret = ? WHERE id = 1', [secret]);
        status.session_secret = secret;
        console.log('Generated session secret for existing database.');
      }
      console.log('Database tables verified. Current Odo:', status.current_odometer);
    }
  } catch (error) {
    console.error('Error initializing tables:', error);
  }
}

export default db;
