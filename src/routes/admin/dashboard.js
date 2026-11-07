'use strict';
// Backend-Übersicht (GET /admin)
const express = require('express');
const { get, all } = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartSql = monthStart.toISOString().slice(0, 19).replace('T', ' ');

  const month = get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(member_total_cents), 0) AS member, COALESCE(SUM(club_total_cents), 0) AS club,
            COALESCE(SUM(total_cents), 0) AS total
       FROM orders WHERE created_at >= ? AND status NOT IN ('rejected', 'cancelled')`,
    monthStartSql,
  );

  const clubs = all(
    `SELECT c.id, c.slug, c.name, c.short_name, c.color_primary, c.is_active,
            (SELECT COUNT(*) FROM products p WHERE p.club_id = c.id AND p.is_active = 1) AS active_products,
            (SELECT COUNT(*) FROM orders o WHERE o.club_id = c.id AND o.status IN ('new', 'question')) AS open_orders,
            (SELECT COUNT(*) FROM orders o WHERE o.club_id = c.id AND o.status IN ('accepted', 'in_production', 'ready')) AS running_orders,
            (SELECT COUNT(*) FROM orders o WHERE o.club_id = c.id AND o.created_at >= ? AND o.status NOT IN ('rejected', 'cancelled')) AS month_orders,
            (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.club_id = c.id AND o.created_at >= ? AND o.status NOT IN ('rejected', 'cancelled')) AS month_total
       FROM clubs c ORDER BY c.is_active DESC, c.name`,
    monthStartSql, monthStartSql,
  );

  const recentOrders = all(
    `SELECT o.*, c.name AS club_name, c.short_name AS club_short, c.color_primary,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count,
            (SELECT COUNT(*) FROM order_messages m WHERE m.order_id = o.id AND m.sender = 'customer' AND m.read_by_shop = 0) AS unread
       FROM orders o JOIN clubs c ON c.id = o.club_id
      ORDER BY o.created_at DESC, o.id DESC LIMIT 10`,
  );

  const recentMessages = all(
    `SELECT m.*, o.order_number, o.first_name, o.last_name, o.status, c.short_name AS club_short, c.name AS club_name, c.color_primary
       FROM order_messages m JOIN orders o ON o.id = m.order_id JOIN clubs c ON c.id = o.club_id
      WHERE m.sender = 'customer'
      ORDER BY m.read_by_shop ASC, m.created_at DESC, m.id DESC LIMIT 8`,
  );

  const readyCount = get("SELECT COUNT(*) AS n FROM orders WHERE status = 'ready'").n;
  const productionCount = get("SELECT COUNT(*) AS n FROM orders WHERE status IN ('accepted', 'in_production')").n;

  res.render('admin/dashboard', {
    title: 'Übersicht',
    active: 'dashboard',
    month,
    monthLabel: new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date()),
    clubs,
    recentOrders,
    recentMessages,
    readyCount,
    productionCount,
  });
});

module.exports = router;
