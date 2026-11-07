'use strict';
// Backend-Router: Login/Logout, Zugriffsschutz und Einbindung der Teilbereiche.
const express = require('express');
const { get, all, run } = require('../../db');
const { verifyPassword, requireAdmin, tooManyAttempts, recordFailedAttempt, clearAttempts } = require('../../lib/auth');
const { unreadCustomerMessages } = require('../../lib/orders');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Anmelden', error: null, username: '' });
});

router.post('/login', (req, res) => {
  const ip = req.ip;
  const username = String(req.body.username || '').trim();
  if (tooManyAttempts(ip)) {
    return res.status(429).render('admin/login', { title: 'Anmelden', error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.', username });
  }
  const user = get('SELECT * FROM users WHERE username = ?', username);
  if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
    recordFailedAttempt(ip);
    return res.status(401).render('admin/login', { title: 'Anmelden', error: 'Benutzername oder Passwort ist falsch.', username });
  }
  clearAttempts(ip);
  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
    res.redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Ab hier nur angemeldet
router.use(requireAdmin);

// Daten für Navigation/Badges in jedem Backend-Template
router.use((req, res, next) => {
  res.locals.navCounts = {
    newOrders: get("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").n,
    openQuestions: get("SELECT COUNT(*) AS n FROM orders WHERE status = 'question'").n,
    unreadMessages: unreadCustomerMessages(),
  };
  res.locals.allClubs = all('SELECT id, slug, name, short_name, color_primary, is_active FROM clubs ORDER BY name');
  next();
});

router.use('/', require('./dashboard'));       // GET /admin
router.use('/orders', require('./orders'));    // Bestellungen
router.use('/clubs', require('./clubs'));      // Vereine / Shops
router.use('/products', require('./products')); // Artikel / Sortiment
router.use('/pages', require('./pages'));      // Inhaltsseiten
router.use('/users', require('./users'));      // Backend-Benutzer
router.use('/settings', require('./settings')); // Stammdaten Sporthaus

module.exports = router;
