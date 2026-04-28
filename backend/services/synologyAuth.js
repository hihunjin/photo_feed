/**
 * Synology DSM Authentication Service
 * 
 * In production mode on Synology NAS, authenticates users against DSM's WebAPI.
 * The DSM user credentials are verified via SYNO.API.Auth, then a local
 * DB user record is created/updated to track the session.
 */

const db = require('../db');
const auth = require('../auth');

// DSM WebAPI base URL (localhost since app runs on the NAS itself)
const DSM_BASE_URL = process.env.DSM_URL || 'http://localhost:5000';

/**
 * Authenticate a user against the Synology DSM WebAPI.
 * Returns { success: true, isAdmin } or { success: false, error }.
 */
async function authenticateWithDSM(username, password) {
  try {
    const url = `${DSM_BASE_URL}/webapi/entry.cgi?` + new URLSearchParams({
      api: 'SYNO.API.Auth',
      version: '6',
      method: 'login',
      account: username,
      passwd: password,
      session: 'PhotoFeed',
      format: 'sid'
    }).toString();

    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      return { success: false, error: 'Invalid DSM username or password' };
    }

    const sid = data.data.sid;

    // Check if user is in the administrators group
    let isAdmin = false;
    try {
      const userInfoUrl = `${DSM_BASE_URL}/webapi/entry.cgi?` + new URLSearchParams({
        api: 'SYNO.Core.CurrentConnection',
        version: '1',
        method: 'list',
        _sid: sid
      }).toString();

      // Try to access an admin-only API — if it works, user is admin
      const adminCheckUrl = `${DSM_BASE_URL}/webapi/entry.cgi?` + new URLSearchParams({
        api: 'SYNO.Core.User',
        version: '1',
        method: 'get',
        name: `"${username}"`,
        _sid: sid
      }).toString();

      const adminCheckResp = await fetch(adminCheckUrl);
      const adminCheckData = await adminCheckResp.json();
      // If the user can query their own info via Core.User, check the admin field
      if (adminCheckData.success && adminCheckData.data && adminCheckData.data.users) {
        const userInfo = adminCheckData.data.users.find(u => u.name === username);
        if (userInfo) {
          isAdmin = userInfo.description === 'admin' || false;
        }
      }
    } catch (adminCheckError) {
      // If admin check fails, default to regular user
      console.warn('Admin check failed, defaulting to user role:', adminCheckError.message);
    }

    // Logout from DSM session (we handle our own JWT sessions)
    try {
      await fetch(`${DSM_BASE_URL}/webapi/entry.cgi?` + new URLSearchParams({
        api: 'SYNO.API.Auth',
        version: '6',
        method: 'logout',
        session: 'PhotoFeed',
        _sid: sid
      }).toString());
    } catch (logoutError) {
      // Non-critical
    }

    return { success: true, isAdmin };
  } catch (error) {
    console.error('DSM authentication error:', error.message);
    return { success: false, error: 'Failed to connect to DSM authentication service' };
  }
}

/**
 * Ensure a DSM-authenticated user exists in the local DB.
 * Creates or updates the user record as needed.
 * Returns the local user row.
 */
async function ensureLocalUser(username, role) {
  const existing = await db.query(
    'SELECT id, username, role FROM users WHERE username = ?',
    [username]
  );

  if (existing.length > 0) {
    // Update role if changed on DSM
    if (existing[0].role !== role) {
      await db.query(
        'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [role, existing[0].id]
      );
    }
    return { ...existing[0], role };
  }

  // Create a new local user (password_hash is a placeholder — auth goes through DSM)
  const placeholder = await auth.hashPassword(`dsm-managed-${Date.now()}`);
  await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
    [username, placeholder, role]
  );

  const created = await db.query(
    'SELECT id, username, role FROM users WHERE username = ?',
    [username]
  );
  return created[0];
}

module.exports = {
  authenticateWithDSM,
  ensureLocalUser
};
