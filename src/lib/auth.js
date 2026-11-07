'use strict';
// Passwort-Hashing (scrypt) und Login-Schutz für das Backend.
const crypto = require('node:crypto');
const { get } = require('../db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

/** Middleware: nur angemeldete Backend-Benutzer. Setzt req.user und res.locals.currentUser. */
function requireAdmin(req, res, next) {
  const userId = req.session && req.session.userId;
  const user = userId ? get('SELECT id, username, display_name FROM users WHERE id = ?', userId) : null;
  if (!user) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/admin/login');
  }
  req.user = user;
  res.locals.currentUser = user;
  next();
}

// Einfacher Schutz gegen Passwort-Raten: max. 10 Fehlversuche je IP in 15 Minuten.
const attempts = new Map();
function tooManyAttempts(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > 15 * 60 * 1000) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= 10;
}
function recordFailedAttempt(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.first > 15 * 60 * 1000) attempts.set(ip, { first: Date.now(), count: 1 });
  else entry.count += 1;
}
function clearAttempts(ip) {
  attempts.delete(ip);
}

/** Zufälliges, URL-taugliches Token (für Bestell-Links) */
function randomToken(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { hashPassword, verifyPassword, requireAdmin, tooManyAttempts, recordFailedAttempt, clearAttempts, randomToken };
