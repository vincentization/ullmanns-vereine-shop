'use strict';
// Bestell-Logik, gemeinsam genutzt von Shop (Anlegen, Kundenantworten) und Backend (Status, Rückfragen).
const { get, all, run, tx } = require('../db');
const { summarizeCart, parseJSON } = require('./pricing');
const { randomToken } = require('./auth');
const { ORDER_STATUSES } = require('./format');

/** Nächste Bestellnummer, z.B. VFB-2026-0007 (laufend je Verein und Jahr) */
function nextOrderNumber(club) {
  const year = new Date().getFullYear();
  const prefix = `${club.order_prefix}-${year}-`;
  const row = get("SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1", prefix + '%');
  const last = row ? parseInt(row.order_number.slice(prefix.length), 10) || 0 : 0;
  return prefix + String(last + 1).padStart(4, '0');
}

/**
 * Legt eine verbindliche Bestellung aus dem Warenkorb an.
 * @param club      clubs-Zeile
 * @param cart      Warenkorbzeilen aus der Session
 * @param customer  { first_name, last_name, email, phone, member_number, team, customer_note }
 * @returns die neue orders-Zeile
 * @throws Error mit .userMessage, wenn der Warenkorb ungültig ist
 */
function createOrder(club, cart, customer) {
  const summary = summarizeCart(club.id, cart);
  if (!summary.lines.length) throw Object.assign(new Error('empty cart'), { userMessage: 'Dein Warenkorb ist leer.' });
  if (summary.hasErrors) throw Object.assign(new Error('invalid cart'), { userMessage: 'Bitte prüfe die markierten Artikel im Warenkorb.' });

  return tx(() => {
    const orderNumber = nextOrderNumber(club);
    const token = randomToken();
    const info = run(
      `INSERT INTO orders (order_number, club_id, access_token, status, first_name, last_name, email, phone, member_number, team, customer_note,
                           member_total_cents, club_total_cents, total_cents)
       VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderNumber, club.id, token,
      customer.first_name, customer.last_name, customer.email, customer.phone || null, customer.member_number || null,
      customer.team || null, customer.customer_note || null,
      summary.memberTotal, summary.clubTotal, summary.total,
    );
    const orderId = Number(info.lastInsertRowid);
    for (const line of summary.lines) {
      const p = line.product;
      const u = line.unit;
      run(
        `INSERT INTO order_items (order_id, product_id, sku, brand, product_name, variant, color, size, quantity,
                                  unit_price_cents, print_details, print_price_cents, funding_mode, member_unit_cents, club_unit_cents,
                                  line_member_cents, line_club_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId, p.id, p.sku || null, p.brand || null, p.name, line.variant || null, line.color || null, line.size || null, Number(line.quantity),
        u.articleCents, JSON.stringify(u.printDetails), u.printCents, p.funding_mode, u.memberCents, u.clubCents,
        line.lineMemberCents, line.lineClubCents,
      );
    }
    run("INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, NULL, 'new', 'Bestellung über den Shop aufgegeben')", orderId);
    return get('SELECT * FROM orders WHERE id = ?', orderId);
  });
}

/**
 * Ändert den Status einer Bestellung und protokolliert ihn.
 * @param opts { userId, note, rejectReason, force }  force = Übergang auch außerhalb von ORDER_STATUSES[x].next erlauben
 */
function changeStatus(orderId, toStatus, { userId = null, note = null, rejectReason = null, force = false } = {}) {
  if (!ORDER_STATUSES[toStatus]) throw new Error(`Unbekannter Status: ${toStatus}`);
  const order = get('SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) throw new Error('Bestellung nicht gefunden');
  if (order.status === toStatus) return order;
  if (!force && !ORDER_STATUSES[order.status].next.includes(toStatus)) {
    throw Object.assign(new Error('transition not allowed'), { userMessage: `Statuswechsel von "${ORDER_STATUSES[order.status].label}" nach "${ORDER_STATUSES[toStatus].label}" ist nicht möglich.` });
  }
  return tx(() => {
    run(
      "UPDATE orders SET status = ?, reject_reason = COALESCE(?, reject_reason), status_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      toStatus, toStatus === 'rejected' ? rejectReason : null, orderId,
    );
    run('INSERT INTO order_events (order_id, from_status, to_status, user_id, note) VALUES (?, ?, ?, ?, ?)', orderId, order.status, toStatus, userId, note || rejectReason || null);
    return get('SELECT * FROM orders WHERE id = ?', orderId);
  });
}

/** Nachricht zur Bestellung hinzufügen. sender = 'shop' | 'customer' */
function addMessage(orderId, sender, body, author = null) {
  const text = String(body || '').trim();
  if (!text) return null;
  const info = run(
    'INSERT INTO order_messages (order_id, sender, author, body, read_by_shop, read_by_customer) VALUES (?, ?, ?, ?, ?, ?)',
    orderId, sender, author, text.slice(0, 5000), sender === 'shop' ? 1 : 0, sender === 'customer' ? 1 : 0,
  );
  run("UPDATE orders SET updated_at = datetime('now') WHERE id = ?", orderId);
  return Number(info.lastInsertRowid);
}

/** Bestellung mit Positionen, Nachrichten, Verlauf und Verein */
function getOrderFull(orderId) {
  const order = get('SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) return null;
  order.club = get('SELECT * FROM clubs WHERE id = ?', order.club_id);
  order.items = all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', orderId).map((i) => ({ ...i, print_details: parseJSON(i.print_details, []) }));
  order.messages = all('SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at, id', orderId);
  order.events = all(
    'SELECT e.*, u.display_name AS user_name FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = ? ORDER BY e.created_at, e.id',
    orderId,
  );
  return order;
}

/** Anzahl ungelesener Kundennachrichten (für Badges im Backend) */
function unreadCustomerMessages(orderId = null) {
  if (orderId) return get("SELECT COUNT(*) AS n FROM order_messages WHERE sender = 'customer' AND read_by_shop = 0 AND order_id = ?", orderId).n;
  return get("SELECT COUNT(*) AS n FROM order_messages WHERE sender = 'customer' AND read_by_shop = 0").n;
}

module.exports = { nextOrderNumber, createOrder, changeStatus, addMessage, getOrderFull, unreadCustomerMessages };
