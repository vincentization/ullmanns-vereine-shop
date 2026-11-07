'use strict';
// Backend: Bestellungen (Liste, Detail, Status, Rückfragen, Druckansichten, Export)
const express = require('express');
const { get, all, run } = require('../../db');
const { changeStatus, addMessage, getOrderFull } = require('../../lib/orders');
const { parseJSON } = require('../../lib/pricing');
const { ORDER_STATUSES, statusLabel, dateTime, date } = require('../../lib/format');

const router = express.Router();
const PAGE_SIZE = 25;

/** Status-Tabs der Bestellliste */
const TABS = [
  { key: 'open', label: 'Offen', statuses: ['new', 'question'] },
  { key: 'new', label: 'Eingegangen', statuses: ['new'] },
  { key: 'question', label: 'Rückfrage', statuses: ['question'] },
  { key: 'accepted', label: 'Angenommen', statuses: ['accepted'] },
  { key: 'in_production', label: 'Im Druck', statuses: ['in_production'] },
  { key: 'ready', label: 'Abholbereit', statuses: ['ready'] },
  { key: 'completed', label: 'Abgeholt', statuses: ['completed'] },
  { key: 'closed', label: 'Abgelehnt / Storniert', statuses: ['rejected', 'cancelled'] },
  { key: 'all', label: 'Alle', statuses: null },
];

/** Beschriftung der Aktions-Buttons je Zielstatus */
const ACTION_LABELS = {
  accepted: 'Annehmen',
  question: 'Rückfrage stellen',
  rejected: 'Ablehnen',
  in_production: 'In Druck geben',
  ready: 'Abholbereit melden',
  completed: 'Als abgeholt markieren',
  cancelled: 'Stornieren',
  new: 'Wieder öffnen',
};
const ACTION_STYLES = { accepted: 'btn-success', rejected: 'btn-danger', cancelled: 'btn-danger', question: 'btn-secondary', in_production: 'btn-primary', ready: 'btn-primary', completed: 'btn-primary', new: '' };

function tabByKey(key, fallback = 'open') {
  return TABS.find((t) => t.key === key) || TABS.find((t) => t.key === fallback);
}

function asArray(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v : String(v).split(',');
}

/**
 * Baut die WHERE-Bedingung für Bestellfilter.
 * opts: { statuses: string[]|null, clubId, q, ids }
 */
function buildWhere({ statuses, clubId, q, ids }) {
  const where = [];
  const params = [];
  if (ids && ids.length) {
    where.push(`o.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids.map(Number));
  }
  if (statuses && statuses.length) {
    where.push(`o.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (clubId) {
    where.push('o.club_id = ?');
    params.push(Number(clubId));
  }
  if (q) {
    const like = `%${q}%`;
    where.push(`(o.order_number LIKE ? OR o.first_name LIKE ? OR o.last_name LIKE ? OR (o.first_name || ' ' || o.last_name) LIKE ?
                 OR o.email LIKE ? OR IFNULL(o.team, '') LIKE ? OR IFNULL(o.member_number, '') LIKE ?)`);
    params.push(like, like, like, like, like, like, like);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function backToOrder(res, id) {
  return res.redirect(`/admin/orders/${id}`);
}

function customerLink(order, club) {
  return `/${club.slug}/bestellung/${encodeURIComponent(order.order_number)}?t=${encodeURIComponent(order.access_token)}`;
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const tab = tabByKey(req.query.status);
  const clubId = req.query.club ? Number(req.query.club) || null : null;
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  // Anzahl je Tab (mit Vereins- und Suchfilter)
  const tabCounts = {};
  for (const t of TABS) {
    const w = buildWhere({ statuses: t.statuses, clubId, q });
    tabCounts[t.key] = get(`SELECT COUNT(*) AS n FROM orders o ${w.sql}`, ...w.params).n;
  }

  const w = buildWhere({ statuses: tab.statuses, clubId, q });
  const total = tabCounts[tab.key];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const orders = all(
    `SELECT o.*, c.name AS club_name, c.short_name AS club_short, c.color_primary, c.slug AS club_slug,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count,
            (SELECT COUNT(*) FROM order_messages m WHERE m.order_id = o.id AND m.sender = 'customer' AND m.read_by_shop = 0) AS unread
       FROM orders o JOIN clubs c ON c.id = o.club_id
       ${w.sql}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`,
    ...w.params, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE,
  );
  const sums = get(
    `SELECT COALESCE(SUM(o.member_total_cents), 0) AS member, COALESCE(SUM(o.club_total_cents), 0) AS club FROM orders o ${w.sql}`,
    ...w.params,
  );

  const baseQuery = (overrides = {}) => {
    const p = new URLSearchParams();
    const values = { status: tab.key, club: clubId || '', q, ...overrides };
    for (const [k, v] of Object.entries(values)) if (v !== '' && v != null) p.set(k, v);
    return p.toString();
  };

  res.render('admin/orders/list', {
    title: 'Bestellungen',
    active: 'orders',
    tabs: TABS,
    tab,
    tabCounts,
    clubId,
    q,
    orders,
    sums,
    total,
    page: currentPage,
    pages,
    baseQuery,
  });
});

// ---------------------------------------------------------------------------
// CSV-Export (eine Zeile je Position)
// ---------------------------------------------------------------------------
function loadItemsForExport(query, defaultTab) {
  const ids = asArray(query.ids);
  const tab = tabByKey(query.status, defaultTab);
  const clubId = query.club ? Number(query.club) || null : null;
  const q = String(query.q || '').trim().slice(0, 100);
  const w = buildWhere({ statuses: ids.length ? null : tab.statuses, clubId, q: ids.length ? '' : q, ids });
  const items = all(
    `SELECT i.*, o.order_number, o.status, o.created_at AS order_created_at, o.first_name, o.last_name, o.email, o.phone,
            o.member_number, o.team, o.customer_note, c.name AS club_name, c.short_name AS club_short, p.sizes AS product_sizes
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       JOIN clubs c ON c.id = o.club_id
       LEFT JOIN products p ON p.id = i.product_id
       ${w.sql}
      ORDER BY o.created_at, o.id, i.id`,
    ...w.params,
  ).map((i) => ({ ...i, print_details: parseJSON(i.print_details, []) }));
  const club = clubId ? get('SELECT * FROM clubs WHERE id = ?', clubId) : null;
  return { items, tab, club, clubId, ids };
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvMoney = (cents) => (Number(cents || 0) / 100).toFixed(2).replace('.', ',');

router.get('/export.csv', (req, res) => {
  const { items, tab, club } = loadItemsForExport(req.query, 'all');
  const header = [
    'Bestellnr.', 'Datum', 'Status', 'Verein', 'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Mitgliedsnr.', 'Mannschaft',
    'Artikelnr.', 'Marke', 'Artikel', 'Ausführung', 'Farbe', 'Größe', 'Menge', 'Sonderdrucke',
    'Artikelpreis je Stück', 'Druck je Stück', 'Mitglied je Stück', 'Verein je Stück', 'Mitglied gesamt', 'Verein gesamt', 'Anmerkung Kunde',
  ];
  const lines = [header.map(csvCell).join(';')];
  for (const i of items) {
    lines.push([
      i.order_number, dateTime(i.order_created_at), statusLabel(i.status), i.club_name, i.first_name, i.last_name, i.email, i.phone,
      i.member_number, i.team, i.sku, i.brand, i.product_name, i.variant, i.color, i.size, i.quantity,
      i.print_details.map((p) => `${p.label}: ${p.value}`).join(' | '),
      csvMoney(i.unit_price_cents), csvMoney(i.print_price_cents), csvMoney(i.member_unit_cents), csvMoney(i.club_unit_cents),
      csvMoney(i.line_member_cents), csvMoney(i.line_club_cents), i.customer_note,
    ].map(csvCell).join(';'));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `bestellungen-${club ? club.slug : 'alle'}-${tab.key}-${stamp}.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send('﻿' + lines.join('\r\n') + '\r\n');
});

// ---------------------------------------------------------------------------
// Druckliste für den Druckdienstleister
// ---------------------------------------------------------------------------
const SIZE_ORDER = ['86', '92', '98', '104', '110', '116', '122', '128', '134', '140', '146', '152', '158', '164', '176',
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
function sizeRank(size, productSizes) {
  const list = parseJSON(productSizes, []);
  const idx = list.indexOf(size);
  if (idx >= 0) return idx;
  const g = SIZE_ORDER.indexOf(String(size || '').toUpperCase());
  return g >= 0 ? 100 + g : 1000;
}

router.get('/production', (req, res) => {
  const { items, tab, club, ids } = loadItemsForExport(req.query, 'accepted');
  // Gruppierung: Artikel (+Ausführung) -> Farbe -> Größe
  const groups = new Map();
  for (const i of items) {
    const key = [i.sku || '', i.product_name, i.variant || ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, { sku: i.sku, brand: i.brand, product_name: i.product_name, variant: i.variant, totalQty: 0, printQty: 0, matrix: new Map(), rows: [] });
    }
    const g = groups.get(key);
    g.totalQty += i.quantity;
    if (i.print_details.length) g.printQty += i.quantity;
    const mKey = `${i.color || '–'}|${i.size || '–'}`;
    const m = g.matrix.get(mKey) || { color: i.color || '–', size: i.size || '–', qty: 0, rank: sizeRank(i.size, i.product_sizes) };
    m.qty += i.quantity;
    g.matrix.set(mKey, m);
    g.rows.push({ ...i, rank: sizeRank(i.size, i.product_sizes) });
  }
  const sortRows = (a, b) => String(a.color || '').localeCompare(String(b.color || ''), 'de') || a.rank - b.rank || String(a.order_number).localeCompare(String(b.order_number));
  const list = [...groups.values()]
    .map((g) => ({ ...g, matrix: [...g.matrix.values()].sort(sortRows), rows: g.rows.sort(sortRows) }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'de') || String(a.variant || '').localeCompare(String(b.variant || ''), 'de'));
  const orderNumbers = [...new Set(items.map((i) => i.order_number))];

  res.render('admin/orders/production', {
    title: 'Druckliste',
    groups: list,
    tab,
    club,
    ids,
    orderNumbers,
    totalQty: items.reduce((s, i) => s + i.quantity, 0),
    generatedAt: dateTime(new Date().toISOString().slice(0, 19).replace('T', ' ')),
  });
});

// ---------------------------------------------------------------------------
// Sammelaktion: Status für mehrere Bestellungen setzen
// ---------------------------------------------------------------------------
router.post('/bulk-status', (req, res) => {
  const ids = asArray(req.body.ids).map(Number).filter(Boolean);
  const to = String(req.body.to || '');
  const back = typeof req.body.back === 'string' && req.body.back.startsWith('/admin/orders') ? req.body.back : '/admin/orders';
  if (!ids.length) {
    req.flash('error', 'Bitte mindestens eine Bestellung auswählen.');
    return res.redirect(back);
  }
  if (!ORDER_STATUSES[to] || ['rejected', 'question'].includes(to)) {
    req.flash('error', 'Diese Sammelaktion ist nicht möglich.');
    return res.redirect(back);
  }
  let ok = 0;
  const failed = [];
  for (const id of ids) {
    try {
      changeStatus(id, to, { userId: req.user.id, note: 'Sammelaktion' });
      ok += 1;
    } catch (err) {
      const o = get('SELECT order_number FROM orders WHERE id = ?', id);
      failed.push(o ? o.order_number : `#${id}`);
    }
  }
  if (ok) req.flash('success', `${ok} Bestellung${ok === 1 ? '' : 'en'} auf "${statusLabel(to)}" gesetzt.`);
  if (failed.length) req.flash('error', `Nicht möglich bei: ${failed.join(', ')} (Statuswechsel nicht erlaubt).`);
  res.redirect(back);
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function loadOrder(req, res, next) {
  const id = Number(req.params.id);
  const order = Number.isInteger(id) ? getOrderFull(id) : null;
  if (!order) return next('route'); // -> 404
  req.order = order;
  next();
}

router.get('/:id', loadOrder, (req, res) => {
  const order = req.order;
  // Kundennachrichten gelten mit dem Öffnen als gelesen (für die Anzeige merken wir uns, welche neu waren)
  const unreadIds = new Set(order.messages.filter((m) => m.sender === 'customer' && !m.read_by_shop).map((m) => m.id));
  if (unreadIds.size) run("UPDATE order_messages SET read_by_shop = 1 WHERE order_id = ? AND sender = 'customer'", order.id);
  // Badge-Zahl in der Navigation sofort aktualisieren
  if (unreadIds.size && res.locals.navCounts) res.locals.navCounts.unreadMessages = Math.max(0, res.locals.navCounts.unreadMessages - unreadIds.size);

  const link = customerLink(order, order.club);
  const origin = `${req.protocol}://${req.get('host')}`;
  const fullLink = origin + link;
  const status = ORDER_STATUSES[order.status];
  const greeting = `Hallo ${order.first_name} ${order.last_name},`;
  const mailBody = [
    greeting,
    '',
    `zu Ihrer Bestellung ${order.order_number} im Vereinsshop ${order.club.name}:`,
    `Status: ${status.label} – ${status.customerText}`,
    '',
    'Alle Details und Nachrichten finden Sie hier:',
    fullLink,
    '',
    'Viele Grüße',
    res.locals.settings.store_name,
    res.locals.settings.store_phone,
  ].join('\n');
  const mailto = `mailto:${encodeURIComponent(order.email)}?subject=${encodeURIComponent(`Ihre Bestellung ${order.order_number} – ${order.club.short_name || order.club.name}`)}&body=${encodeURIComponent(mailBody)}`;

  const totals = order.items.reduce((s, i) => ({ qty: s.qty + i.quantity, member: s.member + i.line_member_cents, club: s.club + i.line_club_cents }), { qty: 0, member: 0, club: 0 });

  const otherOrders = all(
    `SELECT id, order_number, status, created_at, total_cents FROM orders
      WHERE club_id = ? AND lower(email) = lower(?) AND id != ? ORDER BY created_at DESC LIMIT 5`,
    order.club_id, order.email, order.id,
  );

  res.render('admin/orders/detail', {
    title: `Bestellung ${order.order_number}`,
    active: 'orders',
    order,
    status,
    nextActions: status.next.map((s) => ({ status: s, label: ACTION_LABELS[s] || statusLabel(s), style: ACTION_STYLES[s] || '' })),
    unreadIds,
    link,
    fullLink,
    mailto,
    totals,
    otherOrders,
  });
});

router.post('/:id/status', loadOrder, (req, res) => {
  const order = req.order;
  const to = String(req.body.to || '');
  const message = String(req.body.message || '').trim();
  const author = req.user.display_name || req.user.username;

  if (to === 'rejected' && !message) {
    req.flash('error', 'Bitte eine Begründung für die Ablehnung angeben.');
    return backToOrder(res, order.id);
  }
  if (to === 'question' && !message) {
    req.flash('error', 'Bitte die Rückfrage an den Besteller eingeben.');
    return backToOrder(res, order.id);
  }
  try {
    changeStatus(order.id, to, { userId: req.user.id, rejectReason: to === 'rejected' ? message : null, note: to === 'question' ? 'Rückfrage gestellt' : null });
  } catch (err) {
    req.flash('error', err.userMessage || err.message);
    return backToOrder(res, order.id);
  }
  if (message) {
    addMessage(order.id, 'shop', to === 'rejected' ? `Ihre Bestellung wurde abgelehnt. Begründung: ${message}` : message, author);
  }
  req.flash('success', `Status geändert: ${statusLabel(to)}.${message ? ' Nachricht an den Besteller gespeichert.' : ''}`);
  backToOrder(res, order.id);
});

router.post('/:id/message', loadOrder, (req, res) => {
  const order = req.order;
  const body = String(req.body.body || '').trim();
  if (!body) {
    req.flash('error', 'Bitte eine Nachricht eingeben.');
    return backToOrder(res, order.id);
  }
  addMessage(order.id, 'shop', body, req.user.display_name || req.user.username);
  if (req.body.set_question && order.status !== 'question') {
    try {
      changeStatus(order.id, 'question', { userId: req.user.id, note: 'Rückfrage gestellt' });
      req.flash('success', 'Nachricht gespeichert, Status auf "Rückfrage" gesetzt.');
    } catch (err) {
      req.flash('success', 'Nachricht gespeichert.');
      req.flash('error', err.userMessage || err.message);
    }
  } else {
    req.flash('success', 'Nachricht gespeichert. Der Besteller sieht sie über seinen Bestell-Link.');
  }
  backToOrder(res, order.id);
});

router.post('/:id/note', loadOrder, (req, res) => {
  const note = String(req.body.internal_note || '').trim().slice(0, 5000);
  run("UPDATE orders SET internal_note = ?, updated_at = datetime('now') WHERE id = ?", note || null, req.order.id);
  req.flash('success', 'Interne Notiz gespeichert.');
  backToOrder(res, req.order.id);
});

// ---------------------------------------------------------------------------
// Bestell- / Abholschein
// ---------------------------------------------------------------------------
router.get('/:id/print', loadOrder, (req, res) => {
  const order = req.order;
  const totals = order.items.reduce((s, i) => ({ qty: s.qty + i.quantity, member: s.member + i.line_member_cents, club: s.club + i.line_club_cents }), { qty: 0, member: 0, club: 0 });
  res.render('admin/orders/print', { title: `Bestellschein ${order.order_number}`, order, totals, printedAt: date(new Date()) });
});

module.exports = router;
