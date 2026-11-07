'use strict';
// Persistenz für Vercel (serverless, kein dauerhaftes Dateisystem): Die SQLite-Datei wird als Snapshot
// in Upstash Redis abgelegt. Vor jeder Anfrage wird geprüft, ob eine neuere Version existiert (dann
// wird sie geladen); nach jeder schreibenden Anfrage (POST/PUT/DELETE) wird ein neuer Snapshot gespeichert.
// Nur gedacht für kleine Demo-/Testdaten (letzter Schreiber gewinnt).
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = require('../db');

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY_DB = 'vereinsshop:db';
const KEY_VER = 'vereinsshop:ver';

const enabled = Boolean(URL_ && TOKEN);
let localVer = null;

async function redis(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = await res.json();
  for (const r of out) if (r.error) throw new Error(r.error);
  return out.map((r) => r.result);
}

/** Lädt den Snapshot, falls er neuer ist als der lokale Stand. Gibt false zurück, wenn (noch) keiner existiert. */
async function pull() {
  const [ver] = await redis([['GET', KEY_VER]]);
  if (!ver) return false;
  if (ver === localVer) return true;
  const [data] = await redis([['GET', KEY_DB]]);
  if (!data) return false;
  for (const f of ['', '-wal', '-shm']) fs.rmSync(db.DB_FILE + f, { force: true });
  fs.writeFileSync(db.DB_FILE, Buffer.from(data, 'base64'));
  db.reopen();
  localVer = ver;
  return true;
}

async function push() {
  db.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const ver = crypto.randomBytes(8).toString('hex');
  const data = fs.readFileSync(db.DB_FILE).toString('base64');
  await redis([['SET', KEY_DB, data], ['SET', KEY_VER, ver]]);
  localVer = ver;
}

/** Express-Middleware */
function middleware() {
  return async (req, res, next) => {
    try { await pull(); } catch (err) { console.error('Snapshot laden fehlgeschlagen:', err.message); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const end = res.end.bind(res);
      res.end = (...args) => {
        push().catch((err) => console.error('Snapshot speichern fehlgeschlagen:', err.message)).finally(() => end(...args));
        return res;
      };
    }
    next();
  };
}

module.exports = { enabled, pull, push, middleware };
