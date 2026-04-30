import React from 'react';

export default function FeedCard({ feed, onOpen }) {
  const previews = feed.preview_photos || [];
  const videoCount = previews.filter(p => p.media_type === 'video').length;

  return (
    <article className="card card-interactive" onClick={() => onOpen?.(feed.id)}>
      <div className="row-between">
        <strong>Feed #{feed.id}</strong>
        <span className="muted">{new Date(feed.created_at).toLocaleString()}</span>
      </div>
      <p className="feed-preview" style={{ margin: '8px 0' }}>
        {feed.preview_text || <em className="muted">(빈 글)</em>}
      </p>

      {/* Up to 3 photo/video thumbnails */}
      {previews.length > 0 && (
        <div className="photo-grid" style={{ marginBottom: 12 }}>
          {previews.map((photo) => {
            const isPending = !photo.thumb_path || photo.thumb_path === photo.original_path;
            return (
              <div key={photo.id} style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                {isPending ? (
                  <div className="photo-thumb video-thumb-placeholder" style={{ width: 64, height: 64 }}>
                    {photo.media_type === 'video' ? '🎬' : '🖼️'}
                  </div>
                ) : (
                  <img
                    className="photo-thumb"
                    src={photo.thumb_path}
                    alt="preview"
                    style={{ width: 64, height: 64 }}
                    loading="lazy"
                  />
                )}
                {isPending && (
                  <div className="uploading-overlay">
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div>
                  </div>
                )}
                {!isPending && photo.media_type === 'video' && (
                  <div className="video-play-overlay" style={{ fontSize: '0.7rem' }}>▶</div>
                )}
              </div>
            );
          })}
          {feed.photo_count > 3 && (
            <div className="photo-thumb-more" style={{ width: 64, height: 64 }}>
              +{feed.photo_count - 3}
            </div>
          )}
        </div>
      )}

      <div className="feed-meta">
        {feed.photo_count > 0 && (
          <span>
            {videoCount > 0 ? `📷 ${feed.photo_count - videoCount} 🎬 ${videoCount}` : `📷 ${feed.photo_count}`}
          </span>
        )}
        {feed.comment_count > 0 && <span>💬 {feed.comment_count}</span>}
      </div>
    </article>
  );
}
