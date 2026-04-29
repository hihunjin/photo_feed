import React, { useMemo, useState, useRef } from 'react';
import { createBand, createFeed, getBands, getFeeds } from '../api';
import { usePagination } from '../hooks/usePagination';
import FeedCard from '../components/FeedCard';
import FeedDetailPage from './FeedDetailPage';

export default function FeedListPage({ user, onLogout }) {
  const [selectedBand, setSelectedBand] = useState(null);
  const [selectedFeedId, setSelectedFeedId] = useState(null);
  const [bandName, setBandName] = useState('');
  const [bandDescription, setBandDescription] = useState('');
  const [feedText, setFeedText] = useState('');
  const [bands, setBands] = useState([]);
  const [sort, setSort] = useState('newest');
  const fileInputRef = useRef(null);

  const feedLoader = useMemo(() => async ({ cursor }) => {
    if (!selectedBand) {
      return { items: [], hasMore: false, cursor: null };
    }
    return getFeeds(selectedBand.id, { sort, limit: 10, cursor });
  }, [selectedBand, sort]);

  const { items: feeds, loading, error, hasMore, loadMore, refresh, setParams } = usePagination(feedLoader, {});

  React.useEffect(() => {
    getBands().then((data) => setBands(data.items || data.bands || [])).catch(() => setBands([]));
  }, []);

  React.useEffect(() => {
    if (selectedBand) {
      setParams({});
    }
  }, [selectedBand, sort, setParams]);

  async function handleCreateBand(event) {
    event.preventDefault();
    const created = await createBand({ name: bandName, description: bandDescription });
    setBands((current) => [created, ...current]);
    setBandName('');
    setBandDescription('');
  }

  async function handleCreateFeed(event) {
    event.preventDefault();
    const formData = new FormData();
    formData.set('text', feedText);

    // Attach selected photos
    if (fileInputRef.current && fileInputRef.current.files.length > 0) {
      for (const file of fileInputRef.current.files) {
        formData.append('photos', file);
      }
    }

    await createFeed(selectedBand.id, formData);
    setFeedText('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    refresh();
  }

  if (selectedFeedId) {
    return <FeedDetailPage feedId={selectedFeedId} onBack={() => setSelectedFeedId(null)} />;
  }

  return (
    <div className="app-shell grid" style={{ gap: 20 }}>
      <header className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="title">지율이네</h1>
          <p className="muted">Signed in as {user.username} ({user.role})</p>
        </div>
        <button className="secondary" onClick={onLogout}>Logout</button>
      </header>

      <section className="grid" style={{ gap: 12 }}>
        <h2 className="title">Bands</h2>
        <div className="band-grid grid">
          {bands.map((band) => (
            <button key={band.id} className="card" onClick={() => setSelectedBand(band)} style={{ textAlign: 'left', cursor: 'pointer', border: selectedBand?.id === band.id ? '2px solid #2563eb' : '1px solid transparent' }}>
              <strong>{band.name}</strong>
              <p className="muted">{band.description || 'No description'}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid" style={{ gap: 12 }}>
        <h2 className="title">Create Band</h2>
        <form className="card grid" onSubmit={handleCreateBand} style={{ gap: 10 }}>
          <input className="input" placeholder="Band name" value={bandName} onChange={(event) => setBandName(event.target.value)} />
          <textarea className="textarea" placeholder="Band description" value={bandDescription} onChange={(event) => setBandDescription(event.target.value)} />
          <button className="primary" type="submit">Create Band</button>
        </form>
      </section>

      {selectedBand ? (
        <section className="grid" style={{ gap: 12 }}>
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <h2 className="title">{selectedBand.name} Feeds</h2>
            <div className="row-wrap">
              <select className="select" name="sort" value={sort} onChange={(event) => setSort(event.target.value)} style={{ width: 180 }}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="new-comments">New comments</option>
              </select>
              <button className="secondary" onClick={() => setSelectedBand(null)}>Back to bands</button>
            </div>
          </div>

          <form className="card grid" onSubmit={handleCreateFeed} style={{ gap: 10 }}>
            <textarea className="textarea" placeholder="Write a feed..." value={feedText} onChange={(event) => setFeedText(event.target.value)} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              className="input"
              style={{ padding: '8px 12px' }}
            />
            <p className="muted" style={{ margin: 0, fontSize: '0.85em' }}>Up to 50 photos per feed</p>
            <button className="primary" type="submit">Post Feed</button>
          </form>

          {error ? <p className="muted" style={{ color: '#b91c1c' }}>{error}</p> : null}
          <div className="grid feed-grid">
            {feeds.map((feed) => (
              <FeedCard key={feed.id} feed={feed} onOpen={setSelectedFeedId} />
            ))}
          </div>
          {loading ? <p className="muted">Loading...</p> : null}
          {hasMore ? <button className="primary" onClick={loadMore}>Load more</button> : null}
        </section>
      ) : null}
    </div>
  );
}
