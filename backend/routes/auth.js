const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');
const { authMiddleware } = require('../middleware/auth');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * POST /api/auth/login
 * 
 * Development mode: authenticate against local DB (seeded admin/user accounts).
 * Production mode (Synology NAS): authenticate against DSM WebAPI,
 *   then create/sync a local user record for session tracking.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    let user;

    if (IS_PRODUCTION) {
      // --- Production: Synology DSM authentication ---
      const { authenticateWithDSM, ensureLocalUser } = require('../services/synologyAuth');

      const dsmResult = await authenticateWithDSM(username, password);
      if (!dsmResult.success) {
        return res.status(401).json({ error: dsmResult.error || 'Invalid username or password' });
      }

      const role = dsmResult.isAdmin ? 'admin' : 'user';
      user = await ensureLocalUser(username, role);
    } else {
      // --- Development: local DB authentication ---
      const users = await db.query(
        'SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?',
        [username]
      );

      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const dbUser = users[0];

      // Verify password
      const passwordMatch = await auth.verifyPassword(password, dbUser.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      user = dbUser;
    }

    // Generate JWT token
    const accessToken = auth.generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    // Return token and user info
    res.status(200).json({
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user information (requires authentication)
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, username, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    res.status(200).json({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
