'use strict';
// Backend: Inhaltsseiten je Verein und globale Seiten (club_id NULL, z.B. Impressum/Datenschutz).
const express = require('express');
const { get, all, run } = require('../../db');
const h = require('../../lib/format');

const router = express.Router();
// Express 5 setzt req.body nur bei vorhandenem Body
router.use((req, res, next) => { req.body = req.body || {}; next(); });
const str = (v) => (v == null ? '' : String(Array.isArray(v) ? v[v.length - 1] : v)).trim();
const checked = (v) => v === '1' || v === 'on' || (Array.isArray(v) && v.includes('1'));
const RESERVED = ['artikel', 'warenkorb', 'kasse', 'bestellung', 'seite'];

/** ?club=ID | global -> { scope: 'global' } oder { scope: 'club', club } */
function resolveScope(value, clubs) {
  if (value === 'global') return { scope: 'global', club: null };
  const club = value ? get('SELECT * FROM clubs WHERE id = ?', value) : null;
  if (club) return { scope: 'club', club };
  if (clubs.length) return { scope: 'club', club: get('SELECT * FROM clubs WHERE id = ?', clubs[0].id) };
  return { scope: 'global', club: null };
}
const scopeParam = (club) => (club ? String(club.id) : 'global');

/** Öffentliche URL einer Seite (globale Seiten werden im ersten aktiven Shop angezeigt) */
function pageUrl(page, club) {
  const c = club || get('SELECT slug FROM clubs WHERE is_active = 1 ORDER BY name LIMIT 1');
  return c ? `/${c.slug}/seite/${page.slug}` : null;
}

router.get('/', (req, res) => {
  const clubs = res.locals.allClubs;
  const { scope, club } = resolveScope(str(req.query.club), clubs);
  if (!req.query.club) return res.redirect(`/admin/pages?club=${scopeParam(club)}`);
  const pages = club
    ? all('SELECT * FROM pages WHERE club_id = ? ORDER BY sort_order, title', club.id)
    : all('SELECT * FROM pages WHERE club_id IS NULL ORDER BY sort_order, title');
  // Globale Seiten, die im Vereinsshop zusätzlich sichtbar sind (nicht überschrieben)
  const inherited = club
    ? all('SELECT * FROM pages WHERE club_id IS NULL AND is_published = 1 AND slug NOT IN (SELECT slug FROM pages WHERE club_id = ?) ORDER BY sort_order, title', club.id)
    : [];
  const counts = {};
  for (const r of all('SELECT IFNULL(club_id, 0) AS cid, COUNT(*) AS n FROM pages GROUP BY IFNULL(club_id, 0)')) counts[r.cid] = r.n;
  res.render('admin/pages/list', {
    title: 'Seiten', active: 'pages', scope, club, pages, inherited, counts,
    pageUrl: (p) => pageUrl(p, club),
  });
});

function emptyPage(club) {
  return { id: null, club_id: club ? club.id : null, slug: '', title: '', content: '', show_in_nav: 1, show_in_footer: 0, is_published: 1, sort_order: 0 };
}

function renderForm(res, { page, club, errors = {}, status = 200 }) {
  res.status(status).render('admin/pages/form', {
    title: page.id ? `Seite bearbeiten: ${page.title}` : 'Neue Seite',
    active: 'pages', page, club, errors, scopeParam: scopeParam(club),
    publicUrl: page.id ? pageUrl(page, club) : null,
    globalOverride: club && page.slug ? get('SELECT id, title FROM pages WHERE club_id IS NULL AND slug = ?', page.slug) : null,
  });
}

function parsePageForm(body, club, pageId) {
  const page = {
    title: str(body.title), slug: str(body.slug).toLowerCase(), content: String(body.content || ''),
    show_in_nav: checked(body.show_in_nav) ? 1 : 0, show_in_footer: checked(body.show_in_footer) ? 1 : 0,
    is_published: checked(body.is_published) ? 1 : 0, sort_order: parseInt(str(body.sort_order), 10) || 0,
  };
  const errors = {};
  if (!page.title) errors.title = 'Bitte einen Titel angeben.';
  if (!page.slug) page.slug = h.slugify(page.title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)) errors.slug = 'Nur Kleinbuchstaben, Ziffern und Bindestriche.';
  else if (RESERVED.includes(page.slug)) errors.slug = 'Diese Adresse ist reserviert.';
  else if (get('SELECT id FROM pages WHERE IFNULL(club_id, 0) = ? AND slug = ? AND id IS NOT ?', club ? club.id : 0, page.slug, pageId)) {
    errors.slug = 'Es gibt bereits eine Seite mit dieser Adresse.';
  }
  return { page, errors };
}

router.get('/new', (req, res) => {
  const { club } = resolveScope(str(req.query.club), res.locals.allClubs);
  renderForm(res, { page: emptyPage(club), club });
});

router.post('/new', (req, res) => {
  const { club } = resolveScope(str(req.body.club || req.query.club), res.locals.allClubs);
  const { page, errors } = parsePageForm(req.body, club, null);
  if (Object.keys(errors).length) return renderForm(res, { page: { ...emptyPage(club), ...page }, club, errors, status: 422 });
  const info = run(
    'INSERT INTO pages (club_id, slug, title, content, show_in_nav, show_in_footer, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    club ? club.id : null, page.slug, page.title, page.content, page.show_in_nav, page.show_in_footer, page.is_published, page.sort_order,
  );
  req.flash('success', `Seite "${page.title}" angelegt.`);
  res.redirect(`/admin/pages/${info.lastInsertRowid}/edit`);
});

function loadPage(req, res, next) {
  const page = get('SELECT * FROM pages WHERE id = ?', req.params.id);
  if (!page) return res.status(404).render('error', { title: 'Nicht gefunden', status: 404, message: 'Seite nicht gefunden.' });
  req.page = page;
  req.club = page.club_id ? get('SELECT * FROM clubs WHERE id = ?', page.club_id) : null;
  next();
}

router.get('/:id/edit', loadPage, (req, res) => renderForm(res, { page: req.page, club: req.club }));

router.post('/:id/edit', loadPage, (req, res) => {
  const { page, errors } = parsePageForm(req.body, req.club, req.page.id);
  if (Object.keys(errors).length) return renderForm(res, { page: { ...req.page, ...page }, club: req.club, errors, status: 422 });
  run(
    "UPDATE pages SET slug = ?, title = ?, content = ?, show_in_nav = ?, show_in_footer = ?, is_published = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?",
    page.slug, page.title, page.content, page.show_in_nav, page.show_in_footer, page.is_published, page.sort_order, req.page.id,
  );
  req.flash('success', `Seite "${page.title}" gespeichert.`);
  res.redirect(`/admin/pages/${req.page.id}/edit`);
});

router.post('/:id/delete', loadPage, (req, res) => {
  run('DELETE FROM pages WHERE id = ?', req.page.id);
  req.flash('success', `Seite "${req.page.title}" gelöscht.`);
  res.redirect(`/admin/pages?club=${scopeParam(req.club)}`);
});

// Markdown-Vorschau für den Editor
router.post('/preview', (req, res) => {
  res.json({ html: h.markdown(String(req.body.content || '')) });
});

module.exports = router;
