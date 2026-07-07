import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, CheckCircle2, X, Calendar, Gauge } from 'lucide-react';

function MaintenancePlanner({ data, refresh, currentOdo }) {
  const { tasks = [] } = data;
  const [submitting, setSubmitting] = useState(false);

  const getTaskCategory = (name) => {
    const n = name.toLowerCase();
    if (n.includes('chain') || n.includes('sprocket')) {
      return { name: 'CHAIN', icon: '⛓', label: '⛓ Chain Care' };
    }
    if (n.includes('fork') || n.includes('seal') || n.includes('shock') || n.includes('suspension')) {
      return { name: 'SUSPENSION', icon: '🔧', label: '🔧 Suspension' };
    }
    if (n.includes('brake') || n.includes('pad') || n.includes('disc')) {
      return { name: 'BRAKES', icon: '🛑', label: '🛑 Brakes' };
    }
    if (n.includes('oil') || n.includes('filter') || n.includes('spark') || n.includes('plug') || n.includes('coolant') || n.includes('engine')) {
      return { name: 'ENGINE', icon: '🛢', label: '🛢 Engine & Cooling' };
    }
    if (n.includes('tyre') || n.includes('tire') || n.includes('tread') || n.includes('pressure') || n.includes('wear')) {
      return { name: 'TYRES', icon: '🛞', label: '🛞 Tyres' };
    }
    if (n.includes('battery') || n.includes('electrical') || n.includes('fuse') || n.includes('light') || n.includes('charge')) {
      return { name: 'ELECTRICAL', icon: '🔋', label: '🔋 Electrical & Battery' };
    }
    return { name: 'OTHER', icon: '🛠', label: '🛠 Miscellaneous' };
  };

  const getTaskEmoji = (name) => {
    const n = name.toLowerCase();
    if (n.includes('coolant')) return '🧊';
    if (n.includes('oil') && n.includes('engine')) return '🛢';
    if (n.includes('oil') && n.includes('fork')) return '🔧';
    if (n.includes('chain') || n.includes('sprocket')) return '⛓';
    if (n.includes('brake') || n.includes('pad') || n.includes('disc')) return '🛑';
    if (n.includes('tyre') || n.includes('tire') || n.includes('tread')) return '🛞';
    if (n.includes('battery')) return '🔋';
    if (n.includes('spark') || n.includes('plug')) return '⚡';
    if (n.includes('filter')) return '💨';
    return '🛠';
  };

  const categoriesMap = {
    'CHAIN': { icon: '⛓', label: '⛓ Chain Care', tasks: [] },
    'ENGINE': { icon: '🛢', label: '🛢 Engine & Cooling', tasks: [] },
    'BRAKES': { icon: '🛑', label: '🛑 Brakes', tasks: [] },
    'TYRES': { icon: '🛞', label: '🛞 Tyres', tasks: [] },
    'SUSPENSION': { icon: '🔧', label: '🔧 Suspension', tasks: [] },
    'ELECTRICAL': { icon: '🔋', label: '🔋 Electrical & Battery', tasks: [] },
    'OTHER': { icon: '🛠', label: '🛠 Miscellaneous', tasks: [] }
  };

  tasks.forEach(task => {
    const cat = getTaskCategory(task.task_name);
    if (categoriesMap[cat.name]) {
      categoriesMap[cat.name].tasks.push({ ...task, categoryInfo: cat });
    } else {
      categoriesMap['OTHER'].tasks.push({ ...task, categoryInfo: cat });
    }
  });

  const orderedCategories = ['CHAIN', 'ENGINE', 'BRAKES', 'TYRES', 'SUSPENSION', 'ELECTRICAL', 'OTHER']
    .map(key => ({ key, ...categoriesMap[key] }))
    .filter(cat => cat.tasks.length > 0);

  const statusOrder = { 'Overdue': 0, 'Due Soon': 1, 'Unconfigured': 2, 'Upcoming': 3 };
  orderedCategories.forEach(cat => {
    cat.tasks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.task_name.localeCompare(b.task_name));
  });

  // Modals state
  const [activeTask, setActiveTask] = useState(null); // task currently being completed or edited
  const [modalMode, setModalMode] = useState(null); // 'complete' | 'edit' | 'add'

  // Form states
  const [taskName, setTaskName] = useState('');
  const [intervalKm, setIntervalKm] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [lastDoneDate, setLastDoneDate] = useState('');
  const [lastDoneOdometer, setLastDoneOdometer] = useState('');
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  const [completionOdometer, setCompletionOdometer] = useState(currentOdo || '');

  const dialogRef = useRef(null);

  // Setup click outside to close dialog
  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;
    const listener = (event) => {
      if (event.target !== dialogElement) return;
      const rect = dialogElement.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        dialogElement.close();
      }
    };
    dialogElement.addEventListener('click', listener);
    return () => dialogElement.removeEventListener('click', listener);
  }, []);

  const openAddModal = () => {
    setModalMode('add');
    setTaskName('');
    setIntervalKm('');
    setIntervalMonths('');
    setLastDoneDate('');
    setLastDoneOdometer('');
    dialogRef.current.showModal();
  };

  const openEditModal = (task) => {
    setActiveTask(task);
    setModalMode('edit');
    setTaskName(task.task_name);
    setIntervalKm(task.interval_km || '');
    setIntervalMonths(task.interval_months || '');
    setLastDoneDate(task.last_done_date || '');
    setLastDoneOdometer(task.last_done_odometer || '');
    dialogRef.current.showModal();
  };

  const openCompleteModal = (task) => {
    setActiveTask(task);
    setModalMode('complete');
    setCompletionDate(new Date().toISOString().split('T')[0]);
    setCompletionOdometer(currentOdo || '');
    dialogRef.current.showModal();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (modalMode === 'add') {
        const res = await fetch('/api/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskName,
            intervalKm: intervalKm ? parseInt(intervalKm, 10) : null,
            intervalMonths: intervalMonths ? parseInt(intervalMonths, 10) : null,
            lastDoneDate: lastDoneDate || null,
            lastDoneOdometer: lastDoneOdometer !== '' ? parseInt(lastDoneOdometer, 10) : null
          })
        });
        if (!res.ok) throw new Error('Failed to create planner task');
      } else if (modalMode === 'edit') {
        const res = await fetch(`/api/planner/${activeTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskName,
            intervalKm: intervalKm ? parseInt(intervalKm, 10) : null,
            intervalMonths: intervalMonths ? parseInt(intervalMonths, 10) : null,
            lastDoneDate: lastDoneDate || null,
            lastDoneOdometer: lastDoneOdometer !== '' ? parseInt(lastDoneOdometer, 10) : null
          })
        });
        if (!res.ok) throw new Error('Failed to update planner task');
      } else if (modalMode === 'complete') {
        const res = await fetch(`/api/planner/${activeTask.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            completionDate,
            completionOdometer: parseInt(completionOdometer, 10)
          })
        });
        if (!res.ok) throw new Error('Failed to log completion');
      }

      dialogRef.current.close();
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this task from the planner?')) {
      try {
        const res = await fetch(`/api/planner/${id}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete planner task');
        refresh();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const getStatusDetails = (task) => {
    if (task.status === 'Unconfigured') {
      return {
        badgeStyle: { backgroundColor: 'rgba(201, 195, 180, 0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(201, 195, 180, 0.2)' },
        text: 'Baseline Required',
        cardBorder: '1px solid var(--border-metal)'
      };
    }
    if (task.status === 'Overdue') {
      let reason = 'Overdue';
      if (task.dueInKm !== null && task.dueInKm <= 0) {
        reason = `Overdue by ${Math.abs(task.dueInKm).toLocaleString()} km`;
      } else if (task.dueInDays !== null && task.dueInDays <= 0) {
        reason = `Overdue by ${Math.abs(task.dueInDays)} days`;
      }
      return {
        badgeStyle: { backgroundColor: 'var(--critical-red-bg)', color: 'var(--critical-red)', border: '1px solid rgba(255, 46, 46, 0.25)' },
        text: reason,
        cardBorder: '1px solid var(--critical-red)'
      };
    }
    if (task.status === 'Due Soon') {
      let reason = 'Due Soon';
      if (task.dueInKm !== null && task.dueInKm <= 100) {
        reason = `Due in ${task.dueInKm} km`;
      } else if (task.dueInDays !== null) {
        reason = `Due in ${task.dueInDays} days`;
      }
      return {
        badgeStyle: { backgroundColor: 'var(--caution-amber-bg)', color: 'var(--caution-amber)', border: '1px solid rgba(255, 176, 32, 0.25)' },
        text: reason,
        cardBorder: '1px solid var(--caution-amber)'
      };
    }
    // Upcoming
    let reason = 'Upcoming';
    if (task.dueInKm !== null && task.dueInDays !== null) {
      reason = `${task.dueInKm.toLocaleString()} km / ${task.dueInDays} days remaining`;
    } else if (task.dueInKm !== null) {
      reason = `${task.dueInKm.toLocaleString()} km remaining`;
    } else if (task.dueInDays !== null) {
      reason = `${task.dueInDays} days remaining`;
    }
    return {
      badgeStyle: { backgroundColor: 'var(--coolant-ice-bg)', color: 'var(--coolant-ice)', border: '1px solid rgba(79, 163, 209, 0.25)' },
      text: reason,
      cardBorder: '1px solid var(--border-metal)'
    };
  };

  const overdueCount = tasks.filter(t => t.status === 'Overdue').length;
  const dueSoonCount = tasks.filter(t => t.status === 'Due Soon').length;
  const upcomingCount = tasks.filter(t => t.status === 'Upcoming').length;
  const unconfiguredCount = tasks.filter(t => t.status === 'Unconfigured').length;

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title" style={{ fontFamily: 'var(--heading)' }}>Maintenance Planner</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Track periodic inspections, components wear, and scheduled fluid flushes.</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus className="btn-icon" />
          Add Custom Task
        </button>
      </div>

      {/* KPI strips / summary count */}
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="card stat-card col-3" style={{ borderLeft: overdueCount > 0 ? '4px solid var(--critical-red)' : '1px solid var(--border-metal)' }}>
          <span className="stat-label" style={{ color: overdueCount > 0 ? 'var(--critical-red)' : 'var(--text-secondary)' }}>Overdue Tasks</span>
          <div className="stat-value" style={{ color: overdueCount > 0 ? 'var(--critical-red)' : 'var(--text-primary)' }}>{overdueCount}</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Action required immediately</span>
        </div>

        <div className="card stat-card col-3" style={{ borderLeft: dueSoonCount > 0 ? '4px solid var(--caution-amber)' : '1px solid var(--border-metal)' }}>
          <span className="stat-label" style={{ color: dueSoonCount > 0 ? 'var(--caution-amber)' : 'var(--text-secondary)' }}>Due Soon</span>
          <div className="stat-value" style={{ color: dueSoonCount > 0 ? 'var(--caution-amber)' : 'var(--text-primary)' }}>{dueSoonCount}</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Scheduled service window</span>
        </div>

        <div className="card stat-card col-3">
          <span className="stat-label">Upcoming / Active</span>
          <div className="stat-value" style={{ color: 'var(--coolant-ice)' }}>{upcomingCount}</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Optimal running state</span>
        </div>

        <div className="card stat-card col-3" style={{ borderLeft: unconfiguredCount > 0 ? '4px solid var(--text-muted)' : '1px solid var(--border-metal)' }}>
          <span className="stat-label">Unconfigured Baselines</span>
          <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>{unconfiguredCount}</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Require configuration input</span>
        </div>
      </div>

      {/* Main Checklist panel */}
      <div className="card col-12" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          Service & Inspection Planner
        </h2>

        {tasks.length === 0 ? (
          <div className="widget-empty" style={{ padding: '3rem' }}>
            No planner tasks defined. Click "Add Custom Task" to begin.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {orderedCategories.map(cat => (
              <div key={cat.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <h3 style={{ 
                  fontFamily: 'var(--heading)', 
                  fontSize: '1rem', 
                  color: 'var(--ktm-orange-bright)', 
                  borderBottom: '1px solid var(--border-metal)', 
                  paddingBottom: '0.45rem', 
                  marginTop: '0.5rem',
                  textTransform: 'uppercase', 
                  letterSpacing: '1px',
                  fontWeight: '600'
                }}>
                  {cat.label}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {cat.tasks.map(task => {
                    const details = getStatusDetails(task);
                    const emoji = getTaskEmoji(task.task_name);
                    return (
                      <div 
                        key={task.id} 
                        className="planner-task-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '1.15rem 1.25rem',
                          backgroundColor: 'var(--bg-obsidian)',
                          border: details.cardBorder,
                          borderRadius: 'var(--radius-panel)',
                          transition: 'var(--transition-smooth)',
                          gap: '1rem'
                        }}
                      >
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '600', fontFamily: 'var(--sans)', color: 'var(--text-primary)' }}>
                              <span style={{ marginRight: '0.5rem' }}>{emoji}</span>
                              {task.task_name}
                            </h3>
                            {task.is_custom === 1 && (
                              <span className="badge badge-shop" style={{ textTransform: 'uppercase', fontSize: '0.6rem' }}>Custom</span>
                            )}
                            <span className="badge" style={details.badgeStyle}>
                              {task.status}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.45rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Gauge style={{ width: '13px', height: '13px', color: 'var(--text-muted)' }} />
                              Interval: {task.interval_km ? `${task.interval_km.toLocaleString()} km` : 'N/A'} 
                              {task.interval_km && task.interval_months && ' or '}
                              {task.interval_months ? `${task.interval_months} months` : 'N/A'}
                            </span>
                            
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Calendar style={{ width: '13px', height: '13px', color: 'var(--text-muted)' }} />
                              {task.last_done_date && task.last_done_odometer !== null ? (
                                <>Last completed: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--text-primary)' }}>{task.last_done_odometer.toLocaleString()} km</strong> on <strong style={{ fontFamily: 'var(--mono)', color: 'var(--text-primary)' }}>{task.last_done_date}</strong></>
                              ) : (
                                <span style={{ color: 'var(--caution-amber)' }}>No completion history logged.</span>
                              )}
                            </span>
                          </div>

                          {/* Consumed Life Progress Bar */}
                          {task.status !== 'Unconfigured' && (
                            <div style={{ marginTop: '0.85rem', maxWidth: '400px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                <span style={{ fontWeight: '600', color: task.status === 'Overdue' ? 'var(--critical-red)' : task.status === 'Due Soon' ? 'var(--caution-amber)' : 'var(--coolant-ice)' }}>
                                  {task.status === 'Overdue' ? 'OVERDUE' : `${task.consumedPercent ?? 0}% consumed`}
                                </span>
                                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-primary)', fontWeight: '500' }}>
                                  {details.text}
                                </span>
                              </div>
                              <div style={{ 
                                width: '100%', 
                                height: '6px', 
                                backgroundColor: 'rgba(255, 255, 255, 0.08)', 
                                borderRadius: '3px',
                                overflow: 'hidden'
                              }}>
                                <div style={{ 
                                  width: `${task.consumedPercent ?? 0}%`, 
                                  height: '100%', 
                                  backgroundColor: task.status === 'Overdue' ? 'var(--critical-red)' : task.status === 'Due Soon' ? 'var(--caution-amber)' : 'var(--ktm-orange)',
                                  borderRadius: '3px',
                                  transition: 'width 0.4s ease-in-out'
                                }} />
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                          {task.status === 'Unconfigured' ? (
                            <button 
                              className="btn btn-primary" 
                              onClick={() => openCompleteModal(task)}
                              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              <CheckCircle2 style={{ width: '15px', height: '15px' }} />
                              Set Baseline
                            </button>
                          ) : (
                            <button 
                              className="btn btn-secondary" 
                              onClick={() => openCompleteModal(task)}
                              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                              title="Mark Completed"
                            >
                              <CheckCircle2 style={{ width: '15px', height: '15px', color: 'var(--coolant-ice)' }} />
                              <span className="hide-mobile">Mark Done</span>
                            </button>
                          )}

                          <button 
                            className="btn btn-secondary" 
                            onClick={() => openEditModal(task)}
                            style={{ padding: '0.5rem', borderRadius: '4px' }}
                            title="Edit Task"
                          >
                            <Edit2 style={{ width: '14px', height: '14px' }} />
                          </button>

                          {task.is_custom === 1 && (
                            <button 
                              className="btn btn-danger" 
                              onClick={() => handleDelete(task.id)}
                              style={{ padding: '0.5rem', borderRadius: '4px' }}
                              title="Delete Task"
                            >
                              <Trash2 style={{ width: '14px', height: '14px' }} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unified Planner dialog modal */}
      <dialog ref={dialogRef} closedby="any" aria-labelledby="dialogTitle" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 id="dialogTitle" className="modal-title">
            {modalMode === 'add' && 'Add Custom Planner Task'}
            {modalMode === 'edit' && 'Edit Planner Task'}
            {modalMode === 'complete' && 'Log Completion'}
          </h2>
          <button type="button" className="modal-close" onClick={() => dialogRef.current.close()}>
            <X className="btn-icon" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {modalMode !== 'complete' ? (
            <>
              <div className="form-group">
                <label>Task Name</label>
                <input 
                  type="text" 
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  placeholder="e.g. Brake Fluid Replacement"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Odometer Interval (KM)</label>
                  <input 
                    type="number" 
                    value={intervalKm}
                    onChange={e => setIntervalKm(e.target.value)}
                    placeholder="e.g. 15000"
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>Leave blank if time-only</small>
                </div>

                <div className="form-group">
                  <label>Time Interval (Months)</label>
                  <input 
                    type="number" 
                    value={intervalMonths}
                    onChange={e => setIntervalMonths(e.target.value)}
                    placeholder="e.g. 24"
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>Leave blank if mileage-only</small>
                </div>
              </div>

              <h3 style={{ fontFamily: 'var(--heading)', fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '1.25rem 0 0.75rem 0', borderBottom: '1px solid var(--border-metal)', paddingBottom: '0.25rem' }}>
                Baseline Completion (Optional)
              </h3>

              <div className="form-row">
                <div className="form-group">
                  <label>Last Completed Date</label>
                  <input 
                    type="date" 
                    value={lastDoneDate}
                    onChange={e => setLastDoneDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Last Completed Odometer</label>
                  <input 
                    type="number" 
                    value={lastDoneOdometer}
                    onChange={e => setLastDoneOdometer(e.target.value)}
                    placeholder="KM reading"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                Logging completion for: <strong style={{ color: 'var(--text-primary)' }}>{activeTask?.task_name}</strong>. 
                This will save the baseline and reset the next schedule triggers.
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label>Completion Date</label>
                  <input 
                    type="date" 
                    value={completionDate}
                    onChange={e => setCompletionDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Completion Odometer (KM)</label>
                  <input 
                    type="number" 
                    value={completionOdometer}
                    onChange={e => setCompletionOdometer(e.target.value)}
                    placeholder="e.g. 5200"
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ flexGrow: 1 }} 
              onClick={() => dialogRef.current.close()}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ flexGrow: 1 }}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : (modalMode === 'complete' ? 'Mark Completed' : 'Save Task')}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export default MaintenancePlanner;
