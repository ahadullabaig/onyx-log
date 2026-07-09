// Single source of truth for full-to-full fuel-economy math, shared by the
// /api/fuel (per-entry mileage) and /api/dashboard (overall average) endpoints
// so the two can never drift apart.
//
// Method: only distance/liters between consecutive FULL fill-ups count. Liters
// from partial fills in between are carried into the next full-to-full segment.
//
// Input: array of { id, odometer, liters, full_tank } (order-independent).
// Returns: { mileageById: Map<id, km/L>, average: number }.
export function computeFuelEconomy(logs) {
  const sorted = [...logs].sort((a, b) => a.odometer - b.odometer);
  const mileageById = new Map();

  let segDistance = 0;
  let segLiters = 0;
  let lastFullIdx = -1;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].full_tank === 1) {
      if (lastFullIdx !== -1) {
        const distance = sorted[i].odometer - sorted[lastFullIdx].odometer;
        let liters = 0;
        for (let k = lastFullIdx + 1; k <= i; k++) {
          liters += sorted[k].liters;
        }
        if (distance > 0 && liters > 0) {
          mileageById.set(sorted[i].id, distance / liters);
          segDistance += distance;
          segLiters += liters;
        }
      }
      lastFullIdx = i;
    }
  }

  const average = segLiters > 0 ? segDistance / segLiters : 0;
  return { mileageById, average };
}
