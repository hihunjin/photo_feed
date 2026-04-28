import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { getBands, getFeeds, createFeed } from '../api';
import { usePagination } from '../hooks/usePagination';
import FeedCard from '../components/FeedCard';
import FeedDetailPage from './FeedDetailPage';
import BandSelector from '../components/BandSelector';

export default function FeedsPage({ user, selectedBand, onSelectBand }) {
  const navigate = useNavigate();

  function handleSelectBand(band) {
    onSelectBand(band);
    navigate(`/${encodeURIComponent(band.name)}/feeds`);
  }

  return (
    <Routes>
      <Route index element={<FeedListView user={user} selectedBand={selectedBand} onSelectBand={handleSelectBand} />} />
      <Route path=":feedId" element={<FeedDetailWrapper onBackPath=".." />} />
    </Routes>
  );
}

function FeedDetailWrapper({ onBackPath }) {
  const { feedId } = useParams();
  const navigate = useNavigate();
  return <FeedDetailPage feedId={feedId} onBack={() => navigate(onBackPath)} />;
}

function FeedListView({ user, selectedBand, onSelectBand }) {
  const [feedText, setFeedText] = useState('');
  const [sort, setSort] = useState('newest');
  const [showForm, setShowForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const feedLoader = useMemo(() => async ({ cursor }) => {
    if (!selectedBand) return { items: [], hasMore: false, cursor: null };
    return getFeeds(selectedBand.id, { sort, limit: 10, cursor });
  }, [selectedBand, sort]);

  const { items: feeds, loading, error, hasMore, loadMore, refresh, setParams } = usePagination(feedLoader, {});

  useEffect(() => {
    if (selectedBand) {
      setParams({});
      setShowSearch(false);
    }
  }, [selectedBand, sort, setParams]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!feedText.trim()) return;
    const formData = new FormData();
    formData.set('text', feedText.trim());
    if (fileInputRef.current?.files.length > 0) {
      for (const file of fileInputRef.current.files) {
        formData.append('photos', file);
      }
    }
    await createFeed(selectedBand.id, formData);
    setFeedText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(false);
    refresh();
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
              <div className="file-input-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                />
              </div>
              <p className="muted" style={{ margin: 0 }}>Up to 50 photos per feed</p>
              <button className="btn btn-primary" type="submit">Post Feed</button>
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
