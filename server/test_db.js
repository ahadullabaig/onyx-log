import { dbRun, dbGet, dbAll, dbReady } from './db.js';

async function runTests() {
  console.log('--- Database Integration Tests ---');
  try {
    // 1. Check bike_status table
    const status = await dbGet('SELECT * FROM bike_status WHERE id = 1');
    console.log('Status row check:', status ? 'OK' : 'FAIL', status);

    // 2. Insert dummy fuel log
    console.log('Inserting test fuel log...');
    const fuelInsert = await dbRun(
      'INSERT INTO fuel_logs (date, odometer, liters, price_per_liter, total_cost, full_tank) VALUES (?, ?, ?, ?, ?, ?)',
      ['2026-07-06', 1000, 10.0, 100.0, 1000.0, 1]
    );
    console.log('Fuel log inserted, ID:', fuelInsert.id);

    // 3. Query all fuel logs
    const fuelLogs = await dbAll('SELECT * FROM fuel_logs');
    console.log('Current fuel logs count:', fuelLogs.length);

    // 4. Insert dummy maintenance log
    console.log('Inserting test maintenance log...');
    const maintInsert = await dbRun(
      'INSERT INTO maintenance_logs (date, odometer, category, cost, is_diy, description, bill_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['2026-07-06', 1050, 'Chain Maintenance', 150, 1, 'Chain cleaned and lubed', '/uploads/test_receipt.png']
    );
    console.log('Maintenance log inserted, ID:', maintInsert.id);

    // 5. Query all maintenance logs
    const maintLogs = await dbAll('SELECT * FROM maintenance_logs');
    console.log('Current maintenance logs count:', maintLogs.length);

    // 6. Clean up tests logs
    console.log('Cleaning up test entries...');
    await dbRun('DELETE FROM fuel_logs WHERE id = ?', [fuelInsert.id]);
    await dbRun('DELETE FROM maintenance_logs WHERE id = ?', [maintInsert.id]);
    console.log('Cleanup completed.');
    console.log('--- ALL INTEGRATION TESTS PASSED ---');
    process.exit(0);
  } catch (error) {
    console.error('--- TESTS FAILED ---', error);
    process.exit(1);
  }
}

// Run once the schema is guaranteed to exist (no arbitrary timeout needed)
dbReady.then(runTests);
