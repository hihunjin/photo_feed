const { adminOnly } = require('./auth');

function requireAdmin(req, res, next) {
  return adminOnly(req, res, next);
}

module.exports = {
  requireAdmin
};