'use strict';
// Preislogik: Finanzierungsmodelle, Ausführungspreise, Sonderdrucke, Validierung.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vshop-pricing-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeUnit, validateLine, articlePrice, minArticlePrice, hydrateProduct } = require('../src/lib/pricing');

const base = hydrateProduct({
  id: 1, club_id: 1, is_active: 1, name: 'Trikot', price_cents: 2499, subsidy_cents: 0, funding_mode: 'member',
  sizes: '["S","M","L"]',
  colors: '[{"name":"Royal","hex":"#1f4fbf","hex2":"#ffffff"}]',
  variants: '[{"name":"Erwachsene","price_cents":null},{"name":"Kinder","price_cents":2199}]',
  print_options: '[{"key":"name","label":"Name Rücken","max_length":14,"price_cents":350},{"key":"number","label":"Rückennummer","max_length":2,"price_cents":250}]',
});
const withMode = (mode, subsidy = 0) => ({ ...base, funding_mode: mode, subsidy_cents: subsidy });
const prints = { name: 'MÜLLER', number: '10' };

test('Ausführungspreise: null = Grundpreis, sonst eigener Preis', () => {
  assert.equal(articlePrice(base, 'Erwachsene'), 2499);
  assert.equal(articlePrice(base, 'Kinder'), 2199);
  assert.equal(articlePrice(base, 'Unbekannt'), 2499);
  assert.equal(minArticlePrice(base), 2199);
});

test('member: Mitglied zahlt Artikel + Drucke', () => {
  const u = computeUnit(withMode('member'), { variant: 'Erwachsene', prints });
  assert.deepEqual([u.articleCents, u.printCents, u.memberCents, u.clubCents], [2499, 600, 3099, 0]);
  assert.equal(u.printDetails.length, 2);
});

test('subsidy: Verein zahlt Zuschuss je Stück', () => {
  const u = computeUnit(withMode('subsidy', 1000), { variant: 'Kinder', prints: { name: 'PAUL' } });
  assert.equal(u.clubCents, 1000);
  assert.equal(u.memberCents, 2199 - 1000 + 350);
});

test('subsidy: Zuschuss höchstens Artikelpreis, Drucke zahlt immer das Mitglied', () => {
  const u = computeUnit(withMode('subsidy', 5000), { variant: 'Erwachsene', prints });
  assert.equal(u.clubCents, 2499);
  assert.equal(u.memberCents, 600);
});

test('club_article: Verein zahlt Artikel, Mitglied nur Sonderdrucke', () => {
  const u = computeUnit(withMode('club_article'), { variant: 'Erwachsene', prints });
  assert.equal(u.clubCents, 2499);
  assert.equal(u.memberCents, 600);
  const ohneDruck = computeUnit(withMode('club_article'), { variant: 'Erwachsene', prints: {} });
  assert.equal(ohneDruck.memberCents, 0);
});

test('Drucke: leere Texte kosten nichts, Texte werden gekürzt', () => {
  const u = computeUnit(base, { variant: 'Erwachsene', prints: { name: '   ', number: '123' } });
  assert.equal(u.printCents, 250);
  assert.equal(u.printDetails[0].value, '12');
});

test('validateLine erkennt fehlende/ungültige Angaben', () => {
  const ok = { productId: 1, variant: 'Kinder', color: 'Royal', size: 'M', quantity: 2, prints: {} };
  assert.equal(validateLine(base, ok), null);
  assert.match(validateLine(base, { ...ok, quantity: 0 }), /Stückzahl/);
  assert.match(validateLine(base, { ...ok, quantity: 1.5 }), /Stückzahl/);
  assert.match(validateLine(base, { ...ok, variant: 'XXL-Edition' }), /Ausführung/);
  assert.match(validateLine(base, { ...ok, color: 'Pink' }), /Farbe/);
  assert.match(validateLine(base, { ...ok, size: 'XS' }), /Größe/);
  assert.match(validateLine(base, { ...ok, prints: { number: '123' } }), /höchstens 2 Zeichen/);
  assert.match(validateLine({ ...base, is_active: 0 }, ok), /nicht mehr verfügbar/);
  assert.match(validateLine(null, ok), /nicht mehr verfügbar/);
  const pflicht = { ...base, print_options: [{ key: 'number', label: 'Rückennummer', max_length: 2, price_cents: 250, required: true }] };
  assert.match(validateLine(pflicht, ok), /Rückennummer/);
});
