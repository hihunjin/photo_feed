import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getFeed, getComments, updateFeed, addFeedPhoto, deleteFeedPhoto } from '../api';
import CommentSection from '../components/CommentSection';
import PhotoLightbox from '../components/PhotoLightbox';
import CrossLinkModal from '../components/CrossLinkModal';

export default function FeedDetailPage({ feedId, onBack, selectedBand }) {
  const [feed, setFeed] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState('');

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [actionModalOpen, setActionModalOpen] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const data = await getComments('feed', feedId, { limit: 50 });
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }, [feedId]);

  const loadFeed = useCallback(async () => {
    try {
      const data = await getFeed(feedId);
      setFeed(data);
    } catch (err) {
      setError(err.message);
    }
  }, [feedId]);

  useEffect(() => {
    loadFeed();
    loadComments();
  }, [loadFeed, loadComments]);

  async function handleCrossLinkSuccess(data) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/feeds/${feedId}/photos/to-album`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          photoIds: selectedPhotoIds,
          albumId: data.targetId,
          newAlbumTitle: data.newTitle
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to copy');

      alert('Photos saved to album successfully!');
      setActionModalOpen(false);
      setSelectionMode(false);
      setSelectedPhotoIds([]);
    } catch (err) {
      alert(err.message);
    }
  }

  function openEdit() {
    setEditText(feed.text);
    setUploadProgress('');
    setUploadingFiles([]);
    setEditing(true);
  }

  // Delete a photo immediately
  async function handleDeletePhoto(photoId) {
    try {
      await deleteFeedPhoto(feedId, photoId);
      // Remove from local state instantly
      setFeed((prev) => ({
        ...prev,
        photos: prev.photos.filter((p) => p.id !== photoId),
        photo_count: Math.max(0, (prev.photo_count || 0) - 1)
      }));
    } catch (err) {
      alert('Failed to delete photo: ' + err.message);
    }
  }

  const uploadPhotos = async (files) => {
    const newUploads = Array.from(files).map((file, i) => ({
      id: `temp-${Date.now()}-${i}`,
      file,
      objectUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/')
    }));

    setUploadingFiles(prev => [...prev, ...newUploads]);

    for (const uploadObj of newUploads) {
      try {
        const newPhoto = await addFeedPhoto(feedId, uploadObj.file);
        setFeed(prev => ({
          ...prev,
          photos: [...(prev.photos || []), newPhoto],
          photo_count: (prev.photo_count || 0) + 1
        }));
      } catch (err) {
        console.error('Failed to upload photo', err);
        alert('Failed to upload photo: ' + err.message);
      } finally {
        setUploadingFiles(prev => prev.filter(p => p.id !== uploadObj.id));
        URL.revokeObjectURL(uploadObj.objectUrl);
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadPhotos(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (savePending && uploadingFiles.length === 0) {
      setSavePending(false);
      performSave();
    }
  }, [savePending, uploadingFiles.length]);

  async function performSave() {
    setSaving(true);
    try {
      const updated = await updateFeed(feedId, { text: editText.trim() });
      setFeed((prev) => ({ ...prev, ...updated, photos: prev.photos }));
      setEditing(false);
    } catch (err) {
      alert(err.message);
      loadFeed();
    } finally {
      setSaving(false);
    }
  }

  function handleSaveEdit() {
    if (uploadingFiles.length === 0) {
      performSave();
    } else {
      setSavePending(true);
      setSaving(true);
    }
  }

  function closeEdit() {
    if (saving || savePending) return; // prevent closing while saving
    setEditing(false);
    setUploadProgress('');
    setUploadingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const [uploadProgress, setUploadProgress] = useState(''); // kept for backward compatibility if needed, though replaced by overlay

  if (error) return <div className="empty-state"><p className="error-text">{error}</p></div>;
  if (!feed) return <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>;

  const currentPhotos = feed.photos || [];

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      <div className="row-between">
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <strong>Feed #{feed.id}</strong>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button 
            className={`btn btn-sm ${selectionMode ? 'btn-primary' : 'btn-ghost'}`} 
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelectedPhotoIds([]);
            }}
          >
            {selectionMode ? 'Done' : 'Select'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={openEdit} title="Edit feed">✏️ Edit</button>
          <span className="muted">{new Date(feed.created_at).toLocaleString()}</span>
        </div>
      </div>

      {selectionMode && selectedPhotoIds.length > 0 && (
        <div className="selection-toolbar card fade-in" style={{ padding: '10px 20px', marginBottom: 10 }}>
          <div className="row-between">
            <span>{selectedPhotoIds.length} photo(s) selected</span>
            <button className="btn btn-primary btn-sm" onClick={() => setActionModalOpen(true)}>
              Save to Album
            </button>
          </div>
        </div>
      )}

      <article className="card grid" style={{ gap: 14 }}>
        <p className="feed-full-text feed-preview">{feed.text}</p>
        {currentPhotos.length > 0 && (
          <div className="photo-grid">
            {currentPhotos.map((photo, index) => {
              const isSelected = selectedPhotoIds.includes(photo.id);
              const isVideo = photo.media_type === 'video';
              return (
                <div 
                  key={photo.id} 
                className={`photo-thumb-container ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  if (selectionMode) {
                    setSelectedPhotoIds(prev => 
                      prev.includes(photo.id) 
                        ? prev.filter(id => id !== photo.id) 
                        : [...prev, photo.id]
                    );
                  } else {
                    setLightboxIndex(index);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                  <img 
                    className="photo-thumb" 
                    src={photo.thumb_path || photo.original_path} 
                    alt="feed attachment" 
                    loading="lazy"
                  />
                  {isVideo && <div className="video-play-overlay">▶</div>}
                  {selectionMode && (
                    <div className={`selection-badge ${isSelected ? 'active' : ''}`}>
                      {isSelected ? '✓' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>

      {lightboxIndex !== null && (
        <PhotoLightbox 
          photos={currentPhotos} 
          initialIndex={lightboxIndex} 
          onClose={() => setLightboxIndex(null)} 
        />
      )}

      {actionModalOpen && selectedBand && (
        <CrossLinkModal
          selectedBandId={selectedBand.id}
          targetType="album"
          photoIds={selectedPhotoIds}
          onClose={() => setActionModalOpen(false)}
          onSuccess={handleCrossLinkSuccess}
        />
      )}

      <CommentSection
        targetType="feed"
        targetId={feedId}
        comments={comments}
        onCommentAdded={loadComments}
      />

      {/* Edit modal */}
      {editing && (
        <div className="edit-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="edit-dialog card grid" style={{ gap: 14 }}>
            <div className="row-between">
              <h3 className="section-title" style={{ margin: 0 }}>Edit Feed</h3>
              <button className="btn btn-ghost btn-sm" onClick={closeEdit} disabled={saving || savePending}>✕</button>
            </div>

            {/* Text */}
            <textarea
              className="textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
              disabled={saving || savePending}
            />

            {/* Existing photos & pending uploads */}
            {(currentPhotos.length > 0 || uploadingFiles.length > 0) && (
              <div>
                <p className="muted" style={{ marginBottom: 8 }}>
                  Photos & Videos (click ✕ to remove):
                </p>
                <div className="photo-grid">
                  {currentPhotos.map((photo) => (
                    <div key={photo.id} className="photo-edit-item">
                      <img
                        className="photo-thumb"
                        src={photo.thumb_path || photo.original_path}
                        alt="photo"
                      />
                      {photo.media_type === 'video' && <div className="video-play-overlay">▶</div>}
                      <button
                        className="photo-delete-badge"
                        onClick={() => handleDeletePhoto(photo.id)}
                        title="Remove photo"
                        style={{ cursor: 'pointer', border: 'none' }}
                        disabled={saving || savePending}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {uploadingFiles.map((up) => (
                    <div key={up.id} className="photo-edit-item">
                      {up.isVideo
                        ? <div className="photo-thumb video-thumb-placeholder">🎬</div>
                        : <img className="photo-thumb" src={up.objectUrl} alt="uploading" />}
                      <div className="uploading-overlay">
                        <div className="spinner"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new photos */}
            <div>
              <p className="muted" style={{ marginBottom: 6 }}>Add new photos/videos:</p>
              <div className="file-input-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm,video/x-msvideo"
                  multiple
                  disabled={saving || savePending}
                  onChange={handleFileSelect}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={closeEdit} disabled={saving || savePending}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving || savePending}>
                {saving || savePending ? (savePending || uploadingFiles.length > 0 ? 'Uploading…' : 'Saving…') : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
