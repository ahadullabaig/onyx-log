import React, { useState } from 'react';
import { RefreshCw, Fuel, Wrench, AlertTriangle } from 'lucide-react';

function Dashboard({ data, refresh, fuelLogs = [], maintLogs = [], plannerData, setActiveTab }) {
  const [newOdo, setNewOdo] = useState('');
  const [updatingOdo, setUpdatingOdo] = useState(false);

  const {
    currentOdometer,
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

  // Get top 3 urgent tasks from planner data
  const urgentTasks = (plannerData?.tasks || []).slice(0, 3);

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

        {/* ---- Maintenance Priority Alerts ---- */}
        <div className="card col-8" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Wrench style={{ color: 'var(--ktm-orange)' }} />
              Maintenance Priority Alerts
            </h2>
            <button 
              className="btn btn-secondary" 
              onClick={() => setActiveTab('planner')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              Open Planner
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flexGrow: 1, justifyContent: 'center' }}>
            {urgentTasks.length === 0 ? (
              <div className="widget-empty" style={{ margin: 0, padding: '1rem' }}>All systems nominal. No alerts.</div>
            ) : (
              urgentTasks.map(task => {
                const isOverdue = task.status === 'Overdue';
                const isDueSoon = task.status === 'Due Soon';
                const isUnconfigured = task.status === 'Unconfigured';
                
                let alertColor = 'var(--text-secondary)';
                let alertBg = 'rgba(201, 195, 180, 0.05)';
                let alertBorder = '1px solid var(--border-metal)';
                let dueText = '';

                if (isOverdue) {
                  alertColor = 'var(--critical-red)';
                  alertBg = 'var(--critical-red-bg)';
                  alertBorder = '1px solid rgba(255, 46, 46, 0.2)';
                  if (task.dueInKm !== null && task.dueInKm <= 0) {
                    dueText = `Overdue by ${Math.abs(task.dueInKm).toLocaleString()} km`;
                  } else if (task.dueInDays !== null && task.dueInDays <= 0) {
                    dueText = `Overdue by ${Math.abs(task.dueInDays)} days`;
                  } else {
                    dueText = 'Overdue';
                  }
                } else if (isDueSoon) {
                  alertColor = 'var(--caution-amber)';
                  alertBg = 'var(--caution-amber-bg)';
                  alertBorder = '1px solid rgba(255, 176, 32, 0.2)';
                  if (task.dueInKm !== null && task.dueInKm <= 500) {
                    dueText = `Due in ${task.dueInKm.toLocaleString()} km`;
                  } else if (task.dueInDays !== null) {
                    dueText = `Due in ${task.dueInDays} days`;
                  } else {
                    dueText = 'Due Soon';
                  }
                } else if (isUnconfigured) {
                  alertColor = 'var(--caution-amber)';
                  alertBg = 'rgba(255, 176, 32, 0.05)';
                  alertBorder = '1px solid rgba(255, 176, 32, 0.15)';
                  dueText = 'Set Baseline';
                } else {
                  alertColor = 'var(--coolant-ice)';
                  alertBg = 'var(--coolant-ice-bg)';
                  alertBorder = '1px solid rgba(79, 163, 209, 0.15)';
                  if (task.dueInKm !== null && task.dueInDays !== null) {
                    dueText = `${task.dueInKm.toLocaleString()} km / ${task.dueInDays} days left`;
                  } else if (task.dueInKm !== null) {
                    dueText = `${task.dueInKm.toLocaleString()} km left`;
                  } else if (task.dueInDays !== null) {
                    dueText = `${task.dueInDays} days left`;
                  }
                }

                return (
                  <div 
                    key={task.id} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: alertBg,
                      border: alertBorder,
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => setActiveTab('planner')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <AlertTriangle style={{ width: '15px', height: '15px', color: alertColor }} />
                      <span style={{ fontWeight: '500', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {task.task_name}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem', fontWeight: 'bold', color: alertColor }}>
                      {dueText}
                    </span>
                  </div>
                );
              })
            )}
          </div>
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

        {/* ---- Recent activity feed (Spans 12 columns) ---- */}
        <div className="card col-12">
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
      </div>
    </div>
  );
}

export default Dashboard;
