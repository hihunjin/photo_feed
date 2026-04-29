import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { getAlbums, getAlbum, createAlbum, getComments, updateAlbum, uploadPhoto, addAlbumPhoto, deleteAlbumPhoto } from '../api';
import { usePagination } from '../hooks/usePagination';
import BandSelector from '../components/BandSelector';
import CommentSection from '../components/CommentSection';
import EditModal from '../components/EditModal';
import PhotoLightbox from '../components/PhotoLightbox';
import CrossLinkModal from '../components/CrossLinkModal';

export default function AlbumsPage({ user, selectedBand, onSelectBand }) {
  const navigate = useNavigate();

  function handleSelectBand(band) {
    onSelectBand(band);
    navigate(`/${encodeURIComponent(band.name)}/albums`);
  }

  return (
    <Routes>
      <Route index element={<AlbumListView selectedBand={selectedBand} onSelectBand={handleSelectBand} />} />
      <Route path=":albumId" element={<AlbumDetailWrapper onBackPath=".." selectedBand={selectedBand} />} />
    </Routes>
  );
}

function AlbumDetailWrapper({ onBackPath, selectedBand }) {
  const { albumId } = useParams();
  const navigate = useNavigate();
  return <AlbumDetailView albumId={albumId} onBack={() => navigate(onBackPath)} selectedBand={selectedBand} />;
}

/* ── Album List ── */
function AlbumListView({ selectedBand, onSelectBand }) {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const fileRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [editAlbum, setEditAlbum] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Instant upload state
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [savePending, setSavePending] = useState(false);

  const loader = useMemo(() => async ({ cursor }) => {
    if (!selectedBand) return { items: [], hasMore: false, cursor: null };
    return getAlbums(selectedBand.id, { limit: 20, cursor });
  }, [selectedBand]);

  const { items: albums, loading, error, hasMore, loadMore, refresh, setParams } = usePagination(loader, {});

  useEffect(() => {
    if (selectedBand) setParams({});
  }, [selectedBand, setParams]);

  const uploadPhotos = async (files) => {
    const newUploads = Array.from(files).map((file, i) => ({
      id: `temp-${Date.now()}-${i}`,
      file,
      objectUrl: URL.createObjectURL(file)
    }));
    setUploadingFiles(prev => [...prev, ...newUploads]);
    for (const uploadObj of newUploads) {
      try {
        const result = await uploadPhoto(uploadObj.file);
        setStagedPhotos(prev => [...prev, {
          id: result.uniquePhotoId,
          thumb: result.thumbnailUrl || result.originalUrl
        }]);
      } catch (err) {
        alert('Upload failed');
      } finally {
        setUploadingFiles(prev => prev.filter(p => p.id !== uploadObj.id));
        URL.revokeObjectURL(uploadObj.objectUrl);
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) uploadPhotos(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  useEffect(() => {
    if (savePending && uploadingFiles.length === 0) {
      setSavePending(false);
      performCreate();
    }
  }, [savePending, uploadingFiles.length]);

  async function performCreate() {
    setSaving(true);
    try {
      await createAlbum(selectedBand.id, {
        title: title.trim(),
        description: desc.trim(),
        photoIds: stagedPhotos.map(p => p.id)
      });
      setTitle('');
      setDesc('');
      setStagedPhotos([]);
      setShowForm(false);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (uploadingFiles.length > 0) setSavePending(true);
    else performCreate();
  }

  function openEdit(album, e) {
    e.stopPropagation();
    setEditAlbum(album);
    setEditTitle(album.title);
    setEditDesc(album.description || '');
  }

  async function handleSaveEdit() {
    if (!editAlbum) return;
    setSaving(true);
    try {
      await updateAlbum(editAlbum.id, {
        title: editTitle.trim(),
        description: editDesc.trim()
      });
      setEditAlbum(null);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      <BandSelector selectedBand={selectedBand} onSelectBand={onSelectBand} />

      {selectedBand ? (
        <>
          <div className="row-between">
            <h2 className="section-title" style={{ margin: 0 }}>
              {selectedBand.name} — Albums
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? '✕' : '＋ New Album'}
            </button>
          </div>

          {showForm && (
            <form className="card grid" onSubmit={handleCreate} style={{ gap: 12 }}>
              <input className="input" placeholder="Album title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              <textarea className="textarea" placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 60 }} />
              <div className="photo-grid" style={{ marginBottom: 4 }}>
                {stagedPhotos.map((photo) => (
                  <div key={photo.id} className="photo-edit-item">
                    <img className="photo-thumb" src={photo.thumb} alt="staged" />
                    <button 
                      type="button"
                      className="photo-delete-badge" 
                      onClick={() => setStagedPhotos(prev => prev.filter(p => p.id !== photo.id))}
                    >✕</button>
                  </div>
                ))}
                {uploadingFiles.map((up) => (
                  <div key={up.id} className="photo-edit-item">
                    <img className="photo-thumb" src={up.objectUrl} alt="uploading" />
                    <div className="uploading-overlay">
                      <div className="spinner"></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="file-input-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  disabled={saving}
                  onChange={handleFileSelect}
                />
              </div>
              <p className="muted" style={{ margin: 0 }}>Create album and add photos</p>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {savePending || (saving && uploadingFiles.length > 0) ? 'Uploading…' : (saving ? 'Creating…' : 'Create Album')}
              </button>
            </form>
          )}

          {error && <p className="error-text">{error}</p>}

          {albums.length === 0 && !loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">📷</div>
              <p>No albums yet. Create one!</p>
            </div>
          ) : (
            <div className="album-grid grid">
              {albums.map((album) => (
                <div key={album.id} className="card card-interactive" onClick={() => navigate(album.id.toString())}>
                  {album.cover_thumb_path ? (
                    <img className="album-cover" src={album.cover_thumb_path} alt={album.title} />
                  ) : (
                    <div className="album-cover-placeholder">📷</div>
                  )}
                  <div className="row-between" style={{ marginTop: 10 }}>
                    <strong>{album.title}</strong>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => openEdit(album, e)} title="Edit album">✏️</button>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <span className="badge">{album.photo_count || 0} photos</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && <p className="muted" style={{ textAlign: 'center' }}>Loading…</p>}
          {hasMore && !loading && (
            <button className="btn btn-secondary" onClick={loadMore} style={{ justifySelf: 'center' }}>
              Load more
            </button>
          )}

          {/* Edit modal */}
          {editAlbum && (
            <EditModal title="Edit Album" onClose={() => setEditAlbum(null)} onSave={handleSaveEdit} saving={saving}>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Album title" autoFocus />
              <textarea className="textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" style={{ minHeight: 60 }} />
            </EditModal>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">👆</div>
          <p>Select a band above to view its albums.</p>
        </div>
      )}
    </div>
  );
}

/* ── Album Detail ── */
function AlbumDetailView({ albumId, onBack, selectedBand }) {
  const [album, setAlbum] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState('');

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [actionModalOpen, setActionModalOpen] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const data = await getComments('album', albumId, { limit: 50 });
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }, [albumId]);

  useEffect(() => {
    getAlbum(albumId)
      .then(setAlbum)
      .catch((err) => setError(err.message));
    loadComments();
  }, [albumId, loadComments]);

  function openEdit() {
    setEditTitle(album.title);
    setEditDesc(album.description || '');
    setEditing(true);
  }

  async function handleCrossLinkSuccess(data) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/albums/${albumId}/photos/to-feed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          photoIds: selectedPhotoIds,
          feedId: data.targetId,
          newFeedText: data.newText
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to copy');

      alert('Photos posted to feed successfully!');
      setActionModalOpen(false);
      setSelectionMode(false);
      setSelectedPhotoIds([]);
    } catch (err) {
      alert(err.message);
    }
  }

  const uploadPhotos = async (files) => {
    const newUploads = Array.from(files).map((file, i) => ({
      id: `temp-${Date.now()}-${i}`,
      file,
      objectUrl: URL.createObjectURL(file)
    }));

    setUploadingFiles(prev => [...prev, ...newUploads]);

    for (const uploadObj of newUploads) {
      try {
        const newPhoto = await addAlbumPhoto(albumId, uploadObj.file);
        setAlbum(prev => ({
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
    if (fileRef.current) fileRef.current.value = '';
  };

  async function handleDeletePhoto(photoId) {
    try {
      await deleteAlbumPhoto(albumId, photoId);
      setAlbum(prev => ({
        ...prev,
        photos: prev.photos.filter(p => p.id !== photoId),
        photo_count: Math.max(0, (prev.photo_count || 0) - 1)
      }));
    } catch (err) {
      alert('Failed to delete photo: ' + err.message);
    }
  }

  const [uploadingFiles, setUploadingFiles] = useState([]);
  const fileRef = useRef(null);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      const updated = await updateAlbum(albumId, {
        title: editTitle.trim(),
        description: editDesc.trim()
      });
      setAlbum((prev) => ({ ...prev, ...updated }));
      setEditing(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="empty-state"><p className="error-text">{error}</p></div>;
  if (!album) return <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      <div className="row-between">
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h2 className="section-title" style={{ margin: 0 }}>{album.title}</h2>
          <span className="badge">{album.photo_count || 0} photos</span>
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
          <button className="btn btn-ghost btn-sm" onClick={openEdit} title="Edit album">✏️ Edit</button>
        </div>
      </div>

      {selectionMode && selectedPhotoIds.length > 0 && (
        <div className="selection-toolbar card fade-in" style={{ padding: '10px 20px', marginBottom: 10 }}>
          <div className="row-between">
            <span>{selectedPhotoIds.length} photo(s) selected</span>
            <button className="btn btn-primary btn-sm" onClick={() => setActionModalOpen(true)}>
              Post to Feed
            </button>
          </div>
        </div>
      )}

      <div className="card grid" style={{ gap: 14 }}>
        {album.description && <p className="text-secondary">{album.description}</p>}
        
        <div className="photo-grid">
          {Array.isArray(album.photos) && album.photos.map((photo, index) => {
            const isSelected = selectedPhotoIds.includes(photo.id);
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
                  alt="album photo" 
                  loading="lazy"
                />
                {selectionMode && (
                  <div className={`selection-badge ${isSelected ? 'active' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </div>
                )}
                <button 
                  className="photo-delete-badge" 
                  onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                  title="Delete photo"
                >✕</button>
              </div>
            );
          })}
          {uploadingFiles.map((up) => (
            <div key={up.id} className="photo-thumb-container">
              <img className="photo-thumb" src={up.objectUrl} alt="uploading" />
              <div className="uploading-overlay">
                <div className="spinner"></div>
              </div>
            </div>
          ))}
          {!album.photos?.length && !uploadingFiles.length && (
            <p className="muted">No photos yet.</p>
          )}
        </div>

        {/* Add photos action */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
          <p className="muted" style={{ marginBottom: 6 }}>Add photos to album:</p>
          <div className="file-input-wrap">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              disabled={saving}
              onChange={handleFileSelect}
            />
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox 
          photos={album.photos} 
          initialIndex={lightboxIndex} 
          onClose={() => setLightboxIndex(null)} 
        />
      )}

      {actionModalOpen && selectedBand && (
        <CrossLinkModal
          selectedBandId={selectedBand.id}
          targetType="feed"
          photoIds={selectedPhotoIds}
          onClose={() => setActionModalOpen(false)}
          onSuccess={handleCrossLinkSuccess}
        />
      )}

      <CommentSection
        targetType="album"
        targetId={albumId}
        comments={comments}
        onCommentAdded={loadComments}
      />

      {/* Edit modal */}
      {editing && (
        <EditModal title="Edit Album" onClose={() => setEditing(false)} onSave={handleSaveEdit} saving={saving}>
          <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Album title" autoFocus />
          <textarea className="textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" style={{ minHeight: 60 }} />
        </EditModal>
      )}
    </div>
  );
}
