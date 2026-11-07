// Sortiment: Artikel-Formular (Zeilen, Schnellwahl, Vorschau, Beispielrechnung) und Artikelliste (Auswahl, Sammelaktionen).
(function () {
  'use strict';

  function parseMoney(value) {
    var s = String(value || '').trim().replace(/\s|€/g, '');
    if (!s) return null;
    s = s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s;
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) : null;
  }
  function money(cents) {
    return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  // ---------- Wiederholbare Zeilen ----------
  var counter = 1000;
  function addRow(repeater, values) {
    var tpl = repeater.querySelector('template');
    var rows = repeater.querySelector('[data-rows]');
    var html = tpl.innerHTML.replace(/__i__/g, String(counter++));
    var wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    var row = wrap.firstElementChild;
    if (values) {
      Object.keys(values).forEach(function (k) {
        var input = row.querySelector('[name$="[' + k + ']"]');
        if (!input) return;
        if (input.type === 'checkbox') input.checked = Boolean(values[k]);
        else input.value = values[k];
      });
    }
    rows.appendChild(row);
    return row;
  }
  /** Füllt die erste leere Zeile oder hängt eine neue an */
  function fillOrAdd(repeater, values, firstField) {
    var rows = repeater.querySelectorAll('[data-row]');
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i].querySelector('[name$="[' + firstField + ']"]');
      if (f && !f.value.trim()) {
        Object.keys(values).forEach(function (k) {
          var input = rows[i].querySelector('[name$="[' + k + ']"]');
          if (!input) return;
          if (input.type === 'checkbox') input.checked = Boolean(values[k]);
          else input.value = values[k];
        });
        return rows[i];
      }
    }
    return addRow(repeater, values);
  }

  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add-row]');
    if (add) {
      var row = addRow(add.closest('[data-repeater]'));
      var first = row.querySelector('input:not([type=hidden])');
      if (first) first.focus();
      update();
      return;
    }
    var remove = e.target.closest('[data-remove-row]');
    if (remove) {
      var r = remove.closest('[data-row]');
      var rep = remove.closest('[data-repeater]');
      r.parentNode.removeChild(r);
      if (!rep.querySelector('[data-row]')) addRow(rep);
      update();
      return;
    }
    var preset = e.target.closest('[data-size-preset]');
    if (preset) {
      var sizes = document.querySelector('[data-sizes]');
      var add2 = preset.getAttribute('data-size-preset');
      if (!add2) sizes.value = '';
      else {
        var current = sizes.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        add2.split(',').map(function (s) { return s.trim(); }).forEach(function (s) { if (current.indexOf(s) < 0) current.push(s); });
        sizes.value = current.join(', ');
      }
      return;
    }
    var pp = e.target.closest('[data-print-preset]');
    if (pp) {
      var presets = {
        name: { label: 'Name Rücken', max_length: '14', price: '3,50', placeholder: 'MÜLLER' },
        number: { label: 'Rückennummer', max_length: '2', price: '2,50', placeholder: '10' },
        initials: { label: 'Initialen Brust', max_length: '4', price: '3,00', placeholder: 'M.M.' },
      };
      fillOrAdd(document.querySelector('[data-repeater="print_options"]'), presets[pp.getAttribute('data-print-preset')], 'label');
      update();
      return;
    }
    var cc = e.target.closest('[data-club-colors]');
    if (cc) {
      var rep2 = document.querySelector('[data-repeater="colors"]');
      var c1 = cc.getAttribute('data-c1'), c2 = cc.getAttribute('data-c2'), c3 = cc.getAttribute('data-c3');
      fillOrAdd(rep2, { name: 'Vereinsfarbe', hex: c1, hex2: c2 }, 'name');
      update();
      return;
    }
  });

  // ---------- Vorschau ----------
  var img = document.querySelector('[data-preview-img]');
  var typeSelect = document.querySelector('[data-preview-type]');
  function updatePreview() {
    if (!img || !typeSelect || img.getAttribute('data-has-photo')) return;
    var rows = document.querySelectorAll('[data-repeater="colors"] [data-row]');
    var hex = '#1d3c9c', hex2 = '#ffffff';
    for (var i = 0; i < rows.length; i++) {
      var name = rows[i].querySelector('[name$="[name]"]');
      if (name && name.value.trim()) {
        hex = rows[i].querySelector('[name$="[hex]"]').value;
        hex2 = rows[i].querySelector('[name$="[hex2]"]').value;
        break;
      }
      if (i === 0) {
        hex = rows[i].querySelector('[name$="[hex]"]').value;
        hex2 = rows[i].querySelector('[name$="[hex2]"]').value;
      }
    }
    var src = '/img/product/' + encodeURIComponent(typeSelect.value) + '.svg?c=' + hex.replace('#', '') + '&a=' + hex2.replace('#', '');
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  // ---------- Beispielrechnung ----------
  var calc = document.querySelector('[data-calc]');
  function updateCalc() {
    if (!calc) return;
    var price = parseMoney((document.querySelector('[data-calc-price]') || {}).value);
    var modeInput = document.querySelector('[data-calc-mode]:checked');
    var mode = modeInput ? modeInput.value : 'member';
    var subsidy = parseMoney((document.querySelector('[data-calc-subsidy]') || {}).value) || 0;
    var print = 0;
    document.querySelectorAll('[data-repeater="print_options"] [data-row]').forEach(function (row) {
      var label = row.querySelector('[name$="[label]"]');
      if (label && label.value.trim()) print += parseMoney(row.querySelector('[data-calc-print]').value) || 0;
    });
    var out = function (k, v) { calc.querySelector('[data-out="' + k + '"]').textContent = v; };
    if (price == null) {
      ['article', 'print', 'member', 'club'].forEach(function (k) { out(k, '–'); });
      return;
    }
    var club = 0;
    if (mode === 'subsidy') club = Math.min(subsidy, price);
    else if (mode === 'club_article') club = price;
    out('article', money(price));
    out('print', money(print));
    out('member', money(price - club + print));
    out('club', money(club));
  }

  // Zuschuss-Feld nur bei "Verein gibt Zuschuss" aktiv
  function updateFunding() {
    var subsidyInput = document.querySelector('[data-calc-subsidy]');
    var modeInput = document.querySelector('[data-calc-mode]:checked');
    if (subsidyInput) subsidyInput.disabled = !modeInput || modeInput.value !== 'subsidy';
    document.querySelectorAll('.funding-option').forEach(function (el) {
      el.classList.toggle('selected', el.querySelector('input[type=radio]').checked);
    });
  }

  function update() {
    updatePreview();
    updateCalc();
    updateFunding();
  }

  var productForm = document.getElementById('product-form');
  if (productForm) {
    productForm.addEventListener('input', update);
    productForm.addEventListener('change', update);
    update();
  }

  // ---------- Liste: Auswahl & Sammelaktionen ----------
  var bulkForm = document.getElementById('bulk-form');
  if (bulkForm) {
    var all = bulkForm.querySelector('[data-select-all]');
    var boxes = function () { return bulkForm.querySelectorAll('input[name="ids[]"]'); };
    var countEl = bulkForm.querySelector('[data-selected-count]');
    var refreshCount = function () {
      var n = Array.prototype.filter.call(boxes(), function (b) { return b.checked; }).length;
      countEl.textContent = n + ' ausgewählt';
      bulkForm.classList.toggle('has-selection', n > 0);
    };
    all.addEventListener('change', function () {
      boxes().forEach(function (b) { b.checked = all.checked; });
      refreshCount();
    });
    bulkForm.addEventListener('change', function (e) {
      if (e.target.name === 'ids[]') refreshCount();
    });
    var action = document.getElementById('bulk-action');
    var value = document.getElementById('bulk-value');
    var target = document.getElementById('bulk-target');
    action.addEventListener('change', function () {
      value.hidden = !(action.value === 'price_pct' || action.value === 'price_abs');
      value.placeholder = action.value === 'price_pct' ? 'z.B. 5 oder -10 (%)' : 'z.B. 1,00 oder -2,50 (€)';
      if (target) target.hidden = action.value !== 'copy';
    });
    var bulkSubmit = bulkForm.querySelector('[data-bulk-submit]');
    bulkSubmit.addEventListener('click', function (e) {
      if (action.value === 'delete' && !window.confirm('Ausgewählte Artikel wirklich löschen? Bestehende Bestellungen bleiben erhalten.')) e.preventDefault();
    });
    // Aktionsmenü fest positionieren, damit es nicht vom scrollbaren Tabellenrahmen abgeschnitten wird
    bulkForm.querySelectorAll('details.menu').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        var panel = d.querySelector('.menu-panel');
        var r = d.querySelector('summary').getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.right = 'auto';
        panel.style.left = Math.max(8, r.right - panel.offsetWidth) + 'px';
        var top = r.bottom + 4;
        if (top + panel.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - panel.offsetHeight - 4);
        panel.style.top = top + 'px';
      });
    });
    window.addEventListener('scroll', function () {
      bulkForm.querySelectorAll('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); });
    }, { passive: true });
    // Menüs schließen, wenn ein anderes geöffnet wird
    document.addEventListener('click', function (e) {
      document.querySelectorAll('details.menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
    });
    refreshCount();
  }
})();
