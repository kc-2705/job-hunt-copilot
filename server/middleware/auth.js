const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { HttpError } = require('./errors');

function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.jwtSecret(), { expiresIn: env.jwtExpiresIn });
}

// Every data route goes through this. The user id comes from the signed token,
// never from the request body, so nobody can read or change another user's data.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please log in.');
  try {
    const payload = jwt.verify(token, env.jwtSecret());
    req.userId = payload.sub;
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.');
  }
  next();
}

module.exports = { signToken, requireAuth };
