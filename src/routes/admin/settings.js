'use strict';
// Backend: Stammdaten des Sportgeschäfts (erscheinen in allen Vereinsshops).
const express = require('express');
const { setSetting, getSettings, DEFAULT_SETTINGS } = require('../../db');

const router = express.Router();
// Express 5 setzt req.body nur bei vorhandenem Body
router.use((req, res, next) => { req.body = req.body || {}; next(); });

const FIELDS = [
  { key: 'store_name', label: 'Name des Geschäfts', required: true },
  { key: 'store_tagline', label: 'Zusatz / Slogan' },
  { key: 'store_street', label: 'Straße & Hausnummer' },
  { key: 'store_zip_city', label: 'PLZ & Ort' },
  { key: 'store_phone', label: 'Telefon' },
  { key: 'store_fax', label: 'Fax' },
  { key: 'store_email', label: 'E-Mail', type: 'email' },
  { key: 'store_website', label: 'Website', type: 'url' },
  { key: 'store_opening_hours', label: 'Öffnungszeiten', textarea: true, hint: 'Eine Zeile pro Zeitraum, z.B. "Mo–Fr 09:00–19:00".' },
  { key: 'price_footnote', label: 'Fußnote zu Preisen', textarea: true, hint: 'Erscheint im Footer jedes Shops.' },
];

router.get('/', (req, res) => {
  res.render('admin/settings/index', { title: 'Einstellungen', active: 'settings', fields: FIELDS, values: getSettings(), errors: {} });
});

router.post('/', (req, res) => {
  const values = {};
  const errors = {};
  for (const f of FIELDS) {
    values[f.key] = String(req.body[f.key] == null ? '' : req.body[f.key]).replace(/\r\n/g, '\n').trim();
    if (f.required && !values[f.key]) errors[f.key] = 'Pflichtfeld.';
    if (f.type === 'email' && values[f.key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.key])) errors[f.key] = 'Ungültige E-Mail-Adresse.';
  }
  if (Object.keys(errors).length) {
    return res.status(422).render('admin/settings/index', { title: 'Einstellungen', active: 'settings', fields: FIELDS, values, errors });
  }
  for (const f of FIELDS) setSetting(f.key, values[f.key]);
  req.flash('success', 'Einstellungen gespeichert.');
  res.redirect('/admin/settings');
});

router.post('/reset', (req, res) => {
  for (const f of FIELDS) setSetting(f.key, DEFAULT_SETTINGS[f.key] ?? '');
  req.flash('success', 'Standardwerte wiederhergestellt.');
  res.redirect('/admin/settings');
});

module.exports = router;
