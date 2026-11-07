'use strict';
// Backend: Sortiment (Artikel je Verein) – Liste, Anlegen/Bearbeiten, Duplizieren, Kopieren, Sammelaktionen.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { get, all, run, tx, UPLOAD_DIR } = require('../../db');
const { FUNDING_MODES, hydrateProduct } = require('../../lib/pricing');
const { ILLUSTRATIONS } = require('../../lib/illustrations');
const { upload, uploadedUrl } = require('../../lib/upload');
const h = require('../../lib/format');

const router = express.Router();
// Express 5 setzt req.body nur bei vorhandenem Body
router.use((req, res, next) => { req.body = req.body || {}; next(); });

const SIZE_PRESETS = [
  { label: 'Erwachsene S–3XL', sizes: 'S, M, L, XL, XXL, 3XL' },
  { label: 'Damen XS–XL', sizes: 'XS, S, M, L, XL' },
  { label: 'Kinder 116–164', sizes: '116, 128, 140, 152, 164' },
  { label: 'Socken', sizes: '27-30, 31-34, 35-38, 39-42, 43-46, 47-50' },
  { label: 'Einheitsgröße', sizes: 'Einheitsgröße' },
];

/** Formular-Arrays normalisieren (qs/multer liefern je nach Index Array, Objekt oder dünnes Array). */
function toList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : typeof value === 'object' ? Object.values(value) : [value];
  return list.filter((x) => x != null);
}
const str = (v) => (v == null ? '' : String(v)).trim();
const checked = (v) => v === '1' || v === 'on' || v === 1 || v === true || (Array.isArray(v) && v.some(checked));

/**
 * Löscht eine hochgeladene Datei (nur aus data/uploads), sofern sie nirgends mehr verwendet wird
 * (kopierte Artikel teilen sich das Foto). Erst NACH dem DB-Update aufrufen.
 */
function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const used = get(
    'SELECT (SELECT COUNT(*) FROM products WHERE image_path = ?) + (SELECT COUNT(*) FROM clubs WHERE logo_path = ? OR hero_image_path = ?) AS n',
    url, url, url,
  ).n;
  if (used) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

/** DB-Zeile -> Formularwerte */
function productToForm(p) {
  const hp = hydrateProduct(p);
  return {
    id: hp.id,
    club_id: hp.club_id,
    brand: hp.brand || '',
    name: hp.name || '',
    sku: hp.sku || '',
    category: hp.category || '',
    description: hp.description || '',
    illustration: hp.illustration || 'tshirt',
    image_path: hp.image_path || null,
    uvp: h.moneyInput(hp.uvp_cents),
    price: h.moneyInput(hp.price_cents),
    funding_mode: hp.funding_mode || 'member',
    subsidy: h.moneyInput(hp.subsidy_cents || null),
    colors: hp.colors.map((c) => ({ name: c.name || '', hex: c.hex || '#1d3c9c', hex2: c.hex2 || '#ffffff' })),
    variants: hp.variants.map((v) => ({ name: v.name || '', price: v.price_cents == null || v.price_cents === '' ? '' : h.moneyInput(v.price_cents) })),
    sizes: hp.sizes.join(', '),
    print_options: hp.print_options.map((o) => ({
      label: o.label || '', key: o.key || '', max_length: o.max_length || '', price: h.moneyInput(o.price_cents || 0),
      placeholder: o.placeholder || '', required: Boolean(o.required),
    })),
    logo_print: hp.logo_print || '',
    is_active: Boolean(hp.is_active),
    is_featured: Boolean(hp.is_featured),
    sort_order: hp.sort_order || 0,
  };
}

function emptyForm(clubId) {
  return {
    id: null, club_id: clubId, brand: '', name: '', sku: '', category: '', description: '', illustration: 'tshirt', image_path: null,
    uvp: '', price: '', funding_mode: 'member', subsidy: '',
    colors: [], variants: [], sizes: '', print_options: [], logo_print: '',
    is_active: true, is_featured: false, sort_order: 0,
  };
}

/**
 * Formular -> { form (zum erneuten Anzeigen), row (für DB), errors {feld: text} }
 */
function parseProductForm(body) {
  const errors = {};
  const form = {
    brand: str(body.brand), name: str(body.name), sku: str(body.sku), category: str(body.category),
    description: str(body.description), illustration: str(body.illustration) || 'tshirt',
    uvp: str(body.uvp), price: str(body.price), funding_mode: str(body.funding_mode) || 'member', subsidy: str(body.subsidy),
    colors: toList(body.colors).map((c) => ({ name: str(c.name), hex: str(c.hex) || '#1d3c9c', hex2: str(c.hex2) || '#ffffff' })).filter((c) => c.name),
    variants: toList(body.variants).map((v) => ({ name: str(v.name), price: str(v.price) })).filter((v) => v.name),
    sizes: str(body.sizes),
    print_options: toList(body.print_options).map((o) => ({
      label: str(o.label), key: str(o.key), max_length: str(o.max_length), price: str(o.price),
      placeholder: str(o.placeholder), required: checked(o.required),
    })).filter((o) => o.label),
    logo_print: str(body.logo_print),
    is_active: checked(body.is_active),
    is_featured: checked(body.is_featured),
    sort_order: str(body.sort_order),
  };

  if (!form.name) errors.name = 'Bitte einen Artikelnamen angeben.';
  if (!ILLUSTRATIONS.some((i) => i.key === form.illustration)) form.illustration = 'tshirt';

  const price = h.parseMoney(form.price);
  if (price == null) errors.price = 'Bitte den Vereinspreis angeben.';
  else if (Number.isNaN(price) || price < 0) errors.price = 'Ungültiger Preis (z.B. 17,97).';

  const uvp = h.parseMoney(form.uvp);
  if (Number.isNaN(uvp) || (uvp != null && uvp < 0)) errors.uvp = 'Ungültige UVP (z.B. 29,95).';

  if (!FUNDING_MODES[form.funding_mode]) form.funding_mode = 'member';
  let subsidy = 0;
  if (form.funding_mode === 'subsidy') {
    subsidy = h.parseMoney(form.subsidy);
    if (subsidy == null || Number.isNaN(subsidy) || subsidy <= 0) errors.subsidy = 'Bitte den Zuschuss des Vereins je Stück angeben.';
    else if (price != null && !Number.isNaN(price) && subsidy > price) errors.subsidy = 'Der Zuschuss ist höher als der Artikelpreis – dann besser "Verein zahlt Artikel" wählen.';
  }

  const colorNames = new Set();
  form.colors.forEach((c, i) => {
    if (!h.isHexColor(c.hex) || !h.isHexColor(c.hex2)) errors.colors = `Farbe ${i + 1}: ungültiger Farbwert (Format #rrggbb).`;
    if (colorNames.has(c.name.toLowerCase())) errors.colors = `Farbname "${c.name}" ist doppelt.`;
    colorNames.add(c.name.toLowerCase());
  });

  const variantNames = new Set();
  const variants = form.variants.map((v) => {
    const vp = h.parseMoney(v.price);
    if (Number.isNaN(vp) || (vp != null && vp < 0)) errors.variants = `Ausführung "${v.name}": ungültiger Preis.`;
    if (variantNames.has(v.name.toLowerCase())) errors.variants = `Ausführung "${v.name}" ist doppelt.`;
    variantNames.add(v.name.toLowerCase());
    return { name: v.name, price_cents: vp == null || Number.isNaN(vp) ? null : vp };
  });

  const sizes = [...new Set(form.sizes.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))];

  const usedKeys = new Set();
  const printOptions = form.print_options.map((o) => {
    let key = h.slugify(o.key || o.label).replace(/-/g, '_') || 'druck';
    while (usedKeys.has(key)) key += '_2';
    usedKeys.add(key);
    o.key = key;
    let maxLength = parseInt(o.max_length, 10);
    if (!Number.isInteger(maxLength) || maxLength < 1) maxLength = 20;
    maxLength = Math.min(maxLength, 40);
    o.max_length = String(maxLength);
    const p = h.parseMoney(o.price);
    if (Number.isNaN(p) || (p != null && p < 0)) errors.print_options = `Sonderdruck "${o.label}": ungültiger Preis.`;
    const out = { key, label: o.label, max_length: maxLength, price_cents: p == null || Number.isNaN(p) ? 0 : p };
    if (o.placeholder) out.placeholder = o.placeholder;
    if (o.required) out.required = true;
    return out;
  });

  let sortOrder = parseInt(form.sort_order, 10);
  if (!Number.isInteger(sortOrder)) sortOrder = 0;
  form.sort_order = sortOrder;

  const row = {
    sku: form.sku || null, brand: form.brand || null, name: form.name, description: form.description || null,
    category: form.category || null, illustration: form.illustration,
    uvp_cents: uvp == null || Number.isNaN(uvp) ? null : uvp, price_cents: price,
    sizes: JSON.stringify(sizes),
    colors: JSON.stringify(form.colors.map((c) => ({ name: c.name, hex: c.hex.toLowerCase(), hex2: c.hex2.toLowerCase() }))),
    variants: JSON.stringify(variants), print_options: JSON.stringify(printOptions),
    logo_print: form.logo_print || null, funding_mode: form.funding_mode, subsidy_cents: form.funding_mode === 'subsidy' ? subsidy : 0,
    is_active: form.is_active ? 1 : 0, is_featured: form.is_featured ? 1 : 0, sort_order: sortOrder,
  };
  return { form, row, errors };
}

const PRODUCT_COLUMNS = ['sku', 'brand', 'name', 'description', 'category', 'illustration', 'image_path', 'uvp_cents', 'price_cents', 'sizes', 'colors', 'variants', 'print_options', 'logo_print', 'funding_mode', 'subsidy_cents', 'is_active', 'is_featured', 'sort_order'];

/**
 * Kopiert einen Artikel in einen (anderen) Verein. Gibt die neue ID zurück.
 * opts: { nameSuffix, isActive (null = übernehmen) }
 */
function copyProduct(productId, targetClubId, { nameSuffix = '', isActive = null } = {}) {
  const cols = PRODUCT_COLUMNS.filter((c) => c !== 'name' && c !== 'is_active');
  const info = run(
    `INSERT INTO products (club_id, name, is_active, ${cols.join(', ')})
     SELECT ?, name || ?, ${isActive == null ? 'is_active' : Number(isActive)}, ${cols.join(', ')} FROM products WHERE id = ?`,
    targetClubId, nameSuffix, productId,
  );
  return Number(info.lastInsertRowid);
}

function loadClub(id) {
  return id ? get('SELECT * FROM clubs WHERE id = ?', id) : null;
}

function categoriesOf(clubId) {
  return all("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY (club_id = ?) DESC, category", clubId)
    .map((r) => r.category)
    .filter((c, i, arr) => arr.indexOf(c) === i);
}

function renderForm(res, { club, form, errors = {}, status = 200 }) {
  res.status(status).render('admin/products/form', {
    title: form.id ? `Artikel bearbeiten: ${form.name}` : 'Neuer Artikel',
    active: 'products',
    club,
    form,
    errors,
    categories: categoriesOf(club.id),
    illustrations: ILLUSTRATIONS,
    fundingModes: FUNDING_MODES,
    sizePresets: SIZE_PRESETS,
    otherClubs: all('SELECT id, name, short_name FROM clubs WHERE id <> ? ORDER BY name', club.id),
  });
}

// ---------- Liste ----------
router.get('/', (req, res) => {
  const clubs = res.locals.allClubs;
  if (!clubs.length) {
    req.flash('info', 'Lege zuerst einen Verein an – danach kannst du sein Sortiment pflegen.');
    return res.redirect('/admin/clubs/new');
  }
  const club = loadClub(req.query.club) || loadClub(clubs[0].id);
  if (!req.query.club) return res.redirect(`/admin/products?club=${club.id}`);

  const q = str(req.query.q);
  const cat = str(req.query.cat);
  const status = str(req.query.status); // '', 'active', 'inactive'
  const where = ['club_id = ?'];
  const params = [club.id];
  if (q) {
    where.push('(name LIKE ? OR brand LIKE ? OR sku LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) { where.push('category = ?'); params.push(cat); }
  if (status === 'active') where.push('is_active = 1');
  if (status === 'inactive') where.push('is_active = 0');
  const products = all(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY sort_order, category, name`, ...params).map(hydrateProduct);
  const counts = get('SELECT COUNT(*) AS total, SUM(is_active) AS active FROM products WHERE club_id = ?', club.id);
  const categories = all("SELECT DISTINCT category FROM products WHERE club_id = ? AND category IS NOT NULL AND category <> '' ORDER BY category", club.id).map((r) => r.category);

  res.render('admin/products/list', {
    title: `Sortiment: ${club.short_name || club.name}`,
    active: 'products',
    club,
    products,
    categories,
    counts: { total: counts.total || 0, active: counts.active || 0 },
    filters: { q, cat, status },
    fundingModes: FUNDING_MODES,
    otherClubs: clubs.filter((c) => c.id !== club.id),
  });
});

// ---------- Sammelaktionen ----------
router.post('/bulk', (req, res) => {
  const club = loadClub(req.body.club_id);
  if (!club) return res.redirect('/admin/products');
  const back = `/admin/products?club=${club.id}`;
  const ids = toList(req.body.ids).map(Number).filter(Number.isInteger);
  const action = req.body.sort_submit ? 'sort' : str(req.body.action);

  // Sortierung speichern braucht keine Auswahl
  if (action === 'sort') {
    const sort = req.body.sort && typeof req.body.sort === 'object' ? req.body.sort : {};
    tx(() => {
      for (const [id, value] of Object.entries(sort)) {
        const n = parseInt(value, 10);
        if (Number.isInteger(n)) run("UPDATE products SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND club_id = ?", n, Number(id), club.id);
      }
    });
    req.flash('success', 'Sortierung gespeichert.');
    return res.redirect(back);
  }

  if (!ids.length) {
    req.flash('error', 'Bitte zuerst Artikel auswählen.');
    return res.redirect(back);
  }
  const products = ids.map((id) => get('SELECT * FROM products WHERE id = ? AND club_id = ?', id, club.id)).filter(Boolean);

  if (action === 'activate' || action === 'deactivate') {
    const value = action === 'activate' ? 1 : 0;
    tx(() => products.forEach((p) => run("UPDATE products SET is_active = ?, updated_at = datetime('now') WHERE id = ?", value, p.id)));
    req.flash('success', `${products.length} Artikel ${value ? 'aktiviert' : 'deaktiviert'}.`);
  } else if (action === 'price_pct' || action === 'price_abs') {
    const raw = str(req.body.value);
    const pct = Number(raw.replace(',', '.'));
    const abs = h.parseMoney(raw);
    if (action === 'price_pct' ? !Number.isFinite(pct) || raw === '' : abs == null || Number.isNaN(abs)) {
      req.flash('error', 'Bitte einen gültigen Wert für die Preisanpassung angeben (z.B. 5 oder -2,50).');
      return res.redirect(back);
    }
    const adjust = (cents) => Math.max(0, action === 'price_pct' ? Math.round(cents * (1 + pct / 100)) : cents + abs);
    tx(() => products.forEach((p) => {
      const hp = hydrateProduct(p);
      const variants = hp.variants.map((v) => (v.price_cents == null || v.price_cents === '' ? v : { ...v, price_cents: adjust(Number(v.price_cents)) }));
      run("UPDATE products SET price_cents = ?, variants = ?, updated_at = datetime('now') WHERE id = ?", adjust(p.price_cents), JSON.stringify(variants), p.id);
    }));
    req.flash('success', `Preise von ${products.length} Artikel(n) angepasst (${action === 'price_pct' ? `${pct > 0 ? '+' : ''}${pct} %` : `${abs > 0 ? '+' : ''}${h.money(abs)}`}).`);
  } else if (action === 'copy') {
    const target = loadClub(req.body.target_club);
    if (!target || target.id === club.id) {
      req.flash('error', 'Bitte einen Ziel-Verein wählen.');
      return res.redirect(back);
    }
    tx(() => products.forEach((p) => copyProduct(p.id, target.id)));
    req.flash('success', `${products.length} Artikel nach "${target.name}" kopiert.`);
  } else if (action === 'delete') {
    tx(() => products.forEach((p) => run('DELETE FROM products WHERE id = ?', p.id)));
    products.forEach((p) => removeUpload(p.image_path));
    req.flash('success', `${products.length} Artikel gelöscht. Bestehende Bestellungen bleiben unverändert.`);
  } else {
    req.flash('error', 'Bitte eine Aktion wählen.');
  }
  res.redirect(back);
});

// ---------- Neu ----------
router.get('/new', (req, res) => {
  const club = loadClub(req.query.club);
  if (!club) return res.redirect('/admin/products');
  renderForm(res, { club, form: emptyForm(club.id) });
});

router.post('/new', upload.single('image'), (req, res) => {
  const club = loadClub(req.body.club_id || req.query.club);
  if (!club) return res.redirect('/admin/products');
  const { form, row, errors } = parseProductForm(req.body);
  form.club_id = club.id;
  form.id = null;
  if (Object.keys(errors).length) {
    if (req.file) removeUpload(uploadedUrl(req.file));
    return renderForm(res, { club, form, errors, status: 422 });
  }
  row.image_path = uploadedUrl(req.file);
  const cols = PRODUCT_COLUMNS;
  const info = run(
    `INSERT INTO products (club_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
    club.id, ...cols.map((c) => row[c] ?? null),
  );
  req.flash('success', `Artikel "${row.name}" angelegt.`);
  res.redirect(req.body.after === 'new' ? `/admin/products/new?club=${club.id}` : `/admin/products/${info.lastInsertRowid}/edit`);
});

// ---------- Bearbeiten ----------
function loadProduct(req, res, next) {
  const product = get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!product) return res.status(404).render('error', { title: 'Nicht gefunden', status: 404, message: 'Artikel nicht gefunden.' });
  req.product = product;
  req.club = loadClub(product.club_id);
  next();
}

router.get('/:id/edit', loadProduct, (req, res) => {
  renderForm(res, { club: req.club, form: productToForm(req.product) });
});

router.post('/:id/edit', upload.single('image'), loadProduct, (req, res) => {
  const { form, row, errors } = parseProductForm(req.body);
  form.id = req.product.id;
  form.club_id = req.club.id;
  form.image_path = req.product.image_path;
  if (Object.keys(errors).length) {
    if (req.file) removeUpload(uploadedUrl(req.file));
    return renderForm(res, { club: req.club, form, errors, status: 422 });
  }
  row.image_path = req.product.image_path;
  if (req.file) row.image_path = uploadedUrl(req.file);
  else if (checked(req.body.remove_image)) row.image_path = null;
  run(
    `UPDATE products SET ${PRODUCT_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    ...PRODUCT_COLUMNS.map((c) => row[c] ?? null), req.product.id,
  );
  if (row.image_path !== req.product.image_path) removeUpload(req.product.image_path);
  req.flash('success', `Artikel "${row.name}" gespeichert.`);
  res.redirect(req.body.after === 'list' ? `/admin/products?club=${req.club.id}` : `/admin/products/${req.product.id}/edit`);
});

router.post('/:id/toggle', loadProduct, (req, res) => {
  run("UPDATE products SET is_active = 1 - is_active, updated_at = datetime('now') WHERE id = ?", req.product.id);
  req.flash('success', `"${req.product.name}" ist jetzt ${req.product.is_active ? 'ausgeblendet' : 'im Shop sichtbar'}.`);
  res.redirect(`/admin/products?club=${req.club.id}`);
});

router.post('/:id/duplicate', loadProduct, (req, res) => {
  const newId = copyProduct(req.product.id, req.club.id, { nameSuffix: ' (Kopie)', isActive: 0 });
  req.flash('success', 'Artikel dupliziert. Die Kopie ist noch ausgeblendet – nach dem Anpassen aktivieren.');
  res.redirect(`/admin/products/${newId}/edit`);
});

router.post('/:id/copy', loadProduct, (req, res) => {
  const target = loadClub(req.body.target_club || req.query.to);
  if (!target) {
    req.flash('error', 'Bitte einen Ziel-Verein wählen.');
    return res.redirect(`/admin/products?club=${req.club.id}`);
  }
  const newId = copyProduct(req.product.id, target.id);
  req.flash('success', `"${req.product.name}" wurde nach "${target.name}" kopiert.`);
  res.redirect(req.body.redirect === 'target' ? `/admin/products/${newId}/edit` : `/admin/products?club=${req.club.id}`);
});

router.post('/:id/delete', loadProduct, (req, res) => {
  run('DELETE FROM products WHERE id = ?', req.product.id);
  removeUpload(req.product.image_path);
  req.flash('success', `Artikel "${req.product.name}" gelöscht. Bestehende Bestellungen bleiben unverändert.`);
  res.redirect(`/admin/products?club=${req.club.id}`);
});

module.exports = router;
module.exports.copyProduct = copyProduct;
module.exports.removeUpload = removeUpload;
