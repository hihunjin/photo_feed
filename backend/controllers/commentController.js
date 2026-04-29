const db = require('../db');

// GET /api/comments - List comments with cursor pagination
async function getComments(req, res) {
  try {
    const { targetType, targetId, limit = 50, cursor = null } = req.query;

    // Validate targetType
    if (!targetType || !['feed', 'album'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid or missing targetType' });
    }

    if (!targetId) {
      return res.status(400).json({ error: 'targetId is required' });
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 100);

    // Verify target exists
    const tableName = targetType === 'feed' ? 'feeds' : 'albums';
    const targetCheck = await db.query(`SELECT id FROM ${tableName} WHERE id = ?`, [targetId]);
    if (targetCheck.length === 0) {
      return res.status(404).json({ error: `${targetType} not found` });
    }

    let where = `target_type = ? AND target_id = ? AND deleted_at IS NULL`;
    let params = [targetType, targetId];

    if (cursor) {
      where += ` AND created_at < ?`;
      params.push(cursor);
    }

    const comments = await db.query(
      `SELECT id, author_id, target_type, target_id, content, created_at, updated_at
       FROM comments WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, parsedLimit + 1]
    );

    const hasMore = comments.length > parsedLimit;
    const result = hasMore ? comments.slice(0, parsedLimit) : comments;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].created_at : null;

    res.json({
      comments: result,
      cursor: nextCursor,
      hasMore: hasMore
    });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
}

// POST /api/comments - Create comment
async function createComment(req, res) {
  try {
    const { targetType, targetId, content } = req.body;
    const userId = req.user.id;

    if (!targetType || !['feed', 'album'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType' });
    }

    if (!targetId || !content) {
      return res.status(400).json({ error: 'targetId and content required' });
    }

    // Verify target exists
    const tableName = targetType === 'feed' ? 'feeds' : 'albums';
    const targetCheck = await db.query(`SELECT id FROM ${tableName} WHERE id = ?`, [targetId]);
    if (targetCheck.length === 0) {
      return res.status(404).json({ error: `${targetType} not found` });
    }

    const comment = await db.query(
      `INSERT INTO comments (author_id, target_type, target_id, content)
       VALUES (?, ?, ?, ?)`,
      [userId, targetType, targetId, content]
    );

    const created = await db.query(
      `SELECT * FROM comments WHERE author_id = ? AND target_type = ? AND target_id = ? ORDER BY id DESC LIMIT 1`,
      [userId, targetType, targetId]
    );

    // Update comment count on target
    await db.query(
      `UPDATE ${tableName} SET comment_count = comment_count + 1, last_commented_at = datetime('now','localtime') WHERE id = ?`,
      [targetId]
    );

    res.status(201).json(created[0]);
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
}

// PATCH /api/comments/:commentId - Update comment
async function updateComment(req, res) {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const comment = await db.query(`SELECT * FROM comments WHERE id = ?`, [commentId]);
    if (comment.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Permission check: author or admin
    if (comment[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await db.query(
      `UPDATE comments SET content = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      [content || comment[0].content, commentId]
    );

    const refreshed = await db.query(`SELECT * FROM comments WHERE id = ?`, [commentId]);
    res.json(refreshed[0]);
  } catch (err) {
    console.error('Error updating comment:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
}

// DELETE /api/comments/:commentId - Soft delete comment
async function deleteComment(req, res) {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await db.query(`SELECT * FROM comments WHERE id = ?`, [commentId]);
    if (comment.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Permission check: author or admin
    if (comment[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Soft delete
    await db.query(
      `UPDATE comments SET deleted_at = datetime('now','localtime') WHERE id = ?`,
      [commentId]
    );

    // Decrement comment count
    const tableName = comment[0].target_type === 'feed' ? 'feeds' : 'albums';
    await db.query(
      `UPDATE ${tableName} SET comment_count = MAX(0, comment_count - 1) WHERE id = ?`,
      [comment[0].target_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}

async function adminDeleteComment(req, res) {
  try {
    const { commentId } = req.params;

    const comment = await db.query(`SELECT * FROM comments WHERE id = ?`, [commentId]);
    if (comment.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await db.query(`UPDATE comments SET deleted_at = datetime('now','localtime') WHERE id = ?`, [commentId]);

    const tableName = comment[0].target_type === 'feed' ? 'feeds' : 'albums';
    await db.query(
      `UPDATE ${tableName} SET comment_count = MAX(0, comment_count - 1) WHERE id = ?`,
      [comment[0].target_id]
    );

    res.json({ success: true, moderated: true });
  } catch (err) {
    console.error('Error admin deleting comment:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}

module.exports = {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  adminDeleteComment
};
