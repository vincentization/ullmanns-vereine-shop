// Shopfront-Verbesserungen. Alles funktioniert auch ohne JavaScript – dieses Skript macht es nur komfortabler.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  function money(cents) { return eur.format((Number(cents) || 0) / 100); }

  // ---- Formulare automatisch absenden (Sortierung, Menge im Warenkorb) ----
  var timers = new WeakMap();
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('[data-autosubmit]')) return;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(function () { el.form && el.form.submit(); }, el.type === 'number' ? 450 : 0));
  });

  // ---- +/- Buttons für Mengenfelder ----
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-qty]');
    if (!btn) return;
    var input = btn.parentElement.querySelector('input[type=number]');
    if (!input) return;
    var min = input.min !== '' ? Number(input.min) : 1;
    var max = input.max !== '' ? Number(input.max) : 99;
    var v = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + Number(btn.getAttribute('data-qty'))));
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- Link kopieren (Bestellbestätigung) ----
  document.querySelectorAll('[data-absolute-url]').forEach(function (input) {
    if (input.value.charAt(0) === '/') input.value = window.location.origin + input.value;
  });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy-input]');
    if (!btn) return;
    var input = btn.parentElement.querySelector('input');
    input.select();
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Kopiert ✓';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  });

  // ---- Artikelseite: Bild, Farbname und Preis live aktualisieren ----
  var form = document.querySelector('[data-product-form]');
  var dataEl = document.getElementById('product-data');
  if (!form || !dataEl) return;
  var product;
  try { product = JSON.parse(dataEl.textContent); } catch (err) { return; }

  var img = document.getElementById('product-image');
  var colorName = document.querySelector('[data-color-name]');

  function selected(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function imageUrl(color) {
    if (product.image_path) return product.image_path;
    var c = color || product.colors[0] || { hex: '#1d3c9c', hex2: '#ffffff' };
    var params = new URLSearchParams({ c: (c.hex || '#1d3c9c').replace('#', ''), a: (c.hex2 || '#ffffff').replace('#', '') });
    return '/img/product/' + encodeURIComponent(product.illustration || 'tshirt') + '.svg?' + params.toString();
  }

  function articlePrice(variantName) {
    var v = (product.variants || []).find(function (x) { return x.name === variantName; });
    if (v && v.price_cents != null && v.price_cents !== '') return Number(v.price_cents);
    return Number(product.price_cents);
  }

  function update() {
    var colorVal = selected('color');
    var color = (product.colors || []).find(function (c) { return c.name === colorVal; });
    if (colorName) colorName.textContent = colorVal || '';
    if (img && color) {
      var url = imageUrl(color);
      if (img.getAttribute('src') !== url) {
        img.style.opacity = '.4';
        img.onload = function () { img.style.opacity = '1'; };
        img.src = url;
        img.alt = img.alt.split(' in ')[0] + ' in ' + color.name;
      }
    }

    var article = articlePrice(selected('variant'));
    var club = 0;
    if (product.funding_mode === 'subsidy') club = Math.min(Number(product.subsidy_cents) || 0, article);
    else if (product.funding_mode === 'club_article') club = article;
    var print = 0;
    (product.print_options || []).forEach(function (o) {
      var input = form.querySelector('[data-print-key="' + o.key + '"]');
      if (!input) return;
      var counter = form.querySelector('[data-count-for="' + o.key + '"]');
      if (counter) counter.textContent = input.value.length;
      if (input.value.trim()) print += Number(o.price_cents) || 0;
    });
    var qtyInput = form.querySelector('input[name=quantity]');
    var qty = Math.max(1, parseInt(qtyInput && qtyInput.value, 10) || 1);
    var member = article - club + print;

    setText('[data-price-article]', money(article));
    setText('[data-price-club]', '− ' + money(club));
    setText('[data-price-print]', money(print));
    setText('[data-price-total]', money(member * qty));
    setText('[data-price-member]', member === 0 ? 'Kostenlos' : money(member) + '*');
    var pm = document.querySelector('[data-price-member]');
    if (pm) pm.classList.toggle('price-free', member === 0);
    setText('[data-qty-note]', qty > 1 ? '(' + qty + ' Stück)' : '');
    toggle('.pb-club', club > 0);
    toggle('.pb-print', print > 0);
  }
  function setText(sel, text) { var el = document.querySelector(sel); if (el) el.textContent = text; }
  function toggle(sel, show) { var el = document.querySelector(sel); if (el) el.hidden = !show; }

  form.addEventListener('change', update);
  form.addEventListener('input', update);
  update();
})();
