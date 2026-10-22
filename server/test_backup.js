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

const { dbRun, dbReady } = await import('./db.js');
const { backupIfDue } = await import('./backup.js');
await dbReady;

const backupDir = path.join(tmpDir, 'backups');
const backups = () => fs.readdirSync(backupDir).filter(name => name.endsWith('.db')).sort();
const day = (n) => new Date(Date.UTC(2026, 9, n)); // 2026-10-n 00:00 UTC

const countFuelLogs = (file) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
  db.get('SELECT COUNT(*) AS count FROM fuel_logs', (err, row) => db.close(() => (err ? reject(err) : resolve(row.count))));
});

console.log('--- Database Backup Tests ---');

// Test 1: First backup is a readable snapshot of the live database
{
  await dbRun("INSERT INTO fuel_logs (date, odometer, liters, price_per_liter, total_cost) VALUES ('2026-10-01', 1000, 10, 100, 1000)");
  const file = await backupIfDue(day(1));
  assert.strictEqual(path.basename(file), 'database-2026-10-01T00-00-00Z.db');
  assert.strictEqual(await countFuelLogs(file), 1);
  console.log('✔ Test 1 passed: Snapshot contains live data');
}

// Test 2: At most one backup per 24 hours
{
  assert.strictEqual(await backupIfDue(new Date(day(2) - 1000)), null);
  assert.ok(await backupIfDue(day(2)));
  assert.strictEqual(backups().length, 2);
  console.log('✔ Test 2 passed: Daily cadence');
}

// Test 3: Only the newest 7 are kept, and unrelated files are left alone
{
  fs.writeFileSync(path.join(backupDir, 'notes.txt'), 'keep me');
  for (let n = 3; n <= 10; n++) {
    await backupIfDue(day(n));
  }
  const kept = backups();
  assert.strictEqual(kept.length, 7);
  assert.strictEqual(kept[0], 'database-2026-10-04T00-00-00Z.db');
  assert.strictEqual(kept.at(-1), 'database-2026-10-10T00-00-00Z.db');
  assert.ok(fs.existsSync(path.join(backupDir, 'notes.txt')));
  console.log('✔ Test 3 passed: Rotation keeps the newest 7');
}

console.log('--- ALL BACKUP TESTS PASSED ---');
process.exit(0);
