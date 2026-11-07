'use strict';
// Zentrale Preislogik – wird von Shop UND Backend verwendet, damit Beträge überall gleich berechnet werden.
//
// Finanzierungsmodelle je Artikel (products.funding_mode):
//   member        – "Verein gibt nichts dazu": Mitglied zahlt Artikel + Sonderdrucke.
//   subsidy       – "Verein gibt was dazu":   Verein zahlt subsidy_cents je Stück (max. Artikelpreis),
//                                              Mitglied zahlt den Rest + Sonderdrucke.
//   club_article  – "Verein zahlt Artikel, aber keine Sonderdrucke": Mitglied zahlt nur die Sonderdrucke.
const { get, all } = require('../db');

const FUNDING_MODES = {
  member: { label: 'Mitglied zahlt alles', short: 'Verein gibt nichts dazu' },
  subsidy: { label: 'Verein gibt Zuschuss', short: 'Vereinszuschuss' },
  club_article: { label: 'Verein zahlt Artikel (Sonderdrucke zahlt Mitglied)', short: 'Artikel zahlt der Verein' },
};

function parseJSON(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Wandelt eine products-Zeile in ein Objekt mit geparsten JSON-Feldern um. */
function hydrateProduct(row) {
  if (!row) return null;
  return {
    ...row,
    sizes: parseJSON(row.sizes, []),
    colors: parseJSON(row.colors, []),
    variants: parseJSON(row.variants, []),
    print_options: parseJSON(row.print_options, []),
  };
}

/** Artikelpreis je Stück für eine Ausführung (Variante). */
function articlePrice(product, variantName) {
  const variant = (product.variants || []).find((v) => v.name === variantName);
  if (variant && variant.price_cents != null && variant.price_cents !== '') return Number(variant.price_cents);
  return Number(product.price_cents);
}

/** Niedrigster möglicher Preis (für "ab"-Anzeige in der Übersicht). */
function minArticlePrice(product) {
  const prices = [Number(product.price_cents)];
  for (const v of product.variants || []) if (v.price_cents != null && v.price_cents !== '') prices.push(Number(v.price_cents));
  return Math.min(...prices);
}

/**
 * Berechnet die Preise für ein Stück.
 * @param product  hydriertes Produkt
 * @param opts     { variant, prints: { [print_option.key]: string } }
 * @returns { articleCents, printCents, printDetails, memberCents, clubCents }
 */
function computeUnit(product, { variant, prints } = {}) {
  const articleCents = articlePrice(product, variant);
  const printDetails = [];
  for (const opt of product.print_options || []) {
    const raw = prints && prints[opt.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    printDetails.push({ key: opt.key, label: opt.label, value: value.slice(0, opt.max_length || 40), price_cents: Number(opt.price_cents) || 0 });
  }
  const printCents = printDetails.reduce((s, p) => s + p.price_cents, 0);

  let clubCents = 0;
  if (product.funding_mode === 'subsidy') clubCents = Math.min(Number(product.subsidy_cents) || 0, articleCents);
  else if (product.funding_mode === 'club_article') clubCents = articleCents;
  const memberCents = articleCents - clubCents + printCents;

  return { articleCents, printCents, printDetails, memberCents, clubCents };
}

/**
 * Prüft eine Warenkorbzeile gegen das Produkt. Gibt eine Fehlermeldung (string) oder null zurück.
 * line = { productId, variant, color, size, quantity, prints }
 */
function validateLine(product, line) {
  if (!product || !product.is_active) return 'Dieser Artikel ist nicht mehr verfügbar.';
  const qty = Number(line.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return 'Bitte eine gültige Stückzahl (1–99) angeben.';
  if (product.variants.length && !product.variants.some((v) => v.name === line.variant)) return 'Bitte eine Ausführung wählen.';
  if (product.colors.length && !product.colors.some((c) => c.name === line.color)) return 'Bitte eine Farbe wählen.';
  if (product.sizes.length && !product.sizes.includes(line.size)) return 'Bitte eine Größe wählen.';
  for (const opt of product.print_options) {
    const v = line.prints && typeof line.prints[opt.key] === 'string' ? line.prints[opt.key].trim() : '';
    if (opt.required && !v) return `Bitte "${opt.label}" ausfüllen.`;
    if (opt.max_length && v.length > opt.max_length) return `"${opt.label}" darf höchstens ${opt.max_length} Zeichen haben.`;
  }
  return null;
}

/**
 * Berechnet den Warenkorb neu aus der Datenbank (Preise aus der Session werden nie übernommen).
 * @param clubId
 * @param cart  Array von Zeilen { id, productId, variant, color, size, quantity, prints }
 * @returns { lines: [{...line, product, unit, lineMemberCents, lineClubCents, error}], memberTotal, clubTotal, total, count }
 */
function summarizeCart(clubId, cart = []) {
  const lines = [];
  let memberTotal = 0;
  let clubTotal = 0;
  let count = 0;
  for (const line of cart) {
    const product = hydrateProduct(get('SELECT * FROM products WHERE id = ? AND club_id = ?', line.productId, clubId));
    const error = validateLine(product, line);
    if (!product) {
      lines.push({ ...line, product: null, error });
      continue;
    }
    const unit = computeUnit(product, line);
    const qty = Number(line.quantity) || 0;
    const lineMemberCents = unit.memberCents * qty;
    const lineClubCents = unit.clubCents * qty;
    if (!error) {
      memberTotal += lineMemberCents;
      clubTotal += lineClubCents;
      count += qty;
    }
    lines.push({ ...line, product, unit, lineMemberCents, lineClubCents, error });
  }
  return { lines, memberTotal, clubTotal, total: memberTotal + clubTotal, count, hasErrors: lines.some((l) => l.error) };
}

/** Aktive Produkte eines Vereins (hydriert, sortiert). */
function listClubProducts(clubId, { includeInactive = false } = {}) {
  const rows = all(
    `SELECT * FROM products WHERE club_id = ? ${includeInactive ? '' : 'AND is_active = 1'} ORDER BY sort_order, category, name`,
    clubId,
  );
  return rows.map(hydrateProduct);
}

module.exports = { FUNDING_MODES, parseJSON, hydrateProduct, articlePrice, minArticlePrice, computeUnit, validateLine, summarizeCart, listClubProducts };
