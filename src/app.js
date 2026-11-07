'use strict';
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { UPLOAD_DIR, getSettings, getSetting, setSetting } = require('./db');
const { randomToken } = require('./lib/auth');
const SqliteStore = require('./lib/session-store');
const h = require('./lib/format');

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  // Hochgeladene Dateien: Skripte blockieren (wichtig bei SVG-Uploads)
  app.use('/uploads', (req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    next();
  }, express.static(UPLOAD_DIR, { maxAge: '7d' }));
  // Generierte Produkt-Illustrationen: /img/product/<typ>.svg?c=<hex>&a=<hex>
  app.use('/img', require('./routes/images'));

  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  // Express 5: req.body ist ohne Formulardaten undefined
  app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });

  let secret = process.env.SESSION_SECRET || getSetting('session_secret');
  if (!secret) {
    secret = randomToken(32);
    setSetting('session_secret', secret);
  }
  app.use(session({
    store: new SqliteStore(),
    secret,
    name: 'vshop.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: 14 * 24 * 60 * 60 * 1000 },
  }));

  // Flash-Meldungen: req.flash('success'|'error'|'info', text); im Template getFlashes()
  app.use((req, res, next) => {
    req.flash = (type, message) => {
      req.session.flash = req.session.flash || [];
      req.session.flash.push({ type, message });
    };
    res.locals.getFlashes = () => {
      const list = (req.session && req.session.flash) || [];
      if (req.session) delete req.session.flash;
      return list;
    };
    res.locals.h = h;
    res.locals.settings = getSettings();
    res.locals.currentPath = req.path;
    res.locals.query = req.query;
    next();
  });

  app.use('/admin', require('./routes/admin'));
  app.use('/', require('./routes/shop'));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Seite nicht gefunden', status: 404, message: 'Die angeforderte Seite existiert nicht.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    res.status(status).render('error', {
      title: 'Fehler',
      status,
      message: err.userMessage || (status === 500 ? 'Es ist ein unerwarteter Fehler aufgetreten.' : err.message),
    });
  });

  return app;
}

module.exports = { createApp };
