import { computePlannerTasks } from './planner.js';
import assert from 'assert';

console.log('--- Maintenance Planner Unit Tests ---');

// Fixed "today" (a local calendar day) so results don't depend on when the tests run
const TODAY = new Date(2026, 9, 22); // 2026-10-22

const task = (fields) => ({
  id: 1,
  task_name: 'Task',
  interval_km: null,
  interval_months: null,
  last_done_date: null,
  last_done_odometer: null,
  is_custom: 0,
  ...fields
});
const plan = (fields, currentOdo, now = TODAY) => computePlannerTasks([task(fields)], currentOdo, now)[0];

// Test 1: No baseline -> Unconfigured with no due data
{
  const t = plan({ interval_km: 7500, interval_months: 12 }, 5000);
  assert.strictEqual(t.status, 'Unconfigured');
  assert.strictEqual(t.dueInKm, null);
  assert.strictEqual(t.dueInDays, null);
  assert.strictEqual(t.nextDueOdo, null);
  assert.strictEqual(t.nextDueDate, null);
  assert.strictEqual(t.consumedPercent, 0);
  console.log('✔ Test 1 passed: No baseline is Unconfigured');
}

// Test 2: Km tasks need an odometer baseline; time-only tasks need just a date
{
  const kmTask = plan({ interval_km: 7500, last_done_date: '2026-01-01' }, 5000);
  assert.strictEqual(kmTask.status, 'Unconfigured');

  const timeTask = plan({ interval_months: 24, last_done_date: '2026-01-01' }, 5000);
  assert.strictEqual(timeTask.status, 'Upcoming');
  assert.strictEqual(timeTask.dueInKm, null);
  assert.strictEqual(timeTask.nextDueDate, '2028-01-01');
  console.log('✔ Test 2 passed: Baseline requirements by interval type');
}

// Test 3: Km due math and consumed percentage
{
  const t = plan({ interval_km: 7500, last_done_date: '2026-01-01', last_done_odometer: 1000 }, 2000);
  assert.strictEqual(t.nextDueOdo, 8500);
  assert.strictEqual(t.dueInKm, 6500);
  assert.strictEqual(t.status, 'Upcoming');
  assert.strictEqual(t.consumedPercent, 13); // 1000 / 7500 km
  console.log('✔ Test 3 passed: Km due math');
}

// Test 4: Km Due Soon threshold is 500 km for intervals >= 2,000 km, else 100 km
{
  const long = { interval_km: 7500, last_done_date: '2026-10-01', last_done_odometer: 0 };
  assert.strictEqual(plan(long, 7000).status, 'Due Soon'); // 500 km left
  assert.strictEqual(plan(long, 6999).status, 'Upcoming'); // 501 km left

  const short = { interval_km: 500, last_done_date: '2026-10-01', last_done_odometer: 0 };
  assert.strictEqual(plan(short, 400).status, 'Due Soon'); // 100 km left
  assert.strictEqual(plan(short, 399).status, 'Upcoming'); // 101 km left
  console.log('✔ Test 4 passed: Km Due Soon thresholds');
}

// Test 5: Km Overdue at 0 km left; consumed percentage clamps at 100
{
  const base = { interval_km: 7500, last_done_date: '2026-10-01', last_done_odometer: 0 };
  const due = plan(base, 7500);
  assert.strictEqual(due.dueInKm, 0);
  assert.strictEqual(due.status, 'Overdue');

  const late = plan(base, 8000);
  assert.strictEqual(late.dueInKm, -500);
  assert.strictEqual(late.status, 'Overdue');
  assert.strictEqual(late.consumedPercent, 100);
  console.log('✔ Test 5 passed: Km Overdue');
}

// Test 6: Time Overdue on the due date itself
{
  const t = plan({ interval_months: 12, last_done_date: '2025-10-22' }, 0);
  assert.strictEqual(t.nextDueDate, '2026-10-22');
  assert.strictEqual(t.dueInDays, 0);
  assert.strictEqual(t.status, 'Overdue');
  assert.strictEqual(t.consumedPercent, 100);
  console.log('✔ Test 6 passed: Time Overdue on due date');
}

// Test 7: Long time intervals warn in the last 30 days
{
  const base = { interval_months: 12, last_done_date: '2025-10-22' };
  const in30 = plan(base, 0, new Date(2026, 8, 22));
  assert.strictEqual(in30.dueInDays, 30);
  assert.strictEqual(in30.status, 'Due Soon');

  const in31 = plan(base, 0, new Date(2026, 8, 21));
  assert.strictEqual(in31.dueInDays, 31);
  assert.strictEqual(in31.status, 'Upcoming');
  console.log('✔ Test 7 passed: 30-day cap on time Due Soon window');
}

// Test 8: Short time intervals warn in the last 20% (1 month -> 6 days)
{
  const base = { interval_months: 1, last_done_date: '2026-01-01' }; // due 2026-02-01
  assert.strictEqual(plan(base, 0, new Date(2026, 0, 26)).status, 'Due Soon'); // 6 days left
  assert.strictEqual(plan(base, 0, new Date(2026, 0, 25)).status, 'Upcoming'); // 7 days left

  const justDone = plan(base, 0, new Date(2026, 0, 1));
  assert.strictEqual(justDone.dueInDays, 31);
  assert.strictEqual(justDone.status, 'Upcoming');
  assert.strictEqual(justDone.consumedPercent, 0);
  console.log('✔ Test 8 passed: 20% time Due Soon window');
}

// Test 9: Either trigger makes a dual-interval task Overdue
{
  const t = plan({ interval_km: 7500, interval_months: 12, last_done_date: '2025-01-01', last_done_odometer: 1000 }, 2000);
  assert.strictEqual(t.dueInKm, 6500);
  assert.strictEqual(t.dueInDays, -294); // due 2026-01-01
  assert.strictEqual(t.status, 'Overdue');
  console.log('✔ Test 9 passed: Time trigger overrides km headroom');
}

// Test 10: Consumed percentage is the larger of km and time consumed
{
  // 2,000 of 10,000 km (20%) vs 183 of 365 days (~50%)
  const t = plan({ interval_km: 10000, interval_months: 12, last_done_date: '2026-04-22', last_done_odometer: 1000 }, 3000);
  assert.strictEqual(t.status, 'Upcoming');
  assert.strictEqual(t.consumedPercent, 50);
  console.log('✔ Test 10 passed: Consumed percentage uses the larger share');
}

// Test 11: Sorted by status (Overdue, Due Soon, Unconfigured, Upcoming), then name
{
  const tasks = [
    task({ id: 1, task_name: 'Delta', interval_km: 7500, last_done_date: '2026-10-01', last_done_odometer: 5000 }),
    task({ id: 2, task_name: 'Charlie', interval_km: 7500 }),
    task({ id: 3, task_name: 'Bravo', interval_km: 7500, last_done_date: '2026-10-01', last_done_odometer: 0 }),
    task({ id: 4, task_name: 'Able', interval_km: 7500 }),
    task({ id: 5, task_name: 'Alpha', interval_km: 7000, last_done_date: '2026-10-01', last_done_odometer: 0 })
  ];
  const result = computePlannerTasks(tasks, 7200, TODAY);
  assert.deepStrictEqual(result.map(t => t.task_name), ['Alpha', 'Bravo', 'Able', 'Charlie', 'Delta']);
  assert.deepStrictEqual(result.map(t => t.status), ['Overdue', 'Due Soon', 'Unconfigured', 'Unconfigured', 'Upcoming']);
  console.log('✔ Test 11 passed: Status then name ordering');
}

// Test 12: Stored fields pass through and input rows are not mutated
{
  const row = task({ id: 7, is_custom: 1, interval_km: 500 });
  const [t] = computePlannerTasks([row], 0, TODAY);
  assert.strictEqual(t.id, 7);
  assert.strictEqual(t.is_custom, 1);
  assert.strictEqual(row.status, undefined);
  console.log('✔ Test 12 passed: Row fields preserved, input untouched');
}

console.log('--- ALL MAINTENANCE PLANNER UNIT TESTS PASSED ---');
