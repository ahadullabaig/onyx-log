import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

async function initializeDatabase() {
  try {
    // Create tables
    await dbRun(`
      CREATE TABLE IF NOT EXISTS bike_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_odometer INTEGER DEFAULT 0,
        last_chain_clean_odometer INTEGER DEFAULT 0
      )
    `);

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

    // Pre-populate single bike_status row if not present
    const status = await dbGet('SELECT * FROM bike_status WHERE id = 1');
    if (!status) {
      await dbRun('INSERT INTO bike_status (id, current_odometer, last_chain_clean_odometer) VALUES (1, 0, 0)');
      console.log('Database initialized with default bike status.');
    } else {
      console.log('Database tables verified. Current Odo:', status.current_odometer);
    }
  } catch (error) {
    console.error('Error initializing tables:', error);
  }
}

export default db;
