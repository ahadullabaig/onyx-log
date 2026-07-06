import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Fuel, Wrench, FileText, LogOut } from 'lucide-react';
import Dashboard from './components/Dashboard';
import FuelLog from './components/FuelLog';
import MaintenanceLog from './components/MaintenanceLog';
import SpecsSheet from './components/SpecsSheet';
import Login from './components/Login';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authToken, setAuthToken] = useState(localStorage.getItem('onyx_auth_token'));
  const [dashboardData, setDashboardData] = useState({
    currentOdometer: 0,
    lastChainCleanOdometer: 0,
    totalFuelCost: 0,
    totalMaintenanceCost: 0,
    fuelEntriesCount: 0,
    maintenanceEntriesCount: 0,
    averageMileage: 0
  });
  const [fuelLogs, setFuelLogs] = useState([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Centralized fetch interceptor to inject Authorization headers and handle 401 logouts
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (url, options = {}) => {
      if (url.startsWith('/api/')) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${authToken}`
        };
      }

      const response = await originalFetch(url, options);

      if (response.status === 401 && url !== '/api/auth/login') {
        localStorage.removeItem('onyx_auth_token');
        setAuthToken(null);
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [authToken]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashRes, fuelRes, maintRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/fuel'),
        fetch('/api/maintenance')
      ]);

      if (!dashRes.ok || !fuelRes.ok || !maintRes.ok) {
        throw new Error('Failed to fetch data from the server.');
      }

      const dashData = await dashRes.json();
      const fuelData = await fuelRes.json();
      const maintData = await maintRes.json();

      setDashboardData(dashData);
      setFuelLogs(fuelData);
      setMaintenanceLogs(maintData);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchData();
    }
  }, [authToken]);

  const handleLoginSuccess = (token) => {
    localStorage.setItem('onyx_auth_token', token);
    setAuthToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('onyx_auth_token');
    setAuthToken(null);
    setDashboardData({
      currentOdometer: 0,
      lastChainCleanOdometer: 0,
      totalFuelCost: 0,
      totalMaintenanceCost: 0,
      fuelEntriesCount: 0,
      maintenanceEntriesCount: 0,
      averageMileage: 0
    });
    setFuelLogs([]);
    setMaintenanceLogs([]);
  };

  const renderContent = () => {
    if (loading && !dashboardData.currentOdometer) {
      return (
        <div style={{ display: 'flex', flex: '1', justifyContent: 'center', alignItems: 'center', height: '60vh', fontFamily: 'var(--mono)' }}>
          LOADING METRICS...
        </div>
      );
    }

    if (error) {
      return (
        <div className="card" style={{ gridColumn: 'span 12', marginTop: '2rem', borderColor: 'var(--color-danger)' }}>
          <h3 style={{ color: 'var(--color-danger)', marginBottom: '0.5rem', fontFamily: 'var(--heading)' }}>Connection Error</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Could not connect to the local server. Make sure the backend server is running on port 5000.</p>
          <button className="btn btn-secondary" onClick={fetchData} style={{ marginTop: '1rem' }}>Retry Connection</button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            data={dashboardData}
            refresh={fetchData}
            fuelLogs={fuelLogs}
            maintLogs={maintenanceLogs}
          />
        );
      case 'fuel':
        return (
          <FuelLog
            logs={fuelLogs}
            refresh={fetchData}
            currentOdo={dashboardData.currentOdometer}
          />
        );
      case 'maintenance':
        return (
          <MaintenanceLog
            logs={maintenanceLogs}
            refresh={fetchData}
            currentOdo={dashboardData.currentOdometer}
          />
        );
      case 'specs':
        return <SpecsSheet />;
      default:
        return <Dashboard data={dashboardData} refresh={fetchData} fuelLogs={fuelLogs} maintLogs={maintenanceLogs} />;
    }
  };

  if (!authToken) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <h1 className="brand-title">KTM Duke 250</h1>
          <span className="brand-subtitle">Gen III Companion</span>
        </div>

        <nav style={{ flexGrow: 1 }}>
          <ul className="nav-menu">
            <li>
              <button
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
                style={{ background: 'none', width: '100%', textAlign: 'left' }}
              >
                <LayoutDashboard className="nav-icon" />
                Dashboard
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'fuel' ? 'active' : ''}`}
                onClick={() => setActiveTab('fuel')}
                style={{ background: 'none', width: '100%', textAlign: 'left' }}
              >
                <Fuel className="nav-icon" />
                Fuel Mileage
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'maintenance' ? 'active' : ''}`}
                onClick={() => setActiveTab('maintenance')}
                style={{ background: 'none', width: '100%', textAlign: 'left' }}
              >
                <Wrench className="nav-icon" />
                Maintenance Log
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'specs' ? 'active' : ''}`}
                onClick={() => setActiveTab('specs')}
                style={{ background: 'none', width: '100%', textAlign: 'left' }}
              >
                <FileText className="nav-icon" />
                Specifications
              </button>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="bike-card-mini">
            <span className="bike-name">Onyx</span>
            <div className="bike-odo">
              <span className="bike-odo-label">ODOMETER</span>
              <span>
                {dashboardData.currentOdometer.toLocaleString()}{' '}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>KM</span>
              </span>
            </div>
          </div>
          <button
            className="nav-item"
            onClick={handleLogout}
            style={{ background: 'none', width: '100%', textAlign: 'left', marginTop: '0.75rem', border: '1px solid transparent', color: 'var(--text-secondary)' }}
          >
            <LogOut className="nav-icon" />
            LOGOUT
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
