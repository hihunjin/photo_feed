import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { getBands, getFeeds, getFeedDates, createFeed, uploadFile } from '../api';
import { usePagination } from '../hooks/usePagination';
import { useThumbnailPoller } from '../hooks/useThumbnailPoller';
import FeedCard from '../components/FeedCard';
import FeedDetailPage from './FeedDetailPage';
import BandSelector from '../components/BandSelector';
import CalendarPicker from '../components/CalendarPicker';

export default function FeedsPage({ user, selectedBand, onSelectBand }) {
  const navigate = useNavigate();

  function handleSelectBand(band) {
    onSelectBand(band);
    navigate(`/${encodeURIComponent(band.name)}/feeds`);
  }

  return (
    <Routes>
      <Route index element={<FeedListView user={user} selectedBand={selectedBand} onSelectBand={handleSelectBand} />} />
      <Route path=":feedId" element={<FeedDetailWrapper onBackPath=".." selectedBand={selectedBand} />} />
    </Routes>
  );
}

function FeedDetailWrapper({ onBackPath, selectedBand }) {
  const { feedId } = useParams();
  const navigate = useNavigate();
  return <FeedDetailPage feedId={feedId} onBack={() => navigate(onBackPath)} selectedBand={selectedBand} />;
}

function FeedListView({ user, selectedBand, onSelectBand }) {
  const [feedText, setFeedText] = useState('');
  const [sort, setSort] = useState('newest');
  const [showForm, setShowForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Instant upload state
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Calendar state
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateFilter, setDateFilter] = useState(null);
  const [feedDates, setFeedDates] = useState([]);

  const feedLoader = useMemo(() => async ({ cursor }) => {
    if (!selectedBand) return { items: [], hasMore: false, cursor: null };
    return getFeeds(selectedBand.id, { sort, limit: 10, cursor, date: dateFilter || undefined });
  }, [selectedBand, sort, dateFilter]);

  const { items: feeds, loading, error, hasMore, loadMore, refresh, setParams } = usePagination(feedLoader, {});

  useEffect(() => {
    if (selectedBand) {
      setParams({});
      setShowSearch(false);
      setDateFilter(null);
      // Load available dates for calendar
      getFeedDates(selectedBand.id)
        .then(data => setFeedDates(data.dates || []))
        .catch(() => setFeedDates([]));
    }
  }, [selectedBand, sort, setParams]);

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
        const result = await uploadFile(uploadObj.file);
        // thumbPending: true for all uploads — worker runs async for both images and videos
        setStagedPhotos(prev => [...prev, {
          id: result.uniquePhotoId,
          thumb: result.thumbnailUrl || result.originalUrl,
          original: result.originalUrl,
          isVideo: result.mediaType === 'video',
          thumbPending: true
        }]);
      } catch (err) {
        console.error('Upload failed', err);
        // Show inline error and cancel any pending save so nothing posts silently
        const msg = err.message && err.message !== 'Upload failed'
          ? err.message
          : `Failed to upload "${uploadObj.file.name}" — file may exceed the 10 GB limit.`;
        setUploadError(msg);
        setSavePending(false);
      } finally {
        setUploadingFiles(prev => prev.filter(p => p.id !== uploadObj.id));
        URL.revokeObjectURL(uploadObj.objectUrl);
      }
    }
  };

  // Poll until all staged thumbnails are ready
  const handleThumbReady = useCallback((uniquePhotoId, thumbUrl) => {
    setStagedPhotos(prev => prev.map(p =>
      p.id === uniquePhotoId ? { ...p, thumb: thumbUrl, thumbPending: false } : p
    ));
  }, []);
  useThumbnailPoller(stagedPhotos, handleThumbReady);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadPhotos(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    // Only proceed once all uploads have finished AND none failed
    if (savePending && uploadingFiles.length === 0 && !uploadError) {
      setSavePending(false);
      performCreate();
    }
  }, [savePending, uploadingFiles.length, uploadError]);

  async function performCreate() {
    setIsSaving(true);
    try {
      await createFeed(selectedBand.id, {
        text: feedText.trim(),
        photoIds: stagedPhotos.map(p => p.id)
      });
      setFeedText('');
      setStagedPhotos([]);
      setShowForm(false);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();

    if (uploadingFiles.length > 0) {
      setSavePending(true);
    } else {
      performCreate();
    }
  }

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Band selector */}
      <BandSelector selectedBand={selectedBand} onSelectBand={onSelectBand} />

      {selectedBand ? (
        <>
          {/* Header row */}
          <div className="row-between">
            <h2 className="section-title" style={{ margin: 0 }}>
              {selectedBand.name} — Feeds
            </h2>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSearch(true)} title="Search feeds">
                🔍 Search
              </button>
              <div style={{ position: 'relative' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCalendar(v => !v)} title="Calendar search">
                  📅
                </button>
                {showCalendar && (
                  <CalendarPicker
                    availableDates={feedDates}
                    selectedDate={dateFilter}
                    onSelectDate={(d) => {
                      setDateFilter(d);
                      setShowCalendar(false);
                    }}
                    onClose={() => setShowCalendar(false)}
                  />
                )}
              </div>
              <select
                className="select"
                name="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                style={{ width: 140 }}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="new-comments">New comments</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
                {showForm ? '✕' : '＋ Post'}
              </button>
            </div>
          </div>

          {/* Date filter chip */}
          {dateFilter && (
            <div className="date-filter-chip">
              📅 {dateFilter}
              <button onClick={() => setDateFilter(null)} title="Clear date filter">✕</button>
            </div>
          )}

          {/* Search pop-up modal */}
          {showSearch && (
            <SearchModal 
              selectedBand={selectedBand} 
              onClose={() => setShowSearch(false)} 
            />
          )}

          {/* Create form */}
          {showForm && (
            <form className="card grid" onSubmit={handleCreate} style={{ gap: 12 }}>
              <textarea
                className="textarea"
                placeholder="What's happening?"
                value={feedText}
                onChange={(e) => setFeedText(e.target.value)}
                autoFocus
              />
              <div className="photo-grid" style={{ marginBottom: 4 }}>
                {stagedPhotos.map((photo) => (
                  <div key={photo.id} className="photo-edit-item">
                    {/* Placeholder shown while thumbnail is being generated */}
                    {photo.thumbPending && (
                      <div className="photo-thumb video-thumb-placeholder">
                        {photo.isVideo ? '🎬' : '🖼️'}
                      </div>
                    )}
                    {/* Real thumbnail — hidden until ready */}
                    <img
                      className="photo-thumb"
                      src={photo.thumb}
                      alt="staged"
                      style={photo.thumbPending ? { display: 'none' } : {}}
                    />
                    {!photo.thumbPending && photo.isVideo && (
                      <div className="video-play-overlay">▶</div>
                    )}
                    {photo.thumbPending && (
                      <div className="uploading-overlay">
                        <div className="spinner"></div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="photo-delete-badge"
                      onClick={() => setStagedPhotos(prev => prev.filter(p => p.id !== photo.id))}
                    >✕</button>
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

              <div className="file-input-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm,video/x-msvideo"
                  multiple
                  disabled={isSaving}
                  onChange={handleFileSelect}
                />
              </div>
              <p className="muted" style={{ margin: 0 }}>Up to 50 photos/videos per feed</p>
              {uploadError && (
                <div className="upload-error-banner">
                  <span>⚠️ {uploadError}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUploadError('')}>Dismiss</button>
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={isSaving || !!uploadError}>
                {savePending || (isSaving && uploadingFiles.length > 0) ? 'Uploading…' : (isSaving ? 'Posting…' : 'Post Feed')}
              </button>
            </form>
          )}

          {/* Feed list */}
          {error && <p className="error-text">{error}</p>}
          <div className="grid feed-grid">
            {feeds.map((feed) => (
              <FeedCard key={feed.id} feed={feed} onOpen={(id) => navigate(id.toString())} />
            ))}
          </div>
          {feeds.length === 0 && !loading && (
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <p>No feeds yet. Be the first to post!</p>
            </div>
          )}
          {loading && <p className="muted" style={{ textAlign: 'center' }}>Loading…</p>}
          {hasMore && !loading && (
            <button className="btn btn-secondary" onClick={loadMore} style={{ justifySelf: 'center' }}>
              Load more
            </button>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">👆</div>
          <p>Select a band above to view its feeds.</p>
        </div>
      )}
    </div>
  );
}

function SearchModal({ selectedBand, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, []);

  async function performSearch(e) {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setSearched(true);
    try {
      const data = await getFeeds(selectedBand.id, { search: query.trim(), limit: 50 });
      setResults(data.feeds || []);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="edit-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-dialog card grid" style={{ gap: 14 }}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>Search Feeds</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={performSearch} className="row" style={{ gap: 8 }}>
          <input
            ref={inputRef}
            className="input"
            placeholder="Search words…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {searched && !loading && (
          <p className="muted" style={{ margin: 0 }}>Found {totalCount} result{totalCount !== 1 && 's'}</p>
        )}

        {searched && (
          <div className="grid" style={{ gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {results.length > 0 ? results.map(feed => (
              <div 
                key={feed.id} 
                className="card card-interactive" 
                style={{ padding: 12, cursor: 'pointer' }}
                onClick={() => {
                   onClose();
                   navigate(feed.id.toString());
                }}
              >
                <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 6 }}>
                  Feed #{feed.id} • {new Date(feed.created_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>{feed.preview_text || feed.text}</div>
              </div>
            )) : !loading ? (
               <p className="muted" style={{ textAlign: 'center', padding: 20 }}>No results to display.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
