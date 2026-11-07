'use strict';
// Formatierungs- und Hilfsfunktionen. Werden in app.js als res.locals.h für alle Templates bereitgestellt.
const { marked } = require('marked');

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** 1797 -> "17,97 €" */
function money(cents) {
  if (cents == null || cents === '') return '';
  return eurFormatter.format(Number(cents) / 100);
}

/** "17,97" / "17.97" / "17" -> 1797. Leer -> null. Ungültig -> NaN */
function parseMoney(input) {
  if (input == null) return null;
  const s = String(input).trim().replace(/\s|€/g, '');
  if (s === '') return null;
  // "1.234,56" -> "1234.56", "17,97" -> "17.97"
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Cent -> "17,97" für Formularfelder */
function moneyInput(cents) {
  if (cents == null || cents === '') return '';
  return (Number(cents) / 100).toFixed(2).replace('.', ',');
}

/** SQLite-UTC-Zeitstempel "2026-11-07 12:00:00" -> Date */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

function date(value) {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '';
}
function dateTime(value) {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) + ' Uhr' : '';
}

/**
 * Bestellstatus. `next` = erlaubte Folgestatus im Backend.
 * tone = Farbklasse für Badges (.badge-<tone>), definiert in admin.css und shop.css.
 */
const ORDER_STATUSES = {
  new: { label: 'Eingegangen', tone: 'blue', customerText: 'Deine Bestellung ist eingegangen und wird vom Sporthaus geprüft.', next: ['accepted', 'question', 'rejected'] },
  question: { label: 'Rückfrage', tone: 'amber', customerText: 'Das Sporthaus hat eine Rückfrage zu deiner Bestellung. Bitte antworte unten.', next: ['accepted', 'rejected', 'cancelled'] },
  accepted: { label: 'Angenommen', tone: 'green', customerText: 'Deine Bestellung wurde angenommen und wird bearbeitet.', next: ['in_production', 'question', 'cancelled'] },
  in_production: { label: 'Im Druck', tone: 'violet', customerText: 'Deine Artikel werden gerade bedruckt bzw. beflockt.', next: ['ready', 'question'] },
  ready: { label: 'Abholbereit', tone: 'teal', customerText: 'Deine Bestellung liegt zur Abholung bereit. Bezahlung erfolgt im Geschäft.', next: ['completed'] },
  completed: { label: 'Abgeholt', tone: 'gray', customerText: 'Deine Bestellung wurde abgeholt. Viel Spaß damit!', next: [] },
  rejected: { label: 'Abgelehnt', tone: 'red', customerText: 'Deine Bestellung wurde leider abgelehnt.', next: ['new'] },
  cancelled: { label: 'Storniert', tone: 'red', customerText: 'Diese Bestellung wurde storniert.', next: ['new'] },
};
/** Status, die als "offen / zu bearbeiten" gelten */
const OPEN_STATUSES = ['new', 'question'];

function statusLabel(status) {
  return (ORDER_STATUSES[status] || { label: status }).label;
}
function statusTone(status) {
  return (ORDER_STATUSES[status] || { tone: 'gray' }).tone;
}

/** Markdown -> HTML (Inhalte stammen nur von angemeldeten Backend-Benutzern). */
function markdown(text) {
  if (!text) return '';
  return marked.parse(String(text), { breaks: true });
}

/** Text -> URL-Slug: "VsB Mellernau" -> "vsb-mellernau" */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Text auf n Zeichen kürzen */
function truncate(text, n = 80) {
  const s = String(text || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/**
 * Bild-URL eines Produkts: echtes Foto, sonst generierte Illustration in der gewählten Farbe.
 * color = Objekt aus product.colors ({name, hex, hex2}) – optional, sonst erste Farbe.
 */
function productImage(product, color) {
  if (product.image_path) return product.image_path;
  const colors = Array.isArray(product.colors) ? product.colors : [];
  const c = color || colors[0] || { hex: '#1d3c9c', hex2: '#ffffff' };
  const params = new URLSearchParams({ c: (c.hex || '#1d3c9c').replace('#', ''), a: (c.hex2 || '#ffffff').replace('#', '') });
  return `/img/product/${encodeURIComponent(product.illustration || 'tshirt')}.svg?${params}`;
}

/** Ermittelt bei Hex-Farbe, ob dunkle oder helle Schrift besser lesbar ist. */
function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

function isHexColor(s) {
  return /^#[0-9a-f]{6}$/i.test(String(s || '').trim());
}

module.exports = {
  money, parseMoney, moneyInput, date, dateTime, toDate,
  ORDER_STATUSES, OPEN_STATUSES, statusLabel, statusTone,
  markdown, slugify, truncate, productImage, contrastText, isHexColor,
};
