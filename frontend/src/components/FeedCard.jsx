import React from 'react';

export default function FeedCard({ feed, onOpen }) {
  const previews = feed.preview_photos || [];

  return (
    <article className="card card-interactive" onClick={() => onOpen?.(feed.id)}>
      <div className="row-between">
        <strong>Feed #{feed.id}</strong>
        <span className="muted">{new Date(feed.created_at).toLocaleString()}</span>
      </div>
      <p className="feed-preview" style={{ margin: '8px 0' }}>{feed.preview_text}</p>

      {/* Up to 3 photo thumbnails */}
      {previews.length > 0 && (
        <div className="photo-grid" style={{ marginBottom: 8 }}>
          {previews.map((photo) => (
            <img
              key={photo.id}
              className="photo-thumb"
              src={photo.thumb_path || photo.original_path}
              alt="preview"
              style={{ width: 64, height: 64 }}
            />
          ))}
          {feed.photo_count > 3 && (
            <span className="photo-thumb-more">+{feed.photo_count - 3}</span>
          )}
        </div>
      )}

      <div className="feed-meta">
        {feed.photo_count > 0 && <span>📷 {feed.photo_count} photo(s)</span>}
        {feed.comment_count > 0 && <span>💬 {feed.comment_count}</span>}
      </div>
    </article>
  );
}
