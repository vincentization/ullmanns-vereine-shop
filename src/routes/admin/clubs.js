'use strict';
// Backend: Vereine / Vereinsshops – Übersicht, neuen Shop anlegen, bearbeiten, löschen.
const express = require('express');
const { get, all, run, tx } = require('../../db');
const { upload, uploadedUrl } = require('../../lib/upload');
const { OPEN_STATUSES } = require('../../lib/format');
const h = require('../../lib/format');
const { copyProduct, removeUpload } = require('./products');

const router = express.Router();
// Express 5 setzt req.body nur bei vorhandenem Body
router.use((req, res, next) => { req.body = req.body || {}; next(); });

const RESERVED_SLUGS = ['admin', 'static', 'uploads', 'img', 'seite', 'api', 'favicon.ico', 'robots.txt', 'login', 'assets'];
const imageFields = upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'hero_image', maxCount: 1 }]);

const str = (v) => (v == null ? '' : String(Array.isArray(v) ? v[v.length - 1] : v)).trim();
const checked = (v) => v === '1' || v === 'on' || (Array.isArray(v) && v.includes('1'));

function fileUrl(req, field) {
  const f = req.files && req.files[field] && req.files[field][0];
  return f ? uploadedUrl(f) : null;
}
function discardUploads(req) {
  ['logo', 'hero_image'].forEach((f) => removeUpload(fileUrl(req, f)));
}

/** Präfix für Bestellnummern aus Kurzname/Name, z.B. "VsB Mellernau" -> "VSB" */
function derivePrefix(text) {
  const first = String(text || '').split(/\s+/)[0] || '';
  const p = first.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return p.length >= 2 ? p : 'VS';
}

// Vorlagen für "Standardseiten anlegen"
function defaultPages(club, settings) {
  return [
    {
      slug: 'abholung-und-bezahlung', title: 'Abholung & Bezahlung', show_in_nav: 1, show_in_footer: 1, sort_order: 10,
      content: `## So funktioniert die Bestellung

1. **Artikel auswählen** – Größe, Farbe und Ausführung wählen, auf Wunsch einen Namen oder eine Nummer zum Bedrucken eingeben.
2. **Verbindlich bestellen** – Du erhältst eine Bestellnummer und einen Link, unter dem du den Status jederzeit einsehen kannst.
3. **Prüfung durch das Sporthaus** – Wir prüfen deine Bestellung und melden uns bei Rückfragen.
4. **Bedrucken / Beflocken** – Die Artikel werden mit Vereinslogo und deinen Wunschtexten veredelt.
5. **Abholen & bezahlen** – Sobald deine Bestellung abholbereit ist, kannst du sie im Geschäft abholen.

## Bezahlung

Die Bezahlung erfolgt **bei Abholung im Geschäft** (bar oder mit Karte). Eine Vorkasse ist nicht nötig.
Anteile, die der ${club.name} übernimmt, werden direkt mit dem Verein abgerechnet.

## Abholung

${settings.store_name}
${settings.store_street}, ${settings.store_zip_city}

**Öffnungszeiten:**
${String(settings.store_opening_hours || '').split('\n').join('  \n')}

## Lieferzeit

Da jedes Teil individuell bedruckt wird, beträgt die Lieferzeit in der Regel **3–4 Wochen**.
Individuell bedruckte Artikel sind vom Umtausch ausgeschlossen.`,
    },
    {
      slug: 'groessentabelle', title: 'Größentabelle', show_in_nav: 1, show_in_footer: 0, sort_order: 20,
      content: `## Größentabelle Erwachsene (Oberteile)

| Größe | Brustumfang (cm) | Taillenumfang (cm) |
|---|---|---|
| S | 88–94 | 76–82 |
| M | 94–100 | 82–88 |
| L | 100–106 | 88–94 |
| XL | 106–112 | 94–100 |
| XXL | 112–118 | 100–106 |
| 3XL | 118–124 | 106–112 |

## Größentabelle Kinder

| Größe | Alter (ca.) | Körpergröße (cm) |
|---|---|---|
| 116 | 5–6 Jahre | 111–116 |
| 128 | 7–8 Jahre | 123–128 |
| 140 | 9–10 Jahre | 135–140 |
| 152 | 11–12 Jahre | 147–152 |
| 164 | 13–14 Jahre | 159–164 |

**Tipp:** Im Geschäft liegen Musterteile zur Anprobe bereit – komm gerne vorbei, bevor du bestellst.`,
    },
    {
      slug: 'faq', title: 'Häufige Fragen', show_in_nav: 1, show_in_footer: 1, sort_order: 30,
      content: `### Wer kann bestellen?
Die Angebote in diesem Shop gelten ausschließlich für Mitglieder des ${club.name}.

### Kann ich die Größe vorher anprobieren?
Ja, im ${settings.store_name} liegen Musterteile zur Anprobe bereit.

### Wie lange dauert es?
In der Regel 3–4 Wochen, da alle Artikel individuell bedruckt werden.

### Kann ich meine Bestellung ändern oder stornieren?
Solange deine Bestellung noch nicht in Druck gegeben wurde, ja. Schreibe uns einfach über deine Bestellstatus-Seite oder ruf uns an: ${settings.store_phone}.

### Kann ich bedruckte Artikel umtauschen?
Individuell bedruckte oder beflockte Artikel sind vom Umtausch ausgeschlossen.`,
    },
  ];
}

/** Formular -> { values, errors } (gemeinsam für Neu/Bearbeiten) */
function parseClubForm(body, { isNew, clubId = null }) {
  const values = {
    name: str(body.name), short_name: str(body.short_name), slug: str(body.slug).toLowerCase(),
    order_prefix: str(body.order_prefix).toUpperCase(), domain: str(body.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    color_primary: str(body.color_primary) || '#1d3c9c', color_secondary: str(body.color_secondary) || '#ffffff', color_accent: str(body.color_accent) || '#2e9e48',
    tagline: str(body.tagline), intro_text: str(body.intro_text), order_info: str(body.order_info),
    contact_name: str(body.contact_name), contact_email: str(body.contact_email), contact_phone: str(body.contact_phone),
    require_member_number: checked(body.require_member_number) ? 1 : 0,
    is_active: isNew ? 1 : (checked(body.is_active) ? 1 : 0),
  };
  const errors = {};
  if (!values.name) errors.name = 'Bitte den Vereinsnamen angeben.';
  if (!values.slug) values.slug = h.slugify(values.short_name || values.name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.slug)) errors.slug = 'Die Shop-Adresse darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.';
  else if (RESERVED_SLUGS.includes(values.slug)) errors.slug = `"${values.slug}" ist reserviert. Bitte eine andere Adresse wählen.`;
  else if (get('SELECT id FROM clubs WHERE slug = ? AND id IS NOT ?', values.slug, clubId)) errors.slug = 'Diese Shop-Adresse ist bereits vergeben.';
  if (!values.order_prefix) values.order_prefix = derivePrefix(values.short_name || values.name);
  if (!/^[A-Z0-9]{2,8}$/.test(values.order_prefix)) errors.order_prefix = 'Präfix: 2–8 Großbuchstaben/Ziffern, z.B. VSB.';
  else if (get('SELECT id FROM clubs WHERE order_prefix = ? AND id IS NOT ?', values.order_prefix, clubId)) errors.order_prefix = 'Dieses Präfix nutzt bereits ein anderer Verein.';
  for (const k of ['color_primary', 'color_secondary', 'color_accent']) {
    if (!h.isHexColor(values[k])) errors[k] = 'Ungültige Farbe (Format #rrggbb).';
    else values[k] = values[k].toLowerCase();
  }
  if (values.domain) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(values.domain)) errors.domain = 'Ungültige Domain, z.B. shop.mein-verein.de';
    else if (get('SELECT id FROM clubs WHERE domain = ? AND id IS NOT ?', values.domain, clubId)) errors.domain = 'Diese Domain ist bereits einem anderen Verein zugeordnet.';
  }
  if (values.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)) errors.contact_email = 'Ungültige E-Mail-Adresse.';
  return { values, errors };
}

function clubStats() {
  const stats = {};
  for (const r of all('SELECT club_id, COUNT(*) AS total, SUM(is_active) AS active FROM products GROUP BY club_id')) stats[r.club_id] = { products: r.total, activeProducts: r.active || 0 };
  const open = OPEN_STATUSES.map(() => '?').join(',');
  for (const r of all(`SELECT club_id, COUNT(*) AS n, SUM(status IN (${open})) AS open FROM orders GROUP BY club_id`, ...OPEN_STATUSES)) {
    stats[r.club_id] = { ...(stats[r.club_id] || {}), orders: r.n, openOrders: r.open || 0 };
  }
  for (const r of all('SELECT club_id, COUNT(*) AS n FROM pages WHERE club_id IS NOT NULL GROUP BY club_id')) stats[r.club_id] = { ...(stats[r.club_id] || {}), pages: r.n };
  return stats;
}

// ---------- Übersicht ----------
router.get('/', (req, res) => {
  const clubs = all('SELECT * FROM clubs ORDER BY is_active DESC, name');
  res.render('admin/clubs/list', { title: 'Vereine & Shops', active: 'clubs', clubs, stats: clubStats() });
});

// ---------- Neu ----------
function renderNew(res, values, errors = {}, status = 200) {
  res.status(status).render('admin/clubs/form', {
    title: 'Neuen Vereinsshop anlegen', active: 'clubs', isNew: true, club: values, errors,
    copyFromOptions: all('SELECT c.id, c.name, (SELECT COUNT(*) FROM products p WHERE p.club_id = c.id) AS n FROM clubs c ORDER BY c.name'),
  });
}

router.get('/new', (req, res) => {
  renderNew(res, {
    name: '', short_name: '', slug: '', order_prefix: '', tagline: '', color_primary: '#1d3c9c', color_secondary: '#ffffff', color_accent: '#2e9e48',
    copy_from: '', create_pages: true, logo_path: null, hero_image_path: null,
  });
});

router.post('/new', imageFields, (req, res) => {
  const { values, errors } = parseClubForm(req.body, { isNew: true });
  values.copy_from = str(req.body.copy_from);
  values.create_pages = checked(req.body.create_pages);
  const copyFrom = values.copy_from ? get('SELECT * FROM clubs WHERE id = ?', values.copy_from) : null;
  if (Object.keys(errors).length) {
    discardUploads(req);
    return renderNew(res, values, errors, 422);
  }
  const logo = fileUrl(req, 'logo');
  const hero = fileUrl(req, 'hero_image');
  const settings = res.locals.settings;

  const { clubId, copied } = tx(() => {
    const info = run(
      `INSERT INTO clubs (slug, name, short_name, order_prefix, color_primary, color_secondary, color_accent, logo_path, hero_image_path, tagline,
                          contact_name, contact_email, contact_phone, order_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values.slug, values.name, values.short_name || null, values.order_prefix, values.color_primary, values.color_secondary, values.color_accent,
      logo, hero, values.tagline || null,
      null, settings.store_email, settings.store_phone,
      'Die Bezahlung erfolgt bei Abholung im Geschäft. Du wirst informiert, sobald deine Bestellung abholbereit ist.',
    );
    const id = Number(info.lastInsertRowid);
    let n = 0;
    if (copyFrom) {
      for (const p of all('SELECT id FROM products WHERE club_id = ? ORDER BY sort_order, id', copyFrom.id)) {
        copyProduct(p.id, id);
        n++;
      }
    }
    if (values.create_pages) {
      const newClub = { ...values, id };
      for (const p of defaultPages(newClub, settings)) {
        run('INSERT INTO pages (club_id, slug, title, content, show_in_nav, show_in_footer, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          id, p.slug, p.title, p.content, p.show_in_nav, p.show_in_footer, p.sort_order);
      }
    }
    return { clubId: id, copied: n };
  });

  req.flash('success', `Vereinsshop "${values.name}" wurde angelegt${copied ? ` – ${copied} Artikel aus "${copyFrom.name}" übernommen` : ''}. Der Shop ist erreichbar unter /${values.slug}`);
  res.redirect(`/admin/clubs/${clubId}/edit?created=1`);
});

// ---------- Bearbeiten ----------
function loadClub(req, res, next) {
  const club = get('SELECT * FROM clubs WHERE id = ?', req.params.id);
  if (!club) return res.status(404).render('error', { title: 'Nicht gefunden', status: 404, message: 'Verein nicht gefunden.' });
  req.club = club;
  next();
}

function renderEdit(res, club, values, errors = {}, status = 200, extra = {}) {
  const stats = clubStats()[club.id] || {};
  res.status(status).render('admin/clubs/form', {
    title: `Verein bearbeiten: ${club.short_name || club.name}`, active: 'clubs', isNew: false,
    club: { ...club, ...values, id: club.id, logo_path: club.logo_path, hero_image_path: club.hero_image_path }, errors, stats, ...extra,
  });
}

router.get('/:id/edit', loadClub, (req, res) => {
  renderEdit(res, req.club, {}, {}, 200, { justCreated: req.query.created === '1' });
});

router.post('/:id/edit', imageFields, loadClub, (req, res) => {
  const { values, errors } = parseClubForm(req.body, { isNew: false, clubId: req.club.id });
  if (Object.keys(errors).length) {
    discardUploads(req);
    return renderEdit(res, req.club, values, errors, 422);
  }
  let logo = req.club.logo_path;
  let hero = req.club.hero_image_path;
  const newLogo = fileUrl(req, 'logo');
  const newHero = fileUrl(req, 'hero_image');
  if (newLogo) logo = newLogo; else if (checked(req.body.remove_logo)) logo = null;
  if (newHero) hero = newHero; else if (checked(req.body.remove_hero)) hero = null;

  run(
    `UPDATE clubs SET slug = ?, name = ?, short_name = ?, order_prefix = ?, domain = ?, color_primary = ?, color_secondary = ?, color_accent = ?,
       logo_path = ?, hero_image_path = ?, tagline = ?, intro_text = ?, order_info = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
       require_member_number = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    values.slug, values.name, values.short_name || null, values.order_prefix, values.domain || null, values.color_primary, values.color_secondary, values.color_accent,
    logo, hero, values.tagline || null, values.intro_text || null, values.order_info || null, values.contact_name || null, values.contact_email || null, values.contact_phone || null,
    values.require_member_number, values.is_active, req.club.id,
  );
  if (logo !== req.club.logo_path) removeUpload(req.club.logo_path);
  if (hero !== req.club.hero_image_path) removeUpload(req.club.hero_image_path);
  req.flash('success', 'Vereinsdaten gespeichert.');
  res.redirect(`/admin/clubs/${req.club.id}/edit`);
});

router.post('/:id/toggle', loadClub, (req, res) => {
  run("UPDATE clubs SET is_active = 1 - is_active, updated_at = datetime('now') WHERE id = ?", req.club.id);
  req.flash('success', `Shop "${req.club.name}" ist jetzt ${req.club.is_active ? 'deaktiviert (für Mitglieder nicht erreichbar)' : 'aktiv'}.`);
  res.redirect(req.body.back === 'edit' ? `/admin/clubs/${req.club.id}/edit` : '/admin/clubs');
});

router.post('/:id/delete', loadClub, (req, res) => {
  const orders = get('SELECT COUNT(*) AS n FROM orders WHERE club_id = ?', req.club.id).n;
  if (orders) {
    req.flash('error', `"${req.club.name}" hat ${orders} Bestellung(en) und kann nicht gelöscht werden. Deaktiviere den Shop stattdessen.`);
    return res.redirect(`/admin/clubs/${req.club.id}/edit`);
  }
  if (str(req.body.confirm_slug) !== req.club.slug) {
    req.flash('error', `Zum Löschen bitte die Shop-Adresse "${req.club.slug}" zur Bestätigung eingeben.`);
    return res.redirect(`/admin/clubs/${req.club.id}/edit#loeschen`);
  }
  const images = all('SELECT image_path FROM products WHERE club_id = ? AND image_path IS NOT NULL', req.club.id).map((r) => r.image_path);
  run('DELETE FROM clubs WHERE id = ?', req.club.id); // Artikel + Seiten werden per ON DELETE CASCADE entfernt
  [req.club.logo_path, req.club.hero_image_path, ...images].forEach(removeUpload);
  req.flash('success', `Verein "${req.club.name}" mit Sortiment und Seiten gelöscht.`);
  res.redirect('/admin/clubs');
});

module.exports = router;
