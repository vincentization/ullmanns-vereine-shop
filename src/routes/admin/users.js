'use strict';
// Backend: Benutzerverwaltung (Mitarbeiter des Sporthauses).
const express = require('express');
const { get, all, run } = require('../../db');
const { hashPassword, verifyPassword } = require('../../lib/auth');

const router = express.Router();
// Express 5 setzt req.body nur bei vorhandenem Body
router.use((req, res, next) => { req.body = req.body || {}; next(); });
const str = (v) => (v == null ? '' : String(v)).trim();
const MIN_PW = 8;

function render(res, { form = {}, errors = {}, status = 200 } = {}) {
  res.status(status).render('admin/users/list', {
    title: 'Benutzer', active: 'users',
    users: all('SELECT id, username, display_name, created_at, last_login_at FROM users ORDER BY username COLLATE NOCASE'),
    form, errors,
  });
}

router.get('/', (req, res) => render(res));

router.post('/', (req, res) => {
  const form = { username: str(req.body.username), display_name: str(req.body.display_name) };
  const password = String(req.body.password || '');
  const errors = {};
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(form.username)) errors.username = 'Benutzername: 3–40 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.';
  else if (get('SELECT id FROM users WHERE username = ?', form.username)) errors.username = 'Dieser Benutzername ist bereits vergeben.';
  if (password.length < MIN_PW) errors.password = `Das Passwort muss mindestens ${MIN_PW} Zeichen lang sein.`;
  if (password !== String(req.body.password_confirm || '')) errors.password_confirm = 'Die Passwörter stimmen nicht überein.';
  if (Object.keys(errors).length) return render(res, { form, errors, status: 422 });
  run('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)', form.username, hashPassword(password), form.display_name || null);
  req.flash('success', `Benutzer "${form.username}" angelegt.`);
  res.redirect('/admin/users');
});

router.post('/:id/update', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return res.redirect('/admin/users');
  const displayName = str(req.body.display_name);
  const password = String(req.body.password || '');
  if (password) {
    if (password.length < MIN_PW) {
      req.flash('error', `Das Passwort muss mindestens ${MIN_PW} Zeichen lang sein.`);
      return res.redirect('/admin/users');
    }
    if (password !== String(req.body.password_confirm || '')) {
      req.flash('error', 'Die Passwörter stimmen nicht überein.');
      return res.redirect('/admin/users');
    }
    // Eigenes Passwort nur mit aktuellem Passwort ändern
    if (user.id === req.user.id && !verifyPassword(req.body.current_password || '', user.password_hash)) {
      req.flash('error', 'Das aktuelle Passwort ist falsch.');
      return res.redirect('/admin/users');
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), user.id);
    // Andere Sitzungen dieses Benutzers beenden
    if (user.id !== req.user.id) run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", user.id);
  }
  run('UPDATE users SET display_name = ? WHERE id = ?', displayName || null, user.id);
  req.flash('success', password ? `Passwort für "${user.username}" geändert.` : `Benutzer "${user.username}" gespeichert.`);
  res.redirect('/admin/users');
});

router.post('/:id/delete', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return res.redirect('/admin/users');
  if (user.id === req.user.id) {
    req.flash('error', 'Du kannst dich nicht selbst löschen.');
    return res.redirect('/admin/users');
  }
  if (get('SELECT COUNT(*) AS n FROM users').n <= 1) {
    req.flash('error', 'Der letzte Benutzer kann nicht gelöscht werden.');
    return res.redirect('/admin/users');
  }
  run('DELETE FROM users WHERE id = ?', user.id);
  run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", user.id);
  req.flash('success', `Benutzer "${user.username}" gelöscht.`);
  res.redirect('/admin/users');
});

module.exports = router;
