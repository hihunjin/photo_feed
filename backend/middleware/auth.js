const auth = require('../auth');

/**
 * JWT authentication middleware
 * Verifies token from Authorization header and attaches user to request
 */
function authMiddleware(req, res, next) {
  const authHeader = req.get('Authorization');
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = auth.extractTokenFromHeader(authHeader);
  if (!token) {
    return res.status(401).json({ error: 'Invalid Authorization header format' });
  }

  try {
    const decoded = auth.verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Admin only middleware
 * Can be chained after authMiddleware
 */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  authMiddleware,
  adminOnly
};
