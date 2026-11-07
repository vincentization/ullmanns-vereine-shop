// Vereinsformular: Slug/Präfix automatisch, Farbwähler synchronisieren, Live-Vorschau des Shop-Kopfs.
(function () {
  'use strict';
  var form = document.getElementById('club-form');
  if (!form) return;
  var $ = function (sel) { return form.querySelector(sel); };

  function slugify(text) {
    return String(text || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
  function prefix(text) {
    var first = String(text || '').trim().split(/\s+/)[0] || '';
    var p = first.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return p.length >= 2 ? p : '';
  }
  function contrast(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    var n = parseInt(m[1], 16);
    var lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.6 ? '#111111' : '#ffffff';
  }

  var origin = form.querySelector('[data-origin]');
  if (origin) origin.textContent = window.location.host + '/';

  var name = $('[data-club-name]');
  var short = $('[data-club-short]');
  var slug = $('[data-club-slug]');
  var pre = $('[data-club-prefix]');
  var preExample = $('[data-prefix-example]');
  var tagline = $('[data-club-tagline]');
  var preview = document.querySelector('[data-shop-preview]');

  // Slug und Präfix nur automatisch füllen, solange sie nicht von Hand geändert wurden
  if (slug && !slug.value) slug.removeAttribute('data-touched');
  if (pre && pre.value) pre.setAttribute('data-touched', '1');
  slug && slug.addEventListener('input', function () { slug.setAttribute('data-touched', '1'); });
  pre && pre.addEventListener('input', function () {
    pre.setAttribute('data-touched', '1');
    pre.value = pre.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (preExample) preExample.textContent = pre.value || 'VSB';
  });

  function updateNames() {
    var basis = (short && short.value.trim()) || (name && name.value.trim());
    if (slug && !slug.getAttribute('data-touched')) slug.value = slugify(basis);
    if (pre && !pre.getAttribute('data-touched')) {
      pre.value = prefix(basis);
      if (preExample) preExample.textContent = pre.value || 'VSB';
    }
    if (preview) {
      preview.querySelector('[data-preview-name]').textContent = basis || 'Vereinsname';
      preview.querySelector('[data-preview-tagline]').textContent = (tagline && tagline.value.trim()) || 'Vereinskollektion';
      var logoSpan = preview.querySelector('[data-preview-logo] span');
      if (logoSpan) logoSpan.textContent = (basis || 'VsB').slice(0, 3);
    }
  }
  [name, short, tagline].forEach(function (el) { el && el.addEventListener('input', updateNames); });

  // Farben: Farbwähler <-> Textfeld, Vorschau
  function setPreviewColors() {
    if (!preview) return;
    var get = function (k) { var t = form.querySelector('[data-color-text="' + k + '"]'); return t ? t.value : ''; };
    var p = get('color_primary'), a = get('color_accent');
    preview.style.setProperty('--pc', p);
    preview.style.setProperty('--pt', contrast(p));
    preview.style.setProperty('--ac', a);
    preview.style.setProperty('--at', contrast(a));
  }
  form.querySelectorAll('[data-color-picker]').forEach(function (picker) {
    var key = picker.getAttribute('data-color-picker');
    var text = form.querySelector('[data-color-text="' + key + '"]');
    picker.addEventListener('input', function () { text.value = picker.value; setPreviewColors(); });
    text.addEventListener('input', function () {
      var val = text.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(val)) {
        if (val[0] !== '#') val = '#' + val;
        picker.value = val.toLowerCase();
        setPreviewColors();
      }
    });
  });

  // Logo- und Headerbild-Vorschau vor dem Hochladen
  var logoInput = $('[data-logo-input]');
  logoInput && logoInput.addEventListener('change', function () {
    var file = logoInput.files && logoInput.files[0];
    if (!file || !preview) return;
    var box = preview.querySelector('[data-preview-logo]');
    box.innerHTML = '';
    var img = document.createElement('img');
    img.alt = '';
    img.src = URL.createObjectURL(file);
    box.appendChild(img);
  });
  var heroInput = $('[data-hero-input]');
  heroInput && heroInput.addEventListener('change', function () {
    var file = heroInput.files && heroInput.files[0];
    if (!file || !preview) return;
    var top = preview.querySelector('[data-preview-top]');
    top.style.backgroundImage = 'url(' + URL.createObjectURL(file) + ')';
    top.classList.add('has-hero');
  });

  updateNames();
  setPreviewColors();
})();
