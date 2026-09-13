import { computeFuelEconomy } from './fuelEconomy.js';
import assert from 'assert';

console.log('--- Fuel Economy Unit Tests ---');

// Test 1: Empty logs
{
  const res = computeFuelEconomy([]);
  assert.strictEqual(res.average, 0);
  assert.strictEqual(res.isEstimated, false);
  assert.strictEqual(res.mileageById.size, 0);
  console.log('✔ Test 1 passed: Empty logs');
}

// Test 2: Single log
{
  const res = computeFuelEconomy([{ id: 1, odometer: 1000, liters: 5, full_tank: 0 }]);
  assert.strictEqual(res.average, 0);
  assert.strictEqual(res.isEstimated, false);
  assert.strictEqual(res.mileageById.get(1), undefined);
  console.log('✔ Test 2 passed: Single log');
}

// Test 3: Two partial fills (Tier 2 Span Fallback)
{
  const logs = [
    { id: 1, odometer: 1000, liters: 5.0, full_tank: 0 },
    { id: 2, odometer: 1150, liters: 5.0, full_tank: 0 }
  ];
  const res = computeFuelEconomy(logs);
  assert.strictEqual(res.isEstimated, true);
  // Distance = 150 km, consumed fuel = 5.0 L -> 30 km/L
  assert.strictEqual(Math.round(res.average), 30);
  assert.strictEqual(Math.round(res.mileageById.get(2)), 30);
  assert.strictEqual(res.metaById.get(2).isEstimated, true);
  console.log('✔ Test 3 passed: Two partial fills');
}

// Test 4: Three partial fills with rolling span estimates
{
  const logs = [
    { id: 1, odometer: 1000, liters: 5.0, full_tank: 0 },
    { id: 2, odometer: 1160, liters: 5.2, full_tank: 0 },
    { id: 3, odometer: 1315, liters: 5.0, full_tank: 0 }
  ];
  const res = computeFuelEconomy(logs);
  assert.strictEqual(res.isEstimated, true);
  // Total span: (1315 - 1000) / (5.0 + 5.2) = 315 / 10.2 = 30.882...
  assert.strictEqual(res.average.toFixed(2), '30.88');
  assert.strictEqual(res.mileageById.get(2).toFixed(1), '32.0'); // 160 / 5.0
  assert.strictEqual(res.mileageById.get(3).toFixed(2), '30.88'); // 315 / 10.2
  console.log('✔ Test 4 passed: Three partial fills with rolling span estimates');
}

// Test 5: Exact Full-to-Full fills (Tier 1)
{
  const logs = [
    { id: 1, odometer: 1000, liters: 12.0, full_tank: 1 },
    { id: 2, odometer: 1360, liters: 10.0, full_tank: 1 }
  ];
  const res = computeFuelEconomy(logs);
  assert.strictEqual(res.isEstimated, false);
  // Distance = 360 km, liters = 10.0 L -> 36.0 km/L
  assert.strictEqual(res.average, 36.0);
  assert.strictEqual(res.mileageById.get(2), 36.0);
  assert.strictEqual(res.metaById.get(2).isEstimated, false);
  console.log('✔ Test 5 passed: Exact Full-to-Full fills');
}

// Test 6: Full-to-Full with intermediate partial fill
{
  const logs = [
    { id: 1, odometer: 1000, liters: 12.0, full_tank: 1 },
    { id: 2, odometer: 1150, liters: 4.0, full_tank: 0 },
    { id: 3, odometer: 1300, liters: 6.0, full_tank: 1 }
  ];
  const res = computeFuelEconomy(logs);
  assert.strictEqual(res.isEstimated, false);
  // Intermediate partial carried liters
  assert.strictEqual(res.metaById.get(2).carriedLiters, 4.0);
  // Full tank consumes 4.0 + 6.0 = 10.0 L over 300 km -> 30.0 km/L
  assert.strictEqual(res.average, 30.0);
  assert.strictEqual(res.mileageById.get(3), 30.0);
  console.log('✔ Test 6 passed: Full-to-Full with intermediate partial fill');
}

// Test 7: Out-of-order logs
{
  const logs = [
    { id: 2, odometer: 1300, liters: 10.0, full_tank: 1 },
    { id: 1, odometer: 1000, liters: 12.0, full_tank: 1 }
  ];
  const res = computeFuelEconomy(logs);
  assert.strictEqual(res.average, 30.0);
  assert.strictEqual(res.mileageById.get(2), 30.0);
  console.log('✔ Test 7 passed: Out-of-order logs');
}

console.log('--- ALL FUEL ECONOMY UNIT TESTS PASSED ---');
