import React, { useState } from 'react';
import { RefreshCw, Compass, Fuel, Wrench } from 'lucide-react';

function Dashboard({ data, refresh, fuelLogs = [], maintLogs = [] }) {
  const [newOdo, setNewOdo] = useState('');
  const [updatingOdo, setUpdatingOdo] = useState(false);

  const {
    currentOdometer,
    lastChainCleanOdometer,
    totalFuelCost,
    totalMaintenanceCost,
    averageMileage,
    fuelEntriesCount
  } = data;

  const totalCost = totalFuelCost + totalMaintenanceCost;
  const costPerKm = currentOdometer > 0 ? totalCost / currentOdometer : 0;
  const fuelFrac = totalCost > 0 ? totalFuelCost / totalCost : 0;

  // Spending by category: each maintenance category + fuel, largest first
  const spendByCategory = (() => {
    const map = {};
    maintLogs.forEach(m => { map[m.category] = (map[m.category] || 0) + (m.cost || 0); });
    const rows = Object.entries(map).map(([name, cost]) => ({ name, cost, kind: 'maint' }));
    if (totalFuelCost > 0) rows.push({ name: 'Fuel', cost: totalFuelCost, kind: 'fuel' });
    return rows.filter(r => r.cost > 0).sort((a, b) => b.cost - a.cost);
  })();
  const maxSpend = spendByCategory.length ? spendByCategory[0].cost : 0;

  // Recent activity: fuel + maintenance events, newest first
  const recent = [
    ...fuelLogs.map(f => ({
      type: 'fuel', date: f.date, odo: f.odometer,
      title: 'Refuel', sub: `${Number(f.liters).toFixed(1)} L`, amount: f.total_cost
    })),
    ...maintLogs.map(m => ({
      type: 'maint', date: m.date, odo: m.odometer,
      title: m.category, sub: m.is_diy === 1 ? 'DIY' : 'Workshop', amount: m.cost
    }))
  ].sort((a, b) => b.date.localeCompare(a.date) || (b.odo - a.odo)).slice(0, 6);

  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
  const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Chain Clean logic (Due every 500 km)
  const chainCleanInterval = 500;
  const kmSinceLastClean = Math.max(0, currentOdometer - lastChainCleanOdometer);
  const chainPercent = Math.min(100, (kmSinceLastClean / chainCleanInterval) * 100);

  let chainStatus = 'success';
  if (kmSinceLastClean >= 450) chainStatus = 'danger';
  else if (kmSinceLastClean >= 400) chainStatus = 'warning';

  // Service Interval logic (1st at 1000 km, subsequent every 7500 km)
  const getNextServiceOdo = (odo) => {
    if (odo < 1000) return 1000;
    const base = odo - 1000;
    const cycles = Math.floor(base / 7500) + 1;
    return 1000 + cycles * 7500;
  };

  const nextServiceOdo = getNextServiceOdo(currentOdometer);
  const kmUntilNextService = Math.max(0, nextServiceOdo - currentOdometer);
  // Denominator must be the *current* interval: 1000 km before the first service,
  // 7500 km after — otherwise the ring reads ~87% "elapsed" on a brand-new bike.
  const serviceInterval = currentOdometer < 1000 ? 1000 : 7500;
  const servicePercent = Math.min(100, (kmUntilNextService / serviceInterval) * 100);

  let serviceStatus = 'success';
  if (kmUntilNextService <= 500) serviceStatus = 'danger';
  else if (kmUntilNextService <= 1000) serviceStatus = 'warning';

  const handleUpdateOdometer = async (e) => {
    e.preventDefault();
    if (!newOdo || isNaN(newOdo) || parseInt(newOdo) < currentOdometer) {
      alert('Please enter a valid odometer reading greater than or equal to current value.');
      return;
    }

    try {
      setUpdatingOdo(true);
      const res = await fetch('/api/odometer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentOdometer: parseInt(newOdo) })
      });

      if (!res.ok) throw new Error('Failed to update odometer');
      setNewOdo('');
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingOdo(false);
    }
  };

  const handleLogChainClean = async () => {
    if (confirm('Mark chain as cleaned and lubed at current odometer?')) {
      try {
        const res = await fetch('/api/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: new Date().toISOString().split('T')[0],
            odometer: currentOdometer,
            category: 'Chain Maintenance',
            cost: 0,
            isDiy: true,
            description: 'Regular chain cleaning and lubing.'
          })
        });

        if (!res.ok) throw new Error('Failed to log chain maintenance');
        refresh();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // SVG dash offset helpers
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const getStrokeDashoffset = (percent) => circumference - (percent / 100) * circumference;

  // Donut geometry (cost split)
  const donutR = 46;
  const donutC = 2 * Math.PI * donutR;

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Garage Overview</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Welcome back. Your KTM Duke 250 Gen 3 is tracked and ready.</p>
        </div>
        <button className="btn btn-secondary" onClick={refresh} style={{ padding: '0.6rem 1rem' }}>
          <RefreshCw className="btn-icon" />
          Refresh Stats
        </button>
      </div>

      <div className="dashboard-grid">
        {/* ---- KPI instrument strip ---- */}
        <div className="card stat-card col-3">
          <span className="stat-label">Total Expenses</span>
          <div className="stat-value">₹{inr(totalCost)}</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ₹{inr(totalFuelCost)} Fuel · ₹{inr(totalMaintenanceCost)} Service
          </span>
        </div>

        <div className="card stat-card col-3">
          <span className="stat-label">Average Mileage</span>
          <div className="stat-value">
            {averageMileage > 0 ? averageMileage.toFixed(1) : 'N/A'}
            {averageMileage > 0 && <span className="stat-unit">km/l</span>}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Across {fuelEntriesCount} refuels
          </span>
        </div>

        <div className="card stat-card col-3">
          <span className="stat-label">Distance Run</span>
          <div className="stat-value">
            {currentOdometer.toLocaleString()}
            <span className="stat-unit">km</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Current odometer
          </span>
        </div>

        <div className="card stat-card col-3">
          <span className="stat-label">Cost / km</span>
          <div className="stat-value">₹{costPerKm.toFixed(2)}<span className="stat-unit">/km</span></div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Lifetime running cost
          </span>
        </div>

        {/* ---- Chain Care ring ---- */}
        <div className="card col-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.75rem' }}>
            Chain Care
          </h2>

          <div className="status-ring-container">
            <svg viewBox="0 0 80 80" className="circular-chart">
              <circle className="circle-bg" cx="40" cy="40" r={radius} />
              <circle
                className={`circle ${chainStatus}`}
                cx="40"
                cy="40"
                r={radius}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={getStrokeDashoffset(chainPercent)}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div className="status-info">
              <span className="status-title">
                {kmSinceLastClean} / {chainCleanInterval} km
              </span>
              <span className="status-desc">
                {kmSinceLastClean >= chainCleanInterval
                  ? 'Chain clean is OVERDUE! Lube immediately.'
                  : `Next chain clean due in ${chainCleanInterval - kmSinceLastClean} km.`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto' }}>
            <button className="btn btn-primary" onClick={handleLogChainClean} style={{ flexGrow: 1 }}>
              Mark Cleaned & Lubed
            </button>
          </div>
        </div>

        {/* ---- Service Interval ring ---- */}
        <div className="card col-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.75rem' }}>
            Service Intervals
          </h2>

          <div className="status-ring-container">
            <svg viewBox="0 0 80 80" className="circular-chart">
              <circle className="circle-bg" cx="40" cy="40" r={radius} />
              <circle
                className={`circle ${serviceStatus}`}
                cx="40"
                cy="40"
                r={radius}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={getStrokeDashoffset(100 - servicePercent)}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div className="status-info">
              <span className="status-title">
                Next Service: {nextServiceOdo.toLocaleString()} km
              </span>
              <span className="status-desc">
                {kmUntilNextService <= 0
                  ? 'Scheduled service is OVERDUE!'
                  : `Service scheduled in ${kmUntilNextService.toLocaleString()} km.`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 'auto' }}>
            <Compass className="btn-icon" />
            <span>KTM official manual schedule: First at 1k km, then every 7.5k km.</span>
          </div>
        </div>

        {/* ---- Spending breakdown (bar chart) ---- */}
        <div className="card col-8" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <span className="card-title">Spending Breakdown</span>
            <span className="card-head-meta">₹{inr(totalCost)} total</span>
          </div>
          {spendByCategory.length === 0 ? (
            <div className="widget-empty">No spending recorded yet.</div>
          ) : (
            <div className="bar-list">
              {spendByCategory.map(row => {
                const pct = maxSpend > 0 ? (row.cost / maxSpend) * 100 : 0;
                const share = totalCost > 0 ? (row.cost / totalCost) * 100 : 0;
                return (
                  <div className="bar-row" key={row.name}>
                    <span className="bar-label">{row.name}</span>
                    <div className="bar-track">
                      <div className={`bar-fill ${row.kind}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="bar-value">₹{inr(row.cost)}<i>{share.toFixed(0)}%</i></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- Update odometer ---- */}
        <div className="card col-4" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <span className="card-title">Update Odometer</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Record your latest reading after a ride to keep alerts synchronized.
          </p>

          <form onSubmit={handleUpdateOdometer} style={{ marginTop: 'auto' }}>
            <div className="form-group">
              <label htmlFor="odo-input">Current Odometer (KM)</label>
              <input
                id="odo-input"
                type="number"
                placeholder={currentOdometer.toString()}
                value={newOdo}
                onChange={e => setNewOdo(e.target.value)}
                min={currentOdometer}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={updatingOdo}
            >
              {updatingOdo ? 'Updating...' : 'Save Odometer'}
            </button>
          </form>
        </div>

        {/* ---- Recent activity feed ---- */}
        <div className="card col-8">
          <div className="card-head">
            <span className="card-title">Recent Activity</span>
            <span className="card-head-meta">Last {recent.length} events</span>
          </div>
          {recent.length === 0 ? (
            <div className="widget-empty">No activity logged yet.</div>
          ) : (
            <div className="activity-list">
              {recent.map((a, i) => (
                <div className="activity-row" key={i}>
                  <span className={`activity-icon ${a.type}`}>
                    {a.type === 'fuel' ? <Fuel /> : <Wrench />}
                  </span>
                  <div className="activity-main">
                    <span className="activity-title">{a.title}</span>
                    <span className="activity-sub">{a.date} · {a.odo.toLocaleString()} km · {a.sub}</span>
                  </div>
                  <span className="activity-amount">₹{inr(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Cost split donut ---- */}
        <div className="card col-4" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <span className="card-title">Cost Split</span>
          </div>
          {totalCost === 0 ? (
            <div className="widget-empty">No costs recorded yet.</div>
          ) : (
            <div className="donut-panel">
              <div className="donut-wrap">
                <svg viewBox="0 0 120 120" className="donut">
                  <circle className="donut-track" cx="60" cy="60" r={donutR} />
                  <circle
                    className="donut-seg fuel" cx="60" cy="60" r={donutR}
                    strokeDasharray={`${fuelFrac * donutC} ${donutC}`}
                    transform="rotate(-90 60 60)"
                  />
                  <circle
                    className="donut-seg maint" cx="60" cy="60" r={donutR}
                    strokeDasharray={`${(1 - fuelFrac) * donutC} ${donutC}`}
                    strokeDashoffset={`${-fuelFrac * donutC}`}
                    transform="rotate(-90 60 60)"
                  />
                  <text x="60" y="55" className="donut-total-label">TOTAL</text>
                  <text x="60" y="74" className="donut-total">₹{fmtK(totalCost)}</text>
                </svg>
              </div>
              <div className="legend">
                <div className="legend-row">
                  <span className="legend-dot fuel" />
                  <span className="legend-name">Fuel</span>
                  <span className="legend-amt">₹{inr(totalFuelCost)}</span>
                  <span className="legend-pct">{(fuelFrac * 100).toFixed(0)}%</span>
                </div>
                <div className="legend-row">
                  <span className="legend-dot maint" />
                  <span className="legend-name">Maintenance</span>
                  <span className="legend-amt">₹{inr(totalMaintenanceCost)}</span>
                  <span className="legend-pct">{((1 - fuelFrac) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
