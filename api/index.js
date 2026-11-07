'use strict';
// Vercel-Einstieg (Demo-Betrieb). Vercel-Funktionen haben ein schreibgeschütztes Dateisystem –
// nur /tmp ist beschreibbar (flüchtig, je Instanz). Die Datenbank liegt daher in /tmp; ist Upstash Redis
// konfiguriert (UPSTASH_REDIS_REST_URL/TOKEN bzw. KV_REST_API_URL/TOKEN), wird sie dort als Snapshot
// gesichert und von allen Instanzen geteilt. Beim ersten Start werden die Beispieldaten (Seed) angelegt.
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/vereinsshop-data';
process.env.DB_JOURNAL_MODE = process.env.DB_JOURNAL_MODE || 'DELETE';
process.env.COOKIE_SECURE = process.env.COOKIE_SECURE || '1';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'vereinsshop-vercel-demo-secret';

const express = require('express');
const { createApp } = require('../src/app');
const { get } = require('../src/db');
const { seed } = require('../src/seed');
const snapshot = require('../src/lib/snapshot');

const inner = createApp();
const app = express();
let ready;

function init() {
  return (async () => {
    if (snapshot.enabled) {
      let found = false;
      try { found = await snapshot.pull(); } catch (err) { console.error(err.message); }
      if (!found) {
        if (!get('SELECT id FROM users LIMIT 1')) seed({ log: () => {} });
        try { await snapshot.push(); } catch (err) { console.error(err.message); }
      }
    } else if (!get('SELECT id FROM users LIMIT 1')) {
      seed({ log: () => {} });
    }
  })();
}

app.use(async (req, res, next) => {
  try { await (ready = ready || init()); next(); } catch (err) { next(err); }
});
if (snapshot.enabled) app.use(snapshot.middleware());
app.use(inner);

module.exports = app;
