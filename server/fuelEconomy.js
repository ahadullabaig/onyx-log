// Single source of truth for fuel-economy math, shared by the
// /api/fuel (per-entry mileage) and /api/dashboard (overall average) endpoints
// so the two can never drift apart.
//
// Calculation Tiers:
// 1. Tier 1 (Exact Full-to-Full): If >= 2 full-tank fills exist, calculate
//    exact distance/liters between consecutive FULL fill-ups. Liters from
//    partial fills in between are carried into the next full-to-full segment.
// 2. Tier 2 (Span Distance Fallback): If < 2 full-tank fills exist, but >= 2 total
//    fills exist, calculate the overall rolling average across the logged span:
//    (latestOdo - firstOdo) / sum(liters from first fill through penultimate fill).
//    Individual entries receive rolling span estimates flagged with isEstimated: true.
// 3. Partial Volume Tracking: Carried-over liters accumulating toward the next
//    anchor fill are tracked per partial entry.
//
// Input: array of { id, odometer, liters, full_tank } (order-independent).
// Returns: {
//   mileageById: Map<id, number>,
//   metaById: Map<id, { mileage: number | null, isEstimated: boolean, carriedLiters: number | null }>,
//   average: number,
//   isEstimated: boolean
// }.
export function computeFuelEconomy(logs) {
  if (!logs || logs.length === 0) {
    return { mileageById: new Map(), metaById: new Map(), average: 0, isEstimated: false };
  }

  const sorted = [...logs].sort((a, b) => (a.odometer - b.odometer) || (a.id - b.id));
  const mileageById = new Map();
  const metaById = new Map();

  let segDistance = 0;
  let segLiters = 0;
  let lastFullIdx = -1;
  let currentCarriedLiters = 0;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];

    if (entry.full_tank === 1) {
      if (lastFullIdx !== -1) {
        const distance = entry.odometer - sorted[lastFullIdx].odometer;
        let liters = 0;
        for (let k = lastFullIdx + 1; k <= i; k++) {
          liters += sorted[k].liters;
        }
        if (distance > 0 && liters > 0) {
          const mpg = distance / liters;
          mileageById.set(entry.id, mpg);
          metaById.set(entry.id, {
            mileage: mpg,
            isEstimated: false,
            carriedLiters: null
          });
          segDistance += distance;
          segLiters += liters;
        } else {
          metaById.set(entry.id, {
            mileage: null,
            isEstimated: false,
            carriedLiters: null
          });
        }
      } else {
        // First full tank anchor
        metaById.set(entry.id, {
          mileage: null,
          isEstimated: false,
          carriedLiters: null
        });
      }
      lastFullIdx = i;
      currentCarriedLiters = 0;
    } else {
      // Partial tank fill
      currentCarriedLiters += entry.liters;
      metaById.set(entry.id, {
        mileage: null,
        isEstimated: false,
        carriedLiters: currentCarriedLiters
      });
    }
  }

  // Tier 1: If verified full-to-full segments exist, use them
  if (segLiters > 0 && segDistance > 0) {
    const average = segDistance / segLiters;
    return { mileageById, metaById, average, isEstimated: false };
  }

  // Tier 2: Span Distance Fallback (when < 2 full fills exist, but >= 2 total fills exist)
  if (sorted.length >= 2) {
    const minOdo = sorted[0].odometer;
    const maxOdo = sorted[sorted.length - 1].odometer;
    const totalSpanDist = maxOdo - minOdo;

    // Fuel consumed across the span is the sum of fills from index 0 to length - 2
    let consumedLiters = 0;
    for (let k = 0; k < sorted.length - 1; k++) {
      consumedLiters += sorted[k].liters;
    }

    if (totalSpanDist > 0 && consumedLiters > 0) {
      const spanAvg = totalSpanDist / consumedLiters;

      // Provide rolling span estimates for subsequent entries
      let rollingLiters = 0;
      for (let i = 1; i < sorted.length; i++) {
        rollingLiters += sorted[i - 1].liters;
        const dist = sorted[i].odometer - minOdo;
        if (dist > 0 && rollingLiters > 0) {
          const estMileage = dist / rollingLiters;
          mileageById.set(sorted[i].id, estMileage);
          metaById.set(sorted[i].id, {
            mileage: estMileage,
            isEstimated: true,
            carriedLiters: null
          });
        }
      }

      return {
        mileageById,
        metaById,
        average: spanAvg,
        isEstimated: true
      };
    }
  }

  return { mileageById, metaById, average: 0, isEstimated: false };
}

