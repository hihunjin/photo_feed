import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBands, createBand, updateBand } from '../api';
import EditModal from '../components/EditModal';

export default function BandsPage({ user, selectedBand, onSelectBand }) {
  const [bands, setBands] = useState([]);
  const [bandName, setBandName] = useState('');
  const [bandDesc, setBandDesc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  // Edit state
  const [editBand, setEditBand] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBands()
      .then((data) => setBands(data.items || data.bands || []))
      .catch(() => setBands([]));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!bandName.trim()) return;
    const created = await createBand({ name: bandName.trim(), description: bandDesc.trim() || undefined });
    setBands((prev) => [created, ...prev]);
    setBandName('');
    setBandDesc('');
    setShowForm(false);
  }

  function openEdit(band, e) {
    e.stopPropagation();
    setEditBand(band);
    setEditName(band.name);
    setEditDesc(band.description || '');
  }

  async function handleSaveEdit() {
    if (!editBand) return;
    setSaving(true);
    try {
      const updated = await updateBand(editBand.id, {
        name: editName.trim(),
        description: editDesc.trim()
      });
      setBands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      if (selectedBand?.id === updated.id) onSelectBand(updated);
      setEditBand(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      <div className="row-between">
        <h2 className="section-title" style={{ margin: 0 }}>Bands</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '✕ Cancel' : '＋ New Band'}
        </button>
      </div>

      {showForm && (
        <form className="card grid" onSubmit={handleCreate} style={{ gap: 12 }}>
          <input className="input" placeholder="Band name" value={bandName} onChange={(e) => setBandName(e.target.value)} autoFocus />
          <textarea className="textarea" placeholder="Description (optional)" value={bandDesc} onChange={(e) => setBandDesc(e.target.value)} style={{ minHeight: 70 }} />
          <button className="btn btn-primary" type="submit">Create Band</button>
        </form>
      )}

      {bands.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎵</div>
          <p>No bands yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="band-grid grid">
          {bands.map((band) => (
            <div
              key={band.id}
              className={`card card-interactive ${selectedBand?.id === band.id ? 'selected' : ''}`}
              onClick={() => onSelectBand(band)}
            >
              <div className="row-between" style={{ marginBottom: 4 }}>
                <strong style={{ fontSize: '1.05rem' }}>{band.name}</strong>
                <button className="btn btn-ghost btn-sm" onClick={(e) => openEdit(band, e)} title="Edit band">✏️</button>
              </div>
              <p className="muted" style={{ margin: '2px 0 14px' }}>
                {band.description || 'No description'}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={(e) => { 
                  e.stopPropagation(); 
                  onSelectBand(band);
                  navigate(`/${encodeURIComponent(band.name)}/feeds`); 
                }}>
                  📝 Feeds
                </button>
                <button className="btn btn-secondary btn-sm" onClick={(e) => { 
                  e.stopPropagation(); 
                  onSelectBand(band);
                  navigate(`/${encodeURIComponent(band.name)}/albums`); 
                }}>
                  📷 Albums
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editBand && (
        <EditModal title="Edit Band" onClose={() => setEditBand(null)} onSave={handleSaveEdit} saving={saving}>
          <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Band name" autoFocus />
          <textarea className="textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" style={{ minHeight: 70 }} />
        </EditModal>
      )}
    </div>
  );
}
