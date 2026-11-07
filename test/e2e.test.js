'use strict';
// Kompletter Ablauf über HTTP: Mitglied bestellt im Shop, Sporthaus bearbeitet im Backend, Kunde antwortet.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vshop-e2e-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const { get } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');

/** Minimaler HTTP-Client mit Cookie-Jar */
function client(base) {
  let cookie = '';
  return async function request(method, url, form) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
}

test('Bestellung vom Shop bis zur Annahme im Backend', async (t) => {
  seed({ log: () => {} });
  const server = createApp().listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const shop = client(base);
  const admin = client(base);

  // Shopseiten
  assert.equal((await shop('GET', '/')).status, 200);
  const home = await shop('GET', '/vfb-hellerau');
  assert.equal(home.status, 200);
  assert.match(home.text, /VfB Hellerau/);
  assert.equal((await shop('GET', '/vfb-hellerau/seite/datenschutz')).status, 200);
  assert.equal((await shop('GET', '/gibt-es-nicht')).status, 404);

  // Trainingsjacke mit Ausführung, Farbe, Größe und Namensdruck in den Warenkorb
  const product = get("SELECT * FROM products WHERE sku = '1032320'");
  assert.ok(product, 'Trainingsjacke 1032320 fehlt im Seed');
  const p = { ...product, variants: JSON.parse(product.variants), colors: JSON.parse(product.colors), sizes: JSON.parse(product.sizes), print_options: JSON.parse(product.print_options) };
  assert.equal((await shop('GET', `/vfb-hellerau/artikel/${p.id}`)).status, 200);
  const line = { productId: p.id, quantity: '2' };
  if (p.variants.length) line.variant = p.variants[0].name;
  if (p.colors.length) line.color = p.colors[0].name;
  if (p.sizes.length) line.size = p.sizes[1] || p.sizes[0];
  for (const o of p.print_options) line[`prints[${o.key}]`] = o.key === 'number' ? '7' : 'TEST';
  const add = await shop('POST', '/vfb-hellerau/warenkorb/add', line);
  assert.equal(add.status, 302);
  const cart = await shop('GET', '/vfb-hellerau/warenkorb');
  assert.match(cart.text, new RegExp(p.name.slice(0, 15)));

  // Kasse: erst ohne Pflichtfelder (Fehler), dann vollständig
  const bad = await shop('POST', '/vfb-hellerau/kasse', { first_name: '' });
  assert.notEqual(bad.status, 302);
  const ordersBefore = get('SELECT COUNT(*) AS n FROM orders').n;
  const ok = await shop('POST', '/vfb-hellerau/kasse', {
    first_name: 'Erika', last_name: 'Testfrau', email: 'erika@example.org', phone: '0351 123', team: 'D-Jugend', privacy: '1',
  });
  assert.equal(ok.status, 302, ok.text.slice(0, 500));
  assert.equal(get('SELECT COUNT(*) AS n FROM orders').n, ordersBefore + 1);
  const order = get('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  assert.equal(order.status, 'new');
  assert.equal(order.last_name, 'Testfrau');
  assert.ok(order.total_cents > 0);

  // Statusseite: nur mit richtigem Token
  const statusUrl = `/vfb-hellerau/bestellung/${order.order_number}?t=${order.access_token}`;
  assert.equal((await shop('GET', statusUrl)).status, 200);
  assert.equal((await shop('GET', `/vfb-hellerau/bestellung/${order.order_number}?t=falsch`)).status, 404);

  // Backend: Schutz, Login, Bestellung sehen
  assert.equal((await admin('GET', '/admin/orders')).status, 302);
  assert.equal((await admin('POST', '/admin/login', { username: 'admin', password: 'falsch' })).status, 401);
  assert.equal((await admin('POST', '/admin/login', { username: 'admin', password: 'admin123' })).status, 302);
  for (const url of ['/admin', '/admin/orders', '/admin/clubs', `/admin/products?club=${p.club_id}`, `/admin/pages?club=${p.club_id}`, '/admin/pages?club=global', '/admin/users', '/admin/settings', `/admin/products/${p.id}/edit`, '/admin/clubs/new']) {
    assert.equal((await admin('GET', url)).status, 200, url);
  }
  const detail = await admin('GET', `/admin/orders/${order.id}`);
  assert.equal(detail.status, 200);
  assert.match(detail.text, /Testfrau/);
  assert.equal((await admin('GET', `/admin/orders/${order.id}/print`)).status, 200);
  const csv = await admin('GET', '/admin/orders/export.csv?status=all');
  assert.equal(csv.status, 200);
  assert.match(csv.text, new RegExp(order.order_number));

  // Rückfrage stellen -> Kunde antwortet -> annehmen
  await admin('POST', `/admin/orders/${order.id}/status`, { to: 'question', message: 'Welche Größe genau?' });
  assert.equal(get('SELECT status FROM orders WHERE id = ?', order.id).status, 'question');
  await shop('POST', `/vfb-hellerau/bestellung/${order.order_number}/nachricht`, { t: order.access_token, body: 'Größe M passt.' });
  assert.equal(get("SELECT COUNT(*) AS n FROM order_messages WHERE order_id = ? AND sender = 'customer'", order.id).n, 1);
  await admin('POST', `/admin/orders/${order.id}/status`, { to: 'accepted' });
  assert.equal(get('SELECT status FROM orders WHERE id = ?', order.id).status, 'accepted');
});
