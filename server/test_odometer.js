import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import sqlite3 from 'sqlite3';

// Run against a throwaway database, never the real server/database.db.
// db.js reads DATA_DIR when it is imported, so set it before the dynamic import.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-test-'));
process.env.DATA_DIR = tmpDir;
process.on('exit', () => fs.rmSync(tmpDir, { recursive: true, force: true }));

// Seed a database in the pre-manual_odometer schema: the reading (7000 km) is
// above every logged entry, so it can only have been entered by hand.
await new Promise((resolve, reject) => {
  const legacy = new sqlite3.Database(path.join(tmpDir, 'database.db'));
  legacy.exec(`
    CREATE TABLE bike_status (id INTEGER PRIMARY KEY CHECK (id = 1), current_odometer INTEGER DEFAULT 0, session_secret TEXT);
    INSERT INTO bike_status (id, current_odometer, session_secret) VALUES (1, 7000, 'legacy-secret');
    CREATE TABLE fuel_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, odometer INTEGER NOT NULL, liters REAL NOT NULL, price_per_liter REAL NOT NULL, total_cost REAL NOT NULL, full_tank INTEGER DEFAULT 1);
    INSERT INTO fuel_logs (date, odometer, liters, price_per_liter, total_cost, full_tank) VALUES ('2026-10-01', 6000, 10, 100, 1000, 1);
  `, (err) => legacy.close(() => (err ? reject(err) : resolve())));
});

const { dbRun, dbGet, dbReady } = await import('./db.js');
const { isValidOdometer, refreshOdometer } = await import('./odometer.js');
await dbReady;

const odometer = async () => (await dbGet('SELECT current_odometer FROM bike_status WHERE id = 1')).current_odometer;

console.log('--- Odometer Tests ---');

// Test 1: Migration keeps a reading no log accounts for as the manual reading
{
  const status = await dbGet('SELECT current_odometer, manual_odometer FROM bike_status WHERE id = 1');
  assert.strictEqual(status.manual_odometer, 7000);
  assert.strictEqual(status.current_odometer, 7000);
  console.log('✔ Test 1 passed: Legacy manual reading migrated');
}

// Test 2: Only whole, non-negative numbers are valid readings
{
  for (const ok of [0, 5230]) assert.strictEqual(isValidOdometer(ok), true, `${ok} should be valid`);
  for (const bad of [-50, 1.5, '5000', 'abc', null, undefined, NaN, Infinity]) {
    assert.strictEqual(isValidOdometer(bad), false, `${String(bad)} should be invalid`);
  }
  console.log('✔ Test 2 passed: Input validation');
}

// Test 3: Deleting a log at the manual reading keeps the manual reading
{
  const { id } = await dbRun("INSERT INTO maintenance_logs (date, odometer, category) VALUES ('2026-10-05', 7000, 'Engine Oil')");
  await refreshOdometer();
  assert.strictEqual(await odometer(), 7000);

  await dbRun('DELETE FROM maintenance_logs WHERE id = ?', [id]);
  await refreshOdometer();
  assert.strictEqual(await odometer(), 7000);
  console.log('✔ Test 3 passed: Manual reading survives log delete');
}

// Test 4: A higher log raises the odometer; deleting it falls back to the manual reading
{
  const { id } = await dbRun("INSERT INTO fuel_logs (date, odometer, liters, price_per_liter, total_cost) VALUES ('2026-10-10', 9000, 10, 100, 1000)");
  await refreshOdometer();
  assert.strictEqual(await odometer(), 9000);

  await dbRun('DELETE FROM fuel_logs WHERE id = ?', [id]);
  await refreshOdometer();
  assert.strictEqual(await odometer(), 7000);
  console.log('✔ Test 4 passed: Mistyped high log can be undone');
}

// Test 5: Without a manual reading the odometer follows the logs, down to 0
{
  await dbRun('UPDATE bike_status SET manual_odometer = NULL WHERE id = 1');
  await refreshOdometer();
  assert.strictEqual(await odometer(), 6000);

  await dbRun('DELETE FROM fuel_logs');
  await refreshOdometer();
  assert.strictEqual(await odometer(), 0);
  console.log('✔ Test 5 passed: Odometer derived from logs alone');
}

console.log('--- ALL ODOMETER TESTS PASSED ---');
process.exit(0);
