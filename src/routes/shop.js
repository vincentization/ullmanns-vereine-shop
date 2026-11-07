'use strict';
// Kunden-Shopfront: Übersicht aller Vereinsshops, je Verein Kollektion, Artikel, Warenkorb, Kasse,
// Bestellstatus mit Rückfragen sowie Inhaltsseiten.
//
// Ein Vereinsshop ist erreichbar unter /<slug>/... oder – falls clubs.domain gesetzt ist – direkt unter der
// eigenen Domain. In allen Templates wird deshalb `base` ('' bzw. '/<slug>') für Links verwendet.
const crypto = require('node:crypto');
const express = require('express');
const { get, all, run } = require('../db');
const { hydrateProduct, listClubProducts, minArticlePrice, computeUnit, validateLine, summarizeCart, FUNDING_MODES } = require('../lib/pricing');
const { createOrder, addMessage, getOrderFull } = require('../lib/orders');
const { contrastText, money } = require('../lib/format');

const router = express.Router();
const clubRouter = express.Router();

const RESERVED = new Set(['admin', 'static', 'uploads', 'img', 'favicon.ico', 'robots.txt']);

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Liefert Seiten für Navigation/Footer: Vereinsseiten überschreiben globale Seiten mit gleichem Slug. */
function pagesFor(clubId, flag) {
  const rows = all(
    `SELECT id, club_id, slug, title, sort_order FROM pages
     WHERE is_published = 1 AND ${flag} = 1 AND (club_id = ? OR club_id IS NULL)
     ORDER BY sort_order, title`,
    clubId,
  );
  const bySlug = new Map();
  for (const p of rows) {
    const existing = bySlug.get(p.slug);
    if (!existing || (existing.club_id == null && p.club_id != null)) bySlug.set(p.slug, p);
  }
  return [...bySlug.values()].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'de'));
}

function findPage(clubId, slug) {
  return (
    get('SELECT * FROM pages WHERE club_id = ? AND slug = ? AND is_published = 1', clubId, slug) ||
    get('SELECT * FROM pages WHERE club_id IS NULL AND slug = ? AND is_published = 1', slug)
  );
}

/** Vereinsanteil für einen Artikelpreis */
function clubShare(product, articleCents) {
  if (product.funding_mode === 'subsidy') return Math.min(Number(product.subsidy_cents) || 0, articleCents);
  if (product.funding_mode === 'club_article') return articleCents;
  return 0;
}

/** Text für das Finanzierungs-Badge oder null */
function fundingBadge(product) {
  if (product.funding_mode === 'subsidy' && product.subsidy_cents > 0) return `Verein gibt ${money(product.subsidy_cents).replace(',00', '')} dazu`;
  if (product.funding_mode === 'club_article') return 'Artikel zahlt der Verein';
  return null;
}

/** Daten für Produktkarten */
function cardData(product) {
  const variants = product.variants || [];
  const prices = new Set(
    variants.length
      ? variants.map((v) => (v.price_cents != null && v.price_cents !== '' ? Number(v.price_cents) : Number(product.price_cents)))
      : [Number(product.price_cents)],
  );
  const hasRange = prices.size > 1;
  const minPrice = prices.size ? Math.min(...prices) : minArticlePrice(product);
  return {
    product,
    minPrice,
    memberFrom: minPrice - clubShare(product, minPrice),
    hasRange,
    badge: fundingBadge(product),
  };
}

function getCart(req) {
  req.session.carts = req.session.carts || {};
  const cart = req.session.carts[req.club.id] || [];
  return cart;
}
function saveCart(req, cart) {
  req.session.carts = req.session.carts || {};
  req.session.carts[req.club.id] = cart;
}

/** Normalisiert die Druck-Eingaben aus dem Formular auf die definierten Optionen. */
function pickPrints(product, input) {
  const prints = {};
  for (const opt of product.print_options || []) {
    const v = input && typeof input[opt.key] === 'string' ? input[opt.key].trim() : '';
    if (v) prints[opt.key] = v;
  }
  return prints;
}

function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** JSON sicher in <script type="application/json"> einbetten */
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/** Setzt alle Template-Variablen für einen Vereinsshop. */
function setupClub(req, res, club, base) {
  req.club = club;
  req.base = base;
  const cart = (req.session.carts && req.session.carts[club.id]) || [];
  const primary = club.color_primary || '#1d3c9c';
  const accent = club.color_accent || primary;
  res.locals.club = club;
  res.locals.base = base;
  res.locals.homeUrl = base || '/';
  res.locals.isPreview = !club.is_active;
  res.locals.cartCount = cart.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  res.locals.navPages = pagesFor(club.id, 'show_in_nav');
  res.locals.footerPages = pagesFor(club.id, 'show_in_footer');
  res.locals.clubStyle = [
    `--club-primary:${primary}`,
    `--club-secondary:${club.color_secondary || '#ffffff'}`,
    `--club-accent:${accent}`,
    `--club-on-primary:${contrastText(primary)}`,
    `--club-on-accent:${contrastText(accent)}`,
  ].join(';');
  res.locals.myOrdersCount = ((req.session.myOrders || []).filter((o) => o.clubId === club.id)).length;
}

function canSee(req, club) {
  return club && (club.is_active || (req.session && req.session.userId));
}

// ---------------------------------------------------------------------------
// Vereinsauflösung
// ---------------------------------------------------------------------------

// Eigene Domain: Host == clubs.domain -> Shop dieses Vereins direkt unter "/"
router.use((req, res, next) => {
  const host = String(req.hostname || '').toLowerCase();
  if (!host) return next();
  const club = get('SELECT * FROM clubs WHERE lower(domain) = ?', host);
  if (!club || !canSee(req, club)) return next();
  setupClub(req, res, club, '');
  return clubRouter(req, res, next);
});

// Übersicht aller Vereinsshops
router.get('/', (req, res) => {
  const clubs = all('SELECT * FROM clubs WHERE is_active = 1 ORDER BY name').map((c) => ({
    ...c,
    productCount: get('SELECT COUNT(*) AS n FROM products WHERE club_id = ? AND is_active = 1', c.id).n,
    onPrimary: contrastText(c.color_primary),
  }));
  res.render('shop/landing', { title: 'Vereinsshops', clubs, footerPages: globalFooterPages() });
});

function globalFooterPages() {
  return all('SELECT slug, title FROM pages WHERE club_id IS NULL AND is_published = 1 AND show_in_footer = 1 ORDER BY sort_order, title');
}

// Globale Seiten (z.B. Impressum, Datenschutz) auch ohne Vereinsbezug
router.get('/seite/:pageSlug', (req, res, next) => {
  const page = get('SELECT * FROM pages WHERE club_id IS NULL AND slug = ? AND is_published = 1', String(req.params.pageSlug || ''));
  if (!page) return next();
  res.render('shop/global-page', { title: page.title, page, footerPages: globalFooterPages() });
});

// /<slug>/...
router.use('/:slug', (req, res, next) => {
  const slug = String(req.params.slug || '').toLowerCase();
  if (RESERVED.has(slug)) return next();
  const club = get('SELECT * FROM clubs WHERE slug = ?', slug);
  if (!canSee(req, club)) return next();
  setupClub(req, res, club, `/${club.slug}`);
  return clubRouter(req, res, next);
});

// ---------------------------------------------------------------------------
// Vereinsshop-Routen (relativ zu base)
// ---------------------------------------------------------------------------

const SORTS = {
  empfohlen: { label: 'Empfohlen' },
  'preis-auf': { label: 'Preis aufsteigend' },
  'preis-ab': { label: 'Preis absteigend' },
  name: { label: 'Name A–Z' },
};

clubRouter.get('/', (req, res) => {
  const all_ = listClubProducts(req.club.id);
  const categories = [...new Set(all_.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const category = str(req.query.kategorie, 80);
  const q = str(req.query.q, 80);
  const sort = SORTS[req.query.sort] ? req.query.sort : 'empfohlen';

  let products = all_;
  if (category) products = products.filter((p) => p.category === category);
  if (q) {
    const needle = q.toLowerCase();
    products = products.filter((p) => [p.name, p.brand, p.sku, p.category, p.description].some((f) => f && String(f).toLowerCase().includes(needle)));
  }
  let cards = products.map(cardData);
  if (sort === 'empfohlen') {
    cards.sort((a, b) => (b.product.is_featured - a.product.is_featured) || (a.product.sort_order - b.product.sort_order));
  } else if (sort === 'preis-auf') {
    cards.sort((a, b) => a.memberFrom - b.memberFrom || a.product.name.localeCompare(b.product.name, 'de'));
  } else if (sort === 'preis-ab') {
    cards.sort((a, b) => b.memberFrom - a.memberFrom || a.product.name.localeCompare(b.product.name, 'de'));
  } else if (sort === 'name') {
    cards.sort((a, b) => a.product.name.localeCompare(b.product.name, 'de'));
  }

  res.render('shop/home', {
    title: 'Online bestellen',
    cards,
    categories,
    category,
    q,
    sort,
    sorts: SORTS,
    totalCount: all_.length,
    clubFunded: all_.some((p) => p.funding_mode !== 'member'),
  });
});

function loadProduct(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  const product = hydrateProduct(get('SELECT * FROM products WHERE id = ? AND club_id = ?', id, req.club.id));
  if (!product || !product.is_active) return null;
  return product;
}

function renderProduct(req, res, product, { error = null, values = null, status = 200 } = {}) {
  const preColor = str(req.query.farbe, 80);
  const v = values || {
    variant: product.variants[0] ? product.variants[0].name : '',
    color: (product.colors.find((c) => c.name === preColor) || product.colors[0] || {}).name || '',
    size: product.sizes.length === 1 ? product.sizes[0] : '',
    quantity: 1,
    prints: {},
  };
  const selectedColor = product.colors.find((c) => c.name === v.color) || product.colors[0] || null;
  const unit = computeUnit(product, v);
  const related = listClubProducts(req.club.id)
    .filter((p) => p.id !== product.id && p.category && p.category === product.category)
    .slice(0, 4)
    .map(cardData);
  res.status(status).render('shop/product', {
    title: product.name,
    product,
    values: v,
    selectedColor,
    unit,
    error,
    badge: fundingBadge(product),
    fundingModes: FUNDING_MODES,
    related,
    productJson: jsonForScript({
      id: product.id,
      illustration: product.illustration,
      image_path: product.image_path,
      price_cents: product.price_cents,
      variants: product.variants,
      colors: product.colors,
      print_options: product.print_options,
      funding_mode: product.funding_mode,
      subsidy_cents: product.subsidy_cents,
    }),
  });
}

clubRouter.get('/artikel/:id', (req, res, next) => {
  const product = loadProduct(req);
  if (!product) return next();
  renderProduct(req, res, product);
});

// In den Warenkorb
clubRouter.post('/warenkorb/add', (req, res, next) => {
  const id = Number(req.body.productId);
  const product = hydrateProduct(get('SELECT * FROM products WHERE id = ? AND club_id = ?', id, req.club.id));
  if (!product) return next();
  const line = {
    id: crypto.randomBytes(6).toString('hex'),
    productId: product.id,
    variant: str(req.body.variant, 80) || null,
    color: str(req.body.color, 80) || null,
    size: str(req.body.size, 40) || null,
    quantity: parseInt(req.body.quantity, 10),
    prints: pickPrints(product, req.body.prints),
  };
  // Rohe Druckeingaben (auch zu lange) für die Validierung prüfen
  const rawPrints = {};
  for (const opt of product.print_options) {
    const v = req.body.prints && typeof req.body.prints[opt.key] === 'string' ? req.body.prints[opt.key].trim() : '';
    if (v) rawPrints[opt.key] = v;
  }
  const error = validateLine(product, { ...line, prints: rawPrints });
  if (error) {
    return renderProduct(req, res, product, { error, values: { ...line, prints: rawPrints, quantity: req.body.quantity }, status: 422 });
  }
  const cart = getCart(req);
  // Gleiche Konfiguration -> Menge erhöhen
  const key = (l) => JSON.stringify([l.productId, l.variant, l.color, l.size, l.prints]);
  const existing = cart.find((l) => key(l) === key(line));
  if (existing) existing.quantity = Math.min(99, Number(existing.quantity) + line.quantity);
  else cart.push(line);
  saveCart(req, cart);
  req.flash('success', `„${product.name}“ wurde in den Warenkorb gelegt.`);
  req.session.lastAdded = { clubId: req.club.id, productId: product.id };
  res.redirect(`${req.base}/artikel/${product.id}?hinzugefuegt=1`);
});

clubRouter.post('/warenkorb/update', (req, res) => {
  const cart = getCart(req);
  const line = cart.find((l) => l.id === req.body.lineId);
  const qty = parseInt(req.body.quantity, 10);
  if (line) {
    if (Number.isInteger(qty) && qty <= 0) cart.splice(cart.indexOf(line), 1);
    else if (Number.isInteger(qty)) line.quantity = Math.min(99, qty);
    saveCart(req, cart);
  }
  res.redirect(`${req.base}/warenkorb`);
});

clubRouter.post('/warenkorb/remove', (req, res) => {
  const cart = getCart(req).filter((l) => l.id !== req.body.lineId);
  saveCart(req, cart);
  req.flash('info', 'Der Artikel wurde aus dem Warenkorb entfernt.');
  res.redirect(`${req.base}/warenkorb`);
});

clubRouter.get('/warenkorb', (req, res) => {
  const summary = summarizeCart(req.club.id, getCart(req));
  res.render('shop/cart', { title: 'Warenkorb', summary });
});

// Kasse
const EMPTY_CUSTOMER = { first_name: '', last_name: '', email: '', phone: '', member_number: '', team: '', customer_note: '' };

clubRouter.get('/kasse', (req, res) => {
  const summary = summarizeCart(req.club.id, getCart(req));
  if (!summary.lines.length || summary.hasErrors) return res.redirect(`${req.base}/warenkorb`);
  const remembered = req.session.customer || {};
  res.render('shop/checkout', { title: 'Kasse', summary, values: { ...EMPTY_CUSTOMER, ...remembered, customer_note: '' }, errors: {}, privacy: false, formError: null });
});

clubRouter.post('/kasse', (req, res) => {
  const cart = getCart(req);
  const summary = summarizeCart(req.club.id, cart);
  if (!summary.lines.length) return res.redirect(`${req.base}/warenkorb`);

  // Honeypot: echte Besucher sehen dieses Feld nicht
  if (str(req.body.website)) return res.redirect(`${req.base}/warenkorb`);

  const values = {
    first_name: str(req.body.first_name, 80),
    last_name: str(req.body.last_name, 80),
    email: str(req.body.email, 160),
    phone: str(req.body.phone, 40),
    member_number: str(req.body.member_number, 40),
    team: str(req.body.team, 80),
    customer_note: str(req.body.customer_note, 2000),
  };
  const privacy = req.body.privacy === '1';
  const errors = {};
  if (!values.first_name) errors.first_name = 'Bitte gib deinen Vornamen an.';
  if (!values.last_name) errors.last_name = 'Bitte gib deinen Nachnamen an.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'Bitte gib eine gültige E-Mail-Adresse an.';
  if (values.phone && !/^[0-9+()\/\s.-]{5,}$/.test(values.phone)) errors.phone = 'Bitte gib eine gültige Telefonnummer an.';
  if (req.club.require_member_number && !values.member_number) errors.member_number = 'Bitte gib deine Mitgliedsnummer an.';
  if (!privacy) errors.privacy = 'Bitte bestätige die Datenschutzerklärung.';

  const rerender = (formError) => res.status(422).render('shop/checkout', { title: 'Kasse', summary, values, errors, privacy, formError });
  if (summary.hasErrors) return res.redirect(`${req.base}/warenkorb`);
  if (Object.keys(errors).length) return rerender('Bitte prüfe die markierten Felder.');

  let order;
  try {
    order = createOrder(req.club, cart, values);
  } catch (err) {
    if (err.userMessage) return rerender(err.userMessage);
    throw err;
  }
  saveCart(req, []);
  req.session.customer = { first_name: values.first_name, last_name: values.last_name, email: values.email, phone: values.phone, member_number: values.member_number, team: values.team };
  req.session.myOrders = req.session.myOrders || [];
  req.session.myOrders.unshift({ clubId: req.club.id, number: order.order_number, token: order.access_token });
  req.session.myOrders = req.session.myOrders.slice(0, 50);
  res.redirect(`${req.base}/bestellung/${encodeURIComponent(order.order_number)}?t=${encodeURIComponent(order.access_token)}&neu=1`);
});

// Bestellstatus
function loadOrder(req, token) {
  const row = get('SELECT id, access_token FROM orders WHERE order_number = ? AND club_id = ?', String(req.params.nr || ''), req.club.id);
  if (!row || !safeEqual(row.access_token, token)) return null;
  return getOrderFull(row.id);
}

const STEPS = [
  { key: 'new', label: 'Eingegangen' },
  { key: 'accepted', label: 'Angenommen' },
  { key: 'in_production', label: 'Druck / Beflockung' },
  { key: 'ready', label: 'Abholbereit' },
  { key: 'completed', label: 'Abgeholt' },
];

clubRouter.get('/bestellung/:nr', (req, res, next) => {
  const order = loadOrder(req, req.query.t);
  if (!order) return next();
  run("UPDATE order_messages SET read_by_customer = 1 WHERE order_id = ? AND sender = 'shop' AND read_by_customer = 0", order.id);
  const stepStatus = order.status === 'question' ? 'new' : order.status;
  const currentStep = STEPS.findIndex((s) => s.key === stepStatus);
  const statusUrl = `${req.base}/bestellung/${encodeURIComponent(order.order_number)}?t=${encodeURIComponent(order.access_token)}`;
  res.render('shop/order', {
    title: `Bestellung ${order.order_number}`,
    order,
    steps: STEPS,
    currentStep,
    isNew: req.query.neu === '1',
    statusUrl,
    token: order.access_token,
    messageError: null,
    messageValue: '',
  });
});

clubRouter.post('/bestellung/:nr/nachricht', (req, res, next) => {
  const order = loadOrder(req, req.body.t);
  if (!order) return next();
  const body = str(req.body.body, 5000);
  const statusUrl = `${req.base}/bestellung/${encodeURIComponent(order.order_number)}?t=${encodeURIComponent(order.access_token)}`;
  if (!body) {
    req.flash('error', 'Bitte gib eine Nachricht ein.');
    return res.redirect(`${statusUrl}#nachrichten`);
  }
  addMessage(order.id, 'customer', body, `${order.first_name} ${order.last_name}`);
  req.flash('success', 'Deine Nachricht wurde an das Sporthaus gesendet.');
  res.redirect(`${statusUrl}#nachrichten`);
});

clubRouter.get('/meine-bestellungen', (req, res) => {
  const mine = (req.session.myOrders || []).filter((o) => o.clubId === req.club.id);
  const orders = mine
    .map((m) => {
      const o = get('SELECT id, order_number, access_token, status, created_at, member_total_cents, club_total_cents FROM orders WHERE order_number = ? AND club_id = ?', m.number, req.club.id);
      if (!o || !safeEqual(o.access_token, m.token)) return null;
      o.itemCount = get('SELECT COALESCE(SUM(quantity),0) AS n FROM order_items WHERE order_id = ?', o.id).n;
      o.unread = get("SELECT COUNT(*) AS n FROM order_messages WHERE order_id = ? AND sender = 'shop' AND read_by_customer = 0", o.id).n;
      o.url = `${req.base}/bestellung/${encodeURIComponent(o.order_number)}?t=${encodeURIComponent(o.access_token)}`;
      return o;
    })
    .filter(Boolean);
  res.render('shop/my-orders', { title: 'Meine Bestellungen', orders });
});

clubRouter.get('/seite/:pageSlug', (req, res, next) => {
  const page = findPage(req.club.id, String(req.params.pageSlug || ''));
  if (!page) return next();
  res.render('shop/page', { title: page.title, page });
});

module.exports = router;
