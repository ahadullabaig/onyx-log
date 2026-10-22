import { dbRun } from './db.js';

// The bike's odometer is derived, never edited in place: it is the highest of
// the last manual reading (bike_status.manual_odometer) and every logged fuel
// and maintenance odometer. current_odometer caches that value for readers and
// is recomputed after any change to its sources, so deleting a log falls back
// to the highest reading that still exists instead of discarding a manual one.

// Odometer readings are whole kilometres, 0 or more.
export function isValidOdometer(value) {
  return Number.isInteger(value) && value >= 0;
}

export function refreshOdometer() {
  return dbRun(`
    UPDATE bike_status SET current_odometer = (
      SELECT COALESCE(MAX(odo), 0) FROM (
        SELECT manual_odometer AS odo FROM bike_status WHERE id = 1
        UNION ALL
        SELECT MAX(odometer) AS odo FROM fuel_logs
        UNION ALL
        SELECT MAX(odometer) AS odo FROM maintenance_logs
      )
    )
    WHERE id = 1
  `);
}
