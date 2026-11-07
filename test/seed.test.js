'use strict';
// Beispieldaten: legt alles in einem temporären Datenverzeichnis an und prüft die Inhalte.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vshop-seed-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, all } = require('../src/db');
const { seed } = require('../src/seed');
const { summarizeCart } = require('../src/lib/pricing');
const { ILLUSTRATIONS, renderIllustration } = require('../src/lib/illustrations');

const quiet = () => {};

test('Seed legt Vereine, 25 VfB-Artikel, Seiten, Benutzer und Bestellungen an', () => {
  const r = seed({ log: quiet });
  assert.equal(r.skipped, false);
  const vfb = get("SELECT * FROM clubs WHERE slug = 'vfb-hellerau'");
  assert.ok(vfb);
  assert.equal(get('SELECT COUNT(*) AS n FROM products WHERE club_id = ?', vfb.id).n, 25);
  assert.ok(get('SELECT COUNT(*) AS n FROM products WHERE club_id = ? AND is_active = 0', vfb.id).n >= 1);
  assert.ok(get("SELECT id FROM clubs WHERE slug = 'sg-musterdorf'"));
  assert.equal(get('SELECT COUNT(*) AS n FROM users').n, 2);
  assert.ok(get("SELECT id FROM pages WHERE club_id IS NULL AND slug = 'impressum'"));
  assert.ok(get("SELECT id FROM pages WHERE club_id IS NULL AND slug = 'datenschutz'"));
  assert.ok(get('SELECT COUNT(*) AS n FROM orders WHERE club_id = ?', vfb.id).n >= 10);
});

test('Alle Bestellstatus sind vertreten, inkl. ungelesener Kundenantwort', () => {
  const statuses = all('SELECT DISTINCT status FROM orders').map((r) => r.status);
  for (const s of ['new', 'question', 'accepted', 'in_production', 'ready', 'completed', 'rejected']) assert.ok(statuses.includes(s), s);
  assert.ok(get("SELECT COUNT(*) AS n FROM order_messages WHERE sender = 'customer' AND read_by_shop = 0").n >= 1);
  assert.ok(get("SELECT reject_reason FROM orders WHERE status = 'rejected'").reject_reason);
});

test('Alle JSON-Felder sind gültig, Illustrationen existieren, Finanzierungsmodelle gemischt', () => {
  const keys = ILLUSTRATIONS.map((i) => i.key);
  for (const p of all('SELECT * FROM products')) {
    for (const f of ['sizes', 'colors', 'variants', 'print_options']) assert.ok(Array.isArray(JSON.parse(p[f])), `${p.name}.${f}`);
    assert.ok(keys.includes(p.illustration), p.illustration);
    for (const c of JSON.parse(p.colors)) assert.match(c.hex, /^#[0-9a-f]{6}$/i);
  }
  const modes = all('SELECT DISTINCT funding_mode FROM products').map((r) => r.funding_mode).sort();
  assert.deepEqual(modes, ['club_article', 'member', 'subsidy']);
  for (const i of all('SELECT print_details FROM order_items')) assert.ok(Array.isArray(JSON.parse(i.print_details)));
});

test('Bestellsummen stimmen mit den Positionen überein', () => {
  for (const o of all('SELECT * FROM orders')) {
    const sums = get('SELECT SUM(line_member_cents) AS m, SUM(line_club_cents) AS c FROM order_items WHERE order_id = ?', o.id);
    assert.equal(o.member_total_cents, sums.m);
    assert.equal(o.club_total_cents, sums.c);
    assert.equal(o.total_cents, sums.m + sums.c);
  }
});

test('Zweiter Seed-Lauf ohne --reset ändert nichts, mit reset wird neu angelegt', () => {
  const before = get('SELECT COUNT(*) AS n FROM products').n;
  assert.equal(seed({ log: quiet }).skipped, true);
  assert.equal(get('SELECT COUNT(*) AS n FROM products').n, before);
  seed({ reset: true, log: quiet });
  assert.equal(get('SELECT COUNT(*) AS n FROM products').n, before);
  assert.equal(get('SELECT COUNT(*) AS n FROM users').n, 2);
});

test('Jeder Artikel lässt sich mit seinen eigenen Optionen in den Warenkorb legen', () => {
  for (const c of all('SELECT * FROM clubs')) {
    const products = all('SELECT * FROM products WHERE club_id = ? AND is_active = 1', c.id);
    const cart = products.map((p) => {
      const v = JSON.parse(p.variants), col = JSON.parse(p.colors), s = JSON.parse(p.sizes), po = JSON.parse(p.print_options);
      const prints = Object.fromEntries(po.map((o) => [o.key, 'AB'.slice(0, o.max_length)]));
      return { productId: p.id, variant: v[0] && v[0].name, color: col[0] && col[0].name, size: s[0], quantity: 1, prints };
    });
    const sum = summarizeCart(c.id, cart);
    assert.equal(sum.hasErrors, false, JSON.stringify(sum.lines.filter((l) => l.error).map((l) => [l.product && l.product.name, l.error])));
  }
});

test('Illustrationen rendern für alle Typen, unbekannter Typ liefert null', () => {
  for (const { key } of ILLUSTRATIONS) {
    const svg = renderIllustration(key, '#ffffff', '#1f4fbf');
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.doesNotMatch(svg, /fill="[^"]*" fill=/);
  }
  assert.equal(renderIllustration('gibtsnicht'), null);
  assert.match(renderIllustration('tshirt', 'kaputt', 'auch'), /#1d3c9c/);
});
