'use strict';
// SQLite-Datenbank (eingebautes node:sqlite, keine nativen Abhängigkeiten).
// Alle Geldbeträge werden als ganze Cent-Werte (INTEGER) gespeichert.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'shop.sqlite');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS clubs (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,          -- URL: /<slug>
  name             TEXT NOT NULL,                 -- "VsB Mellernau e.V."
  short_name       TEXT,                          -- "VsB Mellernau"
  order_prefix     TEXT NOT NULL,                 -- Präfix der Bestellnummer, z.B. "VSB"
  domain           TEXT UNIQUE,                   -- optional eigene Domain, z.B. shop.vsb-mellernau.de
  color_primary    TEXT NOT NULL DEFAULT '#1d3c9c',
  color_secondary  TEXT NOT NULL DEFAULT '#ffffff',
  color_accent     TEXT NOT NULL DEFAULT '#2e9e48',
  logo_path        TEXT,                          -- /uploads/... oder /static/...
  hero_image_path  TEXT,
  tagline          TEXT,                          -- "Dein Verein vor Ort"
  intro_text       TEXT,                          -- Markdown, Begrüßung auf der Startseite
  order_info       TEXT,                          -- Markdown, Hinweise zu Abholung/Zahlung im Checkout
  contact_name     TEXT,                          -- Ansprechpartner im Sporthaus
  contact_email    TEXT,
  contact_phone    TEXT,
  require_member_number INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY,
  club_id        INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sku            TEXT,                -- Artikelnummer
  brand          TEXT,                -- z.B. "Erima", "Craft"
  name           TEXT NOT NULL,
  description    TEXT,                -- Markdown
  category       TEXT,                -- z.B. "Trikots", "Jacken"
  illustration   TEXT NOT NULL DEFAULT 'tshirt', -- Typ der generierten Produktgrafik
  image_path     TEXT,                -- optional echtes Foto (hat Vorrang vor Illustration)
  uvp_cents      INTEGER,
  price_cents    INTEGER NOT NULL,    -- Vereinspreis (vor Zuschuss)
  sizes          TEXT NOT NULL DEFAULT '[]',  -- JSON ["S","M",...]
  colors         TEXT NOT NULL DEFAULT '[]',  -- JSON [{"name":"Royal","hex":"#1d4fb8","hex2":"#ffffff"}]
  variants       TEXT NOT NULL DEFAULT '[]',  -- JSON [{"name":"Kinder","price_cents":1319}] price_cents null = Grundpreis
  print_options  TEXT NOT NULL DEFAULT '[]',  -- JSON [{"key":"name","label":"Name Rücken","max_length":14,"price_cents":350,"placeholder":"MÜLLER"}]
  logo_print     TEXT,                -- inkl. Vereinsdruck, z.B. "Vereinslogo Brust links"
  funding_mode   TEXT NOT NULL DEFAULT 'member', -- member | subsidy | club_article  (siehe lib/pricing.js)
  subsidy_cents  INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_featured    INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_club ON products(club_id, is_active, sort_order);

-- Inhaltsseiten. club_id NULL = globale Seite (z.B. Impressum/Datenschutz des Sporthauses),
-- wird in jedem Vereinsshop angezeigt, sofern der Verein keine eigene Seite mit gleichem Slug hat.
CREATE TABLE IF NOT EXISTS pages (
  id             INTEGER PRIMARY KEY,
  club_id        INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  content        TEXT NOT NULL DEFAULT '',  -- Markdown
  show_in_nav    INTEGER NOT NULL DEFAULT 1,
  show_in_footer INTEGER NOT NULL DEFAULT 0,
  is_published   INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_slug ON pages(IFNULL(club_id, 0), slug);

CREATE TABLE IF NOT EXISTS orders (
  id                 INTEGER PRIMARY KEY,
  order_number       TEXT NOT NULL UNIQUE,     -- z.B. VSB-2026-0007
  club_id            INTEGER NOT NULL REFERENCES clubs(id),
  access_token       TEXT NOT NULL,            -- geheimer Link für die Bestellstatus-Seite des Kunden
  status             TEXT NOT NULL DEFAULT 'new', -- siehe lib/format.js ORDER_STATUSES
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT,
  member_number      TEXT,
  team               TEXT,                     -- Mannschaft / Abteilung
  customer_note      TEXT,
  member_total_cents INTEGER NOT NULL DEFAULT 0,  -- zahlt das Mitglied im Geschäft
  club_total_cents   INTEGER NOT NULL DEFAULT 0,  -- wird dem Verein berechnet
  total_cents        INTEGER NOT NULL DEFAULT 0,
  internal_note      TEXT,                     -- nur im Backend sichtbar
  reject_reason      TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  status_changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_club_status ON orders(club_id, status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku               TEXT,
  brand             TEXT,
  product_name      TEXT NOT NULL,
  variant           TEXT,
  color             TEXT,
  size              TEXT,
  quantity          INTEGER NOT NULL,
  unit_price_cents  INTEGER NOT NULL,   -- Artikelpreis je Stück (inkl. Ausführung)
  print_details     TEXT NOT NULL DEFAULT '[]', -- JSON [{"key","label","value","price_cents"}]
  print_price_cents INTEGER NOT NULL DEFAULT 0, -- Summe Sonderdrucke je Stück
  funding_mode      TEXT NOT NULL DEFAULT 'member',
  member_unit_cents INTEGER NOT NULL,   -- Mitgliedsanteil je Stück
  club_unit_cents   INTEGER NOT NULL,   -- Vereinsanteil je Stück
  line_member_cents INTEGER NOT NULL,
  line_club_cents   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Rückfragen / Nachrichten zwischen Sporthaus und Besteller
CREATE TABLE IF NOT EXISTS order_messages (
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender           TEXT NOT NULL,          -- 'shop' | 'customer'
  author           TEXT,                   -- Anzeigename
  body             TEXT NOT NULL,
  read_by_shop     INTEGER NOT NULL DEFAULT 0,
  read_by_customer INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id);

-- Statusverlauf
CREATE TABLE IF NOT EXISTS order_events (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`);

/** Führt fn in einer Transaktion aus. */
function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Kurzformen */
const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

/** Liest einen Wert aus der settings-Tabelle. */
function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value == null ? null : String(value));
}
/** Alle Einstellungen als Objekt, ergänzt um Standardwerte. */
function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of all('SELECT key, value FROM settings')) out[row.key] = row.value;
  return out;
}

// Stammdaten des Sportgeschäfts (im Backend unter "Einstellungen" änderbar)
const DEFAULT_SETTINGS = {
  store_name: 'Sporthaus Ullmann',
  store_tagline: 'Ihr SPORT 2000 Partner in Dresden',
  store_street: 'Hohenbusch-Markt 1',
  store_zip_city: '01108 Dresden',
  store_phone: '+49 (351) 8804217',
  store_fax: '+49 (351) 8804218',
  store_email: 'info@sporthaus-ullmann.de',
  store_website: 'https://www.sporthaus-ullmann.de',
  store_opening_hours: 'Mo–Fr 09:00–19:00\nSa 09:00–16:00',
  price_footnote: '*Alle Preisangaben gelten inklusive gesetzlicher MwSt. und bei Selbstabholung. Bei Preisen, die mit "UVP" gekennzeichnet sind, handelt es sich um die unverbindliche Preisempfehlung des Herstellers/Lieferanten.',
};

module.exports = { db, tx, get, all, run, getSetting, setSetting, getSettings, DATA_DIR, UPLOAD_DIR, DEFAULT_SETTINGS };
