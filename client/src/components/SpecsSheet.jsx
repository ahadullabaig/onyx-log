import React, { useState } from 'react';
import { FileText, Settings, AlertCircle } from 'lucide-react';

function SpecsSheet() {
  const [subTab, setSubTab] = useState('technical');

  const techSpecs = [
    { category: 'Engine & Performance', specs: [
      { name: 'Displacement', val: '249.07 cc' },
      { name: 'Engine Type', val: 'Single cylinder, 4-stroke, liquid-cooled, DOHC' },
      { name: 'Maximum Power', val: '31 PS (30.57 HP) @ 9,250 rpm' },
      { name: 'Maximum Torque', val: '25 Nm @ 7,250 rpm' },
      { name: 'Bore x Stroke', val: '72 mm x 61.1 mm' },
      { name: 'Compression Ratio', val: '12.5:1' }
    ]},
    { category: 'Fluids & Capacities', specs: [
      { name: 'Engine Oil Capacity', val: '1.7 Liters (with oil filter replacement)' },
      { name: 'Engine Oil Viscosity', val: 'SAE 10W-50 (Fully Synthetic, JASO MA2)' },
      { name: 'Coolant Type', val: 'Motorex Coolant M3.0 (Organic Acid Technology / OAT)' },
      { name: 'Fuel Tank Capacity', val: '15 Liters (approx. 2.0L reserve)' },
      { name: 'Brake Fluid Spec', val: 'DOT 4' }
    ]},
    { category: 'Chassis & Tyres', specs: [
      { name: 'Front Tyre Size', val: '110/70 R17 (Radial)' },
      { name: 'Rear Tyre Size', val: '150/60 R17 (Radial)' },
      { name: 'Front Tyre Pressure', val: '29 PSI' },
      { name: 'Rear Tyre Pressure', val: '32 PSI (Standard) / 34 PSI (with passenger)' },
      { name: 'Chain Slack / Play', val: '33 mm - 40 mm' },
      { name: 'Transmission', val: '6-speed with Quickshifter+ & slipper clutch' }
    ]}
  ];

  const torqueSpecs = [
    { part: 'Engine oil drain plug (M12)', val: '15 Nm (11.1 lb-ft)' },
    { part: 'Engine oil screen plug (M20)', val: '15 Nm (11.1 lb-ft)' },
    { part: 'Oil filter cover screws (M6)', val: '10 Nm (7.4 lb-ft)' },
    { part: 'Rear axle nut (M22)', val: '90 Nm (66.4 lb-ft)' },
    { part: 'Front axle bolt (M8)', val: '45 Nm (33.2 lb-ft)' },
    { part: 'Chain tensioner locknuts (M8)', val: '16 Nm (11.8 lb-ft)' },
    { part: 'Spark plug', val: '12 Nm (8.9 lb-ft)' },
    { part: 'Front brake caliper bolts (M10)', val: '45 Nm (33.2 lb-ft)' },
    { part: 'Rear brake caliper bracket bolt (M10)', val: '45 Nm (33.2 lb-ft)' },
    { part: 'Engine oil level sight glass screw', val: '10 Nm (7.4 lb-ft)' }
  ];

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Specifications Cheat Sheet</h1>
          <p style={{ color: 'var(--text-secondary)' }}>KTM Duke 250 Gen 3 (2025+) manufacturer guidelines and technical reference.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-metal)', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <button 
          className={`btn ${subTab === 'technical' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('technical')}
          style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
        >
          <FileText className="btn-icon" />
          Technical Specs
        </button>
        <button 
          className={`btn ${subTab === 'torque' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('torque')}
          style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
        >
          <Settings className="btn-icon" />
          Torque Specifications
        </button>
      </div>

      {subTab === 'technical' ? (
        <div className="specs-grid">
          {techSpecs.map((cat, idx) => (
            <div key={idx} className="card" style={{ gridColumn: 'span 12' }}>
              <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                {cat.category}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cat.specs.map((spec, specIdx) => (
                  <div key={specIdx} className="spec-item">
                    <span className="spec-name">{spec.name}</span>
                    <span className="spec-val">{spec.val}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card col-12">
          <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
            Common Tightening Torques (Nm)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Use these manufacturer specification torque values when doing DIY service tasks to avoid over-tightening or stripping aluminum engine threads.
          </p>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fastener / Connection Part</th>
                  <th style={{ textAlign: 'right' }}>Torque Spec</th>
                </tr>
              </thead>
              <tbody>
                {torqueSpecs.map((spec, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: '500' }}>{spec.part}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 'bold' }}>{spec.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border-metal)', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.03)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
            <AlertCircle style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>DIY Tip:</strong> Always replace copper sealing washers on the oil drain plugs and lubricate the O-ring of the new oil filter with fresh engine oil before fastening and torquing.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SpecsSheet;
