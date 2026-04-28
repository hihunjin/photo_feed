import React, { useState } from 'react';
import { createComment } from '../api';

export default function CommentSection({ targetType, targetId, comments = [], onCommentAdded }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await createComment({ targetType, targetId, content: content.trim() });
      setContent('');
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid" style={{ gap: 12 }}>
      <h3 className="section-title" style={{ fontSize: '0.95rem', margin: 0 }}>
        💬 Comments ({comments.length})
      </h3>

      <form className="card grid" onSubmit={handleSubmit} style={{ gap: 10, padding: 14 }}>
        <textarea
          className="textarea"
          placeholder="Write a comment…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ minHeight: 56 }}
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-sm" type="submit" disabled={submitting || !content.trim()}>
          {submitting ? 'Posting…' : 'Post Comment'}
        </button>
      </form>

      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      {comments.map((comment) => (
        <div key={comment.id} className="card" style={{ padding: 14 }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <strong style={{ fontSize: '0.88rem' }}>User #{comment.author_id}</strong>
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              {new Date(comment.created_at).toLocaleString()}
            </span>
          </div>
          <p className="feed-preview" style={{ fontSize: '0.92rem' }}>{comment.content}</p>
        </div>
      ))}
    </section>
  );
}
