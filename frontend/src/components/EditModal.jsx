import React, { useEffect, useRef } from 'react';

/**
 * A lightweight modal overlay for editing items.
 * Props:
 *   title: string
 *   onClose: () => void
 *   onSave: () => void
 *   saving: boolean
 *   children: form fields
 */
export default function EditModal({ title, onClose, onSave, saving, children }) {
  const dialogRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="edit-overlay" onClick={handleOverlayClick}>
      <div className="edit-dialog card grid" ref={dialogRef} style={{ gap: 14 }}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
