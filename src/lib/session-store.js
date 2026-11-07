'use strict';
// express-session Store auf Basis der SQLite-Tabelle "sessions" (überlebt Neustarts, kein Memory-Leak).
const session = require('express-session');
const { run, get } = require('../db');

class SqliteStore extends session.Store {
  constructor() {
    super();
    // Abgelaufene Sessions stündlich löschen
    this.timer = setInterval(() => run('DELETE FROM sessions WHERE expires < ?', Date.now()), 60 * 60 * 1000);
    this.timer.unref();
  }

  expiry(sess) {
    const maxAge = sess && sess.cookie && sess.cookie.maxAge;
    return Date.now() + (typeof maxAge === 'number' ? maxAge : 24 * 60 * 60 * 1000);
  }

  get(sid, cb) {
    try {
      const row = get('SELECT sess, expires FROM sessions WHERE sid = ?', sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      run(
        'INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires',
        sid, JSON.stringify(sess), this.expiry(sess),
      );
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      run('DELETE FROM sessions WHERE sid = ?', sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      run('UPDATE sessions SET expires = ? WHERE sid = ?', this.expiry(sess), sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }
}

module.exports = SqliteStore;
