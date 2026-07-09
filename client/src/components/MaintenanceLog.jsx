import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Upload, CheckCircle, X, Eye } from 'lucide-react';
import { apiFetch, uploadUrl } from '../api';

function MaintenanceLog({ logs, refresh, currentOdo }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [odometer, setOdometer] = useState(currentOdo || '');
  const [category, setCategory] = useState('General Service');
  const [cost, setCost] = useState('');
  const [isDiy, setIsDiy] = useState(false);
  const [description, setDescription] = useState('');
  const [billPath, setBillPath] = useState(null);
  
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Modals state
  const [previewFile, setPreviewFile] = useState(null);

  const formDialogRef = useRef(null);
  const previewDialogRef = useRef(null);
  const fileInputRef = useRef(null);
  const billPathRef = useRef(null); // mirrors billPath for the dialog close handler

  const categories = [
    'General Service',
    'Engine Oil',
    'Chain Maintenance',
    'Air Filter',
    'Brake Pads',
    'Tires',
    'Coolant',
    'Spark Plug',
    'Accessories & Mods',
    'Other Repairs'
  ];

  // Enable fallback light-dismiss for the dialogs
  useEffect(() => {
    const handleLightDismiss = (dialogElement) => {
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
    };

    if (formDialogRef.current) handleLightDismiss(formDialogRef.current);
    if (previewDialogRef.current) handleLightDismiss(previewDialogRef.current);
  }, []);

  // Keep a ref in sync so the dialog 'close' handler always sees the latest path.
  useEffect(() => { billPathRef.current = billPath; }, [billPath]);

  // If the form dialog is closed by ANY means (Cancel, X, Escape, click-outside)
  // while a receipt was uploaded but the log was never saved, delete the file so
  // it doesn't orphan on disk. A successful save clears billPathRef first (below),
  // so this no-ops in that case.
  useEffect(() => {
    const dialog = formDialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      if (!billPathRef.current) return;
      const fileName = billPathRef.current.split('/').pop();
      apiFetch(`/api/upload/${fileName}`, { method: 'DELETE' }).catch(() => {});
      billPathRef.current = null;
      setBillPath(null);
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only PNG, JPG, JPEG, and PDF files are allowed.');
      return;
    }

    const formData = new FormData();
    formData.append('bill', file);

    try {
      setUploading(true);
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('File upload failed.');

      const data = await res.json();
      setBillPath(data.filePath);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Delete an uploaded-but-not-yet-saved receipt so it doesn't orphan on disk.
  const removeUploadedFile = async () => {
    const path = billPath;
    setBillPath(null);
    if (!path) return;
    try {
      await apiFetch(`/api/upload/${path.split('/').pop()}`, { method: 'DELETE' });
    } catch {
      // best-effort cleanup; ignore failures
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !odometer || !category) {
      alert('Date, Odometer, and Category are required.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          odometer: parseInt(odometer),
          category,
          cost: parseFloat(cost) || 0,
          isDiy,
          description,
          billPath
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save log');
      }

      // Reset
      setDate(new Date().toISOString().split('T')[0]);
      setOdometer(currentOdo || '');
      setCategory('General Service');
      setCost('');
      setIsDiy(false);
      setDescription('');
      setBillPath(null);
      billPathRef.current = null; // saved & referenced — don't let onClose delete it

      // Close modal
      formDialogRef.current.close();
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this maintenance log and its receipt permanently?')) {
      try {
        const res = await apiFetch(`/api/maintenance/${id}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete maintenance log');
        refresh();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const openPreview = (filePath) => {
    setPreviewFile(filePath);
    setTimeout(() => {
      if (previewDialogRef.current) {
        previewDialogRef.current.showModal();
      }
    }, 50);
  };

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Maintenance & Service Logs</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Log inspections, service history, and bills.</p>
        </div>
        <button className="btn btn-primary" onClick={() => formDialogRef.current.showModal()}>
          <Plus className="btn-icon" />
          Log Maintenance
        </button>
      </div>

      {/* Timeline view of logs */}
      <div style={{ marginTop: '2rem' }}>
        {logs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            No maintenance logs found. Click "Log Maintenance" to record oil changes, chain cleanings, or receipts.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Odometer</th>
                  <th>Service Category</th>
                  <th>Cost</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Receipt</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{log.date}</td>
                    <td style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>{log.odometer.toLocaleString()} km</td>
                    <td>
                      <span className="badge badge-diy" style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                        {log.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600' }}>₹{(log.cost || 0).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`badge ${log.is_diy === 1 ? 'badge-diy' : 'badge-shop'}`}>
                        {log.is_diy === 1 ? 'DIY' : 'Workshop'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', maxWidth: '300px', color: 'var(--text-secondary)' }}>
                      {log.description || 'No description provided'}
                    </td>
                    <td>
                      {log.bill_path ? (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => openPreview(log.bill_path)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          <Eye className="btn-icon" style={{ width: '14px', height: '14px' }} />
                          View
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>None</span>
                      )}
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

      {/* Add Maintenance Dialog (Modal) */}
      <dialog ref={formDialogRef} closedby="any" aria-labelledby="formDialogTitle">
        <div className="modal-header">
          <h2 id="formDialogTitle" className="modal-title">Log Maintenance</h2>
          <button className="modal-close" onClick={() => formDialogRef.current.close()}>
            <X className="btn-icon" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
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
              <label>Odometer (KM)</label>
              <input 
                type="number" 
                value={odometer} 
                onChange={e => setOdometer(e.target.value)}
                placeholder={currentOdo ? `Current: ${currentOdo}` : 'Odo (km)'}
                required 
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Service Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} required>
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Cost (₹)</label>
              <input 
                type="number" 
                placeholder="0"
                value={cost} 
                onChange={e => setCost(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0 1.25rem 0' }}>
            <div 
              className={`checkbox-custom ${isDiy ? 'checked' : ''}`}
              onClick={() => setIsDiy(!isDiy)}
            />
            <span style={{ fontSize: '0.9rem', cursor: 'pointer' }} onClick={() => setIsDiy(!isDiy)}>
              DIY (Service performed myself)
            </span>
          </div>

          <div className="form-group">
            <label>Description / Notes</label>
            <textarea 
              rows="3" 
              placeholder="Provide oil filters models used, service details, issues fixed..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Drag and Drop File Upload Zone */}
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Attach Maintenance Receipt / Bill</label>
            {!billPath ? (
              <div 
                className={`drag-drop-zone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
              >
                <Upload className="drag-drop-icon" />
                <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>
                  {uploading ? 'Uploading Receipt...' : 'Drag & Drop receipt or click to upload'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  PNG, JPG, JPEG or PDF (Max 10MB)
                </span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange}
                  accept=".png,.jpg,.jpeg,.pdf"
                />
              </div>
            ) : (
              <div className="upload-success" style={{ padding: '0.8rem', border: '1px solid var(--border-metal)', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
                <CheckCircle className="btn-icon" style={{ color: 'var(--color-success)' }} />
                <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>
                  Receipt attached successfully!
                </span>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  onClick={removeUploadedFile}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ flexGrow: 1 }} 
              onClick={() => formDialogRef.current.close()}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ flexGrow: 1 }}
              disabled={submitting || uploading}
            >
              {submitting ? 'Saving...' : 'Save Log'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Bill Preview Dialog (Modal) */}
      <dialog ref={previewDialogRef} className="receipt-dialog" closedby="any" aria-labelledby="previewDialogTitle">
        <div className="modal-header">
          <h2 id="previewDialogTitle" className="modal-title">Receipt View</h2>
          <button className="modal-close" onClick={() => previewDialogRef.current.close()}>
            <X className="btn-icon" />
          </button>
        </div>
        <div className="receipt-body">
          {previewFile ? (
            previewFile.toLowerCase().endsWith('.pdf') ? (
              <iframe className="receipt-pdf" src={uploadUrl(previewFile)} title="Receipt PDF"></iframe>
            ) : (
              <img className="receipt-img" src={uploadUrl(previewFile)} alt="Receipt Bill" />
            )
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>No preview available</div>
          )}
        </div>
      </dialog>
    </div>
  );
}

export default MaintenanceLog;
