const db = require('../db');

// Format current local time as YYYY-MM-DD HH:mm:ss (respects process.env.TZ)
function nowLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Get all bands (public to all users)
 */
async function getAllBands(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const cursor = req.query.cursor || null;

    let query = 'SELECT id, name, description, created_by, created_at, updated_at FROM bands';
    let params = [];

    if (cursor) {
      query += ' WHERE id > ? ORDER BY id ASC LIMIT ?';
      params = [cursor, limit + 1];
    } else {
      query += ' ORDER BY id ASC LIMIT ?';
      params = [limit + 1];
    }

    const bands = await db.query(query, params);
    const hasMore = bands.length > limit;
    const items = bands.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.status(200).json({
      items,
      cursor: nextCursor,
      hasMore
    });
  } catch (error) {
    console.error('Get bands error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get specific band
 */
async function getBandById(req, res) {
  try {
    const { bandId } = req.params;

    const bands = await db.query(
      'SELECT id, name, description, created_by, created_at, updated_at FROM bands WHERE id = ?',
      [bandId]
    );

    if (bands.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    res.status(200).json(bands[0]);
  } catch (error) {
    console.error('Get band error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Create new band
 */
async function createBand(req, res) {
  try {
    const { name, description } = req.body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Band name is required' });
    }

    const createdBy = req.user.id;
    const createdAt = nowLocal();

    const result = await db.query(
      `INSERT INTO bands (name, description, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [name, description || null, createdBy, createdAt, createdAt]
    );

    // Get the inserted band
    const bands = await db.query(
      'SELECT id, name, description, created_by, created_at, updated_at FROM bands WHERE created_by = ? ORDER BY created_at DESC LIMIT 1',
      [createdBy]
    );

    if (bands.length === 0) {
      return res.status(500).json({ error: 'Failed to create band' });
    }

    res.status(201).json(bands[0]);
  } catch (error) {
    console.error('Create band error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Update band (creator or admin only)
 */
async function updateBand(req, res) {
  try {
    const { bandId } = req.params;
    const { name, description } = req.body;

    // Get band
    const bands = await db.query(
      'SELECT id, name, description, created_by FROM bands WHERE id = ?',
      [bandId]
    );

    if (bands.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    const band = bands[0];

    // Check permission (creator or admin)
    if (req.user.id !== band.created_by && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to update this band' });
    }

    // Update band
    const updatedAt = nowLocal();
    const updateName = name !== undefined ? name : band.name;
    const updateDescription = description !== undefined ? description : band.description;

    await db.query(
      `UPDATE bands SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      [updateName, updateDescription, updatedAt, bandId]
    );

    // Get updated band
    const updatedBands = await db.query(
      'SELECT id, name, description, created_by, created_at, updated_at FROM bands WHERE id = ?',
      [bandId]
    );

    res.status(200).json(updatedBands[0]);
  } catch (error) {
    console.error('Update band error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Delete band (admin only)
 */
async function deleteBand(req, res) {
  try {
    const { bandId } = req.params;

    // Check admin permission
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get band
    const bands = await db.query(
      'SELECT id FROM bands WHERE id = ?',
      [bandId]
    );

    if (bands.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    // Delete band (cascade delete will handle related data)
    await db.query('DELETE FROM bands WHERE id = ?', [bandId]);

    res.status(200).json({ message: 'Band deleted successfully' });
  } catch (error) {
    console.error('Delete band error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getAllBands,
  getBandById,
  createBand,
  updateBand,
  deleteBand
};
