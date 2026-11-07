'use strict';
// Vercel-Einstieg (Demo-Betrieb). Vercel-Funktionen haben ein schreibgeschütztes Dateisystem –
// nur /tmp ist beschreibbar (flüchtig, je Instanz). Die Datenbank wird daher in /tmp angelegt
// und beim ersten Start automatisch mit den Beispieldaten (Seed) befüllt.
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/vereinsshop-data';
process.env.COOKIE_SECURE = process.env.COOKIE_SECURE || '1';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'vereinsshop-vercel-demo-secret';

const { createApp } = require('../src/app');
const { get } = require('../src/db');
const { seed } = require('../src/seed');

if (!get('SELECT id FROM users LIMIT 1')) seed({ log: () => {} });

module.exports = createApp();
