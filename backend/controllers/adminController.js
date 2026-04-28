const db = require('../db');
const { adminOnly } = require('../middleware/auth');

async function getUploadPolicy(req, res) {
  try {
    const policy = await db.query(
      `SELECT * FROM upload_policies WHERE id = 1`
    );
    if (policy.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    res.json(policy[0]);
  } catch (err) {
    console.error('Error fetching upload policy:', err);
    res.status(500).json({ error: 'Failed to fetch upload policy' });
  }
}

async function updateUploadPolicy(req, res) {
  try {
    const { feed_max_photos, album_max_photos, max_file_size_mb } = req.body;

    const updates = [];
    const params = [];

    if (feed_max_photos !== undefined) {
      updates.push('feed_max_photos = ?');
      params.push(feed_max_photos);
    }
    if (album_max_photos !== undefined) {
      updates.push('album_max_photos = ?');
      params.push(album_max_photos);
    }
    if (max_file_size_mb !== undefined) {
      updates.push('max_file_size_mb = ?');
      params.push(max_file_size_mb);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(1);
    const query = `UPDATE upload_policies SET ${updates.join(', ')} WHERE id = ?`;
    await db.query(query, params);

    const policy = await db.query(`SELECT * FROM upload_policies WHERE id = 1`);
    res.json(policy[0]);
  } catch (err) {
    console.error('Error updating upload policy:', err);
    res.status(500).json({ error: 'Failed to update upload policy' });
  }
}

module.exports = {
  getUploadPolicy,
  updateUploadPolicy
};
