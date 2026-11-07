'use strict';
const { createApp } = require('./app');
const { get } = require('./db');

const port = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`Vereinsshop läuft auf http://localhost:${port}`);
  console.log(`Backend:            http://localhost:${port}/admin`);
  if (!get('SELECT id FROM users LIMIT 1')) {
    console.log('Hinweis: Noch kein Backend-Benutzer vorhanden. Mit "npm run seed" Beispieldaten und Benutzer anlegen.');
  }
});
