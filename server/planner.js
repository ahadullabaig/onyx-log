// Maintenance planner status engine. Pure (no DB, no clock of its own) so the
// due-date rules can be unit tested; GET /api/planner feeds it the stored
// tasks and the current odometer.
//
// Rules:
// 1. Configured: a task needs a last-done date, plus a last-done odometer when
//    it has a km interval. Unconfigured tasks get no due data.
// 2. Next due: last-done odometer + interval_km and/or last-done date +
//    interval_months. Dates are whole calendar days in UTC (stored YYYY-MM-DD).
// 3. Overdue: either trigger reached (km left <= 0 or days left <= 0).
// 4. Due Soon: within 500 km (100 km for intervals under 2,000 km), or in the
//    last 20% of the time interval, capped at 30 days.
// 5. consumedPercent: the larger of km and time consumed, clamped to 0-100.
// 6. Sorted Overdue, Due Soon, Unconfigured, Upcoming, then by name.
//
// Input: stored task rows, the current odometer (km), and `now` (a Date whose
// local calendar day counts as today).
// Returns: the tasks with dueInKm, dueInDays, nextDueOdo, nextDueDate, status
// and consumedPercent added.

const DAY_MS = 1000 * 60 * 60 * 24;

const STATUS_ORDER = { 'Overdue': 0, 'Due Soon': 1, 'Unconfigured': 2, 'Upcoming': 3 };

const parseDateUTC = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const addMonthsUTC = (utcMs, months) => {
  const d = new Date(utcMs);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
};

export function computePlannerTasks(tasks, currentOdo, now = new Date()) {
  // Work in whole calendar days in UTC to avoid timezone off-by-one errors:
  // stored dates are plain YYYY-MM-DD, so treat them (and "today") as UTC midnights.
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const calculatedTasks = tasks.map(task => {
    let dueInKm = null;
    let dueInDays = null;
    let nextDueOdo = null;
    let nextDueDate = null;
    let intervalDays = null;

    // A km-based task needs an odometer baseline; a time-only task needs only a date.
    const needsOdo = task.interval_km !== null;
    const isConfigured = task.last_done_date != null && (!needsOdo || task.last_done_odometer != null);
    const lastDoneUTC = task.last_done_date != null ? parseDateUTC(task.last_done_date) : null;

    if (isConfigured) {
      if (task.interval_km !== null) {
        nextDueOdo = task.last_done_odometer + task.interval_km;
        dueInKm = nextDueOdo - currentOdo;
      }
      if (task.interval_months !== null) {
        const nextDueUTC = addMonthsUTC(lastDoneUTC, task.interval_months);
        nextDueDate = new Date(nextDueUTC).toISOString().split('T')[0];
        dueInDays = Math.round((nextDueUTC - todayUTC) / DAY_MS);
        intervalDays = Math.round((nextDueUTC - lastDoneUTC) / DAY_MS);
      }
    }

    let consumedPercent = 0;
    if (isConfigured) {
      let pctKm = 0;
      if (task.interval_km !== null) {
        const runDistance = currentOdo - task.last_done_odometer;
        pctKm = Math.max(0, Math.min(100, (runDistance / task.interval_km) * 100));
      }

      let pctDays = 0;
      if (intervalDays !== null) {
        const elapsedDays = Math.round((todayUTC - lastDoneUTC) / DAY_MS);
        pctDays = intervalDays > 0 ? Math.max(0, Math.min(100, (elapsedDays / intervalDays) * 100)) : 0;
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
        // Warn in the last 20% of a time interval, capped at 30 days, so a
        // 1-month task isn't "Due Soon" from the day it was completed.
        const timeDueSoon = dueInDays !== null && dueInDays <= Math.min(30, Math.round(intervalDays * 0.2));
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

  calculatedTasks.sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    return a.task_name.localeCompare(b.task_name);
  });

  return calculatedTasks;
}
