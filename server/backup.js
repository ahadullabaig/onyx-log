import fs from 'fs';
import path from 'path';
import { dbRun, DATA_DIR } from './db.js';

// Daily SQLite snapshots in DATA_DIR/backups, keeping the newest BACKUP_KEEP.
// VACUUM INTO writes a consistent, compacted copy while the database stays in
// use. The check runs at startup and then hourly, so a machine that Fly stops
// when idle still gets one backup per day it is used. Backups share the data
// volume: they guard against bad writes and migrations, not volume loss (Fly's
// volume snapshots cover that).

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_KEEP = 7;
const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

// File names carry their UTC creation time and sort chronologically:
// database-2026-10-22T05-30-00Z.db
const BACKUP_NAME = /^database-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db$/;

const backupName = (date) => `database-${date.toISOString().slice(0, 19).replace(/:/g, '-')}Z.db`;

const backupTime = (name) => {
  const [, day, h, m, s] = name.match(BACKUP_NAME);
  return Date.parse(`${day}T${h}:${m}:${s}Z`);
};

const listBackups = () =>
  fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter(name => BACKUP_NAME.test(name)).sort()
    : [];

// Snapshot the database when the newest backup is a day old (or there is none),
// then prune old ones. Returns the new backup's path, or null if none was due.
export async function backupIfDue(now = new Date()) {
  const newest = listBackups().at(-1);
  if (newest && now - backupTime(newest) < BACKUP_EVERY_MS) {
    return null;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, backupName(now));
  await dbRun('VACUUM INTO ?', [file]);

  for (const old of listBackups().slice(0, -BACKUP_KEEP)) {
    fs.unlinkSync(path.join(BACKUP_DIR, old));
  }
  return file;
}

// Back up now if due, then re-check hourly. Failures are logged, never thrown.
export function scheduleBackups() {
  const run = () =>
    backupIfDue()
      .then(file => {
        if (file) console.log('Database backed up to:', file);
      })
      .catch(err => console.error('Database backup failed:', err));
  run();
  setInterval(run, CHECK_EVERY_MS);
}
