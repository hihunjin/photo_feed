import React, { useState, useEffect } from 'react';
import { getAlbums, getFeeds } from '../api';

export default function CrossLinkModal({ 
  selectedBandId, 
  targetType, // 'album' (copying TO album) or 'feed' (copying TO feed)
  photoIds, 
  onClose, 
  onSuccess 
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadTargets() {
      try {
        if (targetType === 'album') {
          const data = await getAlbums(selectedBandId, { limit: 100 });
          setItems(data.albums || []);
        } else {
          const data = await getFeeds(selectedBandId, { limit: 100 });
          setItems(data.feeds || []);
        }
      } catch (err) {
        console.error('Failed to load targets:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTargets();
  }, [selectedBandId, targetType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId && !newTitle && !newText) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const baseUrl = targetType === 'album' ? '/api/feeds' : '/api/albums';
      // This is a bit tricky because the source is different.
      // Let's pass the full URL or a handler from the parent.
      // Actually, let's just use the current context.
      // If targetType is 'album', source is 'feed'.
      // If targetType is 'feed', source is 'album'.
      onSuccess({
        targetId: selectedId || null,
        newTitle: newTitle || null,
        newText: newText || null
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="edit-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-dialog card grid" style={{ gap: 14 }}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>
            {targetType === 'album' ? 'Save Photos to Album' : 'Post Photos to Feed'}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="grid" style={{ gap: 16 }}>
          {loading ? (
            <p className="muted">Loading options…</p>
          ) : (
            <div>
              <p className="muted" style={{ marginBottom: 8 }}>Choose existing:</p>
              <select 
                className="select" 
                value={selectedId} 
                onChange={(e) => { setSelectedId(e.target.value); if (e.target.value) { setNewTitle(''); setNewText(''); } }}
                disabled={submitting}
              >
                <option value="">-- Select {targetType === 'album' ? 'Album' : 'Feed'} --</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {targetType === 'album' ? item.title : `Feed #${item.id}: ${item.preview_text.substring(0, 30)}...`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="row" style={{ alignItems: 'center' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
            <span className="muted" style={{ padding: '0 10px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
          </div>

          <div>
            <p className="muted" style={{ marginBottom: 8 }}>
              {targetType === 'album' ? 'Create new album:' : 'Create new feed:'}
            </p>
            {targetType === 'album' ? (
              <input 
                className="input"
                placeholder="Album Title"
                value={newTitle}
                onChange={(e) => { setNewTitle(e.target.value); if (e.target.value) setSelectedId(''); }}
                disabled={submitting}
              />
            ) : (
              <textarea 
                className="textarea"
                placeholder="Feed text..."
                value={newText}
                onChange={(e) => { setNewText(e.target.value); if (e.target.value) setSelectedId(''); }}
                disabled={submitting}
                style={{ minHeight: 80 }}
              />
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || (!selectedId && !newTitle && !newText)}>
              {submitting ? 'Working…' : (targetType === 'album' ? 'Save to Album' : 'Post to Feed')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
