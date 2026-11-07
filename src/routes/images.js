'use strict';
// Generierte Produktgrafiken: GET /img/product/<typ>.svg?c=<hex>&a=<hex>
const express = require('express');
const { renderIllustration } = require('../lib/illustrations');

const router = express.Router();

const hex = (value, fallback) => {
  const s = String(value || '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : fallback;
};

router.get('/product/:file', (req, res, next) => {
  const m = /^([a-z0-9-]+)\.svg$/.exec(req.params.file);
  if (!m) return next();
  const svg = renderIllustration(m[1], hex(req.query.c, '#1d3c9c'), hex(req.query.a, '#ffffff'));
  if (!svg) return next();
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.send(svg);
});

module.exports = router;
