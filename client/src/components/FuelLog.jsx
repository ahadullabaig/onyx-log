import React, { useState, useMemo } from 'react';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { apiFetch } from '../api';

function FuelLog({ logs, refresh, currentOdo }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [odometer, setOdometer] = useState(currentOdo || '');
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);

  // Auto-calculate total cost when liters or price changes
  const handleLitersChange = (val) => {
    setLiters(val);
    if (pricePerLiter && val) {
      setTotalCost((parseFloat(val) * parseFloat(pricePerLiter)).toFixed(2));
    }
  };

  const handlePriceChange = (val) => {
    setPricePerLiter(val);
    if (liters && val) {
      setTotalCost((parseFloat(liters) * parseFloat(val)).toFixed(2));
    }
  };

  const handleTotalCostChange = (val) => {
    setTotalCost(val);
    if (liters && val) {
      setPricePerLiter((parseFloat(val) / parseFloat(liters)).toFixed(2));
    }
  };

  // Per-entry full-to-full mileage (km/L) is computed server-side and returned
  // on each log (descending order), so the table and chart share one source of
  // truth with the dashboard average.
  const logsWithMileage = logs;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !odometer || !liters || !pricePerLiter || !totalCost) {
      alert('Please fill out all fuel fields.');
      return;
    }

    if (parseInt(odometer) < 0 || parseFloat(liters) <= 0 || parseFloat(pricePerLiter) <= 0) {
      alert('Please enter positive values.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch('/api/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          odometer: parseInt(odometer),
          liters: parseFloat(liters),
          pricePerLiter: parseFloat(pricePerLiter),
          totalCost: parseFloat(totalCost),
          fullTank
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit fuel log');
      }

      // Reset form
      setLiters('');
      setPricePerLiter('');
      setTotalCost('');
      setFullTank(true);
      setDate(new Date().toISOString().split('T')[0]);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this fuel entry?')) {
      try {
        const res = await apiFetch(`/api/fuel/${id}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete fuel log');
        refresh();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // SVG Chart data calculations (filter logs with calculated mileage and reverse to chronological)
  const chartData = useMemo(() => {
    const validPoints = logsWithMileage
      .filter(l => l.mileage !== null)
      .reverse(); // Chronological for plotting left-to-right
    
    if (validPoints.length === 0) return null;

    const mileages = validPoints.map(p => p.mileage);
    const minMileage = Math.max(0, Math.min(...mileages) - 2);
    const maxMileage = Math.max(...mileages) + 2;
    const mileageRange = maxMileage - minMileage || 1;

    const avg = mileages.reduce((a, b) => a + b, 0) / mileages.length;
    const best = Math.max(...mileages);
    const latest = mileages[mileages.length - 1];
    const prevMileage = mileages.length > 1 ? mileages[mileages.length - 2] : null;
    const delta = prevMileage != null ? latest - prevMileage : null;

    return {
      points: validPoints,
      minMileage,
      maxMileage,
      mileageRange,
      stats: { avg, best, latest, delta }
    };
  }, [logsWithMileage]);

  // Render the mileage trend as a glowing, dyno-style area chart
  const renderMileageChart = () => {
    if (!chartData || chartData.points.length < 2) {
      return (
        <div className="chart-empty">NEED AT LEAST 2 FULL FILL-UPS TO RENDER CHART</div>
      );
    }

    const { points, minMileage, mileageRange, stats } = chartData;
    const width = 680;
    const height = 440;
    const padL = 52, padR = 28, padT = 34, padB = 46;
    const cw = width - padL - padR;
    const ch = height - padT - padB;
    const baselineY = padT + ch;

    const yAt = (m) => padT + ch - ((m - minMileage) / mileageRange) * ch;
    const coordinates = points.map((p, i) => ({
      x: padL + (points.length === 1 ? 0.5 : i / (points.length - 1)) * cw,
      y: yAt(p.mileage),
      data: p
    }));
    const lastIdx = coordinates.length - 1;

    const linePath = coordinates.map((c, i) => `${i ? 'L' : 'M'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaPath =
      `M ${coordinates[0].x.toFixed(1)} ${baselineY} ` +
      coordinates.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ') +
      ` L ${coordinates[lastIdx].x.toFixed(1)} ${baselineY} Z`;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => minMileage + mileageRange * f);
    const hover = activeTooltip != null ? coordinates[activeTooltip] : null;

    // Hover tooltip box, kept inside the plot bounds
    const boxW = 140, boxH = 56;
    let bx = 0, by = 0;
    if (hover) {
      bx = Math.max(padL, Math.min(hover.x - boxW / 2, width - padR - boxW));
      by = hover.y - boxH - 16;
      if (by < padT) by = hover.y + 16;
    }

    return (
      <>
        <div className="chart-stats">
          <div className="chart-stat">
            <span className="chart-stat-label">Average</span>
            <span className="chart-stat-val">{stats.avg.toFixed(1)}<i>km/L</i></span>
          </div>
          <div className="chart-stat">
            <span className="chart-stat-label">Best</span>
            <span className="chart-stat-val ice">{stats.best.toFixed(1)}<i>km/L</i></span>
          </div>
          <div className="chart-stat">
            <span className="chart-stat-label">Latest</span>
            <span className="chart-stat-val orange">
              {stats.latest.toFixed(1)}<i>km/L</i>
              {stats.delta != null && stats.delta !== 0 && (
                <em className={stats.delta > 0 ? 'up' : 'down'}>
                  {stats.delta > 0 ? '▲' : '▼'}{Math.abs(stats.delta).toFixed(1)}
                </em>
              )}
            </span>
          </div>
        </div>

        <div className="chart-container">
          <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="mileageArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" className="area-stop-top" />
                <stop offset="55%" className="area-stop-mid" />
                <stop offset="100%" className="area-stop-bot" />
              </linearGradient>
            </defs>

            {/* horizontal gridlines + y labels */}
            {ticks.map((val, idx) => {
              const y = yAt(val);
              return (
                <g key={idx}>
                  <line x1={padL} y1={y} x2={width - padR} y2={y} className={`chart-grid-line${idx === 0 ? ' axis' : ''}`} />
                  <text x={padL - 12} y={y + 3.5} textAnchor="end" className="chart-label">{val.toFixed(1)}</text>
                </g>
              );
            })}
            <text x={padL - 12} y={padT - 14} textAnchor="end" className="chart-axis-unit">KM/L</text>

            {/* area fill + trend line */}
            <path d={areaPath} className="chart-area" />
            <path d={linePath} className="chart-line" />

            {/* x-axis odometer labels */}
            {coordinates.map((c, idx) => {
              if (coordinates.length > 6 && idx % Math.ceil(coordinates.length / 6) !== 0 && idx !== lastIdx) return null;
              return (
                <text key={idx} x={c.x} y={baselineY + 24} textAnchor="middle" className="chart-label">
                  {c.data.odometer.toLocaleString()}
                </text>
              );
            })}

            {/* hover crosshair */}
            {hover && <line x1={hover.x} y1={padT} x2={hover.x} y2={baselineY} className="chart-crosshair" />}

            {/* data points (latest emphasized) */}
            {coordinates.map((c, idx) => (
              <g key={idx}>
                {idx === lastIdx && <circle cx={c.x} cy={c.y} r="10" className="chart-point-halo" />}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={idx === lastIdx ? 6 : 5}
                  className={`chart-point${idx === lastIdx ? ' latest' : ''}${activeTooltip === idx ? ' active' : ''}`}
                  onMouseEnter={() => setActiveTooltip(idx)}
                  onMouseLeave={() => setActiveTooltip(null)}
                />
              </g>
            ))}

            {/* in-svg tooltip (pixel-accurate) */}
            {hover && (
              <g pointerEvents="none">
                <rect x={bx} y={by} width={boxW} height={boxH} rx="5" className="chart-tt-box" />
                <text x={bx + 13} y={by + 22} className="chart-tt-main">{hover.data.mileage.toFixed(2)} km/L</text>
                <text x={bx + 13} y={by + 38} className="chart-tt-sub">{hover.data.odometer.toLocaleString()} km</text>
                <text x={bx + 13} y={by + 50} className="chart-tt-sub">{hover.data.date}</text>
              </g>
            )}
          </svg>
        </div>
      </>
    );
  };

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Fuel & Mileage Logs</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Track fill-ups and calculate fuel efficiency metrics.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* SVG Mileage Trend Chart */}
        <div className="card col-8" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp className="btn-icon" />
              Mileage Trend (km/L)
            </h2>
          </div>
          <div style={{ flexGrow: 1, minHeight: '340px', display: 'flex', flexDirection: 'column' }}>
            {renderMileageChart()}
          </div>
        </div>

        {/* Add Refueling Form */}
        <div className="card col-4">
          <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', marginBottom: '1.25rem' }}>
            Log Refueling
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Date</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Odometer Reading (KM)</label>
              <input 
                type="number" 
                value={odometer} 
                onChange={e => setOdometer(e.target.value)}
                placeholder={currentOdo ? `Current: ${currentOdo}` : 'Odometer (km)'}
                required 
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Fuel (Liters)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={liters} 
                  onChange={e => handleLitersChange(e.target.value)}
                  placeholder="Liters"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Price/L (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={pricePerLiter} 
                  onChange={e => handlePriceChange(e.target.value)}
                  placeholder="₹/L"
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label>Total Cost (₹)</label>
              <input 
                type="number" 
                step="0.01" 
                value={totalCost} 
                onChange={e => handleTotalCostChange(e.target.value)}
                placeholder="Total Spent (₹)"
                required 
              />
            </div>

            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', marginBottom: '1.5rem' }}>
              <div 
                className={`checkbox-custom ${fullTank ? 'checked' : ''}`}
                onClick={() => setFullTank(!fullTank)}
              />
              <span style={{ fontSize: '0.9rem', cursor: 'pointer' }} onClick={() => setFullTank(!fullTank)}>
                Filled to Full Tank
              </span>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              disabled={submitting}
            >
              <Plus className="btn-icon" />
              {submitting ? 'Adding...' : 'Log Refueling'}
            </button>
          </form>
        </div>

        {/* Logs Table */}
        <div className="col-12">
          <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', marginBottom: '1rem' }}>
            Fuel History
          </h2>
          {logsWithMileage.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              No fuel logs recorded yet. Use the form above to add your first refueling details.
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Odometer</th>
                    <th>Fuel added</th>
                    <th>Price per Liter</th>
                    <th>Total Cost</th>
                    <th>Type</th>
                    <th>Fuel Economy</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logsWithMileage.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontFamily: 'var(--mono)' }}>{log.date}</td>
                      <td style={{ fontWeight: '600' }}>{log.odometer.toLocaleString()} km</td>
                      <td>{log.liters.toFixed(2)} L</td>
                      <td>₹{log.price_per_liter.toFixed(2)}</td>
                      <td style={{ fontWeight: '600' }}>₹{log.total_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={`badge ${log.full_tank === 1 ? 'badge-full' : 'badge-partial'}`}>
                          {log.full_tank === 1 ? 'Full' : 'Partial'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 'bold', color: log.mileage ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {log.mileage ? `${log.mileage.toFixed(2)} km/l` : (log.full_tank === 1 ? 'Calculating...' : 'N/A')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="btn btn-danger" 
                          onClick={() => handleDelete(log.id)}
                          style={{ padding: '0.4rem', borderRadius: '6px' }}
                        >
                          <Trash2 className="btn-icon" style={{ width: '16px', height: '16px' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FuelLog;
